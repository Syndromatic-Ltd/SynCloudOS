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
import { AUFXAudioEnvelope } from "../../../src/FX/AudioFX/AUFXAudioEnvelope";
import { HFXHapticPatternCodec } from "../../../src/FX/HapticsFX/HFXHapticPatternCodec";
import { AUFXSystemFeedbackBus } from "../../../src/SynCloudOS/AudioFX/AUFXSystemFeedbackBus";
import { AUFXAudioFormat, AUFXAudioPCMBuffer } from "../../../src/FX/AudioFX/public";
import { BrowserHapticsAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserHapticsAdapter";

it("maps normalized browser envelopes to measured attack, decay, sustain and release", () => {
  expect(AUFXAudioEnvelope.valueAt(0.1, 1, { attackTime: 0.2, releaseTime: 0.4 })).toBeCloseTo(0.5);
  expect(AUFXAudioEnvelope.valueAt(0.8, 1, { attackTime: 0.2, releaseTime: 0.4 })).toBe(1);
  expect(AUFXAudioEnvelope.valueAt(1.2, 1, { attackTime: 0.2, releaseTime: 0.4 })).toBeCloseTo(0.5);
  expect(AUFXAudioEnvelope.valueAt(0.3, 1, { attackTime: 0.2, decayTime: 0.2, sustained: false })).toBeCloseTo(0.5);
  expect(AUFXAudioEnvelope.valueAt(0.5, 1, { attackTime: 0.2, decayTime: 0.2, sustained: false })).toBe(0);
});

it("schedules a separate native envelope gain and reschedules live envelope controls", async () => {
  const gains: any[] = [];
  const source = { buffer: null, playbackRate: { value: 1 }, connect: vi.fn(), disconnect() {}, start: vi.fn(), stop: vi.fn(), onended: null };
  const context = { state: "running", currentTime: 2, sampleRate: 8000, destination: {}, close() {}, createBufferSource: () => source,
    createGain: () => { const gain = { gain: { value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect() {}, disconnect() {} }; gains.push(gain); return gain; },
    createBiquadFilter: () => ({ frequency: {}, Q: {}, connect() {} }), createBuffer: (_channels: number, frames: number) => ({ getChannelData: () => new Float32Array(frames) }),
  } as unknown as AudioContext;
  const bus = new AUFXSystemFeedbackBus(() => context), pcm = new AUFXAudioPCMBuffer(new AUFXAudioFormat(8000, 1), 16000); pcm.frameLength = 16000;
  const id = await bus.registerAudioResource(pcm);
  bus.playAudioResource(id, { duration: 1, envelope: { attackTime: 0.2, releaseTime: 0.4 } });
  const envelope = gains.at(-1).gain;
  expect(envelope.linearRampToValueAtTime).toHaveBeenCalledWith(1, 2.2); expect(envelope.linearRampToValueAtTime).toHaveBeenCalledWith(0, 3.4);
  bus.setMasterVolume(0.1); expect(envelope.value).toBe(1);
  Object.assign(context, { currentTime: 2.1 }); bus.setAudioResourceParameter(id, "audioAttackTime", 0.2);
  expect(envelope.setValueAtTime).toHaveBeenLastCalledWith(expect.closeTo(0.25), 2.1);
  bus.dispose();
});

it("preserves AHAP envelope options and signed audio/haptic time curves", () => {
  const pattern = HFXHapticPatternCodec.decodeAHAP(JSON.stringify({ Version: 1, Pattern: [
    { Event: { EventType: "AudioCustom", Time: 0, EventDuration: 1, EventWaveformPath: "owned", EventWaveformUseVolumeEnvelope: true, EventParameters: [{ ParameterID: "AttackTime", ParameterValue: 0.2 }, { ParameterID: "DecayTime", ParameterValue: 0.3 }, { ParameterID: "ReleaseTime", ParameterValue: 0.4 }, { ParameterID: "Sustained", ParameterValue: 1 }] } },
    { Parameter: { ParameterID: "AudioAttackTimeControl", Time: 0, ParameterValue: -0.1 } },
    { Parameter: { ParameterID: "HapticReleaseTimeControl", Time: 0, ParameterValue: 0.1 } },
  ] }));
  expect(pattern.events[0]).toMatchObject({ attackTime: 0.2, decayTime: 0.3, releaseTime: 0.4, sustained: true, audioUseVolumeEnvelope: true });
  expect(pattern.duration).toBe(1.4);
  expect(HFXHapticPatternCodec.decodeAHAP(HFXHapticPatternCodec.encodeAHAP(pattern))).toEqual(pattern);
});

it("samples haptic envelopes as timing-only PWM and cancels the sampling timer", async () => {
  vi.useFakeTimers();
  const vibrate = vi.fn(() => true), bus = new AUFXSystemFeedbackBus(() => null);
  const adapter = new BrowserHapticsAdapter(bus, { navigator: { vibrate }, document: null });
  try {
    adapter.playStructuredEvent({ type: "continuous", relativeTime: 0, duration: 0.5, intensity: 1, attackTime: 0.2 });
    await vi.advanceTimersByTimeAsync(96); const attackPattern = vibrate.mock.calls.at(-1)![0];
    await vi.advanceTimersByTimeAsync(112); expect(vibrate.mock.calls.at(-1)![0]).not.toEqual(attackPattern);
    adapter.cancel(); const count = vibrate.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000); expect(vibrate.mock.calls).toHaveLength(count); expect(vi.getTimerCount()).toBe(0);
  } finally { adapter.destroy(); bus.dispose(); vi.useRealTimers(); }
});
