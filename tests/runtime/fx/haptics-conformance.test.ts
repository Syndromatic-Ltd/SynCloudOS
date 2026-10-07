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
import { AUFXAudioFormat, AUFXAudioPCMBuffer } from "../../../src/FX/AudioFX/public";
import { HFXHapticEngine, type HFXHapticPort } from "../../../src/FX/HapticsFX/public";

function port(overrides: Partial<HFXHapticPort> = {}): HFXHapticPort {
  return {
    supported: true,
    trigger: vi.fn(),
    event: vi.fn(),
    parameters: vi.fn(),
    cancel: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  };
}

describe("HapticsFX semantic conformance", () => {
  it("reports precise, timing-approximate, unavailable and disposed dimensions independently", async () => {
    const precise = new HFXHapticEngine(port({
      capabilities: { amplitude: true, sharpness: true, timing: "precise", dynamicParameters: "precise" },
      audioState: "available",
    }));
    expect(precise.capabilities).toMatchObject({
      state: "available", timing: true, amplitude: true, sharpness: true, audio: true, dynamicParameters: true,
      fidelity: { timing: "precise", amplitude: "precise", sharpness: "precise", dynamicParameters: "precise", audio: "available" },
    });
    expect(precise.capabilities.reason).toBeNull();
    precise.dispose();

    const approximate = new HFXHapticEngine(port({
      capabilities: { amplitude: false, sharpness: false, timing: "approximate", amplitudeApproximation: "timing", dynamicParameters: "timing-approximation" },
      audioState: "unavailable",
    }));
    expect(approximate.capabilities).toMatchObject({
      state: "available", timing: true, amplitude: false, sharpness: false, audio: false, dynamicParameters: true,
      fidelity: { timing: "approximate", amplitude: "timing-approximation", sharpness: "unavailable", dynamicParameters: "timing-approximation", audio: "unavailable" },
    });
    expect(approximate.capabilities.reason).toMatch(/approximate|timing/i);
    approximate.dispose();

    const pcm = new AUFXAudioPCMBuffer(new AUFXAudioFormat(8_000, 1), 8); pcm.frameLength = 8;
    const audioOnly = new HFXHapticEngine(port({ supported: false, parameters: undefined, event: undefined, audioState: "available", registerAudioResource: async () => "audio" }));
    expect(audioOnly.capabilities).toMatchObject({
      state: "unavailable", timing: false, amplitude: false, sharpness: false, audio: true, dynamicParameters: false,
      fidelity: { timing: "unavailable", amplitude: "unavailable", sharpness: "unavailable", dynamicParameters: "unavailable", audio: "available" },
    });
    const resource = await audioOnly.registerAudioResource(pcm); expect(resource.id).toMatch(/^hfx-resource:/);
    expect(audioOnly.capabilities.reason).toMatch(/actuator|unavailable/i);
    audioOnly.dispose();
    expect(audioOnly.capabilities).toMatchObject({ state: "disposed", audioState: "disposed", fidelity: { timing: "unavailable", audio: "disposed" } });
  });

  it("keeps disabled vibration separate from audio-only output", () => {
    const event = vi.fn(), setVibrationEnabled = vi.fn();
    const engine = new HFXHapticEngine(port({ event, setVibrationEnabled }));
    engine.setVibrationEnabled(false);
    engine.emit({ type: "continuous", relativeTime: 0, duration: 0.1, intensity: 1 });
    expect(event).not.toHaveBeenCalled();
    engine.emit({ type: "audioContinuous", relativeTime: 0, duration: 0.1, intensity: 1 });
    expect(event).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: "audioContinuous" }), 0, 0, 1, 0.1);
    expect(setVibrationEnabled).toHaveBeenCalledWith(false);
    engine.dispose();
  });
});
