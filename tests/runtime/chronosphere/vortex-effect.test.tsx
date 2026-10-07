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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GFXImage } from "../../../src/FX/GraphicsFX/GFXImage";

const host = vi.hoisted(() => ({ environment: {} as Record<string, unknown>, app: {} as Record<string, unknown> }));
vi.mock("../../../src/NSE/Animation/NSEAnimationEnvironment", () => ({ useNSEAnimationEnvironment: () => host.environment }));
vi.mock("../../../src/SynCloudOS/AppSDK/SynWareContext", () => ({ useSynWare: () => host.app }));
vi.mock("../../../src/FX/ImageFX/IFXShader", () => ({
  IFXShader: class Shader {
    constructor(readonly source: string, readonly uniforms: Record<string, { type: string; value: number | readonly number[] }> = {}) {}
    withUniforms(values: Record<string, number | readonly number[]>) {
      const uniforms = { ...this.uniforms };
      for (const [name, value] of Object.entries(values)) { if (!uniforms[name]) throw new Error(`Unknown uniform ${name}`); uniforms[name] = { ...uniforms[name], value }; }
      return new Shader(this.source, uniforms);
    }
  },
}));
vi.mock("../../../src/FX/ImageFX/IFXFilterRegistry", () => ({
  IFXFilterRegistry: class Registry { create(name: string, parameters: object) { return { name, parameters }; } },
}));

import { VortexEffect } from "../../../src/SynCloudOS/AppSDK/Chronosphere/Chronosphere";

type Layer = Record<string, any>;
let root: Root, container: HTMLDivElement, time: number;
let pending: Set<(time: number) => void>, stateListeners: Set<() => void>;
let scenes: { layers: Layer[]; disposed: boolean; dispose: ReturnType<typeof vi.fn>; setViewport: ReturnType<typeof vi.fn>; signal?: AbortSignal }[];
let frames: { now(): number; requestFrame(callback: (time: number) => void): () => void; reducedMotion: boolean; suspended: boolean; subscribeState(listener: () => void): () => void };
let createRenderer: ReturnType<typeof vi.fn>;
const image = new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([255, 255, 255, 255]) });

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  time = 0; pending = new Set(); stateListeners = new Set(); scenes = [];
  frames = { now: () => time, reducedMotion: false, suspended: false, requestFrame(callback) { pending.add(callback); return () => { pending.delete(callback); }; }, subscribeState(listener) { stateListeners.add(listener); return () => { stateListeners.delete(listener); }; } };
  createRenderer = vi.fn((target: object, _options: object, signal?: AbortSignal) => {
    if (!(target instanceof HTMLCanvasElement)) throw new Error("The browser FX host requires an owning canvas");
    const layers: Layer[] = [];
    const scene = {
      layers, disposed: false, signal, setViewport: vi.fn(),
      makeLayer(parent?: Layer) { const layer: Layer = { parent }; layers.push(layer); return layer; },
      makeParticleLayer(parent?: Layer) { const layer: Layer = { parent, setParticles: vi.fn() }; layers.push(layer); return layer; },
      dispose: vi.fn(() => { scene.disposed = true; }),
    };
    scenes.push(scene); return scene;
  });
  host.environment = { layers: { createRenderer }, frames, reducedMotion: false };
  host.app = { images: { load: vi.fn(() => ({ pixelLease: async () => ({ transferImage: () => image, release: vi.fn() }), release: vi.fn() })) } };
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function step(ms = 16) { await act(async () => { time += ms; const callbacks = [...pending]; pending.clear(); callbacks.forEach(callback => callback(time)); }); }

describe("Vortex effect", () => {
  it("pulses the filtered glow with a transform while retaining its offscreen dimensions", async () => {
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(800);
    vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(600);
    await act(async () => root.render(<VortexEffect active preset="chronosphere" />));
    await step(100);
    const glow = scenes[0].layers[5], bounds = { ...glow.frame };
    const firstScale = glow.transform?.values[0];
    await step(100);
    expect(glow.frame).toEqual(bounds);
    expect(glow.transform.values[0]).toBeGreaterThan(firstScale);
    expect(glow.frame.width * glow.transform.values[0]).toBeCloseTo(0.13 * 2 * 600 * (1 + Math.sin(0.2 * 0.7) * 0.06));
  });
  it("sets up prepared Vortex images in its first layout flush without decoding them again", async () => {
    const preparedImages = { starNebula: image, galaxySupernova: image, cloudParticle: image, coreGlow: image };
    await act(async () => root.render(<VortexEffect active preset="chronosphere" preparedImages={preparedImages} />));
    expect((host.app.images as { load: unknown }).load).not.toHaveBeenCalled();
    expect(createRenderer).toHaveBeenCalledTimes(1);
    expect(scenes[0].setViewport).toHaveBeenCalled();
    expect(scenes[0].layers[0].contents).toBe(preparedImages.starNebula);
    expect(container.querySelector("[data-renderer='fx']")).not.toBeNull();
  });
  it.each([
    { name: "Vortex", vortex: true, subtle: false },
  ])("resizes $name from its host after canvas presentation fixes inline dimensions", async () => {
    const size = { width: 320, height: 180 };
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    // JSDOM has no layout. Model a wrapper that follows its containing block,
    // and a canvas that follows it only until the renderer sets inline pixels.
    vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(function (this: Element) {
      return this instanceof HTMLCanvasElement ? parseFloat(this.style.width) || size.width : size.width;
    });
    vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: Element) {
      return this instanceof HTMLCanvasElement ? parseFloat(this.style.height) || size.height : size.height;
    });
    let notifyResize: () => void = () => { throw new Error("Resize observation was not installed"); };
    const observe = vi.fn(), disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      observe = observe;
      disconnect = disconnect;
      constructor(callback: () => void) { notifyResize = callback; }
    });
    const makeRenderer = createRenderer.getMockImplementation() as (...args: unknown[]) => (typeof scenes)[number];
    createRenderer.mockImplementation((...args: unknown[]) => {
      const scene = makeRenderer(...args), canvas = args[0] as HTMLCanvasElement;
      scene.setViewport.mockImplementation(({ width, height, pixelRatio }) => {
        canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
        canvas.width = Math.ceil(width * pixelRatio); canvas.height = Math.ceil(height * pixelRatio);
      });
      return scene;
    });
    frames.reducedMotion = true; host.environment.reducedMotion = true;
    await act(async () => root.render(<VortexEffect active preset="chronosphere" />));
    const scene = scenes[0], canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(scene.setViewport).toHaveBeenLastCalledWith({ width: 320, height: 180, pixelRatio: 2 });
    expect(canvas.style.width).toBe("320px");
    expect(pending.size).toBe(0);
    for (const next of [{ width: 641, height: 359 }, { width: 240, height: 400 }]) {
      Object.assign(size, next);
      await act(async () => notifyResize());
      expect(scene.setViewport).toHaveBeenLastCalledWith({ ...next, pixelRatio: 2 });
      expect(scene.layers[0].frame).toEqual({ x: 0, y: 0, ...next });
      expect(canvas.width).toBe(next.width * 2); expect(canvas.height).toBe(next.height * 2);
      expect(scene.layers[1].frame).toEqual({ x: 0, y: 0, ...next });
    }
    expect(observe).toHaveBeenCalledWith(canvas.parentElement);
    expect(createRenderer).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(scene.dispose).toHaveBeenCalledTimes(1);
    root = createRoot(container);
  });
  it("composes the original five vortex passes, particles and outer cloud spin with scoped ownership", async () => {
    await act(async () => root.render(<VortexEffect active preset="chronosphere" />));
    await step(100);
    expect(createRenderer.mock.calls[0][0]).toBe(container.querySelector("canvas"));
    const [nebula, stars, supernova, cloudComposite, clouds, glow] = scenes[0].layers;
    expect(nebula.contents).toBe(image);
    expect(stars.setParticles).toHaveBeenCalled();
    expect(supernova.contents).toBe(image);
    expect(clouds.setParticles).toHaveBeenCalled();
    expect(clouds.parent).toBe(cloudComposite);
    expect(cloudComposite.filters[0].uniforms).toMatchObject({ uAngle: { value: 18.75 }, uRadius: { value: 2 }, uPower: { value: 80.2 } });
    expect(clouds.compositingFilter.parameters.mode).toBe("addition");
    expect(glow.filters[0].uniforms.uTint.value).toEqual([1, 0.84, 0.62]);
    expect(glow.filters[0].uniforms.uAlpha.value).toBeGreaterThan(0);
    frames.suspended = true; await act(async () => stateListeners.forEach(listener => listener()));
    expect(pending.size).toBe(0);
  });
  it("renders one settled reduced-motion frame and releases renderer and frame subscriptions", async () => {
    frames.reducedMotion = true;
    host.environment.reducedMotion = true;
    await act(async () => root.render(<VortexEffect active preset="chronosphere" />));
    expect(pending.size).toBe(0);
    expect(scenes[0].layers[0].opacity).toBe(1);
    const scene = scenes[0];
    await act(async () => root.unmount());
    expect(scene.signal?.aborted).toBe(true);
    expect(scene.dispose).toHaveBeenCalled();
    expect(stateListeners.size).toBe(0);
    root = createRoot(container);
  });
  it.each(["Vortex"])("releases a %s scene if viewport setup throws", async () => {
    const makeRenderer = createRenderer.getMockImplementation() as (...args: unknown[]) => (typeof scenes)[number];
    createRenderer.mockImplementation((...args: unknown[]) => {
      const scene = makeRenderer(...args);
      scene.setViewport.mockImplementation(() => { throw new Error("GPU setup failed"); });
      return scene;
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await act(async () => root.render(<VortexEffect active />));
    expect(container.querySelector("[data-renderer='unavailable']")?.getAttribute("data-renderer-error")).toBe("GPU setup failed");
      expect(scenes[0].dispose).toHaveBeenCalled();
      expect(scenes[0].signal?.aborted).toBe(true);
      expect(stateListeners.size).toBe(0);
      expect(pending.size).toBe(0);
    } finally { consoleError.mockRestore(); }
  });
});
