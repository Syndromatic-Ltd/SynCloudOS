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

import { GFXBitmapContext } from "../GraphicsFX/GFXBitmapContext";
import type { GFXColour } from "../GraphicsFX/GFXColour";
import { GFXImage } from "../GraphicsFX/GFXImage";
import type { GFXPoint } from "../GraphicsFX/GFXGeometry";
import { IFXImage } from "../ImageFX/IFXImage";
import { IFXContext, type IFXContextBudgets } from "../ImageFX/IFXContext";
import type { IFXRenderBackend } from "../ImageFX/IFXRenderBackend";
import { IFXRenderDestination } from "../ImageFX/IFXRenderDestination";
import { IFXRenderPipeline } from "../ImageFX/IFXRenderPipeline";
import { IFXTileRenderDestination } from "../ImageFX/IFXTileRenderDestination";
import { finiteExtent } from "../ImageFX/extent";
import { TFXGlyphDrawing } from "../TextFX/TFXGlyphDrawing";
import type { TFXLine } from "../TextFX/TFXLine";
import { VFXFrame } from "./VFXFrame";
import { VFXPixelBuffer } from "./VFXPixelBuffer";
import type { VFXVideoFormat } from "./VFXVideoFormat";
import type { MEFXSampleTimingInfo } from "../MediaFX/MEFXSampleTimingInfo";

export type VFXFrameOwnershipMode = "copy" | "transfer";

export interface VFXFrameProcessOptions {
  readonly ownership?: VFXFrameOwnershipMode;
  readonly signal?: AbortSignal;
  readonly interpolation?: "nearest" | "linear";
}

export interface VFXFrameProcessDiagnostics {
  readonly backend: "cpu" | "worker-cpu" | "accelerated" | "graphics-cpu" | "text-cpu";
  readonly copyCount: number;
  readonly sourceBytes: number;
  readonly outputBytes: number;
  readonly peakRetainedBytes: number;
  readonly glyphCount?: number;
  readonly tileCount?: number;
}

export interface VFXFrameProcessResult {
  readonly frame: VFXFrame;
  readonly diagnostics: VFXFrameProcessDiagnostics;
}

export interface VFXFrameProcessorOptions {
  readonly backend?: IFXRenderBackend | null;
  readonly maximumRetainedBytes?: number;
}

export interface VFXFrameTiledProcessOptions extends VFXFrameProcessOptions {
  readonly tileSize?: number;
  readonly budgets?: IFXContextBudgets;
}

type GraphBuilder = (source: IFXImage) => IFXImage;

export class VFXFrameProcessingGraph {
  readonly #build: GraphBuilder;

  constructor(build: GraphBuilder) {
    if (typeof build !== "function") throw new TypeError("Video frame processing graph requires a builder.");
    this.#build = build;
    Object.freeze(this);
  }

  static identity(): VFXFrameProcessingGraph {
    return new VFXFrameProcessingGraph(source => source);
  }

  materialize(source: IFXImage): IFXImage {
    if (!(source instanceof IFXImage)) throw new TypeError("Video frame processing graph requires an ImageFX source.");
    const output = this.#build(source);
    if (!(output instanceof IFXImage)) throw new TypeError("Video frame processing graph must return an IFXImage.");
    return output;
  }
}

function retainedLimit(value: unknown): number {
  const selected = value ?? 256 * 1024 * 1024;
  if (!Number.isSafeInteger(selected) || Number(selected) < 1 || Number(selected) > 1024 * 1024 * 1024)
    throw new RangeError("Video frame processor retained-byte limit must be between 1 byte and 1 GiB.");
  return Number(selected);
}

function ownedPixels(image: GFXImage, format: VFXVideoFormat): VFXPixelBuffer {
  if (image.width !== format.codedWidth || image.height !== format.codedHeight)
    throw new RangeError("Video frame processing output dimensions must match the input format.");
  const converted = image.converting(format.colourSpace, format.alpha);
  const dense = VFXPixelBuffer.fromGFXImage(converted, { pixelFormat: format.pixelFormat });
  try {
    const source = dense.copyData();
    const sourcePlanes = dense.format.planeLayouts;
    const destination = new Uint8Array(format.byteLength);
    for (let index = 0; index < format.planeLayouts.length; index += 1) {
      const from = sourcePlanes[index], to = format.planeLayouts[index];
      if (!from || !to || from.width !== to.width || from.height !== to.height || from.rowBytes !== to.rowBytes)
        throw new RangeError("Video frame processing output plane layout is incompatible with the input format.");
      for (let row = 0; row < to.height; row += 1) {
        const sourceOffset = from.offset + row * from.bytesPerRow;
        const destinationOffset = to.offset + row * to.bytesPerRow;
        destination.set(source.subarray(sourceOffset, sourceOffset + to.rowBytes), destinationOffset);
      }
    }
    return new VFXPixelBuffer(format, destination);
  } finally { dense.close(); }
}

function frameFromImage(format: VFXVideoFormat, timing: MEFXSampleTimingInfo, image: GFXImage): VFXFrame {
  const pixels = ownedPixels(image, format);
  try { return new VFXFrame({ pixels, timing }); }
  finally { pixels.close(); }
}

export class VFXFrameProcessor {
  readonly #pipeline: IFXRenderPipeline;
  readonly #maximumRetainedBytes: number;
  #disposed = false;

  constructor(options: VFXFrameProcessorOptions = {}) {
    this.#pipeline = new IFXRenderPipeline(options.backend ?? null);
    this.#maximumRetainedBytes = retainedLimit(options.maximumRetainedBytes);
  }

  async process(frame: VFXFrame, graph: VFXFrameProcessingGraph, options: VFXFrameProcessOptions = {}): Promise<VFXFrameProcessResult> {
    this.#assertLiveFrame(frame);
    if (!(graph instanceof VFXFrameProcessingGraph)) throw new TypeError("VFXFrameProcessingGraph required.");
    if (options.ownership !== undefined && options.ownership !== "copy" && options.ownership !== "transfer")
      throw new TypeError("Video frame ownership must be copy or transfer.");
    options.signal?.throwIfAborted();
    const format = frame.format;
    const timing = frame.timing;
    const sourceBytes = format.byteLength;
    if (sourceBytes * 2 > this.#maximumRetainedBytes)
      throw new DOMException("Video frame processing retained-byte limit exceeded.", "QuotaExceededError");
    const image = frame.toGFXImage();
    const graphOutput = graph.materialize(IFXImage.fromPixels(image));
    if (options.ownership === "transfer") frame.close();
    const destination = new IFXRenderDestination(
      finiteExtent({ x: 0, y: 0, width: image.width, height: image.height }),
      format.colourSpace,
      format.alpha,
    );
    const rendered = await this.#pipeline.render(graphOutput, destination, {
      signal: options.signal,
      interpolation: options.interpolation ?? "linear",
    });
    options.signal?.throwIfAborted();
    const output = frameFromImage(format, timing, rendered.image);
    const peakRetainedBytes = sourceBytes + output.format.byteLength
      + rendered.info.peakBytes.output + rendered.info.peakBytes.scratch + rendered.info.peakBytes.cache;
    if (peakRetainedBytes > this.#maximumRetainedBytes) {
      output.close();
      throw new DOMException("Video frame processing retained-byte limit exceeded.", "QuotaExceededError");
    }
    return Object.freeze({
      frame: output,
      diagnostics: Object.freeze({
        backend: rendered.info.backend,
        copyCount: rendered.info.backend === "worker-cpu" ? 3 : 2,
        sourceBytes,
        outputBytes: output.format.byteLength,
        peakRetainedBytes,
      }),
    });
  }

  async processTiled(frame: VFXFrame, graph: VFXFrameProcessingGraph, options: VFXFrameTiledProcessOptions = {}): Promise<VFXFrameProcessResult> {
    this.#assertLiveFrame(frame);
    if (!(graph instanceof VFXFrameProcessingGraph)) throw new TypeError("VFXFrameProcessingGraph required.");
    options.signal?.throwIfAborted();
    const format = frame.format;
    const timing = frame.timing;
    const sourceBytes = format.byteLength;
    const image = frame.toGFXImage();
    const graphOutput = graph.materialize(IFXImage.fromPixels(image));
    if (options.ownership === "transfer") frame.close();
    const bytes = new Uint8Array(format.codedWidth * format.codedHeight * 4);
    const context = new IFXContext("linear-srgb", 262_144, { ...(options.budgets ?? {}), ...(options.tileSize === undefined ? {} : { tileSize: options.tileSize }) });
    const destination = new IFXTileRenderDestination(
      finiteExtent({ x: 0, y: 0, width: format.codedWidth, height: format.codedHeight }),
      {
        tileSize: options.tileSize,
        colourSpace: format.colourSpace,
        alpha: format.alpha,
        write(tile) {
          const incoming = tile.image.copyData();
          for (let row = 0; row < tile.rect.height; row += 1) {
            const sourceOffset = row * tile.rect.width * 4;
            const destinationOffset = ((tile.rect.y + row) * format.codedWidth + tile.rect.x) * 4;
            bytes.set(incoming.subarray(sourceOffset, sourceOffset + tile.rect.width * 4), destinationOffset);
          }
        },
      },
    );
    try {
      const info = await context.renderTiles(graphOutput, destination, { signal: options.signal, interpolation: options.interpolation ?? "linear" });
      const outputImage = new GFXImage({ width: format.codedWidth, height: format.codedHeight, pixelFormat: "rgba8", alpha: format.alpha, colourSpace: format.colourSpace, data: bytes });
      const output = frameFromImage(format, timing, outputImage);
      const peakRetainedBytes = sourceBytes + output.format.byteLength + info.peakBytes.output + info.peakBytes.scratch + info.peakBytes.cache;
      if (peakRetainedBytes > this.#maximumRetainedBytes) {
        output.close();
        throw new DOMException("Video frame processing retained-byte limit exceeded.", "QuotaExceededError");
      }
      return Object.freeze({
        frame: output,
        diagnostics: Object.freeze({
          backend: "cpu" as const,
          copyCount: 2,
          sourceBytes,
          outputBytes: output.format.byteLength,
          peakRetainedBytes,
          tileCount: info.tileCount,
        }),
      });
    } finally {
      destination.dispose();
      context.dispose();
    }
  }

  draw(frame: VFXFrame, draw: (context: GFXBitmapContext) => void, options: Readonly<{ ownership?: VFXFrameOwnershipMode }> = {}): VFXFrameProcessResult {
    this.#assertLiveFrame(frame);
    if (typeof draw !== "function") throw new TypeError("GraphicsFX draw callback required.");
    const format = frame.format;
    const timing = frame.timing;
    const image = frame.toGFXImage().converting("srgb", "straight");
    const context = new GFXBitmapContext({ width: image.width, height: image.height });
    try {
      context.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      draw(context);
      const output = frameFromImage(format, timing, context.makeImage());
      if (options.ownership === "transfer") frame.close();
      const peakRetainedBytes = format.byteLength * 3;
      if (peakRetainedBytes > this.#maximumRetainedBytes) { output.close(); throw new DOMException("Video frame processing retained-byte limit exceeded.", "QuotaExceededError"); }
      return Object.freeze({ frame: output, diagnostics: Object.freeze({ backend: "graphics-cpu", copyCount: 2, sourceBytes: format.byteLength, outputBytes: output.format.byteLength, peakRetainedBytes }) });
    } finally { context.dispose(); }
  }

  drawText(
    frame: VFXFrame,
    line: TFXLine,
    options: Readonly<{ origin?: GFXPoint; colour: GFXColour; ownership?: VFXFrameOwnershipMode; signal?: AbortSignal }>,
  ): VFXFrameProcessResult {
    if (!options || typeof options !== "object" || !options.colour) throw new TypeError("Text overlay options require a GraphicsFX colour.");
    options.signal?.throwIfAborted();
    const glyphs = TFXGlyphDrawing.pathsForLine(line, options.origin ?? { x: 0, y: 0 }, options.signal);
    const result = this.draw(frame, context => {
      TFXGlyphDrawing.drawLine({
        fill: path => context.fillPath(path, options.colour),
        drawImage: (image, rect) => context.drawImage(image, rect),
      }, line, options.origin, options.signal);
    }, { ownership: options.ownership });
    return Object.freeze({
      frame: result.frame,
      diagnostics: Object.freeze({ ...result.diagnostics, backend: "text-cpu" as const, glyphCount: glyphs.length }),
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#pipeline.dispose();
  }

  #assertLiveFrame(frame: VFXFrame): void {
    if (this.#disposed) throw new DOMException("Video frame processor is disposed.", "AbortError");
    if (!(frame instanceof VFXFrame) || frame.closed) throw new TypeError("Video frame processor requires a live VFXFrame.");
  }
}
