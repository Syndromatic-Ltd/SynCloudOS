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
import { createCompressionStream, supportedCompressionAlgorithms, NSEDataCompressionAlgorithm, type CompressionOperation } from "../../Foundation/internal/compression";

export const CPFXAlgorithm = NSEDataCompressionAlgorithm;
export type CPFXAlgorithm = NSEDataCompressionAlgorithm;
export type CPFXOperation = CompressionOperation;

export interface CPFXCapabilitySnapshot {
  readonly supported: boolean;
  readonly algorithms: readonly CPFXAlgorithm[];
}

export class CPFXCapabilities {
  static query(): CPFXCapabilitySnapshot {
    const algorithms = supportedCompressionAlgorithms();
    return Object.freeze({ supported: algorithms.length > 0, algorithms });
  }
}

export async function CPFXCompress(data: NSEDataConvertible, algorithm: CPFXAlgorithm): Promise<NSEData> {
  return NSEData.from(data).compressed(algorithm);
}

export async function CPFXDecompress(data: NSEDataConvertible, algorithm: CPFXAlgorithm): Promise<NSEData> {
  return NSEData.from(data).decompressed(algorithm);
}

/** Pull filter; readData returns at most ofLength bytes, or null at end of input. */
export class CPFXInputFilter {
  readonly #reader: ReadableStreamDefaultReader<Uint8Array>;
  readonly #completion: Promise<void>;
  #pending = new Uint8Array(0);
  #reading = false;

  constructor(operation: CPFXOperation, algorithm: CPFXAlgorithm, source: ReadableStream<NSEDataConvertible>) {
    if (source.locked) throw new TypeError("CPFXInputFilter requires an unlocked source stream.");
    const codec = createCompressionStream(operation, algorithm);
    const bridge = new TransformStream<NSEDataConvertible, Uint8Array<ArrayBuffer>>({
      transform(chunk, controller) { controller.enqueue(NSEData.from(chunk).bytes); },
    });
    // Both legs must settle: codec cancellation may reject before an async
    // upstream cancel callback has finished releasing its resources.
    this.#completion = Promise.allSettled([source.pipeTo(bridge.writable), bridge.readable.pipeTo(codec.writable)]).then(() => undefined);
    this.#reader = codec.readable.getReader();
  }

  async readData(ofLength: number): Promise<NSEData | null> {
    if (!Number.isSafeInteger(ofLength) || ofLength <= 0) throw new RangeError("CPFXInputFilter read length must be a positive safe integer.");
    if (this.#reading) throw new TypeError("CPFXInputFilter supports one pending readData call.");
    this.#reading = true;
    try {
      while (this.#pending.length === 0) {
        const chunk = await this.#reader.read();
        if (chunk.done) return null;
        this.#pending = new Uint8Array(chunk.value);
      }
      const length = Math.min(ofLength, this.#pending.length);
      const data = NSEData.from(this.#pending.subarray(0, length));
      this.#pending = this.#pending.subarray(length);
      return data;
    } finally { this.#reading = false; }
  }

  async cancel(reason?: unknown): Promise<void> {
    this.#pending = new Uint8Array(0);
    try { await this.#reader.cancel(reason); }
    finally { await this.#completion; }
  }
}

/** Push filter. The destination is drained concurrently so codec backpressure can resolve. */
export class CPFXOutputFilter {
  readonly #writer: WritableStreamDefaultWriter<BufferSource>;
  readonly #completion: Promise<void>;
  readonly #abortController = new AbortController();
  #finished = false;

  constructor(operation: CPFXOperation, algorithm: CPFXAlgorithm, destination: WritableStream<NSEData>) {
    if (destination.locked) throw new TypeError("CPFXOutputFilter requires an unlocked destination stream.");
    const codec = createCompressionStream(operation, algorithm);
    this.#writer = codec.writable.getWriter();
    this.#completion = codec.readable.pipeThrough(new TransformStream<Uint8Array, NSEData>({
      transform(chunk, controller) { controller.enqueue(NSEData.from(chunk)); },
    })).pipeTo(destination, { signal: this.#abortController.signal });
    // A sink can fail before the client next calls write/finalize. Retain that
    // rejection for those calls without emitting an unhandled promise rejection.
    void this.#completion.catch(() => undefined);
  }

  async write(data: NSEDataConvertible): Promise<void> {
    if (this.#finished) throw new TypeError("CPFXOutputFilter is finalized or aborted.");
    await Promise.race([this.#writer.write(NSEData.from(data).bytes), this.#completion]);
  }

  async finalize(): Promise<void> {
    if (this.#finished) throw new TypeError("CPFXOutputFilter is finalized or aborted.");
    this.#finished = true;
    await Promise.all([this.#writer.close(), this.#completion]);
  }

  async abort(reason?: unknown): Promise<void> {
    this.#finished = true;
    this.#abortController.abort(reason);
    await Promise.allSettled([this.#writer.abort(reason), this.#completion]);
  }
}
