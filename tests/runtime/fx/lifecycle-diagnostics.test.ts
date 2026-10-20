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

import { expect, it } from "vitest";
import { AFXLayer, type AFXLayerSurface } from "../../../src/FX/AnimationFX/AFXLayer";
import { createAFXLayer } from "../../../src/FX/AnimationFX/host";
import { AFXEmitterLayer } from "../../../src/FX/AnimationFX/AFXEmitterLayer";
import { AFXTiledLayer } from "../../../src/FX/AnimationFX/AFXTiledLayer";
import { AFXTransaction } from "../../../src/FX/AnimationFX/AFXTransaction";
import { AFXShapeLayer } from "../../../src/FX/AnimationFX/AFXShapeLayer";
import { AFXGradientLayer } from "../../../src/FX/AnimationFX/AFXGradientLayer";
import { AFXReplicatorLayer } from "../../../src/FX/AnimationFX/AFXReplicatorLayer";
import { AFXParticleLayer } from "../../../src/FX/AnimationFX/AFXParticleLayer";
import { AFXTextLayer } from "../../../src/FX/AnimationFX/AFXTextLayer";
import { GFXColour } from "../../../src/FX/GraphicsFX/GFXColour";
import { AUFXAudioEngine } from "../../../src/FX/AudioFX/AUFXAudioEngine";
import { AUFXAudioFile } from "../../../src/FX/AudioFX/AUFXAudioFile";
import { AUFXAudioFormat } from "../../../src/FX/AudioFX/AUFXAudioFormat";
import { AUFXAudioPCMBuffer } from "../../../src/FX/AudioFX/AUFXAudioPCMBuffer";
import { AUFXAudioPlayerNode } from "../../../src/FX/AudioFX/AUFXAudioPlayerNode";
import { GFXBitmapContext } from "../../../src/FX/GraphicsFX/GFXBitmapContext";
import { HFXHapticEngine } from "../../../src/FX/HapticsFX/HFXHapticEngine";
import { HFXHapticPattern } from "../../../src/FX/HapticsFX/HFXHapticPattern";
import { MEFXBlockBuffer, createRuntimeOwnedMEFXBlockBuffer } from "../../../src/FX/MediaFX/MEFXBlockBuffer";
import { MEFXBufferQueue } from "../../../src/FX/MediaFX/MEFXBufferQueue";
import { ScopedMotionManager } from "../../../src/SynCloudOS/MotionFX/ScopedMotionManager";
import { declareSynCloudOSLifecycleSignal, SynCloudOSLifecycleError } from "../../../src/SynCloudOS/fxRuntimeContracts";
import { motionFixture } from "./motion-fixture";

const scheduler = { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false };
const surface = (): AFXLayerSurface => ({
  supportedProperties: ["frame", "opacity", "transform", "sublayerTransform"],
  supportedContentKinds: ["image", "emitter", "tiled", "shape", "gradient", "text"],
  supportsReplication: true,
  apply() {}, attach() {}, detach() {}, setMask() {}, dispose() {},
});
function diagnostic(action: () => unknown, code: string, operation: string, reason = "explicit") {
  expect(action).toThrow(SynCloudOSLifecycleError);
  try { action(); } catch (error) {
    expect(error).toMatchObject({ code, operation, disposal: { reason } });
  }
}

it("identifies disposed layer families and the public operation", async () => {
  const layer = createAFXLayer(surface(), scheduler);
  layer.dispose();
  diagnostic(() => { layer.opacity = 0.5; }, "AFX_LAYER_DISPOSED", "opacity");
  diagnostic(() => { layer.hidden = true; }, "AFX_LAYER_DISPOSED", "hidden");
  const emitter = createAFXLayer(AFXEmitterLayer, surface(), scheduler);
  emitter.dispose();
  diagnostic(() => emitter.startEmitting(), "AFX_EMITTER_LAYER_DISPOSED", "startEmitting");
  const tiled = createAFXLayer(AFXTiledLayer, surface(), scheduler);
  tiled.dispose();
  diagnostic(() => tiled.invalidate(), "AFX_TILED_LAYER_DISPOSED", "invalidate");
  await expect(tiled.waitForIdle()).rejects.toBeInstanceOf(SynCloudOSLifecycleError);
  await expect(tiled.waitForIdle()).rejects.toMatchObject({ code: "AFX_TILED_LAYER_DISPOSED", operation: "waitForIdle" });
  const transaction = new AFXTransaction(() => { throw new Error("Disposed transaction must not execute."); });
  transaction.dispose();
  diagnostic(() => transaction.run({}, () => {}), "AFX_TRANSACTION_DISPOSED", "run");
});

it("reports subclass public operations rather than inherited content and replication helpers", () => {
  const shape = createAFXLayer(AFXShapeLayer, surface(), scheduler);
  shape.dispose();
  diagnostic(() => { shape.strokeEnd = 0.5; }, "AFX_LAYER_DISPOSED", "strokeEnd");
  const gradient = createAFXLayer(AFXGradientLayer, surface(), scheduler);
  gradient.dispose();
  diagnostic(() => { gradient.colours = [GFXColour.grayscale(0)]; }, "AFX_LAYER_DISPOSED", "colours");
  const replicator = createAFXLayer(AFXReplicatorLayer, surface(), scheduler);
  replicator.dispose();
  diagnostic(() => { replicator.instanceCount = 2; }, "AFX_LAYER_DISPOSED", "instanceCount");
  const particles = createAFXLayer(AFXParticleLayer, surface(), scheduler);
  particles.dispose();
  diagnostic(() => particles.setParticles([]), "AFX_LAYER_DISPOSED", "setParticles");
  const text = createAFXLayer(AFXTextLayer, surface(), scheduler);
  text.dispose();
  diagnostic(() => { text.baselineOrigin = { x: 0, y: 0 }; }, "AFX_LAYER_DISPOSED", "baselineOrigin");
});

it("retains declared layer abort causes and the first explicit disposal", () => {
  for (const Layer of [AFXLayer, AFXEmitterLayer, AFXTiledLayer]) {
    const owner = new AbortController();
    declareSynCloudOSLifecycleSignal(owner.signal, "application-closed");
    const layer = createAFXLayer(Layer, surface(), scheduler, { signal: owner.signal });
    owner.abort();
    diagnostic(() => { layer.opacity = 0.5; }, "AFX_LAYER_DISPOSED", "opacity", "application-closed");
    if (layer instanceof AFXEmitterLayer) diagnostic(() => layer.startEmitting(), "AFX_EMITTER_LAYER_DISPOSED", "startEmitting", "application-closed");
    if (layer instanceof AFXTiledLayer) diagnostic(() => layer.invalidate(), "AFX_TILED_LAYER_DISPOSED", "invalidate", "application-closed");
  }
  const owner = new AbortController();
  const layer = createAFXLayer(surface(), scheduler, { signal: owner.signal });
  layer.dispose(); owner.abort(); layer.dispose();
  diagnostic(() => layer.display(), "AFX_LAYER_DISPOSED", "display");
  expect(() => createAFXLayer(surface(), scheduler, { signal: owner.signal })).toThrow(DOMException);
});

it("identifies closed audio files, players and engines", async () => {
  const format = new AUFXAudioFormat(8000, 1);
  const pcm = new AUFXAudioPCMBuffer(format, 1); pcm.frameLength = 1;
  const file = new AUFXAudioFile(pcm);
  file.close();
  diagnostic(() => file.read(pcm), "AUFX_AUDIO_FILE_DISPOSED", "read");
  diagnostic(() => file.readFrames(1), "AUFX_AUDIO_FILE_DISPOSED", "readFrames");
  const player = new AUFXAudioPlayerNode(format);
  player.dispose();
  diagnostic(() => player.play(), "AUFX_AUDIO_PLAYER_NODE_DISPOSED", "play");
  diagnostic(() => player.scheduleBuffer(pcm), "AUFX_AUDIO_PLAYER_NODE_DISPOSED", "scheduleBuffer");
  const engine = new AUFXAudioEngine(format);
  engine.dispose();
  diagnostic(() => engine.attach(player), "AUFX_AUDIO_ENGINE_DISPOSED", "attach");
  await expect(engine.renderOffline(1)).rejects.toBeInstanceOf(SynCloudOSLifecycleError);
  await expect(engine.renderOffline(1)).rejects.toMatchObject({ code: "AUFX_AUDIO_ENGINE_DISPOSED", operation: "renderOffline" });
});

it("identifies disposed bitmap operations including private target delegation", () => {
  const bitmap = new GFXBitmapContext({ width: 1, height: 1 });
  bitmap.dispose(); bitmap.dispose();
  diagnostic(() => bitmap.save(), "GFX_BITMAP_CONTEXT_DISPOSED", "save");
  diagnostic(() => bitmap.clear(), "GFX_BITMAP_CONTEXT_DISPOSED", "clear");
  diagnostic(() => bitmap.makeImage(), "GFX_BITMAP_CONTEXT_DISPOSED", "makeImage");
});

it("keeps haptic assertActive public while diagnosing player and engine disposal", async () => {
  const engine = new HFXHapticEngine({ supported: true, async trigger() {}, playerEvent() {}, playerCancel() {}, cancel() {}, dispose() {} });
  const player = engine.makeAdvancedPlayer(new HFXHapticPattern([{ type: "transient", relativeTime: 0 }]));
  player.dispose();
  diagnostic(() => player.start(), "HFX_HAPTIC_ADVANCED_PATTERN_PLAYER_DISPOSED", "start");
  diagnostic(() => player.resume(), "HFX_HAPTIC_ADVANCED_PATTERN_PLAYER_DISPOSED", "resume");
  diagnostic(() => player.sendParameters([]), "HFX_HAPTIC_ADVANCED_PATTERN_PLAYER_DISPOSED", "sendParameters");
  engine.dispose();
  diagnostic(() => engine.assertActive(), "HFX_HAPTIC_ENGINE_DISPOSED", "assertActive");
  await expect(engine.trigger("light")).rejects.toMatchObject({ code: "HFX_HAPTIC_ENGINE_DISPOSED", operation: "trigger" });
});

it("diagnoses haptic disposal after awaited registration", async () => {
  let complete!: (id: string) => void;
  const engine = new HFXHapticEngine({ supported: true, async trigger() {}, cancel() {}, dispose() {}, registerAudioResource: () => new Promise<string>(resolve => { complete = resolve; }) });
  const pcm = new AUFXAudioPCMBuffer(new AUFXAudioFormat(8000, 1), 1); pcm.frameLength = 1;
  const pending = engine.registerAudioResource(pcm);
  engine.dispose(); complete("late");
  await expect(pending).rejects.toBeInstanceOf(SynCloudOSLifecycleError);
  await expect(pending).rejects.toMatchObject({ code: "HFX_HAPTIC_ENGINE_DISPOSED", operation: "registerAudioResource" });
});

it("preserves registration reset errors and the original signal abort reason", async () => {
  const pcm = new AUFXAudioPCMBuffer(new AUFXAudioFormat(8000, 1), 1); pcm.frameLength = 1;
  for (const mode of ["reset", "abort"] as const) {
    let complete!: (id: string) => void;
    const engine = new HFXHapticEngine({ supported: true, async trigger() {}, cancel() {}, dispose() {}, registerAudioResource: () => new Promise<string>(resolve => { complete = resolve; }) });
    const owner = new AbortController();
    const pending = engine.registerAudioResource(pcm, owner.signal);
    const abort = new DOMException("Registration owner revoked.", "AbortError");
    if (mode === "reset") engine.reset();
    else owner.abort(abort);
    complete("late");
    if (mode === "abort") await expect(pending).rejects.toBe(abort);
    else {
      await expect(pending).rejects.toThrow("Haptic engine reset during audio registration.");
      await expect(pending).rejects.not.toBeInstanceOf(SynCloudOSLifecycleError);
    }
    engine.dispose();
  }
});

it("diagnoses closed media blocks and preserves mounted abort provenance", () => {
  const block = new MEFXBlockBuffer(new Uint8Array([1]));
  block.close();
  diagnostic(() => block.slice(), "MEFX_BLOCK_BUFFER_DISPOSED", "slice");
  diagnostic(() => block.copyTo(new Uint8Array(1)), "MEFX_BLOCK_BUFFER_DISPOSED", "copyTo");
  diagnostic(() => block.transfer(value => value), "MEFX_BLOCK_BUFFER_DISPOSED", "transfer");
  const owner = new AbortController();
  declareSynCloudOSLifecycleSignal(owner.signal, "application-closed");
  const mounted = createRuntimeOwnedMEFXBlockBuffer(new Uint8Array([1]), {
    acquireHandle: () => ({ signal: owner.signal, release() {} }), onBackingRelease() {},
  });
  owner.abort(); mounted.close();
  diagnostic(() => mounted.slice(), "MEFX_BLOCK_BUFFER_DISPOSED", "slice", "application-closed");
});

it("diagnoses future queue operations without replacing pending custom cancellation reasons", async () => {
  const queue = new MEFXBufferQueue<number>({ maxCount: 1, maxBytes: 1, byteCost: () => 1, transfer: (value, accept) => accept(value), close() {} });
  const pending = queue.dequeue();
  const reason = new Error("Owner closed queue.");
  queue.dispose(reason);
  await expect(pending).rejects.toBe(reason);
  await expect(queue.enqueue(1)).rejects.toBeInstanceOf(SynCloudOSLifecycleError);
  await expect(queue.enqueue(1)).rejects.toMatchObject({ code: "MEFX_BUFFER_QUEUE_DISPOSED", operation: "enqueue" });
  await expect(queue.dequeue()).rejects.toMatchObject({ code: "MEFX_BUFFER_QUEUE_DISPOSED", operation: "dequeue" });
});

it("retains motion owner abort causes and public subscription operations", () => {
  const owner = new AbortController();
  declareSynCloudOSLifecycleSignal(owner.signal, "application-closed");
  const manager = new ScopedMotionManager(motionFixture().adapter, { signal: owner.signal });
  owner.abort(); manager.dispose();
  diagnostic(() => manager.setGyroUpdateInterval(1), "MFX_MOTION_MANAGER_DISPOSED", "setGyroUpdateInterval", "application-closed");
  diagnostic(() => manager.startGyroUpdates(() => {}), "MFX_MOTION_MANAGER_DISPOSED", "startGyroUpdates", "application-closed");
});
