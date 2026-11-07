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

import { normaliseNSERange, type NSERange } from "./NSERange";
import { transformCompression, type NSEDataCompressionAlgorithm } from "./internal/compression";

export { NSEDataCompressionAlgorithm } from "./internal/compression";
export type NSEDataConvertible = Uint8Array | ArrayBuffer | NSEData;

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Immutable byte value. Every input and returned byte view is copied. */
export class NSEData {
  readonly #storage: Uint8Array<ArrayBuffer>;

  private constructor(bytes: Uint8Array) {
    this.#storage = new Uint8Array(bytes);
    Object.freeze(this);
  }

  static from(value: NSEDataConvertible): NSEData {
    if (value instanceof NSEData) return new NSEData(value.#storage);
    if (value instanceof Uint8Array) return new NSEData(value);
    if (value instanceof ArrayBuffer) return new NSEData(new Uint8Array(value));
    throw new TypeError("NSEData requires Uint8Array, ArrayBuffer, or NSEData.");
  }

  static async read(blob: Blob): Promise<NSEData> { return NSEData.from(await blob.arrayBuffer()); }

  static fromBase64(text: string): NSEData {
    if (typeof text !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) {
      throw new TypeError("NSEData base64 must use canonical RFC 4648 encoding.");
    }
    const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
    const bytes = new Uint8Array(text.length / 4 * 3 - padding);
    let offset = 0;
    for (let index = 0; index < text.length; index += 4) {
      const value = (alphabet.indexOf(text[index]) << 18) | (alphabet.indexOf(text[index + 1]) << 12)
        | (Math.max(0, alphabet.indexOf(text[index + 2])) << 6) | Math.max(0, alphabet.indexOf(text[index + 3]));
      if (offset < bytes.length) bytes[offset++] = value >>> 16;
      if (offset < bytes.length) bytes[offset++] = value >>> 8;
      if (offset < bytes.length) bytes[offset++] = value;
    }
    const result = NSEData.from(bytes);
    if (result.base64EncodedString() !== text) throw new TypeError("NSEData base64 must use canonical RFC 4648 encoding.");
    return result;
  }

  get count(): number { return this.#storage.length; }

  /** A defensive copy; mutating its view or buffer never changes this value. */
  get bytes(): Readonly<Uint8Array<ArrayBuffer>> { return this.#storage.slice(); }

  subdata(range: NSERange): NSEData {
    const { location, length } = normaliseNSERange(range);
    if (location + length > this.count) throw new RangeError("NSEData range exceeds the byte count.");
    return new NSEData(this.#storage.subarray(location, location + length));
  }

  base64EncodedString(): string {
    const result: string[] = [];
    for (let index = 0; index < this.count; index += 3) {
      const a = this.#storage[index], b = this.#storage[index + 1], c = this.#storage[index + 2];
      result.push(alphabet[a >>> 2], alphabet[((a & 3) << 4) | ((b ?? 0) >>> 4)],
        index + 1 < this.count ? alphabet[((b & 15) << 2) | ((c ?? 0) >>> 6)] : "=",
        index + 2 < this.count ? alphabet[c & 63] : "=");
    }
    return result.join("");
  }

  isEqual(other: NSEData): boolean {
    return other instanceof NSEData && this.count === other.count && this.#storage.every((byte, index) => byte === other.#storage[index]);
  }

  blob(type = ""): Blob { return new Blob([this.#storage.slice()], { type }); }

  async compressed(algorithm: NSEDataCompressionAlgorithm): Promise<NSEData> {
    return NSEData.from(await transformCompression(this.#storage, "compress", algorithm));
  }

  async decompressed(algorithm: NSEDataCompressionAlgorithm): Promise<NSEData> {
    return NSEData.from(await transformCompression(this.#storage, "decompress", algorithm));
  }
}
