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

import { describe, it, expect, vi } from "vitest";
import { createRuntimeHapticsHostService } from "../../../src/SynCloudOS/HapticsFX/HapticsHostService";
import { AUFXSystemFeedbackBus } from "../../../src/SynCloudOS/AudioFX/AUFXSystemFeedbackBus";
import { HFXHapticPattern } from "../../../src/FX/HapticsFX/HFXHapticPattern";
describe("HFX host scoped authority", () => {
  it("does not expose policy mutation and blocks forged trigger options", async () => {
    const vibrate = vi.fn(() => true), host = createRuntimeHapticsHostService(new AUFXSystemFeedbackBus(() => null), { navigator: { vibrate }, audio: "off" });
    const session = host.createSession();
    expect(Object.isFrozen(session)).toBe(true); expect("setVibrationEnabled" in session).toBe(false); expect("emit" in session).toBe(false);
    host.setVibrationEnabled(false); await session.trigger("medium"); expect(vibrate).not.toHaveBeenCalledWith([14, 6, 4, 1]);
    await expect(session.trigger("medium", { navigator: { vibrate } } as never)).rejects.toThrow(); host.dispose();
  });
  it("does not let an older owner cancel a newer owner's motor and revokes on abort", async () => {
    const vibrate = vi.fn(() => true), host = createRuntimeHapticsHostService(new AUFXSystemFeedbackBus(() => null), { navigator: { vibrate }, audio: "off" });
    const controller = new AbortController(), a = host.createSession(controller.signal), b = host.createSession();
    await a.trigger("medium"); await b.trigger("rigid"); vibrate.mockClear(); a.stop(); expect(vibrate).not.toHaveBeenCalled();
    controller.abort(); await expect(a.trigger("medium")).rejects.toThrow(expect.objectContaining({ code: "HFX_HAPTIC_ENGINE_DISPOSED" })); b.stop(); expect(vibrate).toHaveBeenCalledWith(0); host.dispose();
  });
  it("applies vibration policy to every engine before surfacing the first backend error", () => {
    const vibrate = vi.fn((pattern: VibratePattern) => { if (pattern === 0) throw new Error("native policy failure"); return true; });
    const host = createRuntimeHapticsHostService(new AUFXSystemFeedbackBus(() => null), { navigator: { vibrate }, audio: "off" });
    const first = host.createSession(), second = host.createSession();
    expect(() => host.setVibrationEnabled(false)).toThrow("native policy failure");
    expect(vibrate.mock.calls.filter(([pattern]) => pattern === 0)).toHaveLength(3);
    first.dispose(); second.dispose(); host.dispose();
  });
  it("applies button-sound policy to every engine when owner audio cleanup throws", () => {
    let sequence = 0;
    const unregister = vi.fn((id: string) => { throw new Error(`audio cleanup failure ${id}`); });
    const bus = { audioState: "available", currentTime: 0, prepare: vi.fn(), playSynthesizedAudio: vi.fn(() => `synthesis-${++sequence}`), unregisterAudioResource: unregister, setAudioResourceParameter: vi.fn(), cancelAudioPlayback: vi.fn(), setAudioPlaybackParameter: vi.fn() } as unknown as AUFXSystemFeedbackBus;
    const host = createRuntimeHapticsHostService(bus, { navigator: null, document: null });
    const first = host.createSession(), second = host.createSession();
    const pattern = new HFXHapticPattern([{ type: "audioContinuous", relativeTime: 0, duration: 1 }]);
    const players = [host.system.makeAdvancedPlayer(pattern), first.makeAdvancedPlayer(pattern), second.makeAdvancedPlayer(pattern)];
    for (const player of players) player.start();
    expect(() => host.setButtonSoundEnabled(false)).toThrow("audio cleanup failure synthesis-1");
    expect(unregister.mock.calls.map(([id]) => id)).toEqual(["synthesis-1", "synthesis-2", "synthesis-3"]);
    for (const player of players) player.stop(); first.dispose(); second.dispose(); host.dispose();
  });
});
