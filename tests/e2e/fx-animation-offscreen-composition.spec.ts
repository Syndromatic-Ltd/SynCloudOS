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

test("real Chromium executes FX-05 portable composition at DPR1/2", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const animation = await import("/src/FX/AnimationFX/public.ts");
    const graphics = await import("/src/FX/GraphicsFX/public.ts");
    const host = await import("/src/FX/AnimationFX/host.ts");
    const scheduler = { now: () => 1, reducedMotion: false, suspended: false, requestFrame: () => () => {} };
    const makeSurface = () => ({
      supportedProperties: ["frame", "opacity", "transform", "backgroundColour", "boxShadow"],
      supportedContentKinds: ["image", "shape", "gradient", "text", "emitter", "tiled"],
      supportsReplication: true,
      apply() {}, attach() {}, detach() {}, setMask() {}, dispose() {},
      createSublayerSurface: makeSurface,
    });
    const makeLayer = (width: number, height: number) => {
      const layer = host.createAFXLayer(makeSurface(), scheduler);
      layer.frame = { x: 0, y: 0, width, height };
      return layer;
    };
    const makeSublayer = (width: number, height: number) => {
      const layer = new animation.AFXLayer();
      layer.frame = { x: 0, y: 0, width, height };
      return layer;
    };
    const root = makeLayer(8, 6);
    const card = makeSublayer(4, 4);
    card.position = { x: 4, y: 3 };
    card.backgroundColour = graphics.GFXColour.rgba(1, 0, 0, 1);
    card.opacity = 0.6;
    root.addSublayer(card);
    const mask = makeSublayer(4, 4);
    mask.position = { x: 2, y: 2 };
    mask.backgroundColour = graphics.GFXColour.rgba(1, 1, 1, 1);
    mask.transform = animation.AFXTransform3D.perspective(70).multiply(animation.AFXTransform3D.rotation(Math.PI / 8, 0, 1, 0));
    card.setMask(mask);
    const render = async (scale: number) => {
      const image = await root.render({ x: 0, y: 0, width: 8, height: 6 }, scale, new AbortController().signal);
      const bytes = image.copyData();
      let alpha = 0, nonzero = 0;
      for (let index = 3; index < bytes.length; index += 4) { alpha += bytes[index]!; if (bytes[index]!) nonzero += 1; }
      return { averageAlpha: alpha / 255 / (image.width * image.height), nonzero };
    };
    const dpr1 = await render(1), dpr2 = await render(2);
    const capability = root.compositionCapability.state;
    mask.dispose(); root.dispose();
    return { capability, dpr1, dpr2 };
  });
  expect(result.capability).toBe("portable-owned");
  expect(result.dpr1.nonzero).toBeGreaterThan(0);
  expect(result.dpr2.nonzero).toBeGreaterThan(result.dpr1.nonzero);
  expect(Math.abs(result.dpr1.averageAlpha - result.dpr2.averageAlpha)).toBeLessThan(0.08);
});
