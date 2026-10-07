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
import { MEFXSampleTimingInfo, MEFXTime } from "../../../src/FX/MediaFX/public";
import { VFXContainerReader, VFXContainerWriter, VFXEncodedChunk, type VFXContainerTrack } from "../../../src/FX/VideoFX/public";
import { VFXWebMContainerBackend } from "../../../src/FX/VideoFX/backends/VFXWebMContainerBackend";
import { encodedVFXChunkData } from "../../../src/FX/VideoFX/VFXEncodedChunk";

const track: VFXContainerTrack = Object.freeze({ id: 1, kind: "video", codec: "vp8", codedWidth: 16, codedHeight: 16, timescale: 1_000_000 });
const audioTrack: VFXContainerTrack = Object.freeze({ id: 1, kind: "audio", codec: "opus", sampleRate: 48_000, channelCount: 2, preSkip: 0, timescale: 1_000_000 });

function chunk(index: number, bytes = 4): VFXEncodedChunk {
  return new VFXEncodedChunk({
    type: index === 0 ? "key" : "delta",
    data: new Uint8Array(bytes).fill(index & 0xff),
    timing: new MEFXSampleTimingInfo({
      presentationTime: MEFXTime.finite(BigInt(index * 33_333), 1_000_000),
      duration: MEFXTime.finite(33_333n, 1_000_000),
    }),
  });
}

async function* fragment(bytes: Uint8Array, width: number): AsyncIterable<Uint8Array> {
  for (let offset = 0; offset < bytes.byteLength; offset += width) yield bytes.slice(offset, offset + width);
}

describe("VFX bounded WebM container I/O", () => {
  it("shares the reader-owned segment allocation without exposing mutable input or packet aliases", async () => {
    const fragments: Uint8Array[] = [];
    const writer = new VFXContainerWriter({ backend: new VFXWebMContainerBackend(), track,
      sink: { write(bytes) { fragments.push(bytes.slice()); } } });
    for (let index = 0; index < 4; index++) await writer.write(chunk(index, 16384));
    await writer.close();
    const input = new Uint8Array(fragments.reduce((sum, bytes) => sum + bytes.length, 0));
    let offset = 0;
    for (const bytes of fragments) { input.set(bytes, offset); offset += bytes.length; }
    const result = await new VFXContainerReader({ backend: new VFXWebMContainerBackend() }).read(input);
    const buffers = new Set(result.chunks.map(packet => encodedVFXChunkData(packet).buffer));
    expect(buffers.size, 'Demux must not allocate another compressed payload for every packet.').toBe(1);
    expect(buffers.has(input.buffer)).toBe(false);
    input.fill(255);
    result.chunks[2]!.copyData().fill(254);
    for (let index = 0; index < 4; index++)
      expect(result.chunks[index]!.copyData()).toEqual(new Uint8Array(16384).fill(index));
    expect(result.chunks.map(packet => packet.webCodecsTiming().timestampMicroseconds))
      .toEqual([0, 33333, 66666, 99999]);
  });
  it("round-trips explicitly configured VP9 profile-0 video without changing encoded packets or exact timing", async () => {
    const backend = new VFXWebMContainerBackend();
    const vp9: VFXContainerTrack = { ...track, codec: 'vp09.00.40.08', codedWidth: 2080, codedHeight: 296 };
    const fragments: Uint8Array[] = [];
    const writer = new VFXContainerWriter({ backend, track: vp9,
      sink: { write(bytes) { fragments.push(bytes.slice()); } } });
    for (let frame = 0; frame < 3; frame++) await writer.write(chunk(frame));
    await writer.close();
    const bytes = Uint8Array.from(fragments.flatMap(fragment => [...fragment]));
    const reader = new VFXContainerReader({ backend });
    const parsed = await reader.read(fragment(bytes, 3));
    expect(parsed.track).toEqual(vp9);
    expect(parsed.chunks.map(packet => [...packet.copyData()])).toEqual([
      [0, 0, 0, 0], [1, 1, 1, 1], [2, 2, 2, 2],
    ]);
    expect(parsed.chunks.map(packet => packet.type)).toEqual(['key', 'delta', 'delta']);
    expect(parsed.chunks.map(packet => packet.webCodecsTiming().timestampMicroseconds)).toEqual([0, 33333, 66666]);
    expect(parsed.seekIndex.map(point => point.timestampMicroseconds)).toEqual([0]);
    // CodecPrivate carries the actual configuration; it is not guessed from dimensions.
    const privateOffset = bytes.findIndex((value, index) => value === 0x63 && bytes[index + 1] === 0xa2);
    expect(privateOffset).toBeGreaterThan(0);
    bytes[privateOffset + 5] = 3; // Profile feature: unsupported profile 3.
    await expect(new VFXContainerReader({ backend }).read(bytes)).rejects.toThrow(/profile|VP9|unsupported/i);
  });

  it("rejects unsupported or incomplete VP9 configurations before writing", () => {
    const backend = new VFXWebMContainerBackend();
    for (const codec of ['vp9', 'vp09', 'vp09.00.99.08', 'vp09.00.40.10', 'vp09.03.40.08']) {
      const write = vi.fn();
      expect(() => new VFXContainerWriter({ backend, track: { ...track, codec }, sink: { write } }))
        .toThrow(/unsupported/i);
      expect(write).not.toHaveBeenCalled();
    }
  });
  it("demuxes many packets with linear copied bytes while retaining owned packet data", async () => {
    const parts: Uint8Array[] = [];
    const backend = new VFXWebMContainerBackend();
    const writer = new VFXContainerWriter({ backend, track, sink: { write(bytes) { parts.push(bytes.slice()); } } });
    for (let index = 0; index < 48; index++) await writer.write(chunk(index, 8192));
    await writer.close();
    const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    let copied = 0;
    const originalSlice = Uint8Array.prototype.slice;
    const slicing = vi.spyOn(Uint8Array.prototype, "slice").mockImplementation(function(this: Uint8Array, start?: number, end?: number) {
      const result = originalSlice.call(this, start, end);
      copied += result.byteLength;
      return result;
    });
    const reader = new VFXContainerReader({ backend, maximumBufferedBytes: 1024 * 1024, maximumElementBytes: 65536 });
    let result;
    try { result = await reader.read(bytes); }
    finally { slicing.mockRestore(); }
    bytes.fill(255);
    expect(result.chunks.length).toBe(48);
    expect(result.chunks[23]!.copyData()).toEqual(new Uint8Array(8192).fill(23));
    expect(copied).toBeLessThan(bytes.byteLength * 6);
  });
  it("writes and reimports bounded Opus audio-only WebM with explicit decoder metadata", async () => {
    const fragments: Uint8Array[] = [];
    const writer = new VFXContainerWriter({
      backend: new VFXWebMContainerBackend(),
      sink: { write(bytes) { fragments.push(bytes.slice()); } },
      track: audioTrack,
      maximumBufferedBytes: 4096,
    });
    for (let index = 0; index < 3; index++) await writer.write(new VFXEncodedChunk({
      type: "key", data: Uint8Array.of(0xf8, index),
      ...(index === 2 ? { discardPaddingNanoseconds: 3_500_000 } : {}),
      timing: new MEFXSampleTimingInfo({
        presentationTime: MEFXTime.finite(BigInt(index * 20_000), 1_000_000),
        duration: MEFXTime.finite(20_000n, 1_000_000),
      }),
    }));
    await writer.close();
    const bytes = new Uint8Array(fragments.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of fragments) { bytes.set(part, offset); offset += part.length; }
    const reader = new VFXContainerReader({ backend: new VFXWebMContainerBackend(), maximumBufferedBytes: 4096, maximumElementBytes: 2048 });
    const imported = await reader.read(fragment(bytes, 3));
    expect(imported.track).toEqual(audioTrack);
    expect(imported.chunks.map(item => Array.from(item.copyData()))).toEqual([[0xf8, 0], [0xf8, 1], [0xf8, 2]]);
    expect(imported.chunks.map(item => item.webCodecsTiming().timestampMicroseconds)).toEqual([0, 20_000, 40_000]);
    expect(imported.chunks.map(item => item.discardPaddingNanoseconds)).toEqual([0, 0, 3_500_000]);
    expect(writer.diagnostics.reservedInputBytes).toBe(0);
  });

  it("rejects unsupported audio codec and channel layouts before opening the sink", () => {
    let writes = 0;
    const sink = { write() { writes++; } };
    expect(() => new VFXContainerWriter({ backend: new VFXWebMContainerBackend(), sink, track: { ...audioTrack, codec: "aac" } })).toThrow(/unsupported/i);
    expect(() => new VFXContainerWriter({ backend: new VFXWebMContainerBackend(), sink, track: { ...audioTrack, channelCount: 3 } })).toThrow(/channel|unsupported/i);
    expect(writes).toBe(0);
  });
  it("caps retained demuxed packet count independently of the parser byte window", async () => {
    const parts: Uint8Array[] = [];
    const writer = new VFXContainerWriter({ backend: new VFXWebMContainerBackend(), track: audioTrack, sink: { write(bytes) { parts.push(bytes.slice()); } } });
    for (let index = 0; index < 3; index++) await writer.write(new VFXEncodedChunk({ type: "key", data: Uint8Array.of(0xf8, index), timing: new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(BigInt(index * 20_000), 1_000_000), duration: MEFXTime.finite(20_000n, 1_000_000) }) }));
    await writer.close();
    const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    const reader = new VFXContainerReader({ backend: new VFXWebMContainerBackend(), maximumChunks: 2 });
    await expect(reader.read(fragment(bytes, 7))).rejects.toMatchObject({ name: "QuotaExceededError" });
  });
  it("writes fragmented VP8 WebM and reimports timing, dimensions and keyframe metadata", async () => {
    const fragments: Uint8Array[] = [];
    const writer = new VFXContainerWriter({
      backend: new VFXWebMContainerBackend(),
      sink: { async write(bytes) { fragments.push(bytes.slice()); } },
      track,
      maximumBufferedBytes: 4096,
    });
    for (let index = 0; index < 3; index += 1) await writer.write(chunk(index));
    await writer.close();
    expect(fragments.length).toBeGreaterThan(4);
    expect(writer.diagnostics.peakBufferedBytes).toBeLessThanOrEqual(4096);
    const joined = new Uint8Array(fragments.reduce((sum, item) => sum + item.byteLength, 0));
    let offset = 0;
    for (const item of fragments) { joined.set(item, offset); offset += item.byteLength; }
    const reader = new VFXContainerReader({ backend: new VFXWebMContainerBackend(), maximumBufferedBytes: 4096, maximumElementBytes: 2048 });
    const result = await reader.read(fragment(joined, 3));
    expect(result.container).toBe("webm");
    expect(result.track).toMatchObject({ codec: "vp8", codedWidth: 16, codedHeight: 16, timescale: 1_000_000 });
    expect(result.chunks.map(item => item.type)).toEqual(["key", "delta", "delta"]);
    expect(result.chunks.map(item => item.webCodecsTiming())).toEqual([
      { timestampMicroseconds: 0, durationMicroseconds: 33_333, rounded: false },
      { timestampMicroseconds: 33_333, durationMicroseconds: 33_333, rounded: false },
      { timestampMicroseconds: 66_666, durationMicroseconds: 33_333, rounded: false },
    ]);
    expect(result.seekIndex.map(item => item.timestampMicroseconds)).toEqual([0]);
  });

  it("rejects unsupported codec/container pairs and malformed oversized elements", async () => {
    expect(() => new VFXContainerWriter({ backend: new VFXWebMContainerBackend(), sink: { write() {} }, track: { ...track, codec: "h264" } })).toThrow(/unsupported.*codec.*container/i);
    const reader = new VFXContainerReader({ backend: new VFXWebMContainerBackend(), maximumBufferedBytes: 64, maximumElementBytes: 32 });
    const malformed = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0, 0, 0, 0, 0, 1, 0]);
    await expect(reader.read(fragment(malformed, 2))).rejects.toThrow(/limit|element|malformed/i);
  });

  it("propagates cancellation and keeps a slow synthetic hour-long sink inside the configured memory budget", async () => {
    let writes = 0;
    const controller = new AbortController();
    const writer = new VFXContainerWriter({
      backend: new VFXWebMContainerBackend(),
      sink: {
        async write() {
          writes += 1;
          await Promise.resolve();
          if (writes === 12) controller.abort(new DOMException("cancel export", "AbortError"));
        },
      },
      track,
      maximumBufferedBytes: 1024,
      signal: controller.signal,
    });
    let rejected = false;
    for (let second = 0; second < 3600; second += 1) {
      try { await writer.write(chunk(second, 32)); }
      catch (error) { rejected = true; expect(error).toBeInstanceOf(DOMException); break; }
    }
    expect(rejected).toBe(true);
    expect(writer.state).toBe("aborted");
    expect(writer.diagnostics.peakBufferedBytes).toBeLessThanOrEqual(1024);
  });

  it("streams a full synthetic hour through a slow sink without accumulating the movie in memory", async () => {
    let writes = 0;
    let bytesWritten = 0;
    const writer = new VFXContainerWriter({
      backend: new VFXWebMContainerBackend(),
      sink: {
        async write(bytes) {
          writes += 1;
          bytesWritten += bytes.byteLength;
          await Promise.resolve();
        },
      },
      track,
      maximumBufferedBytes: 1024,
    });
    for (let second = 0; second < 3600; second += 1) {
      const sample = new VFXEncodedChunk({
        type: second % 30 === 0 ? "key" : "delta",
        data: new Uint8Array(32).fill(second & 0xff),
        timing: new MEFXSampleTimingInfo({
          presentationTime: MEFXTime.finite(BigInt(second), 1),
          duration: MEFXTime.finite(1n, 1),
        }),
      });
      await writer.write(sample);
    }
    await writer.close();
    expect(writes).toBeGreaterThan(3600);
    expect(bytesWritten).toBeGreaterThan(3600 * 32);
    expect(writer.diagnostics.peakBufferedBytes).toBeLessThanOrEqual(1024);
    expect(writer.diagnostics.reservedInputBytes).toBe(0);
  });
});
