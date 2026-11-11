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

/** Compression.InputFilter. Browser codec reads and read closures may be asynchronous. */
export class CPFXInputFilter {
  readonly #codec: ReturnType<typeof filterCodec>;
  readonly #capacity: number;
  readonly #read: (count: number) => NSEData | null | Promise<NSEData | null>;
  #reader?: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>;
  #pending = new Uint8Array(0);
  #reading = false;
  #ended = false;
  #sourceFailed = false;
  #sourceError: unknown;

  constructor(operation: CPFXFilterOperation, algorithm: CPFXAlgorithm, readingFrom: (count: number) => NSEData | null | Promise<NSEData | null>);
  constructor(operation: CPFXFilterOperation, algorithm: CPFXAlgorithm, bufferCapacity: number, readingFrom: (count: number) => NSEData | null | Promise<NSEData | null>);
  /** Unsupported algorithms (including lz4/lzfse/lzma/lzbitmap) throw CPFXFilterError.invalidState. */
  constructor(operation: CPFXFilterOperation, algorithm: CPFXAlgorithm, capacityOrRead: number | ((count: number) => NSEData | null | Promise<NSEData | null>), readingFrom?: (count: number) => NSEData | null | Promise<NSEData | null>) {
    this.#capacity = filterCapacity(typeof capacityOrRead === "number" ? capacityOrRead : 65536);
    const read = typeof capacityOrRead === "function" ? capacityOrRead : readingFrom;
    if (typeof read !== "function") throw new CPFXFilterError("invalidState", "InputFilter requires a read closure.");
    this.#read = read;
    this.#codec = filterCodec(operation, algorithm);
  }

  /** Async because browser codecs and the supplied read closure may await data. Returns null at EOF. */
  async readData(ofLength: number): Promise<NSEData | null> {
    filterCapacity(ofLength);
    if (this.#reading) throw new CPFXFilterError("invalidState", "InputFilter already has a pending read.");
    if (this.#ended) return null;
    this.#reading = true;
    try {
      if (!this.#reader) {
        const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
          pull: async controller => {
            try {
              const data = await this.#read(this.#capacity);
              if (data === null || data.count === 0) controller.close();
              else if (data instanceof NSEData) controller.enqueue(data.bytes);
              else throw new CPFXFilterError("invalidData", "The read closure must return NSEData or null.");
            } catch (error) { this.#sourceFailed = true; this.#sourceError = error; throw error; }
          },
        });
        this.#reader = source.pipeThrough(this.#codec).getReader();
      }
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (length < ofLength) {
        if (this.#pending.length === 0) {
          const result = await this.#reader.read();
          if (result.done) { this.#ended = true; this.#reader.releaseLock(); break; }
          this.#pending = new Uint8Array(result.value);
          if (this.#pending.length === 0) continue;
        }
        const count = Math.min(ofLength - length, this.#pending.length);
        chunks.push(this.#pending.subarray(0, count));
        length += count;
        this.#pending = this.#pending.subarray(count);
      }
      if (length === 0) return null;
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return NSEData.from(bytes);
    } catch (error) {
      if (this.#sourceFailed) throw this.#sourceError;
      throw filterDataError(error);
    } finally { this.#reading = false; }
  }
}
