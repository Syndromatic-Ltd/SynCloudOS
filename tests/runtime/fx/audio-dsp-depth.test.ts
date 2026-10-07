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
import {
  AUFXAudioEffectNode,
  AUFXAudioEngine,
  AUFXAudioFormat,
  AUFXAudioPCMBuffer,
  AUFXAudioPlayerNode,
  AUFXAudioTimePitchNode,
} from "../../../src/FX/AudioFX/public";
import { AUFXAudioRenderRuntime, validateAUFXRenderPlan } from "../../../src/FX/AudioFX/AUFXAudioRenderRuntime.js";

const format = new AUFXAudioFormat(8_000, 1);

function pcm(frames: number, sample: (frame: number) => number) {
  const result = new AUFXAudioPCMBuffer(format, frames);
  result.frameLength = frames;
  for (let frame = 0; frame < frames; frame++) result.setSample(0, frame, sample(frame));
  return result;
}

function tone(frequency: number, frames = 8_000) {
  return pcm(frames, frame => Math.sin(2 * Math.PI * frequency * frame / format.sampleRate) * 0.25);
}

function rms(buffer: AUFXAudioPCMBuffer, start = 0, end = buffer.frameLength) {
  let energy = 0;
  for (let frame = start; frame < end; frame++) energy += buffer.getSample(0, frame) ** 2;
  return Math.sqrt(energy / Math.max(1, end - start));
}

function estimateFrequency(buffer: AUFXAudioPCMBuffer, start: number, end: number) {
  const crossings: number[] = [];
  let previous = buffer.getSample(0, start);
  for (let frame = start + 1; frame < end; frame++) {
    const current = buffer.getSample(0, frame);
    if (previous <= 0 && current > 0) {
      const fraction = -previous / (current - previous);
      crossings.push(frame - 1 + fraction);
    }
    previous = current;
  }
  if (crossings.length < 3) throw new Error("Insufficient zero crossings for frequency estimate.");
  return format.sampleRate * (crossings.length - 1) / (crossings.at(-1)! - crossings[0]!);
}

it("adds measured band-pass and notch transfer behavior without disturbing existing effect state", () => {
  const center = tone(1_000, 4_000), offCenter = tone(250, 4_000);
  const pass = new AUFXAudioEffectNode(format, { type: "bandpass", frequency: 1_000, q: 4 });
  const centerPassed = pass.render([center], 4_000, 0);
  pass.reset();
  const offPassed = pass.render([offCenter], 4_000, 0);
  expect(rms(centerPassed, 1_000)).toBeGreaterThan(rms(offPassed, 1_000) * 8);

  const notch = new AUFXAudioEffectNode(format, { type: "notch", frequency: 1_000, q: 4 });
  const rejected = notch.render([center], 4_000, 0);
  expect(rms(rejected, 1_000)).toBeLessThan(rms(center, 1_000) * 0.08);
});

it("shifts pitch without changing duration and stretches duration without shifting a sustained tone", () => {
  const source = tone(440);
  const shifted = new AUFXAudioTimePitchNode(format, { pitchSemitones: 7, timeScale: 1 }).processBuffer(source);
  expect(shifted.frameLength).toBe(source.frameLength);
  const target = 440 * 2 ** (7 / 12);
  const measuredShift = estimateFrequency(shifted, 2_000, 7_500);
  expect(Math.abs(1_200 * Math.log2(measuredShift / target))).toBeLessThanOrEqual(5);

  const stretched = new AUFXAudioTimePitchNode(format, { pitchSemitones: 0, timeScale: 1.5 }).processBuffer(source);
  expect(stretched.frameLength).toBe(Math.round(source.frameLength * 1.5));
  const measuredStretch = estimateFrequency(stretched, 2_500, 10_500);
  expect(Math.abs(1_200 * Math.log2(measuredStretch / 440))).toBeLessThanOrEqual(5);
});

it("uses the canonical streaming pitch renderer in direct and graph execution and reset clears its history", async () => {
  const source = tone(440, 2_048), directNode = new AUFXAudioTimePitchNode(format, { pitchSemitones: 5 });
  const direct = directNode.render([source], source.frameLength, 0);
  expect(directNode.algorithmLatency).toBeGreaterThan(0);
  expect(directNode.tailTime).toBeGreaterThan(0);
  directNode.reset();
  expect(rms(directNode.render([], 1_024, 0))).toBe(0);

  const engine = new AUFXAudioEngine(format), player = new AUFXAudioPlayerNode(format), graphNode = new AUFXAudioTimePitchNode(format, { pitchSemitones: 5 });
  engine.attach(player); engine.attach(graphNode); engine.connect(player, graphNode); engine.connect(graphNode, engine.mainMixerNode);
  player.scheduleBuffer(source); player.play();
  const graph = await engine.renderOffline(source.frameLength);
  for (let frame = 0; frame < source.frameLength; frame++) expect(graph.getSample(0, frame)).toBeCloseTo(direct.getSample(0, frame), 6);
  engine.dispose();
});

it("keeps non-unit stretch as a bounded finite-buffer contract and rejects it from the fixed-rate graph", async () => {
  const node = new AUFXAudioTimePitchNode(format, { timeScale: 1.25 });
  const engine = new AUFXAudioEngine(format), player = new AUFXAudioPlayerNode(format);
  engine.attach(player); engine.attach(node); engine.connect(player, node); engine.connect(node, engine.mainMixerNode);
  player.scheduleBuffer(tone(440, 256)); player.play();
  await expect(engine.renderOffline(256)).rejects.toThrow(/finite-buffer|time stretch/i);
  engine.dispose();
});

it("fails non-finite realtime samples and aggregate time-pitch work before publication", () => {
  const plan: any = {
    version: 1, sampleRate: 8_000, channelCount: 1, outputId: 3, tapIds: [], nodes: [
      { id: 1, kind: "input", inputs: [], inputIndex: 0, sampleRate: 8_000, channelCount: 1 },
      { id: 2, kind: "timePitch", inputs: [1], pitchRatio: 2 ** (5 / 12), timeScale: 1, windowFrames: 320, sampleRate: 8_000, channelCount: 1 },
      { id: 3, kind: "mixer", inputs: [2], muted: false, volume: { initial: 1, events: [] }, sampleRate: 8_000, channelCount: 1 },
    ],
  };
  const runtime = new AUFXAudioRenderRuntime(plan);
  expect(() => runtime.process(4, undefined, [[new Float32Array([0, Number.NaN, 0, 0])]])).toThrow(/finite/i);

  const nodes: any[] = [];
  for (let index = 0; index < 32; index++) nodes.push({ id: index + 1, kind: "timePitch", inputs: index ? [index] : [], pitchRatio: 2 ** (7 / 12), timeScale: 1, windowFrames: 1_920, sampleRate: 48_000, channelCount: 2 });
  nodes.push({ id: 33, kind: "mixer", inputs: [32], muted: false, volume: { initial: 1, events: [] }, sampleRate: 48_000, channelCount: 2 });
  expect(() => validateAUFXRenderPlan({ version: 1, sampleRate: 48_000, channelCount: 2, outputId: 33, tapIds: [], nodes } as any)).toThrow(/work budget/i);
});
