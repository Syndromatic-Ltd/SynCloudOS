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

test("real Chromium projects FX-04 image geometry and implicit action presentation at DPR1/2", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const [animation, browser, graphics, host] = await Promise.all([
      import("/src/FX/AnimationFX/public.ts"),
      import("/src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter.ts"),
      import("/src/FX/GraphicsFX/public.ts"),
      import("/src/FX/AnimationFX/host.ts"),
    ]);
    const scheduler = {
      now: () => 0,
      reducedMotion: false,
      suspended: false,
      requestFrame() { return () => {}; },
    };
    const element = document.createElement("div");
    document.body.append(element);
    const layer = host.createAFXLayer(
      new browser.BrowserAnimationLayerSurface(element),
      scheduler,
    );
    layer.frame = { x: 0, y: 0, width: 7, height: 1 };
    layer.contents = new graphics.GFXImage({
      width: 3,
      height: 1,
      alpha: "straight",
      colourSpace: "srgb",
      data: new Uint8Array([
        255, 0, 0, 255,
        0, 255, 0, 255,
        0, 0, 255, 255,
      ]),
    });
    layer.contentsCenter = { x: 1 / 3, y: 0, width: 1 / 3, height: 1 };
    const content = element.querySelector("svg[data-afx-content]")!;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="7" height="1" viewBox="${content.getAttribute("viewBox")}">${content.innerHTML}</svg>`;
    const raster = async (scale: number) => {
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 7 * scale;
      canvas.height = scale;
      const context = canvas.getContext("2d")!;
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return [0, 1, 3, 5, 6].map((x) => [
        ...context.getImageData(x * scale, 0, 1, 1).data,
      ]);
    };
    layer.actions = { opacity: { duration: 0.5, timing: "linear" } };
    layer.opacity = 0.2;
    const initialOpacity = Number(element.style.opacity);
    layer.animationForKey("opacity")?.seek(0.25);
    const midpointOpacity = layer.presentation.opacity;
    const inlineOpacityAtMidpoint = Number(element.style.opacity);
    const nativeAnimationCount = element.getAnimations().length;
    const modelOpacity = layer.model.opacity;
    const actionDuration = layer.actionForKey("opacity")?.duration ?? null;
    layer.dispose();
    element.remove();
    return {
      dpr1: await raster(1),
      dpr2: await raster(2),
      initialOpacity,
      midpointOpacity,
      inlineOpacityAtMidpoint,
      nativeAnimationCount,
      modelOpacity,
      actionDuration,
    };
  });
  const expected = [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 255, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
  ];
  expect(result.dpr1).toEqual(expected);
  expect(result.dpr2).toEqual(expected);
  expect(result.initialOpacity).toBe(1);
  expect(result.midpointOpacity).toBeCloseTo(0.6, 6);
  expect(result.inlineOpacityAtMidpoint).toBeCloseTo(0.6, 6);
  expect(result.nativeAnimationCount).toBeGreaterThan(0);
  expect(result.modelOpacity).toBe(0.2);
  expect(result.actionDuration).toBe(0.5);
});
