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
import { VFXEncodedChunk } from "../../FX/VideoFX/VFXEncodedChunk";
import {
  type VFXEncoderBackend,
  type VFXEncoderBackendCallbacks,
  type VFXEncoderCapabilityProbe,
  type VFXEncoderConfig,
  type VFXEncoderFrameOptions,
  type VFXEncoderOutputMetadata,
} from "../../FX/VideoFX/VFXEncoder";
import { VFXFrame } from "../../FX/VideoFX/VFXFrame";

function constructor(): typeof VideoEncoder | null {
  return typeof globalThis.VideoEncoder === "function" ? globalThis.VideoEncoder : null;
}

function unavailable(): DOMException {
  return new DOMException("WebCodecs VideoEncoder is unavailable in this browser.", "NotSupportedError");
}

function webConfig(config: VFXEncoderConfig): VideoEncoderConfig {
  return {
    codec: config.codec,
    width: config.codedWidth,
    height: config.codedHeight,
    bitrate: config.bitrate,
    framerate: config.framerate,
    hardwareAcceleration: config.hardwareAcceleration,
    latencyMode: config.latencyMode,
    alpha: config.alpha,
    ...(config.scalabilityMode ? { scalabilityMode: config.scalabilityMode } : {}),
  };
}

function finiteMicros(time: MEFXTime, name: string): number {
  if (!(time instanceof MEFXTime) || time.value.kind !== "finite" || time.value.epoch !== 0n)
    throw new TypeError(`${name} must be a finite epoch-zero MediaFX time.`);
  const converted = time.convertScale(1_000_000, "nearest-even");
  if (converted.value.kind !== "finite") throw new RangeError(`${name} cannot cross the WebCodecs timestamp boundary.`);
  const value = Number(converted.value.value);
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} exceeds the integral microsecond range.`);
  return value;
}

function nativeFrame(frame: VFXFrame): VideoFrame {
  const pixels = frame.copyPixelBuffer();
  try {
    const format = pixels.format;
    const nativeFormat: VideoPixelFormat =
      format.pixelFormat === "rgba8" ? "RGBA"
        : format.pixelFormat === "bgra8" ? "BGRA"
          : format.pixelFormat === "i420" ? "I420"
            : "NV12";
    const timestamp = finiteMicros(frame.timing.presentationTime, "Video presentation time");
    const duration = frame.timing.duration ? finiteMicros(frame.timing.duration, "Video duration") : undefined;
    return new VideoFrame(pixels.copyData(), {
      format: nativeFormat,
      codedWidth: format.codedWidth,
      codedHeight: format.codedHeight,
      timestamp,
      ...(duration === undefined ? {} : { duration }),
      layout: format.planeLayouts.map(plane => ({ offset: plane.offset, stride: plane.bytesPerRow })),
    });
  } finally {
    pixels.close();
  }
}

function outputMetadata(metadata: EncodedVideoChunkMetadata | undefined): VFXEncoderOutputMetadata {
  const decoder = metadata?.decoderConfig;
  if (!decoder) return Object.freeze({});
  const description = decoder.description
    ? Uint8Array.from(new Uint8Array(decoder.description as ArrayBuffer))
    : undefined;
  return Object.freeze({
    decoderConfig: Object.freeze({
      codec: decoder.codec,
      codedWidth: decoder.codedWidth ?? 0,
      codedHeight: decoder.codedHeight ?? 0,
      ...(description ? { description } : {}),
    }),
    colourSpace: decoder.colorSpace ? JSON.stringify(decoder.colorSpace) : undefined,
  });
}

export class BrowserVideoEncoder implements VFXEncoderBackend, VFXEncoderCapabilityProbe {
  #encoder: VideoEncoder | null = null;
  #generation = 0;
  #disposed = false;

  get encodeQueueSize(): number { return this.#encoder?.encodeQueueSize ?? 0; }

  async queryEncoder(config: VFXEncoderConfig) {
    const Encoder = constructor();
    if (!Encoder || typeof Encoder.isConfigSupported !== "function")
      return Object.freeze({ supported: false, reason: "webcodecs-video-encoder-unavailable" });
    try {
      const result = await Encoder.isConfigSupported(webConfig(config));
      const resolved = result.config;
      return Object.freeze({
        supported: result.supported === true,
        config: resolved ? Object.freeze({
          codec: resolved.codec,
          codedWidth: resolved.width,
          codedHeight: resolved.height,
          bitrate: typeof resolved.bitrate === "number" ? resolved.bitrate : config.bitrate,
          framerate: typeof resolved.framerate === "number" ? resolved.framerate : config.framerate,
          hardwareAcceleration: resolved.hardwareAcceleration ?? config.hardwareAcceleration,
          latencyMode: resolved.latencyMode ?? config.latencyMode,
          alpha: resolved.alpha ?? config.alpha,
          scalabilityMode: resolved.scalabilityMode ?? config.scalabilityMode,
        }) : config,
        ...(result.supported === true ? {} : { reason: "unsupported-configuration" }),
      });
    } catch (error) {
      return Object.freeze({ supported: false, reason: error instanceof Error && error.message ? error.message : "unsupported-configuration" });
    }
  }

  configure(config: VFXEncoderConfig, callbacks: VFXEncoderBackendCallbacks): void {
    if (this.#disposed) throw new DOMException("Video encoder backend is disposed.", "InvalidStateError");
    const Encoder = constructor();
    if (!Encoder) throw unavailable();
    this.#closeNative();
    const generation = ++this.#generation;
    const encoder = new Encoder({
      output: (chunk, metadata) => {
        if (generation !== this.#generation || this.#disposed) return;
        try {
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          callbacks.output(new VFXEncodedChunk({
            type: chunk.type,
            data,
            timing: new MEFXSampleTimingInfo({
              presentationTime: MEFXTime.finite(BigInt(chunk.timestamp), 1_000_000),
              duration: chunk.duration == null ? null : MEFXTime.finite(BigInt(chunk.duration), 1_000_000),
            }),
          }), outputMetadata(metadata));
        } catch (error) {
          callbacks.error(error);
        }
      },
      error: error => {
        if (generation === this.#generation && !this.#disposed) callbacks.error(error);
      },
    });
    try {
      encoder.configure(webConfig(config));
      this.#encoder = encoder;
    } catch (error) {
      try { encoder.close(); } catch { /* best effort */ }
      throw error;
    }
  }

  encode(frame: VFXFrame, options: VFXEncoderFrameOptions): void {
    if (this.#disposed) throw new DOMException("Video encoder backend is disposed.", "InvalidStateError");
    const encoder = this.#encoder;
    if (!encoder || encoder.state !== "configured") throw new DOMException("Video encoder backend is not configured.", "InvalidStateError");
    if (!(frame instanceof VFXFrame) || frame.closed) throw new TypeError("Browser video encode requires a live VFXFrame.");
    const native = nativeFrame(frame);
    try { encoder.encode(native, { keyFrame: options.keyFrame === true }); }
    finally { native.close(); }
  }

  async flush(): Promise<void> {
    if (this.#disposed) throw new DOMException("Video encoder backend is disposed.", "InvalidStateError");
    const encoder = this.#encoder;
    if (!encoder || encoder.state !== "configured") throw new DOMException("Video encoder backend is not configured.", "InvalidStateError");
    await encoder.flush();
  }

  reset(): void {
    if (this.#disposed) throw new DOMException("Video encoder backend is disposed.", "InvalidStateError");
    this.#generation += 1;
    const encoder = this.#encoder;
    if (encoder && encoder.state !== "closed") encoder.reset();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#generation += 1;
    this.#closeNative();
  }

  #closeNative(): void {
    const encoder = this.#encoder;
    this.#encoder = null;
    if (!encoder || encoder.state === "closed") return;
    try { encoder.close(); } catch { /* best effort */ }
  }
}
