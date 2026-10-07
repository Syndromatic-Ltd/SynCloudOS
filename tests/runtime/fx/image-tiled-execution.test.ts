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

import { describe, expect, it } from "vitest";
import { GFXColour, GFXImage } from "../../../src/FX/GraphicsFX/public";
import {
  IFXContext,
  IFXFilterRegistry,
  IFXImage,
  IFXImageAccumulator,
  IFXRenderDestination,
  IFXTilePlan,
  IFXTileRenderDestination,
} from "../../../src/FX/ImageFX/public";
import { createProcessingImage } from "../../../src/FX/ImageFX/IFXImage";
import { finiteExtent } from "../../../src/FX/ImageFX/extent";
import type { ImageProcessor } from "../../../src/FX/ImageFX/processing";

const registry = new IFXFilterRegistry();

function step(width: number, height: number, origin = { x: 0, y: 0 }) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = (y * width + x) * 4;
    const value = x < width / 2 ? 0 : 255;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  return IFXImage.fromPixels(new GFXImage({ width, height, alpha: "straight", colourSpace: "linear-srgb", data }), origin);
}

function joinTiles(
  bounds: { x: number; y: number; width: number; height: number },
  tiles: readonly { rect: { x: number; y: number; width: number; height: number }; image: GFXImage }[],
) {
  const bytes = new Uint8Array(bounds.width * bounds.height * 4);
  for (const tile of tiles) {
    const incoming = tile.image.copyData();
    for (let y = 0; y < tile.rect.height; y += 1) {
      const source = y * tile.rect.width * 4;
      const destination = (((tile.rect.y - bounds.y + y) * bounds.width) + tile.rect.x - bounds.x) * 4;
      bytes.set(incoming.subarray(source, source + tile.rect.width * 4), destination);
    }
  }
  return new GFXImage({ width: bounds.width, height: bounds.height, alpha: "straight", colourSpace: "srgb", data: bytes });
}

describe("ImageFX ROI-driven tiled execution", () => {
  it("builds an immutable bounded tile plan for nonzero destination extents", () => {
    const plan = new IFXTilePlan({ x: -3, y: 7, width: 10, height: 6 }, 4);
    expect(plan.tiles).toHaveLength(6);
    expect(plan.tiles[0]?.rect).toEqual({ x: -3, y: 7, width: 4, height: 4 });
    expect(plan.tiles.at(-1)?.rect).toEqual({ x: 5, y: 11, width: 2, height: 2 });
    expect(plan.maximumTileBytes).toBe(64);
    expect(Object.isFrozen(plan.tiles)).toBe(true);
    expect(() => new IFXTilePlan({ x: 0, y: 0, width: 1_000_000, height: 1_000_000 }, 1)).toThrow(/tile.*budget/i);
  });

  it("matches full Gaussian output across tile seams and reports bounded peak usage", async () => {
    const source = step(14, 8, { x: -5, y: 11 });
    const blurred = registry.create("gaussianBlur", { sigma: 1 }).apply(source);
    const bounds = { kind: "finite" as const, rect: { x: -4, y: 12, width: 12, height: 6 } };
    const fullContext = new IFXContext("linear-srgb", 200_000, { outputBytes: 1 << 20, scratchBytes: 1 << 20, cacheBytes: 1 << 20, work: 2_000_000, tileSize: 4 });
    const full = await fullContext.render(blurred, new IFXRenderDestination(bounds));

    const tiles: Array<{ rect: { x: number; y: number; width: number; height: number }; image: GFXImage }> = [];
    const tiledContext = new IFXContext("linear-srgb", 200_000, { outputBytes: 64, scratchBytes: 4096, cacheBytes: 4096, work: 2_000_000, tileSize: 4 });
    const destination = new IFXTileRenderDestination(bounds, { tileSize: 4, write: tile => void tiles.push(tile) });
    const info = await tiledContext.renderTiles(blurred, destination);
    const joined = joinTiles(bounds.rect, tiles);
    expect(info.tileCount).toBe(6);
    expect(info.peakBytes.output).toBeLessThanOrEqual(64);
    expect(info.peakBytes.scratch).toBeLessThanOrEqual(4096);
    expect(info.peakBytes.cache).toBeLessThanOrEqual(4096);
    for (let y = 0; y < full.image.height; y += 1) for (let x = 0; x < full.image.width; x += 1) {
      const expected = full.image.pixel(x, y), actual = joined.pixel(x, y);
      for (const key of ["r", "g", "b", "a"] as const)
        expect(Math.abs(expected[key] - actual[key]) * 255).toBeLessThanOrEqual(1.01);
    }
  });

  it("uses output ROI to skip unrelated prepared branches while retaining Canny full-source preparation", async () => {
    let prepares = 0;
    const farSource = IFXImage.constant(GFXColour.rgba(0, 1, 0)).cropped({ x: 100, y: 100, width: 4, height: 4 });
    const probe: ImageProcessor = Object.freeze({
      name: "roi-probe",
      parameters: Object.freeze({}),
      extent: finiteExtent({ x: 100, y: 100, width: 4, height: 4 }),
      regions: bounds => [bounds],
      evaluate: (point, access) => access.sample(0, point),
      prepare: async () => { prepares += 1; },
      preparation: Object.freeze({ scope: "regional" as const, scratchBytes: 0, work: 1 }),
    });
    const far = createProcessingImage([farSource], probe);
    const local = IFXImage.constant(GFXColour.rgba(1, 0, 0)).cropped({ x: 0, y: 0, width: 4, height: 4 });
    const combined = local.compositedOver(far);
    await new IFXContext().render(combined, new IFXRenderDestination({ kind: "finite", rect: { x: 0, y: 0, width: 4, height: 4 } }));
    expect(prepares).toBe(0);

    const canny = registry.create("cannyEdgeDetector", { gaussianSigma: 0, thresholdLow: .2, thresholdHigh: .5, hysteresisPasses: 0 }).apply(step(9, 9));
    const full = await new IFXContext("linear-srgb", 20_000).render(canny);
    const tiles: Array<{ rect: { x: number; y: number; width: number; height: number }; image: GFXImage }> = [];
    const target = new IFXTileRenderDestination({ kind: "finite", rect: { x: 3, y: 0, width: 2, height: 9 } }, { tileSize: 2, write: tile => void tiles.push(tile) });
    const info = await new IFXContext("linear-srgb", 20_000, { scratchBytes: 1 << 20, work: 1 << 20, tileSize: 2 }).renderTiles(canny, target);
    expect(joinTiles(target.bounds, tiles).pixel(0, 4)).toEqual(full.image.pixel(3, 4));
    expect(info.globalPreparationCount).toBe(1);
  });

  it("rejects materialized output before allocation but streams a larger logical output within the same resident budget", async () => {
    const image = step(16, 8);
    const context = new IFXContext("linear-srgb", 20_000, { outputBytes: 64, scratchBytes: 1024, cacheBytes: 1024, work: 200_000, tileSize: 4 });
    const materialized = new IFXRenderDestination(image.extent);
    await expect(context.render(image, materialized)).rejects.toThrow(/output.*budget/i);
    expect(materialized.image).toBeNull();
    const tiles: GFXImage[] = [];
    const streamed = new IFXTileRenderDestination(image.extent, { tileSize: 4, write: tile => void tiles.push(tile.image) });
    const info = await context.renderTiles(image, streamed);
    expect(tiles).toHaveLength(8);
    expect(info.logicalOutputBytes).toBe(512);
    expect(info.peakBytes.output).toBeLessThanOrEqual(64);
  });

  it("bounds tile cache, reuses valid tile keys, and stops publication after cancellation", async () => {
    const shared = step(8, 4);
    const image = shared.compositedOver(shared);
    const context = new IFXContext("linear-srgb", 50_000, { outputBytes: 64, scratchBytes: 2048, cacheBytes: 256, work: 500_000, tileSize: 4 });
    const first = new IFXTileRenderDestination(image.extent, { tileSize: 4, write: () => undefined });
    const one = await context.renderTiles(image, first);
    const second = new IFXTileRenderDestination(image.extent, { tileSize: 4, write: () => undefined });
    const two = await context.renderTiles(image, second);
    expect(one.tileCacheEvictions).toBeGreaterThanOrEqual(0);
    expect(one.cacheHits).toBeGreaterThan(0);
    expect(two.tileCacheHits).toBeGreaterThan(0);
    expect(two.peakBytes.cache).toBeLessThanOrEqual(256);

    const controller = new AbortController();
    let publications = 0;
    const cancelling = new IFXTileRenderDestination(image.extent, { tileSize: 4, write: () => {
      publications += 1;
      controller.abort();
    } });
    await expect(context.renderTiles(image, cancelling, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(publications).toBe(1);
  });

  it("rejects global preparation when declared scratch/work exceeds the context budget", async () => {
    const canny = registry.create("cannyEdgeDetector", {}).apply(step(64, 64));
    const destination = new IFXRenderDestination(canny.extent);
    const context = new IFXContext("linear-srgb", 100_000, { outputBytes: 1 << 20, scratchBytes: 1024, cacheBytes: 1024, work: 1 << 20, tileSize: 16 });
    await expect(context.render(canny, destination)).rejects.toThrow(/scratch|work.*budget/i);
    expect(destination.image).toBeNull();
  });

  it("prevents an older overlapping accumulator update from publishing after a newer generation", async () => {
    const accumulator = new IFXImageAccumulator({ x: 0, y: 0, width: 4, height: 40 });
    const context = new IFXContext("linear-srgb", 50_000);
    const older = accumulator.update(
      IFXImage.constant(GFXColour.rgba(1, 0, 0)).cropped(accumulator.extent),
      context,
      accumulator.extent,
    );
    const newer = accumulator.update(
      IFXImage.constant(GFXColour.rgba(0, 1, 0)).cropped(accumulator.extent),
      context,
      accumulator.extent,
    );
    await expect(older).rejects.toMatchObject({ name: "AbortError" });
    await newer;
    const output = await context.render(accumulator.image);
    expect(output.image.pixel(2, 20)).toEqual({ r: 0, g: 1, b: 0, a: 1 });
    accumulator.dispose();
    context.dispose();
  });
});
