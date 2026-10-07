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

import { expect, it, vi } from "vitest";
import { AUFXAudioEffectNode, AUFXAudioEngine, AUFXAudioFormat, AUFXAudioInputNode, AUFXAudioNode, AUFXAudioPCMBuffer, AUFXAudioPlayerNode } from "../../../src/FX/AudioFX/public";
import type { AUFXAudioGraphOutput } from "../../../src/FX/AudioFX/AUFXAudioGraphOutput";
import { validateAUFXRenderPlan } from "../../../src/FX/AudioFX/AUFXAudioRenderRuntime.js";

class OfflineOnlyNode extends AUFXAudioNode {
  render(_inputs: readonly AUFXAudioPCMBuffer[], frames: number) { const output = new AUFXAudioPCMBuffer(this.format, frames); output.frameLength = frames; for (let frame = 0; frame < frames; frame++) output.setSample(0, frame, 0.25); return output; }
}
class OneShotNode extends AUFXAudioNode { private emitted = false; render(_inputs: readonly AUFXAudioPCMBuffer[], frames: number) { const output = new AUFXAudioPCMBuffer(this.format, frames); output.frameLength = frames; if (!this.emitted) { output.setSample(0, 0, 1); this.emitted = true; } return output; } }

it("keeps legitimate custom nodes offline but reports typed unsupported live rendering", async () => {
  const format = new AUFXAudioFormat(8000, 1), output: AUFXAudioGraphOutput = { start: vi.fn(async (_format, source) => { source.snapshot(); }), stop: vi.fn(), dispose: vi.fn() };
  const engine = new AUFXAudioEngine(format, output), custom = new OfflineOnlyNode(format); engine.attach(custom); engine.connect(custom, engine.mainMixerNode);
  const offline = await engine.renderOffline(2); expect(offline.getSample(0, 0)).toBe(0.25);
  await expect(engine.start()).rejects.toMatchObject({ name: "AUFXUnsupportedRealtimeNodeError" }); engine.dispose();
});

it("enforces the graph-wide realtime work budget before host activation", async () => {
  const format = new AUFXAudioFormat(48000, 32), output: AUFXAudioGraphOutput = { start: vi.fn(async (_format, source) => { const { AUFXAudioRenderRuntime } = await import("../../../src/FX/AudioFX/AUFXAudioRenderRuntime.js"); new AUFXAudioRenderRuntime(source.snapshot()); }), stop: vi.fn(), dispose: vi.fn() };
  const engine = new AUFXAudioEngine(format, output);
  const { AUFXAudioProcessor } = await import("../../../src/FX/AudioFX/AUFXAudioProcessor"); const processor = new AUFXAudioProcessor(format, Array(512).fill(1 / 512)); engine.attach(processor); engine.connect(processor, engine.mainMixerNode);
  await expect(engine.start()).rejects.toThrow(/work budget/i); engine.dispose();
});

it("retains canonical DSP history across consecutive offline renders", async () => {
  const format = new AUFXAudioFormat(8000, 1), engine = new AUFXAudioEngine(format), player = new AUFXAudioPlayerNode(format), delay = new AUFXAudioEffectNode(format, { type: "delay", delayTime: 4 / 8000, feedback: 0, wet: 1 }), impulse = new AUFXAudioPCMBuffer(format, 1); impulse.frameLength = 1; impulse.setSample(0, 0, 1);
  engine.attach(player); engine.attach(delay); engine.connect(player, delay); engine.connect(delay, engine.mainMixerNode); player.scheduleBuffer(impulse); player.play();
  const first = await engine.renderOffline(4), second = await engine.renderOffline(4); expect(first.getSample(0, 0)).toBe(0); expect(second.getSample(0, 0)).toBe(1); engine.dispose();
});

it("keeps canonical built-in DSP state around an offline-only custom node", async () => {
  const format = new AUFXAudioFormat(8000, 1), engine = new AUFXAudioEngine(format), custom = new OneShotNode(format), delay = new AUFXAudioEffectNode(format, { type: "delay", delayTime: 4 / 8000, feedback: 0, wet: 1 }); engine.attach(custom); engine.attach(delay); engine.connect(custom, delay); engine.connect(delay, engine.mainMixerNode);
  expect((await engine.renderOffline(4)).getSample(0, 0)).toBe(0); expect((await engine.renderOffline(4)).getSample(0, 0)).toBe(1); engine.dispose();
});

it("rejects malformed effects and graph-wide automation/edge work before allocation", () => {
  const base = { version: 1, sampleRate: 48000, channelCount: 1, outputId: 1, tapIds: [] };
  expect(() => validateAUFXRenderPlan({ ...base, nodes: [{ id: 1, kind: "effect", inputs: [], effect: { type: "delay", delayTime: 1e9, feedback: 2, wet: 99 } }] } as any)).toThrow(/delay/i);
  const events = Array.from({ length: 4096 }, (_, sampleTime) => ({ sampleTime, value: 1, ramp: false })); expect(() => validateAUFXRenderPlan({ ...base, outputId: 2, nodes: [1, 2].map(id => ({ id, kind: "mixer", inputs: id === 1 ? [] : [1], muted: false, volume: { initial: 1, events } })) } as any)).toThrow(/work budget/i);
  const nodes = Array.from({ length: 47 }, (_, index) => ({ id: index + 1, kind: "mixer", inputs: Array.from({ length: index }, (_, input) => input + 1), muted: false, volume: { initial: 1, events: [] } })); expect(() => validateAUFXRenderPlan({ ...base, outputId: 47, nodes } as any)).toThrow(/work budget/i);
});

it("rejects duplicate player schedule and tap identities", () => {
  const mixer = { id: 2, kind: "mixer", inputs: [1], muted: false, volume: { initial: 1, events: [] } };
  const schedule = { id: 7, time: 0, loop: false, channels: [new Float32Array([1])] };
  expect(() => validateAUFXRenderPlan({ version: 1, sampleRate: 48000, channelCount: 1, outputId: 2, tapIds: [], nodes: [{ id: 1, kind: "player", inputs: [], positionRevision: 0, position: 0, rate: 1, playing: true, schedules: [schedule, schedule] }, mixer] } as any)).toThrow(/player plan/i);
  expect(() => validateAUFXRenderPlan({ version: 1, sampleRate: 48000, channelCount: 1, outputId: 2, tapIds: [1, 1], nodes: [{ id: 1, kind: "mixer", inputs: [], muted: false, volume: { initial: 1, events: [] } }, { ...mixer, inputs: [1] }] } as any)).toThrow(/storage or work budget/i);
});

it("charges worst-case player schedule scanning and channel mixing to the graph work budget", () => {
  const schedules = Array.from({ length: 256 }, (_, id) => ({ id, time: 0, loop: true, channels: Array.from({ length: 32 }, () => new Float32Array([0])) }));
  const player = { id: 1, kind: "player", inputs: [], positionRevision: 0, position: 0, rate: 1, playing: true, schedules };
  const mixer = { id: 2, kind: "mixer", inputs: [1], muted: false, volume: { initial: 1, events: [] } };
  expect(() => validateAUFXRenderPlan({ version: 1, sampleRate: 48000, channelCount: 32, outputId: 2, tapIds: [], nodes: [player, mixer] } as any)).toThrow(/work budget/i);
});

it("rejects aggregate persistent DSP state before allocating node histories", () => {
  const nodes = Array.from({ length: 127 }, (_, index) => ({ id: index + 1, kind: "effect", inputs: index ? [index] : [], effect: { type: "delay", delayTime: 10, feedback: 0, wet: 1 } }));
  nodes.push({ id: 128, kind: "mixer", inputs: [127], muted: false, volume: { initial: 1, events: [] } } as any);
  expect(() => validateAUFXRenderPlan({ version: 1, sampleRate: 384000, channelCount: 1, outputId: 128, tapIds: [], nodes } as any)).toThrow(/storage or work budget/i);
});

it("includes in-flight tap copies in the aggregate storage quota", () => {
  const delayFrames = 396_428, sampleRate = 384000;
  const nodes: any[] = Array.from({ length: 42 }, (_, index) => ({ id: index + 1, kind: "effect", inputs: index ? [index] : [], effect: { type: "delay", delayTime: delayFrames / sampleRate, feedback: 0, wet: 1 } }));
  nodes.push({ id: 43, kind: "mixer", inputs: [42], muted: false, volume: { initial: 1, events: [] } });
  expect(() => validateAUFXRenderPlan({ version: 1, sampleRate, channelCount: 1, outputId: 43, tapIds: Array.from({ length: 32 }, (_, id) => id + 1), nodes } as any)).toThrow(/storage or work budget/i);
});

it("finishes stop state even when a host output throws", async () => {
  const output: AUFXAudioGraphOutput = { start: vi.fn(async () => {}), stop: vi.fn(() => { throw new Error("native stop"); }), dispose: vi.fn() }, engine = new AUFXAudioEngine(new AUFXAudioFormat(8000, 1), output); await engine.start(); expect(() => engine.stop()).not.toThrow(); expect(engine.isRunning).toBe(false); expect(engine.lastError).toEqual(expect.objectContaining({ message: "native stop" })); engine.dispose();
});

function syntheticInput(format: AUFXAudioFormat, capability: object) {
  return new AUFXAudioInputNode(format, { state: "active", sourceFormat: { sampleRate: format.sampleRate, channelCount: format.channelCount }, token: Object.freeze({}), capability, subscribe: () => () => {}, dispose: () => {} });
}

it("compiles disconnected input tap roots without monitoring them and rejects physical input offline", async () => {
  const format = new AUFXAudioFormat(48000, 1), capability = Object.freeze({}); let plan: any, inputs: any;
  const output: AUFXAudioGraphOutput = { start: vi.fn(async (_format, source) => { plan = source.snapshot(); inputs = source.inputs?.(plan); }), stop: vi.fn(), dispose: vi.fn() };
  const engine = new AUFXAudioEngine(format, output, capability), input = syntheticInput(format, capability); engine.attach(input); const tap = engine.installTap(input, vi.fn());
  await engine.start(); expect(plan.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "input", inputIndex: 0 })])); expect(plan.nodes.find((node: any) => node.id === plan.outputId).inputs).toEqual([]); expect(plan.tapIds).toContain(inputs[0].nodeId); engine.stop();
  await expect(engine.renderOffline(1)).rejects.toMatchObject({ name: "AUFXUnsupportedOfflineInputError" }); tap.dispose(); engine.dispose();
});

it("enforces the four-input startup topology bound", async () => {
  const format = new AUFXAudioFormat(48000, 1), capability = Object.freeze({}), output: AUFXAudioGraphOutput = { start: vi.fn(async (_format, source) => { source.snapshot(); }), stop: vi.fn(), dispose: vi.fn() }, engine = new AUFXAudioEngine(format, output, capability);
  for (let index = 0; index < 5; index++) { const input = syntheticInput(format, capability); engine.attach(input); engine.installTap(input, vi.fn()); }
  await expect(engine.start()).rejects.toThrow(/input-node limit/i); engine.dispose();
});

it("rejects a fifth live input root atomically and preserves the running four-input plan", async () => {
  const format = new AUFXAudioFormat(48000, 1), capability = Object.freeze({}); let source: any;
  const output: AUFXAudioGraphOutput = { start: vi.fn(async (_format, value) => { source = value; value.snapshot(); }), stop: vi.fn(), dispose: vi.fn() }, engine = new AUFXAudioEngine(format, output, capability);
  for (let index = 0; index < 4; index++) { const input = syntheticInput(format, capability); engine.attach(input); engine.installTap(input, vi.fn()); }
  const fifth = syntheticInput(format, capability); engine.attach(fifth); await engine.start(); const before = source.snapshot();
  expect(() => engine.installTap(fifth, vi.fn())).toThrow(/input-node limit/i); const after = source.snapshot();
  expect(after.nodes.filter((node: any) => node.kind === "input")).toHaveLength(4); expect(after.tapIds).toEqual(before.tapIds); expect(engine.isRunning).toBe(true); engine.dispose();
});
