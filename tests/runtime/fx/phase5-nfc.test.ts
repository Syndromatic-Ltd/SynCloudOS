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

import { describe, expect, it, vi } from "vitest";
import { NSEData } from "../../../src/Foundation/NSEData";
import { NFXNDEFMessage, NFXNDEFPayload } from "../../../src/FX/NFCFX/public";
import { BrowserNFCAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserNFCAdapter";
import { createMountedNFCClient } from "../../../src/SynCloudOS/AppSDK/mountedNFCClient";

class Reader extends EventTarget {
  static instances: Reader[] = [];
  signal?: AbortSignal;
  scan = vi.fn(async (options: { signal: AbortSignal }) => { this.signal = options.signal; });
  write = vi.fn(async () => {});
  makeReadOnly = vi.fn(async () => {});
  constructor() { super(); Reader.instances.push(this); }
  reading(bytes: Uint8Array) {
    this.dispatchEvent(Object.assign(new Event("reading"), {
      serialNumber: "tag", message: { records: [{ recordType: "mime", mediaType: "application/octet-stream", data: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) }] },
    }));
  }
}

describe("phase 5 NFC", () => {
  it("copies NDEF payload bytes at the value and browser event boundaries", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const message = new NFXNDEFMessage([new NFXNDEFPayload({ recordType: "mime", data: bytes })]);
    bytes[0] = 9;
    expect((message.records[0].data as NSEData).bytes[0]).toBe(1);
    const session = new BrowserNFCAdapter({ isSecureContext: true, NDEFReader: Reader }).createReaderSession();
    const readings: NFXNDEFMessage[] = [];
    await session.scan(reading => readings.push(reading.message));
    Reader.instances.at(-1)!.reading(bytes.subarray(1));
    bytes.fill(8);
    expect((readings[0].records[0].data as NSEData).bytes).toEqual(new Uint8Array([2, 3]));
    session.dispose();
  });

  it("inspection is passive and missing or insecure Web NFC is unavailable", async () => {
    const query = vi.fn(async () => ({ state: "prompt" as const }));
    const adapter = new BrowserNFCAdapter({ isSecureContext: true, NDEFReader: Reader, permissions: { query } });
    const count = Reader.instances.length;
    expect(adapter.getCapabilities().reading).toBe(true);
    expect(Reader.instances.length).toBe(count);
    expect(query).not.toHaveBeenCalled();
    const session = adapter.createReaderSession();
    expect(await session.getAuthorizationStatus()).toBe("prompt");
    expect(Reader.instances.length).toBe(count);
    const missing = new BrowserNFCAdapter({ isSecureContext: false, NDEFReader: Reader }).createReaderSession();
    expect(await missing.getAuthorizationStatus()).toBe("unavailable");
    await expect(missing.scan(() => {})).rejects.toMatchObject({ name: "SecurityError" });
    session.dispose(); missing.dispose();
  });

  it("rechecks read/write declarations and policy, and unmount stops delivery", async () => {
    let permissions = ["nfc.read"];
    let allowed = true;
    const mount = new AbortController();
    const client = createMountedNFCClient(new BrowserNFCAdapter({ isSecureContext: true, NDEFReader: Reader }), mount.signal, () => permissions, () => allowed);
    const session = client.createReaderSession();
    const listener = vi.fn();
    await session.scan(listener);
    const reader = Reader.instances.at(-1)!;
    await expect(session.write(new NFXNDEFMessage([]))).rejects.toMatchObject({ name: "SecurityError" });
    permissions = ["nfc.read", "nfc.write"];
    await session.write(new NFXNDEFMessage([new NFXNDEFPayload({ recordType: "text", data: "hello" })]));
    expect(reader.write).toHaveBeenCalledTimes(1);
    allowed = false;
    await expect(session.makeReadOnly()).rejects.toMatchObject({ name: "SecurityError" });
    reader.reading(new Uint8Array([1]));
    expect(listener).not.toHaveBeenCalled();
    await expect(session.makeReadOnly()).rejects.toMatchObject({ name: "AbortError" });
    mount.abort();
    expect(reader.signal?.aborted).toBe(true);
    expect(await session.getAuthorizationStatus()).toBe("unavailable");
  });

  it("aborting a pending scan rejects promptly and removes event handlers", async () => {
    class PendingReader extends Reader { override scan = vi.fn(() => new Promise<void>(() => {})); }
    const owner = new AbortController();
    const session = new BrowserNFCAdapter({ isSecureContext: true, NDEFReader: PendingReader }).createReaderSession(owner.signal);
    const listener = vi.fn();
    const pending = session.scan(listener);
    owner.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    Reader.instances.at(-1)!.reading(new Uint8Array([1]));
    expect(listener).not.toHaveBeenCalled();
  });

  it("writes nested and binary NDEF data without starting a scan", async () => {
    const session = new BrowserNFCAdapter({ isSecureContext: true, NDEFReader: Reader }).createReaderSession();
    const bytes = new Uint8Array([7]);
    await session.write(new NFXNDEFMessage([{ recordType: "smart-poster", data: new NFXNDEFMessage([{ recordType: "mime", data: bytes }]) }]), { overwrite: false });
    const reader = Reader.instances.at(-1)!;
    expect(reader.scan).not.toHaveBeenCalled();
    expect(reader.write).toHaveBeenCalledWith({ records: [expect.objectContaining({ recordType: "smart-poster", data: { records: [expect.objectContaining({ recordType: "mime", data: new Uint8Array([7]) })] } })] }, expect.objectContaining({ overwrite: false, signal: expect.any(AbortSignal) }));
    await session.makeReadOnly();
    expect(reader.makeReadOnly).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
    session.dispose();
  });

  it("returns unknown for an unimplemented browser permission descriptor", async () => {
    const session = new BrowserNFCAdapter({ isSecureContext: true, NDEFReader: Reader, permissions: { query: async () => { throw new TypeError("Unsupported permission"); } } }).createReaderSession();
    expect(await session.getAuthorizationStatus()).toBe("unknown");
    session.dispose();
  });

  it("forwards reading errors and forbids two active scans on a session", async () => {
    const session = new BrowserNFCAdapter({ isSecureContext: true, NDEFReader: Reader }).createReaderSession();
    const onError = vi.fn();
    await session.scan(() => {}, onError);
    Reader.instances.at(-1)!.dispatchEvent(new Event("readingerror"));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ name: "NotReadableError" }));
    await expect(session.scan(() => {})).rejects.toMatchObject({ name: "InvalidStateError" });
    session.dispose();
  });
});
