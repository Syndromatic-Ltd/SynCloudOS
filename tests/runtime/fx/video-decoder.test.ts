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

import { expect, it } from "vitest";
import { MEFXSampleTimingInfo, MEFXTime } from "../../../src/FX/MediaFX/public";
import {
  VFXCodecCapabilities,
  VFXDecoder,
  VFXEncodedChunk,
  VFXFrame,
  VFXPixelBuffer,
  VFXVideoFormat,
  type VFXDecoderBackend,
  type VFXDecoderBackendCallbacks,
  type VFXDecoderConfig,
} from "../../../src/FX/VideoFX/public";

function timing(value: bigint, timescale = 30): MEFXSampleTimingInfo {
  return new MEFXSampleTimingInfo({
    presentationTime: MEFXTime.finite(value, timescale),
    duration: MEFXTime.finite(1n, timescale),
  });
}

function frame(value: bigint): VFXFrame {
  const format = new VFXVideoFormat({ codedWidth: 1, codedHeight: 1, pixelFormat: "rgba8", colourSpace: "srgb" });
  const pixels = new VFXPixelBuffer(format, new Uint8Array([Number(value & 0xffn), 0, 0, 255]));
  const result = new VFXFrame({ pixels, timing: timing(value) });
  pixels.close();
  return result;
}

class FakeDecoderBackend implements VFXDecoderBackend {
  decodeQueueSize = 0;
  configured: VFXDecoderConfig[] = [];
  decoded: VFXEncodedChunk[] = [];
  callbacks: VFXDecoderBackendCallbacks[] = [];
  resetCount = 0;
  disposeCount = 0;
  private flushes: Array<{ promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void }> = [];

  configure(config: VFXDecoderConfig, callbacks: VFXDecoderBackendCallbacks): void {
    this.configured.push(config);
    this.callbacks.push(callbacks);
  }

  decode(chunk: VFXEncodedChunk): void {
    this.decoded.push(chunk);
  }

  flush(): Promise<void> {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; });
    this.flushes.push({ promise, resolve, reject });
    return promise;
  }

  resolveFlush(index = this.flushes.length - 1): void { this.flushes[index]?.resolve(); }
  rejectFlush(error: unknown, index = this.flushes.length - 1): void { this.flushes[index]?.reject(error); }
  emit(output: VFXFrame, callbackIndex = this.callbacks.length - 1): void { this.callbacks[callbackIndex]?.output(output); }
  fail(error: unknown, callbackIndex = this.callbacks.length - 1): void { this.callbacks[callbackIndex]?.error(error); }
  reset(): void { this.resetCount += 1; }
  dispose(): void { this.disposeCount += 1; }
}

const config: VFXDecoderConfig = Object.freeze({ codec: "vp8", codedWidth: 16, codedHeight: 16, hardwareAcceleration: "no-preference", optimizeForLatency: false });

it("normalizes decoder capability probes and preserves an honest unsupported reason", async () => {
  const seen: VFXDecoderConfig[] = [];
  const probe = {
    async queryDecoder(candidate: VFXDecoderConfig) {
      seen.push(candidate);
      return candidate.codec === "vp8"
        ? { supported: true as const, config: { ...candidate, codedWidth: 32 } }
        : { supported: false as const, reason: "codec-unavailable" };
    },
  };

  const supported = await VFXCodecCapabilities.queryDecoder({ codec: "vp8", codedWidth: 16, codedHeight: 16 }, probe);
  expect(supported).toMatchObject({ supported: true, config: { codec: "vp8", codedWidth: 32, codedHeight: 16, hardwareAcceleration: "no-preference", optimizeForLatency: false } });
  const unsupported = await VFXCodecCapabilities.queryDecoder({ codec: "not-a-codec", codedWidth: 16, codedHeight: 16 }, probe);
  expect(unsupported).toEqual({ supported: false, config: { codec: "not-a-codec", codedWidth: 16, codedHeight: 16, hardwareAcceleration: "no-preference", optimizeForLatency: false }, reason: "codec-unavailable" });
  expect(seen).toHaveLength(2);
  await expect(VFXCodecCapabilities.queryDecoder({ codec: "vp8", codedWidth: 0, codedHeight: 16 }, probe)).rejects.toThrow(/width/i);
});

it("copies encoded bytes and reports bounded integral-microsecond rounding", () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const chunk = new VFXEncodedChunk({ type: "key", data: bytes, timing: timing(1n, 3) });
  bytes[0] = 9;
  expect([...chunk.copyData()]).toEqual([1, 2, 3]);
  expect(chunk.webCodecsTiming()).toEqual({ timestampMicroseconds: 333333, durationMicroseconds: 333333, rounded: true });

  const exact = new VFXEncodedChunk({ type: "delta", data: new Uint8Array([4]), timing: timing(1n, 4) });
  expect(exact.webCodecsTiming()).toEqual({ timestampMicroseconds: 250000, durationMicroseconds: 250000, rounded: false });
  expect(() => new VFXEncodedChunk({ type: "bogus" as "key", data: new Uint8Array(), timing: timing(0n) })).toThrow(/key|delta/i);

  const huge = new VFXEncodedChunk({
    type: "key",
    data: new Uint8Array([1]),
    timing: new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(BigInt(Number.MAX_SAFE_INTEGER), 1) }),
  });
  expect(() => huge.webCodecsTiming()).toThrow(/range/i);
});

it("requires a keyframe, preserves backend PTS reorder and waits for consumer acknowledgement on flush", async () => {
  const backend = new FakeDecoderBackend();
  const delivered: VFXFrame[] = [];
  let acknowledge!: () => void;
  const stalled = new Promise<void>((resolve) => { acknowledge = resolve; });
  const decoder = new VFXDecoder({
    backend,
    output(output) {
      delivered.push(output);
      return delivered.length === 1 ? stalled : undefined;
    },
    maximumPendingOutputs: 4,
  });
  decoder.configure(config);
  expect(() => decoder.decode(new VFXEncodedChunk({ type: "delta", data: new Uint8Array([2]), timing: timing(2n) }))).toThrowError(DOMException);
  decoder.decode(new VFXEncodedChunk({ type: "key", data: new Uint8Array([1]), timing: timing(2n) }));
  decoder.decode(new VFXEncodedChunk({ type: "delta", data: new Uint8Array([2]), timing: timing(1n) }));
  expect(backend.decoded.map((chunk) => chunk.timing.presentationTime.value)).toEqual([timing(2n).presentationTime.value, timing(1n).presentationTime.value]);

  backend.emit(frame(1n));
  backend.emit(frame(2n));
  const flushing = decoder.flush();
  backend.resolveFlush();
  let settled = false;
  void flushing.then(() => { settled = true; });
  await Promise.resolve();
  expect(settled).toBe(false);
  acknowledge();
  await flushing;
  expect(decoder.state).toBe("configured");
  expect(() => decoder.decode(new VFXEncodedChunk({
    type: "delta",
    data: new Uint8Array([3]),
    timing: timing(3n),
  }))).toThrowError(DOMException);
  decoder.decode(new VFXEncodedChunk({ type: "key", data: new Uint8Array([4]), timing: timing(3n) }));
  expect(delivered.map((output) => output.timing.presentationTime.value.kind === "finite" ? output.timing.presentationTime.value.value : -1n)).toEqual([1n, 2n]);
  for (const output of delivered) output.close();
  decoder.dispose();
});

it("reset rejects a pending flush and closes a late frame from the old generation", async () => {
  const backend = new FakeDecoderBackend();
  const decoder = new VFXDecoder({ backend, output: () => undefined });
  decoder.configure(config);
  decoder.decode(new VFXEncodedChunk({ type: "key", data: new Uint8Array([1]), timing: timing(0n) }));
  const flushing = decoder.flush();
  decoder.reset();
  await expect(flushing).rejects.toMatchObject({ name: "AbortError" });
  expect(decoder.state).toBe("unconfigured");
  expect(backend.resetCount).toBe(1);

  const late = frame(9n);
  backend.emit(late, 0);
  expect(late.closed).toBe(true);
  backend.resolveFlush(0);
  decoder.dispose();
});

it("bounds stalled output ownership and releases unacknowledged frames on backend failure", async () => {
  const backend = new FakeDecoderBackend();
  const errors: unknown[] = [];
  const never = new Promise<void>(() => undefined);
  const decoder = new VFXDecoder({ backend, output: () => never, error: (error) => errors.push(error), maximumPendingOutputs: 1 });
  decoder.configure(config);
  decoder.decode(new VFXEncodedChunk({ type: "key", data: new Uint8Array([1]), timing: timing(0n) }));

  const first = frame(1n);
  const overflow = frame(2n);
  backend.emit(first);
  backend.emit(overflow);
  expect(overflow.closed).toBe(true);
  expect(first.closed).toBe(true);
  expect(decoder.state).toBe("failed");
  expect(errors[0]).toMatchObject({ name: "QuotaExceededError" });

  decoder.reset();
  decoder.configure(config);
  decoder.decode(new VFXEncodedChunk({ type: "key", data: new Uint8Array([1]), timing: timing(0n) }));
  const pending = frame(3n);
  backend.emit(pending, 1);
  backend.fail(new Error("codec failed"), 1);
  expect(pending.closed).toBe(true);
  expect(decoder.state).toBe("failed");
  expect(errors.at(-1)).toBeInstanceOf(Error);
  decoder.dispose();
  expect(backend.disposeCount).toBe(1);
});
