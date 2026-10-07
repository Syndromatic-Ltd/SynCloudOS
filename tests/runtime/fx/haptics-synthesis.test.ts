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
import { HFXHapticPattern } from "../../../src/FX/HapticsFX/HFXHapticPattern";
import { AUFXAudioFormat, AUFXAudioPCMBuffer } from "../../../src/FX/AudioFX/public";
import { AUFXSystemFeedbackBus } from "../../../src/SynCloudOS/AudioFX/AUFXSystemFeedbackBus";
import { createRuntimeHapticsService } from "../../../src/SynCloudOS/HapticsFX/HapticsService";

it("synthesizes AHAP AudioContinuous without an external waveform and cancels owned output", async () => {
  const source = { buffer: null as any, loop: false, playbackRate: { value: 1 }, detune: { value: 0 }, connect() {}, disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as null | (() => void) };
  const context = { state: "running", currentTime: 2, sampleRate: 8000, destination: {}, close() {}, createBufferSource: () => source,
    createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }), createBiquadFilter: () => ({ frequency: {}, Q: {}, connect() {} }),
    createBuffer: (_channels: number, frames: number) => { const data = new Float32Array(frames); return { getChannelData: () => data }; },
  } as unknown as AudioContext;
  const bus = new AUFXSystemFeedbackBus(() => context), engine = createRuntimeHapticsService(bus, { navigator: null, document: null });
  const pattern = HFXHapticPatternCodec.decodeAHAP(JSON.stringify({ Version: 1, Pattern: [{ Event: { EventType: "AudioContinuous", Time: 0.1, EventDuration: 0.5, EventParameters: [{ ParameterID: "AudioVolume", ParameterValue: 0.4 }] } }] }));
  expect(HFXHapticPatternCodec.decodeAHAP(HFXHapticPatternCodec.encodeAHAP(pattern))).toEqual(pattern);
  await engine.start(); engine.setVibrationEnabled(false);
  const player = engine.makeAdvancedPlayer(pattern);
  player.start(); expect(source.loop).toBe(true); expect(source.start).toHaveBeenCalledWith(2.1, 0); expect(source.stop).toHaveBeenCalledWith(2.6);
  expect(source.buffer.getChannelData(0).some((sample: number) => sample !== 0)).toBe(true);
  player.stop(); expect(source.stop).toHaveBeenCalledTimes(2); expect(source.disconnect).toHaveBeenCalled(); engine.dispose(); bus.dispose();
});

it("attempts every owner cleanup when synthesized-output teardown throws", () => {
  let sequence = 0;
  const unregister = vi.fn((id: string) => { if (id === "synthesis-1") throw new Error("first teardown failure"); });
  const bus = {
    audioState: "available", currentTime: 0, prepare: vi.fn(),
    playSynthesizedAudio: vi.fn(() => `synthesis-${++sequence}`),
    unregisterAudioResource: unregister, setAudioResourceParameter: vi.fn(),
    cancelAudioPlayback: vi.fn(), setAudioPlaybackParameter: vi.fn(),
  } as unknown as AUFXSystemFeedbackBus;
  const engine = createRuntimeHapticsService(bus, { navigator: null, document: null });
  const twoOutputs = new HFXHapticPattern([
    { type: "audioContinuous", relativeTime: 0, duration: 1 },
    { type: "audioContinuous", relativeTime: 0, duration: 1 },
  ]);
  const oneOutput = new HFXHapticPattern([{ type: "audioContinuous", relativeTime: 0, duration: 1 }]);
  const first = engine.makeAdvancedPlayer(twoOutputs), second = engine.makeAdvancedPlayer(oneOutput);
  first.start(); second.start();
  expect(() => engine.setButtonSoundEnabled(false)).toThrow("first teardown failure");
  expect(unregister.mock.calls.map(([id]) => id)).toEqual(["synthesis-1", "synthesis-2", "synthesis-3"]);
  engine.setButtonSoundEnabled(false);
  expect(unregister).toHaveBeenCalledTimes(3);
  first.stop(); second.stop(); engine.dispose();
});

it("releases player audio even when native motor cancellation throws", () => {
  const unregister = vi.fn();
  const bus = {
    audioState: "available", currentTime: 0, prepare: vi.fn(),
    playSynthesizedAudio: vi.fn(() => "synthesis-owned"),
    unregisterAudioResource: unregister, setAudioResourceParameter: vi.fn(),
    cancelAudioPlayback: vi.fn(), setAudioPlaybackParameter: vi.fn(),
  } as unknown as AUFXSystemFeedbackBus;
  const engine = createRuntimeHapticsService(bus, { navigator: { vibrate: () => { throw new Error("native cancellation failure"); } }, document: null });
  const player = engine.makeAdvancedPlayer(new HFXHapticPattern([{ type: "audioContinuous", relativeTime: 0, duration: 1 }]));
  player.start(); player.stop();
  expect(unregister).toHaveBeenCalledExactlyOnceWith("synthesis-owned");
  engine.dispose();
});

it("attempts every registered-resource release and retries the failed resource during final teardown", async () => {
  let sequence = 0;
  const unregister = vi.fn((id: string) => { if (id === "resource-1" && unregister.mock.calls.length === 1) throw new Error("first resource failure"); });
  const bus = {
    audioState: "available", currentTime: 0, prepare: vi.fn(),
    registerAudioResource: vi.fn(async () => `resource-${++sequence}`), unregisterAudioResource: unregister,
    cancelAudioPlayback: vi.fn(), setAudioPlaybackParameter: vi.fn(), setAudioResourceParameter: vi.fn(),
  } as unknown as AUFXSystemFeedbackBus;
  const engine = createRuntimeHapticsService(bus, { navigator: null, document: null });
  const pcm = new AUFXAudioPCMBuffer(new AUFXAudioFormat(8000, 1), 8); pcm.frameLength = 8;
  await engine.registerAudioResource(pcm); await engine.registerAudioResource(pcm);
  engine.dispose();
  expect(unregister.mock.calls.map(([id]) => id)).toEqual(["resource-1", "resource-2", "resource-1"]);
});
