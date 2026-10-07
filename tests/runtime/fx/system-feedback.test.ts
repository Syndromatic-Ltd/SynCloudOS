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
import { AUFXSystemFeedbackBus } from "../../../src/SynCloudOS/AudioFX/AUFXSystemFeedbackBus";
import { BrowserHapticsAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserHapticsAdapter";
function audioFixture() {
  const data = new Float32Array(16), source = { buffer: null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), onended: null };
  const filter = { type: "", frequency: { value: 0 }, Q: { value: 0 }, connect: vi.fn() }, gain = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
  const context = { state: "running", sampleRate: 4000, destination: {}, createBiquadFilter: () => filter, createGain: () => gain, createBuffer: vi.fn(() => ({ getChannelData: () => data })), createBufferSource: () => source, close: vi.fn(), resume: vi.fn() };
  return { context: context as unknown as AudioContext, data, source, filter, gain };
}
describe("runtime system feedback bus", () => {
  it("preserves original click envelope and filter coefficients while applying master immediately", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.75);
    try {
      const audio = audioFixture(), bus = new AUFXSystemFeedbackBus(() => audio.context); await bus.prepare(); bus.playClick(0.3);
      expect(audio.context.createBuffer).toHaveBeenCalledWith(1, 16, 4000);
      expect(audio.data[5]).toBeCloseTo(0.5 * Math.exp(-5 / 25));
      expect(audio.filter.type).toBe("bandpass"); expect(audio.filter.Q.value).toBe(8);
      expect(audio.filter.frequency.value).toBe(2600 * 1.075); expect(audio.gain.gain.value).toBe(0.15);
      bus.setMasterVolume(0.25); expect(audio.gain.gain.value).toBe(0.0375);
      bus.dispose(); await expect(bus.prepare()).rejects.toThrow("disposed");
    } finally { vi.restoreAllMocks(); }
  });
  it("does not resurrect queued feedback when disposed during audio activation", async () => {
    let release!: () => void;
    const audio = audioFixture(); Object.assign(audio.context, { state: "suspended", resume: () => new Promise<void>(resolve => { release = resolve; }) });
    const bus = new AUFXSystemFeedbackBus(() => audio.context);
    const label = { style: {}, setAttribute: vi.fn(), appendChild: vi.fn(), remove: vi.fn(), click: vi.fn() };
    const input = { style: {}, setAttribute: vi.fn() };
    const document = { body: { appendChild: vi.fn() }, createElement: (tag: string) => tag === "label" ? label : input } as unknown as Document;
    const raf = vi.fn();
    const adapter = new BrowserHapticsAdapter(bus, { navigator: null, document, requestAnimationFrame: raf });
    const pending = adapter.trigger("selection"); adapter.destroy(); release(); await pending;
    expect(audio.source.start).not.toHaveBeenCalled(); expect(raf).not.toHaveBeenCalled();
  });
});
it("schedules registered haptic audio on the same context with master gain and cancellation", async () => {
  const audio = audioFixture();
  Object.assign(audio.context, { currentTime: 10 });
  Object.assign(audio.source, { playbackRate: { value: 1 }, stop: vi.fn() });
  const bus = new AUFXSystemFeedbackBus(() => audio.context);
  const { AUFXAudioFormat, AUFXAudioPCMBuffer } = await import("../../../src/FX/AudioFX/public");
  const buffer = new AUFXAudioPCMBuffer(new AUFXAudioFormat(4000, 1), 16); buffer.frameLength = 16; buffer.setSample(0, 0, 0.8);
  const resource = await bus.registerAudioResource(buffer);
  bus.setMasterVolume(0.25); bus.playAudioResource(resource, { delay: 0.1, volume: 0.4 });
  expect(audio.source.start).toHaveBeenCalledWith(10.1, 0, 0.004);
  expect(audio.gain.gain.value).toBe(0.1);
  bus.cancelAudioResource(resource); expect((audio.source as unknown as { stop: ReturnType<typeof vi.fn> }).stop).toHaveBeenCalled();
  bus.unregisterAudioResource(resource); expect(() => bus.playAudioResource(resource)).toThrow(); bus.dispose();
});
it("plays registered HFX audio resources through the runtime bus and tears down scheduled output", async () => {
  const audio = audioFixture(); Object.assign(audio.context, { currentTime: 10 }); Object.assign(audio.source, { playbackRate: { value: 1 }, stop: vi.fn() });
  const { createRuntimeHapticsService } = await import("../../../src/SynCloudOS/HapticsFX/HapticsService");
  const { HFXHapticPattern } = await import("../../../src/FX/HapticsFX/public");
  const { AUFXAudioFormat, AUFXAudioPCMBuffer } = await import("../../../src/FX/AudioFX/public");
  const bus = new AUFXSystemFeedbackBus(() => audio.context), engine = createRuntimeHapticsService(bus, { navigator: null, document: null });
  const pcm = new AUFXAudioPCMBuffer(new AUFXAudioFormat(4000, 1), 16); pcm.frameLength = 16;
  const resource = await engine.registerAudioResource(pcm);
  const player = engine.makeAdvancedPlayer(new HFXHapticPattern([{ type: "audio", relativeTime: 0.01, audioResource: resource.id }]));
  player.start(); expect(audio.source.start).toHaveBeenCalledWith(10.01, 0, 0.004);
  engine.dispose(); expect((audio.source as unknown as { stop: ReturnType<typeof vi.fn> }).stop).toHaveBeenCalled(); bus.dispose();
});
