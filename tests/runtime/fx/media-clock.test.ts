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

import { MEFXTime } from "../../../src/FX/MediaFX/MEFXTime";
import type { MEFXClock, MEFXClockReading } from "../../../src/FX/MediaFX/MEFXClock";
import { MEFXTimebase } from "../../../src/FX/MediaFX/MEFXTimebase";
import { createDeterministicRuntimeEnvironment } from "../../../src/SynCloudOS/AppSDK/testing/fakeAdapters";
import { MediaClockService } from "../../../src/SynCloudOS/MediaFX/MediaClockService";
import { createBrowserMonotonicNowSeconds } from "../../../src/SynCloudOS/PlatformAdapters/BrowserMediaClock";

class ManualClock implements MEFXClock {
  seconds = 0;
  generation = 0;
  readonly listeners = new Set<(reading: MEFXClockReading) => void>();

  now(): MEFXClockReading {
    return Object.freeze({
      position: MEFXTime.fromSeconds(this.seconds, 1_000_000, "nearest-even"),
      domain: "test:monotonic",
      generation: this.generation,
      uncertaintySeconds: 0,
    });
  }

  subscribeDiscontinuities(listener: (reading: MEFXClockReading) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  discontinuity(seconds = this.seconds): void {
    this.seconds = seconds;
    this.generation += 1;
    const reading = this.now();
    for (const listener of [...this.listeners]) listener(reading);
  }
}

describe("MediaFX clocks and timebases", () => {
  it("converts the browser performance clock from milliseconds to seconds once", () => {
    const now = createBrowserMonotonicNowSeconds({ now: () => 1_250 } as Pick<Performance, "now">);
    expect(now?.()).toBe(1.25);
    expect(createBrowserMonotonicNowSeconds(null)).toBeUndefined();
  });

  it("keeps deterministic wall time independent from the injected monotonic media clock", () => {
    const deterministic = createDeterministicRuntimeEnvironment({ now: 10_000 });
    expect(deterministic.environment.now()).toBe(10_000);
    expect(deterministic.environment.monotonicNowSeconds?.()).toBe(0);

    deterministic.clock.set(4_000);
    expect(deterministic.environment.now()).toBe(4_000);
    expect(deterministic.environment.monotonicNowSeconds?.()).toBe(0);

    deterministic.mediaClock.advanceSeconds(2.5);
    expect(deterministic.environment.monotonicNowSeconds?.()).toBe(2.5);
    expect(deterministic.environment.now()).toBe(4_000);
    deterministic.dispose();
  });

  it("reports unavailable without a monotonic host port and revokes observations on disposal", () => {
    const unavailable = new MediaClockService("runtime:no-media-clock" as never, undefined);
    expect(unavailable.available).toBe(false);
    expect(() => unavailable.observeClock()).toThrowError(DOMException);

    let seconds = 3.25;
    const service = new MediaClockService("runtime:media-clock" as never, () => seconds);
    const clock = service.observeClock();
    expect(clock.now().position.toSeconds()).toBeCloseTo(3.25);
    seconds = 5.5;
    expect(clock.now().position.toSeconds()).toBeCloseTo(5.5);
    service.dispose();
    expect(() => clock.now()).toThrowError(DOMException);
    expect(() => service.observeClock()).toThrowError(DOMException);
  });

  it("freezes, resumes, changes rational rate and seeks without position jumps", () => {
    const source = new ManualClock();
    const timebase = new MEFXTimebase(source, { mediaAnchor: MEFXTime.finite(10n, 1) });
    source.seconds = 5;
    expect(timebase.now().position.toSeconds()).toBe(15);

    timebase.setRate(0n, 1n);
    source.seconds = 20;
    expect(timebase.now().position.toSeconds()).toBe(15);

    timebase.setRate(2n, 1n);
    source.seconds = 22;
    expect(timebase.now().position.toSeconds()).toBe(19);

    timebase.setRate(-1n, 1n);
    source.seconds = 23;
    expect(timebase.now().position.toSeconds()).toBe(18);

    const discontinuity = vi.fn();
    timebase.subscribeDiscontinuities(discontinuity);
    const before = timebase.snapshot().generation;
    timebase.seek(MEFXTime.finite(42n, 1));
    expect(timebase.now().position.toSeconds()).toBe(42);
    expect(timebase.snapshot().generation).toBe(before + 1);
    expect(discontinuity).toHaveBeenCalledTimes(1);
  });

  it("composes nested timebases and bounds hierarchy depth", () => {
    const source = new ManualClock();
    let clock: MEFXClock = new MEFXTimebase(source, { rateNumerator: 2n, rateDenominator: 1n });
    clock = new MEFXTimebase(clock, { mediaAnchor: MEFXTime.finite(5n, 1), rateNumerator: 1n, rateDenominator: 2n });
    source.seconds = 4;
    expect(clock.now().position.toSeconds()).toBe(9);

    for (let depth = 0; depth < MEFXTimebase.maximumHierarchyDepth - 2; depth += 1) {
      clock = new MEFXTimebase(clock);
    }
    expect(() => new MEFXTimebase(clock)).toThrow(/depth|hierarchy/i);
  });

  it("drops a scheduled callback after a seek changes generation", () => {
    const source = new ManualClock();
    let scheduled: (() => void) | undefined;
    const clearTimeout = vi.fn();
    const timebase = new MEFXTimebase(source, {
      scheduler: {
        setTimeout(callback) { scheduled = callback; return 17; },
        clearTimeout,
      },
    });
    const fired = vi.fn();
    timebase.scheduleAt(MEFXTime.finite(5n, 1), fired);
    expect(scheduled).toBeTypeOf("function");
    timebase.seek(MEFXTime.finite(20n, 1));
    scheduled?.();
    expect(fired).not.toHaveBeenCalled();
    expect(clearTimeout).toHaveBeenCalled();
  });

  it("invalidates correlations when the source clock reports a discontinuity", () => {
    const source = new ManualClock();
    const timebase = new MEFXTimebase(source);
    const listener = vi.fn();
    timebase.subscribeDiscontinuities(listener);
    const before = timebase.snapshot().generation;
    source.discontinuity(100);
    expect(timebase.snapshot().generation).toBe(before + 1);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
