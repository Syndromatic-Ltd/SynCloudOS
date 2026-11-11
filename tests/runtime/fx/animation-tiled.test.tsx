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
import { AFXTiledLayer } from "../../../src/FX/AnimationFX/AFXTiledLayer";
import type { AFXFrameScheduler } from "../../../src/FX/AnimationFX/AFXLayer";
import type { AFXLayerSurface } from "../../../src/FX/AnimationFX/AFXLayer";
import { GFXImage } from "../../../src/FX/GraphicsFX/GFXImage";
import { IFXContext } from "../../../src/FX/ImageFX/IFXContext";
import { IFXImage } from "../../../src/FX/ImageFX/IFXImage";
import { BrowserAnimationLayerSurface } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter";
import { createAFXLayer } from "../../../src/FX/AnimationFX/host";

class TileClock implements AFXFrameScheduler {
  time = 0;
  reducedMotion = false;
  suspended = false;
  readonly frames = new Set<(timestamp: number) => void>();
  readonly states = new Set<() => void>();
  now() { return this.time; }
  requestFrame(callback: (timestamp: number) => void) {
    this.frames.add(callback);
    return () => this.frames.delete(callback);
  }
  subscribeState(callback: () => void) {
    this.states.add(callback);
    return () => this.states.delete(callback);
  }
  frame() {
    const callbacks = [...this.frames];
    this.frames.clear();
    callbacks.forEach((callback) => callback(this.time));
  }
  setSuspended(value: boolean) {
    this.suspended = value;
    this.states.forEach((callback) => callback());
  }
}

const image = (width: number, height: number, red = 255) => new GFXImage({
  width,
  height,
  alpha: "straight",
  colourSpace: "srgb",
  data: new Uint8Array(width * height * 4).map((_, index) => index % 4 === 0 ? red : 255),
});

function mounted(clock = new TileClock(), signal?: AbortSignal) {
  const element = document.createElement("div");
  const layer = createAFXLayer(AFXTiledLayer, new BrowserAnimationLayerSurface(element), clock, { signal });
  layer.frame = { x: 0, y: 0, width: 40, height: 30 };
  layer.tileSize = { width: 10, height: 10 };
  return { clock, element, layer };
}

describe("AnimationFX tiled rendering", () => {
  it("draws only intersecting visible tiles at the selected zoom and DPR level", async () => {
    const { clock, element, layer } = mounted();
    const requests: Array<{ rect: object; pixelWidth: number; pixelHeight: number; scale: number; level: number }> = [];
    layer.contentsScale = 2;
    layer.levelsOfDetail = 3;
    layer.levelsOfDetailBias = 1;
    layer.drawTile = (request) => {
      requests.push(request);
      return image(request.pixelWidth, request.pixelHeight);
    };
    layer.setVisibleRect({ x: 5, y: 5, width: 12, height: 4 }, 2);
    clock.frame();
    await layer.waitForIdle();
    expect(requests).toHaveLength(2);
    expect(requests.map(({ rect }) => rect)).toEqual([
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 10, y: 0, width: 10, height: 10 },
    ]);
    expect(requests.every(({ pixelWidth, pixelHeight, scale, level }) =>
      pixelWidth === 40 && pixelHeight === 40 && scale === 4 && level === 1,
    )).toBe(true);
    expect(element.querySelectorAll('svg[data-afx-content="tiled"] image')).toHaveLength(2);
    expect(element.querySelector("svg animate")?.getAttribute("dur")).toBe("0.25s");
    expect(layer.diagnostics.cachedTiles).toBe(2);
    layer.dispose();
  });

  it("invalidates only dirty intersecting tiles and rejects stale asynchronous results", async () => {
    const { clock, layer } = mounted();
    const calls: Array<{ x: number; signal: AbortSignal; resolve: (value: GFXImage) => void }> = [];
    layer.drawTile = (request, signal) => new Promise<GFXImage>((resolve) => {
      calls.push({ x: request.rect.x, signal, resolve });
    });
    layer.setVisibleRect({ x: 0, y: 0, width: 20, height: 10 }, 1);
    clock.frame();
    await Promise.resolve();
    expect(calls).toHaveLength(2);
    calls.forEach(({ resolve }) => resolve(image(10, 10, 100)));
    await layer.waitForIdle();
    layer.invalidate({ x: 1, y: 1, width: 2, height: 2 });
    clock.frame();
    await Promise.resolve();
    expect(calls).toHaveLength(3);
    const stale = calls[2];
    layer.invalidate({ x: 2, y: 2, width: 2, height: 2 });
    expect(stale.signal.aborted).toBe(true);
    clock.frame();
    await Promise.resolve();
    expect(calls).toHaveLength(4);
    stale.resolve(image(10, 10, 10));
    calls[3].resolve(image(10, 10, 220));
    await layer.waitForIdle();
    const content = layer.presentation.content;
    if (!content || content.kind !== "tiled") throw new Error("Tiled content missing.");
    expect(content.tiles).toHaveLength(2);
    expect(content.tiles.find((tile) => tile.rect.x === 0)?.image.pixel(0, 0).r).toBeCloseTo(220 / 255);
    expect(content.tiles.find((tile) => tile.rect.x === 10)?.image.pixel(0, 0).r).toBeCloseTo(100 / 255);
    layer.dispose();
  });

  it("materializes canonical IFX output and keeps old-level fallback until replacement tiles finish", async () => {
    const { clock, element, layer } = mounted();
    const context = new IFXContext();
    let delayed: ((value: IFXImage) => void) | null = null;
    layer.tileImageContext = context;
    layer.drawTile = (request) =>
      request.level === 0
        ? IFXImage.fromPixels(image(request.pixelWidth, request.pixelHeight, 80))
        : new Promise<IFXImage>((resolve) => { delayed = resolve; });
    layer.setVisibleRect({ x: 0, y: 0, width: 10, height: 10 }, 1);
    clock.frame();
    await layer.waitForIdle();
    layer.levelsOfDetail = 2;
    layer.levelsOfDetailBias = 1;
    layer.setVisibleRect({ x: 0, y: 0, width: 10, height: 10 }, 2);
    clock.frame();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(element.querySelector('image[data-afx-tile-level="0"]')).not.toBeNull();
    delayed!(IFXImage.fromPixels(image(20, 20, 180)));
    await layer.waitForIdle();
    expect(element.querySelector('image[data-afx-tile-level="1"]')).not.toBeNull();
    expect(element.querySelector('image[data-afx-tile-level="0"]')).toBeNull();
    layer.dispose();
    context.dispose();
  });

  it("cancels hidden work, resumes visible requests, and releases everything on abort", async () => {
    const owner = new AbortController();
    const { clock, element, layer } = mounted(new TileClock(), owner.signal);
    const signals: AbortSignal[] = [];
    layer.drawTile = (request, signal) => {
      signals.push(signal);
      return new Promise<GFXImage>(() => {});
    };
    layer.setVisibleRect({ x: 0, y: 0, width: 10, height: 10 }, 1);
    clock.frame();
    await Promise.resolve();
    expect(signals).toHaveLength(1);
    clock.setSuspended(true);
    expect(signals[0].aborted).toBe(true);
    expect(clock.frames.size).toBe(0);
    clock.setSuspended(false);
    clock.frame();
    await Promise.resolve();
    expect(signals).toHaveLength(2);
    owner.abort();
    expect(signals[1].aborted).toBe(true);
    expect(clock.frames.size).toBe(0);
    expect(clock.states.size).toBe(0);
    expect(element.querySelector("svg")).toBeNull();
    await expect(layer.waitForIdle()).rejects.toThrow(expect.objectContaining({ code: "AFX_TILED_LAYER_DISPOSED" }));
  });

  it("preflights finite viewport, tile, scale, visible-work and cache bounds", () => {
    const { layer } = mounted();
    layer.drawTile = (request) => image(request.pixelWidth, request.pixelHeight);
    expect(() => { layer.tileSize = { width: 0, height: 10 }; }).toThrow();
    expect(() => { layer.contentsScale = 100; }).toThrow();
    expect(() => layer.setVisibleRect({ x: 0, y: 0, width: 40, height: 30 }, Infinity)).toThrow();
    layer.frame = { x: 0, y: 0, width: 1_000, height: 1_000 };
    layer.tileSize = { width: 1, height: 1 };
    expect(() => layer.setVisibleRect({ x: -100, y: -100, width: 2_000, height: 2_000 }, 1)).toThrow(/visible tile budget/i);
    expect(() => { layer.maximumCacheBytes = 1; }).toThrow();
    layer.dispose();
  });

  it("reports draw failures through waitForIdle without publishing invalid pixels", async () => {
    const { clock, layer } = mounted();
    layer.drawTile = (request) => image(request.pixelWidth + 1, request.pixelHeight);
    layer.setVisibleRect({ x: 0, y: 0, width: 10, height: 10 }, 1);
    clock.frame();
    await expect(layer.waitForIdle()).rejects.toThrow(/pixel dimensions/i);
    const content = layer.presentation.content;
    expect(content?.kind).toBe("tiled");
    if (!content || content.kind !== "tiled") throw new Error("Tiled content missing.");
    expect(content.tiles).toHaveLength(0);
    layer.dispose();
  });

  it("rejects an aggregate visible working set larger than the cache", () => {
    const { layer } = mounted();
    layer.tileSize = { width: 256, height: 256 };
    layer.frame = { x: 0, y: 0, width: 2_048, height: 256 };
    layer.maximumCacheBytes = 1024 * 1024;
    layer.drawTile = (request) => image(request.pixelWidth, request.pixelHeight);
    expect(() => layer.setVisibleRect({ x: 0, y: 0, width: 2_048, height: 256 }, 1)).toThrow(/aggregate|working set/i);
    layer.dispose();
  });

  it("invalidates cached geometry when layer bounds change", async () => {
    const { clock, layer } = mounted();
    const rects: object[] = [];
    layer.drawTile = (request) => {
      rects.push(request.rect);
      return image(request.pixelWidth, request.pixelHeight);
    };
    layer.bounds = { x: 0, y: 0, width: 20, height: 10 };
    layer.setVisibleRect({ x: 0, y: 0, width: 10, height: 10 }, 1);
    clock.frame();
    await layer.waitForIdle();
    layer.bounds = { x: 10, y: 0, width: 20, height: 10 };
    layer.setVisibleRect({ x: 10, y: 0, width: 10, height: 10 }, 1);
    clock.frame();
    await layer.waitForIdle();
    expect(rects).toEqual([
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 10, y: 0, width: 10, height: 10 },
    ]);
    layer.dispose();
  });

  it("never starts more than four raw tile drawing callbacks", async () => {
    const { clock, layer } = mounted();
    let rawCallbacks = 0;
    layer.drawTile = () => {
      rawCallbacks++;
      return new Promise<GFXImage>(() => {});
    };
    for (let index = 0; index < 20; index++) {
      layer.setVisibleRect({ x: index % 2 ? 10 : 0, y: 0, width: 10, height: 10 }, 1);
      clock.frame();
      await Promise.resolve();
    }
    expect(rawCallbacks).toBeLessThanOrEqual(4);
    layer.dispose();
  });

  it("prunes dirty-key versions and makes disposal reentrant-safe", async () => {
    const { clock, layer } = mounted();
    layer.drawTile = (request) => image(request.pixelWidth, request.pixelHeight);
    layer.setVisibleRect({ x: 0, y: 0, width: 10, height: 10 }, 1);
    clock.frame();
    await layer.waitForIdle();
    layer.invalidate({ x: 0, y: 0, width: 10, height: 10 });
    layer.drawTile = null;
    expect(layer.diagnostics.trackedVersions).toBe(0);
    layer.dispose();

    let disposing!: AFXTiledLayer, disposals = 0;
    const surface: AFXLayerSurface = {
      supportedProperties: [], supportedContentKinds: ["tiled"],
      apply() {}, attach() {}, detach() {}, setMask() {},
      dispose() { disposals++; },
    };
    const scheduler: AFXFrameScheduler = {
      now: () => 0, reducedMotion: false, suspended: false,
      requestFrame: () => () => {},
      subscribeState: () => () => disposing.dispose(),
    };
    disposing = createAFXLayer(AFXTiledLayer, surface, scheduler);
    expect(() => disposing.dispose()).not.toThrow();
    expect(disposals).toBe(1);
  });
});
