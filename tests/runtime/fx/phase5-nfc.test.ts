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

import { expect, it, vi } from "vitest";
import { NFXNDEFMessage, NFXReaderError } from "../../../src/FX/NFCFX/public";
import { BrowserNFCAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserNFCAdapter";
import type { NFCNativeTag } from "../../../src/FX/NFCFX/internal/nfcPort";
class Reader extends EventTarget {
  static instances: Reader[] = [];
  signal?: AbortSignal;
  scan = vi.fn(async (options: { signal: AbortSignal }) => { this.signal = options.signal; });
  write = vi.fn(async () => {}); makeReadOnly = vi.fn(async () => {});
  constructor() { super(); Reader.instances.push(this); }
  reading(records: unknown[]) { this.dispatchEvent(Object.assign(new Event("reading"), { serialNumber: "tag", message: { records } })); }
}
const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
it("copies browser binary byte ranges, retains opaque containers and delivers lossless text NDEF", async () => {
  const owner = new AbortController(); const messages = vi.fn(); const error = vi.fn(); const tags = vi.fn();
  const native = await new BrowserNFCAdapter({ isSecureContext: true, NDEFReader: Reader }).open(owner.signal, { messages, tags, error });
  const bytes = new Uint8Array([0, 7, 8, 0]); const reader = Reader.instances.at(-1)!;
  reader.reading([{ recordType: "mime", mediaType: "application/octet-stream", data: view(bytes.subarray(1, 3)) }, { recordType: "text", encoding: "utf-8", lang: "en", data: view(new TextEncoder().encode("Hi")) }, { recordType: "example.com:opaque", data: view(new Uint8Array([1, 2])) }, { recordType: "smart-poster", data: view(new Uint8Array([0xd1, 1, 1, 0x55, 0])) }]); bytes.fill(99);
  const records = (messages.mock.calls[0]![0][0] as NFXNDEFMessage).records;
  expect([...records[0]!.payload.bytes]).toEqual([7, 8]); expect([...records[1]!.payload.bytes]).toEqual([2, 101, 110, 72, 105]); expect([...records[2]!.type.bytes]).toEqual([...new TextEncoder().encode("example.com:opaque")]); expect([...records[3]!.payload.bytes]).toEqual([0xd1, 1, 1, 0x55, 0]); expect(error).not.toHaveBeenCalled(); await native.invalidate(); expect(reader.signal?.aborted).toBe(true);
});
it("truthfully rejects addressed operations without invoking next-presented-tag write/lock APIs", async () => {
  const tags = vi.fn(); const native = await new BrowserNFCAdapter({ isSecureContext: true, NDEFReader: Reader }).open(new AbortController().signal, { messages() {}, tags, error() {} }); const reader = Reader.instances.at(-1)!; reader.reading([{ recordType: "empty" }]); const tag = tags.mock.calls[0]![0][0] as NFCNativeTag;
  expect(tag.isAvailable).toBe(false); for (const action of [() => native.connect(tag), () => tag.queryNDEFStatus(), () => tag.readNDEF(), () => tag.writeNDEF(new NFXNDEFMessage([])), () => tag.writeLock()]) await expect(action()).rejects.toMatchObject({ code: "readerErrorUnsupportedFeature" });
  expect(reader.write).not.toHaveBeenCalled(); expect(reader.makeReadOnly).not.toHaveBeenCalled(); native.restartPolling(); await native.invalidate();
});
it("keeps availability passive and preserves raw insecure/native denial for the privacy owner", async () => {
  const count = Reader.instances.length; const adapter = new BrowserNFCAdapter({ isSecureContext: true, NDEFReader: Reader }); expect(adapter.readingAvailable).toBe(true); expect(Reader.instances.length).toBe(count);
  const insecure = new BrowserNFCAdapter({ isSecureContext: false, NDEFReader: Reader }); expect(insecure.readingAvailable).toBe(false); await expect(insecure.open(new AbortController().signal, { messages() {}, tags() {}, error() {} })).rejects.toMatchObject({ name: "SecurityError" });
  class Denied extends Reader { override scan = vi.fn(async () => { throw new DOMException("Denied", "NotAllowedError"); }); } await expect(new BrowserNFCAdapter({ isSecureContext: true, NDEFReader: Denied }).open(new AbortController().signal, { messages() {}, tags() {}, error() {} })).rejects.toMatchObject({ name: "NotAllowedError" });
});
it("aborts pending scans promptly and removes reading/error listeners", async () => {
  class Pending extends Reader { override scan = vi.fn(() => new Promise<void>(() => {})); }
  const owner = new AbortController(); const received = vi.fn(); const pending = new BrowserNFCAdapter({ isSecureContext: true, NDEFReader: Pending }).open(owner.signal, { messages: received, tags: received, error: received }); const reader = Reader.instances.at(-1)!; owner.abort(); await expect(pending).rejects.toMatchObject({ name: "AbortError" }); reader.reading([{ recordType: "empty" }]); reader.dispatchEvent(new Event("readingerror")); expect(received).not.toHaveBeenCalled();
});
it.each([{ recordType: "text", encoding: "utf-8", lang: "en", data: view(new Uint8Array([0xff])) }, { recordType: "mime", mediaType: "a/b", id: "\ufffd", data: view(new Uint8Array([1])) }, { recordType: "url", data: view(new TextEncoder().encode("not a URL")) }, { recordType: "unknown-local" }])("rejects malformed or unrepresentable browser records as NFXReaderError", async record => {
  const error = vi.fn(); const messages = vi.fn(); const native = await new BrowserNFCAdapter({ isSecureContext: true, NDEFReader: Reader }).open(new AbortController().signal, { messages, tags() {}, error }); Reader.instances.at(-1)!.reading([record]); expect(error).toHaveBeenCalledWith(expect.any(NFXReaderError)); expect(messages).not.toHaveBeenCalled(); await native.invalidate();
});
it("forwards browser reading failure then suppresses events after invalidation", async () => {
  const error = vi.fn(); const native = await new BrowserNFCAdapter({ isSecureContext: true, NDEFReader: Reader }).open(new AbortController().signal, { messages() {}, tags() {}, error }); const reader = Reader.instances.at(-1)!; reader.dispatchEvent(new Event("readingerror")); expect(error).toHaveBeenCalledWith(expect.objectContaining({ name: "NotReadableError" })); await native.invalidate(); reader.dispatchEvent(new Event("readingerror")); expect(error).toHaveBeenCalledOnce();
});

it.each(["utf-16be", "utf-16"])("preserves text language casing and %s bytes without canonical re-encoding", async encoding => {
  const messages = vi.fn(); const error = vi.fn(); const native = await new BrowserNFCAdapter({ isSecureContext: true, NDEFReader: Reader }).open(new AbortController().signal, { messages, tags() {}, error });
  Reader.instances.at(-1)!.reading([{ recordType: "text", encoding, lang: "EN-us", data: view(new Uint8Array([0xfe, 0xff, 0, 65])) }]);
  expect(error).not.toHaveBeenCalled(); expect([...messages.mock.calls[0]![0][0].records[0].payload.bytes]).toEqual([0x85, 69, 78, 45, 117, 115, 0xfe, 0xff, 0, 65]); await native.invalidate();
});
it("rejects URI normalization because original prefix bytes cannot be recovered", async () => {
  const messages = vi.fn(); const error = vi.fn(); const native = await new BrowserNFCAdapter({ isSecureContext: true, NDEFReader: Reader }).open(new AbortController().signal, { messages, tags() {}, error }); Reader.instances.at(-1)!.reading([{ recordType: "url", data: view(new TextEncoder().encode("https://www.example.com/")) }]); expect(error).toHaveBeenCalledWith(expect.objectContaining({ code: "readerErrorUnsupportedFeature" })); expect(messages).not.toHaveBeenCalled(); await native.invalidate();
});
