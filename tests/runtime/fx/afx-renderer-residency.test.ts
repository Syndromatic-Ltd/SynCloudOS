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
import { expect, it, vi } from "vitest";
import { AFXRenderer } from "../../../src/FX/AnimationFX/public";
import { GFXImage } from "../../../src/FX/GraphicsFX/public";
import { BrowserAFXCanvasRenderer } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAFXCanvasRenderer";
import { createMountedAnimationLayers } from "../../../src/SynCloudOS/HostServices/mountedAnimationLayers";
import type { AnimationRendererResidency } from "../../../src/SynCloudOS/AnimationFX/AnimationLayerHost";
import type { RuntimeResourceParticipant } from "../../../src/SynCloudOS/Resources/RuntimeResourceLedger";

function fakeCanvas(width: number, height: number) {
  const deleted: unknown[] = [];
  const constants = new Map<string, number>(["FRAMEBUFFER_COMPLETE", "TRIANGLES"].map((name, index) => [name, index + 1]));
  const gl = new Proxy({}, {
    get(_target, property) {
      if (typeof property === "string" && constants.has(property)) return constants.get(property);
      if (typeof property === "string" && property.startsWith("create")) return () => ({});
      if (property === "getShaderParameter" || property === "getProgramParameter") return () => true;
      if (property === "getAttribLocation") return () => 0;
      if (property === "getUniformLocation") return () => ({});
      if (property === "isContextLost") return () => false;
      if (property === "getContextAttributes") return () => ({ antialias: false });
      if (property === "checkFramebufferStatus") return () => constants.get("FRAMEBUFFER_COMPLETE");
      if (property === "deleteTexture") return (texture: unknown) => deleted.push(texture);
      return () => {};
    },
  }) as unknown as WebGL2RenderingContext;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  vi.spyOn(canvas, "getContext").mockImplementation(((kind: string) => kind === "webgl2" ? gl : null) as HTMLCanvasElement["getContext"]);
  return { canvas, deleted };
}

const image = (width: number, height: number) => new GFXImage({ width, height, alpha: "straight", colourSpace: "srgb",
  data: new Uint8Array(width * height * 4) });
const sum = (backings: Iterable<{ bytes: number; state: string }>, state: string) =>
  [...backings].filter((backing) => backing.state === state).reduce((total, backing) => total + backing.bytes, 0);

it("reports live textures, stage and drawing buffer as active and pooled textures as idle, and releases idle storage", () => {
  const { canvas, deleted } = fakeCanvas(200, 100);
  const target = new BrowserAFXCanvasRenderer(canvas);
  const renderer = new AFXRenderer({ width: 200, height: 100, target,
    scheduler: { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false } });
  const layer = renderer.makeLayer();
  layer.frame = { x: 0, y: 0, width: 50, height: 50 };
  layer.contents = image(64, 32);
  renderer.render();
  const texture = 64 * 32 * 4, stage = 200 * 100 * (4 + 2), drawingBuffer = 200 * 100 * 4;
  expect(sum(target.measureResidency(), "idle")).toBe(0);
  expect(sum(target.measureResidency(), "active")).toBeGreaterThanOrEqual(texture + stage + drawingBuffer);
  const withTexture = sum(target.measureResidency(), "active");

  layer.contents = null;
  renderer.render();
  expect(sum(target.measureResidency(), "idle")).toBe(texture);
  // The empty scene also uploads no vertices.
  expect(withTexture).toBeGreaterThan(texture + stage + drawingBuffer);
  expect(sum(target.measureResidency(), "active")).toBe(stage + drawingBuffer);

  expect(target.releaseIdle(1)).toBe(texture);
  expect(deleted).toHaveLength(1);
  expect(sum(target.measureResidency(), "idle")).toBe(0);
  expect(target.releaseIdle(1)).toBe(0);
  renderer.dispose();
  expect([...target.measureResidency()]).toEqual([]);
});

it("accounts each app renderer as an app-owned GPU participant for exactly its lifetime", () => {
  const releaseIdle = vi.fn((bytes: number) => Math.min(bytes, 4096));
  const report: AnimationRendererResidency = {
    measure: () => [{ key: "texture", bytes: 8192, state: "active" }, { key: "pooled", bytes: 4096, state: "idle" }],
    releaseIdle,
  };
  const disposeRenderer = vi.fn();
  const host = {
    bind: vi.fn(),
    createRenderer: vi.fn((_target: object, _options: object, signal: AbortSignal, residency?: (report: AnimationRendererResidency) => void) => {
      residency?.(report);
      // Like AFXRenderer: idempotent, and disposes itself when its lease aborts.
      let disposed = false;
      const renderer = { dispose() { if (!disposed) { disposed = true; disposeRenderer(); } } };
      signal.addEventListener("abort", () => renderer.dispose(), { once: true });
      return renderer as unknown as AFXRenderer;
    }),
  };
  const participants: RuntimeResourceParticipant[] = [];
  const unregister = vi.fn();
  const owner = new AbortController();
  const layers = createMountedAnimationLayers(host, owner.signal, () => {}, {
    owner: "com.example.app",
    register(participant) { participants.push(participant); return unregister; },
  });
  const renderer = layers.createRenderer({});
  expect(participants).toHaveLength(1);
  const [participant] = participants as [RuntimeResourceParticipant];
  expect(participant).toMatchObject({ kind: "gpu", owner: "com.example.app" });
  expect([...participant.measure()]).toEqual(report.measure());
  expect(participant.reclaim?.({ level: "cache", targetBytes: 1 << 20, reason: "test" })).toBe(0);
  expect(participant.reclaim?.({ level: "idle", targetBytes: 1 << 20, reason: "test" })).toBe(4096);
  expect(releaseIdle).toHaveBeenCalledWith(1 << 20);
  renderer.dispose();
  expect(disposeRenderer).toHaveBeenCalledTimes(1);
  expect(unregister).toHaveBeenCalledTimes(1);
  renderer.dispose();
  expect(unregister).toHaveBeenCalledTimes(1);

  layers.createRenderer({});
  owner.abort();
  expect(unregister).toHaveBeenCalledTimes(2);
});

it("accounts configured decoder pixel workload as the mount's active video-frame residency", async () => {
  const { createMountedVideoClient } = await import("../../../src/SynCloudOS/AppSDK/mountedVideoClient");
  const decoders: Array<{ disposed: boolean }> = [];
  const service = {
    createDecoder: () => {
      const decoder = { state: "unconfigured", generation: 0, pendingOutputCount: 0, disposed: false,
        configure() {}, decode() {}, flush: async () => {}, reset() {}, dispose() { decoder.disposed = true; } };
      decoders.push(decoder);
      return decoder;
    },
  };
  const participants: RuntimeResourceParticipant[] = [];
  const unregister = vi.fn();
  const mount = new AbortController();
  const client = createMountedVideoClient(service as never, mount.signal, () => [], () => true, "com.example.video",
    Object.freeze({}), undefined, undefined, {}, { owner: "com.example.video", register(participant) { participants.push(participant); return unregister; } });
  expect(participants).toHaveLength(1);
  const [participant] = participants as [RuntimeResourceParticipant];
  expect(participant).toMatchObject({ kind: "video-frame", owner: "com.example.video" });
  expect([...participant.measure()]).toEqual([]);
  const first = client.createDecoder({} as never, undefined);
  const second = client.createDecoder({} as never, undefined);
  first.configure({ codec: "vp09.00.10.08", codedWidth: 64, codedHeight: 32 });
  second.configure({ codec: "vp09.00.10.08", codedWidth: 1920, codedHeight: 1080 });
  expect([...participant.measure()].map((backing) => [backing.bytes, backing.state]))
    .toEqual([[64 * 32 * 4, "active"], [1920 * 1080 * 4, "active"]]);
  expect(participant.reclaim).toBeUndefined();
  second.reset();
  first.dispose();
  expect([...participant.measure()]).toEqual([]);
  mount.abort();
  expect(unregister).toHaveBeenCalledTimes(1);
});
