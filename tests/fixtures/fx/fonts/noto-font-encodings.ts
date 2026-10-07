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

import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { compress } from "woff2-encoder";

// Test-only encodings of the existing OFL Noto Sans fixture. The source and
// license remain recorded in sources.json and notosans-OFL.txt beside it.
export const readNotoSans = (): Uint8Array => new Uint8Array(readFileSync(
  new URL("./notosans-NotoSans[wdth,wght].ttf", import.meta.url),
));

const align4 = (length: number): number => Math.ceil(length / 4) * 4;

function encodeWoff(ttf: Uint8Array): Uint8Array {
  const source = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength);
  const tableCount = source.getUint16(4);
  const tables = Array.from({ length: tableCount }, (_, index) => {
    const entry = 12 + index * 16;
    const offset = source.getUint32(entry + 8);
    const length = source.getUint32(entry + 12);
    const raw = ttf.subarray(offset, offset + length);
    const compressed = deflateSync(raw);
    return {
      tag: source.getUint32(entry), checksum: source.getUint32(entry + 4), length,
      bytes: compressed.byteLength < length ? compressed : raw,
    };
  });
  const directorySize = 44 + tableCount * 20;
  const result = new Uint8Array(directorySize + tables.reduce((size, table) => size + align4(table.bytes.byteLength), 0));
  const output = new DataView(result.buffer);
  output.setUint32(0, 0x774f4646); // wOFF
  output.setUint32(4, source.getUint32(0));
  output.setUint32(8, result.byteLength);
  output.setUint16(12, tableCount);
  output.setUint32(16, 12 + tableCount * 16 + tables.reduce((size, table) => size + align4(table.length), 0));
  output.setUint16(20, 1);
  let offset = directorySize;
  tables.forEach((table, index) => {
    const entry = 44 + index * 20;
    output.setUint32(entry, table.tag);
    output.setUint32(entry + 4, offset);
    output.setUint32(entry + 8, table.bytes.byteLength);
    output.setUint32(entry + 12, table.length);
    output.setUint32(entry + 16, table.checksum);
    result.set(table.bytes, offset);
    offset += align4(table.bytes.byteLength);
  });
  return result;
}

let encoded: Promise<{ ttf: Uint8Array; woff: Uint8Array; woff2: Uint8Array }> | undefined;

export async function notoFontEncodings(): Promise<{ ttf: Uint8Array; woff: Uint8Array; woff2: Uint8Array }> {
  encoded ??= (async () => {
    const ttf = readNotoSans();
    return { ttf, woff: encodeWoff(ttf), woff2: await compress(ttf) };
  })();
  const fonts = await encoded;
  return { ttf: fonts.ttf.slice(), woff: fonts.woff.slice(), woff2: fonts.woff2.slice() };
}
