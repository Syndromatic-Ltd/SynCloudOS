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

export type TFXFontFormat = "truetype" | "opentype" | "woff" | "woff2";

const maximumFontBytes = 32 * 1024 * 1024;
const maximumDecodedFontBytes = 30 * 1024 * 1024;
const woffHeaderSize = 44;
const woff2HeaderSize = 48;

export interface TFXFontInputInfo {
  readonly format: TFXFontFormat;
  readonly decodedByteLength: number;
}

function uint32(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

function validateDecodedSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 12 || value > maximumDecodedFontBytes) {
    throw new RangeError("Decoded font size must contain 12 bytes to 30 MiB.");
  }
  return value;
}

export function inspectTFXFontInput(bytes: Uint8Array): TFXFontInputInfo {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("Font binary must be a Uint8Array.");
  if (bytes.byteLength < 12 || bytes.byteLength > maximumFontBytes) throw new RangeError("Font binary must contain 12 bytes to 32 MiB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = uint32(view, 0);
  if (signature === 0x00010000 || signature === 0x74727565) {
    return Object.freeze({ format: "truetype", decodedByteLength: bytes.byteLength });
  }
  if (signature === 0x4f54544f) {
    return Object.freeze({ format: "opentype", decodedByteLength: bytes.byteLength });
  }
  if (signature === 0x774f4646) {
    if (bytes.byteLength < woffHeaderSize || uint32(view, 8) !== bytes.byteLength || view.getUint16(14, false) !== 0) {
      throw new TypeError("Invalid WOFF header.");
    }
    return Object.freeze({ format: "woff", decodedByteLength: validateDecodedSize(uint32(view, 16)) });
  }
  if (signature === 0x774f4632) {
    if (bytes.byteLength < woff2HeaderSize || uint32(view, 8) !== bytes.byteLength || view.getUint16(14, false) !== 0) {
      throw new TypeError("Invalid WOFF2 header.");
    }
    return Object.freeze({ format: "woff2", decodedByteLength: validateDecodedSize(uint32(view, 16)) });
  }
  throw new TypeError("TFX font registration accepts TrueType, OpenType, WOFF, or WOFF2 font data.");
}

function align4(value: number): number {
  return Math.ceil(value / 4) * 4;
}

function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: (value: ReadableStreamReadResult<Uint8Array> | unknown) => void, value: ReadableStreamReadResult<Uint8Array> | unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      callback(value);
    };
    const abort = () => {
      finish(reject, signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    reader.read().then(
      (value) => finish(resolve as (value: ReadableStreamReadResult<Uint8Array> | unknown) => void, value),
      (error: unknown) => finish(reject, error),
    );
  });
}

async function inflateTable(source: Uint8Array, destination: Uint8Array, signal: AbortSignal): Promise<void> {
  if (typeof DecompressionStream !== "function") throw new TypeError("This host cannot decode WOFF data.");
  const stream = new Blob([source.slice().buffer]).stream().pipeThrough(new DecompressionStream("deflate"));
  const reader = stream.getReader();
  let offset = 0;
  let completed = false;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await readWithAbort(reader, signal);
      if (done) break;
      if (offset + value.byteLength > destination.byteLength) throw new RangeError("WOFF table exceeds its declared output size.");
      destination.set(value, offset);
      offset += value.byteLength;
    }
    if (offset !== destination.byteLength) throw new TypeError("WOFF table did not match its declared output size.");
    completed = true;
  } finally {
    if (completed) reader.releaseLock();
    else {
      void reader.cancel(signal.aborted ? signal.reason : undefined)
        .catch(() => undefined)
        .finally(() => {
          try { reader.releaseLock(); }
          catch { /* The reader remains owned until its in-flight read settles. */ }
        });
    }
  }
}

async function decodeWoff(bytes: Uint8Array, decodedByteLength: number, signal: AbortSignal): Promise<Uint8Array> {
  const input = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = input.getUint16(12, false);
  if (numTables < 1 || numTables > 4096 || woffHeaderSize + numTables * 20 > bytes.byteLength) throw new TypeError("Invalid WOFF table directory.");
  const minimumOutputSize = 12 + numTables * 16;
  if (decodedByteLength < minimumOutputSize) throw new TypeError("WOFF output is smaller than its SFNT table directory.");
  const output = new Uint8Array(decodedByteLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, uint32(input, 4), false);
  view.setUint16(4, numTables, false);
  const maximumPower = 2 ** Math.floor(Math.log2(numTables));
  view.setUint16(6, maximumPower * 16, false);
  view.setUint16(8, Math.log2(maximumPower), false);
  view.setUint16(10, numTables * 16 - maximumPower * 16, false);
  let outputOffset = 12 + numTables * 16;
  for (let index = 0; index < numTables; index += 1) {
    signal.throwIfAborted();
    const inputEntry = woffHeaderSize + index * 20;
    const sourceOffset = uint32(input, inputEntry + 4);
    const compressedLength = uint32(input, inputEntry + 8);
    const originalLength = uint32(input, inputEntry + 12);
    if (originalLength > decodedByteLength) throw new TypeError("Invalid WOFF table bounds.");
    const paddedLength = align4(originalLength);
    if (compressedLength > originalLength || sourceOffset < woffHeaderSize + numTables * 20 || sourceOffset + compressedLength > bytes.byteLength || outputOffset + paddedLength > output.byteLength) {
      throw new TypeError("Invalid WOFF table bounds.");
    }
    const outputEntry = 12 + index * 16;
    view.setUint32(outputEntry, uint32(input, inputEntry), false);
    view.setUint32(outputEntry + 4, uint32(input, inputEntry + 16), false);
    view.setUint32(outputEntry + 8, outputOffset, false);
    view.setUint32(outputEntry + 12, originalLength, false);
    const source = bytes.subarray(sourceOffset, sourceOffset + compressedLength);
    const destination = output.subarray(outputOffset, outputOffset + originalLength);
    if (compressedLength === originalLength) destination.set(source);
    else await inflateTable(source, destination, signal);
    outputOffset += paddedLength;
  }
  if (outputOffset !== decodedByteLength) throw new TypeError("WOFF decoded size does not match its header.");
  return output;
}

async function decodeWoff2(bytes: Uint8Array, decodedByteLength: number, signal: AbortSignal): Promise<Uint8Array> {
  signal.throwIfAborted();
  const module = await import("woff2-encoder/decompress");
  signal.throwIfAborted();
  const output = await module.default(bytes);
  signal.throwIfAborted();
  if (output.byteLength !== decodedByteLength || output.byteLength > maximumDecodedFontBytes) throw new TypeError("WOFF2 decoded size does not match its bounded header.");
  return output;
}

export async function decodeTFXFont(bytes: Uint8Array, info: TFXFontInputInfo, signal: AbortSignal): Promise<Uint8Array> {
  signal.throwIfAborted();
  if (info.format === "woff") return decodeWoff(bytes, info.decodedByteLength, signal);
  if (info.format === "woff2") return decodeWoff2(bytes, info.decodedByteLength, signal);
  return bytes.slice();
}
