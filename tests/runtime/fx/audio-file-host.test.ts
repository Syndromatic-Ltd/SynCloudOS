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
import { readFileSync } from "node:fs";
import { AUFXAudioFile } from "../../../src/FX/AudioFX/AUFXAudioFile";
import { AUFXAudioFormat } from "../../../src/FX/AudioFX/AUFXAudioFormat";
import { AUFXAudioPCMBuffer } from "../../../src/FX/AudioFX/AUFXAudioPCMBuffer";
import { BrowserAudioFileAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAudioFileAdapter";

function fixture() {
  const loadBytes = vi.fn(async () => Object.freeze({ bytes: new Uint8Array([1, 2, 3]), mimeType: "audio/mpeg", source: "/tone.mp3" }));
  const decode = vi.fn(async () => ({ sampleRate: 8000, channels: [new Float32Array([0.25, -0.5])] }));
  return { loadBytes, decode, adapter: new BrowserAudioFileAdapter({ loadBytes, decode }) };
}

it("opens the generated portable WAV fixture without invoking browser-native decode", async () => {
  const f = fixture(), bytes = readFileSync("tests/fixtures/fx/audio/generated-440hz-pcm16.wav");
  f.loadBytes.mockResolvedValue(Object.freeze({ bytes: new Uint8Array(bytes), mimeType: "audio/wav", source: "/generated.wav" }));
  const file = await f.adapter.openFile({ source: "/generated.wav" }, new AbortController().signal);
  expect(file.fileFormat.isEqual(new AUFXAudioFormat(8000, 1))).toBe(true); expect(file.length).toBe(80); expect(f.decode).not.toHaveBeenCalled();
});

it("opens browser-decoded audio as owned PCM and reports only observed codec support", async () => {
  const f = fixture();
  expect(f.adapter.capabilities().decode).toEqual([{ mimeType: "audio/wav", provenance: "portable" }]);
  const file = await f.adapter.openFile({ source: "/tone.mp3" }, new AbortController().signal);
  expect(file.url).toBe("/tone.mp3");
  expect(file.fileFormat.isEqual(new AUFXAudioFormat(8000, 1))).toBe(true);
  expect(file.isOpen).toBe(true);
  expect(file.readFrames(2).getSample(0, 1)).toBe(-0.5);
  expect(f.adapter.capabilities().decode).toContainEqual({ mimeType: "audio/mpeg", provenance: "observed-browser" });
  file.close(); expect(file.isOpen).toBe(false);
});

it("returns promptly on abort and discards a late native decode", async () => {
  let finish!: (value: { sampleRate: number; channels: Float32Array[] }) => void;
  const f = fixture(); f.decode.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const controller = new AbortController(); const pending = f.adapter.openFile({ source: "/slow.mp3" }, controller.signal);
  await vi.waitFor(() => expect(f.decode).toHaveBeenCalled()); controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  finish({ sampleRate: 8000, channels: [new Float32Array([1])] });
  await Promise.resolve(); expect(f.adapter.capabilities().decode).not.toContainEqual(expect.objectContaining({ mimeType: "audio/mpeg" }));
});

it("retains native decode reservations after caller abort until browser work settles", async () => {
  const finishes: Array<(value: { sampleRate: number; channels: Float32Array[] }) => void> = [];
  const f = fixture(); f.decode.mockImplementation(() => new Promise(resolve => finishes.push(resolve)));
  const controllers = [new AbortController(), new AbortController()];
  const pending = controllers.map((controller, index) => f.adapter.openFile({ source: `/slow-${index}.mp3` }, controller.signal));
  await vi.waitFor(() => expect(f.decode).toHaveBeenCalledTimes(2));
  controllers.forEach(controller => controller.abort());
  await Promise.all(pending.map(value => expect(value).rejects.toMatchObject({ name: "AbortError" })));
  await expect(f.adapter.openFile({ source: "/blocked.mp3" }, new AbortController().signal)).rejects.toMatchObject({ name: "QuotaExceededError" });
  finishes[0]({ sampleRate: 8000, channels: [new Float32Array([1])] });
  const retry = f.adapter.openFile({ source: "/retry.mp3" }, new AbortController().signal);
  await vi.waitFor(() => expect(f.decode).toHaveBeenCalledTimes(3));
  finishes[2]({ sampleRate: 8000, channels: [new Float32Array([0.5])] });
  await expect(retry).resolves.toMatchObject({ isOpen: true });
  finishes[1]({ sampleRate: 8000, channels: [new Float32Array([1])] });
});

it("rejects decoded output beyond the owned PCM allocation budget", async () => {
  const f = fixture(); f.decode.mockResolvedValue({ sampleRate: 48000, channels: [new Float32Array(16_777_217)] });
  await expect(f.adapter.openFile({ source: "/huge.mp3" }, new AbortController().signal)).rejects.toThrow(/decoded.*budget/i);
});

it("rejects encoded input beyond the compressed byte budget before decoding", async () => {
  const f = fixture(); f.loadBytes.mockResolvedValue(Object.freeze({ bytes: new Uint8Array(16 * 1024 * 1024 + 1), mimeType: "audio/mpeg", source: "/huge.mp3" }));
  await expect(f.adapter.openFile({ source: "/huge.mp3" }, new AbortController().signal)).rejects.toThrow(/encoded.*budget/i);
  expect(f.decode).not.toHaveBeenCalled();
});

it("rejects empty, control-bearing, and oversized source references before loading", async () => {
  const f = fixture(), signal = new AbortController().signal;
  await expect(f.adapter.openFile({ source: "" }, signal)).rejects.toThrow(/source/i);
  await expect(f.adapter.openFile({ source: "/tone\n.wav" }, signal)).rejects.toThrow(/source/i);
  await expect(f.adapter.openFile({ source: `/${"a".repeat(4096)}` }, signal)).rejects.toThrow(/source/i);
  expect(f.loadBytes).not.toHaveBeenCalled();
});

it("exports an owned PCM16 WAV result with accurate metadata", async () => {
  const f = fixture(), file = await f.adapter.openFile({ source: "/tone.mp3" }, new AbortController().signal);
  const result = await f.adapter.exportFile(file, new AbortController().signal);
  expect(result.mimeType).toBe("audio/wav"); expect(result.byteLength).toBe(result.data.size); expect(result.fileType).toBe("wav");
  expect(result.data).toBeInstanceOf(Blob); expect(result.byteLength).toBeGreaterThan(44);
});

it("exports long PCM as bounded WAV chunks while preserving the file cursor", async () => {
  const format = new AUFXAudioFormat(48_000, 2), pcm = new AUFXAudioPCMBuffer(format, 5_001); pcm.frameLength = 5_001;
  pcm.setSample(0, 0, 0.5); pcm.setSample(1, 5_000, -0.25);
  const file = new AUFXAudioFile(pcm); file.framePosition = 123;
  const readFrames = vi.spyOn(file, "readFrames");
  const f = fixture(), result = await f.adapter.exportFile(file, new AbortController().signal);

  expect(file.framePosition).toBe(123);
  expect(Math.max(...readFrames.mock.calls.map(([frames]) => frames))).toBeLessThanOrEqual(2_048);
  expect(readFrames.mock.calls.length).toBeGreaterThan(1);
  const decoded = AUFXAudioFile.decodeWAV(await result.data.arrayBuffer());
  expect(decoded.frameLength).toBe(5_001);
  expect(decoded.getSample(0, 0)).toBeCloseTo(0.5, 4);
  expect(decoded.getSample(1, 5_000)).toBeCloseTo(-0.25, 4);
});

it("reports exact browser codec probe results without claiming unsupported configurations", async () => {
  const loadBytes = vi.fn(async () => Object.freeze({ bytes: new Uint8Array([1]), mimeType: "audio/wav", source: "/tone.wav" }));
  const probeDecoder = vi.fn(async ({ codec }: { codec: string }) => codec === "mp4a.40.2");
  const probeEncoder = vi.fn(async () => false);
  const adapter = new BrowserAudioFileAdapter({ loadBytes, probeDecoder, probeEncoder });
  const signal = new AbortController().signal;
  const aac = await adapter.negotiateCodec({ mimeType: "audio/mp4", codec: "mp4a.40.2", sampleRate: 48_000, channelCount: 2 }, signal);
  const unsupported = await adapter.negotiateCodec({ mimeType: "audio/webm", codec: "opus", sampleRate: 48_000, channelCount: 2 }, signal);
  const wav = await adapter.negotiateCodec({ mimeType: "audio/wav", codec: "pcm-s16le", sampleRate: 48_000, channelCount: 2 }, signal);

  expect(aac).toMatchObject({ decode: true, encode: false, provenance: "webcodecs-probe" });
  expect(unsupported).toMatchObject({ decode: false, encode: false, provenance: "webcodecs-probe" });
  expect(wav).toMatchObject({ decode: true, encode: true, provenance: "portable" });
  expect(probeDecoder).toHaveBeenCalledTimes(2);
  expect(probeEncoder).toHaveBeenCalledTimes(2);
});

it("does not advertise a probed encoder without the matching bounded container export", async () => {
  const adapter = new BrowserAudioFileAdapter({
    loadBytes: async () => ({ bytes: new Uint8Array([1]), mimeType: "audio/wav", source: "/tone.wav" }),
    probeDecoder: async () => true,
    probeEncoder: async () => true,
  });
  const signal = new AbortController().signal;
  expect(await adapter.negotiateCodec({ mimeType: "audio/mp4", codec: "mp4a.40.2", sampleRate: 48_000, channelCount: 2 }, signal)).toMatchObject({ decode: true, encode: false });
  expect(await adapter.negotiateCodec({ mimeType: "audio/webm", codec: "opus", sampleRate: 44_100, channelCount: 2 }, signal)).toMatchObject({ encode: false });
  expect(await adapter.negotiateCodec({ mimeType: "audio/webm", codec: "opus", sampleRate: 48_000, channelCount: 2 }, signal)).toMatchObject({ encode: true });
  expect(adapter.capabilities().encode).toEqual([{ mimeType: "audio/wav", provenance: "portable" }]);
});

it("rejects unavailable compressed export before moving the file cursor", async () => {
  const format = new AUFXAudioFormat(48_000, 1), pcm = new AUFXAudioPCMBuffer(format, 960); pcm.frameLength = 960;
  const file = new AUFXAudioFile(pcm); file.framePosition = 71;
  const adapter = fixture().adapter;
  const formerEncoder = (globalThis as { AudioEncoder?: unknown }).AudioEncoder;
  const formerData = (globalThis as { AudioData?: unknown }).AudioData;
  vi.stubGlobal("AudioEncoder", undefined); vi.stubGlobal("AudioData", undefined);
  try {
    await expect(adapter.exportFile(file, new AbortController().signal, { format: "opus-webm" })).rejects.toMatchObject({ name: "NotSupportedError" });
    expect(file.framePosition).toBe(71);
    expect(adapter.capabilities().encode).toEqual([{ mimeType: "audio/wav", provenance: "portable" }]);
  } finally {
    vi.stubGlobal("AudioEncoder", formerEncoder); vi.stubGlobal("AudioData", formerData);
  }
});
