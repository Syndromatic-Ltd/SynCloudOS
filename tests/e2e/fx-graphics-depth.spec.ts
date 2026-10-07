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

test("real Chromium rasterizes an isolated recorded group once at DPR1 and DPR2", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const [{ GFXContext }, { GFXColour }, { GFXPath }, { createOwnedGFXIdentifierIssuer }] = await Promise.all([
      import("/src/FX/GraphicsFX/GFXContext.ts"),
      import("/src/FX/GraphicsFX/GFXColour.ts"),
      import("/src/FX/GraphicsFX/GFXPath.ts"),
      import("/src/FX/GraphicsFX/identifierAuthority.ts"),
    ]);
    let id = 0;
    const context = GFXContext.recording({ size: { width: 8, height: 4 }, scale: 2, identifiers: createOwnedGFXIdentifierIssuer(() => () => `browser${++id}`) });
    const group = context.beginTransparencyGroup({ alpha: 0.5 });
    context.setFill(GFXColour.rgba(1, 0, 0)); context.fill(GFXPath.rect({ x: 0, y: 0, width: 5, height: 4 }));
    context.setFill(GFXColour.rgba(0, 1, 0)); context.fill(GFXPath.rect({ x: 3, y: 0, width: 5, height: 4 }));
    context.endTransparencyGroup(group);
    const svg = context.toSVG();
    const raster = async (scale: number) => {
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = 8 * scale; canvas.height = 4 * scale;
      const drawing = canvas.getContext("2d")!; drawing.clearRect(0, 0, canvas.width, canvas.height); drawing.drawImage(image, 0, 0, canvas.width, canvas.height);
      return [...drawing.getImageData(Math.floor(4 * scale), Math.floor(2 * scale), 1, 1).data];
    };
    return { dpr1: await raster(1), dpr2: await raster(2), device: context.convertPointToDeviceSpace({ x: 1, y: 1 }), groupMarkup: svg.includes("data-gfx-transparency-group") };
  });
  expect(result.groupMarkup).toBe(true);
  expect(result.device).toEqual({ x: 2, y: 2 });
  expect(result.dpr1[3]).toBeGreaterThanOrEqual(127); expect(result.dpr1[3]).toBeLessThanOrEqual(128);
  expect(result.dpr2[3]).toBeGreaterThanOrEqual(127); expect(result.dpr2[3]).toBeLessThanOrEqual(128);
});
