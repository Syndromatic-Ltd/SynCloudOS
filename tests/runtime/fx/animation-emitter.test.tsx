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
import { describe, expect, it } from "vitest";
import { AFXEmitterCell } from "../../../src/FX/AnimationFX/AFXEmitterCell";
import { AFXEmitterLayer } from "../../../src/FX/AnimationFX/AFXEmitterLayer";
import { createAFXLayer } from "../../../src/FX/AnimationFX/host";
import type { AFXFrameScheduler } from "../../../src/FX/AnimationFX/AFXLayer";
import type { AFXLayerSnapshot, AFXLayerSurface } from "../../../src/FX/AnimationFX/AFXLayer";
import { GFXColour } from "../../../src/FX/GraphicsFX/GFXColour";
import { GFXImage } from "../../../src/FX/GraphicsFX/GFXImage";
import { BrowserAnimationLayerSurface } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter";

class FrameClock implements AFXFrameScheduler {
  time = 0;
  reducedMotion = false;
  suspended = false;
  readonly frames = new Set<(timestamp: number) => void>();
  readonly state = new Set<() => void>();
  now() { return this.time; }
  requestFrame(callback: (timestamp: number) => void) {
    this.frames.add(callback);
    return () => this.frames.delete(callback);
  }
  subscribeState(callback: () => void) {
    this.state.add(callback);
    return () => this.state.delete(callback);
  }
  advance(seconds: number) {
    this.time += seconds;
    const callbacks = [...this.frames];
    this.frames.clear();
    callbacks.forEach((callback) => callback(this.time));
  }
  setState(values: { reducedMotion?: boolean; suspended?: boolean }) {
    Object.assign(this, values);
    this.state.forEach((callback) => callback());
  }
}

const pixel = new GFXImage({
  width: 1,
  height: 1,
  alpha: "straight",
  colourSpace: "srgb",
  data: new Uint8Array([255, 255, 255, 255]),
});

function mounted(clock = new FrameClock(), signal?: AbortSignal) {
  const element = document.createElement("div");
  const layer = createAFXLayer(AFXEmitterLayer, new BrowserAnimationLayerSurface(element), clock, { signal });
  layer.frame = { x: 0, y: 0, width: 100, height: 100 };
  return { clock, element, layer };
}

describe("AnimationFX seeded emitter layer", () => {
  it("renders canonical GFX pixels with deterministic motion, colour, scale and spin", () => {
    const { clock, element, layer } = mounted();
    layer.seed = 7;
    layer.emitterPosition = { x: 10, y: 20 };
    layer.emitterCells = [
      new AFXEmitterCell({
        contents: pixel,
        birthRate: 2,
        lifetime: 2,
        velocity: 10,
        emissionLongitude: 0,
        xAcceleration: 2,
        yAcceleration: 4,
        colour: GFXColour.rgba(0.4, 0.5, 0.6, 0.8),
        redSpeed: 0.2,
        alphaSpeed: -0.4,
        scale: 2,
        scaleSpeed: 1,
        spin: 0.5,
      }),
    ];
    layer.startEmitting();
    clock.advance(0.5);
    clock.advance(0.5);
    const content = layer.presentation.content;
    expect(content?.kind).toBe("emitter");
    if (!content || content.kind !== "emitter") throw new Error("Emitter content missing.");
    expect(content.particles).toHaveLength(2);
    expect(content.particles[0]).toMatchObject({
      position: { x: 15.25, y: 20.5 },
      scale: 2.5,
      rotation: 0.25,
    });
    expect(content.particles[0].colour.components.r).toBeCloseTo(0.5, 10);
    expect(content.particles[0].colour.components.g).toBeCloseTo(0.5, 10);
    expect(content.particles[0].colour.components.b).toBeCloseTo(0.6, 10);
    expect(content.particles[0].colour.components.a).toBeCloseTo(0.6, 10);
    const image = element.querySelector('svg[data-afx-content="emitter"] image');
    expect(image?.getAttribute("href")).toMatch(/^data:image\/png;base64,/);
    expect(element.querySelectorAll("svg g[data-afx-particle]")).toHaveLength(2);
    layer.dispose();
  });

  it("uses the seed for reproducible volume, surface and outline emission geometry", () => {
    const positions = (shape: "rectangle" | "circle", mode: "volume" | "surface" | "outline") => {
      const { clock, layer } = mounted();
      layer.seed = 12345;
      layer.emitterShape = shape;
      layer.emitterMode = mode;
      layer.emitterPosition = { x: 50, y: 50 };
      layer.emitterSize = { width: 40, height: 20 };
      layer.emitterCells = [new AFXEmitterCell({ contents: pixel, birthRate: 4, lifetime: 2 })];
      layer.startEmitting();
      clock.advance(1);
      const content = layer.presentation.content;
      if (!content || content.kind !== "emitter") throw new Error("Emitter content missing.");
      const result = content.particles.map((particle) => particle.position);
      layer.dispose();
      return result;
    };
    for (const [shape, mode] of [
      ["rectangle", "volume"],
      ["rectangle", "surface"],
      ["circle", "volume"],
      ["circle", "outline"],
    ] as const) {
      const first = positions(shape, mode);
      expect(positions(shape, mode)).toEqual(first);
      if (shape === "rectangle" && mode !== "volume")
        expect(first.every(({ x, y }) => x === 30 || x === 70 || y === 40 || y === 60)).toBe(true);
      if (shape === "circle" && mode === "outline")
        for (const { x, y } of first)
          expect(Math.hypot((x - 50) / 20, (y - 50) / 10)).toBeCloseTo(1, 10);
    }
  });

  it("caps particle storage and per-frame spawning under hostile rates and frame gaps", () => {
    const { clock, layer } = mounted();
    layer.maxParticles = 5;
    layer.emitterCells = [
      new AFXEmitterCell({ contents: pixel, birthRate: 100_000, lifetime: 60 }),
    ];
    layer.startEmitting();
    clock.advance(60);
    const content = layer.presentation.content;
    if (!content || content.kind !== "emitter") throw new Error("Emitter content missing.");
    expect(content.particles).toHaveLength(5);
    expect(layer.diagnostics.spawnedThisFrame).toBeLessThanOrEqual(128);
    expect(clock.frames.size).toBe(1);
    layer.dispose();
  });

  it("pauses hidden work without catch-up, provides reduced-motion fallback, and releases abort resources", () => {
    const owner = new AbortController();
    const { clock, element, layer } = mounted(new FrameClock(), owner.signal);
    layer.emitterCells = [new AFXEmitterCell({ contents: pixel, birthRate: 2, lifetime: 3 })];
    layer.startEmitting();
    clock.advance(0.5);
    expect(layer.particleCount).toBe(1);
    clock.setState({ suspended: true });
    expect(clock.frames.size).toBe(0);
    clock.time = 20;
    clock.setState({ suspended: false });
    clock.advance(0.5);
    expect(layer.particleCount).toBe(2);
    clock.setState({ reducedMotion: true });
    expect(layer.particleCount).toBe(0);
    expect(clock.frames.size).toBe(0);
    clock.setState({ reducedMotion: false });
    clock.advance(0.5);
    expect(layer.particleCount).toBe(1);
    owner.abort();
    expect(clock.frames.size).toBe(0);
    expect(clock.state.size).toBe(0);
    expect(element.querySelector("svg")).toBeNull();
    expect(() => layer.startEmitting()).toThrow(expect.objectContaining({ code: "AFX_EMITTER_LAYER_DISPOSED" }));
  });

  it("rejects invalid cells and layer configuration before replacing rendered state", () => {
    expect(() => new AFXEmitterCell({ contents: pixel, lifetime: -1 })).toThrow();
    expect(() => new AFXEmitterCell({ contents: {} as GFXImage })).toThrow(/GFXImage/);
    const { clock, layer } = mounted();
    layer.emitterCells = [new AFXEmitterCell({ contents: pixel, birthRate: 1, lifetime: 2 })];
    layer.startEmitting();
    clock.advance(1);
    const before = layer.presentation.content;
    expect(() => { layer.maxParticles = 10_000; }).toThrow();
    expect(() => { layer.emitterSize = { width: -1, height: 2 }; }).toThrow();
    expect(layer.presentation.content).toEqual(before);
    layer.dispose();
  });

  it("keeps seeded birth crossings independent of frame cadence", () => {
    const trajectory = (steps: readonly number[]) => {
      const { clock, layer } = mounted();
      layer.seed = 42;
      layer.emitterCells = [new AFXEmitterCell({
        contents: pixel,
        birthRate: 3,
        lifetime: 4,
        velocity: 12,
        velocityRange: 3,
        emissionRange: 1,
      })];
      layer.startEmitting();
      steps.forEach((step) => clock.advance(step));
      const content = layer.presentation.content;
      if (!content || content.kind !== "emitter") throw new Error("Emitter content missing.");
      const result = content.particles.map(({ position, scale, rotation, colour }) => ({ position, scale, rotation, colour: colour.components }));
      layer.dispose();
      return result;
    };
    expect(trajectory([0.2, 0.2, 0.2, 0.2, 0.2])).toEqual(trajectory([0.5, 0.5]));
  });

  it("rolls back synchronous aborts and completes teardown when host releases throw", () => {
    const controller = new AbortController();
    let surfaceDisposals = 0, subscriptions = 0, subscriptionReleases = 0;
    const surface: AFXLayerSurface = {
      supportedProperties: [],
      supportedContentKinds: ["emitter"],
      apply(snapshot: AFXLayerSnapshot) {
        if (snapshot.content?.kind === "emitter") controller.abort();
      },
      attach() {}, detach() {}, setMask() {},
      dispose() { surfaceDisposals++; },
    };
    const synchronousClock: AFXFrameScheduler = {
      now: () => 0, reducedMotion: false, suspended: false,
      requestFrame: () => () => {},
      subscribeState: () => { subscriptions++; return () => { subscriptionReleases++; }; },
    };
    expect(() => createAFXLayer(AFXEmitterLayer, surface, synchronousClock, { signal: controller.signal })).toThrow(/aborted/);
    expect(surfaceDisposals).toBe(1);
    // Whatever the attach order, every state subscription taken before the abort is released.
    expect(subscriptionReleases).toBe(subscriptions);

    const liveSurface: AFXLayerSurface = {
      supportedProperties: [], supportedContentKinds: ["emitter"],
      apply() {}, attach() {}, detach() {}, setMask() {},
      dispose() { surfaceDisposals++; },
    };
    const releaseClock: AFXFrameScheduler = {
      now: () => 0, reducedMotion: false, suspended: false,
      requestFrame: () => () => { throw new Error("cancel failure"); },
      subscribeState: () => () => { subscriptionReleases++; throw new Error("unsubscribe failure"); },
    };
    const live = createAFXLayer(AFXEmitterLayer, liveSurface, releaseClock);
    live.emitterCells = [new AFXEmitterCell({ contents: pixel, birthRate: 1, lifetime: 1 })];
    live.startEmitting();
    expect(() => live.dispose()).toThrow(/cancel failure|unsubscribe failure/);
    expect(subscriptionReleases).toBe(subscriptions + 2);
    expect(surfaceDisposals).toBe(2);
  });

  it("bounds rate multipliers and rejects overflow without publishing non-finite particles", () => {
    expect(() => new AFXEmitterCell({ contents: pixel, birthRate: Number.MAX_VALUE })).toThrow();
    const { layer } = mounted();
    expect(() => { layer.birthRate = Number.MAX_VALUE; }).toThrow();
    expect(() => { layer.velocity = Number.MAX_VALUE; }).toThrow();
    layer.dispose();
  });

  it("rejects emitter image sets beyond the projection resource budget", () => {
    const oversized = new GFXImage({
      width: 2_097_153,
      height: 1,
      alpha: "straight",
      colourSpace: "srgb",
      data: new Uint8Array(2_097_153 * 4),
    });
    const { layer } = mounted();
    expect(() => {
      layer.emitterCells = [new AFXEmitterCell({ contents: oversized })];
    }).toThrow(/resource budget/i);
    layer.dispose();
  });
});
