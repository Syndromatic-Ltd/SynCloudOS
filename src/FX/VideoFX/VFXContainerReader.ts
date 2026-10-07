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

import { VFXEncodedChunk } from "./VFXEncodedChunk";
import type { VFXContainerBackend, VFXContainerTrack } from "./VFXContainerWriter";

export interface VFXContainerSeekPoint {
  readonly timestampMicroseconds: number;
  readonly byteOffset: number;
}

export interface VFXContainerReadResult {
  readonly container: string;
  readonly track: VFXContainerTrack;
  readonly chunks: readonly VFXEncodedChunk[];
  readonly seekIndex: readonly VFXContainerSeekPoint[];
}

export interface VFXContainerReadLimits {
  readonly maximumBufferedBytes: number;
  readonly maximumElementBytes: number;
  readonly maximumChunks: number;
}

export interface VFXContainerBackendReadSession {
  push(bytes: Uint8Array): void;
  finish(): VFXContainerReadResult;
}

export interface VFXContainerReadableBackend extends VFXContainerBackend {
  createReader(limits: VFXContainerReadLimits): VFXContainerBackendReadSession;
}

export interface VFXContainerReaderOptions {
  readonly backend: VFXContainerReadableBackend;
  readonly maximumBufferedBytes?: number;
  readonly maximumElementBytes?: number;
  readonly maximumChunks?: number;
  readonly signal?: AbortSignal;
}

function limit(value: unknown, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || Number(value) < 32 || Number(value) > 512 * 1024 * 1024)
    throw new RangeError(`${name} must be between 32 bytes and 512 MiB.`);
  return Number(value);
}

async function* source(input: Uint8Array | AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
  if (input instanceof Uint8Array) { yield input; return; }
  if (!input || typeof (input as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] !== "function")
    throw new TypeError("Video container source must be Uint8Array or AsyncIterable<Uint8Array>.");
  yield* input;
}

export class VFXContainerReader {
  readonly #backend: VFXContainerReadableBackend;
  readonly #limits: VFXContainerReadLimits;
  readonly #signal?: AbortSignal;

  constructor(options: VFXContainerReaderOptions) {
    if (!options || typeof options !== "object" || !options.backend) throw new TypeError("Video container reader requires a backend.");
    const maximumBufferedBytes = limit(options.maximumBufferedBytes, 8 * 1024 * 1024, "Video container maximumBufferedBytes");
    const maximumElementBytes = limit(options.maximumElementBytes, 4 * 1024 * 1024, "Video container maximumElementBytes");
    const maximumChunks = options.maximumChunks ?? 65_536;
    if (!Number.isSafeInteger(maximumChunks) || maximumChunks < 1 || maximumChunks > 1_048_576)
      throw new RangeError("Video container maximumChunks must be between 1 and 1048576.");
    if (maximumElementBytes > maximumBufferedBytes) throw new RangeError("Video container maximumElementBytes cannot exceed maximumBufferedBytes.");
    this.#backend = options.backend;
    this.#limits = Object.freeze({ maximumBufferedBytes, maximumElementBytes, maximumChunks });
    this.#signal = options.signal;
  }

  async read(input: Uint8Array | AsyncIterable<Uint8Array>): Promise<VFXContainerReadResult> {
    this.#throwIfAborted();
    const session = this.#backend.createReader(this.#limits);
    for await (const bytes of source(input)) {
      this.#throwIfAborted();
      if (!(bytes instanceof Uint8Array)) throw new TypeError("Video container source yielded a non-Uint8Array fragment.");
      session.push(bytes);
    }
    this.#throwIfAborted();
    const result = session.finish();
    if (!this.#backend.supports(result.track, "read"))
      throw new DOMException(`Unsupported ${result.track.codec} codec/container combination for ${this.#backend.container}.`, "NotSupportedError");
    return result;
  }

  #throwIfAborted(): void {
    if (this.#signal?.aborted) throw this.#signal.reason ?? new DOMException("Video container import aborted.", "AbortError");
  }
}
