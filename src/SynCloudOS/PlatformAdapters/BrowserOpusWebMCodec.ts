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

import { MEFXSampleTimingInfo } from "../../FX/MediaFX/MEFXSampleTimingInfo";
import { MEFXTime } from "../../FX/MediaFX/MEFXTime";
import type { AUFXAudioFile } from "../../FX/AudioFX/AUFXAudioFile";
import type { AUFXAudioStreamExport } from "../../FX/AudioFX/AUFXAudioFile";
import type { AUFXAudioChunk, AUFXAudioChunkStream } from "../../FX/AudioFX/AUFXAudioChunkStream";
import { AUFXAudioFormat } from "../../FX/AudioFX/AUFXAudioFormat";
import { AUFXAudioPCMBuffer } from "../../FX/AudioFX/AUFXAudioPCMBuffer";
import { VFXEncodedChunk } from "../../FX/VideoFX/VFXEncodedChunk";
import { VFXContainerReader } from "../../FX/VideoFX/VFXContainerReader";
import { VFXContainerWriter, type VFXAudioContainerTrack } from "../../FX/VideoFX/VFXContainerWriter";
import { VFXWebMContainerBackend } from "../../FX/VideoFX/backends/VFXWebMContainerBackend";

const MAX_ENCODED_BYTES = 16 * 1024 * 1024;
const FRAMES_PER_INPUT = 960;
const MAX_PENDING_OUTPUTS = 64;

function abortError(signal: AbortSignal) {
  return signal.reason ?? new DOMException("Opus export was cancelled.", "AbortError");
}

function awaitOpusAbort<T>(operation: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise<T>((resolve, reject) => {
    const cancelled = () => { signal.removeEventListener("abort", cancelled); reject(abortError(signal)); };
    signal.addEventListener("abort", cancelled, { once: true });
    Promise.resolve(operation).then(value => { signal.removeEventListener("abort", cancelled); resolve(value); },
      error => { signal.removeEventListener("abort", cancelled); reject(error); });
  });
}

function preSkipFrom(metadata: EncodedAudioChunkMetadata | undefined): number | null {
  const description = metadata?.decoderConfig?.description;
  if (!description) return null;
  const header = new Uint8Array(description as ArrayBuffer);
  if (header.byteLength !== 19 || new TextDecoder().decode(header.subarray(0, 8)) !== "OpusHead")
    throw new DOMException("Opus encoder supplied unsupported decoder metadata.", "NotSupportedError");
  return new DataView(header.buffer, header.byteOffset, header.byteLength).getUint16(10, true);
}

/** A bounded browser codec bridge. The VFX-03 container remains the sole WebM mux owner. */
export async function encodeOpusWebM(file: AUFXAudioFile, signal: AbortSignal, bitrate?: number): Promise<Blob> {
  signal.throwIfAborted();
  const format = file.processingFormat;
  if (format.sampleRate !== 48_000 || format.channelCount < 1 || format.channelCount > 2)
    throw new DOMException("Opus WebM export requires 48 kHz mono or stereo PCM.", "NotSupportedError");
  if (bitrate !== undefined && (!Number.isSafeInteger(bitrate) || bitrate < 6_000 || bitrate > 256_000))
    throw new RangeError("Opus bitrate must be between 6000 and 256000 bits per second.");
  if (file.length < 1 || file.length * format.channelCount > 16_777_216)
    throw new DOMException("Opus export exceeds the owned PCM budget.", "QuotaExceededError");
  if (typeof AudioEncoder !== "function" || typeof AudioData !== "function")
    throw new DOMException("WebCodecs Opus encoding is unavailable.", "NotSupportedError");

  const parts: ArrayBuffer[] = [];
  let writtenBytes = 0;
  let pending: VFXEncodedChunk[] = [];
  let preSkip: number | null = null;
  let error: unknown = null;
  let closed = false;
  let writer: VFXContainerWriter | null = null;
  let held: VFXEncodedChunk | null = null;
  let encodedFrames = 0;
  let wakeQueue: (() => void) | null = null;
  const encoder = new AudioEncoder({
    output(chunk, metadata) {
      if (closed || error) return;
      try {
        if (chunk.type !== "key" || chunk.byteLength < 1 || chunk.byteLength > 1_048_576 || pending.length >= MAX_PENDING_OUTPUTS)
          throw new DOMException("Opus encoder output exceeded its packet budget.", "QuotaExceededError");
        const skip = preSkipFrom(metadata);
        if (writer && skip !== null && skip !== (preSkip ?? 0))
          throw new DOMException("Opus encoder changed pre-skip after WebM track initialization.", "NotSupportedError");
        if (skip !== null && preSkip !== null && skip !== preSkip)
          throw new DOMException("Opus encoder changed pre-skip during one stream.", "NotSupportedError");
        if (skip !== null) preSkip = skip;
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        pending.push(new VFXEncodedChunk({
          type: "key", data,
          timing: new MEFXSampleTimingInfo({
            presentationTime: MEFXTime.finite(BigInt(chunk.timestamp), 1_000_000),
            duration: chunk.duration == null ? null : MEFXTime.finite(BigInt(chunk.duration), 1_000_000),
          }),
        }));
      } catch (cause) { error = cause; wakeQueue?.(); }
    },
    error(cause) { error = cause; wakeQueue?.(); },
  });
  const abort = () => { closed = true; try { encoder.close(); } catch { /* already closed */ } };
  signal.addEventListener("abort", abort, { once: true });
  const position = file.framePosition;
  const drain = async () => {
    if (signal.aborted) throw abortError(signal);
    if (error) throw error;
    while (pending.length > 0) {
      if (!writer) {
        const track: VFXAudioContainerTrack = { id: 1, kind: "audio", codec: "opus", sampleRate: 48_000,
          channelCount: format.channelCount, preSkip: preSkip ?? 0, timescale: 1_000_000 };
        writer = new VFXContainerWriter({ backend: new VFXWebMContainerBackend(), track, signal,
          maximumBufferedBytes: 2 * 1024 * 1024,
          sink: { write(fragment) {
            if (writtenBytes + fragment.byteLength > MAX_ENCODED_BYTES)
              throw new DOMException("Opus WebM export exceeds the 16 MiB byte budget.", "QuotaExceededError");
            parts.push(fragment.slice().buffer as ArrayBuffer); writtenBytes += fragment.byteLength;
          }, abort() { parts.length = 0; writtenBytes = 0; } },
        });
      }
      const ready = pending; pending = [];
      for (const packet of ready) {
        const duration = packet.webCodecsTiming().durationMicroseconds;
        if (duration === null || duration < 1 || duration > 120_000)
          throw new DOMException("Opus encoder omitted a bounded packet duration.", "NotSupportedError");
        encodedFrames += Math.round(duration * 48_000 / 1_000_000);
        if (!Number.isSafeInteger(encodedFrames)) throw new RangeError("Opus packet timeline exceeds the safe frame range.");
        if (held) await writer.write(held);
        held = packet;
      }
      if (error) throw error;
    }
  };
  const waitForQueue = async () => {
    if (encoder.encodeQueueSize <= 4) return;
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { encoder.removeEventListener("dequeue", check); signal.removeEventListener("abort", cancelled); wakeQueue = null; };
      const check = () => { if (error) { cleanup(); reject(error); } else if (encoder.encodeQueueSize <= 4) { cleanup(); resolve(); } };
      const cancelled = () => { cleanup(); reject(abortError(signal)); };
      encoder.addEventListener("dequeue", check);
      signal.addEventListener("abort", cancelled, { once: true });
      wakeQueue = check;
      if (signal.aborted) cancelled(); else check();
    });
  };
  try {
    encoder.configure({ codec: "opus", sampleRate: 48_000, numberOfChannels: format.channelCount,
      bitrate: bitrate ?? (format.channelCount === 1 ? 64_000 : 128_000), opus: { format: "opus", frameDuration: 20_000 } });
    file.framePosition = 0;
    while (file.framePosition < file.length) {
      if (signal.aborted) throw abortError(signal);
      const start = file.framePosition;
      const pcm = file.readFrames(Math.min(FRAMES_PER_INPUT, file.length - start));
      const samples = new Float32Array(pcm.frameLength * format.channelCount);
      for (let channel = 0; channel < format.channelCount; channel++)
        for (let frame = 0; frame < pcm.frameLength; frame++) samples[channel * pcm.frameLength + frame] = pcm.getSample(channel, frame);
      const audio = new AudioData({ format: "f32-planar", sampleRate: 48_000, numberOfFrames: pcm.frameLength,
        numberOfChannels: format.channelCount, timestamp: Math.round(start * 1_000_000 / 48_000), data: samples });
      try { encoder.encode(audio); } finally { audio.close(); }
      await waitForQueue();
      await drain();
    }
    await encoder.flush();
    await drain();
    const finishedWriter = writer as VFXContainerWriter | null;
    const finalPacket = held as VFXEncodedChunk | null;
    if (!finishedWriter || !finalPacket) throw new TypeError("Opus encoder produced no packets.");
    const finalFrames = Math.round((finalPacket.webCodecsTiming().durationMicroseconds ?? 0) * 48_000 / 1_000_000);
    const endTrimFrames = encodedFrames - (preSkip ?? 0) - file.length;
    if (!Number.isSafeInteger(endTrimFrames) || endTrimFrames < 0 || endTrimFrames > finalFrames)
      throw new DOMException("Opus encoder packet timing cannot represent the source frame length.", "NotSupportedError");
    await finishedWriter.write(endTrimFrames === 0 ? finalPacket : new VFXEncodedChunk({
      type: "key", data: finalPacket.copyData(), timing: finalPacket.timing,
      discardPaddingNanoseconds: Math.round(endTrimFrames * 1_000_000_000 / 48_000),
    }));
    await finishedWriter.close();
    if (signal.aborted) throw abortError(signal);
    return new Blob(parts, { type: "audio/webm" });
  } finally {
    closed = true;
    signal.removeEventListener("abort", abort);
    try { encoder.close(); } catch { /* already closed after cancellation */ }
    if (file.isOpen) file.framePosition = position;
  }
}

/** Duration-independent Opus/WebM export. Source and sink each have one owner for the entire operation. */
export async function encodeOpusWebMStream(source: AUFXAudioChunkStream, sink: WritableStream<Uint8Array>, signal: AbortSignal, bitrate?: number): Promise<AUFXAudioStreamExport> {
  signal.throwIfAborted();
  if (bitrate !== undefined && (!Number.isSafeInteger(bitrate) || bitrate < 6_000 || bitrate > 256_000))
    throw new RangeError("Opus bitrate must be between 6000 and 256000 bits per second.");
  if (typeof AudioEncoder !== "function" || typeof AudioData !== "function")
    throw new DOMException("WebCodecs Opus encoding is unavailable.", "NotSupportedError");
  if (!(source && typeof source[Symbol.asyncIterator] === "function" && typeof source.cancel === "function") ||
      !(sink && typeof sink.getWriter === "function"))
    throw new TypeError("Opus streaming export requires an audio chunk stream and writable byte sink.");

  const sinkWriter = sink.getWriter();
  let iterator: AsyncIterator<AUFXAudioChunk> | null = null;
  let encoder: AudioEncoder | null = null;
  let encoderClosed = false;
  let containerWriter: VFXContainerWriter | null = null;
  let held: VFXEncodedChunk | null = null;
  let pending: VFXEncodedChunk[] = [];
  let pendingBytes = 0;
  let preSkip: number | null = null;
  let error: unknown = null;
  let closed = false;
  let sinkClosed = false;
  let sinkAbortRequested = false;
  let sourceFrames = 0;
  let encodedFrames = 0;
  let writtenBytes = 0;
  let wakeQueue: (() => void) | null = null;
  const requestSinkAbort = (reason: unknown) => {
    if (sinkClosed || sinkAbortRequested) return;
    sinkAbortRequested = true;
    void sinkWriter.abort(reason).catch(() => undefined).finally(() => { try { sinkWriter.releaseLock(); } catch { /* pending write */ } });
  };
  const closeEncoder = () => {
    if (encoderClosed || !encoder) return;
    encoderClosed = true;
    try { encoder.close(); } catch { /* already closed */ }
  };
  const abort = () => {
    closed = true;
    source.cancel(abortError(signal));
    closeEncoder();
    requestSinkAbort(abortError(signal));
  };
  signal.addEventListener("abort", abort, { once: true });

  try {
    iterator = source[Symbol.asyncIterator]();
    const first = await awaitOpusAbort(iterator.next(), signal);
    if (first.done) throw new TypeError("Opus streaming export requires at least one PCM frame.");
    const format = first.value.buffer.format;
    if (format.sampleRate !== 48_000 || format.channelCount < 1 || format.channelCount > 2)
      throw new DOMException("Opus WebM export requires 48 kHz mono or stereo PCM.", "NotSupportedError");

    encoder = new AudioEncoder({
      output(chunk, metadata) {
        if (closed || error) return;
        try {
          if (chunk.type !== "key" || chunk.byteLength < 1 || chunk.byteLength > 1_048_576 ||
              pending.length >= MAX_PENDING_OUTPUTS || pendingBytes + chunk.byteLength > 2 * 1024 * 1024)
            throw new DOMException("Opus encoder output exceeded its packet or queue budget.", "QuotaExceededError");
          const skip = preSkipFrom(metadata);
          if (containerWriter && skip !== null && skip !== (preSkip ?? 0))
            throw new DOMException("Opus encoder changed pre-skip after WebM track initialization.", "NotSupportedError");
          if (skip !== null && preSkip !== null && skip !== preSkip)
            throw new DOMException("Opus encoder changed pre-skip during one stream.", "NotSupportedError");
          if (skip !== null) preSkip = skip;
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          pending.push(new VFXEncodedChunk({ type: "key", data,
            timing: new MEFXSampleTimingInfo({
              presentationTime: MEFXTime.finite(BigInt(chunk.timestamp), 1_000_000),
              duration: chunk.duration == null ? null : MEFXTime.finite(BigInt(chunk.duration), 1_000_000),
            }),
          }));
          pendingBytes += data.byteLength;
        } catch (cause) { error = cause; wakeQueue?.(); }
      },
      error(cause) { error = cause; wakeQueue?.(); },
    });
    encoder.configure({ codec: "opus", sampleRate: 48_000, numberOfChannels: format.channelCount,
      bitrate: bitrate ?? (format.channelCount === 1 ? 64_000 : 128_000), opus: { format: "opus", frameDuration: 20_000 } });

    const drain = async () => {
      if (signal.aborted) throw abortError(signal);
      if (error) throw error;
      while (pending.length) {
        if (!containerWriter) {
          const track: VFXAudioContainerTrack = { id: 1, kind: "audio", codec: "opus", sampleRate: 48_000,
            channelCount: format.channelCount, preSkip: preSkip ?? 0, timescale: 1_000_000 };
          containerWriter = new VFXContainerWriter({ backend: new VFXWebMContainerBackend(), track, signal,
            maximumBufferedBytes: 2 * 1024 * 1024,
            sink: {
              async write(fragment) {
                if (!Number.isSafeInteger(writtenBytes + fragment.byteLength))
                  throw new RangeError("Opus WebM output exceeds the safe byte range.");
                await awaitOpusAbort(sinkWriter.write(fragment), signal);
                writtenBytes += fragment.byteLength;
              },
              async close() {
                await awaitOpusAbort(sinkWriter.close(), signal);
                sinkClosed = true;
              },
              abort(reason) { requestSinkAbort(reason); },
            },
          });
        }
        const ready = pending; pending = []; pendingBytes = 0;
        for (const packet of ready) {
          const duration = packet.webCodecsTiming().durationMicroseconds;
          if (duration === null || duration < 1 || duration > 120_000)
            throw new DOMException("Opus encoder omitted a bounded packet duration.", "NotSupportedError");
          encodedFrames += Math.round(duration * 48_000 / 1_000_000);
          if (!Number.isSafeInteger(encodedFrames)) throw new RangeError("Opus packet timeline exceeds the safe frame range.");
          if (held) await awaitOpusAbort(containerWriter.write(held), signal);
          held = packet;
        }
        if (error) throw error;
      }
    };
    const waitForQueue = async () => {
      if (!encoder || encoder.encodeQueueSize <= 4) return;
      await new Promise<void>((resolve, reject) => {
        const activeEncoder = encoder!;
        const cleanup = () => { activeEncoder.removeEventListener("dequeue", check); signal.removeEventListener("abort", cancelled); wakeQueue = null; };
        const check = () => { if (error) { cleanup(); reject(error); } else if (activeEncoder.encodeQueueSize <= 4) { cleanup(); resolve(); } };
        const cancelled = () => { cleanup(); reject(abortError(signal)); };
        activeEncoder.addEventListener("dequeue", check);
        signal.addEventListener("abort", cancelled, { once: true });
        wakeQueue = check;
        if (signal.aborted) cancelled(); else check();
      });
    };

    let chunk: AUFXAudioChunk = first.value;
    for (;;) {
      if (signal.aborted) throw abortError(signal);
      const pcm = chunk.buffer;
      if (!pcm.format.isEqual(format) || pcm.frameLength < 1 || pcm.frameLength > 2_048)
        throw new DOMException("Opus source chunk changed format or exceeded its frame budget.", "NotSupportedError");
      for (let offset = 0; offset < pcm.frameLength; offset += FRAMES_PER_INPUT) {
        const frames = Math.min(FRAMES_PER_INPUT, pcm.frameLength - offset);
        const samples = new Float32Array(frames * format.channelCount);
        for (let channel = 0; channel < format.channelCount; channel++)
          for (let frame = 0; frame < frames; frame++) samples[channel * frames + frame] = pcm.getSample(channel, offset + frame);
        const timestamp = Math.round(sourceFrames * 1_000_000 / 48_000);
        if (!Number.isSafeInteger(timestamp) || !Number.isSafeInteger(sourceFrames + frames))
          throw new RangeError("Opus source timeline exceeds the safe frame range.");
        const audio = new AudioData({ format: "f32-planar", sampleRate: 48_000, numberOfFrames: frames,
          numberOfChannels: format.channelCount, timestamp, data: samples });
        try { encoder.encode(audio); } finally { audio.close(); }
        sourceFrames += frames;
        await waitForQueue();
        await drain();
      }
      const next = await awaitOpusAbort(iterator.next(), signal);
      if (next.done) break;
      chunk = next.value;
    }
    await awaitOpusAbort(encoder.flush(), signal);
    await drain();
    const finishedWriter = containerWriter as VFXContainerWriter | null;
    const finalPacket = held as VFXEncodedChunk | null;
    if (!finishedWriter || !finalPacket) throw new TypeError("Opus encoder produced no packets.");
    const finalFrames = Math.round((finalPacket.webCodecsTiming().durationMicroseconds ?? 0) * 48_000 / 1_000_000);
    const endTrimFrames = encodedFrames - (preSkip ?? 0) - sourceFrames;
    if (!Number.isSafeInteger(endTrimFrames) || endTrimFrames < 0 || endTrimFrames > finalFrames)
      throw new DOMException("Opus encoder packet timing cannot represent the source frame length.", "NotSupportedError");
    await awaitOpusAbort(finishedWriter.write(endTrimFrames === 0 ? finalPacket : new VFXEncodedChunk({
      type: "key", data: finalPacket.copyData(), timing: finalPacket.timing,
      discardPaddingNanoseconds: Math.round(endTrimFrames * 1_000_000_000 / 48_000),
    })), signal);
    await awaitOpusAbort(finishedWriter.close(), signal);
    signal.throwIfAborted();
    return Object.freeze({ mimeType: "audio/webm", fileType: "webm", byteLength: writtenBytes });
  } catch (cause) {
    source.cancel(cause);
    requestSinkAbort(cause);
    throw cause;
  } finally {
    closed = true;
    signal.removeEventListener("abort", abort);
    closeEncoder();
    if (iterator?.return) void iterator.return().catch(() => undefined);
    if (sinkClosed) sinkWriter.releaseLock();
  }
}

/** Demux with VFX-03, then release every native AudioData before yielding owned PCM. */
export async function decodeOpusWebM(bytes: Uint8Array, signal: AbortSignal): Promise<AUFXAudioPCMBuffer> {
  signal.throwIfAborted();
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > MAX_ENCODED_BYTES)
    throw new DOMException("Opus WebM input exceeds the 16 MiB byte budget.", "QuotaExceededError");
  if (typeof AudioDecoder !== "function" || typeof EncodedAudioChunk !== "function")
    throw new DOMException("WebCodecs Opus decoding is unavailable.", "NotSupportedError");
  const reader = new VFXContainerReader({ backend: new VFXWebMContainerBackend(), signal,
    maximumBufferedBytes: 2 * 1024 * 1024, maximumElementBytes: 1024 * 1024, maximumChunks: 16_384 });
  async function* source() {
    for (let offset = 0; offset < bytes.byteLength; offset += 64 * 1024) {
      signal.throwIfAborted();
      yield bytes.subarray(offset, Math.min(bytes.byteLength, offset + 64 * 1024));
    }
  }
  const parsed = await reader.read(source());
  const track = parsed.track;
  if (track.kind !== "audio" || track.codec !== "opus" || track.sampleRate !== 48_000 || track.channelCount > 2 || parsed.chunks.length > 16_384)
    throw new DOMException("Unsupported Opus WebM track or packet count.", "NotSupportedError");
  if (parsed.chunks.slice(0, -1).some(packet => packet.discardPaddingNanoseconds !== 0))
    throw new DOMException("Restricted Opus WebM import accepts end padding only on the final packet.", "NotSupportedError");
  const endTrimFrames = Math.round((parsed.chunks.at(-1)?.discardPaddingNanoseconds ?? 0) * 48_000 / 1_000_000_000);
  const segments: Float32Array[][] = [];
  let frames = 0;
  let error: unknown = null;
  let closed = false;
  const decoder = new AudioDecoder({
    output(data) {
      try {
        if (closed || error) return;
        if (data.sampleRate !== 48_000 || data.numberOfChannels !== track.channelCount || data.numberOfFrames < 1 ||
            frames + data.numberOfFrames > Math.floor(16_777_216 / track.channelCount))
          throw new DOMException("Decoded Opus audio exceeds the owned PCM budget or changed format.", "QuotaExceededError");
        const channels: Float32Array[] = [];
        for (let channel = 0; channel < track.channelCount; channel++) {
          const plane = new Float32Array(data.numberOfFrames);
          data.copyTo(plane, { planeIndex: channel, format: "f32-planar" });
          channels.push(plane);
        }
        segments.push(channels);
        frames += data.numberOfFrames;
      } catch (cause) { error = cause; }
      finally { data.close(); }
    },
    error(cause) { error = cause; },
  });
  const abort = () => { closed = true; try { decoder.close(); } catch { /* already closed */ } };
  signal.addEventListener("abort", abort, { once: true });
  try {
    decoder.configure({ codec: "opus", sampleRate: 48_000, numberOfChannels: track.channelCount });
    for (const packet of parsed.chunks) {
      if (signal.aborted) throw abortError(signal);
      const timing = packet.webCodecsTiming();
      decoder.decode(new EncodedAudioChunk({ type: "key", timestamp: timing.timestampMicroseconds,
        ...(timing.durationMicroseconds === null ? {} : { duration: timing.durationMicroseconds }), data: packet.copyData() }));
      await decoder.flush();
      if (signal.aborted) throw abortError(signal);
      if (error) throw error;
    }
    if (frames <= track.preSkip + endTrimFrames) throw new TypeError("Opus WebM produced no decoded audio after pre-skip and end padding.");
    const output = new AUFXAudioPCMBuffer(new AUFXAudioFormat(48_000, track.channelCount), frames - track.preSkip - endTrimFrames);
    output.frameLength = output.frameCapacity;
    let sourceFrame = 0;
    for (const segment of segments) {
      const count = segment[0]!.length;
      for (let frame = 0; frame < count; frame++, sourceFrame++) {
        if (sourceFrame < track.preSkip || sourceFrame >= frames - endTrimFrames) continue;
        if ((sourceFrame & 4095) === 0) signal.throwIfAborted();
        for (let channel = 0; channel < track.channelCount; channel++)
          output.setSample(channel, sourceFrame - track.preSkip, segment[channel]![frame]!);
      }
    }
    signal.throwIfAborted();
    return output;
  } finally {
    closed = true;
    signal.removeEventListener("abort", abort);
    try { decoder.close(); } catch { /* already closed after cancellation */ }
  }
}
