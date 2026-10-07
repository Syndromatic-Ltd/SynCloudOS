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

import { GFXImage, type GFXAlphaFormat, type GFXPixelFormat } from "../../FX/GraphicsFX/GFXImage";
import type { GFXColourSpace } from "../../FX/GraphicsFX/colourTypes";
import {
  IFX_DEFAULT_TRANSPORT_PIXEL_BYTES,
  materializeIFXGraphTransport,
  planIFXGraphTransport,
  type IFXGraphTransport,
  type IFXGraphTransportPlan,
  type IFXTransportableGraphPlan,
  type IFXTransportGraph,
} from "../../FX/ImageFX/IFXGraphTransport";
import type { IFXImage } from "../../FX/ImageFX/IFXImage";
import { assertDestination, beginDestination, publishDestination, type IFXRenderDestination } from "../../FX/ImageFX/IFXRenderDestination";
import type { IFXBackendRenderOptions, IFXRenderBackend, IFXRenderBackendCapabilities } from "../../FX/ImageFX/IFXRenderBackend";
import { IFXRenderPipeline } from "../../FX/ImageFX/IFXRenderPipeline";
import type { IFXRenderInfo, IFXRenderResult } from "../../FX/ImageFX/IFXRenderTask";
import imageProcessingWorkerURL from "./image-processing.worker.ts?worker&url";
import { createHeavyJobAdmission } from "../HostServices/PlatformAdapterRuntimeServices";
import type { HeavyJobAdmissionPort, HeavyJobLease } from "../HostServices/PlatformAdapterRuntimePorts";
import { createBrowserWebGPUImageProcessingBackend, type BrowserWebGPUResourceAccounting } from "./BrowserWebGPUImageProcessingBackend";

type WorkerGraph = IFXTransportGraph;
export interface IFXEncodedImageMetadata {
  readonly width: number;
  readonly height: number;
  readonly mimeType: "image/png" | "image/webp";
  readonly colourSpace: "srgb";
  readonly orientation: "up";
}
export interface IFXCanvasImageMetadata {
  readonly width: number;
  readonly height: number;
  readonly colourSpace: "srgb";
  readonly orientation: "up";
}
export interface BrowserImageProcessingWorkerOptions {
  readonly encoded?: boolean;
  readonly webp?: boolean;
  readonly offscreenCanvas?: boolean;
  /** Largest distinct source pixel payload one job may transfer. Graphs above
   * it are ineligible here and reach the pipeline's next backend or fallback. */
  readonly maximumJobBytes?: number;
  /** Shared heavy-job admission (for example the runtime's `jobs`). Without
   * one the backend admits at most two jobs of its own at a time. */
  readonly admission?: HeavyJobAdmissionPort;
  /** Owner reported to admission for fairness and diagnostics. */
  readonly owner?: string;
}

let backendSequence = 0;
export type IFXImageWorkerRequest =
  | Readonly<{ id: number; operation: "render-pixels"; graph: WorkerGraph; destination: Readonly<{ bounds: Readonly<{ x: number; y: number; width: number; height: number }>; colourSpace: GFXColourSpace; alpha: GFXAlphaFormat }>; interpolation: "nearest" | "linear" }>
  | Readonly<{ id: number; operation: "render-encoded"; graph: WorkerGraph; format: "image/png" | "image/webp"; colourSpace: "srgb"; orientation: "up"; interpolation: "nearest" | "linear" }>
  | Readonly<{ id: number; operation: "render-canvas"; graph: WorkerGraph; canvas: OffscreenCanvas; colourSpace: "srgb"; orientation: "up"; interpolation: "nearest" | "linear" }>
  | Readonly<{ id: number; operation: "cancel" }>;

export type IFXImageWorkerResponse =
  | Readonly<{ id: number; ok: true; kind: "pixels"; value: Readonly<{ image: Readonly<{ width: number; height: number; bytesPerRow: number; pixelFormat: GFXPixelFormat; alpha: GFXAlphaFormat; colourSpace: GFXColourSpace; data: ArrayBuffer }>; info: IFXRenderInfo }> }>
  | Readonly<{ id: number; ok: true; kind: "encoded"; value: Readonly<{ blob: Blob; metadata: IFXEncodedImageMetadata }> }>
  | Readonly<{ id: number; ok: true; kind: "canvas"; value: Readonly<{ metadata: IFXCanvasImageMetadata }> }>
  | Readonly<{ id: number; ok: false; error: Readonly<{ name: string; message: string }> }>;

interface Pending {
  readonly resolve: (result: IFXRenderResult) => void;
  readonly reject: (error: unknown) => void;
  readonly destination: IFXRenderDestination;
  readonly generation: number;
  readonly signal?: AbortSignal;
  readonly onAbort?: () => void;
}
interface ValuePending<T> {
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
  readonly signal?: AbortSignal;
  readonly onAbort?: () => void;
}

function errorFrom(value: Readonly<{ name: string; message: string }>): Error {
  if (typeof DOMException === "function") return new DOMException(value.message, value.name);
  const error = new Error(value.message); error.name = value.name; return error;
}

function boundedJobBytes(value: unknown): number {
  const selected = value ?? IFX_DEFAULT_TRANSPORT_PIXEL_BYTES;
  if (!Number.isSafeInteger(selected) || Number(selected) < 1)
    throw new RangeError("Image worker maximumJobBytes must be a positive safe integer.");
  return Number(selected);
}

export class BrowserImageProcessingWorker implements IFXRenderBackend {
  readonly capabilities: IFXRenderBackendCapabilities;
  readonly #worker: Worker;
  readonly #maximumJobBytes: number;
  readonly #pending = new Map<number, Pending>();
  readonly #encodedPending = new Map<number, ValuePending<Readonly<{ blob: Blob; metadata: IFXEncodedImageMetadata }>>>();
  readonly #canvasPending = new Map<number, ValuePending<IFXCanvasImageMetadata>>();
  readonly #admission: HeavyJobAdmissionPort;
  readonly #owner: string;
  /** Admission leases by request ID, held until the worker answers that
   * request (after cancellation too) or the worker fails. */
  readonly #leases = new Map<number, HeavyJobLease>();
  readonly #destinationKeys = new WeakMap<IFXRenderDestination, string>();
  readonly #backendId = ++backendSequence;
  #destinationSequence = 0;
  #sequence = 0;
  #disposed = false;

  constructor(worker: Worker, options: BrowserImageProcessingWorkerOptions = {}) {
    if (!worker || typeof worker.postMessage !== "function" || typeof worker.terminate !== "function")
      throw new TypeError("Image processing Worker required.");
    this.#worker = worker;
    this.#maximumJobBytes = boundedJobBytes(options.maximumJobBytes);
    this.#admission = options.admission ?? createHeavyJobAdmission({ concurrency: 2, maximumBytes: 1024 * 1024 * 1024, maximumQueued: 64 });
    this.#owner = options.owner ?? "imagefx";
    const destinations: ("pixels" | "encoded-blob" | "offscreen-canvas")[] = ["pixels"];
    if (options.encoded === true) destinations.push("encoded-blob");
    if (options.offscreenCanvas === true) destinations.push("offscreen-canvas");
    const encodedMimeTypes: ("image/png" | "image/webp")[] = options.encoded === true
      ? ["image/png", ...(options.webp === true ? ["image/webp" as const] : [])]
      : [];
    this.capabilities = Object.freeze({
      id: "browser-worker-cpu",
      kind: "worker-cpu",
      accelerated: false,
      pixelFormats: Object.freeze(["rgba8", "bgra8", "rgb8", "gray8", "a8", "rgba-float"] as const),
      sampleFormats: Object.freeze(["unorm8", "float16", "float32"] as const),
      colourSpaces: Object.freeze(["srgb", "linear-srgb", "display-p3", "grayscale"] as const),
      alphaFormats: Object.freeze(["straight", "opaque", "premultiplied"] as const),
      destinations: Object.freeze(destinations),
      encodedMimeTypes: Object.freeze(encodedMimeTypes),
      graphOperations: Object.freeze(["builtin", "portable-kernel", "custom-processor"] as const),
    });
    worker.addEventListener("message", this.#onMessage);
    worker.addEventListener("error", this.#onError);
  }

  canRender(image: IFXImage, destination: IFXRenderDestination): boolean {
    if (this.#disposed) return false;
    if (!this.capabilities.colourSpaces.includes(destination.colourSpace)) return false;
    if (!this.capabilities.alphaFormats.includes(destination.alpha)) return false;
    return this.#ineligibility(planIFXGraphTransport(image)) === null;
  }

  /** Why a plan cannot run here, from graph metadata only; null when eligible. */
  #ineligibility(plan: IFXGraphTransportPlan): DOMException | null {
    if (!plan.transportable || plan.localOnlyProcessors > 0
      || plan.pixelFormats.some(format => !(this.capabilities.pixelFormats as readonly string[]).includes(format))
      || plan.sampleFormats.some(format => !this.capabilities.sampleFormats!.includes(format)))
      return new DOMException("This ImageFX graph is not worker-transferable.", "NotSupportedError");
    if (plan.pixelBytes > this.#maximumJobBytes)
      return new DOMException("This ImageFX graph exceeds the worker job pixel budget.", "QuotaExceededError");
    return null;
  }

  /** The eligible plan for a job. Throws the ineligibility reason; callers
   * convert it into a rejected Promise. */
  #eligiblePlan(image: IFXImage): IFXTransportableGraphPlan {
    const plan = planIFXGraphTransport(image);
    const reason = this.#ineligibility(plan);
    if (reason || !plan.transportable) throw reason;
    return plan;
  }

  #destinationKey(destination: IFXRenderDestination): string {
    let key = this.#destinationKeys.get(destination);
    if (!key) {
      key = `imagefx:${this.#backendId}:${++this.#destinationSequence}`;
      this.#destinationKeys.set(destination, key);
    }
    return key;
  }

  /**
   * Admits a job, then materialises and posts its payload: nothing is copied
   * for a job that is still waiting, superseded or cancelled. A job waiting
   * for the same destination as a newer render is superseded without being
   * allocated. Admission is synchronous while capacity is free.
   */
  #dispatch<T>(
    plan: IFXTransportableGraphPlan,
    job: Readonly<{ bytes: number; signal?: AbortSignal; supersedeKey?: string; beforeMaterialise?: () => void }>,
    post: (id: number, packed: IFXGraphTransport) => Promise<T>,
  ): Promise<T> {
    const request = { owner: this.#owner, kind: "imagefx.render", bytes: job.bytes, signal: job.signal, supersedeKey: job.supersedeKey };
    const start = (lease: HeavyJobLease): Promise<T> => {
      try {
        if (this.#disposed) throw new DOMException("Image worker backend is disposed.", "AbortError");
        job.signal?.throwIfAborted();
        job.beforeMaterialise?.();
        const packed = materializeIFXGraphTransport(plan);
        const id = ++this.#sequence;
        this.#leases.set(id, lease);
        return post(id, packed);
      } catch (error) {
        lease.release();
        return Promise.reject(error);
      }
    };
    let lease: HeavyJobLease | null;
    try { lease = this.#admission.tryAdmit(request); } catch (error) { return Promise.reject(error); }
    return lease ? start(lease) : this.#admission.admit(request).then(start);
  }

  #releaseLease(id: number): void {
    const lease = this.#leases.get(id);
    if (!lease) return;
    this.#leases.delete(id);
    lease.release();
  }

  render(image: IFXImage, destination: IFXRenderDestination, options: IFXBackendRenderOptions = {}): Promise<IFXRenderResult> {
    if (this.#disposed) return Promise.reject(new DOMException("Image worker backend is disposed.", "AbortError"));
    let plan: IFXTransportableGraphPlan, generation: number;
    try {
      options.signal?.throwIfAborted();
      plan = this.#eligiblePlan(image);
      generation = beginDestination(destination);
    } catch (error) { return Promise.reject(error); }
    const outputBytes = destination.bounds.width * destination.bounds.height * 4;
    return this.#dispatch(plan, {
      bytes: plan.pixelBytes + outputBytes,
      signal: options.signal,
      supersedeKey: this.#destinationKey(destination),
      beforeMaterialise: () => assertDestination(destination, generation),
    }, (id, packed) => {
    const request: IFXImageWorkerRequest = Object.freeze({
      id, operation: "render-pixels", graph: packed.graph,
      destination: Object.freeze({ bounds: destination.bounds, colourSpace: destination.colourSpace, alpha: destination.alpha }),
      interpolation: options.interpolation ?? "linear",
    });
    return new Promise<IFXRenderResult>((resolve, reject) => {
      const onAbort = () => {
        if (!this.#pending.delete(id)) return;
        try { this.#worker.postMessage(Object.freeze({ id, operation: "cancel" }) satisfies IFXImageWorkerRequest); } catch { /* worker may already be gone */ }
        reject(options.signal?.reason ?? new DOMException("Image worker render cancelled.", "AbortError"));
      };
      this.#pending.set(id, { resolve, reject, destination, generation, signal: options.signal, onAbort });
      options.signal?.addEventListener("abort", onAbort, { once: true });
      try { this.#worker.postMessage(request, [...packed.transfer]); }
      catch (error) {
        options.signal?.removeEventListener("abort", onAbort);
        this.#pending.delete(id);
        this.#releaseLease(id);
        reject(error);
      }
    });
    });
  }

  renderEncoded(image: IFXImage, options: Readonly<{ format: "image/png" | "image/webp"; colourSpace?: "srgb"; orientation?: "up"; signal?: AbortSignal; interpolation?: "nearest" | "linear" }>): Promise<Readonly<{ blob: Blob; metadata: IFXEncodedImageMetadata }>> {
    if (!this.capabilities.destinations.includes("encoded-blob"))
      return Promise.reject(new DOMException("Encoded worker output is unavailable.", "NotSupportedError"));
    if (!options || !this.capabilities.encodedMimeTypes.includes(options.format) || (options.colourSpace ?? "srgb") !== "srgb" || (options.orientation ?? "up") !== "up")
      return Promise.reject(new DOMException("Encoded worker output only supports sRGB/up PNG or WebP.", "NotSupportedError"));
    if (this.#disposed) return Promise.reject(new DOMException("Image worker backend is disposed.", "AbortError"));
    let plan: IFXTransportableGraphPlan;
    try {
      options.signal?.throwIfAborted();
      plan = this.#eligiblePlan(image);
    } catch (error) { return Promise.reject(error); }
    return this.#dispatch(plan, { bytes: plan.pixelBytes * 2, signal: options.signal }, (id, packed) => {
    const request: IFXImageWorkerRequest = Object.freeze({
      id, operation: "render-encoded", graph: packed.graph, format: options.format,
      colourSpace: "srgb", orientation: "up", interpolation: options.interpolation ?? "linear",
    });
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        if (!this.#encodedPending.delete(id)) return;
        try { this.#worker.postMessage(Object.freeze({ id, operation: "cancel" }) satisfies IFXImageWorkerRequest); } catch { /* worker may already be gone */ }
        reject(options.signal?.reason ?? new DOMException("Image worker encoding cancelled.", "AbortError"));
      };
      this.#encodedPending.set(id, { resolve, reject, signal: options.signal, onAbort });
      options.signal?.addEventListener("abort", onAbort, { once: true });
      try { this.#worker.postMessage(request, [...packed.transfer]); }
      catch (error) {
        options.signal?.removeEventListener("abort", onAbort);
        this.#encodedPending.delete(id);
        this.#releaseLease(id);
        reject(error);
      }
    });
    });
  }

  renderToOffscreenCanvas(image: IFXImage, canvas: OffscreenCanvas, options: Readonly<{ signal?: AbortSignal; interpolation?: "nearest" | "linear" }> = {}): Promise<IFXCanvasImageMetadata> {
    if (!this.capabilities.destinations.includes("offscreen-canvas"))
      return Promise.reject(new DOMException("OffscreenCanvas worker output is unavailable.", "NotSupportedError"));
    if (!canvas || typeof canvas !== "object")
      return Promise.reject(new TypeError("OffscreenCanvas required."));
    if (this.#disposed) return Promise.reject(new DOMException("Image worker backend is disposed.", "AbortError"));
    let plan: IFXTransportableGraphPlan;
    try {
      options.signal?.throwIfAborted();
      plan = this.#eligiblePlan(image);
    } catch (error) { return Promise.reject(error); }
    return this.#dispatch(plan, { bytes: plan.pixelBytes * 2, signal: options.signal }, (id, packed) => {
    const request: IFXImageWorkerRequest = Object.freeze({
      id, operation: "render-canvas", graph: packed.graph, canvas,
      colourSpace: "srgb", orientation: "up", interpolation: options.interpolation ?? "linear",
    });
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        if (!this.#canvasPending.delete(id)) return;
        try { this.#worker.postMessage(Object.freeze({ id, operation: "cancel" }) satisfies IFXImageWorkerRequest); } catch { /* worker may already be gone */ }
        reject(options.signal?.reason ?? new DOMException("Image worker canvas render cancelled.", "AbortError"));
      };
      this.#canvasPending.set(id, { resolve, reject, signal: options.signal, onAbort });
      options.signal?.addEventListener("abort", onAbort, { once: true });
      try { this.#worker.postMessage(request, [...packed.transfer, canvas]); }
      catch (error) {
        options.signal?.removeEventListener("abort", onAbort);
        this.#canvasPending.delete(id);
        this.#releaseLease(id);
        reject(error);
      }
    });
    });
  }

  dispose(): void { this.#fail(new DOMException("Image worker backend disposed.", "AbortError")); }

  #onMessage = (event: MessageEvent<IFXImageWorkerResponse>) => {
    const response = event.data;
    // The worker has finished with this job (result, error or cancellation).
    this.#releaseLease(response.id);
    const pixelPending = this.#pending.get(response.id);
    const encodedPending = this.#encodedPending.get(response.id);
    const canvasPending = this.#canvasPending.get(response.id);
    if (!pixelPending && !encodedPending && !canvasPending) return;
    this.#pending.delete(response.id);
    this.#encodedPending.delete(response.id);
    this.#canvasPending.delete(response.id);
    pixelPending?.signal?.removeEventListener("abort", pixelPending.onAbort!);
    encodedPending?.signal?.removeEventListener("abort", encodedPending.onAbort!);
    canvasPending?.signal?.removeEventListener("abort", canvasPending.onAbort!);
    const pending = pixelPending ?? encodedPending ?? canvasPending!;
    if (!response.ok) { pending.reject(errorFrom(response.error)); return; }
    try {
      if (response.kind === "pixels") {
        if (!pixelPending) throw new TypeError("Unexpected pixel worker response.");
        assertDestination(pixelPending.destination, pixelPending.generation);
        const descriptor = response.value.image;
        if (!(descriptor.data instanceof ArrayBuffer)) throw new TypeError("Worker image payload must own an ArrayBuffer.");
        const image = new GFXImage({ width: descriptor.width, height: descriptor.height, bytesPerRow: descriptor.bytesPerRow, pixelFormat: descriptor.pixelFormat, alpha: descriptor.alpha, colourSpace: descriptor.colourSpace, data: new Uint8Array(descriptor.data) });
        publishDestination(pixelPending.destination, pixelPending.generation, image);
        pixelPending.resolve(Object.freeze({ image, info: Object.freeze({ ...response.value.info, backend: "worker-cpu" as const }) }));
        return;
      }
      if (response.kind === "encoded") {
        if (!encodedPending) throw new TypeError("Unexpected encoded worker response.");
        if (!(response.value.blob instanceof Blob)) throw new TypeError("Worker encoded payload must contain a Blob.");
        encodedPending.resolve(Object.freeze({ blob: response.value.blob, metadata: Object.freeze(response.value.metadata) }));
        return;
      }
      if (!canvasPending) throw new TypeError("Unexpected canvas worker response.");
      canvasPending.resolve(Object.freeze(response.value.metadata));
    } catch (error) { pending.reject(error); }
  };

  #onError = (event: ErrorEvent) => this.#fail(event.error instanceof Error ? event.error : new Error(event.message || "Image processing worker failed."));

  #fail(error: unknown): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#worker.removeEventListener("message", this.#onMessage);
    this.#worker.removeEventListener("error", this.#onError);
    for (const id of [...this.#leases.keys()]) this.#releaseLease(id);
    for (const [id, pending] of this.#pending) {
      pending.signal?.removeEventListener("abort", pending.onAbort!);
      pending.reject(error);
      this.#pending.delete(id);
    }
    for (const [id, pending] of this.#encodedPending) {
      pending.signal?.removeEventListener("abort", pending.onAbort!);
      pending.reject(error);
      this.#encodedPending.delete(id);
    }
    for (const [id, pending] of this.#canvasPending) {
      pending.signal?.removeEventListener("abort", pending.onAbort!);
      pending.reject(error);
      this.#canvasPending.delete(id);
    }
    this.#worker.terminate();
  }
}

/** Admission and budget choices for a browser image pipeline. Pass the
 * runtime's `jobs` so image work shares capacity with other heavy jobs. */
export interface BrowserImageProcessingPipelineOptions {
  readonly admission?: HeavyJobAdmissionPort;
  readonly owner?: string;
  readonly maximumJobBytes?: number;
  /** Where the accelerated backend reports its device residency (runtime.resources). */
  readonly resources?: BrowserWebGPUResourceAccounting;
}

export function createBrowserImageProcessingWorkerBackend(options: BrowserImageProcessingPipelineOptions = {}): BrowserImageProcessingWorker | null {
  if (typeof Worker !== "function") return null;
  const offscreenCanvas = typeof OffscreenCanvas === "function";
  const webp = offscreenCanvas && typeof OffscreenCanvas.prototype.convertToBlob === "function";
  const worker = new Worker(imageProcessingWorkerURL, { type: "module", name: "syncloudos-image-processing" });
  return new BrowserImageProcessingWorker(worker, {
    ...options,
    encoded: typeof Blob === "function",
    webp,
    offscreenCanvas,
  });
}

export function createBrowserImageProcessingPipeline(options: BrowserImageProcessingPipelineOptions = {}): IFXRenderPipeline {
  return new IFXRenderPipeline(createBrowserImageProcessingWorkerBackend(options));
}

export async function createBrowserAcceleratedImageProcessingPipeline(options: BrowserImageProcessingPipelineOptions = {}): Promise<IFXRenderPipeline> {
  const accelerated = await createBrowserWebGPUImageProcessingBackend(options.resources ? { resources: options.resources } : {});
  const worker = createBrowserImageProcessingWorkerBackend(options);
  return new IFXRenderPipeline([
    ...(accelerated ? [accelerated] : []),
    ...(worker ? [worker] : []),
  ]);
}
