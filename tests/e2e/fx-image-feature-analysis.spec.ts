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

test("portable ImageFX feature analysis executes consistently in the real browser runtime", async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/fx-image-feature-analysis-browser.html");
  const result = await page.evaluate(async () => {
    const imageFX = await import("/src/FX/ImageFX/public.ts");
    const graphicsFX = await import("/src/FX/GraphicsFX/public.ts");
    const modelAsset = async (
      id: string,
      purpose: "face-mask" | "text-region-mask",
      weights: readonly number[],
    ) => {
      const storage = new Uint8Array(new Float32Array(weights).buffer);
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", storage));
      return Object.freeze({
        format: "ifx-linear-pixel-v1" as const,
        id,
        version: 1,
        purpose,
        provenance: Object.freeze({ source: "generated browser acceptance fixture", license: "CC0-1.0" }),
        heads: Object.freeze([Object.freeze({ channels: 1 as const, activation: "sigmoid" as const })]),
        data: Object.freeze(Array.from(storage)),
        sha256: Array.from(digest, value => value.toString(16).padStart(2, "0")).join(""),
      });
    };
    const detector = new imageFX.IFXDetector();
    const bytes = new Uint8Array(20 * 16 * 4).fill(255);
    for (let y = 4; y < 12; y++) for (let x = 5; x < 15; x++) {
      const offset = (y * 20 + x) * 4;
      bytes[offset] = 0; bytes[offset + 1] = 0; bytes[offset + 2] = 0;
    }
    const rectangleImage = imageFX.IFXImage.fromPixels(new graphicsFX.GFXImage({ width: 20, height: 16, alpha: "opaque", colourSpace: "srgb", data: bytes }));
    const rectangles = await detector.detect(rectangleImage, { features: ["rectangle"], orientation: "right" });
    const qr = new imageFX.IFXFilterRegistry().create("qrCodeGenerator", {
      message: Array.from(new TextEncoder().encode("SynCloudOS browser FX-14")),
      correctionLevel: "M",
    }).apply();
    const qrFeatures = await detector.detect(qr, { features: ["qr"] });
    let unsupportedName = "";
    try { await detector.detect(qr, { features: ["face"] }); }
    catch (error) { unsupportedName = error instanceof Error ? error.name : "unknown"; }

    const faceModel = await modelAsset("browser-face-mask", "face-mask", [12, 0, 0, 0, -6]);
    const textModel = await modelAsset("browser-text-mask", "text-region-mask", [0, 12, 0, 0, -6]);
    const learnedDetector = new imageFX.IFXDetector({
      backends: [new imageFX.IFXModelAnalysisBackend({
        face: { model: faceModel, threshold: .9, minimumPixels: 4 },
        textRegion: { model: textModel, threshold: .9, minimumPixels: 4 },
      })],
    });
    const learnedBytes = new Uint8Array(10 * 8 * 4);
    for (let index = 0; index < 10 * 8; index++) learnedBytes[index * 4 + 3] = 255;
    for (let y = 1; y < 4; y++) for (let x = 1; x < 4; x++) learnedBytes[(y * 10 + x) * 4] = 255;
    for (let y = 5; y < 7; y++) for (let x = 5; x < 9; x++) learnedBytes[(y * 10 + x) * 4 + 1] = 255;
    const learnedImage = imageFX.IFXImage.fromPixels(new graphicsFX.GFXImage({
      width: 10,
      height: 8,
      alpha: "opaque",
      colourSpace: "srgb",
      data: learnedBytes,
    }));
    const learned = await learnedDetector.detect(learnedImage, { features: ["face", "text-region"] });
    return {
      rectangle: rectangles[0]?.bounds ?? null,
      qrPayload: qrFeatures[0]?.kind === "qr" ? qrFeatures[0].payload : null,
      rectangleCapability: detector.capability("rectangle"),
      faceCapability: detector.capability("face"),
      unsupportedName,
      learnedFaceCapability: learnedDetector.capability("face"),
      learnedTextCapability: learnedDetector.capability("text-region"),
      learnedFace: learned.find(feature => feature.kind === "face")?.bounds ?? null,
      learnedText: learned.find(feature => feature.kind === "text-region")?.bounds ?? null,
    };
  });
  expect(result.rectangle).toEqual({ x: 5, y: 4, width: 10, height: 8 });
  expect(result.qrPayload).toBe("SynCloudOS browser FX-14");
  expect(result.rectangleCapability).toMatchObject({ state: "available", backend: "portable-analysis", version: 1 });
  expect(result.faceCapability).toMatchObject({ state: "unsupported" });
  expect(result.unsupportedName).toBe("IFXUnsupportedAnalysisError");
  expect(result.learnedFaceCapability).toMatchObject({ state: "available", backend: "portable-model-analysis", version: 1 });
  expect(result.learnedTextCapability).toMatchObject({ state: "available", backend: "portable-model-analysis", version: 1 });
  expect(result.learnedFace).toEqual({ x: 1, y: 1, width: 3, height: 3 });
  expect(result.learnedText).toEqual({ x: 5, y: 5, width: 4, height: 2 });
});
