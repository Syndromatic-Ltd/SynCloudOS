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

test("extended colour arithmetic stays numeric while browser colour surfaces are capability-probed", async ({ page, browserName }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const graphics = await import("/src/FX/GraphicsFX/public.ts");
    const imageFX = await import("/src/FX/ImageFX/public.ts");
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    let canvasP3 = false;
    try {
      const context = canvas.getContext("2d", { colorSpace: "display-p3" } as CanvasRenderingContext2DSettings);
      canvasP3 = context?.getContextAttributes?.().colorSpace === "display-p3";
    } catch { /* unsupported is an explicit capability result */ }
    let float16ImageData = false;
    try {
      const Float16 = (globalThis as typeof globalThis & { Float16Array?: typeof Float32Array }).Float16Array;
      if (typeof Float16 === "function") {
        const data = new Float16(4);
        float16ImageData = Boolean(new ImageData(data as unknown as Uint8ClampedArray, 1, 1, { colorSpace: "srgb", pixelFormat: "rgba-float16" } as ImageDataSettings));
      }
    } catch { /* unsupported is an explicit capability result */ }
    const source = new graphics.GFXFloatImage({
      width: 1,
      height: 1,
      sampleFormat: "float32",
      alpha: "straight",
      colourSpace: "linear-srgb",
      data: new Float32Array([2, -0.25, 0.5, 1]),
    });
    const image = imageFX.IFXImage.fromPixels(source);
    const sample = new imageFX.IFXSampler(image).sample({ x: 0.5, y: 0.5 }, "nearest");
    const lab = graphics.GFXColourTransform.toLabD50({ r: 1, g: 0, b: 0, a: 1 });
    const restored = graphics.GFXColourTransform.fromLabD50(lab);
    return { canvasP3, float16ImageData, sample, lab, restored };
  });
  expect(result.sample).toEqual({ r: 2, g: -0.25, b: 0.5, a: 1 });
  expect(result.lab.l, `${browserName} Lab L*`).toBeCloseTo(54.2917, 3);
  expect(result.restored.r).toBeCloseTo(1, 4);
  expect(result.restored.g).toBeCloseTo(0, 4);
  expect(result.restored.b).toBeCloseTo(0, 4);
  expect(typeof result.canvasP3).toBe("boolean");
  expect(typeof result.float16ImageData).toBe("boolean");
  console.log(`FX-07 browser capabilities ${browserName}: canvasP3=${result.canvasP3} float16ImageData=${result.float16ImageData}`);
});
