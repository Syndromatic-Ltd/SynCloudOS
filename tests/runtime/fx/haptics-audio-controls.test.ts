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
import { HFXHapticPatternCodec } from "../../../src/FX/HapticsFX/HFXHapticPatternCodec";
import { AUFXSystemFeedbackBus } from "../../../src/SynCloudOS/AudioFX/AUFXSystemFeedbackBus";
import { AUFXAudioFormat, AUFXAudioPCMBuffer } from "../../../src/FX/AudioFX/public";
import { HFXHapticEngine, HFXHapticPattern } from "../../../src/FX/HapticsFX/public";
import { createRuntimeHapticsService } from "../../../src/SynCloudOS/HapticsFX/HapticsService";

it("round trips AHAP audio pan/pitch events and signed dynamic curves", () => {
  const text = JSON.stringify({ Version: 1, Pattern: [
    { Event: { EventType: "AudioCustom", Time: 0, EventDuration: 1, EventWaveformPath: "tone.wav", EventWaveformLoopEnabled: true, EventParameters: [{ ParameterID: "AudioPan", ParameterValue: -0.5 }, { ParameterID: "AudioPitch", ParameterValue: 0.25 }, { ParameterID: "AudioBrightness", ParameterValue: 0.8 }] } },
    { ParameterCurve: { ParameterID: "AudioPanControl", Time: 0, ParameterCurveControlPoints: [{ Time: 0, ParameterValue: -1 }, { Time: 1, ParameterValue: 1 }] } },
    { Parameter: { ParameterID: "AudioPitchControl", Time: 0, ParameterValue: -0.25 } },
  ] });
  const pattern = HFXHapticPatternCodec.decodeAHAP(text);
  expect(pattern.events[0]).toMatchObject({ audioPan: -0.5, audioPitch: 0.25, audioBrightness: 0.8, audioLoop: true });
  expect(pattern.curves[0]!.valueAt(0.5)).toBe(0);
  expect(HFXHapticPatternCodec.decodeAHAP(HFXHapticPatternCodec.encodeAHAP(pattern))).toEqual(pattern);
  expect(() => HFXHapticPatternCodec.decodeAHAP(text.replace('"ParameterValue":-0.5', '"ParameterValue":-2'))).toThrow();
});

it("applies event and additive dynamic pan/pitch to real output node parameters", async () => {
  const brightness = { type: "", frequency: { value: 0 }, Q: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
  const panner = { pan: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
  const source = { buffer: null, playbackRate: { value: 1 }, detune: { value: 0 }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
  const context = { state: "running", currentTime: 1, sampleRate: 8000, destination: {}, close() {}, createBufferSource: () => source,
    createStereoPanner: () => panner, createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
    createBiquadFilter: () => brightness, createBuffer: (_channels: number, frames: number) => ({ getChannelData: () => new Float32Array(frames) }),
  } as unknown as AudioContext;
  const bus = new AUFXSystemFeedbackBus(() => context), pcm = new AUFXAudioPCMBuffer(new AUFXAudioFormat(8000, 1), 800); pcm.frameLength = 800;
  const resource = await bus.registerAudioResource(pcm);
  bus.playAudioResource(resource, { pan: -0.5, pitch: 0.25, brightness: 0.5 });
  expect(brightness.type).toBe("lowpass"); expect(brightness.frequency.value).toBe(2010);
  expect(panner.pan.value).toBe(-0.5); expect(source.detune.value).toBe(300);
  bus.setAudioResourceParameter(resource, "audioPan", 1); bus.setAudioResourceParameter(resource, "audioPitch", -0.5);
  expect(panner.pan.value).toBe(0.5); expect(source.detune.value).toBe(-300);
  bus.setAudioResourceParameter(resource, "audioBrightness", -0.5); expect(brightness.frequency.value).toBe(20);
  panner.disconnect.mockClear();
  bus.cancelAudioResource(resource); expect(brightness.disconnect).toHaveBeenCalledOnce(); expect(panner.disconnect).toHaveBeenCalledOnce(); bus.dispose();
});

it("loops a custom waveform for the event wall duration and wraps resumed offsets", async () => {
  const source = { buffer: null, loop: false, playbackRate: { value: 1 }, connect() {}, disconnect() {}, start: vi.fn(), stop: vi.fn(), onended: null };
  const context = { state: "running", currentTime: 1, sampleRate: 8000, destination: {}, close() {}, createBufferSource: () => source,
    createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }), createBiquadFilter: () => ({ frequency: {}, Q: {}, connect() {} }),
    createBuffer: (_channels: number, frames: number) => ({ getChannelData: () => new Float32Array(frames) }),
  } as unknown as AudioContext;
  const bus = new AUFXSystemFeedbackBus(() => context), pcm = new AUFXAudioPCMBuffer(new AUFXAudioFormat(8000, 1), 800); pcm.frameLength = 800;
  const resource = await bus.registerAudioResource(pcm);
  bus.playAudioResource(resource, { delay: 0.25, duration: 0.5, offset: 0.25, loop: true, rate: 2 });
  expect(source.loop).toBe(true); expect(source.start.mock.calls[0]![0]).toBe(1.25); expect(source.start.mock.calls[0]![1]).toBeCloseTo(0.05);
  expect(source.stop).toHaveBeenCalledWith(1.75); bus.dispose();
});

it("applies parameters and cancellation only to the owning player's audio playback", async () => {
  const sources: any[] = [], gains: any[] = [];
  const context = { state: "running", currentTime: 1, sampleRate: 8000, destination: {}, close() {},
    createBufferSource: () => { const source = { buffer: null, loop: false, playbackRate: { value: 1 }, detune: { value: 0 }, connect() {}, disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null }; sources.push(source); return source; },
    createGain: () => { const gain = { gain: { value: 1 }, connect() {}, disconnect: vi.fn() }; gains.push(gain); return gain; },
    createStereoPanner: () => ({ pan: { value: 0 }, connect() {}, disconnect() {} }),
    createBiquadFilter: () => ({ frequency: {}, Q: {}, connect() {} }),
    createBuffer: (_channels: number, frames: number) => ({ getChannelData: () => new Float32Array(frames) }),
  } as unknown as AudioContext;
  const bus = new AUFXSystemFeedbackBus(() => context), pcm = new AUFXAudioPCMBuffer(new AUFXAudioFormat(8000, 1), 800); pcm.frameLength = 800;
  const engine: HFXHapticEngine = createRuntimeHapticsService(bus, { navigator: null, document: null });
  await engine.start();
  const resource = await engine.registerAudioResource(pcm);
  const pattern = new HFXHapticPattern([{ type: "audio", audioResource: resource.id, relativeTime: 0, duration: 0.1, intensity: 1 }]);
  const older = engine.makeAdvancedPlayer(pattern), newer = engine.makeAdvancedPlayer(pattern);
  older.start(); newer.start();
  older.sendParameters([{ parameterID: "audioVolume", value: 0.2, relativeTime: 0 }]);
  const [olderGain, newerGain] = gains.slice(-2);
  expect(olderGain.gain.value).toBe(0.2);
  expect(newerGain.gain.value).toBe(1);
  older.stop();
  expect(sources[0]!.stop).toHaveBeenCalledOnce();
  expect(sources[1]!.stop).not.toHaveBeenCalled();
  newer.stop(); engine.dispose(); bus.dispose();
});
