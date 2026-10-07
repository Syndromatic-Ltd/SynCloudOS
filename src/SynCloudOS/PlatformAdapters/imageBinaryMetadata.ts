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

export interface ImageBinaryMetadata {
  readonly width: number;
  readonly height: number;
  /** EXIF orientation of the encoded source, before the browser's image decode. */
  readonly sourceOrientation?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** Owned bytes of a complete embedded ICC profile; not the color space of decoded canvas pixels. */
  readonly sourceICCProfile?: Uint8Array;
}

const maximumDecodedPixels = 64 * 1024 * 1024;
const maximumDimension = 32_768;

function dimensions(width: number, height: number): ImageBinaryMetadata {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
    width > maximumDimension || height > maximumDimension || width * height > maximumDecodedPixels) {
    throw new RangeError("Encoded image dimensions exceed the decode limit.");
  }
  return Object.freeze({ width, height });
}

function has(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function pngChunkCRC(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc ^= bytes[index]!;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function scanPng(bytes: Uint8Array): { metadata: ImageBinaryMetadata; compressedICC?: Uint8Array } {
  if (bytes.byteLength < 24 || !has(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]) || !has(bytes, 12, [73, 72, 68, 82])) {
    throw new TypeError("PNG header is malformed.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = dimensions(view.getUint32(16), view.getUint32(20));
  // Synthetic header-only preflight callers have no complete IHDR CRC to scan.
  if (bytes.byteLength < 33) return { metadata: size };
  let offset = 33;
  let sourceOrientation: ImageBinaryMetadata["sourceOrientation"];
  let seenExif = false;
  let seenICC = false;
  let seenImage = false;
  let compressedICC: Uint8Array | undefined;
  let chunks = 0;
  while (offset < bytes.byteLength) {
    if (offset + 12 > bytes.byteLength) throw new TypeError("PNG chunk header is truncated.");
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (length > 0x7fffffff || end > bytes.byteLength) throw new TypeError("PNG chunk length is invalid.");
    if (has(bytes, offset + 4, [101, 88, 73, 102])) {
      if (seenExif) throw new TypeError("PNG contains duplicate eXIf metadata.");
      if (length > 4 * 1024 * 1024) throw new RangeError("PNG eXIf exceeds the bounded size.");
      seenExif = true;
      if (view.getUint32(end - 4) !== pngChunkCRC(bytes, offset + 4, end - 4))
        throw new TypeError("PNG eXIf CRC is invalid.");
      if (has(bytes, offset + 8, [69, 120, 105, 102, 0, 0]))
        throw new TypeError("PNG eXIf must contain bare TIFF data.");
      sourceOrientation = inspectExifOrientation(bytes, offset + 8, end - 4, true);
    }
    if (has(bytes, offset + 4, [105, 67, 67, 80])) {
      if (seenICC || seenImage) throw new TypeError("PNG iCCP is duplicate or after image data.");
      if (length > 4 * 1024 * 1024) throw new RangeError("PNG iCCP exceeds the compressed-size limit.");
      seenICC = true;
      if (view.getUint32(end - 4) !== pngChunkCRC(bytes, offset + 4, end - 4))
        throw new TypeError("PNG iCCP CRC is invalid.");
      const start = offset + 8;
      const payloadEnd = end - 4;
      let separator = start;
      while (separator < payloadEnd && separator - start < 80 && bytes[separator] !== 0) separator += 1;
      if (separator === start || separator - start > 79 || separator + 2 >= payloadEnd || bytes[separator] !== 0 || bytes[separator + 1] !== 0)
        throw new TypeError("PNG iCCP name or compression method is invalid.");
      for (let index = start; index < separator; index += 1) {
        const code = bytes[index]!;
        if ((code < 0x20 || code > 0x7e) && (code < 0xa1 || code > 0xff))
          throw new TypeError("PNG iCCP profile name is invalid.");
        if (code === 0x20 && (index === start || index === separator - 1 || bytes[index - 1] === 0x20))
          throw new TypeError("PNG iCCP profile name spacing is invalid.");
      }
      compressedICC = bytes.slice(separator + 2, payloadEnd);
    }
    if (has(bytes, offset + 4, [73, 68, 65, 84]) || has(bytes, offset + 4, [80, 76, 84, 69])) seenImage = true;
    if (has(bytes, offset + 4, [73, 69, 78, 68])) break;
    offset = end;
    chunks += 1;
    if (chunks > 65_536) throw new RangeError("PNG chunk count exceeds the preflight limit.");
  }
  return { metadata: sourceOrientation === undefined ? size : Object.freeze({ ...size, sourceOrientation }), compressedICC };
}

function inspectPng(bytes: Uint8Array): ImageBinaryMetadata {
  return scanPng(bytes).metadata;
}

function inspectGif(bytes: Uint8Array): ImageBinaryMetadata {
  if (bytes.byteLength < 14 || (!has(bytes, 0, [71, 73, 70, 56, 55, 97]) && !has(bytes, 0, [71, 73, 70, 56, 57, 97]))) {
    throw new TypeError("GIF header is malformed.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const logicalSize = dimensions(view.getUint16(6, true), view.getUint16(8, true));
  const skipColourTable = (offset: number, packed: number) => {
    if ((packed & 0x80) === 0) return offset;
    const length = 3 * (2 ** ((packed & 0x07) + 1));
    if (offset + length > bytes.byteLength) throw new TypeError("GIF colour table is truncated.");
    return offset + length;
  };
  const skipSubBlocks = (start: number) => {
    let offset = start;
    let blocks = 0;
    while (offset < bytes.byteLength) {
      const length = bytes[offset++]!;
      if (length === 0) return offset;
      if (offset + length > bytes.byteLength) throw new TypeError("GIF data block is truncated.");
      offset += length;
      blocks += 1;
      if (blocks > 65_536) throw new RangeError("GIF data block count exceeds the preflight limit.");
    }
    throw new TypeError("GIF data block terminator is missing.");
  };
  let offset = skipColourTable(13, bytes[10]!);
  let frames = 0;
  let sourceICCProfile: Uint8Array | undefined;
  while (offset < bytes.byteLength) {
    const marker = bytes[offset++]!;
    if (marker === 0x3b) {
      if (frames === 0) throw new TypeError("GIF contains no image descriptor.");
      return sourceICCProfile === undefined ? logicalSize : Object.freeze({ ...logicalSize, sourceICCProfile });
    }
    if (marker === 0x21) {
      if (offset >= bytes.byteLength) throw new TypeError("GIF extension label is missing.");
      const label = bytes[offset++]!;
      if (label === 0xff && (bytes[offset] !== 11 || offset + 12 > bytes.byteLength))
        throw new TypeError("GIF application extension header is malformed.");
      // ICC.1 Annex B.5 identifies a GIF89a profile by both application fields.
      const isICC = bytes[4] === 57 && label === 0xff &&
        has(bytes, offset + 1, [73, 67, 67, 82, 71, 66, 71, 49, 48, 49, 50]);
      if (!isICC) {
        offset = skipSubBlocks(offset);
        continue;
      }
      if (sourceICCProfile !== undefined) throw new TypeError("GIF contains duplicate ICC profiles.");
      offset += 12;
      const parts: Uint8Array[] = [];
      let length = 0;
      let blocks = 0;
      for (;;) {
        if (offset >= bytes.byteLength) throw new TypeError("GIF ICC data block terminator is missing.");
        const blockLength = bytes[offset++]!;
        if (blockLength === 0) break;
        if (offset + blockLength > bytes.byteLength) throw new TypeError("GIF ICC data block is truncated.");
        length += blockLength;
        if (length > 4 * 1024 * 1024) throw new RangeError("GIF ICC profile exceeds the bounded size.");
        parts.push(bytes.subarray(offset, offset + blockLength));
        offset += blockLength;
        blocks += 1;
        if (blocks > 65_536) throw new RangeError("GIF ICC data block count exceeds the preflight limit.");
      }
      const profile = new Uint8Array(length);
      let position = 0;
      for (const part of parts) { profile.set(part, position); position += part.byteLength; }
      sourceICCProfile = ownedICCProfile(profile);
      continue;
    }
    if (marker !== 0x2c || offset + 9 > bytes.byteLength) throw new TypeError("GIF image descriptor is malformed.");
    const frameWidth = view.getUint16(offset + 4, true);
    const frameHeight = view.getUint16(offset + 6, true);
    dimensions(frameWidth, frameHeight);
    const packed = bytes[offset + 8]!;
    offset = skipColourTable(offset + 9, packed);
    if (offset >= bytes.byteLength || bytes[offset]! < 1 || bytes[offset]! > 8) throw new TypeError("GIF LZW code size is invalid.");
    offset = skipSubBlocks(offset + 1);
    frames += 1;
    if (frames > 4_096) throw new RangeError("GIF frame count exceeds the preflight limit.");
  }
  throw new TypeError("GIF trailer is missing.");
}

function inspectExifOrientation(bytes: Uint8Array, start: number, end: number, allowBareTiff = false): ImageBinaryMetadata["sourceOrientation"] {
  const prefixed = has(bytes, start, [69, 120, 105, 102, 0, 0]);
  if (!prefixed && !allowBareTiff) return undefined;
  const tiff = start + (prefixed ? 6 : 0);
  if (end - tiff < 8) throw new TypeError("EXIF TIFF header is truncated.");
  const littleEndian = has(bytes, tiff, [73, 73]);
  if (!littleEndian && !has(bytes, tiff, [77, 77])) throw new TypeError("EXIF byte order is invalid.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(tiff + 2, littleEndian) !== 42) throw new TypeError("EXIF TIFF header is invalid.");
  const ifd = tiff + view.getUint32(tiff + 4, littleEndian);
  if (!Number.isSafeInteger(ifd) || ifd < tiff + 8 || ifd + 2 > end) throw new TypeError("EXIF IFD offset is invalid.");
  const count = view.getUint16(ifd, littleEndian);
  if (count > 256 || ifd + 2 + count * 12 > end) throw new RangeError("EXIF IFD exceeds the segment limit.");
  let orientation: ImageBinaryMetadata["sourceOrientation"];
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (view.getUint16(entry, littleEndian) !== 274) continue;
    if (orientation !== undefined || view.getUint16(entry + 2, littleEndian) !== 3 || view.getUint32(entry + 4, littleEndian) !== 1) throw new TypeError("EXIF orientation entry is invalid.");
    const value = view.getUint16(entry + 8, littleEndian);
    if (value < 1 || value > 8) throw new RangeError("EXIF orientation is unsupported.");
    orientation = value as ImageBinaryMetadata["sourceOrientation"];
  }
  return orientation;
}

function ownedICCProfile(bytes: Uint8Array): Uint8Array {
  if (bytes.byteLength < 132 || bytes.byteLength > 4 * 1024 * 1024)
    throw new RangeError("Embedded ICC profile exceeds the bounded size.");
  const profile = bytes.slice();
  const view = new DataView(profile.buffer);
  if (view.getUint32(0) !== profile.byteLength || !has(profile, 36, [97, 99, 115, 112]))
    throw new TypeError("Embedded ICC profile header is invalid.");
  return profile;
}

function inspectJpeg(bytes: Uint8Array): ImageBinaryMetadata {
  if (bytes.byteLength < 11 || !has(bytes, 0, [255, 216])) throw new TypeError("JPEG header is malformed.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  let size: ImageBinaryMetadata | undefined;
  let sourceOrientation: ImageBinaryMetadata["sourceOrientation"];
  let iccCount = 0;
  let iccBytes = 0;
  const iccParts = new Map<number, Uint8Array>();
  while (offset + 3 < bytes.byteLength) {
    if (bytes[offset] !== 255) throw new TypeError("JPEG marker stream is malformed.");
    while (offset < bytes.byteLength && bytes[offset] === 255) offset += 1;
    if (offset >= bytes.byteLength) break;
    const marker = bytes[offset++]!;
    if (marker === 217 || marker === 218) break;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    if (offset + 2 > bytes.byteLength) throw new TypeError("JPEG segment is truncated.");
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.byteLength) throw new TypeError("JPEG segment length is invalid.");
    const isStartOfFrame = (marker >= 192 && marker <= 195) || (marker >= 197 && marker <= 199) ||
      (marker >= 201 && marker <= 203) || (marker >= 205 && marker <= 207);
    if (isStartOfFrame) {
      if (length < 7) throw new TypeError("JPEG frame header is malformed.");
      if (size) throw new TypeError("JPEG contains multiple frame headers.");
      size = dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
    }
    if (marker === 225) {
      const parsed = inspectExifOrientation(bytes, offset + 2, offset + length);
      if (parsed !== undefined) {
        if (sourceOrientation !== undefined) throw new TypeError("JPEG contains duplicate EXIF orientation metadata.");
        sourceOrientation = parsed;
      }
    }
    if (marker === 226 && length >= 16 && has(bytes, offset + 2, [73, 67, 67, 95, 80, 82, 79, 70, 73, 76, 69, 0])) {
      const sequence = bytes[offset + 14]!, count = bytes[offset + 15]!;
      if (sequence < 1 || count < 1 || sequence > count || (iccCount !== 0 && iccCount !== count) || iccParts.has(sequence)) throw new TypeError("JPEG ICC chunk sequence is invalid.");
      iccCount = count;
      const payload = bytes.subarray(offset + 16, offset + length);
      iccBytes += payload.byteLength;
      if (payload.byteLength === 0 || iccBytes > 4 * 1024 * 1024) throw new RangeError("JPEG ICC profile exceeds the bounded size.");
      iccParts.set(sequence, payload);
    }
    offset += length;
  }
  if (!size) throw new TypeError("JPEG dimensions are unavailable.");
  let sourceICCProfile: Uint8Array | undefined;
  if (iccCount !== 0) {
    if (iccParts.size !== iccCount || iccBytes < 132) throw new TypeError("JPEG ICC profile is incomplete.");
    sourceICCProfile = new Uint8Array(iccBytes);
    let position = 0;
    for (let sequence = 1; sequence <= iccCount; sequence += 1) {
      const part = iccParts.get(sequence);
      if (!part) throw new TypeError("JPEG ICC profile is missing a chunk.");
      sourceICCProfile.set(part, position);
      position += part.byteLength;
    }
    sourceICCProfile = ownedICCProfile(sourceICCProfile);
  }
  return Object.freeze({ ...size, ...(sourceOrientation === undefined ? {} : { sourceOrientation }), ...(sourceICCProfile === undefined ? {} : { sourceICCProfile }) });
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

function inspectWebp(bytes: Uint8Array): ImageBinaryMetadata {
  if (bytes.byteLength < 20 || !has(bytes, 0, [82, 73, 70, 70]) || !has(bytes, 8, [87, 69, 66, 80])) {
    throw new TypeError("WebP header is malformed.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riffLength = view.getUint32(4, true) + 8;
  if (riffLength < 20 || riffLength > bytes.byteLength) throw new TypeError("WebP container length is invalid.");
  if (has(bytes, 12, [86, 80, 56, 88])) {
    if (riffLength < 30 || view.getUint32(16, true) !== 10) throw new TypeError("WebP extended header is truncated.");
    const size = dimensions(readUint24LE(bytes, 24) + 1, readUint24LE(bytes, 27) + 1);
    const flags = bytes[20]!;
    let offset = 30;
    let sourceOrientation: ImageBinaryMetadata["sourceOrientation"];
    let sourceICCProfile: Uint8Array | undefined;
    let seenICC = false;
    let seenExif = false;
    let seenImage = false;
    while (offset < riffLength) {
      if (offset + 8 > riffLength) throw new TypeError("WebP chunk header is truncated.");
      const length = view.getUint32(offset + 4, true);
      const end = offset + 8 + length;
      if (end > riffLength || end + (length & 1) > riffLength) throw new TypeError("WebP chunk length is invalid.");
      if (has(bytes, offset, [73, 67, 67, 80])) {
        if (seenICC || seenImage || !(flags & 0x20)) throw new TypeError("WebP ICC chunk is duplicate, out of order or undeclared.");
        seenICC = true;
        sourceICCProfile = ownedICCProfile(bytes.subarray(offset + 8, end));
      } else if (has(bytes, offset, [69, 88, 73, 70])) {
        if (seenExif || !(flags & 0x08)) throw new TypeError("WebP EXIF chunk is duplicate or undeclared.");
        seenExif = true;
        sourceOrientation = inspectExifOrientation(bytes, offset + 8, end, true);
      } else if (has(bytes, offset, [86, 80, 56, 32]) || has(bytes, offset, [86, 80, 56, 76]) || has(bytes, offset, [65, 78, 73, 77]) || has(bytes, offset, [65, 78, 77, 70])) {
        seenImage = true;
      }
      offset = end + (length & 1);
    }
    if (Boolean(flags & 0x20) !== seenICC || Boolean(flags & 0x08) !== seenExif)
      throw new TypeError("WebP declared ICC or EXIF metadata is missing.");
    return Object.freeze({ ...size, ...(sourceOrientation === undefined ? {} : { sourceOrientation }), ...(sourceICCProfile === undefined ? {} : { sourceICCProfile }) });
  }
  if (has(bytes, 12, [86, 80, 56, 32])) {
    if (bytes.byteLength < 30 || !has(bytes, 23, [157, 1, 42])) throw new TypeError("WebP lossy frame header is malformed.");
    return dimensions(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
  }
  if (has(bytes, 12, [86, 80, 56, 76])) {
    if (bytes.byteLength < 25 || bytes[20] !== 47) throw new TypeError("WebP lossless frame header is malformed.");
    const bits = bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24);
    return dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  throw new TypeError("WebP chunk type is unsupported.");
}

export function inspectImageBinaryMetadata(mimeType: string, bytes: Uint8Array): ImageBinaryMetadata {
  if (!(bytes instanceof Uint8Array) || Object.getPrototypeOf(bytes) !== Uint8Array.prototype) throw new TypeError("Image bytes must be canonical.");
  if (mimeType === "image/png") return inspectPng(bytes);
  if (mimeType === "image/jpeg") return inspectJpeg(bytes);
  if (mimeType === "image/webp") return inspectWebp(bytes);
  if (mimeType === "image/gif") return inspectGif(bytes);
  throw new TypeError("Image MIME type is unsupported.");
}

/** Decode-time PNG profile inflation stays behind the private platform adapter. */
export async function inspectImageBinaryMetadataForDecode(mimeType: string, bytes: Uint8Array, signal: AbortSignal): Promise<ImageBinaryMetadata> {
  const metadata = inspectImageBinaryMetadata(mimeType, bytes);
  if (mimeType !== "image/png") return metadata;
  const { compressedICC } = scanPng(bytes);
  if (!compressedICC) return metadata;
  signal.throwIfAborted();
  if (typeof DecompressionStream !== "function") throw new TypeError("PNG iCCP decompression is unavailable on this host.");
  const stream = new Blob([compressedICC.buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream("deflate"));
  const reader = stream.getReader();
  const abort = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const next = await reader.read();
      signal.throwIfAborted();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > 4 * 1024 * 1024) throw new RangeError("PNG iCCP profile exceeds the bounded size.");
      parts.push(next.value);
    }
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const profile = new Uint8Array(length);
  let position = 0;
  for (const part of parts) { profile.set(part, position); position += part.byteLength; }
  return Object.freeze({ ...metadata, sourceICCProfile: ownedICCProfile(profile) });
}
