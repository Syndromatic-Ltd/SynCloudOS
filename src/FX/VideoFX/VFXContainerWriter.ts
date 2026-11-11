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

import { NSEData, type NSEDataConvertible } from "../../Foundation/NSEData";


import { VFXEncodedChunk } from "./VFXEncodedChunk";

export interface VFXVideoContainerTrack {
  readonly id: number;
  readonly kind: "video";
  readonly codec: string;
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly timescale: number;
  readonly description?: NSEData;
}

/** Single-track audio uses the same bounded container port as video. */
export interface VFXAudioContainerTrack {
  readonly id: number;
  readonly kind: "audio";
  readonly codec: string;
  readonly sampleRate: number;
  readonly channelCount: number;
  readonly preSkip: number;
  readonly timescale: number;
}

export type VFXContainerTrack = VFXVideoContainerTrack | VFXAudioContainerTrack;
export type VFXContainerTrackInput = (Omit<VFXVideoContainerTrack, "description"> & { readonly description?: NSEDataConvertible }) | VFXAudioContainerTrack;

export interface VFXContainerCapability {
  readonly container: string;
  readonly codec: string;
  readonly read: boolean;
  readonly write: boolean;
  readonly streaming: boolean;
  readonly seekIndex: boolean;
  readonly provenance: string;
}

export interface VFXContainerBackendWriter {
  start(): readonly NSEData[];
  write(chunk: VFXEncodedChunk): readonly NSEData[];
  close(): readonly NSEData[];
}

export interface VFXContainerBackend {
  readonly container: string;
  readonly capabilities: readonly VFXContainerCapability[];
  supports(track: VFXContainerTrack, operation: "read" | "write"): boolean;
  createWriter(track: VFXContainerTrack): VFXContainerBackendWriter;
}

export interface VFXContainerByteSink {
  write(bytes: NSEData): void | Promise<void>;
  close?(): void | Promise<void>;
  abort?(reason: unknown): void | Promise<void>;
}

export type VFXContainerWriterState = "open" | "closing" | "closed" | "aborted";

export interface VFXContainerWriterDiagnostics {
  readonly peakBufferedBytes: number;
  readonly reservedInputBytes: number;
  readonly fragmentsWritten: number;
  readonly bytesWritten: number;
}

export interface VFXContainerWriterOptions {
  readonly backend: VFXContainerBackend;
  readonly sink: VFXContainerByteSink;
  readonly track: VFXContainerTrackInput;
  readonly maximumBufferedBytes?: number;
  readonly signal?: AbortSignal;
}

function limit(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || Number(value) < 256 || Number(value) > 512 * 1024 * 1024)
    throw new RangeError("Video container maximumBufferedBytes must be between 256 bytes and 512 MiB.");
  return Number(value);
}

function validateTrack(track: VFXContainerTrackInput): VFXContainerTrack {
  if (!track || typeof track !== "object") throw new TypeError("Video container track metadata is required.");
  if (!Number.isSafeInteger(track.id) || track.id < 1 || track.id > 126) throw new RangeError("Video container track id must be between 1 and 126.");
  if (track.kind !== "video" && track.kind !== "audio") throw new TypeError("VFX container track kind is invalid.");
  if (typeof track.codec !== "string" || !track.codec.trim()) throw new TypeError("Video container codec is required.");
  if (track.kind === "video") {
    if (!Number.isSafeInteger(track.codedWidth) || track.codedWidth < 1 || track.codedWidth > 16_384) throw new RangeError("Video container width is invalid.");
    if (!Number.isSafeInteger(track.codedHeight) || track.codedHeight < 1 || track.codedHeight > 16_384) throw new RangeError("Video container height is invalid.");
    if (track.description !== undefined) NSEData.from(track.description);
  } else {
    if (track.sampleRate !== 48_000 || !Number.isSafeInteger(track.channelCount) || track.channelCount < 1 || track.channelCount > 2 || !Number.isSafeInteger(track.preSkip) || track.preSkip < 0 || track.preSkip > 65_535)
      throw new RangeError("Unsupported audio sample rate, channel layout or pre-skip.");
  }
  if (!Number.isSafeInteger(track.timescale) || track.timescale < 1 || track.timescale > 1_000_000_000) throw new RangeError("Video container timescale is invalid.");
  if (track.kind === "video") {
    const { description, ...metadata } = track;
    return Object.freeze({ ...metadata, codec: track.codec.trim(), ...(description !== undefined ? { description: NSEData.from(description) } : {}) });
  }
  return Object.freeze({ ...track, codec: track.codec.trim() });
}

export class VFXContainerWriter {
  readonly #backend: VFXContainerBackend;
  readonly #sink: VFXContainerByteSink;
  readonly #writer: VFXContainerBackendWriter;
  readonly #maximumBufferedBytes: number;
  readonly #signal?: AbortSignal;
  #state: VFXContainerWriterState = "open";
  #started = false;
  #tail: Promise<void> = Promise.resolve();
  #reservedInputBytes = 0;
  #peakBufferedBytes = 0;
  #fragmentsWritten = 0;
  #bytesWritten = 0;

  constructor(options: VFXContainerWriterOptions) {
    if (!options || typeof options !== "object" || !options.backend || !options.sink || typeof options.sink.write !== "function")
      throw new TypeError("Video container writer requires a backend and byte sink.");
    const track = validateTrack(options.track);
    if (!options.backend.supports(track, "write"))
      throw new DOMException(`Unsupported ${track.codec} codec/container combination for ${options.backend.container}.`, "NotSupportedError");
    this.#backend = options.backend;
    this.#sink = options.sink;
    this.#writer = options.backend.createWriter(track);
    this.#maximumBufferedBytes = limit(options.maximumBufferedBytes, 8 * 1024 * 1024);
    this.#signal = options.signal;
    if (this.#signal?.aborted) this.#state = "aborted";
    this.#signal?.addEventListener("abort", () => { void this.#abort(this.#signal?.reason); }, { once: true });
  }

  get state(): VFXContainerWriterState { return this.#state; }
  get container(): string { return this.#backend.container; }
  get diagnostics(): VFXContainerWriterDiagnostics {
    return Object.freeze({
      peakBufferedBytes: this.#peakBufferedBytes,
      reservedInputBytes: this.#reservedInputBytes,
      fragmentsWritten: this.#fragmentsWritten,
      bytesWritten: this.#bytesWritten,
    });
  }

  write(chunk: VFXEncodedChunk): Promise<void> {
    this.#assertOpen();
    if (!(chunk instanceof VFXEncodedChunk)) throw new TypeError("Video container writer input must be VFXEncodedChunk.");
    const reservation = chunk.byteLength + 256;
    if (reservation > this.#maximumBufferedBytes || this.#reservedInputBytes + reservation > this.#maximumBufferedBytes)
      throw new DOMException("Video container buffered input limit exceeded.", "QuotaExceededError");
    this.#reservedInputBytes += reservation;
    const operation = this.#tail.then(async () => {
      this.#throwIfAborted();
      await this.#startIfNeeded();
      await this.#writeFragments(this.#writer.write(chunk));
    }).catch(async error => {
      await this.#abort(error);
      throw error;
    }).finally(() => {
      this.#reservedInputBytes -= reservation;
    });
    this.#tail = operation.catch(() => undefined);
    return operation;
  }

  async close(): Promise<void> {
    if (this.#state === "closed") return;
    this.#assertOpen();
    this.#state = "closing";
    try {
      await this.#tail;
      this.#throwIfAborted();
      await this.#startIfNeeded();
      await this.#writeFragments(this.#writer.close());
      this.#throwIfAborted();
      await this.#sink.close?.();
      this.#state = "closed";
    } catch (error) {
      await this.#abort(error);
      throw error;
    }
  }

  async #startIfNeeded(): Promise<void> {
    if (this.#started) return;
    this.#started = true;
    await this.#writeFragments(this.#writer.start());
  }

  async #writeFragments(fragments: readonly NSEData[]): Promise<void> {
    for (const fragment of fragments) {
      if (!(fragment instanceof NSEData)) throw new TypeError("Video container backend emitted an invalid byte fragment.");
      if (fragment.count > this.#maximumBufferedBytes)
        throw new DOMException("Video container fragment exceeds the configured buffer limit.", "QuotaExceededError");
      this.#peakBufferedBytes = Math.max(this.#peakBufferedBytes, fragment.count);
      this.#throwIfAborted();
      await this.#sink.write(fragment);
      this.#throwIfAborted();
      this.#fragmentsWritten += 1;
      this.#bytesWritten += fragment.count;
    }
  }

  async #abort(reason: unknown): Promise<void> {
    if (this.#state === "closed" || this.#state === "aborted") return;
    this.#state = "aborted";
    try { await this.#sink.abort?.(reason); } catch { /* abort cleanup is best effort */ }
  }

  #throwIfAborted(): void {
    if (this.#state === "aborted" || this.#signal?.aborted)
      throw this.#signal?.reason ?? new DOMException("Video container export aborted.", "AbortError");
  }

  #assertOpen(): void {
    if (this.#state !== "open") throw new DOMException("Video container writer is not open.", "InvalidStateError");
    this.#throwIfAborted();
  }
}
