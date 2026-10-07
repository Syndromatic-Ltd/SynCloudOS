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

import { MEFXSampleTimingInfo } from "../../FX/MediaFX/MEFXSampleTimingInfo";
import { MEFXTime } from "../../FX/MediaFX/MEFXTime";
import type {
  VFXCodecCapabilityProbe,
  VFXDecoderConfig,
} from "../../FX/VideoFX/VFXCodecCapabilities";
import type { VFXDecoderBackend, VFXDecoderBackendCallbacks } from "../../FX/VideoFX/VFXDecoder";
import { VFXEncodedChunk, encodedVFXChunkData } from "../../FX/VideoFX/VFXEncodedChunk";
import { VFXFrame } from "../../FX/VideoFX/VFXFrame";
import { VFXPixelBuffer } from "../../FX/VideoFX/VFXPixelBuffer";
import { VFXVideoFormat } from "../../FX/VideoFX/VFXVideoFormat";

function webCodecsConfig(config: VFXDecoderConfig): VideoDecoderConfig {
  return {
    codec: config.codec,
    codedWidth: config.codedWidth,
    codedHeight: config.codedHeight,
    hardwareAcceleration: config.hardwareAcceleration,
    optimizeForLatency: config.optimizeForLatency,
  };
}

function unavailableError(): DOMException {
  return new DOMException("WebCodecs VideoDecoder is unavailable in this browser.", "NotSupportedError");
}

function decoderConstructor(): typeof VideoDecoder | null {
  return typeof globalThis.VideoDecoder === "function" ? globalThis.VideoDecoder : null;
}

async function copyFrame(frame: VideoFrame): Promise<VFXFrame> {
  const width = frame.codedWidth;
  const height = frame.codedHeight;
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0)
    throw new RangeError("Decoded video frame dimensions are invalid.");

  let dense: Uint8Array;
  if (frame.format === "RGBA") {
    const options: VideoFrameCopyToOptions = { format: "RGBA" };
    const allocationSize = frame.allocationSize(options);
    if (!Number.isSafeInteger(allocationSize) || allocationSize <= 0)
      throw new RangeError("Decoded video frame allocation size is invalid.");
    const copied = new Uint8Array(allocationSize);
    const layout = await frame.copyTo(copied, options);
    const plane = layout[0];
    if (!plane) throw new RangeError("Decoded video frame did not return an RGBA plane layout.");
    const rowBytes = width * 4;
    if (plane.stride < rowBytes || plane.offset < 0 || plane.offset + (height - 1) * plane.stride + rowBytes > copied.byteLength)
      throw new RangeError("Decoded video frame returned an invalid RGBA plane layout.");
    dense = new Uint8Array(rowBytes * height);
    for (let y = 0; y < height; y += 1) {
      const source = plane.offset + y * plane.stride;
      dense.set(copied.subarray(source, source + rowBytes), y * rowBytes);
    }
  } else {
    // Canvas performs the native frame's colour conversion. copyTo's optional
    // format conversion is not implemented by every WebCodecs host; a YUV
    // plane layout must never be interpreted as packed RGBA pixels.
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { colorSpace: "srgb", willReadFrequently: true });
    if (!context) throw new DOMException("Decoded video frame colour conversion is unavailable.", "NotSupportedError");
    context.drawImage(frame, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height).data;
    dense = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  const format = new VFXVideoFormat({ codedWidth: width, codedHeight: height, pixelFormat: "rgba8", colourSpace: "srgb" });
  const pixels = new VFXPixelBuffer(format, dense);
  try {
    const duration = frame.duration == null ? null : MEFXTime.finite(BigInt(frame.duration), 1_000_000);
    const timing = new MEFXSampleTimingInfo({
      presentationTime: MEFXTime.finite(BigInt(frame.timestamp), 1_000_000),
      duration,
    });
    return new VFXFrame({ pixels, timing });
  } finally {
    pixels.close();
  }
}

export class BrowserVideoDecoder implements VFXDecoderBackend, VFXCodecCapabilityProbe {
  #decoder: VideoDecoder | null = null;
  #generation = 0;
  #disposed = false;
  readonly #pendingConversions = new Set<Promise<void>>();

  constructor(private readonly options: Readonly<{ outputStorage?: "pixels" | "video-surface" }> = {}) {}

  get decodeQueueSize(): number {
    return this.#decoder?.decodeQueueSize ?? 0;
  }

  async queryDecoder(config: VFXDecoderConfig): Promise<Readonly<{
    supported: boolean;
    config?: Partial<VFXDecoderConfig>;
    reason?: string;
  }>> {
    const Constructor = decoderConstructor();
    if (!Constructor || typeof Constructor.isConfigSupported !== "function")
      return Object.freeze({ supported: false, reason: "webcodecs-video-unavailable" });
    try {
      const result = await Constructor.isConfigSupported(webCodecsConfig(config));
      return Object.freeze({
        supported: result.supported === true,
        config: result.config ? Object.freeze({
          codec: result.config.codec,
          codedWidth: result.config.codedWidth ?? config.codedWidth,
          codedHeight: result.config.codedHeight ?? config.codedHeight,
          hardwareAcceleration: result.config.hardwareAcceleration ?? config.hardwareAcceleration,
          optimizeForLatency: result.config.optimizeForLatency ?? config.optimizeForLatency,
        }) : config,
        ...(result.supported === true ? {} : { reason: "unsupported-configuration" }),
      });
    } catch (error) {
      return Object.freeze({
        supported: false,
        reason: error instanceof Error && error.message ? error.message : "unsupported-configuration",
      });
    }
  }

  configure(config: VFXDecoderConfig, callbacks: VFXDecoderBackendCallbacks): void {
    if (this.#disposed) throw new DOMException("Video decoder backend is disposed.", "InvalidStateError");
    const Constructor = decoderConstructor();
    if (!Constructor) throw unavailableError();
    this.#closeNativeDecoder();
    const generation = ++this.#generation;
    const decoder = new Constructor({
      output: (nativeFrame) => this.#receiveNativeFrame(nativeFrame, callbacks, generation),
      error: (error) => {
        if (generation !== this.#generation || this.#disposed) return;
        callbacks.error(error);
      },
    });
    try {
      decoder.configure(webCodecsConfig(config));
      this.#decoder = decoder;
    } catch (error) {
      try { decoder.close(); } catch { /* no-op */ }
      throw error;
    }
  }

  decode(chunk: VFXEncodedChunk): void {
    if (this.#disposed) throw new DOMException("Video decoder backend is disposed.", "InvalidStateError");
    const decoder = this.#decoder;
    if (!decoder || decoder.state !== "configured") throw new DOMException("Video decoder backend is not configured.", "InvalidStateError");
    if (!(chunk instanceof VFXEncodedChunk)) throw new TypeError("Browser video decode requires a VFXEncodedChunk.");
    const timing = chunk.webCodecsTiming();
    decoder.decode(new EncodedVideoChunk({
      type: chunk.type,
      timestamp: timing.timestampMicroseconds,
      ...(timing.durationMicroseconds === null ? {} : { duration: timing.durationMicroseconds }),
      // EncodedVideoChunk snapshots synchronously at the host boundary. Its
      // input is already framework-owned immutable storage; an intermediate
      // public copyData() allocation only duplicates the same compressed bytes.
      data: encodedVFXChunkData(chunk),
    }));
  }

  async flush(): Promise<void> {
    if (this.#disposed) throw new DOMException("Video decoder backend is disposed.", "InvalidStateError");
    const decoder = this.#decoder;
    if (!decoder || decoder.state !== "configured") throw new DOMException("Video decoder backend is not configured.", "InvalidStateError");
    await decoder.flush();
    const conversions = [...this.#pendingConversions];
    if (conversions.length > 0) await Promise.all(conversions);
  }

  reset(): void {
    if (this.#disposed) throw new DOMException("Video decoder backend is disposed.", "InvalidStateError");
    this.#generation += 1;
    const decoder = this.#decoder;
    if (decoder && decoder.state !== "closed") decoder.reset();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#generation += 1;
    this.#closeNativeDecoder();
  }

  #receiveNativeFrame(nativeFrame: VideoFrame, callbacks: VFXDecoderBackendCallbacks, generation: number): void {
    if (generation !== this.#generation || this.#disposed) {
      nativeFrame.close();
      return;
    }
    if (this.options.outputStorage === "video-surface") {
      let frame: VFXFrame;
      try {
        const duration = nativeFrame.duration == null ? null : MEFXTime.finite(BigInt(nativeFrame.duration), 1_000_000);
        frame = VFXFrame.fromVideoFrame(nativeFrame, new MEFXSampleTimingInfo({
          presentationTime: MEFXTime.finite(BigInt(nativeFrame.timestamp), 1_000_000),
          duration,
        }));
      } catch (error) {
        nativeFrame.close();
        callbacks.error(error);
        return;
      }
      nativeFrame.close();
      try { callbacks.output(frame); } catch (error) { frame.close(); callbacks.error(error); }
      return;
    }
    const conversion = copyFrame(nativeFrame).then(
      (frame) => {
        if (generation !== this.#generation || this.#disposed) {
          frame.close();
          return;
        }
        callbacks.output(frame);
      },
      (error) => {
        if (generation === this.#generation && !this.#disposed) callbacks.error(error);
      },
    ).finally(() => {
      nativeFrame.close();
      this.#pendingConversions.delete(conversion);
    });
    this.#pendingConversions.add(conversion);
  }

  #closeNativeDecoder(): void {
    const decoder = this.#decoder;
    this.#decoder = null;
    if (!decoder || decoder.state === "closed") return;
    try { decoder.close(); } catch { /* close is best-effort during replacement/disposal */ }
  }
}
