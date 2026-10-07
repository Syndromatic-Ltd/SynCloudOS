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
import { HFXHapticEngine, HFXHapticPattern, HFXHapticParameterCurve, HFXHapticPatternCodec } from "../../../src/FX/HapticsFX/public";
import { AUFXAudioFormat, AUFXAudioPCMBuffer } from "../../../src/FX/AudioFX/public";
describe("HapticsFX required portable depth", () => {
  it("round trips AHAP event parameters and control curves", () => {
    const pattern = new HFXHapticPattern([{ type: "continuous", relativeTime: 0.2, duration: 0.6, intensity: 0.7, sharpness: 0.2 }], [new HFXHapticParameterCurve("intensity", [{ time: 0, value: 0.1 }, { time: 0.5, value: 0.9 }], 0.2)]);
    const ahap = HFXHapticPatternCodec.encodeAHAP(pattern);
    const decoded = HFXHapticPatternCodec.decodeAHAP(ahap);
    expect(decoded.events).toEqual(pattern.events); expect(decoded.curves[0]!.valueAt(0.45)).toBeCloseTo(0.5);
    expect(() => HFXHapticPatternCodec.decodeAHAP('{"Version":2,"Pattern":[]}')).toThrow();
  });
  it("samples curves during continuous playback and applies dynamic changes on capable hosts", async () => {
    vi.useFakeTimers();
    try {
      const parameters = vi.fn(), emit = vi.fn();
      const cancel = vi.fn();
      const engine = new HFXHapticEngine({ supported: true, trigger: vi.fn(), event: emit, playerEvent: (_owner, ...args) => emit(...args), parameters, playerParameters: (_owner, values) => parameters(values), playerCancel: cancel, cancel, dispose: vi.fn(), capabilities: { amplitude: true, sharpness: true } });
      const player = engine.makeAdvancedPlayer(new HFXHapticPattern([{ type: "continuous", relativeTime: 0, duration: 1 }], [new HFXHapticParameterCurve("intensity", [{ time: 0, value: 0 }, { time: 1, value: 1 }])]));
      player.start(); await vi.advanceTimersByTimeAsync(500);
      expect(parameters.mock.calls.some(([values]) => values.some((value: { value: number }) => value.value > 0.4 && value.value < 0.6))).toBe(true);
      player.sendParameters([{ parameterID: "sharpness", value: 0.8, relativeTime: 0 }]);
      expect(parameters).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ parameterID: "sharpness", value: 0.8 })]));
      player.pause(); const count = parameters.mock.calls.length; await vi.advanceTimersByTimeAsync(100); expect(parameters).toHaveBeenCalledTimes(count);
      engine.dispose(); expect(engine.capabilities.state).toBe("disposed");
    } finally { vi.useRealTimers(); }
  });
  it("registers audio resources with owner identity and releases them on disposal", async () => {
    const unregister = vi.fn();
    const engine = new HFXHapticEngine({ supported: false, trigger: vi.fn(), cancel: vi.fn(), dispose: vi.fn(), registerAudioResource: async () => "owned-backend-id", unregisterAudioResource: unregister });
    const buffer = new AUFXAudioPCMBuffer(new AUFXAudioFormat(8000, 1), 800); buffer.frameLength = 800;
    const resource = await engine.registerAudioResource(buffer);
    expect(resource.duration).toBe(0.1);
    expect(() => engine.unregisterAudioResource({ ...resource })).toThrow();
    engine.dispose(); expect(unregister).toHaveBeenCalledWith("owned-backend-id");
  });
});
