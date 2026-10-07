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

test("ImageFX real worker retains float source range before byte publication", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const imageFX = await import("/src/FX/ImageFX/public.ts");
    const graphics = await import("/src/FX/GraphicsFX/public.ts");
    const adapters = await import("/src/SynCloudOS/PlatformAdapters/BrowserImageProcessingWorker.ts");
    const backend = adapters.createBrowserImageProcessingWorkerBackend();
    if (!backend) return { supported: false };
    const context = new imageFX.IFXContext();
    try {
      const source = imageFX.IFXImage.fromPixels(new graphics.GFXFloatImage({
        width: 1, height: 1, sampleFormat: "float32", alpha: "straight", colourSpace: "linear-srgb",
        data: new Float32Array([2, -0.25, 0.5, 1]),
      }));
      const kernel = new imageFX.IFXColourKernel([
        { op: "sample", input: 0 },
        { op: "constant", value: [0.25, 0.25, 0.25, 1] },
        { op: "multiply", left: 0, right: 1 },
      ], 2);
      const output = kernel.apply(source);
      const cpuDestination = new imageFX.IFXRenderDestination(output.extent, "linear-srgb", "straight");
      const workerDestination = new imageFX.IFXRenderDestination(output.extent, "linear-srgb", "straight");
      const cpu = await context.render(output, cpuDestination);
      const worker = await backend.render(output, workerDestination);
      return {
        supported: true,
        backend: worker.info.backend,
        sampleFormats: backend.capabilities.sampleFormats,
        cpu: Array.from(cpu.image.copyData()),
        worker: Array.from(worker.image.copyData()),
      };
    } finally {
      backend.dispose();
      context.dispose();
    }
  });
  expect(result).toMatchObject({ supported: true, backend: "worker-cpu" });
  if ("worker" in result && "cpu" in result) {
    expect(result.sampleFormats).toContain("float32");
    expect(result.worker).toEqual(result.cpu);
    expect(result.worker[0]).toBeGreaterThan(100);
  }
});

test("ImageFX executes in a real browser worker with explicit destination capabilities", async ({ page, browserName }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const imageFX = await import("/src/FX/ImageFX/public.ts");
    const graphics = await import("/src/FX/GraphicsFX/public.ts");
    const adapters = await import("/src/SynCloudOS/PlatformAdapters/BrowserImageProcessingWorker.ts");
    const support = {
      worker: typeof Worker === "function",
      offscreenCanvas: typeof OffscreenCanvas === "function",
      webgpu: typeof navigator !== "undefined" && "gpu" in navigator,
    };
    const backend = adapters.createBrowserImageProcessingWorkerBackend();
    if (!backend) return { support, backend: null };

    try {
      const source = imageFX.IFXImage.fromPixels(new graphics.GFXImage({
        width: 2,
        height: 1,
        alpha: "straight",
        colourSpace: "srgb",
        data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]),
      }));
      const destination = new imageFX.IFXRenderDestination(source.extent);
      const rendered = await backend.render(source, destination, { interpolation: "nearest" });
      const png = await backend.renderEncoded(source, { format: "image/png", colourSpace: "srgb", orientation: "up" });
      let webp: { type: string; size: number } | null = null;
      if (backend.capabilities.encodedMimeTypes.includes("image/webp")) {
        const encoded = await backend.renderEncoded(source, { format: "image/webp", colourSpace: "srgb", orientation: "up" });
        webp = { type: encoded.blob.type, size: encoded.blob.size };
      }
      let canvas: unknown = null;
      if (backend.capabilities.destinations.includes("offscreen-canvas")) {
        canvas = await backend.renderToOffscreenCanvas(source, new OffscreenCanvas(2, 1));
      }
      const fx13Source = imageFX.IFXImage.fromPixels(new graphics.GFXImage({
        width: 2,
        height: 1,
        alpha: "straight",
        colourSpace: "linear-srgb",
        data: new Uint8Array([64, 128, 192, 128, 192, 96, 32, 255]),
      }));
      const fx13Image = new imageFX.IFXFilterRegistry().create("colorCrossPolynomial", {
        redCoefficients: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
        greenCoefficients: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
        blueCoefficients: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
      }).apply(fx13Source);
      const cpuContext = new imageFX.IFXContext("linear-srgb", 20_000);
      let fx13: { cpu: number[]; worker: number[]; backend: string };
      let geometry: { cpu: number[]; worker: number[]; backend: string; extent: unknown };
      let tile: { cpu: number[]; worker: number[]; backend: string; extent: unknown };
      let transition: { cpu: number[]; worker: number[]; backend: string; extent: unknown };
      let procedural: { cpu: number[]; worker: number[]; backend: string; extent: unknown };
      let learned: { cpu: number[]; worker: number[]; backend: string };
      try {
        const cpuDestination = new imageFX.IFXRenderDestination(fx13Image.extent, "linear-srgb", "straight");
        const workerDestination = new imageFX.IFXRenderDestination(fx13Image.extent, "linear-srgb", "straight");
        const cpu = await cpuContext.render(fx13Image, cpuDestination, { interpolation: "nearest" });
        const worker = await backend.render(fx13Image, workerDestination, { interpolation: "nearest" });
        fx13 = { cpu: Array.from(cpu.image.copyData()), worker: Array.from(worker.image.copyData()), backend: worker.info.backend };
        const geometryImage = new imageFX.IFXFilterRegistry().create("bicubicScaleTransform", {
          scale: 2,
          aspectRatio: 1,
          parameterB: 1 / 3,
          parameterC: 1 / 3,
        }).apply(fx13Source);
        const geometryCpuDestination = new imageFX.IFXRenderDestination(geometryImage.extent, "linear-srgb", "straight");
        const geometryWorkerDestination = new imageFX.IFXRenderDestination(geometryImage.extent, "linear-srgb", "straight");
        const geometryCpu = await cpuContext.render(geometryImage, geometryCpuDestination, { interpolation: "nearest" });
        const geometryWorker = await backend.render(geometryImage, geometryWorkerDestination, { interpolation: "nearest" });
        geometry = {
          cpu: Array.from(geometryCpu.image.copyData()),
          worker: Array.from(geometryWorker.image.copyData()),
          backend: geometryWorker.info.backend,
          extent: geometryImage.extent,
        };
        const tileImage = new imageFX.IFXFilterRegistry().create("fourfoldReflectedTile", {
          acuteAngle: Math.PI / 2,
          angle: 0,
          center: { x: 0, y: 0 },
          width: 2,
        }).apply(fx13Source);
        const tileExtent = { kind: "finite" as const, rect: { x: -2, y: -1, width: 4, height: 2 } };
        const tileCpuDestination = new imageFX.IFXRenderDestination(tileExtent, "linear-srgb", "straight");
        const tileWorkerDestination = new imageFX.IFXRenderDestination(tileExtent, "linear-srgb", "straight");
        const tileCpu = await cpuContext.render(tileImage, tileCpuDestination, { interpolation: "nearest" });
        const tileWorker = await backend.render(tileImage, tileWorkerDestination, { interpolation: "nearest" });
        tile = {
          cpu: Array.from(tileCpu.image.copyData()),
          worker: Array.from(tileWorker.image.copyData()),
          backend: tileWorker.info.backend,
          extent: tileImage.extent,
        };
        const transitionTarget = imageFX.IFXImage.fromPixels(new graphics.GFXImage({
          width: 2,
          height: 1,
          alpha: "straight",
          colourSpace: "linear-srgb",
          data: new Uint8Array([0, 0, 255, 255, 255, 255, 0, 255]),
        }));
        const transitionImage = new imageFX.IFXFilterRegistry().create("barsSwipe", {
          time: .55,
          angle: 0,
          barOffset: .35,
          width: 1,
        }).apply(fx13Source, transitionTarget);
        const transitionCpuDestination = new imageFX.IFXRenderDestination(transitionImage.extent, "linear-srgb", "straight");
        const transitionWorkerDestination = new imageFX.IFXRenderDestination(transitionImage.extent, "linear-srgb", "straight");
        const transitionCpu = await cpuContext.render(transitionImage, transitionCpuDestination, { interpolation: "nearest" });
        const transitionWorker = await backend.render(transitionImage, transitionWorkerDestination, { interpolation: "nearest" });
        transition = {
          cpu: Array.from(transitionCpu.image.copyData()),
          worker: Array.from(transitionWorker.image.copyData()),
          backend: transitionWorker.info.backend,
          extent: transitionImage.extent,
        };
        const proceduralImage = new imageFX.IFXFilterRegistry().create("pointillize", {
          center: { x: 0, y: 0 },
          radius: 1,
          seed: 90210,
        }).apply(fx13Source);
        const proceduralCpuDestination = new imageFX.IFXRenderDestination(proceduralImage.extent, "linear-srgb", "straight");
        const proceduralWorkerDestination = new imageFX.IFXRenderDestination(proceduralImage.extent, "linear-srgb", "straight");
        const proceduralCpu = await cpuContext.render(proceduralImage, proceduralCpuDestination, { interpolation: "nearest" });
        const proceduralWorker = await backend.render(proceduralImage, proceduralWorkerDestination, { interpolation: "nearest" });
        procedural = {
          cpu: Array.from(proceduralCpu.image.copyData()),
          worker: Array.from(proceduralWorker.image.copyData()),
          backend: proceduralWorker.info.backend,
          extent: proceduralImage.extent,
        };
        const modelStorage = new Uint8Array(new Float32Array([12, 0, 0, 0, -6]).buffer);
        const modelDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", modelStorage));
        const personModel = Object.freeze({
          format: "ifx-linear-pixel-v1" as const,
          id: "worker-person-mask",
          version: 1,
          purpose: "person-segmentation" as const,
          provenance: Object.freeze({ source: "generated worker acceptance fixture", license: "CC0-1.0" }),
          heads: Object.freeze([Object.freeze({ channels: 1 as const, activation: "sigmoid" as const })]),
          data: Object.freeze(Array.from(modelStorage)),
          sha256: Array.from(modelDigest, value => value.toString(16).padStart(2, "0")).join(""),
          qualityLevel: "balanced" as const,
        });
        const learnedImage = new imageFX.IFXFilterRegistry().create("personSegmentation", {
          model: personModel,
          qualityLevel: "balanced",
        }).apply(fx13Source);
        const learnedCpuDestination = new imageFX.IFXRenderDestination(learnedImage.extent, "linear-srgb", "straight");
        const learnedWorkerDestination = new imageFX.IFXRenderDestination(learnedImage.extent, "linear-srgb", "straight");
        const learnedCpu = await cpuContext.render(learnedImage, learnedCpuDestination, { interpolation: "nearest" });
        const learnedWorker = await backend.render(learnedImage, learnedWorkerDestination, { interpolation: "nearest" });
        learned = {
          cpu: Array.from(learnedCpu.image.copyData()),
          worker: Array.from(learnedWorker.image.copyData()),
          backend: learnedWorker.info.backend,
        };
      } finally {
        cpuContext.dispose();
      }
      return {
        support,
        backend: {
          capabilities: backend.capabilities,
          pixels: Array.from(rendered.image.copyData()),
          published: destination.image ? Array.from(destination.image.copyData()) : null,
          infoBackend: rendered.info.backend,
          png: { type: png.blob.type, size: png.blob.size, metadata: png.metadata },
          webp,
          canvas,
          fx13,
          geometry,
          tile,
          transition,
          procedural,
          learned,
        },
      };
    } finally {
      backend.dispose();
    }
  });

  expect(result.support.worker, `${browserName} Worker support`).toBe(true);
  expect(result.backend).not.toBeNull();
  expect(result.backend?.capabilities.kind).toBe("worker-cpu");
  expect(result.backend?.capabilities.accelerated).toBe(false);
  expect(result.backend?.pixels).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  expect(result.backend?.published).toEqual(result.backend?.pixels);
  expect(result.backend?.infoBackend).toBe("worker-cpu");
  expect(result.backend?.fx13.backend).toBe("worker-cpu");
  expect(result.backend?.fx13.worker).toEqual(result.backend?.fx13.cpu);
  expect(result.backend?.geometry.backend).toBe("worker-cpu");
  expect(result.backend?.geometry.worker).toEqual(result.backend?.geometry.cpu);
  expect(result.backend?.geometry.extent).toEqual({ kind: "finite", rect: { x: 0, y: 0, width: 4, height: 2 } });
  expect(result.backend?.tile.backend).toBe("worker-cpu");
  expect(result.backend?.tile.worker).toEqual(result.backend?.tile.cpu);
  expect(result.backend?.tile.extent).toEqual({ kind: "infinite" });
  expect(result.backend?.transition.backend).toBe("worker-cpu");
  expect(result.backend?.transition.worker).toEqual(result.backend?.transition.cpu);
  expect(result.backend?.transition.extent).toEqual({ kind: "finite", rect: { x: 0, y: 0, width: 2, height: 1 } });
  expect(result.backend?.procedural.backend).toBe("worker-cpu");
  expect(result.backend?.procedural.worker).toEqual(result.backend?.procedural.cpu);
  expect(result.backend?.procedural.extent).toEqual({ kind: "finite", rect: { x: 0, y: 0, width: 2, height: 1 } });
  expect(result.backend?.learned.backend).toBe("worker-cpu");
  expect(result.backend?.learned.worker).toEqual(result.backend?.learned.cpu);
  expect(result.backend?.learned.worker[0]).toBeLessThan(20);
  expect(result.backend?.learned.worker[4]).toBeGreaterThan(240);
  expect(result.backend?.png.type).toBe("image/png");
  expect(result.backend?.png.size).toBeGreaterThan(8);
  expect(result.backend?.png.metadata).toEqual({ width: 2, height: 1, mimeType: "image/png", colourSpace: "srgb", orientation: "up" });
  if (result.backend?.capabilities.encodedMimeTypes.includes("image/webp")) {
    expect(result.backend.webp?.type).toBe("image/webp");
    expect(result.backend.webp?.size).toBeGreaterThan(0);
  } else {
    expect(result.backend?.webp).toBeNull();
  }
  if (result.backend?.capabilities.destinations.includes("offscreen-canvas")) {
    expect(result.backend.canvas).toEqual({ width: 2, height: 1, colourSpace: "srgb", orientation: "up" });
  }
});

test("a persisted parameterized custom processor executes in the real ImageFX worker", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const imageFX = await import("/src/FX/ImageFX/public.ts");
    const graphics = await import("/src/FX/GraphicsFX/public.ts");
    const { createBrowserImageProcessingWorkerBackend } = await import("/src/SynCloudOS/PlatformAdapters/BrowserImageProcessingWorker.ts");
    const backend = createBrowserImageProcessingWorkerBackend();
    if (!backend) throw new Error("Browser worker backend is unavailable.");
    try {
      const source = imageFX.IFXImage.fromPixels(new graphics.GFXImage({
        width: 1, height: 1, alpha: "straight", colourSpace: "linear-srgb",
        data: new Uint8Array([64, 32, 16, 255]),
      }));
      const processor = new imageFX.IFXProcessorDefinition({
        id: "custom:browserGain", version: 1, inputCount: 1,
        parameters: { gain: { type: "number", default: 1, minimum: 0, maximum: 4 } },
        output: { kind: "first-input" }, roi: { kind: "identity" },
        portableProgram: { kind: "kernel", version: 1, program: { inputCount: 1, instructions: [
          { op: "sample", input: 0 }, { op: "constant", value: [1, 1, 1, 1] }, { op: "multiply", left: 0, right: 1 },
        ], output: 2 }, bindings: [{ parameter: "gain", instruction: 1, components: [0, 1, 2] }] },
        evaluate(point, access, parameters) {
          const sample = access.sample(0, point);
          return { r: sample.r * parameters.gain, g: sample.g * parameters.gain, b: sample.b * parameters.gain, a: sample.a };
        },
      });
      const wire = JSON.parse(JSON.stringify(new imageFX.IFXGraphCodec().encode(new imageFX.IFXFilterGraph(processor.apply({ gain: 1.5 }, source)))));
      const restored = new imageFX.IFXGraphCodec().decode(wire).output;
      const destination = new imageFX.IFXRenderDestination(restored.extent, "linear-srgb", "straight");
      const cpu = await new imageFX.IFXContext("linear-srgb").render(restored, new imageFX.IFXRenderDestination(restored.extent, "linear-srgb", "straight"));
      const worker = await backend.render(restored, destination);
      return { serializedCallback: JSON.stringify(wire).includes("evaluate"), backend: worker.info.backend, cpu: Array.from(cpu.image.copyData()), worker: Array.from(worker.image.copyData()) };
    } finally {
      backend.dispose();
    }
  });
  expect(result.serializedCallback).toBe(false);
  expect(result.backend).toBe("worker-cpu");
  expect(result.worker).toEqual(result.cpu);
  expect(result.worker[0]).toBeGreaterThan(64);
});
