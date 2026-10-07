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

import { describe, expect, it } from "vitest";
import { AUFXAudioFormat, AUFXAudioPCMBuffer, AUFXAudioTime, AUFXAudioFile, AUFXAudioConverter } from "../../../src/FX/AudioFX/public";
describe("AudioFX PCM values", () => {
  it("validates formats and frame ownership", () => {
    expect(() => new AUFXAudioFormat(0, 2)).toThrow();
    const format = new AUFXAudioFormat(48000, 2, true);
    const buffer = new AUFXAudioPCMBuffer(format, 4);
    buffer.frameLength = 4;
    buffer.setSample(1, 2, 0.75);
    expect(buffer.getSample(1, 2)).toBe(0.75);
    expect(buffer.copy().getSample(1, 2)).toBe(0.75);
    expect(() => { buffer.frameLength = 5; }).toThrow();
    expect(new AUFXAudioTime(48000, 48000).seconds).toBe(1);
  });
  it("round trips WAV and converts sample rate without sharing storage", () => {
    const buffer = new AUFXAudioPCMBuffer(new AUFXAudioFormat(8000, 1), 4);
    buffer.frameLength = 4;
    [0, 0.5, -0.5, 1].forEach((v, i) => buffer.setSample(0, i, v));
    const wav = AUFXAudioFile.encodeWAV(buffer);
    const decoded = AUFXAudioFile.decodeWAV(wav);
    expect(decoded.getSample(0, 1)).toBeCloseTo(0.5, 4);
    expect(AUFXAudioConverter.convert(decoded, new AUFXAudioFormat(16000, 1)).frameLength).toBe(8);
    expect(() => AUFXAudioFile.decodeWAV(new ArrayBuffer(4))).toThrow();
  });
});
