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

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GFXColour, GFXPath } from "../../../src/FX/GraphicsFX/public";
import { IFXFilterRegistry } from "../../../src/FX/ImageFX/public";
import { MEFXSampleTimingInfo, MEFXTime } from "../../../src/FX/MediaFX/public";
import { TFXAttributedString, TFXFont, TFXFontDescriptor, TFXTypesetter } from "../../../src/FX/TextFX/public";
import {
  VFXFrame,
  VFXFrameProcessingGraph,
  VFXFrameProcessor,
  VFXPixelBuffer,
  VFXVideoFormat,
} from "../../../src/FX/VideoFX/public";
import {
  VideoWorkerTransport,
  type VFXVideoWorkerRequest,
  type VFXVideoWorkerResponse,
} from "../../../src/SynCloudOS/VideoFX/VideoWorkerTransport";
import { createMountedVideoClient } from "../../../src/SynCloudOS/AppSDK/mountedVideoClient";
import { BrowserVideoCaptureAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserVideoCaptureAdapter";
import { VideoCaptureService } from "../../../src/SynCloudOS/VideoFX/VideoCaptureService";

function sourceFrame(): VFXFrame {
  const format = new VFXVideoFormat({
    codedWidth: 4,
    codedHeight: 4,
    pixelFormat: "rgba8",
    colourSpace: "srgb",
    cleanAperture: { x: 1, y: 1, width: 2, height: 2 },
    pixelAspectRatio: { numerator: 4, denominator: 3 },
  });
  const data = new Uint8Array(format.byteLength);
  for (let index = 0; index < data.length; index += 4) data.set([32, 64, 96, 255], index);
  const pixels = new VFXPixelBuffer(format, data);
  try {
    return new VFXFrame({
      pixels,
      timing: new MEFXSampleTimingInfo({
        presentationTime: MEFXTime.finite(123_456n, 1_000_000),
        duration: MEFXTime.finite(33_333n, 1_000_000),
      }),
    });
  } finally { pixels.close(); }
}

function stepFrame(): VFXFrame {
  const format = new VFXVideoFormat({ codedWidth: 8, codedHeight: 4, pixelFormat: "rgba8", colourSpace: "srgb" });
  const data = new Uint8Array(format.byteLength);
  for (let y = 0; y < 4; y += 1) for (let x = 0; x < 8; x += 1) {
    const offset = (y * 8 + x) * 4;
    const value = x < 4 ? 0 : 255;
    data.set([value, value, value, 255], offset);
  }
  const pixels = new VFXPixelBuffer(format, data);
  try {
    return new VFXFrame({
      pixels,
      timing: new MEFXSampleTimingInfo({
        presentationTime: MEFXTime.finite(9n, 30),
        duration: MEFXTime.finite(1n, 30),
      }),
    });
  } finally { pixels.close(); }
}

class FakeWorker {
  readonly posts: Array<{ message: VFXVideoWorkerRequest; transfer: readonly Transferable[] }> = [];
  readonly messages = new Set<(event: MessageEvent<VFXVideoWorkerResponse>) => void>();
  readonly errors = new Set<(event: ErrorEvent) => void>();
  terminated = 0;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === "message") this.messages.add(listener as (event: MessageEvent<VFXVideoWorkerResponse>) => void);
    if (type === "error") this.errors.add(listener as (event: ErrorEvent) => void);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === "message") this.messages.delete(listener as (event: MessageEvent<VFXVideoWorkerResponse>) => void);
    if (type === "error") this.errors.delete(listener as (event: ErrorEvent) => void);
  }
  postMessage(message: VFXVideoWorkerRequest, transfer: readonly Transferable[] = []) { this.posts.push({ message, transfer }); }
  terminate() { this.terminated += 1; }
  respond(response: VFXVideoWorkerResponse) { for (const listener of this.messages) listener({ data: response } as MessageEvent<VFXVideoWorkerResponse>); }
  fail(message = "video worker crashed") { for (const listener of this.errors) listener({ message, error: new Error(message) } as ErrorEvent); }
}

function workerPixelResponse(request: Extract<VFXVideoWorkerRequest, { operation: "render-pixels" }>, value = 223): VFXVideoWorkerResponse {
  const data = new Uint8Array(request.destination.bounds.width * request.destination.bounds.height * 4).fill(value);
  return {
    ownerId: request.ownerId,
    generation: request.generation,
    id: request.id,
    ok: true,
    value: {
      image: { width: 4, height: 4, bytesPerRow: 16, pixelFormat: "rgba8", alpha: "straight", colourSpace: "srgb", data: data.buffer },
      info: { width: 4, height: 4, sampleEvaluations: 16, cacheHits: 0, backend: "worker-cpu", tileCount: 1, logicalOutputBytes: 64, peakBytes: { output: 64, scratch: 0, cache: 0 }, work: 16, globalPreparationCount: 0, tileCacheHits: 0, tileCacheEvictions: 0 },
    },
  };
}

describe("VFX frame processing", () => {
  it("runs an ImageFX graph while preserving timing, aperture, aspect and colour metadata", async () => {
    const frame = sourceFrame();
    const graph = new VFXFrameProcessingGraph(source => new IFXFilterRegistry().create("invert", {}).apply(source));
    const processor = new VFXFrameProcessor({ maximumRetainedBytes: 4096 });
    const result = await processor.process(frame, graph);
    expect(result.frame.timing).toBe(frame.timing);
    expect(result.frame.format.cleanAperture).toEqual(frame.format.cleanAperture);
    expect(result.frame.format.pixelAspectRatio).toEqual({ numerator: 4, denominator: 3 });
    expect(result.frame.format.colourSpace).toBe("srgb");
    expect([...result.frame.copyPixelBuffer().copyData().slice(0, 4)]).toEqual([253, 249, 241, 255]);
    expect(result.diagnostics.backend).toBe("cpu");
    expect(result.diagnostics.peakRetainedBytes).toBeLessThanOrEqual(4096);
    expect(frame.closed).toBe(false);
    result.frame.close(); frame.close(); processor.dispose();
  });

  it("makes input ownership explicit with transfer mode", async () => {
    const frame = sourceFrame();
    const processor = new VFXFrameProcessor();
    const result = await processor.process(frame, VFXFrameProcessingGraph.identity(), { ownership: "transfer" });
    expect(frame.closed).toBe(true);
    expect(result.frame.closed).toBe(false);
    result.frame.close(); processor.dispose();
  });

  it("bridges GraphicsFX drawing without changing frame timing", () => {
    const frame = sourceFrame();
    const processor = new VFXFrameProcessor();
    const result = processor.draw(frame, context => {
      context.fillPath(GFXPath.rect({ x: 0, y: 0, width: 2, height: 2 }), GFXColour.rgba(1, 0, 0, 1));
    });
    expect(result.frame.timing).toBe(frame.timing);
    expect([...result.frame.copyPixelBuffer().copyData().slice(0, 4)]).toEqual([255, 0, 0, 255]);
    result.frame.close(); frame.close(); processor.dispose();
  });

  it("bridges TextFX shaped glyph geometry into video frames", async () => {
    const font = await TFXFont.create(
      new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf")),
      new TFXFontDescriptor({ size: 3 }),
    );
    const line = new TFXTypesetter(new TFXAttributedString("FX", [{ start: 0, end: 2, font }])).createLine(0, 2);
    const frame = sourceFrame();
    const processor = new VFXFrameProcessor();
    const result = processor.drawText(frame, line, { origin: { x: 0, y: 3 }, colour: GFXColour.rgba(1, 1, 1, 1) });
    expect(result.diagnostics.glyphCount).toBeGreaterThan(0);
    expect(result.frame.timing).toBe(frame.timing);
    expect(result.frame.copyPixelBuffer().copyData()).not.toEqual(frame.copyPixelBuffer().copyData());
    result.frame.close(); frame.close(); processor.dispose(); font.dispose();
  });

  it("matches full-frame processing across tiled seams for an effect whose kernel crosses tile boundaries", async () => {
    const frame = stepFrame();
    const graph = new VFXFrameProcessingGraph(source => new IFXFilterRegistry().create("gaussianBlur", { sigma: 1 }).apply(source));
    const processor = new VFXFrameProcessor({ maximumRetainedBytes: 1 << 20 });
    const full = await processor.process(frame, graph, { interpolation: "nearest" });
    const tiled = await processor.processTiled(frame, graph, {
      interpolation: "nearest",
      tileSize: 2,
      budgets: { outputBytes: 16, scratchBytes: 4096, cacheBytes: 4096, work: 1 << 20 },
    });
    const expected = full.frame.copyPixelBuffer().copyData();
    const actual = tiled.frame.copyPixelBuffer().copyData();
    expect(tiled.diagnostics.tileCount).toBe(8);
    expect(actual).toHaveLength(expected.length);
    for (let index = 0; index < expected.length; index += 1)
      expect(Math.abs((actual[index] ?? 0) - (expected[index] ?? 0))).toBeLessThanOrEqual(1);
    tiled.frame.close(); full.frame.close(); frame.close(); processor.dispose();
  });

  it("propagates shared ImageFX accelerated device loss without publishing output and honours transferred input ownership", async () => {
    const adapters = await import("../../../src/SynCloudOS/PlatformAdapters/BrowserWebGPUImageProcessingBackend");
    let resolveLost!: (value: Readonly<{ reason?: string; message?: string }>) => void;
    const backend = new adapters.BrowserWebGPUImageProcessingBackend({
      lost: new Promise(resolve => { resolveLost = resolve; }),
      execute: () => new Promise<Uint8Array>(() => undefined),
      dispose() {},
    });
    const format = new VFXVideoFormat({ codedWidth: 4, codedHeight: 4, pixelFormat: "rgba8", colourSpace: "linear-srgb" });
    const pixels = new VFXPixelBuffer(format, new Uint8Array(format.byteLength).fill(96));
    const frame = new VFXFrame({
      pixels,
      timing: new MEFXSampleTimingInfo({
        presentationTime: MEFXTime.finite(123_456n, 1_000_000),
        duration: MEFXTime.finite(33_333n, 1_000_000),
      }),
    });
    pixels.close();
    const graph = new VFXFrameProcessingGraph(source => new IFXFilterRegistry().create("invert", {}).apply(source));
    const processor = new VFXFrameProcessor({ backend });
    const pending = processor.process(frame, graph, { ownership: "transfer" });
    expect(frame.closed).toBe(true);
    resolveLost({ reason: "unknown", message: "simulated video processing loss" });
    await expect(pending).rejects.toMatchObject({
      name: "AbortError",
      message: expect.stringContaining("simulated video processing loss"),
    });
    processor.dispose();
  });
});

describe("VideoWorkerTransport", () => {
  it("carries owner, generation and operation identity and ignores stale replies", async () => {
    const worker = new FakeWorker();
    const transport = new VideoWorkerTransport(worker as unknown as Worker, { ownerId: "app:video", maximumOutstanding: 2 });
    const frame = sourceFrame();
    const graph = new VFXFrameProcessingGraph(source => new IFXFilterRegistry().create("invert", {}).apply(source));
    const processor = new VFXFrameProcessor({ backend: transport });
    const pending = processor.process(frame, graph);
    const request = worker.posts[0]?.message;
    expect(request).toMatchObject({ ownerId: "app:video", generation: 1, id: 1, operation: "render-pixels" });
    if (!request || request.operation !== "render-pixels") throw new Error("expected render request");
    worker.respond({ ...workerPixelResponse(request), generation: 0 });
    expect(worker.posts).toHaveLength(1);
    worker.respond(workerPixelResponse(request));
    const result = await pending;
    expect(result.diagnostics.backend).toBe("worker-cpu");
    result.frame.close(); frame.close(); processor.dispose();
  });

  it("aborts, bounds outstanding work and rejects every pending operation on worker crash", async () => {
    const worker = new FakeWorker();
    const transport = new VideoWorkerTransport(worker as unknown as Worker, { ownerId: "app:video", maximumOutstanding: 1 });
    const frame = sourceFrame();
    const graph = VFXFrameProcessingGraph.identity();
    const processor = new VFXFrameProcessor({ backend: transport });
    const controller = new AbortController();
    const first = processor.process(frame, graph, { signal: controller.signal });
    await expect(processor.process(frame, graph)).rejects.toMatchObject({ name: "QuotaExceededError" });
    controller.abort(new DOMException("cancel processing", "AbortError"));
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.posts.some(entry => entry.message.operation === "cancel")).toBe(true);
    const crash = processor.process(frame, graph);
    worker.fail();
    await expect(crash).rejects.toThrow(/crashed/i);
    expect(worker.terminated).toBe(1);
    frame.close(); processor.dispose();
  });

  it("rejects an invalid transferred payload before publishing it", async () => {
    const worker = new FakeWorker();
    const transport = new VideoWorkerTransport(worker as unknown as Worker, { ownerId: "app:video" });
    const frame = sourceFrame();
    const processor = new VFXFrameProcessor({ backend: transport });
    const pending = processor.process(frame, VFXFrameProcessingGraph.identity());
    const request = worker.posts[0]?.message;
    if (!request || request.operation !== "render-pixels") throw new Error("expected render request");
    const response = workerPixelResponse(request);
    if (!response.ok) throw new Error("expected successful worker fixture");
    worker.respond({
      ...response,
      value: { ...response.value, image: { ...response.value.image, data: new ArrayBuffer(0) } },
    });
    await expect(pending).rejects.toThrow(/nonempty ArrayBuffer/i);
    frame.close(); processor.dispose();
  });

  it("mounts worker processing behind app.video and revokes the worker with component authority", async () => {
    const workers: FakeWorker[] = [];
    const service = new VideoCaptureService(
      new BrowserVideoCaptureAdapter(null),
      undefined,
      undefined,
      {
        createBackend(ownerId) {
          const worker = new FakeWorker();
          workers.push(worker);
          return new VideoWorkerTransport(worker as unknown as Worker, { ownerId });
        },
      },
    );
    const mount = new AbortController();
    const client = createMountedVideoClient(service, mount.signal, () => [], () => false, "app:processor");
    const processor = client.createFrameProcessor();
    const frame = sourceFrame();
    const pending = processor.process(frame, new VFXFrameProcessingGraph(source => new IFXFilterRegistry().create("invert", {}).apply(source)));
    const worker = workers[0];
    const request = worker?.posts[0]?.message;
    if (!worker || !request || request.operation !== "render-pixels") throw new Error("mounted processor did not dispatch worker processing");
    expect(request.ownerId).toBe("app:processor");
    worker.respond(workerPixelResponse(request));
    const result = await pending;
    result.frame.close();

    mount.abort(new DOMException("component unmounted", "AbortError"));
    expect(worker.terminated).toBe(1);
    await expect(processor.process(frame, VFXFrameProcessingGraph.identity())).rejects.toMatchObject({ name: "AbortError" });
    frame.close();
    service.dispose();
  });
});
