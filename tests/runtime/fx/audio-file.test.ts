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
import { AUFXAudioFile, AUFXAudioFormat, AUFXAudioPCMBuffer } from "../../../src/FX/AudioFX/public";

it("reads owned PCM file frames with cursor/EOF and writes bounded segments", () => {
  const format = new AUFXAudioFormat(8000, 1), source = new AUFXAudioPCMBuffer(format, 4); source.frameLength = 4;
  for (let frame = 0; frame < 4; frame++) source.setSample(0, frame, frame / 4);
  const file = new AUFXAudioFile(source, "read-write", 8); source.setSample(0, 0, 99);
  const chunk = new AUFXAudioPCMBuffer(format, 3); expect(file.read(chunk, 2)).toBe(2); expect(chunk.getSample(0, 0)).toBe(0); expect(file.framePosition).toBe(2);
  file.framePosition = 4; file.write(chunk); expect(file.length).toBe(6);
  file.framePosition = 5; expect(file.read(chunk, 3)).toBe(1); expect(chunk.getSample(0, 0)).toBe(0.25); expect(file.read(chunk)).toBe(0);
  const decoded = AUFXAudioFile.decodeWAV(file.toWAV()); expect(decoded.frameLength).toBe(6); expect(decoded.getSample(0, 5)).toBeCloseTo(0.25, 4);
  expect(() => { file.framePosition = 7; }).toThrow(); file.dispose(); expect(() => file.read(chunk)).toThrow("disposed");
});

it("does not permit writes to read-only files or incompatible destinations", () => {
  const format = new AUFXAudioFormat(8000, 1), pcm = new AUFXAudioPCMBuffer(format, 4); pcm.frameLength = 4;
  const file = new AUFXAudioFile(pcm); expect(() => file.write(pcm)).toThrow("read-only");
  expect(() => file.read(new AUFXAudioPCMBuffer(new AUFXAudioFormat(16000, 1), 4))).toThrow();
});
