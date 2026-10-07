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

import { expect, test } from "playwright/test";

test("real Chromium keeps ImageFX tiled execution inside declared resident budgets", async ({ page }) => {
  const input = { width: 32, height: 16, sigma: 1, tileSize: 8 };
  // Gaussian support expands each source edge by ceil(3 * sigma).
  const radius = Math.ceil(3 * input.sigma);
  const outputBounds = { x: -radius, y: -radius, width: input.width + 2 * radius, height: input.height + 2 * radius };
  const tileCount = Math.ceil(outputBounds.width / input.tileSize) * Math.ceil(outputBounds.height / input.tileSize);
  const logicalOutputBytes = outputBounds.width * outputBounds.height * 4;
  await page.goto("/");
  const result = await page.evaluate(async ({ width, height, sigma, tileSize }) => {
    const imageFX = await import("/src/FX/ImageFX/public.ts");
    const graphics = await import("/src/FX/GraphicsFX/public.ts");
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      data[index] = x * 7;
      data[index + 1] = y * 13;
      data[index + 2] = 160;
      data[index + 3] = 255;
    }
    const source = imageFX.IFXImage.fromPixels(new graphics.GFXImage({
      width,
      height,
      alpha: "straight",
      colourSpace: "srgb",
      data,
    }));
    const blurred = new imageFX.IFXFilterRegistry().create("gaussianBlur", { sigma }).apply(source);
    const context = new imageFX.IFXContext("linear-srgb", 200_000, {
      outputBytes: 256,
      scratchBytes: 4096,
      cacheBytes: 2048,
      work: 500_000,
      tileSize,
    });
    const materialized = new imageFX.IFXRenderDestination(blurred.extent);
    let materializedRejected = false;
    try {
      await context.render(blurred, materialized);
    } catch (error) {
      materializedRejected = error instanceof Error && /output.*budget/i.test(error.message);
    }
    const checksums: number[] = [];
    const publishedBytes: number[] = [];
    let lastTileRect: { x: number; y: number; width: number; height: number } | undefined;
    const makeDestination = (extent = blurred.extent) => new imageFX.IFXTileRenderDestination(extent, {
      tileSize,
      write: ({ image, rect }: { image: InstanceType<typeof graphics.GFXImage>; rect: { x: number; y: number; width: number; height: number } }) => {
        const bytes = image.copyData();
        let checksum = 0;
        for (const value of bytes) checksum = (checksum + value) >>> 0;
        checksums.push(checksum);
        publishedBytes.push(bytes.byteLength);
        lastTileRect = rect;
      },
    });
    const first = await context.renderTiles(blurred, makeDestination());
    const second = await context.renderTiles(blurred, makeDestination());
    if (!lastTileRect) throw new Error("Tiled execution did not publish any tiles.");
    // The bounded LRU cannot retain the full output; replay the last tile before it is evicted.
    const cachedExtent = { kind: "finite" as const, rect: lastTileRect };
    const cached = await context.renderTiles(blurred, makeDestination(cachedExtent));
    context.dispose();
    return { materializedRejected, materializedPublished: materialized.image !== null, extent: blurred.extent, first, second, cached, cachedExtent, checksums, publishedBytes };
  }, input);
  expect(result.materializedRejected).toBe(true);
  expect(result.materializedPublished).toBe(false);
  expect(result.extent).toEqual({ kind: "finite", rect: outputBounds });
  expect(logicalOutputBytes).toBeGreaterThan(256);
  for (const info of [result.first, result.second]) {
    expect(info).toMatchObject({ width: outputBounds.width, height: outputBounds.height, logicalOutputBytes, tileCount });
    expect(info.tileCacheEvictions).toBeGreaterThan(0);
  }
  for (const info of [result.first, result.second, result.cached]) {
    expect(info.peakBytes.output).toBeLessThanOrEqual(256);
    expect(info.peakBytes.scratch).toBeLessThanOrEqual(4096);
    expect(info.peakBytes.cache).toBeLessThanOrEqual(2048);
    expect(info.work).toBeLessThanOrEqual(500_000);
  }
  const cachedWidth = outputBounds.width % input.tileSize || input.tileSize;
  const cachedHeight = outputBounds.height % input.tileSize || input.tileSize;
  expect(result.cachedExtent).toEqual({ kind: "finite", rect: {
    x: outputBounds.x + outputBounds.width - cachedWidth,
    y: outputBounds.y + outputBounds.height - cachedHeight,
    width: cachedWidth,
    height: cachedHeight,
  } });
  expect(result.cached).toMatchObject({ tileCount: 1, logicalOutputBytes: cachedWidth * cachedHeight * 4, tileCacheHits: 1, sampleEvaluations: 0 });
  expect(result.checksums).toHaveLength(tileCount * 2 + 1);
  expect(result.checksums.slice(tileCount, tileCount * 2)).toEqual(result.checksums.slice(0, tileCount));
  expect(result.checksums.at(-1)).toBe(result.checksums[tileCount * 2 - 1]);
  expect(result.publishedBytes.slice(0, tileCount).reduce((sum, bytes) => sum + bytes, 0)).toBe(logicalOutputBytes);
  expect(result.publishedBytes.slice(tileCount, tileCount * 2).reduce((sum, bytes) => sum + bytes, 0)).toBe(logicalOutputBytes);
  expect(result.publishedBytes.at(-1)).toBe(cachedWidth * cachedHeight * 4);
});
