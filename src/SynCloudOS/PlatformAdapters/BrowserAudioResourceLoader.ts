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

import type { BrowserSoundBytes } from "./BrowserSoundAdapter";

const MAX_BYTES = 16 * 1024 * 1024, MAX_CHUNKS = 4096, MAX_EMPTY_READS = 16;
function raceAbort<T>(operation: Promise<T>, signal: AbortSignal, discard?: (value: T) => void): Promise<T> {
  if (signal.aborted) { operation.then(value => { try { discard?.(value); } catch {} }, () => undefined); return Promise.reject(signal.reason ?? new DOMException("Audio resource load cancelled.", "AbortError")); }
  return new Promise((resolve, reject) => { let settled = false; const abort = () => { if (settled) return; settled = true; reject(signal.reason ?? new DOMException("Audio resource load cancelled.", "AbortError")); }; signal.addEventListener("abort", abort, { once: true }); operation.then(value => { if (settled) { try { discard?.(value); } catch {} return; } settled = true; signal.removeEventListener("abort", abort); resolve(value); }, error => { if (settled) return; settled = true; signal.removeEventListener("abort", abort); reject(error); }); });
}
function cancelResponse(response: Response) { try { const cancellation = response.body?.cancel(); if (cancellation) void cancellation.catch(() => undefined); } catch {} }
export function createBrowserAudioResourceLoader(browserWindow: Window) {
  return async (source: string, signal: AbortSignal): Promise<BrowserSoundBytes> => {
    signal.throwIfAborted(); const url = new URL(source, browserWindow.location.href);
    if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError("Sound URL scheme is unsupported.");
    if (url.origin !== browserWindow.location.origin) throw new DOMException("Cross-origin sound resources are not authorised.", "SecurityError");
    const response = await raceAbort(browserWindow.fetch(url.href, { signal, credentials: "same-origin", redirect: "error" }), signal, cancelResponse);
    if (!response.ok) throw new Error(`Sound resource request failed with status ${response.status}.`);
    const reader = response.body?.getReader(); if (!reader) throw new TypeError("Sound response has no readable body.");
    let bytes = new Uint8Array(0), total = 0, chunks = 0, empty = 0, complete = false;
    try {
      const declared = Number(response.headers.get("content-length")); if (Number.isFinite(declared) && declared > MAX_BYTES) throw new RangeError("Sound resource is too large.");
      while (true) { signal.throwIfAborted(); const part = await raceAbort(reader.read(), signal); signal.throwIfAborted(); if (part.done) { complete = true; break; }
        if (++chunks > MAX_CHUNKS) throw new RangeError("Sound response exceeded the chunk count limit.");
        if (!(part.value instanceof Uint8Array) || Object.getPrototypeOf(part.value) !== Uint8Array.prototype) throw new TypeError("Sound response contained an invalid byte chunk.");
        if (!part.value.byteLength) { if (++empty > MAX_EMPTY_READS) throw new RangeError("Sound response made no byte progress."); continue; } empty = 0;
        const next = total + part.value.byteLength; if (!Number.isSafeInteger(next) || next > MAX_BYTES) throw new RangeError("Sound resource is too large.");
        if (next > bytes.byteLength) { let capacity = bytes.byteLength || Math.min(65536, MAX_BYTES); while (capacity < next) capacity = Math.min(MAX_BYTES, capacity * 2); const grown = new Uint8Array(capacity); grown.set(bytes); bytes = grown; }
        bytes.set(part.value, total); total = next;
      }
      if (!total) throw new RangeError("Sound resource is empty.");
      return Object.freeze({ bytes: bytes.slice(0, total), mimeType: response.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "" });
    } finally {
      let cancellation: Promise<void> | undefined;
      if (!complete) try { cancellation = reader.cancel(); } catch {}
      const release = () => { try { reader.releaseLock(); } catch {} };
      release();
      if (cancellation) void cancellation.then(release, release);
    }
  };
}
