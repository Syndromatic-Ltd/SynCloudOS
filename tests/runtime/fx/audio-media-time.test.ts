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
import { AUFXAudioEngine } from "../../../src/FX/AudioFX/AUFXAudioEngine";
import { AUFXAudioFormat } from "../../../src/FX/AudioFX/AUFXAudioFormat";
import { AUFXAudioTime } from "../../../src/FX/AudioFX/AUFXAudioTime";
import { AUFXClockObservation } from "../../../src/FX/AudioFX/AUFXClockObservation";
import { fromMediaTime, toMediaTime } from "../../../src/FX/AudioFX/AUFXMediaTime";
import type { MEFXClock, MEFXClockReading } from "../../../src/FX/MediaFX/MEFXClock";
import { MEFXTime } from "../../../src/FX/MediaFX/MEFXTime";
import { MEFXTimebase } from "../../../src/FX/MediaFX/MEFXTimebase";
import { AudioMediaClockBridge } from "../../../src/SynCloudOS/AudioFX/AudioMediaClockBridge";
import { createAudioGraphHostService } from "../../../src/SynCloudOS/AudioFX/AudioGraphHostService";

function observation(samplePosition: number, generation = 0) {
  return new AUFXClockObservation({
    samplePosition,
    sampleRate: 48_000,
    domain: "output",
    hostAnchorSeconds: 5,
    uncertaintySeconds: 0.002,
    discontinuityGeneration: generation,
  });
}

function clockHarness() {
  let generation = 0;
  let position = MEFXTime.finite(10n, 1);
  const listeners = new Set<(reading: MEFXClockReading) => void>();
  const now = (): MEFXClockReading => Object.freeze({ position, domain: "runtime:test:monotonic", generation, uncertaintySeconds: 0.001 });
  const clock: MEFXClock = {
    now,
    subscribeDiscontinuities(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
  return {
    clock,
    setPosition(next: MEFXTime) { position = next; },
    invalidate() { generation++; const reading = now(); for (const listener of [...listeners]) listener(reading); },
  };
}

describe("AudioFX MediaFX temporal interoperability", () => {
  it("correlates nanosecond anchors with worklet sample deltas without overflowing the MediaFX scale", () => {
    const media = clockHarness();
    const stored = MEFXTime.finite(1n, 1_000_000_000); media.setPosition(stored);
    let audio = observation(0);
    const bridge = new AudioMediaClockBridge({ sampleRate: 48_000, mediaClock: media.clock, observeAudioClock: () => audio });
    try {
      const anchor = bridge.reanchor(); audio = observation(1);
      const current = bridge.currentMediaTime(anchor.generation);
      expect(current.toSeconds()).toBeCloseTo(1e-9 + 1 / 48_000, 10);
      expect(bridge.fromMediaTime(current, anchor.generation).sampleTime).toBe(1);
      expect(anchor.mediaAnchor.position.value).toMatchObject({ rounded: true });
      expect(anchor.uncertaintySeconds).toBeGreaterThan(0.003);
      expect(media.clock.now().position).toBe(stored);
      expect(stored.value).toMatchObject({ value: 1n, timescale: 1_000_000_000, rounded: false });
    } finally { bridge.dispose(); }
  });
  it("uses the same rational rate for forward/inverse conversion and invalidates silent mapping changes", () => {
    const source = clockHarness(), timebase = new MEFXTimebase(source.clock);
    timebase.setRate(3n, 2n);
    const bridge = new AudioMediaClockBridge({ sampleRate: 48_000, mediaClock: timebase, observeAudioClock: () => observation(48_000) });
    try {
      const anchor = bridge.reanchor();
      expect(bridge.toMediaTime(new AUFXAudioTime(96_000, 48_000), anchor.generation).compare(MEFXTime.finite(3n, 2))).toBe(0);
      expect(bridge.fromMediaTime(MEFXTime.finite(3n, 2), anchor.generation).sampleTime).toBe(96_000);
      expect(anchor.uncertaintySeconds).toBeCloseTo(0.004);
      timebase.setRate(2n);
      expect(() => bridge.currentMediaTime(anchor.generation)).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
      timebase.pause();
      const paused = bridge.reanchor();
      expect(bridge.toMediaTime(new AUFXAudioTime(96_000, 48_000), paused.generation).toSeconds()).toBe(0);
      expect(() => bridge.fromMediaTime(MEFXTime.finite(1n, 1), paused.generation)).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
    } finally { bridge.dispose(); timebase.dispose(); }
  });
  it.each([44_100, 48_000, 96_000])("roundtrips integer sample rate %i Hz exactly", sampleRate => {
    const audio = new AUFXAudioTime(123_456_789, sampleRate);
    const media = toMediaTime(audio);
    expect(media.value).toMatchObject({ kind: "finite", value: 123_456_789n, timescale: sampleRate, rounded: false });
    expect(fromMediaTime(media, sampleRate)).toEqual(audio);
  });

  it("requires an explicit rational rate for fractional sample rates and preserves it exactly", () => {
    const exactSampleRate = Object.freeze({ numerator: 48_000, denominator: 1_001 });
    const sampleRate = exactSampleRate.numerator / exactSampleRate.denominator;
    const audio = new AUFXAudioTime(96_000, sampleRate);
    expect(() => toMediaTime(audio)).toThrow(/rational/i);
    const media = toMediaTime(audio, { exactSampleRate });
    expect(media.compare(MEFXTime.finite(96_000n * 1_001n, 48_000))).toBe(0);
    expect(fromMediaTime(media, sampleRate, { exactSampleRate })).toEqual(audio);
  });

  it("rejects implicit fractional-frame rounding and range overflow", () => {
    const halfFrame = MEFXTime.finite(1n, 96_000);
    expect(() => fromMediaTime(halfFrame, 48_000)).toThrow(/integral|exact/i);
    expect(fromMediaTime(halfFrame, 48_000, { rounding: "nearest-even" }).sampleTime).toBe(0);
    const overflow = MEFXTime.finite(BigInt(Number.MAX_SAFE_INTEGER) + 1n, 1);
    expect(() => fromMediaTime(overflow, 1)).toThrow(RangeError);
  });

  it("invalidates correlations across audio and media discontinuities and rejects stale generations", () => {
    const media = clockHarness();
    let audio = observation(48_000, 0);
    const bridge = new AudioMediaClockBridge({
      sampleRate: 48_000,
      mediaClock: media.clock,
      observeAudioClock: () => audio,
    });
    const first = bridge.reanchor();
    expect(first.uncertaintySeconds).toBeCloseTo(0.003);
    expect(bridge.toMediaTime(new AUFXAudioTime(96_000, 48_000), first.generation).toSeconds()).toBe(11);
    expect(bridge.fromMediaTime(MEFXTime.finite(11n, 1), first.generation)).toEqual(new AUFXAudioTime(96_000, 48_000));

    audio = observation(96_000, 1);
    expect(() => bridge.toMediaTime(new AUFXAudioTime(96_000, 48_000), first.generation)).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
    media.setPosition(MEFXTime.finite(12n, 1));
    const second = bridge.reanchor();
    expect(second.generation).toBeGreaterThan(first.generation);
    expect(() => bridge.toMediaTime(new AUFXAudioTime(96_000, 48_000), first.generation)).toThrow(expect.objectContaining({ name: "InvalidStateError" }));

    media.invalidate();
    expect(bridge.correlation).toBeNull();
    expect(() => bridge.toMediaTime(new AUFXAudioTime(96_000, 48_000), second.generation)).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
    bridge.dispose();
  });

  it("does not hide a missing output clock behind a zero-valued correlation", () => {
    const media = clockHarness();
    const bridge = new AudioMediaClockBridge({ sampleRate: 48_000, mediaClock: media.clock, observeAudioClock: () => null });
    expect(() => bridge.reanchor()).toThrow(expect.objectContaining({ name: "NotSupportedError" }));
    bridge.dispose();
  });

  it("binds bridge lifetime to an engine owned by the canonical audio graph host", () => {
    const media = clockHarness();
    const output = { start: vi.fn(async () => {}), stop: vi.fn(), dispose: vi.fn(), observeClock: () => observation(48_000, 0), setOwnerPolicy: vi.fn() };
    const bus = { createGraphOutput: vi.fn(() => output) } as any;
    const host = createAudioGraphHostService(bus, new AbortController().signal);
    const engine = host.createEngine(new AUFXAudioFormat(48_000, 1));
    const bridge = host.createMediaClockBridge(engine, media.clock);
    expect(bridge.reanchor().generation).toBe(1);
    const foreign = new AUFXAudioEngine(new AUFXAudioFormat(48_000, 1));
    expect(() => host.createMediaClockBridge(foreign, media.clock)).toThrow(expect.objectContaining({ name: "InvalidAccessError" }));
    foreign.dispose();
    engine.dispose();
    expect(bridge.correlation).toBeNull();
    expect(() => bridge.reanchor()).toThrow(expect.objectContaining({ name: "AbortError" }));
    host.dispose();
  });
});
