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
import { AUFXAudioEffectNode, AUFXAudioFormat, AUFXAudioPCMBuffer } from "../../../src/FX/AudioFX/public";
const format = new AUFXAudioFormat(8000, 1);
function pcm(frames: number, sample: (frame: number) => number) { const result = new AUFXAudioPCMBuffer(format, frames); result.frameLength = frames; for (let frame = 0; frame < frames; frame++) result.setSample(0, frame, sample(frame)); return result; }

it("equalizes a measured center-frequency tone and resets filter history", () => {
  const node = new AUFXAudioEffectNode(format, { type: "equalizer", bands: [{ frequency: 1000, gain: 6, q: 2 }] });
  const input = pcm(800, frame => Math.sin(2 * Math.PI * frame / 8) * 0.1), output = node.render([input], 800, 0);
  expect(output.getSample(0, 794) / input.getSample(0, 794)).toBeCloseTo(10 ** (6 / 20), 3);
  node.reset(); const silent = node.render([], 128, 0); expect(silent.getSample(0, 0)).toBe(0);
});

it("renders a diffuse decaying reverb tail with deterministic reset", () => {
  const node = new AUFXAudioEffectNode(format, { type: "reverb", decayTime: 0.5, wet: 1, damping: 0.3 });
  const input = pcm(8000, frame => frame === 0 ? 1 : 0), output = node.render([input], 8000, 0);
  const energy = (start: number, end: number) => { let value = 0; for (let frame = start; frame < end; frame++) value += output.getSample(0, frame) ** 2; return value; };
  expect(output.getSample(0, 0)).toBe(0); expect(energy(200, 2000)).toBeGreaterThan(0.01); expect(energy(6000, 8000)).toBeLessThan(energy(200, 2000) / 100);
  node.reset(); expect(node.render([], 8000, 0).getSample(0, 250)).toBe(0);
});

it("compresses with attack/release gain envelopes rather than instantaneous clipping", () => {
  const node = new AUFXAudioEffectNode(format, { type: "compression", threshold: 0.25, ratio: 4, attackTime: 0.01, releaseTime: 0.05, knee: 0 });
  const output = node.render([pcm(2400, frame => frame < 800 ? 1 : 0.1)], 2400, 0);
  expect(output.getSample(0, 0)).toBeGreaterThan(0.9); expect(output.getSample(0, 799)).toBeCloseTo(0.25 * 4 ** 0.25, 3);
  expect(output.getSample(0, 800)).toBeLessThan(0.05); expect(output.getSample(0, 2399)).toBeGreaterThan(0.098);
});
