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
import { HFXHapticEngine, HFXHapticPattern, HFXHapticParameterCurve, HFXHapticPatternCodec } from "../../../src/FX/HapticsFX/public";
describe("HapticsFX", () => {
  it("validates pattern times and round trips named events and curves", () => {
    expect(() => new HFXHapticPattern([{ type: "continuous", relativeTime: -1, duration: 1 }])).toThrow();
    const pattern = new HFXHapticPattern([{ type: "continuous", relativeTime: 0.1, duration: 0.5, name: "pulse" }], [new HFXHapticParameterCurve("intensity", [{ time: 0, value: 0 }, { time: 1, value: 1 }])]);
    expect(pattern.duration).toBe(0.6);
    expect(pattern.curves[0]!.valueAt(0.5)).toBe(0.5);
    expect(HFXHapticPatternCodec.decode(HFXHapticPatternCodec.encode(pattern)).events).toEqual(pattern.events);
  });
  it("cancels scheduled playback once and cannot outlive its engine", async () => {
    vi.useFakeTimers();
    const emit = vi.fn(), cancel = vi.fn();
    const engine = new HFXHapticEngine({ supported: true, trigger: emit, playerEvent: vi.fn(), playerCancel: cancel, cancel, dispose: vi.fn() });
    const player = engine.makeAdvancedPlayer(new HFXHapticPattern([{ type: "transient", relativeTime: 1 }]));
    const completion = vi.fn(); player.completionHandler = completion;
    player.start(); engine.dispose();
    await vi.runAllTimersAsync();
    expect(emit).not.toHaveBeenCalled(); expect(completion).toHaveBeenCalledTimes(1);
    expect(() => player.start()).toThrow(); vi.useRealTimers();
  });
});
