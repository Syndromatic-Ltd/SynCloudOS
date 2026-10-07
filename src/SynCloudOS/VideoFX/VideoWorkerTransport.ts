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
} from "../../FX/ImageFX/IFXGraphTransport";
import type { IFXImage } from "../../FX/ImageFX/IFXImage";
import { assertDestination, beginDestination, publishDestination, type IFXRenderDestination } from "../../FX/ImageFX/IFXRenderDestination";
import type { IFXBackendRenderOptions, IFXRenderBackend, IFXRenderBackendCapabilities } from "../../FX/ImageFX/IFXRenderBackend";
import type { IFXRenderInfo, IFXRenderResult } from "../../FX/ImageFX/IFXRenderTask";
import videoProcessingWorkerURL from "../PlatformAdapters/video-processing.worker.ts?worker&url";

type WorkerGraph = Readonly<{ version: 2; nodes: readonly Readonly<Record<string, unknown>>[]; output: number }>;

export type VFXVideoWorkerRequest =
  | Readonly<{
      ownerId: string;
      generation: number;
      id: number;
      operation: "render-pixels";
      graph: WorkerGraph;
      destination: Readonly<{ bounds: Readonly<{ x: number; y: number; width: number; height: number }>; colourSpace: GFXColourSpace; alpha: GFXAlphaFormat }>;
      interpolation: "nearest" | "linear";
    }>
  | Readonly<{ ownerId: string; generation: number; id: number; operation: "cancel" }>;

export type VFXVideoWorkerResponse =
  | Readonly<{
      ownerId: string;
      generation: number;
      id: number;
      ok: true;
      value: Readonly<{
        image: Readonly<{
          width: number;
          height: number;
          bytesPerRow: number;
          pixelFormat: GFXPixelFormat;
          alpha: GFXAlphaFormat;
          colourSpace: GFXColourSpace;
          data: ArrayBuffer;
        }>;
        info: IFXRenderInfo;
      }>;
    }>
  | Readonly<{ ownerId: string; generation: number; id: number; ok: false; error: Readonly<{ name: string; message: string }> }>;

export interface VideoWorkerTransportOptions {
  readonly ownerId: string;
  readonly maximumOutstanding?: number;
}

interface Pending {
  readonly generation: number;
  readonly destination: IFXRenderDestination;
  readonly destinationGeneration: number;
  readonly resolve: (result: IFXRenderResult) => void;
  readonly reject: (error: unknown) => void;
  readonly signal?: AbortSignal;
  readonly onAbort: () => void;
}

function boundedOutstanding(value: unknown): number {
  const selected = value ?? 4;
  if (!Number.isSafeInteger(selected) || Number(selected) < 1 || Number(selected) > 64)
    throw new RangeError("Video worker maximumOutstanding must be between 1 and 64.");
  return Number(selected);
}

function owner(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.test(value))
    throw new TypeError("Video worker ownerId is invalid.");
  return value;
}

function errorFrom(value: Readonly<{ name: string; message: string }>): Error {
  if (typeof DOMException === "function") return new DOMException(value.message, value.name);
  const error = new Error(value.message); error.name = value.name; return error;
}

const videoPixelFormats: ReadonlySet<string> = new Set(["rgba8", "bgra8", "rgb8", "gray8", "a8"]);

/** Video frame graphs are byte-only and may not carry custom processors. */
function videoTransportable(plan: IFXGraphTransportPlan): boolean {
  return plan.transportable && plan.version === 2 && plan.customProcessors === 0
    && plan.pixelFormats.every(format => videoPixelFormats.has(format))
    && plan.pixelBytes <= IFX_DEFAULT_TRANSPORT_PIXEL_BYTES;
}

export class VideoWorkerTransport implements IFXRenderBackend {
  readonly capabilities: IFXRenderBackendCapabilities = Object.freeze({
    id: "video-worker-cpu",
    kind: "worker-cpu",
    accelerated: false,
    pixelFormats: Object.freeze(["rgba8", "bgra8", "rgb8", "gray8", "a8"] as const),
    colourSpaces: Object.freeze(["srgb", "linear-srgb", "display-p3", "grayscale"] as const),
    alphaFormats: Object.freeze(["straight", "opaque", "premultiplied"] as const),
    destinations: Object.freeze(["pixels"] as const),
    encodedMimeTypes: Object.freeze([]),
    graphOperations: Object.freeze(["builtin", "portable-kernel"] as const),
  });

  readonly #worker: Worker;
  readonly #ownerId: string;
  readonly #maximumOutstanding: number;
  readonly #pending = new Map<number, Pending>();
  #sequence = 0;
  #generation = 1;
  #disposed = false;

  constructor(worker: Worker, options: VideoWorkerTransportOptions) {
    if (!worker || typeof worker.postMessage !== "function" || typeof worker.terminate !== "function")
      throw new TypeError("Video processing Worker required.");
    this.#worker = worker;
    this.#ownerId = owner(options?.ownerId);
    this.#maximumOutstanding = boundedOutstanding(options?.maximumOutstanding);
    worker.addEventListener("message", this.#onMessage);
    worker.addEventListener("error", this.#onError);
  }

  get ownerId(): string { return this.#ownerId; }
  get generation(): number { return this.#generation; }
  get outstandingCount(): number { return this.#pending.size; }

  canRender(image: IFXImage, destination: IFXRenderDestination): boolean {
    if (this.#disposed) return false;
    if (!this.capabilities.colourSpaces.includes(destination.colourSpace) || !this.capabilities.alphaFormats.includes(destination.alpha)) return false;
    return videoTransportable(planIFXGraphTransport(image));
  }

  render(image: IFXImage, destination: IFXRenderDestination, options: IFXBackendRenderOptions = {}): Promise<IFXRenderResult> {
    if (this.#disposed) return Promise.reject(new DOMException("Video worker transport is disposed.", "AbortError"));
    try { options.signal?.throwIfAborted(); } catch (error) { return Promise.reject(error); }
    if (this.#pending.size >= this.#maximumOutstanding)
      return Promise.reject(new DOMException("Video worker outstanding-operation limit exceeded.", "QuotaExceededError"));
    let packed: IFXGraphTransport, destinationGeneration: number;
    try {
      const plan = planIFXGraphTransport(image);
      if (!videoTransportable(plan))
        throw new DOMException("This VideoFX ImageFX graph is not worker-transferable.", "NotSupportedError");
      packed = materializeIFXGraphTransport(plan);
      destinationGeneration = beginDestination(destination);
    } catch (error) { return Promise.reject(error); }
    const id = ++this.#sequence, generation = this.#generation;
    const request: VFXVideoWorkerRequest = Object.freeze({
      ownerId: this.#ownerId,
      generation,
      id,
      operation: "render-pixels",
      graph: packed.graph as WorkerGraph,
      destination: Object.freeze({ bounds: destination.bounds, colourSpace: destination.colourSpace, alpha: destination.alpha }),
      interpolation: options.interpolation ?? "linear",
    });
    return new Promise<IFXRenderResult>((resolve, reject) => {
      const onAbort = () => {
        if (!this.#pending.delete(id)) return;
        try {
          this.#worker.postMessage(Object.freeze({ ownerId: this.#ownerId, generation, id, operation: "cancel" }) satisfies VFXVideoWorkerRequest);
        } catch { /* worker may already be gone */ }
        reject(options.signal?.reason ?? new DOMException("Video processing cancelled.", "AbortError"));
      };
      this.#pending.set(id, { generation, destination, destinationGeneration, resolve, reject, signal: options.signal, onAbort });
      options.signal?.addEventListener("abort", onAbort, { once: true });
      try { this.#worker.postMessage(request, [...packed.transfer]); }
      catch (error) {
        options.signal?.removeEventListener("abort", onAbort);
        this.#pending.delete(id);
        reject(error);
      }
    });
  }

  reset(reason: unknown = new DOMException("Video worker generation reset.", "AbortError")): void {
    if (this.#disposed) return;
    const generation = this.#generation;
    this.#generation += 1;
    for (const [id, pending] of [...this.#pending]) {
      if (pending.generation !== generation) continue;
      pending.signal?.removeEventListener("abort", pending.onAbort);
      this.#pending.delete(id);
      try { this.#worker.postMessage(Object.freeze({ ownerId: this.#ownerId, generation, id, operation: "cancel" }) satisfies VFXVideoWorkerRequest); } catch { /* ignore */ }
      pending.reject(reason);
    }
  }

  dispose(): void {
    this.#fail(new DOMException("Video worker transport disposed.", "AbortError"));
  }

  #onMessage = (event: MessageEvent<VFXVideoWorkerResponse>) => {
    const response = event.data;
    if (!response || typeof response !== "object" || response.ownerId !== this.#ownerId || !Number.isSafeInteger(response.id) || !Number.isSafeInteger(response.generation)) return;
    const pending = this.#pending.get(response.id);
    if (!pending || response.generation !== pending.generation || response.generation !== this.#generation) return;
    this.#pending.delete(response.id);
    pending.signal?.removeEventListener("abort", pending.onAbort);
    if (!response.ok) { pending.reject(errorFrom(response.error)); return; }
    try {
      assertDestination(pending.destination, pending.destinationGeneration);
      const descriptor = response.value.image;
      if (!(descriptor.data instanceof ArrayBuffer) || descriptor.data.byteLength === 0)
        throw new TypeError("Video worker image payload must own a nonempty ArrayBuffer.");
      const image = new GFXImage({
        width: descriptor.width,
        height: descriptor.height,
        bytesPerRow: descriptor.bytesPerRow,
        pixelFormat: descriptor.pixelFormat,
        alpha: descriptor.alpha,
        colourSpace: descriptor.colourSpace,
        data: new Uint8Array(descriptor.data),
      });
      publishDestination(pending.destination, pending.destinationGeneration, image);
      pending.resolve(Object.freeze({ image, info: Object.freeze({ ...response.value.info, backend: "worker-cpu" as const }) }));
    } catch (error) { pending.reject(error); }
  };

  #onError = (event: ErrorEvent) => this.#fail(event.error instanceof Error ? event.error : new Error(event.message || "Video processing worker failed."));

  #fail(error: unknown): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#generation += 1;
    this.#worker.removeEventListener("message", this.#onMessage);
    this.#worker.removeEventListener("error", this.#onError);
    for (const [id, pending] of [...this.#pending]) {
      pending.signal?.removeEventListener("abort", pending.onAbort);
      pending.reject(error);
      this.#pending.delete(id);
    }
    this.#worker.terminate();
  }
}

export function createBrowserVideoWorkerTransport(ownerId: string, maximumOutstanding = 4): VideoWorkerTransport | null {
  if (typeof Worker !== "function") return null;
  const worker = new Worker(videoProcessingWorkerURL, { type: "module", name: "syncloudos-video-processing" });
  return new VideoWorkerTransport(worker, { ownerId, maximumOutstanding });
}
