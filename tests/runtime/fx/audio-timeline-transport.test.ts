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
import { createAudioGraphHostService } from "../../../src/SynCloudOS/AudioFX/AudioGraphHostService";
import { AUFXClockObservation } from "../../../src/FX/AudioFX/AUFXClockObservation";
import { MEFXMonotonicClock } from "../../../src/FX/MediaFX/MEFXClock";
import { MEFXTimebase } from "../../../src/FX/MediaFX/MEFXTimebase";
import { MEFXTime } from "../../../src/FX/MediaFX/MEFXTime";
import { AudioMediaClockBridge } from "../../../src/SynCloudOS/AudioFX/AudioMediaClockBridge";
import { AVPresentationCoordinator } from "../../../src/SynCloudOS/VideoFX/AVPresentationCoordinator";
import type { AUFXAudioPlanAcknowledgement } from "../../../src/FX/AudioFX/AUFXAudioTimelineTransport";

function playerGraph(engine = new AUFXAudioEngine(new AUFXAudioFormat(8, 1))) {
  const player = new AUFXAudioPlayerNode(engine.format);
  const pcm = new AUFXAudioPCMBuffer(engine.format, 4); pcm.frameLength = 4;
  [0.25, 0.5, 0.75, 1].forEach((sample, frame) => pcm.setSample(0, frame, sample));
  engine.attach(player); engine.connect(player, engine.mainMixerNode);
  const completed = vi.fn(); const schedule = player.scheduleBuffer(pcm, 0, false, completed); player.play();
  return { engine, player, completed, schedule };
}

describe("owned AudioFX timeline transport", () => {
  it("retains completed timeline content for repeated seeks without repeating completion callbacks", async () => {
    const h = playerGraph(), transport = h.engine.createTimelineTransport();
    try {
      await h.engine.renderOffline(4);
      expect(await h.schedule.completed).toMatchObject({ status: "rendered" });
      for (let cycle = 0; cycle < 3; cycle++) {
        await transport.apply({ kind: "seek", positionSeconds: 0 });
        const pcm = await h.engine.renderOffline(4);
        expect(Array.from({ length: 4 }, (_, frame) => pcm.getSample(0, frame))).toEqual([0.25, 0.5, 0.75, 1]);
      }
      expect(h.completed).toHaveBeenCalledTimes(1);
    } finally { transport.dispose(); h.engine.dispose(); }
  });

  it("requires explicit selection for multiple players and leaves an unrelated player running", async () => {
    const h = playerGraph(), second = playerGraph(h.engine);
    try {
      expect(() => h.engine.createTimelineTransport()).toThrow(expect.objectContaining({ name: "NotSupportedError" }));
      const transport = h.engine.createTimelineTransport([h.player]);
      expect(() => h.engine.createTimelineTransport([h.player])).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
      await transport.apply({ kind: "pause" });
      expect(h.player.isPlaying).toBe(false); expect(second.player.isPlaying).toBe(true);
      const pcm = await h.engine.renderOffline(2);
      expect([pcm.getSample(0, 0), pcm.getSample(0, 1)]).toEqual([0.25, 0.5]);
      transport.dispose();
      expect(second.player.isPlaying).toBe(true);
    } finally { h.engine.dispose(); }
  });

  it("rejects a foreign player's selection and unsupported reverse rate without changing playback", () => {
    const h = playerGraph(), foreign = playerGraph();
    try {
      expect(() => h.engine.createTimelineTransport([foreign.player])).toThrow(expect.objectContaining({ name: "InvalidAccessError" }));
      const transport = h.engine.createTimelineTransport();
      expect(() => transport.apply({ kind: "rate", rate: -1 })).toThrow(expect.objectContaining({ name: "NotSupportedError" }));
      expect(h.player.playbackRate).toBe(1); expect(h.player.currentTime).toBe(0); expect(h.player.isPlaying).toBe(true);
      transport.dispose();
    } finally { h.engine.dispose(); foreign.engine.dispose(); }
  });

  it("revokes the transport when its engine is disposed", () => {
    const h = playerGraph(), transport = h.engine.createTimelineTransport();
    h.engine.dispose();
    expect(transport.signal.aborted).toBe(true);
    expect(() => transport.apply({ kind: "play", rate: 1 })).toThrow(expect.objectContaining({ name: "AbortError" }));
  });

  it("revokes the timeline when the native output stops independently", async () => {
    let stopped!: (error?: unknown) => void;
    const failure = new Error("output disconnected");
    const output = { start: vi.fn(async (_format, _source, onStopped) => { stopped = onStopped; }), stop: vi.fn(), dispose: vi.fn() };
    const h = playerGraph(new AUFXAudioEngine(new AUFXAudioFormat(8, 1), output));
    const transport = h.engine.createTimelineTransport();
    try {
      await h.engine.start(); stopped(failure);
      expect(transport.signal.aborted).toBe(true);
      expect(h.engine.lastError).toBe(failure);
      expect(() => transport.apply({ kind: "seek", positionSeconds: 0 })).toThrow(expect.objectContaining({ name: "AbortError" }));
    } finally { h.engine.dispose(); }
  });

  it("rejects timeline mutation while an offline chunk snapshot is active", async () => {
    const h = playerGraph(), transport = h.engine.createTimelineTransport();
    const iterator = h.engine.renderOfflineChunks(4, { chunkFrames: 2 })[Symbol.asyncIterator]();
    try {
      await iterator.next();
      expect(() => transport.apply({ kind: "seek", positionSeconds: 0 })).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
      const second = await iterator.next();
      expect([second.value!.buffer.getSample(0, 0), second.value!.buffer.getSample(0, 1)]).toEqual([0.75, 1]);
    } finally { await iterator.return?.(); transport.dispose(); h.engine.dispose(); }
  });

  it.each(["seek", "rate"] as const)("does not overwrite an external timebase %s while an acknowledgement is pending", async kind => {
    let acknowledge!: (receipt: any) => void;
    const lease = new AbortController();
    const transport = { signal: lease.signal, apply: () => new Promise<any>(resolve => { acknowledge = resolve; }), dispose: vi.fn(() => lease.abort()) };
    const clock = new MEFXMonotonicClock("test:fixed", 0, () => 0), timebase = new MEFXTimebase(clock);
    const anchor = new AUFXClockObservation({ samplePosition: 0, sampleRate: 8, domain: "output", hostAnchorSeconds: null, uncertaintySeconds: 0, discontinuityGeneration: 0 });
    const bridge = new AudioMediaClockBridge({ sampleRate: 8, mediaClock: timebase, observeAudioClock: () => anchor });
    const coordinator = new AVPresentationCoordinator({ timebase, audioBridge: bridge, audioTransport: transport, present: () => {} });
    try {
      const pending = coordinator.seek(MEFXTime.finite(1n, 1));
      if (kind === "seek") timebase.seek(MEFXTime.finite(9n, 1)); else timebase.setRate(3n);
      acknowledge({ version: 1, backend: "audio-worklet", positionSeconds: 1, audioAnchor: anchor });
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      expect(transport.dispose).toHaveBeenCalledOnce();
      if (kind === "seek") expect(timebase.now().position.toSeconds()).toBe(9);
      else expect(timebase.snapshot().rateNumerator).toBe(3n);
    } finally { coordinator.dispose(); bridge.dispose(); timebase.dispose(); clock.dispose(); }
  });

  it("anchors a paused offline timeline to rendered content instead of an unrelated wall clock", async () => {
    const h = playerGraph(), transport = h.engine.createTimelineTransport();
    const clock = new MEFXMonotonicClock("test:fixed", 0, () => 0), timebase = new MEFXTimebase(clock);
    const bridge = new AudioMediaClockBridge({ sampleRate: 8, mediaClock: timebase, observeAudioClock: () => null });
    const coordinator = new AVPresentationCoordinator({ timebase, audioBridge: bridge, audioTransport: transport, present: () => {} });
    try {
      await h.engine.renderOffline(2);
      await coordinator.pause();
      expect(timebase.now().position.toSeconds()).toBe(0.25);
      expect(timebase.snapshot().rateNumerator).toBe(0n);
    } finally { coordinator.dispose(); bridge.dispose(); timebase.dispose(); clock.dispose(); h.engine.dispose(); }
  });

  it("rejects a nested timebase whose inherited rate is not owned by the audio transport", () => {
    const h = playerGraph(), transport = h.engine.createTimelineTransport();
    const clock = new MEFXMonotonicClock("test:fixed", 0, () => 0), parent = new MEFXTimebase(clock, { rateNumerator: 2n });
    const timebase = new MEFXTimebase(parent);
    const bridge = new AudioMediaClockBridge({ sampleRate: 8, mediaClock: timebase, observeAudioClock: () => null });
    try {
      expect(() => new AVPresentationCoordinator({ timebase, audioBridge: bridge, audioTransport: transport, present: () => {} }))
        .toThrow(expect.objectContaining({ name: "NotSupportedError" }));
      expect(h.player.playbackRate).toBe(1);
    } finally { transport.dispose(); bridge.dispose(); timebase.dispose(); parent.dispose(); clock.dispose(); h.engine.dispose(); }
  });

  it("holds video and reanchoring until the applied output sample is acknowledged", async () => {
    let acknowledge!: (receipt: AUFXAudioPlanAcknowledgement) => void;
    const output = {
      start: vi.fn(async () => {}), stop: vi.fn(), dispose: vi.fn(),
      supportsTimelineTransport: () => true,
      applyTimelinePlan: vi.fn(() => new Promise<AUFXAudioPlanAcknowledgement>(resolve => { acknowledge = resolve; })),
      observeClock: () => new AUFXClockObservation({ samplePosition: 80, sampleRate: 8, domain: "output", hostAnchorSeconds: null, uncertaintySeconds: 0, discontinuityGeneration: 1 }),
    };
    const h = playerGraph(new AUFXAudioEngine(new AUFXAudioFormat(8, 1), output));
    const clock = new MEFXMonotonicClock("test:fixed", 0, () => 0), timebase = new MEFXTimebase(clock);
    const bridge = new AudioMediaClockBridge({ sampleRate: 8, mediaClock: timebase, observeAudioClock: output.observeClock });
    const coordinator = new AVPresentationCoordinator({ timebase, audioBridge: bridge, audioTransport: h.engine.createTimelineTransport(), present: () => {} });
    try {
      await h.engine.start();
      const seeking = coordinator.seek(MEFXTime.finite(1n, 4));
      expect(await coordinator.tick()).toMatchObject({ action: "wait", reason: "audio-transport-pending" });
      expect(() => coordinator.reanchorAudio()).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
      expect(() => coordinator.pause()).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
      const plan = (output.applyTimelinePlan.mock.calls[0] as any)[0];
      const player = plan.nodes.find((node: any) => node.kind === "player");
      acknowledge({ version: plan.version, contextFrame: 80, players: [{ id: player.id, position: 0.25 }] });
      await seeking;
      expect(coordinator.diagnostics.audioTransportPending).toBe(false);
      expect(bridge.currentMediaTime(bridge.correlation!.generation).toSeconds()).toBe(0.25);
      expect(await coordinator.tick()).toMatchObject({ action: "idle" });
    } finally { coordinator.dispose(); bridge.dispose(); timebase.dispose(); clock.dispose(); h.engine.dispose(); }
  });

  it("does not supersede a pending timeline revision when retained content completes", async () => {
    let source!: any, acknowledge!: (receipt: AUFXAudioPlanAcknowledgement) => void;
    const published = vi.fn();
    const output = {
      start: vi.fn(async (_format, realtimeSource) => { source = realtimeSource; source.subscribe(published); }), stop: vi.fn(), dispose: vi.fn(),
      supportsTimelineTransport: () => true,
      applyTimelinePlan: vi.fn(() => new Promise<AUFXAudioPlanAcknowledgement>(resolve => { acknowledge = resolve; })),
      observeClock: () => new AUFXClockObservation({ samplePosition: 4, sampleRate: 8, domain: "output", hostAnchorSeconds: null, uncertaintySeconds: 0, discontinuityGeneration: 1 }),
    };
    const h = playerGraph(new AUFXAudioEngine(new AUFXAudioFormat(8, 1), output)), transport = h.engine.createTimelineTransport();
    try {
      await h.engine.start();
      const pending = transport.apply({ kind: "seek", positionSeconds: 0 });
      const plan = (output.applyTimelinePlan.mock.calls[0] as any)[0], player = plan.nodes.find((node: any) => node.kind === "player");
      source.receive({ type: "complete", nodeId: player.id, scheduleId: player.schedules[0].id, endSampleTime: 4 });
      expect(published).not.toHaveBeenCalled();
      acknowledge({ version: plan.version, contextFrame: 4, players: [{ id: player.id, position: 0 }] });
      await pending;
      expect(h.completed).toHaveBeenCalledOnce();
    } finally { transport.dispose(); h.engine.dispose(); }
  });

  it("does not grant a different mount transport authority over a same-host engine", () => {
    const output = { start: vi.fn(async () => {}), stop: vi.fn(), dispose: vi.fn(), setOwnerPolicy: vi.fn() };
    const host = createAudioGraphHostService({ createGraphOutput: () => output } as any, new AbortController().signal);
    const capability = Object.freeze({}), engine = host.createEngine(new AUFXAudioFormat(8, 1), undefined, "one", capability);
    try {
      expect(() => host.createTimelineTransport(engine, { capability: Object.freeze({}), appId: "one" }))
        .toThrow(expect.objectContaining({ name: "InvalidAccessError" }));
      expect(() => host.createTimelineTransport(engine, { capability, appId: "two" }))
        .toThrow(expect.objectContaining({ name: "InvalidAccessError" }));
    } finally { engine.dispose(); host.dispose(); }
  });

  it.each(["throw", "reject"] as const)("stops a live engine when timeline dispatch fails by %s", async mode => {
    const failure = new Error("worklet dispatch failed");
    const output = {
      start: vi.fn(async () => {}), stop: vi.fn(), dispose: vi.fn(), supportsTimelineTransport: () => true,
      applyTimelinePlan: () => { if (mode === "throw") throw failure; return Promise.reject(failure); },
    };
    const h = playerGraph(new AUFXAudioEngine(new AUFXAudioFormat(8, 1), output));
    const transport = h.engine.createTimelineTransport();
    try {
      await h.engine.start();
      await expect(Promise.resolve().then(() => transport.apply({ kind: "seek", positionSeconds: 0.25 }))).rejects.toBe(failure);
      expect(h.engine.isRunning).toBe(false);
      expect(output.stop).toHaveBeenCalled();
      expect(transport.signal.aborted).toBe(true);
    } finally { transport.dispose(); h.engine.dispose(); }
  });
});
