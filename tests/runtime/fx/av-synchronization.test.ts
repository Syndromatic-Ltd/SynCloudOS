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
import { AUFXAudioPCMBuffer } from "../../../src/FX/AudioFX/AUFXAudioPCMBuffer";
import { AUFXAudioPlayerNode } from "../../../src/FX/AudioFX/AUFXAudioPlayerNode";
import { AUFXClockObservation } from "../../../src/FX/AudioFX/AUFXClockObservation";
import type { MEFXClock, MEFXClockReading } from "../../../src/FX/MediaFX/MEFXClock";
import { MEFXSampleTimingInfo } from "../../../src/FX/MediaFX/MEFXSampleTimingInfo";
import { MEFXTime } from "../../../src/FX/MediaFX/MEFXTime";
import { MEFXTimebase } from "../../../src/FX/MediaFX/MEFXTimebase";
import { VFXFrame } from "../../../src/FX/VideoFX/VFXFrame";
import { VFXPixelBuffer } from "../../../src/FX/VideoFX/VFXPixelBuffer";
import { VFXVideoFormat } from "../../../src/FX/VideoFX/VFXVideoFormat";
import { AudioMediaClockBridge } from "../../../src/SynCloudOS/AudioFX/AudioMediaClockBridge";
import { createAudioGraphHostService } from "../../../src/SynCloudOS/AudioFX/AudioGraphHostService";
import { createMountedVideoClient } from "../../../src/SynCloudOS/AppSDK/mountedVideoClient";
import { BrowserVideoCaptureAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserVideoCaptureAdapter";
import { AVPresentationCoordinator } from "../../../src/SynCloudOS/VideoFX/AVPresentationCoordinator";
import { VideoCaptureService } from "../../../src/SynCloudOS/VideoFX/VideoCaptureService";

class ManualClock implements MEFXClock {
  seconds = 0;
  readonly listeners = new Set<(reading: MEFXClockReading) => void>();

  now(): MEFXClockReading {
    return Object.freeze({
      position: MEFXTime.fromSeconds(this.seconds, 1_000_000, "nearest-even"),
      domain: "test:av",
      generation: 0,
      uncertaintySeconds: 0,
    });
  }

  subscribeDiscontinuities(listener: (reading: MEFXClockReading) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function makeFrame(seconds: number): VFXFrame {
  const format = new VFXVideoFormat({
    codedWidth: 1,
    codedHeight: 1,
    pixelFormat: "rgba8",
    colourSpace: "srgb",
  });
  const pixels = new VFXPixelBuffer(format, new Uint8Array([32, 64, 96, 255]));
  try {
    return new VFXFrame({
      pixels,
      timing: new MEFXSampleTimingInfo({
        presentationTime: MEFXTime.fromSeconds(seconds, 1_000_000, "nearest-even"),
        duration: MEFXTime.finite(1n, 30),
      }),
    });
  } finally {
    pixels.close();
  }
}

function createHarness(present?: ConstructorParameters<typeof AVPresentationCoordinator>[0]["present"]) {
  const source = new ManualClock();
  const timebase = new MEFXTimebase(source);
  let audioSeconds = 0;
  let audioGeneration = 0;
  let audioAvailable = true;
  const bridge = new AudioMediaClockBridge({
    sampleRate: 48_000,
    mediaClock: timebase,
    observeAudioClock: () => audioAvailable ? new AUFXClockObservation({
      samplePosition: Math.round(audioSeconds * 48_000),
      sampleRate: 48_000,
      domain: "output",
      hostAnchorSeconds: audioSeconds,
      uncertaintySeconds: 0,
      discontinuityGeneration: audioGeneration,
    }) : null,
  });
  const presented: number[] = [];
  const coordinator = new AVPresentationCoordinator({
    timebase,
    audioBridge: bridge,
    toleranceSeconds: 0.02,
    maximumQueuedFrames: 3,
    present: present ?? (async frame => { presented.push(frame.timing.presentationTime.toSeconds()); }),
  });
  return {
    source,
    timebase,
    bridge,
    coordinator,
    presented,
    setAudio(seconds: number) { audioSeconds = seconds; },
    changeAudioRoute(seconds: number) { audioSeconds = seconds; audioGeneration += 1; },
    suspendAudio() { audioAvailable = false; audioGeneration += 1; },
    resumeAudio(seconds: number) { audioSeconds = seconds; audioAvailable = true; audioGeneration += 1; },
  };
}

describe("VideoFX A/V presentation coordination", () => {
  it("has a coordinator implementation boundary", () => {
    expect(AVPresentationCoordinator).toBeTypeOf("function");
  });

  it("presents on-time frames, waits for early frames and drops late frames without rewriting PTS", async () => {
    const h = createHarness();
    h.coordinator.reanchorAudio();
    const onTime = makeFrame(0);
    const early = makeFrame(0.05);
    const late = makeFrame(0.01);
    const earlyPTS = early.timing.presentationTime;

    expect(h.coordinator.enqueue(onTime)).toBe("queued");
    expect(await h.coordinator.tick()).toMatchObject({ action: "present", skewSeconds: 0 });
    expect(h.coordinator.enqueue(early)).toBe("queued");
    expect(await h.coordinator.tick()).toMatchObject({ action: "wait" });
    expect(early.timing.presentationTime).toBe(earlyPTS);

    h.setAudio(0.05);
    expect(await h.coordinator.tick()).toMatchObject({ action: "present" });
    h.setAudio(0.10);
    expect(h.coordinator.enqueue(late)).toBe("queued");
    expect(await h.coordinator.tick()).toMatchObject({ action: "drop" });
    expect(h.coordinator.diagnostics.droppedFrames).toBe(1);
    expect(h.presented).toEqual([0, 0.05]);

    onTime.close(); early.close(); late.close();
    h.coordinator.dispose(); h.bridge.dispose(); h.timebase.dispose();
  });

  it("bounds queued frame leases while a slow renderer is in flight", async () => {
    let resolvePresent!: () => void;
    const h = createHarness(() => new Promise<void>(resolve => { resolvePresent = resolve; }));
    h.coordinator.reanchorAudio();
    const first = makeFrame(0), second = makeFrame(0), third = makeFrame(0), fourth = makeFrame(0), overflow = makeFrame(0);
    expect(h.coordinator.enqueue(first)).toBe("queued");
    const presenting = h.coordinator.tick();
    expect(h.coordinator.enqueue(second)).toBe("queued");
    expect(h.coordinator.enqueue(third)).toBe("queued");
    expect(h.coordinator.enqueue(fourth)).toBe("queued");
    expect(h.coordinator.enqueue(overflow)).toBe("queue-full");
    expect(h.coordinator.diagnostics.queuedFrames).toBe(3);
    resolvePresent();
    await presenting;
    first.close(); second.close(); third.close(); fourth.close(); overflow.close();
    h.coordinator.dispose(); h.bridge.dispose(); h.timebase.dispose();
  });

  it("invalidates pre-seek frames and audio correlation together", async () => {
    const h = createHarness();
    h.coordinator.reanchorAudio();
    const stale = makeFrame(1);
    h.coordinator.enqueue(stale);
    const generation = h.coordinator.diagnostics.generation;
    h.coordinator.seek(MEFXTime.finite(5n, 1));
    expect(h.coordinator.diagnostics.generation).toBeGreaterThan(generation);
    expect(h.coordinator.diagnostics.queuedFrames).toBe(0);
    expect(h.bridge.correlation).toBeNull();
    expect(await h.coordinator.tick()).toMatchObject({ action: "idle" });
    stale.close();
    h.coordinator.dispose(); h.bridge.dispose(); h.timebase.dispose();
  });

  it("serializes concurrent ticks without freeing queue capacity for more in-flight leases", async () => {
    const borrowed: VFXFrame[] = [];
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const h = createHarness(async frame => { borrowed.push(frame); await pending; });
    const frames = Array.from({ length: 5 }, () => makeFrame(0));
    let first: ReturnType<typeof h.coordinator.tick> | undefined;
    let second: ReturnType<typeof h.coordinator.tick> | undefined;
    try {
      h.coordinator.reanchorAudio();
      h.coordinator.enqueue(frames[0]!);
      first = h.coordinator.tick();
      for (const frame of frames.slice(1, 4)) expect(h.coordinator.enqueue(frame)).toBe("queued");
      second = h.coordinator.tick();
      expect(borrowed).toHaveLength(1);
      expect(h.coordinator.enqueue(frames[4]!)).toBe("queue-full");
      expect(await second).toMatchObject({ action: "wait", reason: "renderer-busy" });
      expect(h.coordinator.diagnostics).toMatchObject({ queuedFrames: 3, inFlightFrames: 1 });
      h.coordinator.end();
      expect(await h.coordinator.tick()).toMatchObject({ action: "wait", reason: "renderer-busy" });
      expect(borrowed[0]!.closed).toBe(false);
      release();
      expect(await first).toMatchObject({ action: "present" });
      expect(borrowed[0]!.closed).toBe(true);
    } finally {
      release(); await Promise.allSettled([first, second]);
      frames.forEach(frame => frame.close());
      h.coordinator.dispose(); h.bridge.dispose(); h.timebase.dispose();
    }
  });

  it.each(["seek", "dispose", "pause", "reanchor"] as const)("fences a pending renderer on %s without closing its borrowed frame before settlement", async operation => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    let borrowed!: VFXFrame;
    let signal: AbortSignal | undefined;
    const committed: number[] = [];
    const h = createHarness(async (frame, context) => {
      borrowed = frame;
      signal = context?.signal;
      await pending;
      if (!signal?.aborted) committed.push(frame.timing.presentationTime.toSeconds());
    });
    const frame = makeFrame(0);
    const storedPTS = frame.timing.presentationTime;
    let presenting: ReturnType<typeof h.coordinator.tick> | undefined;
    try {
      h.coordinator.reanchorAudio(); h.coordinator.enqueue(frame);
      presenting = h.coordinator.tick();
      if (operation === "seek") h.coordinator.seek(MEFXTime.finite(5n, 1));
      else if (operation === "pause") h.coordinator.pause();
      else if (operation === "reanchor") h.coordinator.reanchorAudio();
      else h.coordinator.dispose();
      expect(signal?.aborted).toBe(true);
      expect(borrowed.closed).toBe(false);
      expect(borrowed.timing.presentationTime).toBe(storedPTS);
      expect(borrowed.toGFXImage().width).toBe(1);
      release();
      expect(await presenting).toMatchObject({ action: "drop", reason: "presentation-invalidated" });
      expect(committed).toEqual([]);
      expect(borrowed.closed).toBe(true);
      expect(frame.closed).toBe(false);
    } finally {
      release(); await Promise.allSettled([presenting]); frame.close();
      h.coordinator.dispose(); h.bridge.dispose(); h.timebase.dispose();
    }
  });

  it("never reports present for an obsolete callback that ignores cancellation", async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const h = createHarness(() => pending);
    const frame = makeFrame(0);
    h.coordinator.reanchorAudio(); h.coordinator.enqueue(frame);
    const presenting = h.coordinator.tick();
    h.coordinator.seek(MEFXTime.finite(5n, 1));
    release();
    try {
      expect(await presenting).toMatchObject({ action: "drop", reason: "presentation-invalidated" });
      expect(h.coordinator.diagnostics).toMatchObject({ inFlightFrames: 0, droppedFrames: 1 });
    } finally {
      frame.close(); h.coordinator.dispose(); h.bridge.dispose(); h.timebase.dispose();
    }
  });

  it("closes a failed renderer's borrowed frame and admits a subsequent presentation", async () => {
    const failure = new Error("renderer failed");
    const borrowed: VFXFrame[] = [];
    const h = createHarness(frame => {
      borrowed.push(frame);
      if (borrowed.length === 1) throw failure;
    });
    const frame = makeFrame(0);
    try {
      h.coordinator.reanchorAudio(); h.coordinator.enqueue(frame);
      await expect(h.coordinator.tick()).rejects.toBe(failure);
      expect(borrowed[0]!.closed).toBe(true);
      expect(h.coordinator.diagnostics.inFlightFrames).toBe(0);
      h.coordinator.enqueue(frame);
      expect(await h.coordinator.tick()).toMatchObject({ action: "present" });
      expect(borrowed[1]!.closed).toBe(true);
    } finally {
      frame.close(); h.coordinator.dispose(); h.bridge.dispose(); h.timebase.dispose();
    }
  });

  it("does not acknowledge presentation if the audio route changes while the renderer is pending", async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const h = createHarness(() => pending);
    const frame = makeFrame(0);
    h.coordinator.reanchorAudio(); h.coordinator.enqueue(frame);
    const presenting = h.coordinator.tick();
    h.changeAudioRoute(1);
    release();
    try { expect(await presenting).toMatchObject({ action: "drop", reason: "presentation-invalidated" }); }
    finally { frame.close(); h.coordinator.dispose(); h.bridge.dispose(); h.timebase.dispose(); }
  });

  it("does not present or drop queued frames after pause and explicit audio reanchor", async () => {
    const h = createHarness();
    const frame = makeFrame(0.1);
    try {
      h.coordinator.reanchorAudio(); h.coordinator.enqueue(frame);
      h.coordinator.pause(); h.coordinator.reanchorAudio();
      h.source.seconds = 1; h.setAudio(1);
      expect(await h.coordinator.tick()).toMatchObject({ action: "wait", reason: "paused" });
      expect(h.coordinator.diagnostics).toMatchObject({ queuedFrames: 1, droppedFrames: 0 });
      expect(h.presented).toEqual([]);
      h.coordinator.play();
      expect(h.bridge.correlation).toBeNull();
      h.coordinator.reanchorAudio();
      h.setAudio(1.1);
      expect(await h.coordinator.tick()).toMatchObject({ action: "present", skewSeconds: 0 });
    } finally {
      frame.close(); h.coordinator.dispose(); h.bridge.dispose(); h.timebase.dispose();
    }
  });

  it.each([0, 1])("wraps automatically at loop end with %i queued frames and invalidates the old cycle", async queued => {
    const h = createHarness();
    const frame = makeFrame(4);
    try {
      h.coordinator.setLoop({ start: MEFXTime.finite(2n, 1), end: MEFXTime.finite(4n, 1) });
      h.coordinator.seek(MEFXTime.finite(2n, 1));
      h.coordinator.reanchorAudio();
      if (queued) h.coordinator.enqueue(frame);
      h.setAudio(2);
      expect(await h.coordinator.tick()).toMatchObject({ action: "wait", reason: "loop-boundary" });
      expect(h.timebase.now().position.toSeconds()).toBe(2);
      expect(h.coordinator.diagnostics.queuedFrames).toBe(0);
      expect(h.bridge.correlation).toBeNull();
      expect(h.presented).toEqual([]);
    } finally {
      frame.close(); h.coordinator.dispose(); h.bridge.dispose(); h.timebase.dispose();
    }
  });

  it("presents the 1.5-second frame after one output second at rate 3/2 (audio bridge integration)", async () => {
    const h = createHarness();
    const frame = makeFrame(1.5);
    try {
      h.coordinator.setRate(3n, 2n); h.coordinator.reanchorAudio();
      h.coordinator.enqueue(frame);
      h.source.seconds = 1; h.setAudio(1);
      expect(h.timebase.now().position.toSeconds()).toBe(1.5);
      expect(await h.coordinator.tick()).toMatchObject({ action: "present", skewSeconds: 0 });
      expect(h.presented).toEqual([1.5]);
    } finally {
      frame.close(); h.coordinator.dispose(); h.bridge.dispose(); h.timebase.dispose();
    }
  });

  it("keeps a paused bridge mapping fixed even as the output device clock advances (audio bridge integration)", () => {
    const h = createHarness();
    try {
      h.coordinator.pause();
      const generation = h.coordinator.reanchorAudio();
      h.source.seconds = 1; h.setAudio(1);
      expect(h.bridge.currentMediaTime(generation).toSeconds()).toBe(0);
    } finally { h.coordinator.dispose(); h.bridge.dispose(); h.timebase.dispose(); }
  });

  it("handles pause, rate, loop, audio suspension and end-of-stream", async () => {
    const h = createHarness();
    h.coordinator.pause();
    expect(h.timebase.snapshot().rateNumerator).toBe(0n);
    h.coordinator.play();
    h.coordinator.setRate(3n, 2n);
    expect(h.timebase.snapshot()).toMatchObject({ rateNumerator: 3n, rateDenominator: 2n });
    h.coordinator.setLoop({ start: MEFXTime.finite(2n, 1), end: MEFXTime.finite(4n, 1) });
    h.coordinator.seek(MEFXTime.finite(4n, 1));
    expect(h.timebase.now().position.toSeconds()).toBe(2);
    h.coordinator.reanchorAudio();
    const current = makeFrame(2);
    h.coordinator.enqueue(current);
    h.suspendAudio();
    expect(await h.coordinator.tick()).toMatchObject({ action: "wait", reason: "audio-discontinuity" });
    h.resumeAudio(2);
    h.coordinator.reanchorAudio();
    expect(await h.coordinator.tick()).toMatchObject({ action: "present" });
    h.coordinator.end();
    expect(await h.coordinator.tick()).toMatchObject({ action: "end-of-stream" });
    current.close();
    h.coordinator.dispose(); h.bridge.dispose(); h.timebase.dispose();
  });

  it("invalidates an output-route generation change without discarding stored frame timestamps", async () => {
    const h = createHarness();
    h.coordinator.reanchorAudio();
    const frame = makeFrame(0);
    const storedPTS = frame.timing.presentationTime;
    h.coordinator.enqueue(frame);
    h.changeAudioRoute(0);
    expect(await h.coordinator.tick()).toMatchObject({ action: "wait", reason: "audio-discontinuity" });
    expect(frame.timing.presentationTime).toBe(storedPTS);
    expect(h.bridge.correlation).toBeNull();
    h.coordinator.reanchorAudio();
    expect(await h.coordinator.tick()).toMatchObject({ action: "present", skewSeconds: 0 });
    frame.close();
    h.coordinator.dispose(); h.bridge.dispose(); h.timebase.dispose();
  });

  it("produces an exact deterministic offline timeline and releases all clock listeners", async () => {
    const h = createHarness();
    h.coordinator.reanchorAudio();
    const positions = [0, 1 / 30, 2 / 30];
    const frames = positions.map(makeFrame);
    for (const frame of frames) expect(h.coordinator.enqueue(frame)).toBe("queued");
    for (const position of positions) {
      h.setAudio(position);
      expect(await h.coordinator.tick()).toMatchObject({ action: "present" });
    }
    expect(h.presented).toHaveLength(3);
    expect(h.presented[0]).toBe(0);
    expect(h.presented[1]).toBeCloseTo(1 / 30, 6);
    expect(h.presented[2]).toBeCloseTo(2 / 30, 6);
    expect(h.coordinator.diagnostics).toMatchObject({ queuedFrames: 0, droppedFrames: 0 });
    h.coordinator.end();
    expect(await h.coordinator.tick()).toMatchObject({ action: "end-of-stream" });
    for (const frame of frames) frame.close();
    h.coordinator.dispose();
    h.bridge.dispose();
    h.timebase.dispose();
    expect(h.source.listeners.size).toBe(0);
  });

  it.each([
    { operation: "pause", expected: [0, 0, 0, 0] },
    { operation: "play", expected: [1, 2, 3, 4].map(value => value / 64) },
    { operation: "seek", expected: [17, 18, 19, 20].map(value => value / 64) },
    { operation: "rate", expected: [1, 3, 5, 7].map(value => value / 64) },
    { operation: "loop", expected: [9, 10, 11, 12].map(value => value / 64) },
  ] as const)("synchronizes rendered PCM on $operation (mounted audio transport integration)", async ({ operation, expected }) => {
    const runtime = new AbortController();
    const format = new AUFXAudioFormat(8, 1);
    let outputSamples = 0;
    const output = {
      start: vi.fn(async () => {}), stop: vi.fn(), dispose: vi.fn(), setOwnerPolicy: vi.fn(),
      observeClock: () => new AUFXClockObservation({
        samplePosition: outputSamples, sampleRate: 8, domain: "output",
        hostAnchorSeconds: 0, uncertaintySeconds: 0, discontinuityGeneration: 0,
      }),
    };
    const audioHost = createAudioGraphHostService({ createGraphOutput: () => output } as any, runtime.signal);
    const videoService = new VideoCaptureService(new BrowserVideoCaptureAdapter({ mediaDevices: null }));
    const audioCapability = Object.freeze({});
    const mounted = createMountedVideoClient(videoService, runtime.signal, () => [], () => true, "owner", Object.freeze({}), audioHost, audioCapability);
    const engine = audioHost.createEngine(format, undefined, "owner", audioCapability);
    const player = new AUFXAudioPlayerNode(format);
    const pcm = new AUFXAudioPCMBuffer(format, 32);
    pcm.frameLength = 32;
    for (let index = 0; index < 32; index++) pcm.setSample(0, index, (index + 1) / 64);
    engine.attach(player); engine.connect(player, engine.mainMixerNode);
    player.scheduleBuffer(pcm); player.play();
    const timebase = new MEFXTimebase(new ManualClock());
    const coordinator = mounted.createPresentationCoordinator({ audioEngine: engine, timebase, present: () => {} });
    try {
      if (operation === "pause") coordinator.pause();
      else if (operation === "play") {
        player.pause(); timebase.pause(); coordinator.play();
      }
      else if (operation === "seek") coordinator.seek(MEFXTime.finite(2n, 1));
      else if (operation === "loop") {
        // Align the initial content positions independently, then let the
        // coordinator own the automatic wrap from 2 seconds back to 1.
        player.seek(1.5); timebase.seek(MEFXTime.finite(3n, 2));
        coordinator.setLoop({ start: MEFXTime.finite(1n, 1), end: MEFXTime.finite(2n, 1) });
        coordinator.reanchorAudio();
        await engine.renderOffline(4); outputSamples += 4;
        expect(await coordinator.tick()).toMatchObject({ action: "wait", reason: "loop-boundary" });
      }
      else coordinator.setRate(2n);
      // Render actual scheduled content. A timebase snapshot or a silent mixer
      // cannot prove that the corresponding audio transport changed.
      const rendered = await engine.renderOffline(4);
      expect(Array.from({ length: 4 }, (_, index) => rendered.getSample(0, index))).toEqual(expected);
    } finally {
      coordinator.dispose(); engine.dispose(); timebase.dispose(); audioHost.dispose(); videoService.dispose(); runtime.abort();
    }
  });

  it("creates synchronization through the mounted video scope and rejects a foreign audio engine", () => {
    const runtime = new AbortController();
    const output = {
      start: vi.fn(async () => {}), stop: vi.fn(), dispose: vi.fn(), setOwnerPolicy: vi.fn(),
      observeClock: () => new AUFXClockObservation({
        samplePosition: 0, sampleRate: 48_000, domain: "output",
        hostAnchorSeconds: 0, uncertaintySeconds: 0, discontinuityGeneration: 0,
      }),
    };
    const audioHost = createAudioGraphHostService({ createGraphOutput: vi.fn(() => output) } as any, runtime.signal);
    const videoService = new VideoCaptureService(new BrowserVideoCaptureAdapter({ mediaDevices: null }));
    const audioCapability = Object.freeze({});
    const mounted = createMountedVideoClient(videoService, runtime.signal, () => [], () => true, "owner", Object.freeze({}), audioHost, audioCapability);
    const ownedEngine = audioHost.createEngine(new AUFXAudioFormat(48_000, 1), undefined, "owner", audioCapability);
    const foreignEngine = new AUFXAudioEngine(new AUFXAudioFormat(48_000, 1));
    const timebase = new MEFXTimebase(new ManualClock());
    const coordinator = mounted.createPresentationCoordinator({ audioEngine: ownedEngine, timebase, present: async () => {} });
    expect(coordinator.reanchorAudio()).toBeGreaterThan(0);
    expect(() => mounted.createPresentationCoordinator({ audioEngine: foreignEngine, timebase, present: async () => {} }))
      .toThrow(expect.objectContaining({ name: "InvalidAccessError" }));
    coordinator.dispose(); foreignEngine.dispose(); ownedEngine.dispose(); timebase.dispose(); audioHost.dispose(); videoService.dispose(); runtime.abort();
  });
});
