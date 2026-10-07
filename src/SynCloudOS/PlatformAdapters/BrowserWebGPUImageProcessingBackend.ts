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

import { GFXImage } from "../../FX/GraphicsFX/GFXImage";
import { planIFXGraphTransport } from "../../FX/ImageFX/IFXGraphTransport";
import type { IFXImage } from "../../FX/ImageFX/IFXImage";
import { assertDestination, beginDestination, publishDestination, type IFXRenderDestination } from "../../FX/ImageFX/IFXRenderDestination";
import type { IFXBackendRenderOptions, IFXRenderBackend, IFXRenderBackendCapabilities } from "../../FX/ImageFX/IFXRenderBackend";
import type { IFXRenderResult } from "../../FX/ImageFX/IFXRenderTask";
import type { RuntimeResourceBacking, RuntimeResourceParticipant } from "../HostServices/PlatformAdapterRuntimePorts";

export type BrowserWebGPUImageOperation =
  | Readonly<{ name: "invert" }>
  | Readonly<{ name: "exposure"; ev: number }>;

export interface BrowserWebGPUImageExecutionRequest {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly operation: BrowserWebGPUImageOperation;
}

export interface BrowserWebGPUImageExecutor {
  readonly lost: Promise<Readonly<{ reason?: string; message?: string }>>;
  execute(request: BrowserWebGPUImageExecutionRequest, signal?: AbortSignal): Promise<Uint8Array>;
  dispose(): void;
  /** Device buffers it holds: in use (active) or pooled for reuse (idle). */
  measureResidency?(): Iterable<RuntimeResourceBacking>;
  /** Destroys pooled buffers, oldest first, until `targetBytes` are freed. */
  releaseIdle?(targetBytes: number): number;
}

/** Where a backend reports its device residency (runtime.resources). */
export interface BrowserWebGPUResourceAccounting {
  readonly owner: string;
  register(participant: RuntimeResourceParticipant): () => void;
}

export interface BrowserWebGPUImageBackendOptions {
  readonly resources?: BrowserWebGPUResourceAccounting;
  /** Acquires a replacement device after an unexpected loss; null gives up. */
  readonly reacquire?: () => Promise<BrowserWebGPUImageExecutor | null>;
  /** Losses the backend recovers from before it stays closed (default 3). */
  readonly maximumReacquisitions?: number;
}

let participantSequence = 0;

/** An eligible job, compiled from graph metadata. Pixels are copied from
 * `source` only when the job is actually rendered. */
type CompiledJob = Readonly<{
  source: GFXImage;
  width: number;
  height: number;
  operation: BrowserWebGPUImageOperation;
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
}>;

const supportedBuiltins = Object.freeze(["exposure", "invert"] as const);

function processorKind(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const descriptor = Object.getOwnPropertyDescriptor(value, "kind");
  return descriptor && "value" in descriptor && typeof descriptor.value === "string" ? descriptor.value : null;
}

function compileJob(image: IFXImage, destination: IFXRenderDestination): CompiledJob | null {
  if (destination.colourSpace !== "linear-srgb" || destination.alpha !== "straight") return null;
  const plan = planIFXGraphTransport(image);
  if (!plan.transportable || plan.nodes.length !== 2 || plan.output !== 1) return null;
  const source = plan.nodes[0], operation = plan.nodes[1];
  if (source?.kind !== "pixels" || operation?.kind !== "operation") return null;
  if (source.pixelFormat !== "rgba8" || source.alpha !== "straight" || source.colorSpace !== "linear-srgb") return null;
  if (!Number.isSafeInteger(source.width) || !Number.isSafeInteger(source.height) || !Number.isSafeInteger(source.bytesPerRow)) return null;
  const width = source.width as number, height = source.height as number;
  if (width < 1 || height < 1 || source.bytesPerRow !== width * 4) return null;
  const origin = source.origin as Readonly<{ x?: unknown; y?: unknown }> | undefined;
  if (!origin || typeof origin.x !== "number" || typeof origin.y !== "number" || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return null;
  if (destination.bounds.x !== origin.x || destination.bounds.y !== origin.y || destination.bounds.width !== width || destination.bounds.height !== height) return null;
  const pixels = plan.resources[source.data as number];
  if (!(pixels instanceof GFXImage)) return null;
  if (processorKind(operation.processor) !== "builtin") return null;
  const processor = operation.processor as Readonly<Record<string, unknown>>;
  if (processor.version !== 1 || typeof processor.name !== "string" || !supportedBuiltins.includes(processor.name as typeof supportedBuiltins[number])) return null;
  if (!Array.isArray(operation.inputs) || operation.inputs.length !== 1 || operation.inputs[0] !== 0) return null;
  const parameters = operation.parameters as Readonly<Record<string, unknown>> | undefined;
  let compiledOperation: BrowserWebGPUImageOperation;
  if (processor.name === "invert") {
    if (!parameters || Object.keys(parameters).length !== 0) return null;
    compiledOperation = Object.freeze({ name: "invert" });
  } else {
    const ev = parameters?.ev;
    if (typeof ev !== "number" || !Number.isFinite(ev) || ev < -10 || ev > 10 || Object.keys(parameters ?? {}).length !== 1) return null;
    compiledOperation = Object.freeze({ name: "exposure", ev });
  }
  return Object.freeze({
    source: pixels,
    width,
    height,
    operation: compiledOperation,
    bounds: Object.freeze({ ...destination.bounds }),
  });
}

function abortError(message: string): DOMException {
  return new DOMException(message, "AbortError");
}

/** One acquired device: its executor, and the terminal that fails its
 * in-flight jobs when it is lost or the backend closes. */
interface DeviceGeneration {
  readonly executor: BrowserWebGPUImageExecutor;
  readonly terminal: Promise<never>;
  readonly fail: (error: unknown) => void;
}

function assertExecutor(executor: BrowserWebGPUImageExecutor): void {
  if (!executor || typeof executor.execute !== "function" || typeof executor.dispose !== "function" || !(executor.lost instanceof Promise))
    throw new TypeError("WebGPU image executor required.");
}

export class BrowserWebGPUImageProcessingBackend implements IFXRenderBackend {
  readonly capabilities: IFXRenderBackendCapabilities;
  readonly #reacquire: (() => Promise<BrowserWebGPUImageExecutor | null>) | null;
  readonly #maximumReacquisitions: number;
  #device: DeviceGeneration | null = null;
  /** ready: rendering on #device; reacquiring: lost, a replacement is being
   * acquired and work passes to the next backend; closed: permanently. */
  #state: "ready" | "reacquiring" | "closed" = "ready";
  #reacquisitions = 0;
  #terminalError: unknown = null;
  #unregister: (() => void) | null = null;

  constructor(executor: BrowserWebGPUImageExecutor, options: BrowserWebGPUImageBackendOptions = {}) {
    assertExecutor(executor);
    const maximumReacquisitions = options.maximumReacquisitions ?? 3;
    if (!Number.isSafeInteger(maximumReacquisitions) || maximumReacquisitions < 0)
      throw new RangeError("WebGPU re-acquisition limit must be a non-negative safe integer.");
    this.#reacquire = options.reacquire ?? null;
    this.#maximumReacquisitions = maximumReacquisitions;
    this.capabilities = Object.freeze({
      id: "browser-webgpu",
      kind: "accelerated",
      accelerated: true,
      pixelFormats: Object.freeze(["rgba8"] as const),
      colourSpaces: Object.freeze(["linear-srgb"] as const),
      alphaFormats: Object.freeze(["straight"] as const),
      destinations: Object.freeze(["pixels"] as const),
      encodedMimeTypes: Object.freeze([]),
      graphOperations: Object.freeze(["builtin"] as const),
      builtinOperations: supportedBuiltins,
    });
    this.#install(executor);
    if (options.resources) {
      const owner = options.resources.owner;
      this.#unregister = options.resources.register(Object.freeze<RuntimeResourceParticipant>({
        id: `imagefx.webgpu:${owner}:${++participantSequence}`,
        kind: "gpu",
        owner,
        measure: () => this.#device?.executor.measureResidency?.() ?? [],
        reclaim: (request) => request.level === "idle"
          ? this.#device?.executor.releaseIdle?.(request.targetBytes ?? Number.POSITIVE_INFINITY) ?? 0
          : 0,
      }));
    }
  }

  canRender(image: IFXImage, destination: IFXRenderDestination): boolean {
    return this.#state === "ready" && compileJob(image, destination) !== null;
  }

  async render(image: IFXImage, destination: IFXRenderDestination, options: IFXBackendRenderOptions = {}): Promise<IFXRenderResult> {
    const device = this.#device;
    if (this.#state !== "ready" || !device) return Promise.reject(this.#terminalError ?? abortError("WebGPU image backend is unavailable."));
    options.signal?.throwIfAborted();
    const job = compileJob(image, destination);
    if (!job) throw new DOMException("This ImageFX graph is outside the tested WebGPU operation-format matrix.", "NotSupportedError");
    const generation = beginDestination(destination);
    const request: BrowserWebGPUImageExecutionRequest = Object.freeze({ width: job.width, height: job.height, pixels: job.source.copyData(), operation: job.operation });
    const bytes = await Promise.race([device.executor.execute(request, options.signal), device.terminal]);
    options.signal?.throwIfAborted();
    assertDestination(destination, generation);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== job.width * job.height * 4)
      throw new TypeError("WebGPU image output does not match the declared RGBA8 extent.");
    const output = new GFXImage({ width: job.width, height: job.height, alpha: "straight", colourSpace: "linear-srgb", data: bytes });
    publishDestination(destination, generation, output);
    const logicalOutputBytes = bytes.byteLength;
    const work = job.width * job.height;
    return Object.freeze({
      image: output,
      info: Object.freeze({
        width: job.width,
        height: job.height,
        sampleEvaluations: work,
        cacheHits: 0,
        backend: "accelerated" as const,
        tileCount: 1,
        logicalOutputBytes,
        peakBytes: Object.freeze({ output: logicalOutputBytes, scratch: logicalOutputBytes * 8, cache: 0 }),
        work,
        globalPreparationCount: 0,
        tileCacheHits: 0,
        tileCacheEvictions: 0,
      }),
    });
  }

  dispose(): void {
    this.#close(abortError("WebGPU image backend disposed."));
  }

  #install(executor: BrowserWebGPUImageExecutor): void {
    let fail!: (error: unknown) => void;
    const terminal = new Promise<never>((_resolve, reject) => { fail = reject; });
    terminal.catch(() => undefined);
    const device: DeviceGeneration = { executor, terminal, fail };
    this.#device = device;
    this.#state = "ready";
    executor.lost.then((info) => this.#lost(device, info), () => this.#lost(device, {}));
  }

  #lost(device: DeviceGeneration, info: Readonly<{ reason?: string; message?: string }>): void {
    // A stale generation's loss (already replaced or closed) changes nothing.
    if (device !== this.#device || this.#state !== "ready") return;
    const error = abortError(`WebGPU device lost${info.message ? `: ${info.message}` : "."}`);
    this.#device = null;
    this.#terminalError = error;
    device.fail(error);
    try { device.executor.dispose(); } catch { /* the device is already gone */ }
    // "destroyed" is a deliberate teardown, not a fault to recover from; a
    // bounded count stops a device that keeps failing from looping forever.
    const reacquire = this.#reacquire;
    if (info.reason === "destroyed" || !reacquire || this.#reacquisitions >= this.#maximumReacquisitions) {
      this.#close(error);
      return;
    }
    this.#reacquisitions += 1;
    this.#state = "reacquiring";
    void (async () => {
      let next: BrowserWebGPUImageExecutor | null = null;
      try { next = await reacquire(); } catch { next = null; }
      if (this.#state !== "reacquiring") { next?.dispose(); return; }
      if (!next) { this.#close(error); return; }
      try { assertExecutor(next); } catch (invalid) { this.#close(invalid); return; }
      this.#install(next);
    })();
  }

  #close(error: unknown): void {
    if (this.#state === "closed") return;
    this.#state = "closed";
    this.#terminalError = error;
    const device = this.#device;
    this.#device = null;
    const unregister = this.#unregister;
    this.#unregister = null;
    try {
      if (device) {
        device.fail(error);
        device.executor.dispose();
      }
    } finally {
      unregister?.();
    }
  }
}

interface GPUBufferPort {
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}

interface GPUComputePassPort {
  setPipeline(pipeline: GPUPipelinePort): void;
  setBindGroup(index: number, bindGroup: unknown): void;
  dispatchWorkgroups(count: number): void;
  end(): void;
}

interface GPUCommandEncoderPort {
  beginComputePass(): GPUComputePassPort;
  copyBufferToBuffer(source: GPUBufferPort, sourceOffset: number, destination: GPUBufferPort, destinationOffset: number, size: number): void;
  finish(): unknown;
}

interface GPUPipelinePort {
  getBindGroupLayout(index: number): unknown;
}

interface GPUDevicePort {
  readonly lost: Promise<Readonly<{ reason?: string; message?: string }>>;
  readonly queue: {
    writeBuffer(buffer: GPUBufferPort, offset: number, data: ArrayBufferView): void;
    submit(commands: readonly unknown[]): void;
  };
  createBuffer(descriptor: Readonly<{ size: number; usage: number }>): GPUBufferPort;
  createShaderModule(descriptor: Readonly<{ code: string }>): unknown;
  createComputePipeline(descriptor: Readonly<{ layout: "auto"; compute: Readonly<{ module: unknown; entryPoint: string }> }>): GPUPipelinePort;
  createBindGroup(descriptor: Readonly<{ layout: unknown; entries: readonly Readonly<{ binding: number; resource: Readonly<{ buffer: GPUBufferPort }> }>[] }>): unknown;
  createCommandEncoder(): GPUCommandEncoderPort;
  pushErrorScope?(filter: "validation"): void;
  popErrorScope?(): Promise<Readonly<{ message?: string }> | null>;
  destroy(): void;
}

interface GPUAdapterPort { requestDevice(): Promise<GPUDevicePort>; }
interface GPUNavigatorPort { requestAdapter(options?: Readonly<{ powerPreference?: "high-performance" | "low-power" }>): Promise<GPUAdapterPort | null>; }

const GPU_BUFFER_MAP_READ = 0x0001;
const GPU_BUFFER_COPY_SRC = 0x0004;
const GPU_BUFFER_COPY_DST = 0x0008;
const GPU_BUFFER_UNIFORM = 0x0040;
const GPU_BUFFER_STORAGE = 0x0080;
const WORKGROUP_SIZE = 256;
const MAXIMUM_WORKGROUPS = 65_535;
const PARAMETER_BYTES = 16;

type OperationName = BrowserWebGPUImageOperation["name"];

/** One shader per operation kind. Pixels travel as packed RGBA8 words
 * (unpack4x8unorm yields v/255), and the pixel count and gain are uniforms,
 * so the compiled pipeline serves every size and parameter. Output rounds
 * half up, as the CPU path's Math.round does; pack4x8unorm may round ties
 * to even on some adapters (measured: 1 LSB at exact ties on D3D). */
function shaderSource(operation: OperationName): string {
  const transform = operation === "invert"
    ? "let rgb = vec3<f32>(1.0) - colour.rgb;"
    : "let rgb = colour.rgb * parameters.gain;";
  return `
struct Parameters { pixelCount: u32, gain: f32 }
@group(0) @binding(0) var<storage, read> inputPixels: array<u32>;
@group(0) @binding(1) var<storage, read_write> outputPixels: array<u32>;
@group(0) @binding(2) var<uniform> parameters: Parameters;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (index >= parameters.pixelCount) { return; }
  let colour = unpack4x8unorm(inputPixels[index]);
  ${transform}
  let bytes = vec4<u32>(floor(clamp(vec4<f32>(rgb, colour.a), vec4<f32>(0.0), vec4<f32>(1.0)) * 255.0 + vec4<f32>(0.5)));
  outputPixels[index] = bytes.x | (bytes.y << 8u) | (bytes.z << 16u) | (bytes.w << 24u);
}`;
}

/** The exposure gain as the previous per-job shader literal produced it. */
function exposureGain(ev: number): number {
  return Math.fround(Number(Math.pow(2, ev).toFixed(10)));
}

type BufferSet = {
  readonly byteLength: number;
  readonly bytes: number;
  readonly input: GPUBufferPort;
  readonly output: GPUBufferPort;
  readonly readback: GPUBufferPort;
  readonly parameters: GPUBufferPort;
};

export interface BrowserWebGPUImageExecutorOptions {
  /** Bytes of idle buffer sets kept for reuse (default 64 MiB). */
  readonly maximumPooledBytes?: number;
}

function destroyQuietly(buffer: GPUBufferPort) {
  try { buffer.destroy(); } catch { /* device may already be lost */ }
}

class BrowserWebGPUExecutor implements BrowserWebGPUImageExecutor {
  readonly lost: Promise<Readonly<{ reason?: string; message?: string }>>;
  readonly #device: GPUDevicePort;
  readonly #maximumPooledBytes: number;
  readonly #pipelines = new Map<OperationName, GPUPipelinePort>();
  /** Every live set, pooled or in use, for disposal. */
  readonly #sets = new Set<BufferSet>();
  /** Idle sets, least recently released first. */
  #idle: BufferSet[] = [];
  #idleBytes = 0;
  #disposed = false;

  constructor(device: GPUDevicePort, options: BrowserWebGPUImageExecutorOptions = {}) {
    this.#device = device;
    this.lost = device.lost;
    const maximum = options.maximumPooledBytes ?? 64 * 1024 * 1024;
    if (!Number.isSafeInteger(maximum) || maximum < 0) throw new RangeError("WebGPU pooled byte budget must be a non-negative safe integer.");
    this.#maximumPooledBytes = maximum;
  }

  async execute(request: BrowserWebGPUImageExecutionRequest, signal?: AbortSignal): Promise<Uint8Array> {
    if (this.#disposed) throw abortError("WebGPU executor disposed.");
    signal?.throwIfAborted();
    const pixels = request.width * request.height;
    const byteLength = pixels * 4;
    if (request.pixels.byteLength !== byteLength) throw new RangeError("WebGPU image request pixels do not match its extent.");
    const workgroups = Math.ceil(pixels / WORKGROUP_SIZE);
    if (workgroups > MAXIMUM_WORKGROUPS) throw new RangeError("WebGPU image request exceeds the dispatch limit.");
    const set = this.#acquire(byteLength);
    let reusable = false;
    try {
      const parameters = new DataView(new ArrayBuffer(PARAMETER_BYTES));
      parameters.setUint32(0, pixels, true);
      parameters.setFloat32(4, request.operation.name === "exposure" ? exposureGain(request.operation.ev) : 0, true);
      this.#device.queue.writeBuffer(set.input, 0, request.pixels);
      this.#device.queue.writeBuffer(set.parameters, 0, parameters);
      this.#device.pushErrorScope?.("validation");
      const pipeline = this.#pipeline(request.operation.name);
      const bindGroup = this.#device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: Object.freeze([
          Object.freeze({ binding: 0, resource: Object.freeze({ buffer: set.input }) }),
          Object.freeze({ binding: 1, resource: Object.freeze({ buffer: set.output }) }),
          Object.freeze({ binding: 2, resource: Object.freeze({ buffer: set.parameters }) }),
        ]),
      });
      const encoder = this.#device.createCommandEncoder(), pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(workgroups);
      pass.end();
      encoder.copyBufferToBuffer(set.output, 0, set.readback, 0, byteLength);
      this.#device.queue.submit([encoder.finish()]);
      const validation = await this.#device.popErrorScope?.();
      if (validation) {
        // The cached pipeline may be the invalid object; compile afresh next time.
        this.#pipelines.delete(request.operation.name);
        throw new Error(validation.message ? `WebGPU validation failed: ${validation.message}` : "WebGPU validation failed.");
      }
      signal?.throwIfAborted();
      await set.readback.mapAsync(GPU_BUFFER_MAP_READ);
      const bytes = new Uint8Array(set.readback.getMappedRange().slice(0, byteLength));
      set.readback.unmap();
      signal?.throwIfAborted();
      reusable = true;
      return bytes;
    } finally {
      // A set whose job failed may be mid-map or bound to an invalid object:
      // it is destroyed rather than pooled.
      if (reusable) this.#release(set);
      else this.#destroySet(set);
    }
  }

  *measureResidency(): Iterable<RuntimeResourceBacking> {
    const idle = new Set(this.#idle);
    for (const set of this.#sets) yield Object.freeze({ key: set, bytes: set.bytes, state: idle.has(set) ? "idle" as const : "active" as const });
  }

  releaseIdle(targetBytes: number): number {
    let released = 0;
    while (released < targetBytes && this.#idle.length > 0) {
      const set = this.#idle.shift()!;
      this.#idleBytes -= set.bytes;
      released += set.bytes;
      this.#destroySet(set);
    }
    return released;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const set of [...this.#sets]) this.#destroySet(set);
    this.#idle = [];
    this.#idleBytes = 0;
    this.#pipelines.clear();
    try { this.#device.destroy(); } catch { /* already lost */ }
  }

  #pipeline(operation: OperationName): GPUPipelinePort {
    let pipeline = this.#pipelines.get(operation);
    if (!pipeline) {
      const module = this.#device.createShaderModule({ code: shaderSource(operation) });
      pipeline = this.#device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } });
      this.#pipelines.set(operation, pipeline);
    }
    return pipeline;
  }

  #acquire(byteLength: number): BufferSet {
    const index = this.#idle.findIndex((candidate) => candidate.byteLength === byteLength);
    if (index >= 0) {
      const [set] = this.#idle.splice(index, 1);
      this.#idleBytes -= set!.bytes;
      return set!;
    }
    const set: BufferSet = {
      byteLength,
      bytes: byteLength * 3 + PARAMETER_BYTES,
      input: this.#device.createBuffer({ size: byteLength, usage: GPU_BUFFER_STORAGE | GPU_BUFFER_COPY_DST }),
      output: this.#device.createBuffer({ size: byteLength, usage: GPU_BUFFER_STORAGE | GPU_BUFFER_COPY_SRC }),
      readback: this.#device.createBuffer({ size: byteLength, usage: GPU_BUFFER_MAP_READ | GPU_BUFFER_COPY_DST }),
      parameters: this.#device.createBuffer({ size: PARAMETER_BYTES, usage: GPU_BUFFER_UNIFORM | GPU_BUFFER_COPY_DST }),
    };
    this.#sets.add(set);
    return set;
  }

  #release(set: BufferSet): void {
    if (this.#disposed || set.bytes > this.#maximumPooledBytes) {
      this.#destroySet(set);
      return;
    }
    this.#idle.push(set);
    this.#idleBytes += set.bytes;
    while (this.#idleBytes > this.#maximumPooledBytes) {
      const evicted = this.#idle.shift()!;
      this.#idleBytes -= evicted.bytes;
      this.#destroySet(evicted);
    }
  }

  #destroySet(set: BufferSet): void {
    if (!this.#sets.delete(set)) return;
    destroyQuietly(set.input);
    destroyQuietly(set.output);
    destroyQuietly(set.readback);
    destroyQuietly(set.parameters);
  }
}

/** @internal The executor over an acquired device; exported for tests. */
export function createBrowserWebGPUImageExecutor(device: GPUDevicePort, options?: BrowserWebGPUImageExecutorOptions): BrowserWebGPUImageExecutor {
  return new BrowserWebGPUExecutor(device, options);
}

async function acquireExecutor(gpu: GPUNavigatorPort, options: BrowserWebGPUImageExecutorOptions): Promise<BrowserWebGPUImageExecutor | null> {
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return null;
    return new BrowserWebGPUExecutor(await adapter.requestDevice(), options);
  } catch {
    return null;
  }
}

export interface BrowserWebGPUImageProcessingBackendFactoryOptions extends BrowserWebGPUImageExecutorOptions {
  readonly resources?: BrowserWebGPUResourceAccounting;
}

/** Acquires a device lazily; after an unexpected device loss the backend
 * requests a fresh adapter and device, passing work on meanwhile. */
export async function createBrowserWebGPUImageProcessingBackend(
  options: BrowserWebGPUImageProcessingBackendFactoryOptions = {},
): Promise<BrowserWebGPUImageProcessingBackend | null> {
  const gpu = (globalThis.navigator as Navigator & { readonly gpu?: GPUNavigatorPort } | undefined)?.gpu;
  if (!gpu || typeof gpu.requestAdapter !== "function") return null;
  const executorOptions = options.maximumPooledBytes === undefined ? {} : { maximumPooledBytes: options.maximumPooledBytes };
  const executor = await acquireExecutor(gpu, executorOptions);
  if (!executor) return null;
  return new BrowserWebGPUImageProcessingBackend(executor, {
    ...(options.resources ? { resources: options.resources } : {}),
    reacquire: () => acquireExecutor(gpu, executorOptions),
  });
}
