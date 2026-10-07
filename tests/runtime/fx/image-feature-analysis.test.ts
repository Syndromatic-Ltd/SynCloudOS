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
import { GFXImage, type GFXRect } from "../../../src/FX/GraphicsFX/public";
import {
  IFXContext,
  IFXDetector,
  IFXFilterGraph,
  IFXFilterRegistry,
  IFXGraphCodec,
  IFXImage,
  IFXModelAnalysisBackend,
  IFXPortableModelBackend,
  IFXUnsupportedAnalysisError,
  type IFXModelAsset,
  type IFXModelBackend,
} from "../../../src/FX/ImageFX/public";

function rectangleImage(width: number, height: number, rectangles: readonly GFXRect[]): IFXImage {
  const bytes = new Uint8Array(width * height * 4).fill(255);
  for (const rectangle of rectangles) {
    for (let y = rectangle.y; y < rectangle.y + rectangle.height; y++) {
      for (let x = rectangle.x; x < rectangle.x + rectangle.width; x++) {
        const offset = (y * width + x) * 4;
        bytes[offset] = 0;
        bytes[offset + 1] = 0;
        bytes[offset + 2] = 0;
      }
    }
  }
  return IFXImage.fromPixels(new GFXImage({ width, height, alpha: "opaque", colourSpace: "srgb", data: bytes }));
}

function rgbaImage(width: number, height: number, pixels: readonly (readonly [number, number, number, number])[]): IFXImage {
  const bytes = new Uint8Array(width * height * 4);
  pixels.forEach((pixel, index) => {
    const offset = index * 4;
    bytes[offset] = pixel[0];
    bytes[offset + 1] = pixel[1];
    bytes[offset + 2] = pixel[2];
    bytes[offset + 3] = pixel[3];
  });
  return IFXImage.fromPixels(new GFXImage({ width, height, alpha: "straight", colourSpace: "srgb", data: bytes }));
}

function linearHead(channels: 1 | 4, activation: "linear" | "sigmoid", rows: readonly (readonly [number, number, number, number, number])[]) {
  expect(rows).toHaveLength(channels);
  return Object.freeze({ descriptor: Object.freeze({ channels, activation }), floats: rows.flat() });
}

async function modelAsset(options: Readonly<{
  id: string;
  purpose: IFXModelAsset["purpose"];
  heads: IFXModelAsset["heads"];
  floats: readonly number[];
  qualityLevel?: "fast" | "balanced" | "accurate";
}>): Promise<IFXModelAsset> {
  const storage = new ArrayBuffer(options.floats.length * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(storage);
  options.floats.forEach((value, index) => view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, value, true));
  const data = Object.freeze(Array.from(new Uint8Array(storage)));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", storage));
  return Object.freeze({
    format: "ifx-linear-pixel-v1",
    id: options.id,
    version: 1,
    purpose: options.purpose,
    provenance: Object.freeze({ source: `urn:syncloudos:test:${options.id}`, license: "CC0-1.0" }),
    heads: options.heads,
    data,
    sha256: Array.from(digest, value => value.toString(16).padStart(2, "0")).join(""),
    ...(options.qualityLevel ? { qualityLevel: options.qualityLevel } : {}),
  });
}

function iou(a: GFXRect, b: GFXRect): number {
  const left = Math.max(a.x, b.x), top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width), bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  return intersection / (a.width * a.height + b.width * b.height - intersection);
}

describe("ImageFX feature analysis", () => {
  it("reports versioned portable capabilities and never presents unequipped models as empty success", async () => {
    const detector = new IFXDetector();
    expect(detector.capability("rectangle")).toMatchObject({ state: "available", version: 1, backend: "portable-analysis" });
    expect(detector.capability("qr")).toMatchObject({ state: "available", version: 1, backend: "portable-analysis" });
    expect(detector.capability("face")).toMatchObject({ state: "unsupported" });
    expect(detector.capability("text-region")).toMatchObject({ state: "unsupported" });
    expect(detector.capability("person-segmentation")).toMatchObject({ state: "unsupported" });
    expect(detector.capability("saliency-map")).toMatchObject({ state: "unsupported" });
    expect(detector.capability("core-ml-model")).toMatchObject({ state: "unsupported" });
    await expect(detector.detect(rectangleImage(12, 12, []), { features: ["face"] })).rejects.toBeInstanceOf(IFXUnsupportedAnalysisError);
  });

  it("detects multiple controlled rectangles with measured IoU and maps crop/orientation coordinates back to source", async () => {
    const source = rectangleImage(64, 48, [
      { x: 10, y: 8, width: 20, height: 12 },
      { x: 42, y: 30, width: 12, height: 9 },
    ]);
    const detector = new IFXDetector();
    const features = await detector.detect(source, { features: ["rectangle"] });
    expect(features).toHaveLength(2);
    const rectangles = features.filter(feature => feature.kind === "rectangle");
    expect(Math.max(...rectangles.map(feature => iou(feature.bounds, { x: 10, y: 8, width: 20, height: 12 })))).toBeGreaterThanOrEqual(.9);
    expect(Math.max(...rectangles.map(feature => iou(feature.bounds, { x: 42, y: 30, width: 12, height: 9 })))).toBeGreaterThanOrEqual(.9);

    const cropped = await detector.detect(source, {
      features: ["rectangle"],
      crop: { x: 5, y: 3, width: 31, height: 25 },
      orientation: "right",
    });
    expect(cropped).toHaveLength(1);
    expect(cropped[0]?.kind).toBe("rectangle");
    expect(iou(cropped[0]!.bounds, { x: 10, y: 8, width: 20, height: 12 })).toBeGreaterThanOrEqual(.9);

    const partial = await detector.detect(source, {
      features: ["rectangle"],
      crop: { x: 15, y: 5, width: 20, height: 20 },
    });
    expect(partial).toHaveLength(1);
    expect(partial[0]!.bounds).toEqual({ x: 15, y: 8, width: 15, height: 12 });
  });

  it("decodes an actual ImageFX QR graph with exact payload and returns a supported negative as empty", async () => {
    const registry = new IFXFilterRegistry();
    const detector = new IFXDetector();
    const message = "SynCloudOS feature analysis";
    const qr = registry.create("qrCodeGenerator", { message: [...new TextEncoder().encode(message)], correctionLevel: "M" }).apply();
    const results = await detector.detect(qr, { features: ["qr"] });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ kind: "qr", payload: message, confidence: 1 });
    expect(results[0]!.corners.length).toBeGreaterThanOrEqual(3);
    expect(results[0]!.bounds.width).toBeGreaterThan(0);
    expect(results[0]!.bounds.height).toBeGreaterThan(0);

    const negative = await detector.detect(rectangleImage(32, 24, []), { features: ["qr"] });
    expect(negative).toEqual([]);
  });

  it("enforces pixel budgets and cancellation before analysis publishes results", async () => {
    const source = rectangleImage(8, 8, [{ x: 2, y: 2, width: 4, height: 4 }]);
    await expect(new IFXDetector({ maximumPixels: 16 }).detect(source, { features: ["rectangle"] })).rejects.toThrow(/pixel.*budget/i);
    const controller = new AbortController();
    controller.abort();
    await expect(new IFXDetector().detect(source, { features: ["rectangle"], signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("executes hashed portable model filters, preserves them through graph serialization, and rejects tampered assets", async () => {
    const identity = linearHead(4, "linear", [
      [1, 0, 0, 0, 0],
      [0, 1, 0, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 1, 0],
    ]);
    const model = await modelAsset({ id: "identity-rgba", purpose: "image", heads: Object.freeze([identity.descriptor]), floats: identity.floats });
    const source = rgbaImage(2, 1, [[255, 32, 0, 255], [0, 128, 255, 128]]);
    const registry = new IFXFilterRegistry();
    expect(registry.names()).toEqual(expect.arrayContaining(["coreMLModel", "personSegmentation", "saliencyMap"]));
    expect(() => registry.create("coreMLModel", {
      model: Object.freeze({ ...model, provenance: Object.freeze({ source: "", license: "CC0-1.0" }) }),
      headIndex: 0,
      softmaxNormalization: false,
    })).toThrow(/provenance source/i);
    expect(() => registry.create("coreMLModel", {
      model: Object.freeze({ ...model, data: Object.freeze([...model.data, 0]) }),
      headIndex: 0,
      softmaxNormalization: false,
    })).toThrow(/byte length|budget/i);

    const filtered = registry.create("coreMLModel", { model, headIndex: 0, softmaxNormalization: false }).apply(source);
    const encoded = new IFXGraphCodec().encode(new IFXFilterGraph(filtered));
    const roundTripped = new IFXGraphCodec().decode(encoded).output;
    const context = new IFXContext();
    try {
      const rendered = await context.render(roundTripped);
      expect(rendered.image.copyData()).toEqual(new Uint8Array([255, 32, 0, 255, 0, 128, 255, 128]));
    } finally {
      context.dispose();
    }

    const maskHead = linearHead(1, "sigmoid", [[8, 0, 0, 0, -4]]);
    const personModel = await modelAsset({ id: "controlled-person-mask", purpose: "person-segmentation", qualityLevel: "balanced", heads: Object.freeze([maskHead.descriptor]), floats: maskHead.floats });
    const saliencyModel = await modelAsset({ id: "controlled-saliency", purpose: "saliency-map", heads: Object.freeze([maskHead.descriptor]), floats: maskHead.floats });
    const maskSource = rgbaImage(2, 1, [[255, 0, 0, 255], [0, 0, 0, 255]]);
    const maskContext = new IFXContext();
    try {
      const person = await maskContext.render(registry.create("personSegmentation", { model: personModel, qualityLevel: "balanced" }).apply(maskSource));
      const saliency = await maskContext.render(registry.create("saliencyMap", { model: saliencyModel }).apply(maskSource));
      expect(person.image.pixel(0, 0).r).toBeGreaterThan(.97);
      expect(person.image.pixel(1, 0).r).toBeLessThan(.2);
      expect(saliency.image.pixel(0, 0).r).toBeGreaterThan(.97);
      expect(saliency.image.pixel(1, 0).r).toBeLessThan(.2);
    } finally {
      maskContext.dispose();
    }

    const tampered = Object.freeze({ ...model, data: Object.freeze(model.data.map((value, index) => index === 0 ? value ^ 1 : value)) });
    const tamperedContext = new IFXContext();
    try {
      await expect(tamperedContext.render(registry.create("coreMLModel", { model: tampered, headIndex: 0, softmaxNormalization: false }).apply(source))).rejects.toThrow(/hash|integrity/i);
    } finally {
      tamperedContext.dispose();
    }
  });

  it("produces real face and text-region results only when model-backed capabilities are configured", async () => {
    const redMask = linearHead(1, "sigmoid", [[12, 0, 0, 0, -6]]);
    const greenMask = linearHead(1, "sigmoid", [[0, 12, 0, 0, -6]]);
    const faceModel = await modelAsset({ id: "controlled-face", purpose: "face-mask", heads: Object.freeze([redMask.descriptor]), floats: redMask.floats });
    const textModel = await modelAsset({ id: "controlled-text", purpose: "text-region-mask", heads: Object.freeze([greenMask.descriptor]), floats: greenMask.floats });
    const pixels: [number, number, number, number][] = Array.from({ length: 16 * 12 }, () => [0, 0, 0, 255]);
    for (let y = 2; y < 7; y++) for (let x = 2; x < 7; x++) pixels[y * 16 + x] = [255, 0, 0, 255];
    for (let y = 7; y < 10; y++) for (let x = 9; x < 15; x++) pixels[y * 16 + x] = [0, 255, 0, 255];
    const detector = new IFXDetector({ backends: [new IFXModelAnalysisBackend({
      face: { model: faceModel, threshold: .9, minimumPixels: 9 },
      textRegion: { model: textModel, threshold: .9, minimumPixels: 6 },
    })] });

    expect(detector.capability("face")).toMatchObject({
      state: "available",
      backend: "portable-model-analysis",
      version: 1,
      model: { id: faceModel.id, version: faceModel.version, sha256: faceModel.sha256 },
    });
    expect(detector.capability("text-region")).toMatchObject({ state: "available", backend: "portable-model-analysis", version: 1 });
    const source = rgbaImage(16, 12, pixels);
    const results = await detector.detect(source, { features: ["face", "text-region"] });
    const face = results.find(feature => feature.kind === "face");
    const textRegion = results.find(feature => feature.kind === "text-region");
    expect(face?.bounds).toEqual({ x: 2, y: 2, width: 5, height: 5 });
    expect(textRegion?.bounds).toEqual({ x: 9, y: 7, width: 6, height: 3 });
    expect(face?.confidence).toBeGreaterThan(.99);
    expect(textRegion?.confidence).toBeGreaterThan(.99);
    const rotated = await detector.detect(source, { features: ["face", "text-region"], orientation: "right" });
    expect(rotated.find(feature => feature.kind === "face")?.bounds).toEqual({ x: 2, y: 2, width: 5, height: 5 });
    expect(rotated.find(feature => feature.kind === "text-region")?.bounds).toEqual({ x: 9, y: 7, width: 6, height: 3 });
    const negative = await detector.detect(rgbaImage(8, 8, Array.from({ length: 64 }, () => [0, 0, 0, 255] as const)), { features: ["face", "text-region"] });
    expect(negative).toEqual([]);
  });

  it("cancels while a model is loading and never publishes a stale learned result", async () => {
    const mask = linearHead(1, "sigmoid", [[12, 0, 0, 0, -6]]);
    const faceModel = await modelAsset({ id: "delayed-face", purpose: "face-mask", heads: Object.freeze([mask.descriptor]), floats: mask.floats });
    const portable = new IFXPortableModelBackend();
    let release!: () => void;
    let started!: () => void;
    const loadStarted = new Promise<void>(resolve => { started = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    const delayed: IFXModelBackend = Object.freeze({
      id: "delayed-test-model",
      version: 1,
      async load(asset, context) {
        started();
        await hold;
        await context.checkpoint();
        return portable.load(asset, context);
      },
    });
    const detector = new IFXDetector({ backends: [new IFXModelAnalysisBackend({
      backend: delayed,
      face: { model: faceModel, threshold: .9, minimumPixels: 4 },
    })] });
    const controller = new AbortController();
    const pending = detector.detect(rgbaImage(4, 4, Array.from({ length: 16 }, () => [255, 0, 0, 255] as const)), { features: ["face"], signal: controller.signal });
    await loadStarted;
    controller.abort();
    release();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
