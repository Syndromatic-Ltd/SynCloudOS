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

import { NSEData } from "../../Foundation/NSEData";
import type { CPFXAlgorithm } from "./CPFXAlgorithm";
import type { CPFXFilterOperation } from "./CPFXFilterOperation";
import { CPFXFilterError } from "./CPFXFilterError";
import { filterCapacity, filterCodec, filterDataError } from "./internal/filterCodec";

/** Compression.OutputFilter. Native web codec work and destination callbacks are asynchronous. */
export class CPFXOutputFilter {
  readonly #writer: WritableStreamDefaultWriter<BufferSource>;
  readonly #completion: Promise<void>;
  #finished = false;
  #finalization?: Promise<void>;
  #sinkFailed = false;
  #sinkError: unknown;

  constructor(operation: CPFXFilterOperation, algorithm: CPFXAlgorithm, writingTo: (data: NSEData | null) => void | Promise<void>);
  constructor(operation: CPFXFilterOperation, algorithm: CPFXAlgorithm, bufferCapacity: number, writingTo: (data: NSEData | null) => void | Promise<void>);
  /** Unsupported algorithms (including lz4/lzfse/lzma/lzbitmap) throw CPFXFilterError.invalidState. */
  constructor(operation: CPFXFilterOperation, algorithm: CPFXAlgorithm, capacityOrWrite: number | ((data: NSEData | null) => void | Promise<void>), writingTo?: (data: NSEData | null) => void | Promise<void>) {
    const capacity = filterCapacity(typeof capacityOrWrite === "number" ? capacityOrWrite : 65536);
    const write = typeof capacityOrWrite === "function" ? capacityOrWrite : writingTo;
    if (typeof write !== "function") throw new CPFXFilterError("invalidState", "OutputFilter requires a write closure.");
    const codec = filterCodec(operation, algorithm);
    this.#writer = codec.writable.getWriter();
    const deliver = async (data: NSEData | null) => {
      try { await write(data); }
      catch (error) { this.#sinkFailed = true; this.#sinkError = error; throw error; }
    };
    this.#completion = codec.readable.pipeTo(new WritableStream<Uint8Array<ArrayBuffer>>({
      async write(bytes) {
        for (let offset = 0; offset < bytes.length; offset += capacity) await deliver(NSEData.from(bytes.subarray(offset, offset + capacity)));
      },
      close: () => deliver(null),
    }));
    // Retain early destination errors for write/finalize without unhandled rejection.
    void this.#completion.catch(() => undefined);
  }

  /** Async for browser codec backpressure. As in Compression, null or empty data finalises the filter. */
  async write(data: NSEData | null): Promise<void> {
    if (data === null || (data instanceof NSEData && data.count === 0)) return this.finalize();
    if (this.#finished) throw new CPFXFilterError("invalidData", "Cannot write non-empty data to a finalised OutputFilter.");
    if (!(data instanceof NSEData)) throw new CPFXFilterError("invalidData", "OutputFilter requires NSEData.");
    try { await Promise.race([this.#writer.write(data.bytes), this.#completion]); }
    catch (error) { if (this.#sinkFailed) throw this.#sinkError; throw filterDataError(error); }
  }

  /** Async; waits for all encoded data and the final null callback to reach the destination. */
  async finalize(): Promise<void> {
    if (this.#finalization) return this.#finalization;
    this.#finished = true;
    this.#finalization = (async () => {
      try { await Promise.all([this.#writer.close(), this.#completion]); }
      catch (error) { if (this.#sinkFailed) throw this.#sinkError; throw filterDataError(error); }
      finally { this.#writer.releaseLock(); }
    })();
    return this.#finalization;
  }
}
