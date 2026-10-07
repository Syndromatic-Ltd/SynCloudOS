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
import type { MEFXClock, MEFXClockReading } from "../../../src/FX/MediaFX/MEFXClock";
import { MEFXSampleTimingInfo } from "../../../src/FX/MediaFX/MEFXSampleTimingInfo";
import { MEFXTime } from "../../../src/FX/MediaFX/MEFXTime";
import { MEFXTimebase } from "../../../src/FX/MediaFX/MEFXTimebase";
import { VFXFrame } from "../../../src/FX/VideoFX/VFXFrame";
import { VFXPixelBuffer } from "../../../src/FX/VideoFX/VFXPixelBuffer";
import { VFXVideoFormat } from "../../../src/FX/VideoFX/VFXVideoFormat";
import { createMountedVideoClient } from "../../../src/SynCloudOS/AppSDK/mountedVideoClient";
import { AVPresentationCoordinator } from "../../../src/SynCloudOS/VideoFX/AVPresentationCoordinator";
import type { VideoCaptureService } from "../../../src/SynCloudOS/VideoFX/VideoCaptureService";

class Clock implements MEFXClock {
  seconds = 0;
  now(): MEFXClockReading {
    return Object.freeze({
      position: MEFXTime.fromSeconds(this.seconds, 1_000_000, "nearest-even"),
      domain: "test:silent-video",
      generation: 0,
      uncertaintySeconds: 0,
    });
  }
  subscribeDiscontinuities(): () => void { return () => {}; }
}

function frame(seconds: number): VFXFrame {
  const format = new VFXVideoFormat({ codedWidth: 1, codedHeight: 1, pixelFormat: "rgba8", colourSpace: "srgb" });
  const pixels = new VFXPixelBuffer(format, new Uint8Array([10, 20, 30, 255]));
  try {
    return new VFXFrame({ pixels, timing: new MEFXSampleTimingInfo({
      presentationTime: MEFXTime.fromSeconds(seconds, 1_000_000, "nearest-even"),
      duration: MEFXTime.finite(1n, 24),
    }) });
  } finally { pixels.close(); }
}

describe("silent mounted video presentation", () => {
  it("uses the MediaFX clock without audio anchoring and retains queue/drop rules", async () => {
    const clock = new Clock();
    const timebase = new MEFXTimebase(clock);
    const seen: number[] = [];
    const coordinator = new AVPresentationCoordinator({
      mode: "media", timebase, maximumQueuedFrames: 1, toleranceSeconds: 0.02,
      present: (value) => { seen.push(value.timing.presentationTime.toSeconds()); },
    });
    const first = frame(0);
    const early = frame(0.1);
    try {
      expect(coordinator.enqueue(first)).toBe("queued");
      expect(coordinator.enqueue(early)).toBe("queue-full");
      expect(await coordinator.tick()).toMatchObject({ action: "present" });
      expect(seen).toEqual([0]);
      expect(coordinator.enqueue(early)).toBe("queued");
      expect(await coordinator.tick()).toMatchObject({ action: "wait", reason: "frame-early" });
      clock.seconds = 0.2;
      expect(await coordinator.tick()).toMatchObject({ action: "drop" });
      expect(coordinator.diagnostics).toMatchObject({ queuedFrames: 0, droppedFrames: 1, audioTransportPending: false });
      expect(() => coordinator.reanchorAudio()).toThrow(expect.objectContaining({ name: "NotSupportedError" }));
    } finally { first.close(); early.close(); coordinator.dispose(); timebase.dispose(); }
  });

  it("invalidates a borrowed frame on seek and releases it after the callback settles", async () => {
    const clock = new Clock();
    const timebase = new MEFXTimebase(clock);
    let settle!: () => void;
    const pending = new Promise<void>((resolve) => { settle = resolve; });
    let presentationSignal: AbortSignal | undefined;
    const coordinator = new AVPresentationCoordinator({
      mode: "media", timebase,
      present: async (_value, context) => { presentationSignal = context.signal; await pending; },
    });
    const value = frame(0);
    try {
      expect(coordinator.enqueue(value)).toBe("queued");
      const tick = coordinator.tick();
      expect(presentationSignal?.aborted).toBe(false);
      await coordinator.seek(MEFXTime.finite(1n, 1));
      expect(presentationSignal?.aborted).toBe(true);
      expect(coordinator.diagnostics.inFlightFrames).toBe(1);
      settle();
      expect(await tick).toMatchObject({ action: "drop", reason: "presentation-invalidated" });
      expect(coordinator.diagnostics.inFlightFrames).toBe(0);
    } finally { settle(); value.close(); coordinator.dispose(); timebase.dispose(); }
  });

  it("pauses, resumes, changes rate and wraps a silent media loop on its own clock", async () => {
    const clock = new Clock();
    const timebase = new MEFXTimebase(clock);
    const coordinator = new AVPresentationCoordinator({ mode: "media", timebase, present() {} });
    const value = frame(0);
    try {
      await coordinator.pause();
      expect(timebase.snapshot().rateNumerator).toBe(0n);
      expect(coordinator.enqueue(value)).toBe("queued");
      expect(await coordinator.tick()).toMatchObject({ action: "wait", reason: "paused" });
      await coordinator.play();
      expect(await coordinator.tick()).toMatchObject({ action: "present" });
      await coordinator.setRate(2n);
      expect(timebase.snapshot().rateNumerator).toBe(2n);
      coordinator.setLoop({ start: MEFXTime.finite(0n, 1), end: MEFXTime.finite(1n, 1) });
      clock.seconds = 0.6;
      expect(await coordinator.tick()).toMatchObject({ action: "wait", reason: "loop-boundary" });
      expect(timebase.now().position.toSeconds()).toBe(0);
    } finally { value.close(); coordinator.dispose(); timebase.dispose(); }
  });

  it("admits five decoders plus four silent coordinators and releases all on mount abort", () => {
    const mount = new AbortController();
    const decoderDispose = vi.fn();
    const service = {
      createDecoder: () => ({
        state: "configured", generation: 0, pendingOutputCount: 0,
        configure() {}, decode() {}, async flush() {}, reset() {}, dispose: decoderDispose,
      }),
    } as unknown as VideoCaptureService;
    const video = createMountedVideoClient(service, mount.signal, () => [], () => true,
      undefined, undefined, undefined, undefined, { maximumDecoderSessions: 5 });
    const timebase = new MEFXTimebase(new Clock());
    const decoders = Array.from({ length: 5 }, () => video.createDecoder({ output() {} }));
    const coordinators = Array.from({ length: 4 }, () =>
      video.createPresentationCoordinator({ mode: "media", timebase, present() {} }));
    expect(() => video.createDecoder({ output() {} })).toThrow(expect.objectContaining({ name: "QuotaExceededError" }));
    expect(() => video.createPresentationCoordinator({ mode: "media", timebase, present() {} }))
      .toThrow(expect.objectContaining({ name: "QuotaExceededError" }));
    mount.abort();
    expect(decoderDispose).toHaveBeenCalledTimes(5);
    const afterAbort = frame(0);
    try { expect(() => coordinators[0]!.enqueue(afterAbort)).toThrow(); }
    finally { afterAbort.close(); }
    for (const coordinator of coordinators) coordinator.dispose();
    for (const decoder of decoders) decoder.dispose();
    timebase.dispose();
  });
});
