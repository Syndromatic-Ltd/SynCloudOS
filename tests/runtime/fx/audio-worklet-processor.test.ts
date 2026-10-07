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

import { afterEach, expect, it, vi } from "vitest";
const saved = { AudioWorkletProcessor: (globalThis as any).AudioWorkletProcessor, registerProcessor: (globalThis as any).registerProcessor, currentFrame: (globalThis as any).currentFrame };
afterEach(() => { Object.assign(globalThis, saved); vi.restoreAllMocks(); });
const plan = (version = 1, gain = 1) => ({ version, sampleRate: 8000, channelCount: 1, outputId: 2, tapIds: [], nodes: [
  { id: 1, kind: "player", inputs: [], positionRevision: 1, playing: true, position: 0, rate: 1, schedules: [{ id: 7, time: 0, loop: true, channels: [new Float32Array([1, 2, 3, 4])] }] },
  { id: 2, kind: "mixer", inputs: [1], muted: false, volume: { initial: gain, events: [] } },
] });
let processorInvocation = 0;
async function loadProcessorRuntime() {
  switch (processorInvocation++) {
    case 0: return import("../../../src/FX/AudioFX/AUFXAudioRenderRuntime.js?processor-runtime-test-1");
    case 1: return import("../../../src/FX/AudioFX/AUFXAudioRenderRuntime.js?processor-runtime-test-2");
    case 2: return import("../../../src/FX/AudioFX/AUFXAudioRenderRuntime.js?processor-runtime-test-3");
    case 3: return import("../../../src/FX/AudioFX/AUFXAudioRenderRuntime.js?processor-runtime-test-4");
    default: throw new Error("Audio processor test exceeded its isolated runtime imports.");
  }
}
async function processor() { const registered = vi.fn(); class Base { port = { onmessage: null as any, postMessage: vi.fn() }; } Object.assign(globalThis, { AudioWorkletProcessor: Base, registerProcessor: registered, currentFrame: 0 }); await loadProcessorRuntime(); return new registered.mock.calls[0][1]({ processorOptions: { plan: plan() } }); }

it("renders the graph on the audio thread for variable quantum lengths", async () => {
  const value = await processor();
  const first = [new Float32Array(3)], second = [new Float32Array(5)];
  expect(value.process([], [first])).toBe(true); expect(Array.from(first[0])).toEqual([1, 2, 3]);
  expect(value.process([], [second])).toBe(true); expect(Array.from(second[0])).toEqual([4, 1, 2, 3, 4]);
});

it("acknowledges applied seek, pause and rate revisions before rendering their PCM", async () => {
  const registered = vi.fn(); class Base { port = { onmessage: null as any, postMessage: vi.fn() }; }
  Object.assign(globalThis, { AudioWorkletProcessor: Base, registerProcessor: registered, currentFrame: 512 });
  await import("../../../src/FX/AudioFX/AUFXAudioRenderRuntime.js?timeline-acknowledgement-test");
  const value = new registered.mock.calls[0][1]({ processorOptions: { plan: plan() } });
  const replacement: any = plan(2); replacement.nodes[0].positionRevision = 2; replacement.nodes[0].position = 2 / 8000;
  value.port.onmessage({ data: { type: "replace-plan", plan: replacement } });
  expect(value.port.postMessage).toHaveBeenCalledWith({ type: "plan-applied", version: 2, contextFrame: 512, players: [{ id: 1, position: 2 / 8000 }] });
  const output = [new Float32Array(2)]; value.process([], [output]);
  expect(Array.from(output[0])).toEqual([3, 4]);
  const paused: any = plan(3); paused.nodes[0].playing = false; paused.nodes[0].positionRevision = 2;
  Object.assign(globalThis, { currentFrame: 514 });
  value.port.onmessage({ data: { type: "replace-plan", plan: paused } });
  expect(value.port.postMessage).toHaveBeenLastCalledWith({ type: "plan-applied", version: 3, contextFrame: 514, players: [{ id: 1, position: 4 / 8000 }] });
  value.process([], [output]); expect(Array.from(output[0])).toEqual([0, 0]);
  const resumed: any = plan(4); resumed.nodes[0].positionRevision = 2; resumed.nodes[0].rate = 2;
  Object.assign(globalThis, { currentFrame: 516 });
  value.port.onmessage({ data: { type: "replace-plan", plan: resumed } });
  expect(value.port.postMessage).toHaveBeenLastCalledWith({ type: "plan-applied", version: 4, contextFrame: 516, players: [{ id: 1, position: 4 / 8000 }] });
  value.process([], [output]); expect(Array.from(output[0])).toEqual([1, 3]);
});

it("routes a variable-length native input bus only through an intentional graph connection", async () => {
  const registered = vi.fn(); class Base { port = { onmessage: null as any, postMessage: vi.fn() }; }
  Object.assign(globalThis, { AudioWorkletProcessor: Base, registerProcessor: registered, currentFrame: 0 });
  await import("../../../src/FX/AudioFX/AUFXAudioRenderRuntime.js?processor-input-test");
  const connected = { version: 1, sampleRate: 8000, channelCount: 1, outputId: 2, tapIds: [], nodes: [
    { id: 1, kind: "input", inputs: [], inputIndex: 0 },
    { id: 2, kind: "mixer", inputs: [1], muted: false, volume: { initial: 1, events: [] } },
  ] };
  const value = new registered.mock.calls[0][1]({ processorOptions: { plan: connected } });
  const output = [new Float32Array(5)];
  value.process([[new Float32Array([0.25, -0.5, 0.75])]], [output]);
  expect(Array.from(output[0])).toEqual([0.25, -0.5, 0.75, 0, 0]);
  value.port.onmessage({ data: { type: "replace-plan", plan: { ...connected, version: 2, nodes: [
    { id: 1, kind: "mixer", inputs: [], muted: false, volume: { initial: 1, events: [] } },
    { id: 2, kind: "input", inputs: [], inputIndex: 0 },
  ], outputId: 1, tapIds: [2] } } });
  const silent = [new Float32Array(3).fill(9)];
  value.process([[new Float32Array([1, 1, 1])]], [silent]);
  expect(Array.from(silent[0])).toEqual([0, 0, 0]);
});

it("rejects duplicate or out-of-range native input indexes", async () => {
  const { validateAUFXRenderPlan } = await import("../../../src/FX/AudioFX/AUFXAudioRenderRuntime.js?input-plan-validation");
  const base: any = { version: 1, sampleRate: 48000, channelCount: 1, outputId: 3, tapIds: [], nodes: [
    { id: 1, kind: "input", inputs: [], inputIndex: 0 }, { id: 2, kind: "input", inputs: [], inputIndex: 0 },
    { id: 3, kind: "mixer", inputs: [1, 2], muted: false, volume: { initial: 1, events: [] } },
  ] };
  expect(() => validateAUFXRenderPlan(base)).toThrow(/input/i);
  base.nodes[1] = { ...base.nodes[1], inputIndex: 4 };
  expect(() => validateAUFXRenderPlan(base)).toThrow(/input/i);
});

it("atomically applies newer plans and freezes render state while paused", async () => {
  const value = await processor();
  value.port.onmessage({ data: { type: "pause", paused: true } }); const silent = [new Float32Array(64).fill(9)]; value.process([], [silent]); expect(silent[0].every((sample: number) => sample === 0)).toBe(true); expect(value.runtime.sampleTime).toBe(0);
  const replacement: any = plan(2, 0.5); replacement.nodes[0].schedules[0].channels = null;
  value.port.onmessage({ data: { type: "replace-plan", plan: replacement } }); value.port.onmessage({ data: { type: "replace-plan", plan: plan(1, 0) } }); value.port.onmessage({ data: { type: "pause", paused: false } });
  const output = [new Float32Array(2)]; value.process([], [output]); expect(Array.from(output[0])).toEqual([0.5, 1]); expect(value.runtime.plan.version).toBe(2);
});

it("does not register when imported in the main browser realm", async () => {
  const registered = vi.fn(); class Base {} Object.assign(globalThis, { AudioWorkletProcessor: Base, registerProcessor: registered, currentFrame: undefined });
  await import("../../../src/FX/AudioFX/AUFXAudioRenderRuntime.js?main-realm-guard"); expect(registered).not.toHaveBeenCalled();
});

it("terminates safely when a future host supplies an over-budget quantum", async () => {
  const value = await processor(); const output = [new Float32Array(2049)]; expect(value.process([], [output])).toBe(false); expect(value.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "error", message: expect.stringMatching(/quantum/i) }));
});

it("bounds tap delivery to one in-flight packet and reports dropped quanta", async () => {
  const value = await processor(); value.port.onmessage({ data: { type: "replace-plan", plan: { ...plan(2), tapIds: [1] } } }); value.port.postMessage.mockClear();
  value.process([], [[new Float32Array(4)]]); value.process([], [[new Float32Array(4)]]); expect(value.port.postMessage.mock.calls.filter(([message]: any[]) => message.type === "tap")).toHaveLength(1);
  value.port.onmessage({ data: { type: "tap-ack" } }); value.process([], [[new Float32Array(4)]]); expect(value.port.postMessage.mock.calls.filter(([message]: any[]) => message.type === "tap").at(-1)?.[0]).toMatchObject({ dropped: 1 });
});
