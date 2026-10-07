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

test("VideoFX processes owned frames in a real browser worker with CPU-parity and timing provenance", async ({ page }, testInfo) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const support = { worker: typeof Worker === "function" };
    if (!support.worker) return { supported: false as const, support, reason: "worker-unavailable" };

    const [video, image, media, adapters] = await Promise.all([
      import("/src/FX/VideoFX/public.ts"),
      import("/src/FX/ImageFX/IFXFilterRegistry.ts"),
      import("/src/FX/MediaFX/public.ts"),
      import("/src/SynCloudOS/VideoFX/VideoWorkerTransport.ts"),
    ]);
    const backend = adapters.createBrowserVideoWorkerTransport("e2e:video-processing", 2);
    if (!backend) return { supported: false as const, support, reason: "worker-backend-unavailable" };

    const format = new video.VFXVideoFormat({
      codedWidth: 8,
      codedHeight: 4,
      pixelFormat: "rgba8",
      colourSpace: "srgb",
      cleanAperture: { x: 1, y: 0, width: 6, height: 4 },
      pixelAspectRatio: { numerator: 4, denominator: 3 },
    });
    const bytes = new Uint8Array(format.byteLength);
    for (let y = 0; y < 4; y += 1) for (let x = 0; x < 8; x += 1) {
      const offset = (y * 8 + x) * 4;
      const value = x < 4 ? 12 : 230;
      bytes.set([value, 40 + y * 20, 160 - x * 10, 255], offset);
    }
    const pixels = new video.VFXPixelBuffer(format, bytes);
    const frame = new video.VFXFrame({
      pixels,
      timing: new media.MEFXSampleTimingInfo({
        presentationTime: media.MEFXTime.finite(9n, 30),
        duration: media.MEFXTime.finite(1n, 30),
      }),
    });
    pixels.close();

    const graph = new video.VFXFrameProcessingGraph(source =>
      new image.IFXFilterRegistry().create("gaussianBlur", { sigma: 1 }).apply(source));
    const cpuProcessor = new video.VFXFrameProcessor({ maximumRetainedBytes: 1 << 20 });
    const workerProcessor = new video.VFXFrameProcessor({ backend, maximumRetainedBytes: 1 << 20 });
    try {
      const cpu = await cpuProcessor.process(frame, graph, { interpolation: "nearest" });
      const worker = await workerProcessor.process(frame, graph, { interpolation: "nearest" });
      try {
        const expected = cpu.frame.copyPixelBuffer().copyData();
        const actual = worker.frame.copyPixelBuffer().copyData();
        let maxDifference = 0;
        for (let index = 0; index < expected.length; index += 1)
          maxDifference = Math.max(maxDifference, Math.abs((expected[index] ?? 0) - (actual[index] ?? 0)));
        const presentation = worker.frame.timing.presentationTime.convertScale(30, "nearest-even").value;
        const duration = worker.frame.timing.duration?.convertScale(30, "nearest-even").value;
        return {
          supported: true as const,
          support,
          backend: worker.diagnostics.backend,
          copyCount: worker.diagnostics.copyCount,
          peakRetainedBytes: worker.diagnostics.peakRetainedBytes,
          maxDifference,
          colourSpace: worker.frame.format.colourSpace,
          cleanAperture: worker.frame.format.cleanAperture,
          pixelAspectRatio: worker.frame.format.pixelAspectRatio,
          presentation: presentation.kind === "finite" ? presentation.value.toString() : null,
          duration: duration?.kind === "finite" ? duration.value.toString() : null,
        };
      } finally {
        cpu.frame.close();
        worker.frame.close();
      }
    } finally {
      frame.close();
      cpuProcessor.dispose();
      workerProcessor.dispose();
    }
  });

  if (!result.supported) {
    testInfo.annotations.push({ type: "capability", description: result.reason });
    expect(result.support.worker).toBe(false);
    return;
  }
  expect(result.backend).toBe("worker-cpu");
  expect(result.maxDifference).toBeLessThanOrEqual(1);
  expect(result.copyCount).toBeLessThanOrEqual(3);
  expect(result.peakRetainedBytes).toBeLessThanOrEqual(1 << 20);
  expect(result.colourSpace).toBe("srgb");
  expect(result.cleanAperture).toEqual({ x: 1, y: 0, width: 6, height: 4 });
  expect(result.pixelAspectRatio).toEqual({ numerator: 4, denominator: 3 });
  expect(result.presentation).toBe("9");
  expect(result.duration).toBe("1");
});
