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

import { afterEach, describe, expect, it, vi } from "vitest";
import { GFXFloatImage, GFXImage } from "../../../src/FX/GraphicsFX/public";
import { IFXContext, IFXFilterGraph, IFXFilterRegistry, IFXGraphCodec, IFXImage, IFXProcessorDefinition, IFXRenderDestination, IFXRenderPipeline } from "../../../src/FX/ImageFX/public";
import { BrowserImageProcessingWorker, createBrowserImageProcessingWorkerBackend, type IFXImageWorkerRequest, type IFXImageWorkerResponse } from "../../../src/SynCloudOS/PlatformAdapters/BrowserImageProcessingWorker";
import { executeImageProcessingWorkerRequest, workerJobSampleBudget } from "../../../src/SynCloudOS/PlatformAdapters/imageProcessingWorkerRuntime";
import { createHeavyJobAdmission } from "../../../src/SynCloudOS/Operations/HeavyJobAdmission";

const image = () => IFXImage.fromPixels(new GFXImage({
  width: 1, height: 1, alpha: "straight", colourSpace: "srgb",
  data: new Uint8Array([255, 0, 0, 255]),
}));

class FakeWorker {
  readonly posts: Array<{ message: IFXImageWorkerRequest; transfer: readonly Transferable[] }> = [];
  readonly messages = new Set<(event: MessageEvent<IFXImageWorkerResponse>) => void>();
  readonly errors = new Set<(event: ErrorEvent) => void>();
  terminated = 0;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === "message") this.messages.add(listener as (event: MessageEvent<IFXImageWorkerResponse>) => void);
    if (type === "error") this.errors.add(listener as (event: ErrorEvent) => void);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === "message") this.messages.delete(listener as (event: MessageEvent<IFXImageWorkerResponse>) => void);
    if (type === "error") this.errors.delete(listener as (event: ErrorEvent) => void);
  }
  postMessage(message: IFXImageWorkerRequest, transfer: readonly Transferable[] = []) { this.posts.push({ message, transfer }); }
  terminate() { this.terminated++; }
  respond(response: IFXImageWorkerResponse) {
    for (const listener of this.messages) listener({ data: response } as MessageEvent<IFXImageWorkerResponse>);
  }
  fail(message = "worker crashed") {
    for (const listener of this.errors) listener({ message, error: new Error(message) } as ErrorEvent);
  }
}

function pixelResponse(id: number, data = [255,0,0,255]): IFXImageWorkerResponse {
  const bytes = new Uint8Array(data);
  return {
    id, ok: true, kind: "pixels",
    value: {
      image: { width: 1, height: 1, bytesPerRow: 4, pixelFormat: "rgba8", alpha: "straight", colourSpace: "srgb", data: bytes.buffer },
      info: { width: 1, height: 1, sampleEvaluations: 1, cacheHits: 0, backend: "worker-cpu", tileCount: 1, logicalOutputBytes: 4, peakBytes: { output: 4, scratch: 0, cache: 0 }, work: 1, globalPreparationCount: 0, tileCacheHits: 0, tileCacheEvictions: 0 },
    },
  };
}

function workerGraph(output = image()) {
  const encoded = new IFXGraphCodec().encode(new IFXFilterGraph(output));
  return {
    version: 2 as const,
    output: encoded.output,
    nodes: encoded.nodes.map((node) => {
      if (node.kind !== "pixels") return { ...node };
      const data = Object.getOwnPropertyDescriptor(node, "data")?.value;
      if (!Array.isArray(data)) throw new TypeError("Expected pixel graph data.");
      return { ...node, data: Uint8Array.from(data as number[]).buffer };
    }),
  };
}

function portableGainDefinition() {
  return new IFXProcessorDefinition({
    id: "custom:workerGain",
    version: 1,
    inputCount: 1,
    parameters: { gain: { type: "number", default: 1, minimum: 0, maximum: 4 } },
    output: { kind: "first-input" },
    roi: { kind: "identity" },
    portableProgram: {
      kind: "kernel",
      version: 1,
      program: {
        inputCount: 1,
        instructions: [
          { op: "sample", input: 0 },
          { op: "constant", value: [1, 1, 1, 1] },
          { op: "multiply", left: 0, right: 1 },
        ],
        output: 2,
      },
      bindings: [{ parameter: "gain", instruction: 1, components: [0, 1, 2] }],
    },
    evaluate: (point, access, parameters) => {
      const sample = access.sample(0, point);
      const gain = parameters.gain as number;
      return { r: sample.r * gain, g: sample.g * gain, b: sample.b * gain, a: sample.a };
    },
  });
}

function hdSource(colourSpace: "srgb" | "linear-srgb" = "srgb") {
  // 1920x1080 RGBA8 is 8,294,400 bytes: above the 4 MiB portable interchange
  // limit, well within a worker job budget.
  return IFXImage.fromPixels(new GFXImage({
    width: 1920, height: 1080, alpha: "straight", colourSpace,
    data: new Uint8Array(1920 * 1080 * 4),
  }));
}

function recordingFallback() {
  const calls: IFXImage[] = [];
  const sentinel = Object.freeze({ image: new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array(4) }), info: {} }) as never;
  class RecordingContext extends IFXContext {
    override render(output: IFXImage) { calls.push(output); return Promise.resolve(sentinel); }
  }
  return { context: new RecordingContext(), calls, sentinel };
}

describe("ImageFX eligibility and fallback contract", () => {
  afterEach(() => vi.restoreAllMocks());

  it("decides worker eligibility for a 1080p source from metadata without copying pixels", () => {
    const copies = vi.spyOn(GFXImage.prototype, "copyData");
    const worker = new FakeWorker();
    const backend = new BrowserImageProcessingWorker(worker as unknown as Worker);
    const output = new IFXFilterRegistry().create("invert", {}).apply(hdSource());
    expect(backend.canRender(output, new IFXRenderDestination(output.extent))).toBe(true);
    expect(copies).not.toHaveBeenCalled();
    expect(worker.posts).toHaveLength(0);
    backend.dispose();
  });

  it("routes a graph above the worker job budget to fallback without throwing or posting", async () => {
    const worker = new FakeWorker();
    const fallback = recordingFallback();
    const pipeline = new IFXRenderPipeline(new BrowserImageProcessingWorker(worker as unknown as Worker, { maximumJobBytes: 4 * 1024 * 1024 }), fallback.context);
    const output = new IFXFilterRegistry().create("invert", {}).apply(hdSource());
    let pending: Promise<unknown> | undefined;
    expect(() => { pending = pipeline.render(output, new IFXRenderDestination(output.extent)); }).not.toThrow();
    await expect(pending).resolves.toBe(fallback.sentinel);
    expect(fallback.calls).toEqual([output]);
    expect(worker.posts).toHaveLength(0);
    pipeline.dispose();
  });

  it("submits a 1080p source to the worker as one owned transferable buffer", async () => {
    const copies = vi.spyOn(GFXImage.prototype, "copyData");
    const worker = new FakeWorker();
    const pipeline = new IFXRenderPipeline(new BrowserImageProcessingWorker(worker as unknown as Worker));
    const output = new IFXFilterRegistry().create("invert", {}).apply(hdSource());
    const controller = new AbortController();
    const pending = pipeline.render(output, new IFXRenderDestination(output.extent), { signal: controller.signal });
    expect(worker.posts).toHaveLength(1);
    expect(copies).toHaveBeenCalledTimes(1);
    const { message, transfer } = worker.posts[0]!;
    if (message.operation !== "render-pixels") throw new Error("Expected pixel render.");
    const pixels = message.graph.nodes.find(node => node.kind === "pixels")!;
    expect(pixels.data).toBeInstanceOf(ArrayBuffer);
    expect((pixels.data as ArrayBuffer).byteLength).toBe(1920 * 1080 * 4);
    expect(transfer).toEqual([pixels.data]);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    pipeline.dispose();
  });

  it("copies a pixel source shared by several graph nodes once", () => {
    const copies = vi.spyOn(GFXImage.prototype, "copyData");
    const worker = new FakeWorker();
    const backend = new BrowserImageProcessingWorker(worker as unknown as Worker);
    const source = image();
    const output = new IFXFilterRegistry().create("invert", {}).apply(source).compositedOver(source);
    const controller = new AbortController();
    backend.render(output, new IFXRenderDestination(output.extent), { signal: controller.signal }).catch(() => undefined);
    const message = worker.posts[0]!.message;
    if (message.operation !== "render-pixels") throw new Error("Expected pixel render.");
    expect(message.graph.nodes.filter(node => node.kind === "pixels")).toHaveLength(1);
    expect(copies).toHaveBeenCalledTimes(1);
    controller.abort();
    backend.dispose();
  });

  it("transfers a backing shared by two pixel nodes once and matches CPU output", async () => {
    const data = new Uint8Array(6 * 5 * 4);
    for (let index = 0; index < data.length; index++) data[index] = (index * 37 + 11) & 0xff;
    const backing = new GFXImage({ width: 6, height: 5, pixelFormat: "bgra8", alpha: "premultiplied", colourSpace: "display-p3", data });
    const first = IFXImage.fromPixels(backing);
    const second = IFXImage.fromPixels(backing, { x: 2, y: 1 });
    const output = new IFXFilterRegistry().create("invert", {}).apply(first)
      .transformed({ a: 1, b: 0, c: 0, d: 1, tx: 0.5, ty: 0 }, "linear")
      .compositedOver(second.cropped({ x: 2, y: 1, width: 4, height: 3 }));
    const bounds = { kind: "finite" as const, rect: { x: 0, y: 0, width: 8, height: 6 } };
    const worker = new FakeWorker();
    const backend = new BrowserImageProcessingWorker(worker as unknown as Worker);
    const pending = backend.render(output, new IFXRenderDestination(bounds, "srgb", "premultiplied"));
    const { message, transfer } = worker.posts[0]!;
    if (message.operation !== "render-pixels") throw new Error("Expected pixel render.");
    const pixelNodes = message.graph.nodes.filter(node => node.kind === "pixels");
    expect(pixelNodes).toHaveLength(2);
    expect(pixelNodes[0]!.data).toBe(pixelNodes[1]!.data);
    expect(transfer).toHaveLength(1);
    const execution = await executeImageProcessingWorkerRequest(message, new AbortController().signal);
    worker.respond(execution.response);
    const transported = await pending;
    const context = new IFXContext();
    const cpu = await context.render(output, new IFXRenderDestination(bounds, "srgb", "premultiplied"));
    expect(transported.image.copyData()).toEqual(cpu.image.copyData());
    context.dispose();
    backend.dispose();
  });

  it("returns a rejected promise instead of throwing when a backend's eligibility check fails", async () => {
    const failing = {
      capabilities: new BrowserImageProcessingWorker(new FakeWorker() as unknown as Worker).capabilities,
      canRender() { throw new TypeError("backend eligibility failed"); },
      render() { throw new Error("must not render"); },
      dispose() {},
    };
    const fallback = recordingFallback();
    const pipeline = new IFXRenderPipeline(failing, fallback.context);
    let pending: Promise<unknown> | undefined;
    expect(() => { pending = pipeline.render(image(), new IFXRenderDestination(image().extent)); }).not.toThrow();
    await expect(pending).rejects.toThrow("backend eligibility failed");
    expect(fallback.calls).toHaveLength(0);
    pipeline.dispose();
  });

  it("evaluates WebGPU eligibility for a 1080p source without copying pixels", async () => {
    const adapters = await import("../../../src/SynCloudOS/PlatformAdapters/BrowserWebGPUImageProcessingBackend");
    const copies = vi.spyOn(GFXImage.prototype, "copyData");
    const backend = new adapters.BrowserWebGPUImageProcessingBackend({
      lost: new Promise<Readonly<{ reason?: string; message?: string }>>(() => undefined),
      async execute() { throw new Error("eligibility must not execute"); },
      dispose() {},
    });
    const output = new IFXFilterRegistry().create("invert", {}).apply(hdSource("linear-srgb"));
    expect(backend.canRender(output, new IFXRenderDestination(output.extent, "linear-srgb", "straight"))).toBe(true);
    expect(copies).not.toHaveBeenCalled();
    backend.dispose();
  });
});

describe("ImageFX worker admission", () => {
  afterEach(() => vi.restoreAllMocks());

  it("allocates and posts a queued job only after admission", async () => {
    const admission = createHeavyJobAdmission({ concurrency: 1, maximumBytes: 1 << 30 });
    const copies = vi.spyOn(GFXImage.prototype, "copyData");
    const worker = new FakeWorker();
    const backend = new BrowserImageProcessingWorker(worker as unknown as Worker, { admission });
    const first = backend.render(image(), new IFXRenderDestination(image().extent));
    const second = backend.render(image(), new IFXRenderDestination(image().extent));
    await Promise.resolve();
    expect(worker.posts).toHaveLength(1);
    expect(copies).toHaveBeenCalledTimes(1);
    worker.respond(pixelResponse(worker.posts[0]!.message.id));
    await first;
    await vi.waitFor(() => expect(worker.posts).toHaveLength(2));
    expect(copies).toHaveBeenCalledTimes(2);
    worker.respond(pixelResponse(worker.posts[1]!.message.id));
    await second;
    expect(admission.snapshot()).toMatchObject({ active: 0, activeBytes: 0 });
    backend.dispose();
  });

  it("drops a queued render superseded by a newer render to the same destination without allocating it", async () => {
    const admission = createHeavyJobAdmission({ concurrency: 1, maximumBytes: 1 << 30 });
    const worker = new FakeWorker();
    const backend = new BrowserImageProcessingWorker(worker as unknown as Worker, { admission });
    const busy = backend.render(image(), new IFXRenderDestination(image().extent));
    const destination = new IFXRenderDestination(image().extent);
    const stale = backend.render(image(), destination);
    const latest = backend.render(image(), destination);
    await expect(stale).rejects.toMatchObject({ name: "AbortError" });
    const copies = vi.spyOn(GFXImage.prototype, "copyData");
    worker.respond(pixelResponse(worker.posts[0]!.message.id));
    await busy;
    await vi.waitFor(() => expect(worker.posts).toHaveLength(2));
    expect(copies).toHaveBeenCalledTimes(1);
    worker.respond(pixelResponse(worker.posts[1]!.message.id, [0, 255, 0, 255]));
    await latest;
    expect(destination.image?.pixel(0, 0).g).toBe(1);
    expect(admission.snapshot()).toMatchObject({ superseded: 1, active: 0 });
    backend.dispose();
  });

  it("keeps a cancelled job charged until the worker reports it finished", async () => {
    const admission = createHeavyJobAdmission({ concurrency: 1, maximumBytes: 1 << 30 });
    const worker = new FakeWorker();
    const backend = new BrowserImageProcessingWorker(worker as unknown as Worker, { admission });
    const controller = new AbortController();
    const pending = backend.render(image(), new IFXRenderDestination(image().extent), { signal: controller.signal });
    controller.abort(new DOMException("cancelled", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(admission.snapshot()).toMatchObject({ active: 1 });
    worker.respond({ id: worker.posts[0]!.message.id, ok: false, error: { name: "AbortError", message: "cancelled" } });
    expect(admission.snapshot()).toMatchObject({ active: 0 });
    backend.dispose();
  });

  it("releases every lease when the worker fails", async () => {
    const admission = createHeavyJobAdmission({ concurrency: 2, maximumBytes: 1 << 30 });
    const worker = new FakeWorker();
    const backend = new BrowserImageProcessingWorker(worker as unknown as Worker, { admission });
    const first = backend.render(image(), new IFXRenderDestination(image().extent));
    const second = backend.render(image(), new IFXRenderDestination(image().extent));
    worker.fail("boom");
    await expect(first).rejects.toThrow("boom");
    await expect(second).rejects.toThrow("boom");
    expect(admission.snapshot()).toMatchObject({ active: 0, activeBytes: 0 });
  });
});

describe("ImageFX worker backend", () => {
  it("advertises an exact WebGPU operation and format matrix before accelerated work is eligible", async () => {
    const adapters = await import("../../../src/SynCloudOS/PlatformAdapters/BrowserWebGPUImageProcessingBackend");
    const executor = {
      lost: new Promise<Readonly<{ reason?: string; message?: string }>>(() => undefined),
      async execute() { throw new Error("preflight must not execute GPU work"); },
      dispose() {},
    };
    const backend = new adapters.BrowserWebGPUImageProcessingBackend(executor);
    expect(backend.capabilities).toMatchObject({
      id: "browser-webgpu",
      kind: "accelerated",
      accelerated: true,
      pixelFormats: ["rgba8"],
      colourSpaces: ["linear-srgb"],
      alphaFormats: ["straight"],
      destinations: ["pixels"],
      graphOperations: ["builtin"],
      builtinOperations: ["exposure", "invert"],
    });
    const source = IFXImage.fromPixels(new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array([64, 96, 128, 255]) }));
    const registry = new IFXFilterRegistry();
    expect(backend.canRender(registry.create("invert", {}).apply(source), new IFXRenderDestination(source.extent, "linear-srgb", "straight"))).toBe(true);
    expect(backend.canRender(registry.create("exposure", { ev: 1 }).apply(source), new IFXRenderDestination(source.extent, "linear-srgb", "straight"))).toBe(true);
    expect(backend.canRender(registry.create("sepia", { intensity: 1 }).apply(source), new IFXRenderDestination(source.extent, "linear-srgb", "straight"))).toBe(false);
    expect(backend.canRender(registry.create("invert", {}).apply(source), new IFXRenderDestination(source.extent, "srgb", "straight"))).toBe(false);
    backend.dispose();
  });

  it("publishes accelerated output only after the owned executor completes", async () => {
    const adapters = await import("../../../src/SynCloudOS/PlatformAdapters/BrowserWebGPUImageProcessingBackend");
    const requests: Array<adapters.BrowserWebGPUImageExecutionRequest> = [];
    let disposed = 0;
    const backend = new adapters.BrowserWebGPUImageProcessingBackend({
      lost: new Promise<Readonly<{ reason?: string; message?: string }>>(() => undefined),
      async execute(request) {
        requests.push(request);
        return new Uint8Array([191, 159, 127, 255]);
      },
      dispose() { disposed++; },
    });
    const source = IFXImage.fromPixels(new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array([64, 96, 128, 255]) }));
    const output = new IFXFilterRegistry().create("invert", {}).apply(source);
    const destination = new IFXRenderDestination(output.extent, "linear-srgb", "straight");
    const result = await backend.render(output, destination);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ width: 1, height: 1, operation: { name: "invert" } });
    expect(result.info.backend).toBe("accelerated");
    expect([...result.image.copyData()]).toEqual([191, 159, 127, 255]);
    expect([...destination.image!.copyData()]).toEqual([191, 159, 127, 255]);
    backend.dispose();
    backend.dispose();
    expect(disposed).toBe(1);
  });

  it("rejects pending accelerated publication when the WebGPU device is lost", async () => {
    const adapters = await import("../../../src/SynCloudOS/PlatformAdapters/BrowserWebGPUImageProcessingBackend");
    let resolveLost!: (value: Readonly<{ reason?: string; message?: string }>) => void;
    let disposeCount = 0;
    const lost = new Promise<Readonly<{ reason?: string; message?: string }>>(resolve => { resolveLost = resolve; });
    const backend = new adapters.BrowserWebGPUImageProcessingBackend({
      lost,
      execute: () => new Promise<Uint8Array>(() => undefined),
      dispose() { disposeCount++; },
    });
    const source = IFXImage.fromPixels(new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array([64, 96, 128, 255]) }));
    const output = new IFXFilterRegistry().create("invert", {}).apply(source);
    const destination = new IFXRenderDestination(output.extent, "linear-srgb", "straight");
    const pending = backend.render(output, destination);
    resolveLost({ reason: "unknown", message: "simulated loss" });
    await expect(pending).rejects.toMatchObject({ name: "AbortError", message: expect.stringContaining("simulated loss") });
    expect(destination.image).toBeNull();
    expect(backend.canRender(output, destination)).toBe(false);
    expect(disposeCount).toBe(1);
  });

  it("rejects a local custom callback before any dispatch", async () => {
    let posts = 0;
    const host = {
      addEventListener() {},
      removeEventListener() {},
      postMessage() { posts++; },
      terminate() {},
    };
    const backend = new BrowserImageProcessingWorker(host as unknown as Worker);
    const custom = new IFXProcessorDefinition({
      id: "custom:localOnly", version: 1, inputCount: 1, parameters: {},
      output: { kind: "first-input" }, roi: { kind: "identity" },
      evaluate: (point, access) => access.sample(0, point),
    });
    await expect(backend.render(custom.apply({}, image()), new IFXRenderDestination(image().extent)))
      .rejects.toMatchObject({ name: "NotSupportedError" });
    expect(posts).toBe(0);
    backend.dispose();
  });

  it("dispatches a portable custom processor while keeping its callback out of the worker payload", async () => {
    const worker = new FakeWorker();
    const backend = new BrowserImageProcessingWorker(worker as unknown as Worker);
    const output = portableGainDefinition().apply({ gain: 0.5 }, image());
    const destination = new IFXRenderDestination(output.extent);
    expect(backend.canRender(output, destination)).toBe(true);
    const pending = backend.render(output, destination);
    expect(worker.posts).toHaveLength(1);
    const request = worker.posts[0]!.message;
    if (request.operation !== "render-pixels") throw new Error("Expected pixel worker request.");
    const operation = request.graph.nodes.find(node => node.kind === "operation") as Record<string, unknown>;
    expect(operation.processor).toMatchObject({ kind: "custom", id: "custom:workerGain", version: 1, program: { kind: "kernel", version: 1 } });
    expect(JSON.stringify(request.graph)).not.toContain("evaluate");
    worker.respond(pixelResponse(request.id, [128, 0, 0, 255]));
    await expect(pending).resolves.toMatchObject({ info: { backend: "worker-cpu" } });
    backend.dispose();
  });

  it("transfers owned pixels and publishes the worker result once", async () => {
    const worker = new FakeWorker();
    const backend = new BrowserImageProcessingWorker(worker as unknown as Worker);
    const destination = new IFXRenderDestination(image().extent);
    const pending = backend.render(image(), destination);
    expect(worker.posts).toHaveLength(1);
    expect(worker.posts[0]!.message.operation).toBe("render-pixels");
    expect(worker.posts[0]!.transfer.length).toBeGreaterThan(0);
    worker.respond(pixelResponse(worker.posts[0]!.message.id));
    const result = await pending;
    expect(result.info.backend).toBe("worker-cpu");
    expect(result.image.pixel(0, 0).r).toBe(1);
    expect(destination.image?.pixel(0, 0).r).toBe(1);
    backend.dispose();
  });

  it("chooses the preferred worker before starting CPU fallback", async () => {
    const worker = new FakeWorker();
    const pipeline = new IFXRenderPipeline(new BrowserImageProcessingWorker(worker as unknown as Worker));
    const destination = new IFXRenderDestination(image().extent);
    const pending = pipeline.render(image(), destination);
    expect(worker.posts).toHaveLength(1);
    worker.respond(pixelResponse(worker.posts[0]!.message.id));
    await expect(pending).resolves.toMatchObject({ info: { backend: "worker-cpu" } });
    pipeline.dispose();
    expect(worker.terminated).toBe(1);
  });

  it("walks an ordered backend chain before canonical CPU fallback", async () => {
    const adapters = await import("../../../src/SynCloudOS/PlatformAdapters/BrowserWebGPUImageProcessingBackend");
    let acceleratedExecutions = 0;
    const accelerated = new adapters.BrowserWebGPUImageProcessingBackend({
      lost: new Promise<Readonly<{ reason?: string; message?: string }>>(() => undefined),
      async execute() { acceleratedExecutions++; return new Uint8Array([0, 0, 0, 255]); },
      dispose() {},
    });
    const worker = new FakeWorker();
    const workerBackend = new BrowserImageProcessingWorker(worker as unknown as Worker);
    const pipeline = new IFXRenderPipeline([accelerated, workerBackend] as never);
    const source = IFXImage.fromPixels(new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array([64, 96, 128, 255]) }));
    const sepia = new IFXFilterRegistry().create("sepia", { intensity: 1 }).apply(source);
    const destination = new IFXRenderDestination(sepia.extent, "linear-srgb", "straight");
    const pending = pipeline.render(sepia, destination);
    expect(acceleratedExecutions).toBe(0);
    expect(worker.posts).toHaveLength(1);
    worker.respond(pixelResponse(worker.posts[0]!.message.id, [32, 48, 64, 255]));
    await expect(pending).resolves.toMatchObject({ info: { backend: "worker-cpu" } });
    pipeline.dispose();
    expect(worker.terminated).toBe(1);
  });

  it("exposes one browser factory that assembles acceleration before worker fallback", async () => {
    const adapters = await import("../../../src/SynCloudOS/PlatformAdapters/BrowserImageProcessingWorker") as Record<string, unknown>;
    expect(adapters.createBrowserAcceleratedImageProcessingPipeline).toBeTypeOf("function");
  });

  it("uses canonical CPU fallback for a worker-ineligible local processor", async () => {
    const worker = new FakeWorker();
    const pipeline = new IFXRenderPipeline(new BrowserImageProcessingWorker(worker as unknown as Worker));
    const custom = new IFXProcessorDefinition({
      id: "custom:pipelineLocal", version: 1, inputCount: 1, parameters: {},
      output: { kind: "first-input" }, roi: { kind: "identity" },
      evaluate: (point, access) => access.sample(0, point),
    });
    const destination = new IFXRenderDestination(image().extent);
    const result = await pipeline.render(custom.apply({}, image()), destination);
    expect(result.info.backend).toBe("cpu");
    expect(destination.image?.pixel(0, 0).r).toBe(1);
    expect(worker.posts).toHaveLength(0);
    pipeline.dispose();
    expect(worker.terminated).toBe(1);
  });

  it("transfers bounded float32 pixels and preserves extended values until byte output", async () => {
    const worker = new FakeWorker();
    const pipeline = new IFXRenderPipeline(new BrowserImageProcessingWorker(worker as unknown as Worker));
    const float = IFXImage.fromPixels(new GFXFloatImage({
      width: 1,
      height: 1,
      sampleFormat: "float32",
      alpha: "straight",
      colourSpace: "linear-srgb",
      data: new Float32Array([2, -0.25, 0.5, 1]),
    }));
    const output = portableGainDefinition().apply({ gain: 0.25 }, float);
    const destination = new IFXRenderDestination(output.extent, "linear-srgb", "straight");
    const pending = pipeline.render(output, destination);
    expect(worker.posts).toHaveLength(1);
    const request = worker.posts[0]!.message;
    if (request.operation !== "render-pixels") throw new TypeError("Expected pixel render.");
    expect(request.graph.version).toBe(3);
    const pixels = request.graph.nodes.find(node => node.kind === "pixels");
    expect(pixels?.sampleFormat).toBe("float32");
    expect(Array.from(new Float32Array(pixels?.data as ArrayBuffer))).toEqual([2, -0.25, 0.5, 1]);
    const execution = await executeImageProcessingWorkerRequest(request, new AbortController().signal);
    worker.respond(execution.response);
    const result = await pending;
    expect(result.info.backend).toBe("worker-cpu");
    expect(destination.image?.pixel(0, 0).r).toBeCloseTo(0.5, 2);
    expect(destination.image?.pixel(0, 0).g).toBe(0);
    pipeline.dispose();
  });

  it("round-trips half-float words through the graph codec and worker transport", async () => {
    const float = IFXImage.fromPixels(new GFXFloatImage({
      width: 1, height: 1, sampleFormat: "float16", alpha: "straight", colourSpace: "linear-srgb",
      data: new Uint16Array([0x4000, 0xb400, 0x3800, 0x3c00]),
    }));
    const codec = new IFXGraphCodec();
    const encoded = codec.encode(new IFXFilterGraph(float));
    expect(encoded.version).toBe(3);
    const decoded = codec.decode(encoded).output;
    const worker = new FakeWorker();
    const backend = new BrowserImageProcessingWorker(worker as unknown as Worker);
    const destination = new IFXRenderDestination(decoded.extent, "linear-srgb", "straight");
    const pending = backend.render(decoded, destination);
    const request = worker.posts[0]!.message;
    if (request.operation !== "render-pixels") throw new TypeError("Expected pixel render.");
    const pixels = request.graph.nodes.find(node => node.kind === "pixels");
    expect(pixels?.sampleFormat).toBe("float16");
    expect(Array.from(new Uint16Array(pixels?.data as ArrayBuffer))).toEqual([0x4000, 0xb400, 0x3800, 0x3c00]);
    worker.respond((await executeImageProcessingWorkerRequest(request, new AbortController().signal)).response);
    expect((await pending).info.backend).toBe("worker-cpu");
    expect(destination.image?.pixel(0, 0).r).toBe(1);
    backend.dispose();
  });

  it("rejects malformed and oversized transferred float graphs before rendering", async () => {
    const float = IFXImage.fromPixels(new GFXFloatImage({
      width: 1, height: 1, sampleFormat: "float32", alpha: "straight", colourSpace: "linear-srgb",
      data: new Float32Array([2, 0, 0, 1]),
    }));
    const encoded = new IFXGraphCodec().encode(new IFXFilterGraph(float));
    const pixels = encoded.nodes.find(node => node.kind === "pixels")!;
    expect(() => new IFXGraphCodec().decode({
      ...encoded, nodes: [{ ...pixels, data: [Number.POSITIVE_INFINITY, 0, 0, 1] }], output: 0,
    })).toThrow(/float pixels/i);
    const request = (data: ArrayBuffer) => ({
      id: 1, operation: "render-pixels" as const,
      graph: { version: 3 as const, nodes: [{ ...pixels, data }], output: 0 },
      destination: { bounds: { x: 0, y: 0, width: 1, height: 1 }, colourSpace: "linear-srgb" as const, alpha: "straight" as const },
      interpolation: "linear" as const,
    });
    // A buffer that disagrees with the node's declared 1x1 float32 extent.
    await expect(executeImageProcessingWorkerRequest(request(new ArrayBuffer(4 * 1024 * 1024 + 4)), new AbortController().signal))
      .rejects.toThrow(/length does not match/i);
    // A correctly shaped payload above the worker's configured job budget.
    await expect(executeImageProcessingWorkerRequest(request(new Float32Array([2, 0, 0, 1]).buffer), new AbortController().signal, { maximumPixelBytes: 8 }))
      .rejects.toThrow(/budget/i);
  });

  it("rejects stale and cancelled responses without late publication", async () => {
    const worker = new FakeWorker();
    const backend = new BrowserImageProcessingWorker(worker as unknown as Worker);
    const destination = new IFXRenderDestination(image().extent);
    const first = backend.render(image(), destination);
    const second = backend.render(image(), destination);
    worker.respond(pixelResponse(worker.posts[0]!.message.id));
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(destination.image).toBeNull();
    worker.respond(pixelResponse(worker.posts[1]!.message.id, [0,255,0,255]));
    await second;
    expect(destination.image?.pixel(0, 0).g).toBe(1);

    const controller = new AbortController();
    const cancelledDestination = new IFXRenderDestination(image().extent);
    const cancelled = backend.render(image(), cancelledDestination, { signal: controller.signal });
    const id = worker.posts.at(-1)!.message.id;
    controller.abort(new DOMException("cancelled", "AbortError"));
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.posts.some(entry => entry.message.operation === "cancel" && entry.message.id === id)).toBe(true);
    worker.respond(pixelResponse(id));
    expect(cancelledDestination.image).toBeNull();
    backend.dispose();
  });

  it("fails all jobs and terminates once after a worker crash", async () => {
    const worker = new FakeWorker();
    const backend = new BrowserImageProcessingWorker(worker as unknown as Worker);
    const first = backend.render(image(), new IFXRenderDestination(image().extent));
    const second = backend.render(image(), new IFXRenderDestination(image().extent));
    worker.fail("boom");
    await expect(first).rejects.toThrow("boom");
    await expect(second).rejects.toThrow("boom");
    expect(worker.terminated).toBe(1);
    await expect(backend.render(image(), new IFXRenderDestination(image().extent))).rejects.toMatchObject({ name: "AbortError" });
    backend.dispose();
    expect(worker.terminated).toBe(1);
  });

  it("returns explicit encoded metadata and propagates encoder failure", async () => {
    const worker = new FakeWorker();
    const backend = new BrowserImageProcessingWorker(worker as unknown as Worker, { encoded: true, webp: true });
    const pending = backend.renderEncoded(image(), { format: "image/png", colourSpace: "srgb", orientation: "up" });
    const request = worker.posts[0]!.message;
    expect(request.operation).toBe("render-encoded");
    const blob = new Blob([new Uint8Array([1,2,3])], { type: "image/png" });
    worker.respond({ id: request.id, ok: true, kind: "encoded", value: { blob, metadata: { width: 1, height: 1, mimeType: "image/png", colourSpace: "srgb", orientation: "up" } } } as IFXImageWorkerResponse);
    await expect(pending).resolves.toMatchObject({ blob, metadata: { mimeType: "image/png", colourSpace: "srgb", orientation: "up" } });

    const failed = backend.renderEncoded(image(), { format: "image/webp", colourSpace: "srgb", orientation: "up" });
    const failedId = worker.posts.at(-1)!.message.id;
    worker.respond({ id: failedId, ok: false, error: { name: "EncodingError", message: "encoder failed" } });
    await expect(failed).rejects.toThrow("encoder failed");
    backend.dispose();
  });

  it("advertises only encoded formats that are actually enabled", async () => {
    const worker = new FakeWorker();
    const backend = new BrowserImageProcessingWorker(worker as unknown as Worker, { encoded: true });
    expect(backend.capabilities.encodedMimeTypes).toEqual(["image/png"]);
    await expect(backend.renderEncoded(image(), { format: "image/webp" })).rejects.toMatchObject({ name: "NotSupportedError" });
    expect(worker.posts).toHaveLength(0);
    backend.dispose();
  });

  it("keeps the real worker factory import-safe when Worker is unavailable", () => {
    expect(typeof Worker).not.toBe("function");
    expect(createBrowserImageProcessingWorkerBackend()).toBeNull();
  });

  it("transfers an OffscreenCanvas only when that destination is advertised", async () => {
    const unavailable = new FakeWorker();
    const unsupported = new BrowserImageProcessingWorker(unavailable as unknown as Worker);
    await expect(unsupported.renderToOffscreenCanvas(image(), {} as OffscreenCanvas)).rejects.toMatchObject({ name: "NotSupportedError" });
    expect(unavailable.posts).toHaveLength(0);
    unsupported.dispose();

    const worker = new FakeWorker();
    const backend = new BrowserImageProcessingWorker(worker as unknown as Worker, { offscreenCanvas: true });
    const canvas = {} as OffscreenCanvas;
    const pending = backend.renderToOffscreenCanvas(image(), canvas);
    const request = worker.posts[0]!.message;
    expect(request.operation).toBe("render-canvas");
    expect(worker.posts[0]!.transfer).toContain(canvas);
    worker.respond({ id: request.id, ok: true, kind: "canvas", value: { metadata: { width: 1, height: 1, colourSpace: "srgb", orientation: "up" } } } as IFXImageWorkerResponse);
    await expect(pending).resolves.toEqual({ width: 1, height: 1, colourSpace: "srgb", orientation: "up" });
    expect(backend.capabilities).toMatchObject({ kind: "worker-cpu", accelerated: false });
    expect(backend.capabilities.destinations).toContain("offscreen-canvas");
    backend.dispose();
  });

  it("executes a transferred graph through the real worker runtime", async () => {
    const response = await executeImageProcessingWorkerRequest({
      id: 41,
      operation: "render-pixels",
      graph: workerGraph(),
      destination: { bounds: { x: 0, y: 0, width: 1, height: 1 }, colourSpace: "srgb", alpha: "straight" },
      interpolation: "nearest",
    }, new AbortController().signal);
    expect(response.response).toMatchObject({ id: 41, ok: true, kind: "pixels", value: { info: { backend: "worker-cpu" } } });
    if (!response.response.ok || response.response.kind !== "pixels") throw new Error("Expected pixel response.");
    expect(new Uint8Array(response.response.value.image.data)).toEqual(new Uint8Array([255, 0, 0, 255]));
    expect(response.transfer).toContain(response.response.value.image.data);
  });

  it("executes a parameterized portable custom processor through the real worker runtime", async () => {
    const output = portableGainDefinition().apply({ gain: 0.5 }, image());
    const cpuContext = new IFXContext();
    const cpu = await cpuContext.render(output, new IFXRenderDestination(output.extent, "srgb", "straight"), { interpolation: "nearest" });
    const response = await executeImageProcessingWorkerRequest({
      id: 45,
      operation: "render-pixels",
      graph: workerGraph(output),
      destination: { bounds: { x: 0, y: 0, width: 1, height: 1 }, colourSpace: "srgb", alpha: "straight" },
      interpolation: "nearest",
    }, new AbortController().signal);
    if (!response.response.ok || response.response.kind !== "pixels") throw new Error("Expected pixel response.");
    expect(new Uint8Array(response.response.value.image.data)).toEqual(cpu.image.copyData());
    cpuContext.dispose();
  });

  it("encodes PNG in the real worker runtime with explicit sRGB/up metadata", async () => {
    const response = await executeImageProcessingWorkerRequest({
      id: 42,
      operation: "render-encoded",
      graph: workerGraph(),
      format: "image/png",
      colourSpace: "srgb",
      orientation: "up",
      interpolation: "linear",
    }, new AbortController().signal);
    expect(response.response).toMatchObject({ id: 42, ok: true, kind: "encoded", value: { metadata: { width: 1, height: 1, mimeType: "image/png", colourSpace: "srgb", orientation: "up" } } });
    if (!response.response.ok || response.response.kind !== "encoded") throw new Error("Expected encoded response.");
    expect(response.response.value.blob.type).toBe("image/png");
    expect((await response.response.value.blob.arrayBuffer()).byteLength).toBeGreaterThan(8);
  });

  it("rejects unsupported worker encoding and detached graph storage before publication", async () => {
    await expect(executeImageProcessingWorkerRequest({
      id: 43,
      operation: "render-encoded",
      graph: workerGraph(),
      format: "image/webp",
      colourSpace: "srgb",
      orientation: "up",
      interpolation: "linear",
    }, new AbortController().signal, { createOffscreenCanvas: null })).rejects.toMatchObject({ name: "NotSupportedError" });

    const graph = workerGraph();
    const pixel = graph.nodes.find((node) => node.kind === "pixels") as { data: ArrayBuffer };
    structuredClone(pixel.data, { transfer: [pixel.data] });
    expect(pixel.data.byteLength).toBe(0);
    await expect(executeImageProcessingWorkerRequest({
      id: 44,
      operation: "render-pixels",
      graph,
      destination: { bounds: { x: 0, y: 0, width: 1, height: 1 }, colourSpace: "srgb", alpha: "straight" },
      interpolation: "nearest",
    }, new AbortController().signal)).rejects.toThrow();
  });

  it("sizes the CPU sample budget to the job, so a VGA two-node graph renders", async () => {
    const width = 640, height = 480;
    const data = new Uint8Array(width * height * 4);
    for (let index = 0; index < data.length; index++) data[index] = (index & 3) === 3 ? 255 : (index * 29 + 7) & 0xff;
    const source = IFXImage.fromPixels(new GFXImage({ width, height, alpha: "straight", colourSpace: "linear-srgb", data }));
    const output = new IFXFilterRegistry().create("invert", {}).apply(source);
    const response = await executeImageProcessingWorkerRequest({
      id: 46,
      operation: "render-pixels",
      graph: workerGraph(output),
      destination: { bounds: { x: 0, y: 0, width, height }, colourSpace: "linear-srgb", alpha: "straight" },
      interpolation: "nearest",
    }, new AbortController().signal);
    if (!response.response.ok || response.response.kind !== "pixels") throw new Error("Expected pixel response.");
    const bytes = new Uint8Array(response.response.value.image.data);
    for (const index of [0, 1, 2, 4 * (width * 240 + 320), 4 * (width * height - 1) + 2]) expect(bytes[index]).toBe(255 - data[index]!);
    expect(bytes[3]).toBe(255);
  });

  it("never asks the CPU context for more samples than it accepts", () => {
    for (const nodes of [1, 2, 8, 64]) {
      for (const pixels of [1, 640 * 480, 1024 * 1024, 1920 * 1080, 2048 * 2048]) {
        const budget = workerJobSampleBudget(nodes, pixels);
        // Constructed with the job's budget, the context validates it.
        expect(() => new IFXContext("linear-srgb", budget).dispose(), `${nodes} nodes, ${pixels} px`).not.toThrow();
        // Up to the context's ceiling, every pixel may evaluate every node.
        expect(budget).toBeGreaterThanOrEqual(Math.min(pixels * nodes, 2 * 1024 * 1024));
      }
    }
  });
});
