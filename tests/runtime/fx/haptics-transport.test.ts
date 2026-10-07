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

import { it, expect, vi } from "vitest";
import { HFXHapticEngine, HFXHapticPattern, HFXHapticParameterCurve } from "../../../src/FX/HapticsFX/public";
it("applies curves to event onset and cancels hardware when paused", async () => {
  vi.useFakeTimers();
  try {
    const emit = vi.fn(), cancel = vi.fn();
    const engine = new HFXHapticEngine({ supported: true, trigger: vi.fn(), event: emit, playerEvent: (_owner, ...args) => emit(...args), playerCancel: cancel, cancel, dispose: vi.fn() });
    const player = engine.makeAdvancedPlayer(new HFXHapticPattern([{ type: "continuous", relativeTime: 0.5, duration: 1, intensity: 1 }], [new HFXHapticParameterCurve("intensity", [{ time: 0, value: 0 }, { time: 1, value: 1 }])]));
    player.start(); await vi.advanceTimersByTimeAsync(500);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ intensity: 0.5 }), 0, 0, 1, 1);
    player.pause(); expect(cancel).toHaveBeenCalled(); engine.dispose();
  } finally { vi.useRealTimers(); }
});
it("resumes a continuous event at its remaining duration and loops without duplicate completion", async () => {
  vi.useFakeTimers();
  try {
    const emit = vi.fn(), completion = vi.fn();
    const cancel = vi.fn();
    const engine = new HFXHapticEngine({ supported: true, trigger: vi.fn(), event: emit, playerEvent: (_owner, ...args) => emit(...args), playerCancel: cancel, cancel, dispose: vi.fn() });
    const player = engine.makeAdvancedPlayer(new HFXHapticPattern([{ type: "continuous", relativeTime: 0, duration: 1 }]));
    player.completionHandler = completion; player.start(); await vi.advanceTimersByTimeAsync(400); player.pause();
    await vi.advanceTimersByTimeAsync(200); player.playbackRate = 2; player.resume(); await vi.advanceTimersByTimeAsync(0);
    expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({ duration: 0.3 }), 0, 0.4, 2, 1);
    await vi.advanceTimersByTimeAsync(300); expect(completion).toHaveBeenCalledExactlyOnceWith("completed");
    completion.mockClear(); player.loopEnabled = true; player.start(); await vi.advanceTimersByTimeAsync(1200);
    expect(completion).not.toHaveBeenCalled(); player.stop(); expect(completion).toHaveBeenCalledExactlyOnceWith("cancelled"); engine.dispose();
  } finally { vi.useRealTimers(); }
});
