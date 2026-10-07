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

import type { AUFXAudioEngine } from "@syndromatic/syncloudos/fx/audio";
import type { MEFXTime, MEFXTimebase } from "@syndromatic/syncloudos/fx/media";
import type { VFXFrame, VFXPresentationContext, VFXPresentationTickResult, VFXVideoClient } from "@syndromatic/syncloudos/fx/video";

type PCMObservation = { first: number; last: number; peak: number; frames: number; inferredRate: number };
type ProbeOptions = {
  audio: Pick<typeof import("@syndromatic/syncloudos/fx/audio"), "AUFXAudioPlayerNode" | "AUFXAudioPCMBuffer">;
  media: Pick<typeof import("@syndromatic/syncloudos/fx/media"), "MEFXTime">;
  engine: AUFXAudioEngine;
  timebase: MEFXTimebase;
  createCoordinator: VFXVideoClient["createPresentationCoordinator"];
  makeFrame(position: MEFXTime): VFXFrame;
  draw(frame: VFXFrame): void;
  stage?(name: string): void;
};

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`VFX-06 actual playback: ${message}`);
}
const animationFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

/** Shared by SOURCE browser tests and the separately installed public-package consumer. */
export async function runTimelineTransportProbe(options: ProbeOptions) {
  const { audio, media, engine, timebase } = options, sampleRate = engine.format.sampleRate;
  const player = new audio.AUFXAudioPlayerNode(engine.format);
  const pcm = new audio.AUFXAudioPCMBuffer(engine.format, sampleRate * 8); pcm.frameLength = pcm.frameCapacity;
  // A ramp encodes content position and rate in the actual rendered samples.
  // Adjacent-sample spacing distinguishes rate 1 from rate 2 independently of wall clocks.
  for (let frame = 0; frame < pcm.frameLength; frame++) pcm.setSample(0, frame, (frame + 1) / (sampleRate * 16));
  engine.attach(player); engine.connect(player, engine.mainMixerNode); player.scheduleBuffer(pcm);
  let deliver: ((value: PCMObservation) => void) | null = null, tapTimer: ReturnType<typeof setTimeout> | undefined;
  let tapCount = 0, active = 0, maximumActive = 0, cancelledDraws = 0;
  const presented: number[] = [];
  let hold: { promise: Promise<void>; release(): void } | null = null;
  let borrowed: { frame: VFXFrame; context: VFXPresentationContext } | null = null;
  const coordinator = options.createCoordinator({ audioEngine: engine, audioPlayers: [player], timebase, maximumQueuedFrames: 2, toleranceSeconds: 0.03,
    async present(frame, context) {
      active++; maximumActive = Math.max(maximumActive, active);
      try {
        if (hold) { borrowed = { frame, context }; await hold.promise; }
        if (context.signal.aborted) { cancelledDraws++; return; }
        options.draw(frame); presented.push(frame.timing.presentationTime.toSeconds());
      } finally { active--; }
    },
  });
  const tap = engine.installTap(engine.mainMixerNode, buffer => {
    tapCount++;
    if (buffer.frameLength < 2) return;
    const first = buffer.getSample(0, 0), last = buffer.getSample(0, buffer.frameLength - 1);
    let peak = 0; for (let frame = 0; frame < buffer.frameLength; frame++) peak = Math.max(peak, Math.abs(buffer.getSample(0, frame)));
    const callback = deliver; deliver = null;
    callback?.({ first, last, peak, frames: buffer.frameLength, inferredRate: (last - first) * sampleRate * 16 / (buffer.frameLength - 1) });
  });
  const nextPCM = () => new Promise<PCMObservation>((resolve, reject) => {
    check(!deliver, "PCM observer must remain bounded to one pending packet");
    tapTimer = setTimeout(() => { deliver = null; reject(new Error("VFX-06 output produced no PCM tap within 3 seconds")); }, 3_000);
    deliver = value => { clearTimeout(tapTimer); resolve(value); };
  });
  let callerFrame: VFXFrame | undefined, pendingRenderer: Promise<VFXPresentationTickResult> | undefined;
  try {
    options.stage?.("engine-starting"); await engine.start(); options.stage?.("transport-seek");
    const seeking = coordinator.seek(media.MEFXTime.finite(2n, 1));
    const pending = coordinator.diagnostics.audioTransportPending, waiting = await coordinator.tick();
    check(pending && waiting.reason === "audio-transport-pending", "live seek must await an output revision");
    await seeking; await coordinator.play();
    const seekPlay = await nextPCM();
    check(seekPlay.first >= 2 / 16 && seekPlay.first < 2.25 / 16, `seek returned wrong content: ${JSON.stringify(seekPlay)}`);
    check(Math.abs(seekPlay.inferredRate - 1) < 0.01, `rate-1 PCM spacing is ${seekPlay.inferredRate}`);

    await coordinator.pause();
    const pausedPosition = timebase.now().position;
    coordinator.reanchorAudio();
    const paused = await nextPCM(), pausedAgain = await nextPCM();
    check(paused.peak === 0 && pausedAgain.peak === 0, "acknowledged pause must emit silence");
    check(timebase.now().position.compare(pausedPosition) === 0, "pause/reanchor advanced the media timeline");
    await coordinator.setRate(2n);
    const doubleRate = await nextPCM();
    check(Math.abs(doubleRate.inferredRate - 2) < 0.01, `rate-2 PCM spacing is ${doubleRate.inferredRate}`);

    options.stage?.("seek-during-render");
    let release!: () => void;
    hold = { promise: new Promise<void>(resolve => { release = resolve; }), release: () => release() };
    // This section owns renderer cancellation/concurrency. Submit a due frame
    // immediately; the separate scheduling case owns early/late windows.
    coordinator.reanchorAudio();
    callerFrame = options.makeFrame(timebase.now().position);
    const storedPTS = callerFrame.timing.presentationTime;
    coordinator.enqueue(callerFrame);
    for (let attempt = 0; attempt < 180; attempt++) {
      const tick = coordinator.tick();
      if (borrowed) { pendingRenderer = tick; break; }
      check((await tick).action === "wait", "slow renderer's frame missed its presentation window");
      await animationFrame();
    }
    check(borrowed && pendingRenderer, "slow renderer never started");
    const lease = borrowed as { frame: VFXFrame; context: VFXPresentationContext };
    for (let index = 0; index < 3; index++) {
      const frame = options.makeFrame(storedPTS);
      try { check(coordinator.enqueue(frame) === (index < 2 ? "queued" : "queue-full"), "waiting video queue exceeded its bound"); }
      finally { frame.close(); }
    }
    const concurrent = await Promise.all([coordinator.tick(), coordinator.tick()]);
    check(concurrent.every(result => result.reason === "renderer-busy") && active === 1, "concurrent ticks entered the slow renderer");
    const seekingWhilePresent = coordinator.seek(media.MEFXTime.finite(1n, 1));
    check(lease.context.signal.aborted && !lease.frame.closed, "seek must cancel rendering without closing its borrowed frame");
    await seekingWhilePresent;
    check((await coordinator.tick()).reason === "renderer-busy", "cancelled renderer slot was released before settlement");
    hold.release(); const stale = await pendingRenderer; pendingRenderer = undefined; hold = null;
    check(stale.reason === "presentation-invalidated" && lease.frame.closed, "obsolete renderer was acknowledged or retained after settlement");
    check(!callerFrame.closed && callerFrame.timing.presentationTime === storedPTS && presented.length === 0, "seek changed caller PTS/lifetime or committed a stale draw");
    callerFrame.close(); callerFrame = undefined;

    options.stage?.("automatic-loop");
    await coordinator.setRate(1n);
    coordinator.setLoop({ start: media.MEFXTime.finite(1n, 1), end: media.MEFXTime.finite(5n, 4) });
    const loops: PCMObservation[] = [];
    for (let cycle = 0; cycle < 2; cycle++) {
      let boundary = false;
      for (let attempt = 0; attempt < 180; attempt++) {
        const result = await coordinator.tick();
        if (result.reason === "loop-boundary") { boundary = true; break; }
        await animationFrame();
      }
      check(boundary, "the running output clock never caused the automatic loop");
      for (let attempt = 0; coordinator.diagnostics.audioTransportPending && attempt < 180; attempt++) await nextPCM();
      check(!coordinator.diagnostics.audioTransportPending, "automatic loop never received its output acknowledgement");
      const wrapped = await nextPCM(); loops.push(wrapped);
      check(wrapped.first >= 1 / 16 && wrapped.first < 1.20 / 16, `loop did not restart the PCM content: ${JSON.stringify(wrapped)}`);
      check(Math.abs(wrapped.inferredRate - 1) < 0.01, "loop did not retain the actual PCM playback rate");
    }
    coordinator.setLoop(null);
    options.stage?.("canvas-presentation");
    coordinator.reanchorAudio();
    const frame = options.makeFrame(timebase.now().position);
    coordinator.enqueue(frame); frame.close();
    const first = await coordinator.tick(); check(first.action === "present" && Number(presented.length) === 1, `post-seek video did not reach the canvas: ${JSON.stringify({ first, presented })}`);
    const lateFrame = options.makeFrame(timebase.now().position.addDuration(media.MEFXTime.finite(-500n, 1_000)));
    coordinator.enqueue(lateFrame); lateFrame.close();
    const late = await coordinator.tick(); check(late.action === "drop", "late frame was not dropped");
    coordinator.end(); const eos = await coordinator.tick(); check(eos.action === "end-of-stream", "empty timeline did not end");
    const diagnostics = coordinator.diagnostics;
    coordinator.dispose();
    let disposedError = ""; try { await coordinator.tick(); } catch (error) { disposedError = (error as Error).name; }
    check(disposedError === "AbortError", "disposed presentation accepted work");
    let afterDispose = await nextPCM();
    for (let attempt = 0; afterDispose.peak !== 0 && attempt < 20; attempt++) afterDispose = await nextPCM();
    check(afterDispose.peak === 0, "released timeline player kept emitting audio");
    return { sampleRate, pending, waiting, pcm: { seekPlay, paused, pausedAgain, doubleRate, loops, afterDispose }, first, late, eos,
      slowRenderer: { maximumActive, cancelledDraws, stale, borrowedClosedAfterSettlement: lease.frame.closed, readonlyPTSPreserved: true },
      presented, tapCount, diagnostics, teardown: disposedError };
  } finally {
    hold?.release(); if (pendingRenderer) await pendingRenderer.catch(() => {});
    callerFrame?.close(); clearTimeout(tapTimer); deliver = null; tap.dispose(); coordinator.dispose();
  }
}
