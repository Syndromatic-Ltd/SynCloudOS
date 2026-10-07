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

import { it, expect } from "vitest";
import { AUFXAudioAnalyser, AUFXAudioEngine, AUFXAudioFormat, AUFXAudioPCMBuffer, AUFXAudioPlayerNode, AUFXAudioProcessor } from "../../../src/FX/AudioFX/public";
it("finds a synthetic tone's spectrum and confines taps to attached owned nodes", async () => {
  const format = new AUFXAudioFormat(8192, 1), pcm = new AUFXAudioPCMBuffer(format, 1024); pcm.frameLength = 1024;
  for (let frame = 0; frame < 1024; frame++) pcm.setSample(0, frame, Math.sin(2 * Math.PI * 1024 * frame / 8192));
  const spectrum = AUFXAudioAnalyser.spectrum(pcm, 1024);
  expect(spectrum.magnitudes.indexOf(Math.max(...spectrum.magnitudes))).toBe(128);
  const engine = new AUFXAudioEngine(format), player = new AUFXAudioPlayerNode(format), foreign = new AUFXAudioPlayerNode(format);
  engine.attach(player); engine.connect(player, engine.mainMixerNode); player.scheduleBuffer(pcm); player.play();
  expect(() => engine.installTap(foreign, () => {})).toThrow("attached");
  let observed = 0; const tap = engine.installTap(player, buffer => { observed += buffer.frameLength; buffer.setSample(0, 0, 100); });
  const output = await engine.renderOffline(1024); expect(observed).toBe(1024); expect(output.getSample(0, 0)).toBe(0); tap.dispose(); engine.dispose();
});
it("runs bounded custom FIR processing and cancels offline work between blocks", async () => {
  const format = new AUFXAudioFormat(8000, 1), pcm = new AUFXAudioPCMBuffer(format, 4096); pcm.frameLength = 4096; pcm.setSample(0, 0, 1);
  const engine = new AUFXAudioEngine(format), player = new AUFXAudioPlayerNode(format), processor = new AUFXAudioProcessor(format, [0.5, 0.25]);
  engine.attach(player); engine.attach(processor); engine.connect(player, processor); engine.connect(processor, engine.mainMixerNode); player.scheduleBuffer(pcm); player.play();
  const output = await engine.renderOffline(8); expect(output.getSample(0, 0)).toBe(0.5); expect(output.getSample(0, 1)).toBe(0.25);
  const controller = new AbortController(); engine.installTap(player, () => controller.abort());
  await expect(engine.renderOffline(4096, controller.signal)).rejects.toThrow(); engine.dispose();
});
