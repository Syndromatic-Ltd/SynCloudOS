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

export const NSEDataCompressionAlgorithm = Object.freeze({
  zlib: "zlib", gzip: "gzip", brotli: "brotli", zstd: "zstd",
} as const);

export type NSEDataCompressionAlgorithm = typeof NSEDataCompressionAlgorithm[keyof typeof NSEDataCompressionAlgorithm];
export type CompressionOperation = "compress" | "decompress";

const formats: Readonly<Record<NSEDataCompressionAlgorithm, string>> = Object.freeze({
  // Apple's zlib is RFC 1951 raw DEFLATE, without the RFC 1950 wrapper.
  zlib: "deflate-raw", gzip: "gzip", brotli: "brotli", zstd: "zstd",
});

/** The sole codec factory. Uses web streams available in windows and workers. */
export function createCompressionStream(operation: CompressionOperation, algorithm: NSEDataCompressionAlgorithm): ReadableWritablePair<Uint8Array<ArrayBuffer>, BufferSource> {
  if (!Object.hasOwn(formats, algorithm)) throw new TypeError(`Unknown compression algorithm: ${String(algorithm)}.`);
  if (operation !== "compress" && operation !== "decompress") throw new TypeError(`Unknown compression operation: ${String(operation)}.`);
  const Codec = operation === "compress" ? globalThis.CompressionStream : globalThis.DecompressionStream;
  try {
    if (typeof Codec !== "function") throw new TypeError("Codec constructor is unavailable.");
    // Extra formats are deliberately constructor-probed; TypeScript's DOM union may lag the runtime.
    return new Codec(formats[algorithm] as CompressionFormat);
  } catch (cause) {
    throw new TypeError(`${operation === "compress" ? "Compression" : "Decompression"} ${algorithm} is unsupported in this environment.`, { cause });
  }
}

export function supportedCompressionAlgorithms(): readonly NSEDataCompressionAlgorithm[] {
  return Object.freeze(Object.values(NSEDataCompressionAlgorithm).filter((algorithm) => {
    let compress = false;
    let decompress = false;
    try { createCompressionStream("compress", algorithm); compress = true; } catch { /* unavailable */ }
    try { createCompressionStream("decompress", algorithm); decompress = true; } catch { /* unavailable */ }
    return compress && decompress;
  }));
}

export async function transformCompression(bytes: Uint8Array, operation: CompressionOperation, algorithm: NSEDataCompressionAlgorithm): Promise<Uint8Array<ArrayBuffer>> {
  const codec = createCompressionStream(operation, algorithm);
  const input = new ReadableStream<Uint8Array<ArrayBuffer>>({ start(controller) { controller.enqueue(bytes.slice()); controller.close(); } });
  const reader = input.pipeThrough(codec).getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      chunks.push(chunk.value);
      length += chunk.value.byteLength;
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
