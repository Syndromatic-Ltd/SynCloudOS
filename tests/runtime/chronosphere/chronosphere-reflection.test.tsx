/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AFXRenderer, type AFXRendererScene } from "../../../src/FX/AnimationFX/AFXRenderer";
import { GFXImage } from "../../../src/FX/GraphicsFX/GFXImage";
import { createTestRuntime, createTestRuntimeEnvironment, registerTestSynWare, mountTestSynWareRuntime } from "../helpers";
import { createSynWareContextValue } from "../../../src/SynCloudOS/AppSDK/createSynWareContextValue";

const host = vi.hoisted(() => ({ environment: {} as Record<string, unknown>, app: {} as Record<string, unknown>, capture: vi.fn() }));
vi.mock("../../../src/NSE/Animation/NSEAnimationEnvironment", () => ({ useNSEAnimationEnvironment: () => host.environment }));
vi.mock("../../../src/NSE/Chronosphere/chronosphereEnvironment", () => ({ useChronosphereEnvironment: () => host.app }));
vi.mock("../../../src/NSE/Graphics/snapshotNSEView", () => ({ snapshotNSEView: host.capture }));
import { ChronosphereReflection } from "../../../src/NSE/Chronosphere/ChronosphereReflection";

let root: Root, container: HTMLElement, current: HTMLElement, selected: HTMLElement;
let renderer: AFXRenderer, scenes: AFXRendererScene[], pending: Set<(time: number) => void>;
let resize: () => void, disconnect: ReturnType<typeof vi.fn>, load: ReturnType<typeof vi.fn>;
let releases: ReturnType<typeof vi.fn>[], leaseReleases: ReturnType<typeof vi.fn>[];
let floorWidth: number;
let floorLeft: number, floorProjectedWidth: number, edgeLeft: number, edgeWidth: number;
let selectedBounds: DOMRect;
let failRender: boolean;
let time: number;
const image = new GFXImage({ width: 2, height: 2, alpha: "straight", colourSpace: "srgb", data: new Uint8Array(16).fill(255) });
const rect = (x: number, width: number, height: number) => ({ x, y: 0, left: x, top: 0, right: x + width, bottom: height, width, height, toJSON() {} });

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); current = document.createElement("article"); selected = document.createElement("article");
  document.body.append(container, current, selected); root = createRoot(container);
  floorWidth = 800; floorLeft = 0; floorProjectedWidth = 800; edgeLeft = 0; edgeWidth = 800;
  selectedBounds = rect(450, 250, 1000);
  time = 0; failRender = false; scenes = []; pending = new Set(); releases = []; leaseReleases = [];
  vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(() => floorWidth);
  vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(54);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.getAttribute("data-reflection-edge") === "start") return rect(edgeLeft, 0, 0);
    if (this.getAttribute("data-reflection-edge") === "end") return rect(edgeLeft + edgeWidth, 0, 0);
    return this === current ? rect(100, 200, 800) : this === selected ? selectedBounds : rect(floorLeft, floorProjectedWidth, 44);
  });
  disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect = disconnect;
  });
  const frames = { now: () => time, reducedMotion: false, suspended: false, requestFrame(callback: (time: number) => void) {
    pending.add(callback); return () => { pending.delete(callback); };
  } };
  host.environment = { layers: { createRenderer: vi.fn((_target: object, options: object, signal: AbortSignal) => {
    renderer = new AFXRenderer({ ...options, width: 1, height: 1, signal, scheduler: frames, target: { render(scene) {
      if (failRender) throw new Error("Renderer unavailable");
      scenes.push(scene);
    }, dispose() {} } });
    return renderer;
  }) }, frames, reducedMotion: false };
  load = vi.fn(() => {
    const release = vi.fn(), releaseLease = vi.fn(); releases.push(release); leaseReleases.push(releaseLease);
    return { release, pixelLease: async () => ({ transferImage: () => image, release: releaseLease }) };
  });
  host.app = { images: { load } };
  host.capture.mockReset().mockResolvedValue(`data:image/png;base64,${Buffer.from(image.toPNG()).toString("base64")}`);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); current.remove(); selected.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});
async function flush() {
  await act(async () => { await vi.runAllTimersAsync(); });
  await act(async () => { time += 16; const callbacks = [...pending]; pending.clear(); callbacks.forEach(callback => callback(time)); });
}
async function show(key: string | null, active = true) {
  await act(async () => root.render(<ChronosphereReflection currentElement={current} selectedElement={selected} settledKey={key} active={active} />));
  await flush();
}

it("waits for the entrance to settle without capturing or running an idle frame loop", async () => {
  await show(null); await flush();
  expect(host.capture).not.toHaveBeenCalled();
  expect(pending.size).toBe(0);
  await show("entered");
  expect(host.capture).toHaveBeenCalledTimes(2);
});

it("replaces documents immediately when the environment has no animation clock", async () => {
  host.environment.frames = null;
  await show("first");
  const previous = selected;
  selected = document.createElement("article"); document.body.append(selected);
  try {
    await show("second");
    expect(scenes.at(-1)!.quads).toHaveLength(4);
    expect(pending.size).toBe(0);
  } finally { previous.remove(); }
});

it("captures settled documents once and submits mirrored image quads with a real ImageFX fade mask", async () => {
  await show("first");
  expect(host.capture).toHaveBeenCalledTimes(2);
  expect(host.capture.mock.calls[0][1].scale).toBeLessThanOrEqual(512 / 800);
  expect(host.capture.mock.calls[1][1].scale).toBeLessThanOrEqual(512 / 1000);
  const quads = scenes.at(-1)!.quads;
  expect(quads).toHaveLength(4);
  const mirrored = quads.filter(quad => quad.transform.values[5] < 0);
  expect(mirrored).toHaveLength(2);
  expect(mirrored.map(quad => quad.transform.transformPoint({ x: 0, y: 0, z: 0 }).x)).toEqual([100, 450]);
  for (const quad of mirrored) {
    expect(quad.content).toBe(image);
    expect(quad.transform.transformPoint({ x: 0, y: quad.bounds.height, z: 0 }).y).toBe(0);
    expect(quad.transform.transformPoint({ x: 0, y: 0, z: 0 }).y).toBe(54);
    expect(quad.uv).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    const mask = quad.mask!.content;
    expect(mask.pixel(0, 0).a).toBeLessThan(mask.pixel(0, mask.height - 1).a);
  }
  expect(releases.every(release => release.mock.calls.length === 1)).toBe(true);
  expect(leaseReleases.every(release => release.mock.calls.length === 1)).toBe(true);
  expect(container.querySelector("[data-reflection='ready']")).not.toBeNull();
  await show("first");
  await show(null);
  for (let i = 0; i < 5; i++) await flush();
  floorWidth = 1000; await act(async () => resize()); await flush();
  expect(host.capture).toHaveBeenCalledTimes(2);
  expect(scenes.at(-1)!.quads).toHaveLength(4);
  await show("first"); await flush();
  expect(pending.size).toBe(0);
});

it("moves retained reflections with travelling documents without capturing on animation frames", async () => {
  await show("first"); await show(null);
  const count = scenes.length;
  selectedBounds = rect(220, 530, 700); selected.style.opacity = "0.65";
  await flush();
  const reflected = scenes.at(-1)!.quads.filter(quad => quad.transform.values[5] < 0)[1]!;
  expect(reflected.transform.transformPoint({ x: 0, y: 0, z: 0 }).x).toBe(220);
  expect(reflected.bounds.width).toBe(530);
  expect(reflected.opacity).toBeCloseTo(0.65);
  expect(scenes.length).toBeGreaterThan(count);
  const unchanged = scenes.length;
  for (let i = 0; i < 8; i++) await flush();
  expect(scenes.length).toBe(unchanged);
  expect(host.capture).toHaveBeenCalledTimes(2);
  await show("first"); await flush();
  expect(pending.size).toBe(0);
});

it("retains images during travel and captures the incoming selection only after settling", async () => {
  await show("first");
  const previous = selected;
  selected = document.createElement("article"); document.body.append(selected);
  try {
    await show(null);
    for (let i = 0; i < 15; i++) await flush();
    expect(host.capture).toHaveBeenCalledTimes(2);
    await show("second");
    expect(host.capture).toHaveBeenCalledTimes(3);
    const arriving = scenes.at(-1)!.quads.filter(quad => quad.transform.values[5] < 0)[1]!;
    expect(arriving.opacity).toBeGreaterThan(0);
    expect(arriving.opacity).toBeLessThan(1);
    for (let i = 0; i < 15; i++) await flush();
    expect(scenes.at(-1)!.quads).toHaveLength(4);
    await show("second"); await flush();
    expect(host.capture).toHaveBeenCalledTimes(3);
    expect(pending.size).toBe(0);
  } finally { previous.remove(); }
});

it("preserves a 530px document's projected width and x origin on a tilted floor", async () => {
  floorLeft = 40; floorProjectedWidth = 680; edgeLeft = 80; edgeWidth = 600;
  selectedBounds = rect(200, 530, 700);
  await show("tilted");
  const scene = scenes.at(-1)!;
  expect(scene.width).toBe(800);
  expect(scene.height).toBe(54);
  const mirrored = scene.quads.filter(quad => quad.transform.values[5] < 0)[1]!;
  const topLeft = mirrored.transform.transformPoint({ x: 0, y: mirrored.bounds.height, z: 0 });
  const topRight = mirrored.transform.transformPoint({ x: mirrored.bounds.width, y: mirrored.bounds.height, z: 0 });
  const planeScale = edgeWidth / floorWidth;
  expect(edgeLeft + topLeft.x * planeScale).toBeCloseTo(200);
  expect((topRight.x - topLeft.x) * planeScale).toBeCloseTo(530);
  expect(mirrored.uv).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  expect(container.querySelector<HTMLElement>(".chronosphere-reflection")!.style.height).toBe("54px");
});

it("serializes replacement captures and rejects the stale selection before decoding it", async () => {
  let finish!: (url: string) => void;
  host.capture.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; }));
  await show("old");
  const oldSignal = host.capture.mock.calls[0][1].signal as AbortSignal;
  await show(null); await show("new");
  expect(oldSignal.aborted).toBe(true);
  expect(host.capture).toHaveBeenCalledTimes(1);
  await act(async () => finish("data:image/png;base64,OLD")); await flush();
  expect(host.capture).toHaveBeenCalledTimes(3);
  expect(load).toHaveBeenCalledTimes(2);
  for (const [request] of load.mock.calls) expect(request.source).toEqual({ kind: "bytes", mimeType: "image/png", bytes: image.toPNG() });
  expect(scenes.at(-1)!.quads).toHaveLength(4);
});

it("deduplicates the present document and releases pending work when deactivated", async () => {
  await act(async () => root.render(<ChronosphereReflection currentElement={current} selectedElement={current} settledKey="same" />));
  await flush();
  expect(host.capture).toHaveBeenCalledTimes(1);
  expect(scenes.at(-1)!.quads).toHaveLength(2);
  await show("same", false);
  expect(renderer.disposed).toBe(true);
  expect(disconnect).toHaveBeenCalledTimes(1);
  expect(pending.size).toBe(0);
  expect(container.querySelector("[data-reflection='inactive']")).not.toBeNull();
});

it("releases a late pixel lease without publishing after deactivation", async () => {
  let finish!: (value: { transferImage(): GFXImage; release(): void }) => void;
  const release = vi.fn(), releaseLease = vi.fn(), transferImage = vi.fn(() => image);
  load.mockImplementationOnce(() => ({ release, pixelLease: () => new Promise(resolve => { finish = resolve; }) }));
  await show("first"); await show("first", false);
  await act(async () => finish({ transferImage, release: releaseLease })); await flush();
  expect(transferImage).not.toHaveBeenCalled();
  expect(releaseLease).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledTimes(1);
  expect(host.capture).toHaveBeenCalledTimes(1);
});

it("cancels capture when the renderer fails and hides an unavailable surface", async () => {
  let finish!: (url: string) => void;
  host.capture.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; }));
  await show("first");
  const signal = host.capture.mock.calls[0][1].signal as AbortSignal;
  failRender = true;
  await act(async () => resize());
  expect(signal.aborted).toBe(true);
  expect(renderer.disposed).toBe(true);
  expect(container.querySelector("[data-reflection='unavailable'] canvas")?.getAttribute("style")).toContain("visibility: hidden");
  await act(async () => finish("data:image/png;base64,OLD")); await flush();
  expect(load).not.toHaveBeenCalled();
});

it("loads captured PNG bytes through the mounted app image client and real resource policy", async () => {
  const environment = createTestRuntimeEnvironment();
  const png = image.toPNG();
  host.capture.mockResolvedValue(`data:image/png;base64,${Buffer.from(png).toString("base64")}`);
  const decode = vi.fn(async () => ({ src: "blob:reflection", intrinsicSize: { width: 2, height: 2 }, density: 1,
    byteLength: png.length, corsClean: true, release: vi.fn() }));
  const adapter = { decode, readPixels: vi.fn(async () => image), export: vi.fn(async () => png), dispose: vi.fn() };
  Object.defineProperty(environment, "images", { value: { acquire: () => ({ adapter, release: () => adapter.dispose() }) } });
  const runtime = createTestRuntime({ id: "runtime:reflection", environment });
  const app = registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: "com.example.reflection-consumer", version: "1.0.0", displayName: "Reflection" });
  const mount = mountTestSynWareRuntime(runtime, app.bundleIdentifier);
  host.app = { images: createSynWareContextValue(mount.runtime).images };
  try {
    await show("mounted");
    expect(container.querySelector("[data-reflection='ready']"), container.innerHTML).not.toBeNull();
    expect(decode).toHaveBeenCalled();
    expect(decode.mock.calls[0][0].source).toEqual({ kind: "bytes", mimeType: "image/png", bytes: png });
    expect(scenes.at(-1)!.quads.filter(quad => quad.transform.values[5] < 0)).toHaveLength(2);
    expect(runtime.images.diagnostics().activeReferenceCount).toBe(0);
  } finally {
    await show(null, false); mount.dispose(); await runtime.dispose("reflection test cleanup");
  }
});
