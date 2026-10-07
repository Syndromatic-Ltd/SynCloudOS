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
import { AUFXAudioEngine, AUFXAudioFormat, AUFXAudioPCMBuffer, AUFXAudioPlayerNode } from "../../../src/FX/AudioFX/public";
import { AUFXSystemFeedbackBus } from "../../../src/SynCloudOS/AudioFX/AUFXSystemFeedbackBus";

it("renders changing graphs to owned native output and releases only the aborted graph", async () => {
  vi.useFakeTimers();
  const sources: any[] = [], gains: any[] = [];
  const context = { state: "running", currentTime: 0, sampleRate: 8000, destination: {}, close: vi.fn(),
    createBiquadFilter: () => ({ frequency: {}, Q: {}, connect() {} }),
    createGain: () => { const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }; gains.push(gain); return gain; },
    createBuffer: (_channels: number, frames: number) => { const data = new Float32Array(frames); return { getChannelData: () => data }; },
    createBufferSource: () => { const source = { buffer: null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null }; sources.push(source); return source; },
  } as unknown as AudioContext;
  const bus = new AUFXSystemFeedbackBus(() => context), owner = new AbortController();
  const format = new AUFXAudioFormat(8000, 1), pcm = new AUFXAudioPCMBuffer(format, 8); pcm.frameLength = 8;
  for (let i = 0; i < 8; i++) pcm.setSample(0, i, 1);
  let policy = { volume: 1, muted: false, paused: false };
  const output = bus.createGraphOutput(owner.signal), changed = () => output.setOwnerPolicy(policy);
  const engine = new AUFXAudioEngine(format, output), player = new AUFXAudioPlayerNode(format);
  engine.attach(player); engine.connect(player, engine.mainMixerNode); player.scheduleBuffer(pcm, 0, true); player.play();
  try {
    expect(sources).toHaveLength(0); await engine.start(); expect(engine.isRunning).toBe(true);
    expect(sources[0].buffer.getChannelData(0)[0]).toBe(1);
    engine.mainMixerNode.volume.setValueAtTime(0.25, 0);
    Object.assign(context, { currentTime: 0.05 }); await vi.advanceTimersByTimeAsync(20);
    expect(sources.at(-1).buffer.getChannelData(0)[0]).toBe(0.25);
    bus.setMasterVolume(0.3); expect(gains.at(-1).gain.value).toBe(0.3);
    policy = { volume: 0.5, muted: false, paused: false }; changed(); expect(gains.at(-1).gain.value).toBe(0.15);
    policy = { ...policy, muted: true }; changed(); engine.mainMixerNode.volume.setValueAtTime(1, 0); expect(gains.at(-1).gain.value).toBe(0);
    policy = { ...policy, muted: false, paused: true }; changed(); const pausedSources = sources.length;
    Object.assign(context, { currentTime: 0.15 }); await vi.advanceTimersByTimeAsync(20); expect(sources).toHaveLength(pausedSources);
    policy = { ...policy, paused: false }; changed(); await vi.advanceTimersByTimeAsync(10); expect(sources.length).toBeGreaterThan(pausedSources);
    await expect(engine.renderOffline(8)).rejects.toThrow("running");
    const otherOwner = new AbortController(), other = new AUFXAudioEngine(format, bus.createGraphOutput(otherOwner.signal));
    const previousSources = sources.length; await other.start();
    owner.abort(); expect(engine.isRunning).toBe(false); expect(sources.slice(0, previousSources).every(source => source.stop.mock.calls.length === 1)).toBe(true);
    expect(sources.slice(previousSources).every(source => source.stop.mock.calls.length === 0)).toBe(true);
    expect(other.isRunning).toBe(true); expect(context.close).not.toHaveBeenCalled(); other.dispose();
    expect(context.close).toHaveBeenCalledTimes(1);
    await expect(engine.start()).rejects.toThrow();
  } finally { engine.dispose(); bus.dispose(); vi.useRealTimers(); }
});

it("rejects live output without a host and does not expose its host authority", async () => {
  const engine = new AUFXAudioEngine(new AUFXAudioFormat(8000, 1));
  await expect(engine.start()).rejects.toThrow("unavailable");
  expect(Object.keys(engine)).not.toContain("output"); engine.dispose();
});

it("requests the graph format's output rate without changing or closing the feedback context", async () => {
  const contexts: Array<{ sampleRate: number; close: ReturnType<typeof vi.fn> }> = [];
  const requested: Array<number | undefined> = [];
  const bus = new AUFXSystemFeedbackBus((options) => {
    requested.push(options?.sampleRate);
    const context = {
      state: "running", sampleRate: options?.sampleRate ?? 44_100, currentTime: 0, destination: {},
      close: vi.fn(async () => {}),
      createBiquadFilter: () => ({ frequency: {}, Q: {}, connect() {} }),
      createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
      createBuffer: (_channels: number, frames: number) => ({ getChannelData: () => new Float32Array(frames) }),
      createBufferSource: () => ({ buffer: null, connect() {}, disconnect() {}, start() {}, stop() {}, onended: null }),
    };
    contexts.push(context);
    return context as unknown as AudioContext;
  });
  const owner = new AbortController();
  const output = bus.createGraphOutput(owner.signal);
  expect(requested).toEqual([]);
  await bus.prepare(false);
  expect(requested).toEqual([undefined]);
  const engine = new AUFXAudioEngine(new AUFXAudioFormat(48_000, 1), output);
  try {
    await engine.start();
    expect(requested).toEqual([undefined, 48_000]);
    expect(engine.observeOutputClock()?.sampleRate).toBe(48_000);
    owner.abort();
    expect(contexts[1]!.close).toHaveBeenCalledTimes(1);
    expect(contexts[0]!.close).not.toHaveBeenCalled();
  } finally {
    engine.dispose();
    bus.dispose();
  }
  expect(contexts[0]!.close).toHaveBeenCalledTimes(1);
});
