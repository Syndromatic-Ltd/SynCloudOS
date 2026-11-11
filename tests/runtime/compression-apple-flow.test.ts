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

import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { NSEData, NSEDataCompressionAlgorithm } from "../../src/Foundation/NSEData";
import * as compression from "../../src/FX/CompressionFX/public";
import { CPFXAlgorithm, CPFXFilterOperation, CPFXFilterError, CPFXInputFilter, CPFXOutputFilter } from "../../src/FX/CompressionFX/public";

const original = NSEData.from(new TextEncoder().encode("Apple closure compression ".repeat(200)));
const join = (chunks: NSEData[]): NSEData => {
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.count, 0));
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk.bytes, offset); offset += chunk.count; }
  return NSEData.from(bytes);
};
const readingFrom = (data: NSEData) => {
  let offset = 0;
  return (capacity: number): NSEData | null => {
    if (offset === data.count) return null;
    const length = Math.min(capacity, data.count - offset);
    const part = data.subdata({ location: offset, length }); offset += length; return part;
  };
};
afterEach(() => vi.unstubAllGlobals());

describe("Compression's closure filters", () => {
  it("exports only the five Apple counterpart types, each registered explicitly", () => {
    const names = ["CPFXAlgorithm", "CPFXFilterOperation", "CPFXFilterError", "CPFXInputFilter", "CPFXOutputFilter"];
    expect(Object.keys(compression).sort()).toEqual(names.sort());
    const registry = JSON.parse(readFileSync("docs/framework/appkit-counterparts.json", "utf8"));
    for (const name of names) expect(registry.frameworkCounterparts[name]).toBe(name.slice(4));
    expect(Object.keys(CPFXAlgorithm).sort()).toEqual(["brotli", "lz4", "lzbitmap", "lzfse", "lzma", "zlib"]);
    expect(Object.keys(NSEDataCompressionAlgorithm).sort()).toEqual(["lz4", "lzfse", "lzma", "zlib"]);
  });

  it.each(["compress", "decompress"] as const)("pulls %s through a bounded read closure and returns null at EOF", async (operation) => {
    expect(CPFXFilterOperation[operation]).toBe(operation);
    const input = operation === "compress" ? original : await original.compressed("zlib");
    const read = vi.fn(readingFrom(input));
    const filter = new CPFXInputFilter(operation, CPFXAlgorithm.zlib, 7, read);
    expect(read).not.toHaveBeenCalled();
    const chunks: NSEData[] = [];
    for (;;) {
      const data = await filter.readData(19);
      if (data === null) break;
      expect(data.count).toBeGreaterThan(0); expect(data.count).toBeLessThanOrEqual(19); chunks.push(data);
    }
    expect(await filter.readData(19)).toBeNull();
    expect(read.mock.calls.every(([capacity]) => capacity === 7)).toBe(true);
    const output = join(chunks);
    expect(operation === "compress" ? new Uint8Array(inflateRawSync(output.bytes)) : output.bytes).toEqual(original.bytes);
  });

  it.each(["compress", "decompress"] as const)("pushes %s into a bounded write closure and signals EOF once", async (operation) => {
    const input = operation === "compress" ? original : await original.compressed("zlib");
    const chunks: NSEData[] = []; let eof = 0;
    const filter = new CPFXOutputFilter(operation, "zlib", 11, async data => {
      await Promise.resolve();
      if (data === null) eof++; else { expect(data.count).toBeLessThanOrEqual(11); chunks.push(data); }
    });
    for (let offset = 0; offset < input.count; offset += 13) await filter.write(input.subdata({ location: offset, length: Math.min(13, input.count - offset) }));
    await filter.write(null); expect(eof).toBe(1);
    const output = join(chunks);
    expect(operation === "compress" ? new Uint8Array(inflateRawSync(output.bytes)) : output.bytes).toEqual(original.bytes);
    await expect(filter.write(original)).rejects.toMatchObject({ code: "invalidData" });
  });

  it("accepts default buffer capacity and explicit finalize", async () => {
    const chunks: NSEData[] = []; let eof = false;
    const output = new CPFXOutputFilter("compress", "zlib", data => { if (data) chunks.push(data); else eof = true; });
    await output.write(original); await output.finalize(); expect(eof).toBe(true);
    const input = new CPFXInputFilter("decompress", "zlib", readingFrom(join(chunks)));
    const restored: NSEData[] = [];
    for (;;) { const chunk = await input.readData(original.count); if (!chunk) break; restored.push(chunk); }
    expect(join(restored).isEqual(original)).toBe(true);
  });

  it("fills the requested read length across codec chunks and treats empty source data as EOF", async () => {
    const large = NSEData.from(new Uint8Array(100000).fill(65));
    const packed = await large.compressed("zlib");
    let supplied = false;
    const input = new CPFXInputFilter("decompress", "zlib", () => {
      if (supplied) return NSEData.from(new Uint8Array());
      supplied = true; return packed;
    });
    expect((await input.readData(90000))?.count).toBe(90000);
    expect((await input.readData(90000))?.count).toBe(10000);
    expect(await input.readData(1)).toBeNull();
  });

  it("treats empty data as finalisation and allows repeated finalisation", async () => {
    let eof = 0;
    const output = new CPFXOutputFilter("compress", "zlib", data => { if (data === null) eof++; });
    await output.write(original);
    await output.write(NSEData.from(new Uint8Array()));
    expect(eof).toBe(1);
    await output.finalize(); await output.write(null);
    expect(eof).toBe(1);
    await expect(output.write(original)).rejects.toMatchObject({ code: "invalidData" });
  });

  it.each(["lz4", "lzfse", "lzma", "lzbitmap"] as const)("keeps unsupported Apple %s and fails with FilterError.invalidState", algorithm => {
    expect(() => new CPFXInputFilter("compress", algorithm, () => null)).toThrow(CPFXFilterError);
    expect(() => new CPFXOutputFilter("compress", algorithm, () => {})).toThrow(expect.objectContaining({ code: "invalidState" }));
  });

  it("uses FilterError for unavailable codecs, invalid parameters and corrupt input", async () => {
    for (const capacity of [0, -1, 1.5]) expect(() => new CPFXInputFilter("compress", "zlib", capacity, () => null)).toThrow(CPFXFilterError);
    const input = new CPFXInputFilter("decompress", "zlib", readingFrom(NSEData.from(new Uint8Array([255]))));
    await expect(input.readData(20)).rejects.toMatchObject({ code: "invalidData" });
    const output = new CPFXOutputFilter("decompress", "zlib", () => {});
    await expect((async () => { await output.write(NSEData.from(new Uint8Array([255]))); await output.finalize(); })()).rejects.toMatchObject({ code: "invalidData" });
    vi.stubGlobal("CompressionStream", undefined);
    expect(() => new CPFXOutputFilter("compress", "zlib", () => {})).toThrow(expect.objectContaining({ code: "invalidState" }));
  });

  it("preserves read/write closure failures without hanging", async () => {
    const failure = new Error("closure failed");
    const input = new CPFXInputFilter("compress", "zlib", async () => { throw failure; });
    await expect(input.readData(20)).rejects.toBe(failure);
    const output = new CPFXOutputFilter("compress", "zlib", async () => { throw failure; });
    await expect((async () => { await output.write(original); await output.finalize(); })()).rejects.toBe(failure);
  });

  it("rejects overlapping reads and waits for asynchronous destination completion", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let supplied = false;
    const input = new CPFXInputFilter("compress", "zlib", async () => { await gate; if (supplied) return null; supplied = true; return original; });
    const pending = input.readData(20);
    await expect(input.readData(20)).rejects.toMatchObject({ code: "invalidState" });
    release(); await pending;
    while (await input.readData(20)) { /* drain */ }
    let finish!: () => void;
    const completed = new Promise<void>(resolve => { finish = resolve; });
    const output = new CPFXOutputFilter("compress", "zlib", data => data === null ? completed : undefined);
    await output.write(original);
    let settled = false;
    const finalising = output.finalize().then(() => { settled = true; });
    await new Promise(resolve => setTimeout(resolve, 10)); expect(settled).toBe(false);
    finish(); await finalising; expect(settled).toBe(true);
  });
});
