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

import { AUFXAudioConverter } from "../../FX/AudioFX/AUFXAudioConverter";
import { AUFXAudioFile } from "../../FX/AudioFX/AUFXAudioFile";
import { AUFXAudioFormat } from "../../FX/AudioFX/AUFXAudioFormat";
import { AUFXAudioPCMBuffer } from "../../FX/AudioFX/AUFXAudioPCMBuffer";
import type { AUFXAudioCodecConfiguration, AUFXAudioCodecNegotiation, AUFXAudioCodecSupport, AUFXAudioFileCapabilities, AUFXAudioFileExport, AUFXAudioFileExportOptions, AUFXAudioFileOpenRequest, AUFXAudioStreamExport, AUFXAudioStreamExportOptions } from "../../FX/AudioFX/AUFXAudioFile";
import type { RuntimeAudioFilePort } from "../HostServices/PlatformAdapterRuntimePorts";
import type { BrowserSoundBytes } from "./BrowserSoundAdapter";
import { decodeOpusWebM, encodeOpusWebM, encodeOpusWebMStream } from "./BrowserOpusWebMCodec";

const MAX_SAMPLES = 16_777_216;
const MAX_NATIVE_DECODES = 2;
const MAX_SOURCE_BYTES = 4096;
export interface BrowserDecodedAudio { readonly sampleRate: number; readonly channels: readonly Float32Array[]; }
export interface BrowserAudioFilePlatform {
  loadBytes(source: string, signal: AbortSignal): Promise<BrowserSoundBytes>;
  decode?(bytes: Uint8Array, mimeType: string): Promise<BrowserDecodedAudio>;
  probeDecoder?(configuration: AUFXAudioCodecConfiguration): Promise<boolean>;
  probeEncoder?(configuration: AUFXAudioCodecConfiguration): Promise<boolean>;
}
function raceAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> { if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException("Audio file operation cancelled.", "AbortError")); return new Promise((resolve, reject) => { let settled = false; const abort = () => { if (settled) return; settled = true; reject(signal.reason ?? new DOMException("Audio file operation cancelled.", "AbortError")); }; signal.addEventListener("abort", abort, { once: true }); operation.then(value => { if (settled) return; settled = true; signal.removeEventListener("abort", abort); resolve(value); }, error => { if (settled) return; settled = true; signal.removeEventListener("abort", abort); reject(error); }); }); }
function mime(value: string) { const result = value.toLowerCase().trim(); if (!/^audio\/[a-z0-9.+-]{1,64}$/i.test(result)) throw new TypeError("Audio file MIME type is invalid."); return result; }
export class BrowserAudioFileAdapter implements RuntimeAudioFilePort {
  readonly #platform: BrowserAudioFilePlatform; readonly #observed = new Set<string>(); readonly #encoded = new Set<string>();
  #nativeDecodes = 0;
  constructor(platform: BrowserAudioFilePlatform) { this.#platform = platform; }
  capabilities(): AUFXAudioFileCapabilities { const portable: AUFXAudioCodecSupport = Object.freeze({ mimeType: "audio/wav", provenance: "portable" }); return Object.freeze({ decode: Object.freeze([portable, ...[...this.#observed].sort().filter(value => value !== "audio/wav").map(mimeType => Object.freeze({ mimeType, provenance: "observed-browser" as const }))]), encode: Object.freeze([portable, ...[...this.#encoded].sort().map(mimeType => Object.freeze({ mimeType, provenance: "observed-browser" as const }))]) }); }
  async negotiateCodec(configuration: AUFXAudioCodecConfiguration, signal: AbortSignal): Promise<AUFXAudioCodecNegotiation> {
    signal.throwIfAborted();
    const mimeType = mime(configuration.mimeType), codec = configuration.codec.trim();
    if (!codec || codec.length > 128 || /[\u0000-\u001f\u007f]/.test(codec) || !Number.isFinite(configuration.sampleRate) || configuration.sampleRate <= 0 || configuration.sampleRate > 384_000 || !Number.isInteger(configuration.channelCount) || configuration.channelCount < 1 || configuration.channelCount > 32 || configuration.bitrate !== undefined && (!Number.isFinite(configuration.bitrate) || configuration.bitrate <= 0)) throw new RangeError("Invalid audio codec configuration.");
    const normalized = Object.freeze({ ...configuration, mimeType, codec });
    if (mimeType === "audio/wav" && codec.toLowerCase() === "pcm-s16le") return Object.freeze({ ...normalized, decode: true, encode: true, provenance: "portable" });
    if (!this.#platform.probeDecoder && !this.#platform.probeEncoder) return Object.freeze({ ...normalized, decode: false, encode: false, provenance: "unavailable" });
    const [decode, encode] = await Promise.all([
      this.#platform.probeDecoder ? raceAbort(Promise.resolve(this.#platform.probeDecoder(normalized)), signal) : false,
      this.#platform.probeEncoder ? raceAbort(Promise.resolve(this.#platform.probeEncoder(normalized)), signal) : false,
    ]);
    signal.throwIfAborted();
    return Object.freeze({ ...normalized, decode: decode === true, encode: encode === true && mimeType === "audio/webm" && codec.toLowerCase() === "opus" && configuration.sampleRate === 48_000 && configuration.channelCount <= 2, provenance: "webcodecs-probe" });
  }
  async openFile(request: AUFXAudioFileOpenRequest, signal: AbortSignal) {
    if (!request || typeof request.source !== "string" || !request.source || /[\u0000-\u001f\u007f]/.test(request.source) || new TextEncoder().encode(request.source).byteLength > MAX_SOURCE_BYTES) throw new TypeError("Audio file source is invalid or exceeds the 4096-byte limit."); signal.throwIfAborted();
    const loaded = await raceAbort(this.#platform.loadBytes(request.source, signal), signal); signal.throwIfAborted();
    if (!(loaded.bytes instanceof Uint8Array) || loaded.bytes.byteLength < 1 || loaded.bytes.byteLength > 16 * 1024 * 1024) throw new RangeError("Encoded audio exceeds the compressed byte budget.");
    const mimeType = mime(loaded.mimeType);
    let source: AUFXAudioPCMBuffer, fileFormat: AUFXAudioFormat;
    if (["audio/wav", "audio/x-wav", "audio/wave"].includes(mimeType)) { source = AUFXAudioFile.decodeWAV(loaded.bytes.slice().buffer); fileFormat = source.format; }
    else if (mimeType === "audio/webm") {
      source = await decodeOpusWebM(loaded.bytes.slice(), signal);
      fileFormat = source.format;
      this.#observed.add(mimeType);
    }
    else {
      if (!this.#platform.decode) throw new DOMException("Browser-native audio decoding is unavailable.", "NotSupportedError");
      if (this.#nativeDecodes >= MAX_NATIVE_DECODES) throw new DOMException(`At most ${MAX_NATIVE_DECODES} browser-native audio decodes may run concurrently.`, "QuotaExceededError");
      this.#nativeDecodes++;
      let nativeDecode: Promise<BrowserDecodedAudio>;
      try { nativeDecode = this.#platform.decode(loaded.bytes.slice(), mimeType); }
      catch (error) { this.#nativeDecodes--; throw error; }
      const runningDecode = nativeDecode.finally(() => { this.#nativeDecodes--; });
      const decoded = await raceAbort(runningDecode, signal); signal.throwIfAborted();
      if (!Number.isFinite(decoded.sampleRate) || decoded.sampleRate <= 0 || !Number.isInteger(decoded.channels.length) || decoded.channels.length < 1 || decoded.channels.length > 32 || !decoded.channels[0]?.length || decoded.channels.some(channel => !(channel instanceof Float32Array) || channel.length !== decoded.channels[0].length) || decoded.channels.length * decoded.channels[0].length > MAX_SAMPLES) throw new RangeError("Decoded audio exceeds the owned PCM allocation budget.");
      fileFormat = new AUFXAudioFormat(decoded.sampleRate, decoded.channels.length); source = new AUFXAudioPCMBuffer(fileFormat, decoded.channels[0].length); source.frameLength = source.frameCapacity;
      for (let channel = 0; channel < decoded.channels.length; channel++) for (let frame = 0; frame < source.frameLength; frame++) { if ((frame & 1023) === 0) signal.throwIfAborted(); source.setSample(channel, frame, decoded.channels[channel][frame]); }
      signal.throwIfAborted(); this.#observed.add(mimeType);
    }
    const processing = request.processingFormat && !request.processingFormat.isEqual(source.format) ? AUFXAudioConverter.convert(source, request.processingFormat, signal) : source;
    signal.throwIfAborted(); return new AUFXAudioFile(processing, "read", processing.frameLength, { fileFormat, url: request.source });
  }
  async exportFile(file: AUFXAudioFile, signal: AbortSignal, options?: AUFXAudioFileExportOptions): Promise<AUFXAudioFileExport> {
    signal.throwIfAborted(); if (!file.isOpen) throw new Error("Audio file is closed.");
    if (options?.format === "opus-webm") {
      const data = await encodeOpusWebM(file, signal, options.bitrate);
      this.#encoded.add("audio/webm");
      return Object.freeze({ data, mimeType: "audio/webm", byteLength: data.size, fileType: "webm" });
    }
    if (options && options.format !== "wav") throw new DOMException("Unsupported audio export format.", "NotSupportedError");
    if (options?.bitrate !== undefined) throw new TypeError("WAV export does not accept a compressed bitrate.");
    const position = file.framePosition, length = file.length, header = AUFXAudioFile.encodeWAVHeader(file.processingFormat, length), parts: BlobPart[] = [header.buffer as ArrayBuffer]; file.framePosition = 0;
    try {
      while (file.framePosition < length) {
        signal.throwIfAborted();
        const pcm = file.readFrames(Math.min(2_048, length - file.framePosition));
        parts.push(AUFXAudioFile.encodePCM16Chunk(pcm).buffer as ArrayBuffer);
        if ((file.framePosition & 16_383) === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
      signal.throwIfAborted(); const data = new Blob(parts, { type: "audio/wav" }); return Object.freeze({ data, mimeType: "audio/wav", byteLength: data.size, fileType: "wav" });
    } finally { if (file.isOpen) file.framePosition = position; }
  }
  async exportStream(options: AUFXAudioStreamExportOptions, signal: AbortSignal): Promise<AUFXAudioStreamExport> {
    signal.throwIfAborted();
    if (options.format !== "opus-webm") throw new DOMException("Unsupported streaming audio export format.", "NotSupportedError");
    const result = await encodeOpusWebMStream(options.source, options.sink, signal, options.bitrate);
    this.#encoded.add("audio/webm");
    return result;
  }
}
