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
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

test.use({
  launchOptions: {
    args: ["--enable-unsafe-webgpu", "--enable-unsafe-swiftshader"],
  },
});

test("ImageFX advertises acceleration only after a real WebGPU device executes the tested matrix", async ({ page, browserName }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const imageFX = await import("/src/FX/ImageFX/public.ts");
    const graphics = await import("/src/FX/GraphicsFX/public.ts");
    const adapters = await import("/src/SynCloudOS/PlatformAdapters/BrowserWebGPUImageProcessingBackend.ts");
    const support = { webgpu: typeof navigator !== "undefined" && "gpu" in navigator };
    const backend = await adapters.createBrowserWebGPUImageProcessingBackend();
    if (!backend) return { support, backend: null };
    try {
      const source = imageFX.IFXImage.fromPixels(new graphics.GFXImage({
        width: 2,
        height: 1,
        alpha: "straight",
        colourSpace: "linear-srgb",
        data: new Uint8Array([64, 96, 128, 255, 16, 32, 48, 128]),
      }));
      const registry = new imageFX.IFXFilterRegistry();
      const invert = registry.create("invert", {}).apply(source);
      const invertDestination = new imageFX.IFXRenderDestination(invert.extent, "linear-srgb", "straight");
      const acceleratedInvert = await backend.render(invert, invertDestination);
      const cpuInvertDestination = new imageFX.IFXRenderDestination(invert.extent, "linear-srgb", "straight");
      const cpuInvert = await new imageFX.IFXContext("linear-srgb").render(invert, cpuInvertDestination);

      const exposure = registry.create("exposure", { ev: 1 }).apply(source);
      const exposureDestination = new imageFX.IFXRenderDestination(exposure.extent, "linear-srgb", "straight");
      const acceleratedExposure = await backend.render(exposure, exposureDestination);
      const cpuExposureDestination = new imageFX.IFXRenderDestination(exposure.extent, "linear-srgb", "straight");
      const cpuExposure = await new imageFX.IFXContext("linear-srgb").render(exposure, cpuExposureDestination);

      const sepia = registry.create("sepia", { intensity: 1 }).apply(source);
      return {
        support,
        backend: {
          capabilities: backend.capabilities,
          invert: Array.from(acceleratedInvert.image.copyData()),
          invertCpu: Array.from(cpuInvert.image.copyData()),
          exposure: Array.from(acceleratedExposure.image.copyData()),
          exposureCpu: Array.from(cpuExposure.image.copyData()),
          invertPublished: invertDestination.image ? Array.from(invertDestination.image.copyData()) : null,
          infoBackends: [acceleratedInvert.info.backend, acceleratedExposure.info.backend],
          rejectsSepia: !backend.canRender(sepia, new imageFX.IFXRenderDestination(sepia.extent, "linear-srgb", "straight")),
        },
      };
    } finally {
      backend.dispose();
    }
  });

  const receiptPath = resolve(process.cwd(), ".artifacts/expanded-fx/fx11/webgpu-browser.json");
  mkdirSync(resolve(receiptPath, ".."), { recursive: true });
  writeFileSync(receiptPath, JSON.stringify({ browserName, ...result }, null, 2) + "\n");

  if (!result.backend) {
    test.info().annotations.push({ type: "webgpu", description: `${browserName}: navigator.gpu=${result.support.webgpu}; adapter/device unavailable` });
    return;
  }

  expect(result.support.webgpu).toBe(true);
  expect(result.backend.capabilities).toMatchObject({
    kind: "accelerated",
    accelerated: true,
    pixelFormats: ["rgba8"],
    colourSpaces: ["linear-srgb"],
    alphaFormats: ["straight"],
    builtinOperations: ["exposure", "invert"],
  });
  expect(result.backend.infoBackends).toEqual(["accelerated", "accelerated"]);
  expect(result.backend.invert).toEqual(result.backend.invertCpu);
  expect(result.backend.exposure).toEqual(result.backend.exposureCpu);
  expect(result.backend.invertPublished).toEqual(result.backend.invert);
  expect(result.backend.rejectsSepia).toBe(true);
});
