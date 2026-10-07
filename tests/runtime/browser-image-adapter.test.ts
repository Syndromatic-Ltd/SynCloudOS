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

import { BrowserImageAdapter, BrowserImageAdapterFactory } from "../../src/SynCloudOS/PlatformAdapters/BrowserImageAdapter";
import type { BrowserImagePlatform } from "../../src/SynCloudOS/PlatformAdapters/browserImageAdapterTypes";

function png(width = 1, height = 1) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

const source = Object.freeze({ kind: "bytes" as const, mimeType: "image/png" as const, bytes: png() });

function platform(): BrowserImagePlatform & { revokeObjectURL: ReturnType<typeof vi.fn> } {
  return {
    decode: vi.fn(async () => Object.freeze({ src: "blob:test", intrinsicSize: Object.freeze({ width: 8, height: 4 }), density: 1, byteLength: 3, corsClean: true, revoke: true })),
    export: vi.fn(async () => new Uint8Array([4])),
    revokeObjectURL: vi.fn(),
  };
}

describe("BrowserImageAdapter", () => {
  it("owns and revokes each object URL exactly once", async () => {
    const browser = platform();
    const adapter = new BrowserImageAdapter(browser);
    const controller = new AbortController();
    const lease = await adapter.decode({ cacheKey: "one", source, signal: controller.signal });
    lease.release(); lease.release(); adapter.dispose();
    expect(browser.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("creates independent leases for two runtimes sharing one browser environment", async () => {
    const browser = platform();
    const factory = new BrowserImageAdapterFactory(browser);
    const first = factory.acquire("runtime:same" as never, new AbortController().signal);
    const second = factory.acquire("runtime:same" as never, new AbortController().signal);
    const firstLease = await first.adapter.decode({ cacheKey: "first", source, signal: new AbortController().signal });
    const secondLease = await second.adapter.decode({ cacheKey: "second", source, signal: new AbortController().signal });
    first.release();
    expect(browser.revokeObjectURL).toHaveBeenCalledTimes(1);
    await expect(second.adapter.export(secondLease, "image/png", new AbortController().signal)).resolves.toEqual(new Uint8Array([4]));
    second.release(); firstLease.release(); secondLease.release();
    expect(browser.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("rejects hostile platform records without executing accessors", async () => {
    let getterCalls = 0;
    const hostile = Object.create(null);
    Object.defineProperty(hostile, "src", { enumerable: true, get() { getterCalls += 1; return "blob:bad"; } });
    const browser = platform();
    browser.decode = vi.fn(async () => hostile);
    const adapter = new BrowserImageAdapter(browser);
    await expect(adapter.decode({ cacheKey: "hostile", source, signal: new AbortController().signal })).rejects.toThrow(TypeError);
    expect(getterCalls).toBe(0);
    expect(browser.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("rejects an invalid source orientation and revokes the rejected decoded URL", async () => {
    const browser = platform();
    browser.decode = vi.fn(async () => ({ src: "blob:invalid-orientation", intrinsicSize: { width: 8, height: 4 }, density: 1, byteLength: 3, corsClean: true, revoke: true, sourceOrientation: 9 as never }));
    const adapter = new BrowserImageAdapter(browser);
    await expect(adapter.decode({ cacheKey: "bad-orientation", source, signal: new AbortController().signal })).rejects.toThrow(/orientation/i);
    expect(browser.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:invalid-orientation");
  });

  it("rejects ICC metadata larger than the bounded decoded profile size", async () => {
    const profile = new Uint8Array(4 * 1024 * 1024 + 1);
    new DataView(profile.buffer).setUint32(0, profile.length);
    profile.set([97, 99, 115, 112], 36);
    const browser = platform();
    browser.decode = vi.fn(async () => ({ src: "blob:oversized-profile", intrinsicSize: { width: 8, height: 4 }, density: 1, byteLength: 3, corsClean: true, revoke: true, sourceICCProfile: profile }));
    const adapter = new BrowserImageAdapter(browser);
    await expect(adapter.decode({ cacheKey: "profile-over-budget", source, signal: new AbortController().signal })).rejects.toThrow(/ICC|profile|budget/i);
    expect(browser.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:oversized-profile");
  });

  it("accepts a bounded PNG profile larger than its compressed encoded image", async () => {
    const profile = new Uint8Array(312);
    new DataView(profile.buffer).setUint32(0, profile.length);
    profile.set([97, 99, 115, 112], 36);
    const browser = platform();
    browser.decode = vi.fn(async () => ({ src: "blob:compressed-profile", intrinsicSize: { width: 1, height: 1 }, density: 1, byteLength: 260, corsClean: true, revoke: true, sourceICCProfile: profile }));
    const adapter = new BrowserImageAdapter(browser);
    const lease = await adapter.decode({ cacheKey: "compressed-profile", source, signal: new AbortController().signal });
    expect(lease.sourceICCProfile).toEqual(profile);
    lease.release();
    expect(browser.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:compressed-profile");
  });

  it("rejects request accessors before platform I/O", async () => {
    const browser = platform();
    const adapter = new BrowserImageAdapter(browser);
    let getterCalls = 0;
    const request = Object.create(null);
    Object.defineProperty(request, "cacheKey", { enumerable: true, get() { getterCalls += 1; return "bad"; } });
    Object.defineProperty(request, "source", { enumerable: true, value: source });
    Object.defineProperty(request, "signal", { enumerable: true, value: new AbortController().signal });
    await expect(adapter.decode(request)).rejects.toThrow(TypeError);
    expect(getterCalls).toBe(0);
    expect(browser.decode).not.toHaveBeenCalled();
  });

  it("copies typed arrays intrinsically without reading slice or expando accessors", async () => {
    const browser = platform();
    const adapter = new BrowserImageAdapter(browser);
    const bytes = png();
    let sliceReads = 0; let expandoReads = 0;
    Object.defineProperty(bytes, "slice", { get() { sliceReads += 1; throw new Error("poisoned slice"); } });
    Object.defineProperty(bytes, "metadata", { get() { expandoReads += 1; throw new Error("poisoned expando"); } });
    const lease = await adapter.decode({ cacheKey: "intrinsic-copy", source: { kind: "bytes", mimeType: "image/png", bytes }, signal: new AbortController().signal });
    expect(sliceReads).toBe(0);
    expect(expandoReads).toBe(0);
    lease.release();
  });

  it("rejects non-primitive MIME values without coercion", async () => {
    const browser = platform();
    const adapter = new BrowserImageAdapter(browser);
    let coercions = 0;
    const mimeType = { [Symbol.toPrimitive]() { coercions += 1; return "image/png"; } };
    await expect(adapter.decode({
      cacheKey: "hostile-mime",
      source: { kind: "bytes", mimeType, bytes: png() },
      signal: new AbortController().signal,
    } as never)).rejects.toThrow(TypeError);
    expect(coercions).toBe(0);
    expect(browser.decode).not.toHaveBeenCalled();
  });

  it("revokes a platform URL when decoded metadata validation fails", async () => {
    const browser = platform();
    browser.decode = vi.fn(async () => ({ src: "blob:invalid", intrinsicSize: { width: 0 }, density: 1, byteLength: 3, corsClean: true, revoke: true } as never));
    const adapter = new BrowserImageAdapter(browser);
    await expect(adapter.decode({ cacheKey: "invalid", source, signal: new AbortController().signal })).rejects.toThrow(TypeError);
    expect(browser.revokeObjectURL).toHaveBeenCalledWith("blob:invalid");
  });

  it("revokes a late decoded URL after adapter disposal", async () => {
    const browser = platform();
    let resolve!: (value: Awaited<ReturnType<BrowserImagePlatform["decode"]>>) => void;
    browser.decode = vi.fn(() => new Promise((settle) => { resolve = settle; }));
    const adapter = new BrowserImageAdapter(browser);
    const decoding = adapter.decode({ cacheKey: "late", source, signal: new AbortController().signal });
    adapter.dispose();
    resolve({ src: "blob:late", intrinsicSize: { width: 8, height: 4 }, density: 1, byteLength: 3, corsClean: true, revoke: true });
    await expect(decoding).rejects.toMatchObject({ name: "AbortError" });
    expect(browser.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("revokes a candidate when its caller aborts after platform settlement", async () => {
    const browser = platform();
    let resolve!: (value: Awaited<ReturnType<BrowserImagePlatform["decode"]>>) => void;
    browser.decode = vi.fn(() => new Promise((settle) => { resolve = settle; }));
    const adapter = new BrowserImageAdapter(browser);
    const controller = new AbortController();
    const decoding = adapter.decode({ cacheKey: "aborted-candidate", source, signal: controller.signal });
    resolve({ src: "blob:aborted-candidate", intrinsicSize: { width: 1, height: 1 }, density: 1, byteLength: source.bytes.byteLength, corsClean: true, revoke: true });
    controller.abort(new DOMException("caller stopped", "AbortError"));
    await expect(decoding).rejects.toMatchObject({ name: "AbortError" });
    expect(browser.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:aborted-candidate");
  });

  it("rejects decompression-bomb dimensions before platform allocation", async () => {
    const browser = platform();
    const adapter = new BrowserImageAdapter(browser);
    await expect(adapter.decode({
      cacheKey: "png-bomb",
      source: { kind: "bytes", mimeType: "image/png", bytes: png(65_536, 65_536) },
      signal: new AbortController().signal,
    })).rejects.toThrow(RangeError);
    expect(browser.decode).not.toHaveBeenCalled();
  });

  it("rejects an oversized GIF image descriptor before platform allocation", async () => {
    const browser = platform();
    const adapter = new BrowserImageAdapter(browser);
    const bytes = new Uint8Array([71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 0, 0, 0, 44, 0, 0, 0, 0, 255, 255, 255, 255, 0, 2, 1, 0, 0, 59]);
    await expect(adapter.decode({ cacheKey: "gif-frame-bomb", source: { kind: "bytes", mimeType: "image/gif", bytes }, signal: new AbortController().signal })).rejects.toThrow(RangeError);
    expect(browser.decode).not.toHaveBeenCalled();
  });
});
