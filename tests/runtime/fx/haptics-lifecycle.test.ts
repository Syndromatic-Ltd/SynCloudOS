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
import { HFXHapticEngine, HFXHapticPattern } from "../../../src/FX/HapticsFX/public";
import { AUFXAudioFormat, AUFXAudioPCMBuffer } from "../../../src/FX/AudioFX/public";

it("isolates lifecycle observers and auto-stops once after all players finish", async () => {
  vi.useFakeTimers();
  const events: string[] = [], cancel = vi.fn();
  const engine = new HFXHapticEngine({ supported: true, trigger() {}, event() {}, playerEvent() {}, playerCancel: cancel, cancel, dispose() {} });
  try {
    engine.observe(() => { throw new Error("observer failure"); });
    const observation = engine.observe(event => events.push(event.type + (event.type === "stopped" ? ":" + event.reason : "")));
    engine.configurePlayback({ autoShutdown: true });
    const a = engine.makeAdvancedPlayer(new HFXHapticPattern([{ type: "continuous", relativeTime: 0, duration: 0.1 }]));
    const b = engine.makeAdvancedPlayer(new HFXHapticPattern([{ type: "continuous", relativeTime: 0, duration: 0.2 }]));
    a.start(); b.start(); await vi.advanceTimersByTimeAsync(100); expect(events).toEqual(["started"]);
    await vi.advanceTimersByTimeAsync(100); expect(events).toEqual(["started", "players-finished", "stopped:auto-shutdown"]);
    observation.dispose(); engine.reset(); expect(events).toHaveLength(3);
  } finally { engine.dispose(); vi.useRealTimers(); }
});

it("invalidates pending resources on reset and validates delayed controls before scheduling", async () => {
  let complete!: (value: string) => void;
  const unregister = vi.fn(), engine = new HFXHapticEngine({ supported: true, trigger() {}, event() {}, playerEvent() {}, parameters() {}, playerParameters() {}, playerCancel() {}, cancel() {}, dispose() {}, registerAudioResource: () => new Promise(resolve => { complete = resolve; }), unregisterAudioResource: unregister });
  const pcm = new AUFXAudioPCMBuffer(new AUFXAudioFormat(8000, 1), 8); pcm.frameLength = 8;
  const pending = engine.registerAudioResource(pcm); engine.reset(); complete("stale");
  await expect(pending).rejects.toThrow("reset"); expect(unregister).toHaveBeenCalledWith("stale");
  const player = engine.makeAdvancedPlayer(new HFXHapticPattern([]));
  expect(() => player.sendParameters([{ parameterID: "audioVolume", value: 9, relativeTime: 1 }])).toThrow();
  engine.dispose();
});

it("does not auto-shutdown before the portable transient pulse ends", async () => {
  vi.useFakeTimers();
  const events: string[] = [], engine = new HFXHapticEngine({ supported: true, trigger() {}, event() {}, playerEvent() {}, playerCancel() {}, cancel() {}, dispose() {} });
  try {
    engine.configurePlayback({ autoShutdown: true }); engine.observe(event => events.push(event.type));
    engine.makeAdvancedPlayer(new HFXHapticPattern([{ type: "transient", relativeTime: 0 }])).start();
    await vi.advanceTimersByTimeAsync(0); expect(events).toEqual(["started"]);
    await vi.advanceTimersByTimeAsync(8); expect(events).toEqual(["started", "players-finished", "stopped"]);
  } finally { engine.dispose(); vi.useRealTimers(); }
});

it("applies session pattern policies without overriding disabled host vibration and rejects conflicts", async () => {
  const event = vi.fn(), engine = new HFXHapticEngine({ supported: true, trigger() {}, event, cancel() {}, dispose() {} });
  engine.configurePlayback({ audioOnly: true }); engine.emit({ type: "continuous", relativeTime: 0, duration: 1 }); expect(event).not.toHaveBeenCalled();
  engine.configurePlayback({ audioOnly: false, hapticsOnly: true }); engine.emit({ type: "audioContinuous", relativeTime: 0, duration: 1 }); expect(event).not.toHaveBeenCalled();
  expect(() => engine.configurePlayback({ audioOnly: true })).toThrow();
  engine.configurePlayback({ hapticsOnly: false }); engine.setVibrationEnabled(false); engine.emit({ type: "continuous", relativeTime: 0, duration: 1 }); expect(event).not.toHaveBeenCalled();
  engine.dispose(); expect(() => engine.observe(() => {})).toThrow();
});

it("settles a player when initial owner parameters throw and tolerates reentrant disposal", () => {
  const playerCancel = vi.fn(), completion = vi.fn();
  const engine = new HFXHapticEngine({
    supported: true,
    trigger() {}, event() {}, parameters() {}, cancel() {}, dispose() {},
    playerStart() {}, playerEvent() {}, playerParameters() { throw new Error("backend parameter failure"); }, playerCancel,
  });
  const player = engine.makeAdvancedPlayer(new HFXHapticPattern([{ type: "continuous", relativeTime: 1, duration: 1 }]));
  player.completionHandler = reason => { completion(reason); player.dispose(); engine.dispose(); };
  expect(() => player.start()).not.toThrow();
  expect(completion).toHaveBeenCalledExactlyOnceWith("error");
  expect(playerCancel).toHaveBeenCalledExactlyOnceWith(player);
});

it("settles a player when owner registration and cancellation backends throw", () => {
  const completion = vi.fn();
  const engine = new HFXHapticEngine({
    supported: true,
    trigger() {}, event() {}, cancel() {}, dispose() {},
    playerStart() { throw new Error("registration failure"); }, playerEvent() {}, playerCancel() { throw new Error("cancellation failure"); },
  });
  const player = engine.makeAdvancedPlayer(new HFXHapticPattern([]));
  player.completionHandler = completion;
  expect(() => player.start()).not.toThrow();
  expect(completion).toHaveBeenCalledExactlyOnceWith("error");
  engine.dispose();
});

it("completes engine disposal even when cancellation backend throws", () => {
  const release = vi.fn();
  const engine = new HFXHapticEngine({ supported: true, trigger() {}, cancel() { throw new Error("cancel failure"); }, dispose: release });
  expect(() => engine.dispose()).not.toThrow();
  expect(release).toHaveBeenCalledOnce();
  expect(() => engine.emit({ type: "transient", relativeTime: 0 })).toThrow("disposed");
});

it("disposes the backend once when player completion reenters engine disposal", () => {
  const release = vi.fn(), engine = new HFXHapticEngine({ supported: true, trigger() {}, event() {}, playerEvent() {}, playerCancel() {}, cancel() {}, dispose: release });
  const player = engine.makeAdvancedPlayer(new HFXHapticPattern([{ type: "continuous", relativeTime: 1, duration: 1 }]));
  player.completionHandler = () => engine.dispose();
  player.start(); engine.dispose();
  expect(release).toHaveBeenCalledOnce();
});

it("rejects incomplete custom player ports before playback can acquire output", () => {
  const event = vi.fn(), pattern = new HFXHapticPattern([{ type: "continuous", relativeTime: 0, duration: 1 }]);
  const withoutEvent = new HFXHapticEngine({ supported: true, trigger() {}, event, playerCancel() {}, cancel() {}, dispose() {} });
  expect(() => withoutEvent.makeAdvancedPlayer(pattern)).toThrow("playerEvent");
  const withoutCancel = new HFXHapticEngine({ supported: true, trigger() {}, event, playerEvent() {}, cancel() {}, dispose() {} });
  expect(() => withoutCancel.makeAdvancedPlayer(pattern)).toThrow("playerCancel");
  const withoutParameters = new HFXHapticEngine({ supported: true, trigger() {}, event, playerEvent() {}, playerCancel() {}, parameters() {}, cancel() {}, dispose() {} });
  expect(() => withoutParameters.makeAdvancedPlayer(pattern)).toThrow("playerParameters");
  expect(event).not.toHaveBeenCalled();
  withoutEvent.dispose(); withoutCancel.dispose(); withoutParameters.dispose();
});

it("retains a resource for final retry when explicit backend unregister fails", async () => {
  const unregister = vi.fn(() => { if (unregister.mock.calls.length === 1) throw new Error("release failure"); });
  const engine = new HFXHapticEngine({ supported: true, trigger() {}, cancel() {}, dispose() {}, registerAudioResource: async () => "backend-resource", unregisterAudioResource: unregister });
  const pcm = new AUFXAudioPCMBuffer(new AUFXAudioFormat(8000, 1), 8); pcm.frameLength = 8;
  const resource = await engine.registerAudioResource(pcm);
  expect(() => engine.unregisterAudioResource(resource)).toThrow("release failure");
  engine.dispose();
  expect(unregister).toHaveBeenCalledTimes(2);
});

it("does not resurrect a player disposed reentrantly by the player-start hook", () => {
  const events: string[] = [], completion = vi.fn();
  let player!: ReturnType<HFXHapticEngine["makeAdvancedPlayer"]>;
  const engine = new HFXHapticEngine({ supported: true, trigger() {}, event() {}, playerEvent() {}, playerCancel() {}, playerStart() { player.dispose(); }, cancel() {}, dispose() {} });
  engine.observe(event => events.push(event.type));
  player = engine.makeAdvancedPlayer(new HFXHapticPattern([{ type: "continuous", relativeTime: 0, duration: 1 }]));
  player.completionHandler = completion;
  player.start();
  expect(events).toEqual(["players-finished"]);
  expect(events).not.toContain("started");
  expect(completion).toHaveBeenCalledExactlyOnceWith("cancelled");
  engine.dispose();
});

it("completes reset resource and lifecycle sweeps before rethrowing the first backend error", async () => {
  let sequence = 0;
  const cancel = vi.fn(() => { throw new Error("cancel failure"); });
  const unregister = vi.fn((id: string) => { if (id === "backend-1" && unregister.mock.calls.filter(([value]) => value === id).length === 1) throw new Error("resource failure"); });
  const engine = new HFXHapticEngine({ supported: true, trigger() {}, cancel, dispose() {}, registerAudioResource: async () => `backend-${++sequence}`, unregisterAudioResource: unregister });
  const events: string[] = []; engine.observe(event => events.push(event.type));
  const pcm = new AUFXAudioPCMBuffer(new AUFXAudioFormat(8000, 1), 8); pcm.frameLength = 8;
  const first = await engine.registerAudioResource(pcm), second = await engine.registerAudioResource(pcm);
  expect(() => engine.reset()).toThrow("cancel failure");
  expect(unregister.mock.calls.map(([id]) => id)).toEqual(["backend-1", "backend-2"]);
  expect(events).toEqual(["reset"]);
  expect(() => engine.unregisterAudioResource(first)).toThrow("not owned");
  expect(() => engine.unregisterAudioResource(second)).toThrow("not owned");
  engine.dispose();
  expect(unregister.mock.calls.map(([id]) => id)).toEqual(["backend-1", "backend-2", "backend-1"]);
});
