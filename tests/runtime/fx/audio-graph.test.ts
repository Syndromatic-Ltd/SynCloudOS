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
import { AUFXAudioEngine, AUFXAudioPlayerNode, AUFXAudioMixerNode, AUFXAudioEffectNode, AUFXAudioFormat, AUFXAudioPCMBuffer, AUFXAudioAnalyser } from "../../../src/FX/AudioFX/public";
describe("AudioFX offline graph", () => {
  it("mixes scheduled owned buffers with gain automation and rejects cycles", async () => {
    const format = new AUFXAudioFormat(8000, 1), pcm = new AUFXAudioPCMBuffer(format, 8); pcm.frameLength = 8;
    for (let i = 0; i < 8; i++) pcm.setSample(0, i, 1);
    const engine = new AUFXAudioEngine(format), player = new AUFXAudioPlayerNode(format), mixer = new AUFXAudioMixerNode(format);
    engine.attach(player); engine.attach(mixer); engine.connect(player, mixer); engine.connect(mixer, engine.mainMixerNode);
    expect(() => engine.connect(engine.mainMixerNode, mixer)).toThrow("cycle");
    player.scheduleBuffer(pcm, 0); player.play(); mixer.volume.setValueAtTime(0, 0); mixer.volume.linearRampToValueAtTime(1, 0.001);
    const result = await engine.renderOffline(8);
    expect(result.getSample(0, 0)).toBe(0); expect(result.getSample(0, 4)).toBeCloseTo(0.5);
    engine.dispose(); expect(() => engine.attach(player)).toThrow();
  });
  it("renders delay and measures owned output with cancellation", async () => {
    const format = new AUFXAudioFormat(8000, 1), pcm = new AUFXAudioPCMBuffer(format, 8); pcm.frameLength = 8; pcm.setSample(0, 0, 1);
    const engine = new AUFXAudioEngine(format), player = new AUFXAudioPlayerNode(format), delay = new AUFXAudioEffectNode(format, { type: "delay", delayTime: 0.0005, feedback: 0, wet: 1 });
    engine.attach(player); engine.attach(delay); engine.connect(player, delay); engine.connect(delay, engine.mainMixerNode); player.scheduleBuffer(pcm); player.play();
    const output = await engine.renderOffline(8);
    expect(output.getSample(0, 0)).toBe(0); expect(output.getSample(0, 4)).toBe(1);
    expect(AUFXAudioAnalyser.level(output).peak).toBe(1);
    const controller = new AbortController(); controller.abort();
    await expect(engine.renderOffline(8, controller.signal)).rejects.toThrow();
  });
});
