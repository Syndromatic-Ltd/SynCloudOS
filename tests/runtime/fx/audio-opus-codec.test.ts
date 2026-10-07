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

import { afterEach, expect, it, vi } from "vitest";
import { AUFXAudioChunkStream, AUFXAudioFile, AUFXAudioFormat, AUFXAudioPCMBuffer, AUFXClockObservation } from "../../../src/FX/AudioFX/public";
import { RuntimeAudioFileService } from "../../../src/SynCloudOS/AudioFX/AudioFileService";
import { BrowserAudioFileAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAudioFileAdapter";
import { encodeOpusWebM, encodeOpusWebMStream } from "../../../src/SynCloudOS/PlatformAdapters/BrowserOpusWebMCodec";

afterEach(() => vi.unstubAllGlobals());

function file() {
  const pcm = new AUFXAudioPCMBuffer(new AUFXAudioFormat(48_000, 1), 960);
  pcm.frameLength = 960;
  const result = new AUFXAudioFile(pcm);
  result.framePosition = 19;
  return result;
}

it("rejects an aborted compressed export before acquiring native codec state", async () => {
  const source = file(), signal = new AbortController();
  signal.abort(new DOMException("cancel", "AbortError"));
  const encoder = vi.fn();
  vi.stubGlobal("AudioEncoder", encoder);
  await expect(encodeOpusWebM(source, signal.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(encoder).not.toHaveBeenCalled();
  expect(source.framePosition).toBe(19);
});

it("bounds hostile encoder output and closes native AudioData while restoring the file cursor", async () => {
  const source = file();
  let closedInputs = 0, closedEncoder = 0;
  class FakeAudioData { close() { closedInputs++; } }
  class FakeEncoder extends EventTarget {
    readonly encodeQueueSize = 0;
    constructor(readonly callbacks: { output: (chunk: unknown, metadata?: unknown) => void }) { super(); }
    configure() {}
    encode() {}
    async flush() {
      for (let index = 0; index < 65; index++) this.callbacks.output({ type: "key", byteLength: 2, timestamp: index * 20_000, duration: 20_000, copyTo(target: Uint8Array) { target.set([0xf8, 0xff]); } });
    }
    close() { closedEncoder++; }
  }
  vi.stubGlobal("AudioData", FakeAudioData);
  vi.stubGlobal("AudioEncoder", FakeEncoder);
  await expect(encodeOpusWebM(source, new AbortController().signal)).rejects.toMatchObject({ name: "QuotaExceededError" });
  expect(closedInputs).toBe(1);
  expect(closedEncoder).toBe(1);
  expect(source.framePosition).toBe(19);
});

function streamingSource(totalChunks: number, observed: { produced: number; cancelled: number }) {
  const format = new AUFXAudioFormat(48_000, 1);
  return new AUFXAudioChunkStream(async function* (signal) {
    try {
      for (let index = 0; index < totalChunks; index++) {
        signal.throwIfAborted();
        const buffer = new AUFXAudioPCMBuffer(format, 960);
        buffer.frameLength = 960;
        observed.produced++;
        yield { buffer, observation: new AUFXClockObservation({ samplePosition: index * 960, sampleRate: 48_000,
          domain: "render", hostAnchorSeconds: null, uncertaintySeconds: 0, discontinuityGeneration: 0 }) };
      }
    } finally { observed.cancelled++; }
  });
}

function stubStreamingEncoder(observed: { encoderClosed: number; dataClosed: number }) {
  class FakeAudioData {
    readonly timestamp: number;
    constructor(options: { timestamp: number }) { this.timestamp = options.timestamp; }
    close() { observed.dataClosed++; }
  }
  class FakeEncoder extends EventTarget {
    readonly encodeQueueSize = 0;
    constructor(readonly callbacks: { output: (chunk: unknown) => void }) { super(); }
    configure() {}
    encode(audio: FakeAudioData) {
      this.callbacks.output({ type: "key", byteLength: 1_024, timestamp: audio.timestamp, duration: 20_000,
        copyTo(target: Uint8Array) { target.fill(0x77); } });
    }
    async flush() {}
    close() { observed.encoderClosed++; }
  }
  vi.stubGlobal("AudioData", FakeAudioData);
  vi.stubGlobal("AudioEncoder", FakeEncoder);
}

it("streams beyond the owned PCM and 16 MiB Blob budgets while honoring sink backpressure", async () => {
  const observed = { produced: 0, cancelled: 0, encoderClosed: 0, dataClosed: 0 };
  stubStreamingEncoder(observed);
  const totalChunks = 17_477; // 16,777,920 mono samples and over 16 MiB of encoded packets.
  let releaseFirstWrite!: () => void;
  const firstWrite = new Promise<void>(resolve => { releaseFirstWrite = resolve; });
  let writes = 0, byteLength = 0, closed = 0, aborted = 0;
  const sink = new WritableStream<Uint8Array>({
    async write(bytes) { writes++; if (writes === 1) await firstWrite; byteLength += bytes.byteLength; },
    close() { closed++; }, abort() { aborted++; },
  });
  const result = encodeOpusWebMStream(streamingSource(totalChunks, observed), sink, new AbortController().signal);
  await vi.waitFor(() => expect(writes).toBe(1));
  expect(observed.produced).toBeLessThanOrEqual(3);
  releaseFirstWrite();
  await expect(result).resolves.toEqual({ mimeType: "audio/webm", fileType: "webm", byteLength: expect.any(Number) });
  const receipt = await result;
  expect(totalChunks * 960).toBeGreaterThan(16_777_216);
  expect(byteLength).toBeGreaterThan(16 * 1024 * 1024);
  expect(receipt.byteLength).toBe(byteLength);
  expect("data" in receipt).toBe(false);
  expect(observed).toMatchObject({ produced: totalChunks, cancelled: 1, encoderClosed: 1, dataClosed: totalChunks });
  expect({ closed, aborted }).toEqual({ closed: 1, aborted: 0 });
}, 90_000);

it("cancels a backpressured stream, releases its source and encoder, and aborts the sink", async () => {
  const observed = { produced: 0, cancelled: 0, encoderClosed: 0, dataClosed: 0 };
  stubStreamingEncoder(observed);
  const controller = new AbortController();
  let writes = 0, closed = 0, aborted = 0;
  let releaseWrite!: () => void;
  const blockedWrite = new Promise<void>(resolve => { releaseWrite = resolve; });
  const sink = new WritableStream<Uint8Array>({
    write() { writes++; return blockedWrite; },
    close() { closed++; }, abort() { aborted++; },
  });
  const pending = encodeOpusWebMStream(streamingSource(100, observed), sink, controller.signal);
  await vi.waitFor(() => expect(writes).toBe(1));
  controller.abort(new DOMException("cancelled", "AbortError"));
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(observed).toMatchObject({ cancelled: 1, encoderClosed: 1 });
  expect(closed).toBe(0);
  releaseWrite();
  await vi.waitFor(() => expect(aborted).toBe(1));
});

it("exposes the separate streaming contract through the runtime service and reports observed output only on success", async () => {
  const observed = { produced: 0, cancelled: 0, encoderClosed: 0, dataClosed: 0 };
  stubStreamingEncoder(observed);
  const adapter = new BrowserAudioFileAdapter({ loadBytes: async () => { throw new Error("unexpected load"); } });
  const service = new RuntimeAudioFileService(adapter);
  expect(service.capabilities().encode).not.toContainEqual(expect.objectContaining({ mimeType: "audio/webm" }));
  const fragments: Uint8Array[] = [];
  const sink = new WritableStream<Uint8Array>({ write(bytes) { fragments.push(bytes.slice()); } });
  const result = await service.exportStream({ source: streamingSource(1, observed), sink, format: "opus-webm" }, new AbortController().signal);
  expect(result).toEqual({ mimeType: "audio/webm", fileType: "webm", byteLength: fragments.reduce((sum, part) => sum + part.byteLength, 0) });
  expect(sink.locked).toBe(false);
  expect(service.capabilities().encode).toContainEqual({ mimeType: "audio/webm", provenance: "observed-browser" });
  expect(observed).toMatchObject({ produced: 1, cancelled: 1, encoderClosed: 1, dataClosed: 1 });
});

it("keeps the export receipt pending until the writable sink finishes closing", async () => {
  const observed = { produced: 0, cancelled: 0, encoderClosed: 0, dataClosed: 0 };
  stubStreamingEncoder(observed);
  let finishClose!: () => void;
  const closeGate = new Promise<void>(resolve => { finishClose = resolve; });
  let closeEntered = false, settled = false;
  const sink = new WritableStream<Uint8Array>({ close() { closeEntered = true; return closeGate; } });
  const pending = encodeOpusWebMStream(streamingSource(1, observed), sink, new AbortController().signal)
    .finally(() => { settled = true; });
  await vi.waitFor(() => expect(closeEntered).toBe(true));
  expect(settled).toBe(false);
  finishClose();
  await expect(pending).resolves.toMatchObject({ mimeType: "audio/webm", fileType: "webm" });
  expect(sink.locked).toBe(false);
});

it("rejects an over-budget source chunk and releases source and sink without encoding it", async () => {
  const observed = { produced: 0, cancelled: 0, encoderClosed: 0, dataClosed: 0 };
  stubStreamingEncoder(observed);
  const source = new AUFXAudioChunkStream(async function* () {
    try {
      const buffer = new AUFXAudioPCMBuffer(new AUFXAudioFormat(48_000, 1), 2_049);
      buffer.frameLength = 2_049;
      yield { buffer, observation: new AUFXClockObservation({ samplePosition: 0, sampleRate: 48_000,
        domain: "render", hostAnchorSeconds: null, uncertaintySeconds: 0, discontinuityGeneration: 0 }) };
    } finally { observed.cancelled++; }
  });
  let closed = 0, aborted = 0;
  const sink = new WritableStream<Uint8Array>({ close() { closed++; }, abort() { aborted++; } });
  await expect(encodeOpusWebMStream(source, sink, new AbortController().signal)).rejects.toMatchObject({ name: "NotSupportedError" });
  await vi.waitFor(() => expect(aborted).toBe(1));
  expect(observed).toMatchObject({ cancelled: 1, encoderClosed: 1, dataClosed: 0 });
  expect(closed).toBe(0);
});
