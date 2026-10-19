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

import { SynCloudOSLifecycleRecord } from "../../SynCloudOS/fxRuntimeContracts";
import { AUFXAudioFormat } from "./AUFXAudioFormat";
import { AUFXAudioPCMBuffer } from "./AUFXAudioPCMBuffer";
import { AUFXClockObservation } from "./AUFXClockObservation";
import type { AUFXAudioChunkStream } from "./AUFXAudioChunkStream";
export interface AUFXAudioCodecSupport { readonly mimeType: string; readonly provenance: "portable" | "observed-browser"; }
export interface AUFXAudioFileCapabilities { readonly decode: readonly AUFXAudioCodecSupport[]; readonly encode: readonly AUFXAudioCodecSupport[]; }
export interface AUFXAudioCodecConfiguration {
  readonly mimeType: string;
  readonly codec: string;
  readonly sampleRate: number;
  readonly channelCount: number;
  readonly bitrate?: number;
}
export interface AUFXAudioCodecNegotiation extends AUFXAudioCodecConfiguration {
  readonly decode: boolean;
  readonly encode: boolean;
  readonly provenance: "portable" | "webcodecs-probe" | "unavailable";
}
export interface AUFXAudioFileOpenRequest { readonly source: string; readonly processingFormat?: AUFXAudioFormat; }
export interface AUFXAudioFileExportOptions { readonly format: "wav" | "opus-webm"; readonly bitrate?: number; }
/** A distinct streaming export: neither input nor output is an owned whole-file allocation. */
export interface AUFXAudioStreamExportOptions {
  readonly source: AUFXAudioChunkStream;
  readonly sink: WritableStream<Uint8Array>;
  readonly format: "opus-webm";
  readonly bitrate?: number;
}
export type AUFXAudioStreamExport = Readonly<{ mimeType: "audio/webm"; fileType: "webm"; byteLength: number }>;
export type AUFXAudioFileExport =
  | Readonly<{ data: Blob; mimeType: "audio/wav"; byteLength: number; fileType: "wav" }>
  | Readonly<{ data: Blob; mimeType: "audio/webm"; byteLength: number; fileType: "webm" }>;
/** PCM WAV interchange. Compressed codec decoding is owned by the host. */
export class AUFXAudioFile {
  readonly #lifecycle = new SynCloudOSLifecycleRecord({ kind: "AUFXAudioFile" });
  readonly fileFormat: AUFXAudioFormat;
  readonly processingFormat: AUFXAudioFormat;
  readonly url: string | null;
  readonly #writable: boolean;
  #data: AUFXAudioPCMBuffer | null;
  #position = 0;
  #discontinuityGeneration = 0;
  /** Owned PCM file view; filesystem access and compressed codecs belong to scoped host services. */
  constructor(buffer: AUFXAudioPCMBuffer, mode: "read" | "read-write" = "read", frameCapacity = buffer.frameLength, metadata: Readonly<{ fileFormat?: AUFXAudioFormat; url?: string | null }> = {}) {
    if (!["read", "read-write"].includes(mode) || frameCapacity < buffer.frameLength) throw new RangeError("Invalid audio file mode/capacity.");
    this.processingFormat = buffer.format; this.fileFormat = metadata.fileFormat ?? buffer.format; this.url = metadata.url ?? null; this.#writable = mode === "read-write";
    const data = new AUFXAudioPCMBuffer(buffer.format, frameCapacity); data.frameLength = buffer.frameLength;
    for (let channel = 0; channel < buffer.format.channelCount; channel++) for (let frame = 0; frame < buffer.frameLength; frame++) data.setSample(channel, frame, buffer.getSample(channel, frame));
    this.#data = data;
  }
  private data(operation: string) { if (!this.#data) throw this.#lifecycle.error({ code: "AUFX_AUDIO_FILE_DISPOSED", operation: operation }); return this.#data; }
  get length() { return this.data("length").frameLength; }
  get isOpen() { return this.#data !== null; }
  get framePosition() { this.data("framePosition"); return this.#position; }
  set framePosition(value: number) { if (!Number.isSafeInteger(value) || value < 0 || value > this.data("framePosition").frameLength) throw new RangeError("Invalid audio file frame position."); if (value !== this.#position) this.#discontinuityGeneration++; this.#position = value; }
  observeClock() { this.data("observeClock"); return new AUFXClockObservation({ samplePosition: this.#position, sampleRate: this.processingFormat.sampleRate, domain: "source", hostAnchorSeconds: null, uncertaintySeconds: 0, discontinuityGeneration: this.#discontinuityGeneration }); }
  read(into: AUFXAudioPCMBuffer, frameCount = into.frameCapacity): number {
    const data = this.data("read");
    if (!into.format.isEqual(this.processingFormat) || !Number.isSafeInteger(frameCount) || frameCount < 0 || frameCount > into.frameCapacity) throw new RangeError("Invalid audio file read format/capacity.");
    const count = Math.min(frameCount, data.frameLength - this.#position); into.frameLength = count;
    for (let channel = 0; channel < data.format.channelCount; channel++) for (let frame = 0; frame < count; frame++) into.setSample(channel, frame, data.getSample(channel, this.#position + frame));
    this.#position += count; return count;
  }
  readFrames(frameCount: number): AUFXAudioPCMBuffer {
    if (!Number.isSafeInteger(frameCount) || frameCount < 0 || frameCount > 16_777_216) throw new RangeError("Invalid audio file frame count.");
    const output = new AUFXAudioPCMBuffer(this.processingFormat, Math.min(frameCount, this.data("readFrames").frameLength - this.#position)); this.read(output, output.frameCapacity); return output;
  }
  write(buffer: AUFXAudioPCMBuffer): void {
    const data = this.data("write"); if (!this.#writable) throw new Error("Audio file is read-only.");
    if (!buffer.format.isEqual(this.processingFormat) || this.#position + buffer.frameLength > data.frameCapacity) throw new RangeError("Invalid audio file write format/capacity.");
    data.frameLength = Math.max(data.frameLength, this.#position + buffer.frameLength);
    for (let channel = 0; channel < data.format.channelCount; channel++) for (let frame = 0; frame < buffer.frameLength; frame++) data.setSample(channel, this.#position + frame, buffer.getSample(channel, frame));
    this.#position += buffer.frameLength;
  }
  toWAV() { return AUFXAudioFile.encodeWAV(this.data("toWAV")); }
  close() { this.#lifecycle.markDisposed("explicit"); this.#data = null; this.#position = 0; this.#discontinuityGeneration++; }
  dispose() { this.close(); }
  static encodeWAV(buffer: AUFXAudioPCMBuffer): ArrayBuffer {
    const header = AUFXAudioFile.encodeWAVHeader(buffer.format, buffer.frameLength), pcm = AUFXAudioFile.encodePCM16Chunk(buffer);
    const output = new Uint8Array(header.byteLength + pcm.byteLength); output.set(header, 0); output.set(pcm, header.byteLength); return output.buffer;
  }
  static encodeWAVHeader(format: AUFXAudioFormat, frameLength: number): Uint8Array {
    if (!Number.isSafeInteger(frameLength) || frameLength < 0) throw new RangeError("Invalid WAV frame length.");
    const channels = format.channelCount, size = frameLength * channels * 2;
    if (!Number.isSafeInteger(size) || size > 0xffff_ffff - 36) throw new RangeError("WAV output exceeds the RIFF size limit.");
    const output = new Uint8Array(44), view = new DataView(output.buffer);
    const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
    text(0, "RIFF"); view.setUint32(4, 36 + size, true); text(8, "WAVE"); text(12, "fmt "); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, format.sampleRate, true);
    view.setUint32(28, format.sampleRate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
    text(36, "data"); view.setUint32(40, size, true);
    return output;
  }
  static encodePCM16Chunk(buffer: AUFXAudioPCMBuffer): Uint8Array {
    const channels = buffer.format.channelCount, output = new Uint8Array(buffer.frameLength * channels * 2), view = new DataView(output.buffer);
    for (let f = 0; f < buffer.frameLength; f++) for (let c = 0; c < channels; c++) {
      const value = Math.max(-1, Math.min(1, buffer.getSample(c, f)));
      view.setInt16((f * channels + c) * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
    }
    return output;
  }
  static decodeWAV(bytes: ArrayBuffer): AUFXAudioPCMBuffer {
    if (bytes.byteLength < 44 || bytes.byteLength > 67108864) throw new RangeError("Invalid WAV size.");
    const view = new DataView(bytes), text = (offset: number) => String.fromCharCode(...new Uint8Array(bytes, offset, 4));
    if (text(0) !== "RIFF" || text(8) !== "WAVE" || view.getUint32(4, true) + 8 > bytes.byteLength) throw new TypeError("Invalid WAV header.");
    let format: AUFXAudioFormat | undefined, dataOffset = -1, dataLength = 0;
    for (let offset = 12; offset + 8 <= bytes.byteLength;) {
      const length = view.getUint32(offset + 4, true), start = offset + 8;
      if (start + length > bytes.byteLength) throw new RangeError("Truncated WAV chunk.");
      if (text(offset) === "fmt ") {
        if (length < 16 || view.getUint16(start, true) !== 1 || view.getUint16(start + 14, true) !== 16) throw new TypeError("Only 16-bit PCM WAV is supported.");
        format = new AUFXAudioFormat(view.getUint32(start + 4, true), view.getUint16(start + 2, true));
        if (view.getUint16(start + 12, true) !== format.channelCount * 2) throw new TypeError("Invalid WAV block alignment.");
      } else if (text(offset) === "data") { dataOffset = start; dataLength = length; }
      offset = start + length + length % 2;
    }
    if (!format || dataOffset < 0 || dataLength % (format.channelCount * 2)) throw new TypeError("Missing or invalid WAV data.");
    const result = new AUFXAudioPCMBuffer(format, dataLength / (format.channelCount * 2)); result.frameLength = result.frameCapacity;
    for (let f = 0; f < result.frameLength; f++) for (let c = 0; c < format.channelCount; c++) result.setSample(c, f, view.getInt16(dataOffset + (f * format.channelCount + c) * 2, true) / 32768);
    return result;
  }
}
