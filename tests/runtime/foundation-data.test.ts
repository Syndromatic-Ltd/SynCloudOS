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

import { runInNewContext } from "node:vm";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { NSEData, NSEDataCompressionAlgorithm } from "../../src/Foundation/NSEData";

describe("NSEData", () => {
  it("copies inputs and every exported byte buffer", () => {
    const source = new Uint8Array([0, 1, 128, 255]);
    const data = NSEData.from(source);
    source.fill(9);
    const view = data.bytes as Uint8Array;
    view.fill(8);
    new Uint8Array(view.buffer).fill(7);
    expect(Array.from(data.bytes)).toEqual([0, 1, 128, 255]);
    expect(data.count).toBe(4);
    expect(Object.isFrozen(data)).toBe(true);
    expect(NSEData.from(data)).not.toBe(data);
    expect(NSEData.from(data).isEqual(data)).toBe(true);
  });

  it("copies ArrayBuffers, preserves subview offsets, and reads Blobs", async () => {
    const buffer = new Uint8Array([1, 2, 3, 4]).buffer;
    const data = NSEData.from(buffer);
    new Uint8Array(buffer).fill(0);
    expect(Array.from(data.bytes)).toEqual([1, 2, 3, 4]);
    expect(Array.from(NSEData.from(data.bytes.subarray(1, 3)).bytes)).toEqual([2, 3]);
    expect((await NSEData.read(data.blob("application/example"))).isEqual(data)).toBe(true);
    expect(data.blob("application/example").type).toBe("application/example");
  });

  it("slices validated byte ranges including empty ranges", () => {
    const data = NSEData.from(new Uint8Array([1, 2, 3]));
    expect(Array.from(data.subdata({ location: 1, length: 2 }).bytes)).toEqual([2, 3]);
    expect(data.subdata({ location: 3, length: 0 }).count).toBe(0);
    for (const range of [{ location: -1, length: 1 }, { location: 0, length: -1 }, { location: 0.5, length: 1 }, { location: 2, length: 2 }, { location: Number.MAX_SAFE_INTEGER, length: 1 }]) {
      expect(() => data.subdata(range)).toThrow(RangeError);
    }
  });

  it("round-trips base64 with binary bytes and empty input", () => {
    const data = NSEData.from(new Uint8Array([0, 1, 128, 255]));
    expect(data.base64EncodedString()).toBe("AAGA/w==");
    expect(NSEData.fromBase64("AAGA/w==").isEqual(data)).toBe(true);
    expect(NSEData.fromBase64("").count).toBe(0);
    expect(NSEData.from(new Uint8Array()).base64EncodedString()).toBe("");
    expect(NSEData.from(new Uint8Array([1])).isEqual(data)).toBe(false);
    expect(NSEData.from(new Uint8Array([0, 1, 128, 254])).isEqual(data)).toBe(false);
  });

  it("encodes large binary values without argument or string-stack limits", () => {
    const binary = Uint8Array.from({ length: 100_000 }, (_, index) => index % 256);
    const data = NSEData.from(binary);
    expect(NSEData.fromBase64(data.base64EncodedString()).isEqual(data)).toBe(true);
  });

  it.each(["a", "%%%", "a===", "AB==", "AAA=ignored", "AA A=", "===="])("rejects invalid or noncanonical base64 %s", (text) => {
    expect(() => NSEData.fromBase64(text)).toThrow(TypeError);
  });

  it.each(["zlib", "gzip"] as const)("round-trips %s and empty data", async (algorithm) => {
    for (const bytes of [new Uint8Array(), new TextEncoder().encode("Foundation bytes ".repeat(400))]) {
      const data = NSEData.from(bytes);
      expect((await (await data.compressed(algorithm)).decompressed(algorithm)).isEqual(data)).toBe(true);
    }
    expect(NSEDataCompressionAlgorithm[algorithm]).toBe(algorithm);
  });

  it("rejects corrupted and truncated compressed bytes", async () => {
    await expect(NSEData.from(new Uint8Array([1, 2, 3])).decompressed("gzip")).rejects.toThrow();
    const packed = await NSEData.from(new Uint8Array([1, 2, 3])).compressed("gzip");
    await expect(packed.subdata({ location: 0, length: packed.count - 1 }).decompressed("gzip")).rejects.toThrow();
  });

  it("compresses zlib as RFC 1951 raw DEFLATE without an RFC 1950 header", async () => {
    const bytes = new TextEncoder().encode("Foundation raw DEFLATE ".repeat(40));
    const packed = await NSEData.from(bytes).compressed("zlib");
    // RFC 1950's CMF/FLG checksum identifies a zlib wrapper independently of
    // the compression level (78 01, 78 9c, 78 da, ...).
    const [cmf, flg] = packed.bytes;
    expect((cmf & 0x0f) === 8 && ((cmf << 8) + flg) % 31 === 0).toBe(false);
    expect(new Uint8Array(inflateRawSync(packed.bytes))).toEqual(bytes);
  });

  it("decompresses a known RFC 1951 stored-block vector through zlib", async () => {
    // Final uncompressed DEFLATE block: LEN=5, NLEN=~5, followed by 'hello'.
    // This fixed vector is independent of our compressor and has no wrapper.
    const vector = new Uint8Array([0x01, 0x05, 0x00, 0xfa, 0xff, 0x68, 0x65, 0x6c, 0x6c, 0x6f]);
    const unpacked = await NSEData.from(vector).decompressed("zlib");
    expect(new TextDecoder().decode(unpacked.bytes)).toBe("hello");
  });
});

it("bridges real cross-realm byte buffers and rejects forged or numeric views", () => {
  for (const source of [runInNewContext("new Uint8Array([3,4])"), runInNewContext("new Uint8Array([3,4]).buffer")]) {
    expect(NSEData.from(source).bytes).toEqual(new Uint8Array([3,4]));
  }
  for (const source of [new Uint16Array([3,4]), new Uint8ClampedArray([3,4]), { [Symbol.toStringTag]: "Uint8Array" }]) {
    expect(() => NSEData.from(source as never)).toThrow(TypeError);
  }
});
