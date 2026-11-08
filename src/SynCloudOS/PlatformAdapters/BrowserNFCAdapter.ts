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
import { NFXNDEFMessage, NFXNDEFPayload, NFXReaderError } from "../../FX/NFCFX/public";
import { utf8, invalidNDEF } from "../../FX/NFCFX/internal/ndefEncoding";
import type { NFCAdapter, NFCEvents, NFCNativeSession, NFCNativeTag } from "../../FX/NFCFX/internal/nfcPort";
interface BrowserNDEFRecord {
  readonly recordType: string; readonly mediaType?: string; readonly id?: string;
  readonly encoding?: string; readonly lang?: string; readonly data?: DataView | null;
}
interface BrowserNDEFReader extends EventTarget { scan(options: { signal: AbortSignal }): Promise<void>; }
export interface BrowserNFCAdapterOptions {
  readonly isSecureContext: boolean;
  readonly NDEFReader?: { new(): BrowserNDEFReader };
}
const unsupported = () => new NFXReaderError("readerErrorUnsupportedFeature", "Web NFC cannot address or verify a selected tag, its capacity, availability or locking identity.");
function fromRecord(record: BrowserNDEFRecord): NFXNDEFPayload {
  const bytes = record.data ? NSEData.from(new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength)) : utf8("");
  // Web NFC decodes identifiers as strings. Refuse replacement/lone-surrogate
  // values rather than pretend a lossy decode can recover original ID bytes.
  const id = record.id ?? ""; if (id.includes("\ufffd") || new TextDecoder("utf-8", { ignoreBOM: true }).decode(new TextEncoder().encode(id)) !== id) throw invalidNDEF("Web NFC did not expose a lossless UTF-8 identifier.");
  const identifier = utf8(id); let result: NFXNDEFPayload;
  if (record.recordType === "text") {
    // The Web NFC parsing algorithm exposes the exact ASCII language and text
    // body, removing only the compliant status byte (reserved bit six is zero).
    const encoding = record.encoding; const language = record.lang;
    if (encoding !== "utf-8" && encoding !== "utf-16be" && encoding !== "utf-16") throw invalidNDEF("The native text encoding cannot be reconstructed losslessly.");
    if (typeof language !== "string" || !/^[\x00-\x7f]{0,63}$/.test(language)) throw invalidNDEF("Malformed Web NFC language bytes.");
    result = new NFXNDEFPayload(1, utf8("T"), identifier, NSEData.from(new Uint8Array([(encoding === "utf-8" ? 0 : 128) | language.length, ...new TextEncoder().encode(language), ...bytes.bytes])));
    result.wellKnownTypeTextPayload();
  } else if (record.recordType === "url" || record.recordType === "absolute-url") {
    throw new NFXReaderError("readerErrorUnsupportedFeature", "Web NFC normalizes URI records and does not expose their original NDEF prefix/type bytes.");
  } else if (record.recordType === "mime") {
    if (!record.mediaType || !/^[!-~]+\/[!-~]+$/.test(record.mediaType)) throw invalidNDEF("Malformed Web NFC media type."); result = new NFXNDEFPayload(2, utf8(record.mediaType), identifier, bytes);
  } else if (record.recordType === "empty") result = new NFXNDEFPayload(0, utf8(""), identifier, bytes);
  else if (record.recordType === "unknown") result = new NFXNDEFPayload(5, utf8(""), identifier, bytes);
  else if (record.recordType === "smart-poster") result = new NFXNDEFPayload(1, utf8("Sp"), identifier, bytes);
  else if (/^[a-z0-9.-]+:[!-~]+$/.test(record.recordType)) result = new NFXNDEFPayload(4, utf8(record.recordType), identifier, bytes);
  else throw unsupported();
  result.identifier = identifier; return result;
}
/** Lossless supported Web NFC record projection. Normalized URI records are
 * rejected. Opaque identifiers outside lossless UTF-8 cannot be recovered. */
export class BrowserNFCAdapter implements NFCAdapter {
  constructor(private readonly options: BrowserNFCAdapterOptions) {}
  get readingAvailable(): boolean { return this.options.isSecureContext && !!this.options.NDEFReader; }
  async open(signal: AbortSignal, events: NFCEvents): Promise<NFCNativeSession> {
    signal.throwIfAborted();
    if (!this.options.isSecureContext) throw new DOMException("NFC requires a secure context.", "SecurityError");
    const Reader = this.options.NDEFReader; if (!Reader) throw new NFXReaderError("readerErrorUnsupportedFeature", "Web NFC is unavailable.");
    const reader = new Reader(); const owner = new AbortController(); const lease = AbortSignal.any([signal, owner.signal]);
    const tag: NFCNativeTag = Object.freeze({ isAvailable: false, queryNDEFStatus: async () => { throw unsupported(); }, readNDEF: async () => { throw unsupported(); }, writeNDEF: async () => { throw unsupported(); }, writeLock: async () => { throw unsupported(); } });
    const reading: EventListener = event => {
      if (lease.aborted) return;
      try { const records = (event as Event & { message: { records: readonly BrowserNDEFRecord[] } }).message.records; const message = new NFXNDEFMessage(records.map(fromRecord)); events.messages([message]); events.tags([tag]); } catch (error) { events.error(error); }
    };
    const readingError = () => { if (!lease.aborted) events.error(new DOMException("The NFC tag could not be read.", "NotReadableError")); };
    const stop = () => { reader.removeEventListener("reading", reading); reader.removeEventListener("readingerror", readingError); signal.removeEventListener("abort", stop); owner.abort(); };
    reader.addEventListener("reading", reading); reader.addEventListener("readingerror", readingError); signal.addEventListener("abort", stop, { once: true });
    try {
      await new Promise<void>((resolve, reject) => {
        const abort = () => { lease.removeEventListener("abort", abort); reject(lease.reason); };
        lease.addEventListener("abort", abort, { once: true });
        Promise.resolve().then(() => { lease.throwIfAborted(); return reader.scan({ signal: lease }); }).then(resolve, reject).finally(() => lease.removeEventListener("abort", abort));
      }); lease.throwIfAborted();
    } catch (error) { stop(); throw error; }
    return Object.freeze({ connect: async () => { throw unsupported(); }, restartPolling() { lease.throwIfAborted(); }, async invalidate() { stop(); } });
  }
}
