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
import {
  NFXNDEFMessage, NFXNDEFPayload,
  type NFXAuthorizationStatus, type NFXNFCClient, type NFXNDEFReaderSession,
} from "../../FX/NFCFX/public";

interface BrowserNDEFRecord {
  readonly recordType: string;
  readonly mediaType?: string;
  readonly id?: string;
  readonly encoding?: string;
  readonly lang?: string;
  readonly data?: DataView | null;
  toRecords?(): readonly BrowserNDEFRecord[] | null;
}

interface BrowserNDEFRecordInit {
  recordType: string;
  mediaType?: string;
  id?: string;
  encoding?: string;
  lang?: string;
  data?: string | Uint8Array<ArrayBuffer> | { records: BrowserNDEFRecordInit[] };
}

interface BrowserNDEFReader extends EventTarget {
  scan(options: { signal: AbortSignal }): Promise<void>;
  write(message: { records: BrowserNDEFRecordInit[] }, options: { signal: AbortSignal; overwrite?: boolean }): Promise<void>;
  makeReadOnly?(options: { signal: AbortSignal }): Promise<void>;
}

export interface BrowserNFCAdapterOptions {
  readonly isSecureContext: boolean;
  readonly NDEFReader?: { new(): BrowserNDEFReader; readonly prototype: Partial<BrowserNDEFReader> };
  readonly permissions?: { query(descriptor: { name: "nfc" }): Promise<{ readonly state: PermissionState }> };
}

function fromRecords(records: readonly BrowserNDEFRecord[]): NFXNDEFMessage {
  return new NFXNDEFMessage(records.map(record => {
    let nested: readonly BrowserNDEFRecord[] | null | undefined;
    // Native toRecords exists on ordinary records too, where it throws. External
    // and local types can also contain opaque bytes rather than an NDEF message.
    if (record.recordType === "smart-poster" || record.recordType.includes(":")) {
      try { nested = record.toRecords?.(); } catch { /* Keep the original opaque payload. */ }
    }
    const bytes = record.data;
    return new NFXNDEFPayload({
      recordType: record.recordType, mediaType: record.mediaType, id: record.id,
      encoding: record.encoding, lang: record.lang,
      data: nested ? fromRecords(nested) : bytes ? NSEData.from(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)) : undefined,
    });
  }));
}

function toRecords(message: NFXNDEFMessage): BrowserNDEFRecordInit[] {
  return message.records.map(record => ({
    recordType: record.recordType, mediaType: record.mediaType, id: record.id,
    encoding: record.encoding, lang: record.lang,
    data: record.data instanceof NFXNDEFMessage ? { records: toRecords(record.data) }
      : record.data instanceof NSEData ? new Uint8Array(record.data.bytes) : record.data,
  }));
}

/** Injected foreground NDEF adapter; it does not expose native tag protocols. */
export class BrowserNFCAdapter implements NFXNFCClient {
  constructor(private readonly options: BrowserNFCAdapterOptions) {}

  getCapabilities() {
    const available = this.options.isSecureContext && !!this.options.NDEFReader;
    return Object.freeze({
      reading: available, writing: available,
      makingReadOnly: available && typeof this.options.NDEFReader?.prototype.makeReadOnly === "function",
    });
  }

  createReaderSession(signal?: AbortSignal): NFXNDEFReaderSession {
    signal?.throwIfAborted();
    const owner = new AbortController();
    const lease = owner.signal;
    let reader: BrowserNDEFReader | undefined;
    let scanning = false;
    let reading: EventListener | undefined;
    let readingError: EventListener | undefined;
    const dispose = () => {
      if (reader && reading) reader.removeEventListener("reading", reading);
      if (reader && readingError) reader.removeEventListener("readingerror", readingError);
      reading = undefined; readingError = undefined;
      signal?.removeEventListener("abort", onAbort);
      if (!lease.aborted) owner.abort(new DOMException("NFC session was disposed.", "AbortError"));
    };
    const onAbort = () => { owner.abort(signal?.reason); dispose(); };
    signal?.addEventListener("abort", onAbort, { once: true });
    const requireReader = () => {
      lease.throwIfAborted();
      if (!this.options.isSecureContext) throw new DOMException("NFC requires a secure context.", "SecurityError");
      const Reader = this.options.NDEFReader;
      if (!Reader) throw new DOMException("Web NFC is unavailable.", "NotSupportedError");
      return reader ??= new Reader();
    };
    const perform = <T>(operation: () => Promise<T>) => new Promise<T>((resolve, reject) => {
      const abort = () => reject(lease.reason);
      lease.addEventListener("abort", abort, { once: true });
      if (lease.aborted) { lease.removeEventListener("abort", abort); reject(lease.reason); return; }
      try {
        operation().then(value => { if (!lease.aborted) resolve(value); }, reject)
          .finally(() => lease.removeEventListener("abort", abort));
      } catch (error) { lease.removeEventListener("abort", abort); reject(error); }
    });
    return Object.freeze<NFXNDEFReaderSession>({
      getAuthorizationStatus: async (): Promise<NFXAuthorizationStatus> => {
        if (lease.aborted || !this.getCapabilities().reading) return "unavailable";
        if (!this.options.permissions) return "unknown";
        try {
          const status = await this.options.permissions.query({ name: "nfc" });
          if (lease.aborted) return "unavailable";
          return status.state === "granted" ? "granted" : status.state === "denied" ? "denied" : "prompt";
        } catch { return lease.aborted ? "unavailable" : "unknown"; }
      },
      scan: async (listener, onError) => {
        const device = requireReader();
        if (scanning) throw new DOMException("The NFC session is already scanning.", "InvalidStateError");
        scanning = true;
        reading = event => {
          if (lease.aborted) return;
          const record = event as Event & { serialNumber: string; message: { records: readonly BrowserNDEFRecord[] } };
          let message: NFXNDEFMessage;
          try { message = fromRecords(record.message.records); } catch (error) { onError?.(error); return; }
          listener(Object.freeze({ serialNumber: record.serialNumber, message }));
        };
        readingError = () => { if (!lease.aborted) onError?.(new DOMException("The NFC tag could not be read.", "NotReadableError")); };
        device.addEventListener("reading", reading);
        device.addEventListener("readingerror", readingError);
        try { await perform(() => device.scan({ signal: lease })); }
        catch (error) {
          if (reading) device.removeEventListener("reading", reading);
          if (readingError) device.removeEventListener("readingerror", readingError);
          reading = undefined; readingError = undefined; scanning = false;
          throw error;
        }
      },
      write: async (message, options = {}) => {
        const device = requireReader();
        return perform(() => device.write({ records: toRecords(message) }, { ...options, signal: lease }));
      },
      makeReadOnly: async () => {
        const device = requireReader();
        if (!device.makeReadOnly) throw new DOMException("Web NFC makeReadOnly is unavailable.", "NotSupportedError");
        return perform(() => device.makeReadOnly!({ signal: lease }));
      },
      dispose,
    });
  }
}
