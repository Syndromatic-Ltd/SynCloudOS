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
import { NSEData } from "../../src/Foundation/NSEData";
import { CPFXAlgorithm, CPFXCapabilities, CPFXCompress, CPFXDecompress, CPFXInputFilter, CPFXOutputFilter } from "../../src/FX/CompressionFX/public";

const bytes = new TextEncoder().encode("streamed Foundation data ".repeat(200));
const source = (data: Uint8Array) => new ReadableStream<Uint8Array>({ start(controller) {
  for (let index = 0; index < data.length; index += 7) controller.enqueue(data.slice(index, index + 7));
  controller.close();
} });

afterEach(() => vi.unstubAllGlobals());

describe("CompressionFX", () => {
  it("reports support only when both codec constructors accept the format", () => {
    const compression = vi.fn(function (_format: string) { return {}; });
    const decompression = vi.fn(function (format: string) { if (format !== "gzip") throw new TypeError("unavailable"); return {}; });
    vi.stubGlobal("CompressionStream", compression);
    vi.stubGlobal("DecompressionStream", decompression);
    const result = CPFXCapabilities.query();
    expect(compression.mock.calls.map((call) => call[0])).toEqual(["deflate", "gzip", "brotli", "zstd"]);
    expect(decompression.mock.calls.map((call) => call[0])).toEqual(["deflate", "gzip", "brotli", "zstd"]);
    expect(result.algorithms).toEqual(["gzip"]);
    expect(result.supported).toBe(true);
    expect(Object.isFrozen(result.algorithms)).toBe(true);
  });

  it("reports unavailable constructors and clearly rejects unsupported codecs", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    expect(CPFXCapabilities.query().supported).toBe(false);
    await expect(CPFXCompress(bytes, "gzip")).rejects.toThrow(/compression.*gzip.*unsupported/i);
    await expect(CPFXCompress(bytes, "lz4" as CPFXAlgorithm)).rejects.toThrow(/algorithm/i);
  });

  it("probes decompression even when compression fails", () => {
    const decompression = vi.fn(function (_format: string) { return {}; });
    vi.stubGlobal("CompressionStream", vi.fn(function () { throw new TypeError("unavailable"); }));
    vi.stubGlobal("DecompressionStream", decompression);
    expect(CPFXCapabilities.query().algorithms).toEqual([]);
    expect(decompression).toHaveBeenCalledTimes(4);
  });

  it("round-trips every algorithm actually supported by this runtime", async () => {
    for (const algorithm of CPFXCapabilities.query().algorithms) {
      expect((await CPFXDecompress(await CPFXCompress(bytes, algorithm), algorithm)).bytes).toEqual(bytes);
    }
  });

  it.each(["zlib", "gzip"] as const)("round-trips one-shot %s and bridges all input types", async (algorithm) => {
    const packed = await CPFXCompress(bytes.buffer, algorithm);
    expect(packed).toBeInstanceOf(NSEData);
    expect((await CPFXDecompress(packed, algorithm)).bytes).toEqual(bytes);
  });

  it.each(["compress", "decompress"] as const)("pulls %s in bounded readData chunks", async (operation) => {
    const input = operation === "compress" ? bytes : (await CPFXCompress(bytes, "gzip")).bytes;
    const filter = new CPFXInputFilter(operation, "gzip", source(input));
    const chunks: number[] = [];
    for (;;) {
      const chunk = await filter.readData(13);
      if (chunk === null) break;
      expect(chunk.count).toBeGreaterThan(0);
      expect(chunk.count).toBeLessThanOrEqual(13);
      chunks.push(...chunk.bytes);
    }
    const output = NSEData.from(new Uint8Array(chunks));
    expect(operation === "compress" ? (await CPFXDecompress(output, "gzip")).bytes : output.bytes).toEqual(bytes);
    expect(await filter.readData(13)).toBeNull();
  });

  it.each(["compress", "decompress"] as const)("pushes %s and finalizes its destination", async (operation) => {
    const input = operation === "compress" ? bytes : (await CPFXCompress(bytes, "gzip")).bytes;
    const output: number[] = [];
    let closed = false;
    const filter = new CPFXOutputFilter(operation, "gzip", new WritableStream<NSEData>({ write(chunk) { output.push(...chunk.bytes); }, close() { closed = true; } }));
    for (let index = 0; index < input.length; index += 19) await filter.write(input.slice(index, index + 19));
    await filter.finalize();
    expect(closed).toBe(true);
    const data = NSEData.from(new Uint8Array(output));
    expect(operation === "compress" ? (await CPFXDecompress(data, "gzip")).bytes : data.bytes).toEqual(bytes);
    await expect(filter.write(bytes)).rejects.toThrow();
  });

  it("rejects already-locked input streams before starting a pipeline", async () => {
    const input = new ReadableStream<NSEData>();
    const reader = input.getReader();
    const created: CPFXInputFilter[] = [];
    try {
      expect(() => { created.push(new CPFXInputFilter("compress", "gzip", input)); }).toThrow(/locked/i);
    } finally {
      await Promise.all(created.map((filter) => filter.cancel("test cleanup")));
      reader.releaseLock();
    }
  });

  it("rejects already-locked destinations before starting a pipeline", async () => {
    const destination = new WritableStream<NSEData>();
    const writer = destination.getWriter();
    const created: CPFXOutputFilter[] = [];
    try {
      expect(() => { created.push(new CPFXOutputFilter("compress", "gzip", destination)); }).toThrow(/locked/i);
    } finally {
      await Promise.all(created.map((filter) => filter.abort("test cleanup")));
      writer.releaseLock();
    }
  });

  it("propagates source failures and invalid compressed input", async () => {
    const failure = new Error("source failed");
    const filter = new CPFXInputFilter("compress", "gzip", new ReadableStream({ start(controller) { controller.error(failure); } }));
    await expect(filter.readData(100)).rejects.toBe(failure);
    const corrupt = new CPFXInputFilter("decompress", "gzip", source(new Uint8Array([1, 2, 3])));
    await expect(corrupt.readData(100)).rejects.toThrow();
  });

  it("cancels its upstream source and validates read lengths", async () => {
    const cancelled = vi.fn();
    const filter = new CPFXInputFilter("compress", "gzip", new ReadableStream({ cancel: cancelled }));
    await expect(filter.readData(0)).rejects.toThrow(RangeError);
    await filter.cancel("finished");
    expect(cancelled).toHaveBeenCalledWith("finished");
  });

  it("propagates destination failure and aborts the destination", async () => {
    const failure = new Error("destination failed");
    const filter = new CPFXOutputFilter("compress", "gzip", new WritableStream({ write() { throw failure; } }));
    await filter.write(bytes).catch(() => undefined);
    await expect(filter.finalize()).rejects.toBe(failure);
    const aborted = vi.fn();
    const abortable = new CPFXOutputFilter("compress", "gzip", new WritableStream({ abort: aborted }));
    await abortable.abort("stop");
    expect(aborted).toHaveBeenCalledWith("stop");
  });

  it("waits for a slow destination before finalizing", async () => {
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const filter = new CPFXOutputFilter("compress", "gzip", new WritableStream({ async write() { entered(); await blocked; } }));
    const writing = filter.write(bytes);
    let completed = false;
    const finalizing = filter.finalize().then(() => { completed = true; });
    await started;
    await Promise.resolve();
    expect(completed).toBe(false);
    release();
    await writing;
    await finalizing;
    expect(completed).toBe(true);
  });

  it("rejects concurrent pulls and supports cancellation during a pending read", async () => {
    const filter = new CPFXInputFilter("compress", "gzip", new ReadableStream());
    // gzip can emit its header before receiving data. Consume that header first.
    const pending = filter.readData(1_000_000);
    await expect(filter.readData(10)).rejects.toThrow(/one pending/);
    await filter.cancel("done");
    await pending;
    expect(await filter.readData(10)).toBeNull();
  });

  it("awaits asynchronous upstream cancellation before resolving cancel", async () => {
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const filter = new CPFXInputFilter("compress", "gzip", new ReadableStream({ async cancel() { entered(); await blocked; } }));
    let completed = false;
    const cancelling = filter.cancel().then(() => { completed = true; });
    await started;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(completed).toBe(false);
    release();
    await cancelling;
    expect(completed).toBe(true);
  });

  it("awaits upstream cancellation even after the codec reader has errored", async () => {
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const filter = new CPFXInputFilter("decompress", "gzip", new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); },
      async cancel() { entered(); await blocked; },
    }));
    await expect(filter.readData(100)).rejects.toThrow();
    await started;
    let completed = false;
    const cancelling = filter.cancel("cleanup").catch((error: unknown) => error).finally(() => { completed = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      expect(completed).toBe(false);
    } finally {
      release();
      await cancelling;
    }
    expect(completed).toBe(true);
  });

  it("handles empty streams and rejects truncated streams in both filters", async () => {
    const empty = new CPFXInputFilter("decompress", "gzip", source((await CPFXCompress(new Uint8Array(), "gzip")).bytes));
    expect(await empty.readData(100)).toBeNull();
    const packed = (await CPFXCompress(bytes, "gzip")).bytes;
    const truncated = packed.slice(0, packed.length - 1);
    const pull = new CPFXInputFilter("decompress", "gzip", source(truncated));
    await expect((async () => { while (await pull.readData(100)) { /* drain */ } })()).rejects.toThrow();
    const push = new CPFXOutputFilter("decompress", "gzip", new WritableStream());
    await push.write(truncated).catch(() => undefined);
    await expect(push.finalize()).rejects.toThrow();
    await expect(CPFXDecompress(new Uint8Array(), "gzip")).rejects.toThrow();
  });

  it("uses worker web primitives without window, document, or navigator", async () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("navigator", undefined);
    expect((await CPFXDecompress(await CPFXCompress(bytes, "zlib"), "zlib")).bytes).toEqual(bytes);
  });
});
