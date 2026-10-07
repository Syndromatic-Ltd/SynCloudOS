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

import { IFXContext } from "../../FX/ImageFX/IFXContext";
import { decodeIFXGraphTransport } from "../../FX/ImageFX/IFXGraphTransport";
import { IFXRenderDestination } from "../../FX/ImageFX/IFXRenderDestination";
import type {
  IFXImageWorkerRequest,
  IFXImageWorkerResponse,
} from "./BrowserImageProcessingWorker";

type RenderRequest = Exclude<IFXImageWorkerRequest, Readonly<{ id: number; operation: "cancel" }>>;
type SuccessResponse = Extract<IFXImageWorkerResponse, Readonly<{ ok: true }>>;

export interface ImageProcessingWorkerRuntimeOptions {
  readonly createOffscreenCanvas?: ((width: number, height: number) => OffscreenCanvas) | null;
  /** Bound on distinct received source pixel bytes per job. */
  readonly maximumPixelBytes?: number;
}

export interface ImageProcessingWorkerExecution {
  readonly response: SuccessResponse;
  readonly transfer: readonly Transferable[];
}

const MINIMUM_SAMPLES = 262_144;
/** IFXContext's ceiling (the sampler's own hard cap, 16 Mi, is higher). */
const MAXIMUM_SAMPLES = 2 * 1024 * 1024;

/**
 * The CPU renderer's default budget (256 Ki samples) is sized for small or
 * untrusted graphs; with it a 512x512 two-node render already fails. A worker
 * job is bounded by admission, its pixel budget and the 4 Mi-pixel
 * destination cap, so its budget follows the job: every output pixel may
 * evaluate every node, with 2x headroom for resampling, up to the context's
 * ceiling. Sampling is memoised per node and point, so a two-node graph
 * spends two samples a pixel and fits up to 1 Mi pixels; larger jobs still
 * fail with the sampler's budget error and belong on the GPU backend.
 * @internal Exported for tests.
 */
export function workerJobSampleBudget(nodeCount: number, pixels: number): number {
  if (!Number.isSafeInteger(nodeCount) || nodeCount < 1 || !Number.isFinite(pixels) || pixels < 1) return MINIMUM_SAMPLES;
  return Math.min(MAXIMUM_SAMPLES, Math.max(MINIMUM_SAMPLES, Math.ceil(pixels * nodeCount * 2)));
}

function canvasFactory(options: ImageProcessingWorkerRuntimeOptions): ((width: number, height: number) => OffscreenCanvas) | null {
  if (options.createOffscreenCanvas !== undefined) return options.createOffscreenCanvas;
  return typeof OffscreenCanvas === "function" ? (width, height) => new OffscreenCanvas(width, height) : null;
}

function putImageOnCanvas(canvas: OffscreenCanvas, image: Readonly<{ width: number; height: number; copyData(): Uint8Array }>): void {
  if (canvas.width !== image.width) canvas.width = image.width;
  if (canvas.height !== image.height) canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new DOMException("OffscreenCanvas 2D rendering is unavailable.", "NotSupportedError");
  const bytes = image.copyData();
  const rgba = new Uint8ClampedArray(bytes.length);
  rgba.set(bytes);
  context.putImageData(new ImageData(rgba, image.width, image.height), 0, 0);
}

async function renderGraph(request: RenderRequest, signal: AbortSignal, options: ImageProcessingWorkerRuntimeOptions) {
  signal.throwIfAborted();
  const graph = decodeIFXGraphTransport(request.graph, { maximumPixelBytes: options.maximumPixelBytes });
  const extent = graph.output.extent;
  const bounds = request.operation === "render-pixels" ? request.destination.bounds : extent.kind === "finite" ? extent.rect : null;
  const context = new IFXContext("linear-srgb", workerJobSampleBudget(request.graph.nodes.length, bounds ? bounds.width * bounds.height : 0));
  try {
    if (request.operation === "render-pixels") {
      const destination = new IFXRenderDestination(
        { kind: "finite", rect: request.destination.bounds },
        request.destination.colourSpace,
        request.destination.alpha,
      );
      return await context.render(graph.output, destination, { signal, interpolation: request.interpolation });
    }
    return await context.render(graph.output, undefined, { signal, interpolation: request.interpolation });
  } finally {
    context.dispose();
  }
}

export async function executeImageProcessingWorkerRequest(
  request: RenderRequest,
  signal: AbortSignal,
  options: ImageProcessingWorkerRuntimeOptions = {},
): Promise<ImageProcessingWorkerExecution> {
  if (!(signal instanceof AbortSignal)) throw new TypeError("AbortSignal required.");
  signal.throwIfAborted();
  const result = await renderGraph(request, signal, options);
  signal.throwIfAborted();

  if (request.operation === "render-pixels") {
    const bytes = result.image.copyData();
    const data = bytes.buffer as ArrayBuffer;
    const response: SuccessResponse = Object.freeze({
      id: request.id,
      ok: true,
      kind: "pixels",
      value: Object.freeze({
        image: Object.freeze({
          width: result.image.width,
          height: result.image.height,
          bytesPerRow: result.image.bytesPerRow,
          pixelFormat: result.image.pixelFormat,
          alpha: result.image.alpha,
          colourSpace: result.image.colourSpace,
          data,
        }),
        info: Object.freeze({ ...result.info, backend: "worker-cpu" as const }),
      }),
    });
    return Object.freeze({ response, transfer: Object.freeze([data]) });
  }

  const image = result.image.converting("srgb", "straight");
  if (request.operation === "render-encoded") {
    let blob: Blob;
    if (request.format === "image/png") {
      const bytes = image.toPNG();
      const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      blob = new Blob([data], { type: "image/png" });
    } else {
      const createCanvas = canvasFactory(options);
      if (!createCanvas) throw new DOMException("WebP encoding is unavailable in this worker.", "NotSupportedError");
      const canvas = createCanvas(image.width, image.height);
      putImageOnCanvas(canvas, image);
      if (typeof canvas.convertToBlob !== "function")
        throw new DOMException("WebP encoding is unavailable in this worker.", "NotSupportedError");
      blob = await canvas.convertToBlob({ type: "image/webp" });
      if (blob.type !== "image/webp")
        throw new DOMException("WebP encoding was not accepted by this worker.", "NotSupportedError");
    }
    signal.throwIfAborted();
    const response: SuccessResponse = Object.freeze({
      id: request.id,
      ok: true,
      kind: "encoded",
      value: Object.freeze({
        blob,
        metadata: Object.freeze({
          width: image.width,
          height: image.height,
          mimeType: request.format,
          colourSpace: "srgb" as const,
          orientation: "up" as const,
        }),
      }),
    });
    return Object.freeze({ response, transfer: Object.freeze([]) });
  }

  putImageOnCanvas(request.canvas, image);
  signal.throwIfAborted();
  const response: SuccessResponse = Object.freeze({
    id: request.id,
    ok: true,
    kind: "canvas",
    value: Object.freeze({
      metadata: Object.freeze({
        width: image.width,
        height: image.height,
        colourSpace: "srgb" as const,
        orientation: "up" as const,
      }),
    }),
  });
  return Object.freeze({ response, transfer: Object.freeze([]) });
}
