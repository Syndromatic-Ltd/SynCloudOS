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

import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";

import { inspectImageBinaryMetadata, inspectImageBinaryMetadataForDecode } from "../../src/SynCloudOS/PlatformAdapters/imageBinaryMetadata";

const png = () => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 2, 0, 0, 0, 3]);
const pngChunk = (name: string, payload: Uint8Array) => {
  const chunk = new Uint8Array(payload.length + 12);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, payload.length);
  chunk.set(new TextEncoder().encode(name), 4);
  chunk.set(payload, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, chunk.length - 4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  view.setUint32(chunk.length - 4, (crc ^ 0xffffffff) >>> 0);
  return chunk;
};
const pngWithExifOrientation = (orientation: number, littleEndian = true) => {
  const tiff = new Uint8Array(26);
  const view = new DataView(tiff.buffer);
  tiff.set(littleEndian ? [73, 73] : [77, 77]);
  view.setUint16(2, 42, littleEndian);
  view.setUint32(4, 8, littleEndian);
  view.setUint16(8, 1, littleEndian);
  view.setUint16(10, 274, littleEndian);
  view.setUint16(12, 3, littleEndian);
  view.setUint32(14, 1, littleEndian);
  view.setUint16(18, orientation, littleEndian);
  const header = new Uint8Array([...png().subarray(16), 8, 6, 0, 0, 0]);
  const exif = pngChunk("eXIf", tiff);
  const bytes = new Uint8Array([...png().subarray(0, 8), ...pngChunk("IHDR", header), ...exif, ...pngChunk("IEND", new Uint8Array())]);
  return { bytes, exif };
};
const pngWithICC = (profile: Uint8Array) => {
  const compressed = new Uint8Array(deflateSync(profile));
  const payload = new Uint8Array([115, 82, 71, 66, 0, 0, ...compressed]);
  const base = pngWithExifOrientation(6).bytes;
  const icc = pngChunk("iCCP", payload);
  return { bytes: new Uint8Array([...base.subarray(0, 33), ...icc, ...base.subarray(33)]), icc };
};
const gif = () => new Uint8Array([71, 73, 70, 56, 57, 97, 2, 0, 3, 0, 0, 0, 0, 44, 0, 0, 0, 0, 2, 0, 3, 0, 0, 2, 1, 0, 0, 59]);
const gifICCProfile = () => {
  const profile = new Uint8Array(132);
  new DataView(profile.buffer).setUint32(0, profile.length);
  profile.set([97, 99, 115, 112], 36);
  return profile;
};
const gifWithICC = (profile: Uint8Array, authentication = "012", copies = 1) => {
  const extensionHeader = new Uint8Array([33, 255, 11, ...new TextEncoder().encode("ICCRGBG1"), ...new TextEncoder().encode(authentication)]);
  const blocks: Uint8Array[] = [];
  for (let start = 0; start < profile.length; start += 255) {
    const part = profile.subarray(start, start + 255);
    blocks.push(new Uint8Array([part.length, ...part]));
  }
  const extensionLength = extensionHeader.length + blocks.reduce((size, block) => size + block.length, 0) + 1;
  const base = gif();
  const bytes = new Uint8Array(base.length + copies * extensionLength);
  bytes.set(base.subarray(0, 13));
  let position = 13;
  for (let copy = 0; copy < copies; copy += 1) {
    bytes.set(extensionHeader, position);
    position += extensionHeader.length;
    for (const block of blocks) {
      bytes.set(block, position);
      position += block.length;
    }
    bytes[position++] = 0;
  }
  bytes.set(base.subarray(13), position);
  return bytes;
};
const jpeg = () => new Uint8Array([255, 216, 255, 192, 0, 17, 8, 0, 3, 0, 2, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0, 255, 217]);
const jpegWithExifOrientation = (orientation: number, littleEndian = true) => {
  const tiff = new Uint8Array(26);
  const view = new DataView(tiff.buffer);
  tiff.set(littleEndian ? [73, 73] : [77, 77]);
  view.setUint16(2, 42, littleEndian);
  view.setUint32(4, 8, littleEndian);
  view.setUint16(8, 1, littleEndian);
  view.setUint16(10, 274, littleEndian);
  view.setUint16(12, 3, littleEndian);
  view.setUint32(14, 1, littleEndian);
  view.setUint16(18, orientation, littleEndian);
  const segment = new Uint8Array([255, 225, 0, 34, 69, 120, 105, 102, 0, 0, ...tiff]);
  return new Uint8Array([255, 216, ...segment, ...jpeg().subarray(2)]);
};
const jpegWithICC = (parts = 2) => {
  const profile = new Uint8Array(132);
  new DataView(profile.buffer).setUint32(0, profile.length);
  profile.set([97, 99, 115, 112], 36);
  const chunks = Array.from({ length: parts }, (_, index) => {
    const payload = profile.subarray(Math.floor(index * profile.length / parts), Math.floor((index + 1) * profile.length / parts));
    const length = payload.length + 16;
    return [255, 226, length >>> 8, length & 255, 73, 67, 67, 95, 80, 82, 79, 70, 73, 76, 69, 0, index + 1, parts, ...payload];
  });
  return { bytes: new Uint8Array([255, 216, ...chunks.flat(), ...jpeg().subarray(2)]), profile };
};
const webp = () => new Uint8Array([82, 73, 70, 70, 22, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 88, 10, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0]);
const webpWithMetadata = () => {
  const profile = new Uint8Array(132);
  new DataView(profile.buffer).setUint32(0, profile.length);
  profile.set([97, 99, 115, 112], 36);
  const tiff = jpegWithExifOrientation(6).subarray(12, 38);
  const chunk = (name: string, payload: Uint8Array) => [
    ...new TextEncoder().encode(name),
    payload.length & 255, (payload.length >>> 8) & 255, (payload.length >>> 16) & 255, (payload.length >>> 24) & 255,
    ...payload, ...(payload.length % 2 ? [0] : []),
  ];
  const bytes = new Uint8Array([...webp(), ...chunk("ICCP", profile), ...chunk("EXIF", tiff)]);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  bytes[20] = 0x28;
  return { bytes, profile };
};

describe("bounded browser image header preflight", () => {
  it.each([
    ["image/png", png()],
    ["image/gif", gif()],
    ["image/jpeg", jpeg()],
    ["image/webp", webp()],
  ] as const)("reads finite dimensions from %s before browser decode", (mimeType, bytes) => {
    expect(inspectImageBinaryMetadata(mimeType, bytes)).toEqual({ width: 2, height: 3 });
  });

  it("rejects MIME confusion and malformed/truncated headers", () => {
    expect(() => inspectImageBinaryMetadata("image/jpeg", png())).toThrow(TypeError);
    expect(() => inspectImageBinaryMetadata("image/webp", webp().subarray(0, 20))).toThrow(TypeError);
  });

  it("preserves an owned ICC profile embedded in a GIF89a application extension", () => {
    const profile = gifICCProfile();
    const bytes = gifWithICC(profile);
    const metadata = inspectImageBinaryMetadata("image/gif", bytes);
    expect(metadata).toEqual({ width: 2, height: 3, sourceICCProfile: profile });
    bytes.fill(0);
    expect(metadata.sourceICCProfile).toEqual(profile);
  });

  it("ignores a non-ICC GIF application extension and rejects duplicate, truncated or oversized ICC data", () => {
    const profile = gifICCProfile();
    expect(inspectImageBinaryMetadata("image/gif", gifWithICC(profile, "999"))).toEqual({ width: 2, height: 3 });
    expect(() => inspectImageBinaryMetadata("image/gif", gifWithICC(profile, "012", 2))).toThrow(/duplicate|ICC/i);
    const truncated = gifWithICC(profile).subarray(0, 13 + 14 + 1 + profile.length - 1);
    expect(() => inspectImageBinaryMetadata("image/gif", truncated)).toThrow(/truncated|terminator|ICC/i);
    expect(() => inspectImageBinaryMetadata("image/gif", gifWithICC(new Uint8Array(4 * 1024 * 1024 + 1)))).toThrow(/ICC|bounded|limit/i);
  });

  it("rejects a GIF89a application extension without its mandatory 11-byte header", () => {
    const base = gif();
    const malformed = new Uint8Array([...base.subarray(0, 13), 33, 255, 0, ...base.subarray(13)]);
    expect(() => inspectImageBinaryMetadata("image/gif", malformed)).toThrow(/application|header/i);
  });

  it.each([true, false])("preserves %s-endian EXIF source orientation after JPEG frame inspection", littleEndian => {
    expect(inspectImageBinaryMetadata("image/jpeg", jpegWithExifOrientation(6, littleEndian))).toEqual({ width: 2, height: 3, sourceOrientation: 6 });
  });

  it("rejects malformed EXIF orientation instead of silently treating the source as upright", () => {
    expect(() => inspectImageBinaryMetadata("image/jpeg", jpegWithExifOrientation(9))).toThrow(/orientation/i);
  });

  it.each([true, false])("preserves %s-endian PNG eXIf source orientation", littleEndian => {
    const { bytes } = pngWithExifOrientation(6, littleEndian);
    expect(inspectImageBinaryMetadata("image/png", bytes)).toEqual({ width: 2, height: 3, sourceOrientation: 6 });
  });

  it("rejects duplicate, damaged or invalid PNG eXIf instead of publishing untrusted source orientation", () => {
    const { bytes, exif } = pngWithExifOrientation(6);
    const duplicate = new Uint8Array([...bytes.subarray(0, bytes.length - 12), ...exif, ...bytes.subarray(bytes.length - 12)]);
    expect(() => inspectImageBinaryMetadata("image/png", duplicate)).toThrow(/eXIf|duplicate/i);
    const corrupt = bytes.slice();
    corrupt[33 + 8 + 18] ^= 1;
    expect(() => inspectImageBinaryMetadata("image/png", corrupt)).toThrow(/CRC|eXIf/i);
    expect(() => inspectImageBinaryMetadata("image/png", pngWithExifOrientation(9).bytes)).toThrow(/orientation/i);
  });

  it("decompresses a PNG iCCP source profile into owned bounded bytes before decode", async () => {
    const profile = new Uint8Array(132);
    new DataView(profile.buffer).setUint32(0, profile.length);
    profile.set([97, 99, 115, 112], 36);
    const { bytes } = pngWithICC(profile);
    const metadata = await inspectImageBinaryMetadataForDecode("image/png", bytes, new AbortController().signal);
    expect(metadata).toEqual({ width: 2, height: 3, sourceOrientation: 6, sourceICCProfile: profile });
    bytes.fill(0);
    expect(metadata.sourceICCProfile).toEqual(profile);
  });

  it("rejects malformed, duplicate and decompression-bomb PNG iCCP chunks", async () => {
    const profile = new Uint8Array(132);
    new DataView(profile.buffer).setUint32(0, profile.length);
    profile.set([97, 99, 115, 112], 36);
    const { bytes, icc } = pngWithICC(profile);
    const duplicate = new Uint8Array([...bytes.subarray(0, 33), ...icc, ...bytes.subarray(33)]);
    expect(() => inspectImageBinaryMetadata("image/png", duplicate)).toThrow(/iCCP|duplicate/i);
    const invalidMethod = bytes.slice();
    invalidMethod[33 + 8 + 5] = 1;
    expect(() => inspectImageBinaryMetadata("image/png", invalidMethod)).toThrow(/iCCP|CRC|compression/i);
    const bomb = pngWithICC(new Uint8Array(4 * 1024 * 1024 + 1));
    await expect(inspectImageBinaryMetadataForDecode("image/png", bomb.bytes, new AbortController().signal)).rejects.toThrow(/ICC|bounded|limit/i);
  });

  it("assembles bounded ordered JPEG ICC chunks into owned source-profile bytes", () => {
    const { bytes, profile } = jpegWithICC();
    const metadata = inspectImageBinaryMetadata("image/jpeg", bytes);
    expect(metadata.sourceICCProfile).toEqual(profile);
    bytes.fill(0);
    expect(metadata.sourceICCProfile).toEqual(profile);
  });

  it("rejects missing ICC chunks instead of exposing a partial profile", () => {
    const { bytes } = jpegWithICC();
    bytes[18] = 2;
    expect(() => inspectImageBinaryMetadata("image/jpeg", bytes)).toThrow(/ICC/i);
  });

  it("preserves owned WebP ICC and bare-TIFF EXIF source metadata after VP8X", () => {
    const { bytes, profile } = webpWithMetadata();
    const metadata = inspectImageBinaryMetadata("image/webp", bytes);
    expect(metadata).toEqual({ width: 2, height: 3, sourceOrientation: 6, sourceICCProfile: profile });
    bytes.fill(0);
    expect(metadata.sourceICCProfile).toEqual(profile);
  });

  it("rejects incomplete or duplicate WebP metadata instead of publishing a partial profile", () => {
    const { bytes } = webpWithMetadata();
    const missing = bytes.slice();
    missing[20] = 0x28;
    new DataView(missing.buffer).setUint32(4, 22, true);
    expect(() => inspectImageBinaryMetadata("image/webp", missing)).toThrow(/ICC|EXIF|metadata/i);
    const duplicate = new Uint8Array([...bytes, ...bytes.subarray(30, 30 + 8 + 132)]);
    new DataView(duplicate.buffer).setUint32(4, duplicate.length - 8, true);
    expect(() => inspectImageBinaryMetadata("image/webp", duplicate)).toThrow(/ICC|duplicate/i);
  });

  it.each([
    ["image/png", (() => { const bytes = png(); new DataView(bytes.buffer).setUint32(16, 65_535); new DataView(bytes.buffer).setUint32(20, 65_535); return bytes; })()],
    ["image/gif", (() => { const bytes = gif(); new DataView(bytes.buffer).setUint16(18, 65_535, true); new DataView(bytes.buffer).setUint16(20, 65_535, true); return bytes; })()],
    ["image/jpeg", (() => { const bytes = jpeg(); new DataView(bytes.buffer).setUint16(7, 65_535); new DataView(bytes.buffer).setUint16(9, 65_535); return bytes; })()],
    ["image/webp", (() => { const bytes = webp(); bytes.set([255, 255, 255, 255, 255, 255], 24); return bytes; })()],
  ] as const)("rejects %s decompression-bomb dimensions from its encoded header", (mimeType, bytes) => {
    expect(() => inspectImageBinaryMetadata(mimeType, bytes)).toThrow(RangeError);
  });
});
