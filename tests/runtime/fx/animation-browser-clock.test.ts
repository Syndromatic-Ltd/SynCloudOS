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
import { AFXAnimation } from "../../../src/FX/AnimationFX/AFXAnimation";
import { AFXBasicAnimation } from "../../../src/FX/AnimationFX/AFXBasicAnimation";
import { AFXLayer } from "../../../src/FX/AnimationFX/AFXLayer";
import { createBrowserAFXFrameScheduler } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter";

function browserClock() {
  let nowMs = 1000;
  let nextId = 0;
  const pending = new Map<number, FrameRequestCallback>();
  const query = Object.assign(new EventTarget(), { matches: false });
  const browserWindow = {
    performance: { now: () => nowMs },
    matchMedia: () => query,
    requestAnimationFrame(callback: FrameRequestCallback) {
      const id = ++nextId;
      pending.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id: number) {
      pending.delete(id);
    },
  } as unknown as Window;
  const browserDocument = Object.assign(new EventTarget(), {
    hidden: false,
  }) as unknown as Document;
  return {
    scheduler: createBrowserAFXFrameScheduler(browserWindow, browserDocument),
    setNow(milliseconds: number) {
      nowMs = milliseconds;
    },
    frame(timestampMs: number) {
      // Native RAF callbacks share an older timestamp, even as work advances now().
      for (const id of [...pending.keys()]) {
        const callback = pending.get(id);
        pending.delete(id);
        callback?.(timestampMs);
      }
    },
  };
}

function animatedLayer(clock: ReturnType<typeof browserClock>) {
  const layer = new AFXLayer({
    supportedProperties: ["opacity"],
    apply() {},
    attach() {},
    detach() {},
    setMask() {},
    dispose() {},
  }, clock.scheduler);
  const handle = layer.addAnimation(new AFXBasicAnimation({
    targetId: "browser-clock",
    keyPath: "opacity",
    from: 0,
    to: 1,
    animation: new AFXAnimation({ duration: 2, timing: "linear" }),
  }));
  return { layer, handle };
}

describe("browser AFX frame clock", () => {
  it.each(["start", "resume", "seek"] as const)(
    "samples and completes after %s when the RAF timestamp predates the control time",
    async (operation) => {
      const clock = browserClock();
      const { layer, handle } = animatedLayer(clock);
      try {
        if (operation !== "start") {
          clock.setNow(1250);
          clock.frame(1250);
          expect(handle.state).toBe("running");
          expect(handle.progress).toBeCloseTo(0.125);
          if (operation === "resume") {
            clock.setNow(1500);
            handle.pause();
            expect(handle.state).toBe("paused");
            expect(handle.progress).toBeCloseTo(0.25);
          }
          clock.setNow(2000);
          if (operation === "resume") handle.resume();
          else handle.seek(0.5);
        }

        clock.setNow(operation === "start" ? 1750 : 2250);
        clock.frame(operation === "start" ? 900 : 1900);
        expect(handle.state).toBe("running");
        expect(handle.progress).toBeCloseTo(0.375);
        expect(layer.presentation.opacity).toBeCloseTo(0.375);

        clock.setNow(operation === "start" ? 3000 : 3500);
        clock.frame(operation === "start" ? 2990 : 3490);
        expect(handle.state).toBe("completed");
        expect(handle.progress).toBe(1);
        expect(layer.presentation.opacity).toBe(1);
        await expect(handle.finished).resolves.toEqual({
          state: "completed",
          reduced: false,
        });
      } finally {
        layer.dispose();
      }
    },
  );

  it("keeps later callbacks current when an earlier callback seeks in the same frame", () => {
    const clock = browserClock();
    clock.scheduler.requestFrame(() => {
      clock.setNow(1750);
      handle.seek(0.5);
    });
    const { layer, handle } = animatedLayer(clock);
    try {
      clock.setNow(1500);
      clock.frame(1400);
      expect(handle.state).toBe("running");
      expect(handle.progress).toBeCloseTo(0.25);
      expect(layer.presentation.opacity).toBeCloseTo(0.25);

      clock.setNow(2000);
      clock.frame(1900);
      expect(handle.state).toBe("running");
      expect(handle.progress).toBeCloseTo(0.375);
      expect(layer.presentation.opacity).toBeCloseTo(0.375);
    } finally {
      layer.dispose();
    }
  });

  it("reports both now and callback execution time in seconds", () => {
    const clock = browserClock();
    const callback = vi.fn();
    expect(clock.scheduler.now()).toBe(1);
    clock.scheduler.requestFrame(callback);
    clock.setNow(1750);
    clock.frame(900);
    expect(clock.scheduler.now()).toBe(1.75);
    expect(callback).toHaveBeenCalledExactlyOnceWith(1.75);
  });

  it("cancels only the requested native frame callback", () => {
    const clock = browserClock();
    const cancelled = vi.fn();
    const active = vi.fn();
    const cancel = clock.scheduler.requestFrame(cancelled);
    clock.scheduler.requestFrame(active);
    cancel();
    clock.setNow(1250);
    clock.frame(1250);
    expect(cancelled).not.toHaveBeenCalled();
    expect(active).toHaveBeenCalledExactlyOnceWith(1.25);
  });
});
