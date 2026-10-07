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
import { AUFXAudioFormat } from "../../../src/FX/AudioFX/AUFXAudioFormat";
import { AUFXAudioPCMBuffer } from "../../../src/FX/AudioFX/AUFXAudioPCMBuffer";
import type { AUFXAudioRealtimeSource } from "../../../src/FX/AudioFX/AUFXAudioGraphOutput";
import { BrowserAudioGraphOutput } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAudioGraphOutput";
import { BrowserAudioCaptureAdapter, connectBrowserAUFXInput } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAudioCaptureAdapter";
import { AUFXAudioEngine } from "../../../src/FX/AudioFX/AUFXAudioEngine";
import { getAUFXRealtimeNode } from "../../../src/FX/AudioFX/AUFXAudioRenderPlan";
const original = globalThis.AudioWorkletNode;
afterEach(() => { Object.defineProperty(globalThis, "AudioWorkletNode", { configurable: true, writable: true, value: original }); vi.restoreAllMocks(); });
function harness(addModule = vi.fn(async () => {})) { const posted: any[] = [], port = { onmessage: null as any, postMessage: vi.fn(message => posted.push(message)), close: vi.fn() }, node = { port, connect: vi.fn(), disconnect: vi.fn(), onprocessorerror: null as any }, construct = vi.fn(function (_context, _name, _options) { return node; }); Object.defineProperty(globalThis, "AudioWorkletNode", { configurable: true, writable: true, value: construct }); const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }, mediaSources: any[] = [], listeners = new Set<() => void>(), context = { state: "running", currentTime: 0, sampleRate: 48000, destination: {}, audioWorklet: { addModule }, getOutputTimestamp: vi.fn(() => ({ contextTime: 0.125, performanceTime: 4_250 })), createGain: vi.fn(() => gain), createMediaStreamSource: vi.fn(() => { const mediaSource = { connect: vi.fn(), disconnect: vi.fn() }; mediaSources.push(mediaSource); return mediaSource; }), addEventListener: vi.fn((_n, listener) => listeners.add(listener)), removeEventListener: vi.fn((_n, listener) => listeners.delete(listener)) } as unknown as AudioContext; return { addModule, posted, port, node, construct, gain, mediaSources, listeners, context }; }
function source(format: AUFXAudioFormat) { let listener: ((plan: any) => void) | null = null, version = 0; const received = vi.fn(), fallback = vi.fn((frames: number) => { const pcm = new AUFXAudioPCMBuffer(format, frames); pcm.frameLength = frames; return pcm; }); const plan = () => ({ version: ++version, sampleRate: format.sampleRate, channelCount: format.channelCount, outputId: 1, tapIds: [], nodes: [{ id: 1, kind: "mixer", inputs: [], muted: false, volume: { initial: 1, events: [] } }] }) as any; return { value: { snapshot: plan, subscribe: callback => { listener = callback; return () => { listener = null; }; }, receive: received, renderFallback: fallback } satisfies AUFXAudioRealtimeSource, received, fallback, update: () => listener?.(plan()) }; }

it("settles a timeline revision only after its matching audio-thread acknowledgement", async () => {
  const h = harness(), format = new AUFXAudioFormat(48000, 1), s = source(format);
  const output = new BrowserAudioGraphOutput(async () => h.context, new AbortController().signal, vi.fn());
  await output.start(format, s.value, vi.fn(), new AbortController().signal);
  try {
    expect(output.supportsTimelineTransport()).toBe(true);
    const plan = s.value.snapshot();
    const applied = output.applyTimelinePlan(plan, new AbortController().signal);
    let settled = false; void applied.then(() => { settled = true; });
    await Promise.resolve(); expect(settled).toBe(false);
    h.port.onmessage({ data: { type: "plan-applied", version: plan.version - 1, contextFrame: 128, players: [] } });
    await Promise.resolve(); expect(settled).toBe(false);
    h.port.onmessage({ data: { type: "plan-applied", version: plan.version, contextFrame: 256, players: [] } });
    expect(await applied).toEqual({ version: plan.version, contextFrame: 256, players: [] });
  } finally { output.dispose(); }
});

it("rejects pending timeline acknowledgements when the output stops", async () => {
  const h = harness(), format = new AUFXAudioFormat(48000, 1), s = source(format);
  const output = new BrowserAudioGraphOutput(async () => h.context, new AbortController().signal, vi.fn());
  await output.start(format, s.value, vi.fn(), new AbortController().signal);
  const applied = output.applyTimelinePlan(s.value.snapshot(), new AbortController().signal);
  const rejected = expect(applied).rejects.toMatchObject({ name: "AbortError" });
  output.stop(); await rejected; output.dispose();
});

it("sends a graph plan to AudioWorklet, bounds update backpressure, and ignores stale acknowledgements", async () => { const h = harness(), s = source(new AUFXAudioFormat(48000, 2)), output = new BrowserAudioGraphOutput(async () => h.context, new AbortController().signal, vi.fn()); await output.start(new AUFXAudioFormat(48000, 2), s.value, vi.fn(), new AbortController().signal); expect(h.construct.mock.calls[0][2].processorOptions.plan.nodes[0].kind).toBe("mixer"); expect(s.fallback).not.toHaveBeenCalled(); s.update(); expect(h.posted.at(-1)).toMatchObject({ type: "replace-plan", plan: { version: 2 } }); const count = h.posted.length; s.update(); s.update(); expect(h.posted).toHaveLength(count); h.port.onmessage({ data: { type: "plan-applied", version: 1 } }); expect(h.posted).toHaveLength(count); h.port.onmessage({ data: { type: "plan-applied", version: 2 } }); expect(h.posted.at(-1)).toMatchObject({ type: "replace-plan", plan: { version: 4 } }); h.port.onmessage({ data: { type: "state", sampleTime: 128, players: [] } }); expect(s.received).toHaveBeenCalledWith({ type: "state", sampleTime: 128, players: [] }); output.dispose(); });
it("keeps master and owner policy native while pause controls the render clock", async () => { const h = harness(), s = source(new AUFXAudioFormat(48000, 1)), output = new BrowserAudioGraphOutput(async () => h.context, new AbortController().signal, vi.fn()); output.setMasterVolume(0.5); output.setOwnerPolicy({ volume: 0.4, muted: false, paused: false }); await output.start(new AUFXAudioFormat(48000, 1), s.value, vi.fn(), new AbortController().signal); expect(h.gain.gain.value).toBeCloseTo(0.2); output.setOwnerPolicy({ volume: 0.4, muted: false, paused: true }); expect(h.posted.at(-1)).toEqual({ type: "pause", paused: true }); output.setOwnerPolicy({ volume: 0.25, muted: true, paused: false }); expect(h.gain.gain.value).toBe(0); expect(h.posted.some(item => item.type === "pause" && item.paused === false)).toBe(true); output.dispose(); });
it("reports the browser output timestamp and advances its clock generation across suspension", async () => { const h = harness(), format = new AUFXAudioFormat(48000, 1), s = source(format), output = new BrowserAudioGraphOutput(async () => h.context, new AbortController().signal, vi.fn()); expect(output.observeClock()).toBeNull(); await output.start(format, s.value, vi.fn(), new AbortController().signal); expect(output.observeClock()).toMatchObject({ samplePosition: 6000, sampleRate: 48000, domain: "output", hostAnchorSeconds: 4.25, discontinuityGeneration: 1 }); expect(output.observeClock()!.uncertaintySeconds).toBeGreaterThan(0); Object.assign(h.context, { state: "suspended" }); for (const listener of h.listeners) listener(); expect(output.observeClock()!.discontinuityGeneration).toBe(2); Object.assign(h.context, { state: "running" }); for (const listener of h.listeners) listener(); expect(output.observeClock()!.discontinuityGeneration).toBe(3); output.stop(); expect(output.observeClock()).toBeNull(); output.dispose(); });

it("does not anchor the output clock to a browser timestamp sentinel before output starts", async () => {
  const h = harness(), format = new AUFXAudioFormat(48_000, 1), s = source(format);
  Object.assign(h.context, { getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }) });
  const output = new BrowserAudioGraphOutput(async () => h.context, new AbortController().signal, vi.fn());
  await output.start(format, s.value, vi.fn(), new AbortController().signal);
  expect(output.observeClock()).toMatchObject({ domain: "output", hostAnchorSeconds: null, discontinuityGeneration: 1 });
  expect(output.observeClock()!.uncertaintySeconds).toBeGreaterThan(0.01);
  Object.assign(h.context, { getOutputTimestamp: () => ({ contextTime: 0.125, performanceTime: 4_250 }) });
  expect(output.observeClock()).toMatchObject({ samplePosition: 6000, hostAnchorSeconds: 4.25 });
  output.dispose();
});
it("cancels module loading without constructing a stale node", async () => { let resolve!: () => void; const h = harness(vi.fn(() => new Promise<void>(done => { resolve = done; }))), s = source(new AUFXAudioFormat(48000, 1)), run = new AbortController(), output = new BrowserAudioGraphOutput(async () => h.context, new AbortController().signal, vi.fn()); const start = output.start(new AUFXAudioFormat(48000, 1), s.value, vi.fn(), run.signal); await vi.waitFor(() => expect(h.addModule).toHaveBeenCalled()); run.abort(); resolve(); await expect(start).rejects.toThrow(/cancelled|abort/i); expect(h.construct).not.toHaveBeenCalled(); output.dispose(); });
it("delivers the latest graph revision when state changes during module loading", async () => { let resolve!: () => void; const h = harness(vi.fn(() => new Promise<void>(done => { resolve = done; }))), s = source(new AUFXAudioFormat(48000, 1)), output = new BrowserAudioGraphOutput(async () => h.context, new AbortController().signal, vi.fn()), start = output.start(new AUFXAudioFormat(48000, 1), s.value, vi.fn(), new AbortController().signal); await vi.waitFor(() => expect(h.addModule).toHaveBeenCalled()); s.update(); resolve(); await start; expect(h.posted.at(-1)).toMatchObject({ type: "replace-plan", plan: { version: 2 } }); output.dispose(); });
it("does not hide module failure behind the unsupported-host fallback", async () => { const failure = new DOMException("CSP denied", "SecurityError"), h = harness(vi.fn(async () => { throw failure; })), s = source(new AUFXAudioFormat(48000, 1)), output = new BrowserAudioGraphOutput(async () => h.context, new AbortController().signal, vi.fn()); await expect(output.start(new AUFXAudioFormat(48000, 1), s.value, vi.fn(), new AbortController().signal)).rejects.toBe(failure); expect(s.fallback).not.toHaveBeenCalled(); output.dispose(); });
it("rejects a worklet context whose sample rate cannot represent the graph format", async () => { const h = harness(), format = new AUFXAudioFormat(44100, 1), s = source(format), output = new BrowserAudioGraphOutput(async () => h.context, new AbortController().signal, vi.fn()); await expect(output.start(format, s.value, vi.fn(), new AbortController().signal)).rejects.toMatchObject({ name: "AUFXUnsupportedRealtimeFormatError" }); expect(h.addModule).not.toHaveBeenCalled(); expect(s.fallback).not.toHaveBeenCalled(); output.dispose(); });
it("retains suspended worklets, stops interrupted ones, and propagates processor errors", async () => { const h = harness(), s = source(new AUFXAudioFormat(48000, 1)), stopped = vi.fn(), output = new BrowserAudioGraphOutput(async () => h.context, new AbortController().signal, vi.fn()); await output.start(new AUFXAudioFormat(48000, 1), s.value, stopped, new AbortController().signal); Object.assign(h.context, { state: "suspended" }); for (const listener of h.listeners) listener(); expect(stopped).not.toHaveBeenCalled(); Object.assign(h.context, { state: "interrupted" }); for (const listener of h.listeners) listener(); expect(stopped).toHaveBeenCalledOnce(); output.dispose(); });
it("finishes reentrant throwing teardown and ignores saved worklet messages", async () => { const h = harness(), s = source(new AUFXAudioFormat(48000, 1)), release = vi.fn(), owner = new AbortController(), output = new BrowserAudioGraphOutput(async () => h.context, owner.signal, release); h.port.close.mockImplementation(() => { throw new Error("close"); }); h.node.disconnect.mockImplementation(() => { throw new Error("disconnect"); }); h.gain.disconnect.mockImplementation(() => { throw new Error("gain"); }); const stopped = vi.fn(() => output.dispose()); await output.start(new AUFXAudioFormat(48000, 1), s.value, stopped, new AbortController().signal); const saved = h.port.onmessage; expect(() => owner.abort()).not.toThrow(); expect(release).toHaveBeenCalledOnce(); expect(() => saved({ data: { type: "state", sampleTime: 64, players: [] } })).not.toThrow(); expect(s.received).not.toHaveBeenCalled(); });
it("continues the unsupported-host pause sweep when one source disconnect throws", async () => { Object.defineProperty(globalThis, "AudioWorkletNode", { configurable: true, writable: true, value: undefined }); const format = new AUFXAudioFormat(8000, 1), s = source(format), nativeSources: any[] = [], gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }, context = { state: "running", currentTime: 0, destination: {}, createGain: () => gain, createBuffer: () => ({ getChannelData: () => new Float32Array(160) }), createBufferSource: () => { const value = { buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), onended: null }; nativeSources.push(value); return value; } } as unknown as AudioContext, output = new BrowserAudioGraphOutput(async () => context, new AbortController().signal, vi.fn()); await output.start(format, s.value, vi.fn(), new AbortController().signal); nativeSources[0].disconnect.mockImplementation(() => { throw new Error("disconnect"); }); expect(() => output.setOwnerPolicy({ volume: 1, muted: false, paused: true })).not.toThrow(); expect(nativeSources.every(item => item.disconnect.mock.calls.length === 1)).toBe(true); output.dispose(); });

function authorizedInput(capability: object, format: AUFXAudioFormat) {
  const track = { readyState: "live", muted: false, enabled: true, stop: vi.fn(), getSettings: () => ({ sampleRate: 48000, channelCount: 1 }), addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  const platform = { getUserMedia: vi.fn(async () => stream), enumerateDevices: vi.fn(async () => []), createRecorder: vi.fn(), isTypeSupported: vi.fn(() => false), now: () => 0, subscribeDeviceChange: () => () => {} };
  const session = new BrowserAudioCaptureAdapter(platform).createSession(undefined, capability);
  return session.requestRecordAuthorization().then(() => ({ session, input: session.createInputNode(format), track }));
}

it("binds an authorized input directly to its fixed worklet port and tears it down", async () => {
  const h = harness(), format = new AUFXAudioFormat(48000, 1), capability = Object.freeze({}), capture = await authorizedInput(capability, format), output = new BrowserAudioGraphOutput(async () => h.context, new AbortController().signal, vi.fn(), capability), engine = new AUFXAudioEngine(format, output, capability);
  engine.attach(capture.input); engine.connect(capture.input, engine.mainMixerNode); await engine.start();
  expect(h.construct.mock.calls[0][2]).toMatchObject({ numberOfInputs: 4, channelCount: 1, channelCountMode: "explicit" });
  expect(h.context.createMediaStreamSource).toHaveBeenCalledOnce(); expect(h.mediaSources[0].connect).toHaveBeenCalledWith(h.node, 0, 0);
  const binding = getAUFXRealtimeNode(capture.input)!; expect(() => connectBrowserAUFXInput(binding.input!.token, capability, h.context, h.node as any, 0, new AbortController().signal)).toThrow(expect.objectContaining({ name: "SecurityError" }));
  expect(h.mediaSources[0].disconnect).not.toHaveBeenCalled(); output.setOwnerPolicy({ volume: 1, muted: false, paused: true }); expect(h.posted.at(-1)).toEqual({ type: "pause", paused: true }); expect(capture.track.enabled).toBe(false); output.setOwnerPolicy({ volume: 1, muted: false, paused: false }); expect(capture.track.enabled).toBe(true);
  capture.input.dispose(); expect(h.mediaSources[0].disconnect).toHaveBeenCalledOnce(); expect(capture.track.stop).toHaveBeenCalledOnce(); engine.dispose(); capture.session.dispose();
});

it("acquires and releases a second live input around the matching plan acknowledgement", async () => {
  const h = harness(), format = new AUFXAudioFormat(48000, 1), capability = Object.freeze({}), capture = await authorizedInput(capability, format), other = await authorizedInput(capability, format), output = new BrowserAudioGraphOutput(async () => h.context, new AbortController().signal, vi.fn(), capability), engine = new AUFXAudioEngine(format, output, capability);
  engine.attach(capture.input); engine.attach(other.input); engine.connect(capture.input, engine.mainMixerNode); await engine.start();
  const second = engine.connect(other.input, engine.mainMixerNode, { destinationBus: 1 });
  const addMessage = h.posted.at(-1); expect(addMessage).toMatchObject({ type: "replace-plan" });
  expect(addMessage.plan.nodes.filter((node: any) => node.kind === "input").map((node: any) => node.inputIndex)).toEqual([0, 1]);
  expect(h.mediaSources).toHaveLength(2); expect(h.mediaSources[1].connect).toHaveBeenCalledWith(h.node, 0, 1); expect(h.mediaSources[1].disconnect).not.toHaveBeenCalled();
  h.port.onmessage({ data: { type: "plan-applied", version: addMessage.plan.version } });
  engine.disconnect(second);
  const removeMessage = h.posted.at(-1); expect(removeMessage).toMatchObject({ type: "replace-plan" });
  expect(removeMessage.plan.nodes.filter((node: any) => node.kind === "input").map((node: any) => node.inputIndex)).toEqual([0]);
  expect(h.mediaSources[1].disconnect).not.toHaveBeenCalled();
  h.port.onmessage({ data: { type: "plan-applied", version: removeMessage.plan.version - 1 } }); expect(h.mediaSources[1].disconnect).not.toHaveBeenCalled();
  h.port.onmessage({ data: { type: "plan-applied", version: removeMessage.plan.version } }); expect(h.mediaSources[1].disconnect).toHaveBeenCalledOnce();
  expect(h.mediaSources[0].disconnect).not.toHaveBeenCalled(); expect(engine.isRunning).toBe(true); expect(engine.lastError).toBeNull(); engine.dispose(); capture.session.dispose(); other.session.dispose();
});

it("disconnects the native input immediately when its session is revoked first", async () => {
  const h = harness(), format = new AUFXAudioFormat(48000, 1), capability = Object.freeze({}), capture = await authorizedInput(capability, format), output = new BrowserAudioGraphOutput(async () => h.context, new AbortController().signal, vi.fn(), capability), engine = new AUFXAudioEngine(format, output, capability);
  engine.attach(capture.input); engine.connect(capture.input, engine.mainMixerNode); await engine.start(); capture.session.dispose();
  expect(h.mediaSources[0].disconnect).toHaveBeenCalledOnce(); expect(capture.track.stop).toHaveBeenCalledOnce(); expect(capture.input.state).toBe("disposed"); engine.dispose();
});

it("rejects cross-mount input authority and unsupported-host input fallback", async () => {
  const format = new AUFXAudioFormat(48000, 1), capability = Object.freeze({}), other = Object.freeze({}), capture = await authorizedInput(capability, format), h = harness(), output = new BrowserAudioGraphOutput(async () => h.context, new AbortController().signal, vi.fn(), other), engine = new AUFXAudioEngine(format, output, other);
  engine.attach(capture.input); engine.connect(capture.input, engine.mainMixerNode); await expect(engine.start()).rejects.toMatchObject({ name: "SecurityError" }); engine.dispose(); capture.session.dispose();
  Object.defineProperty(globalThis, "AudioWorkletNode", { configurable: true, writable: true, value: undefined }); const next = await authorizedInput(capability, format), fallback = source(format), plan = fallback.value.snapshot(); (plan.nodes as any[]).unshift({ id: 2, kind: "input", inputs: [], inputIndex: 0 }); fallback.value.snapshot = () => plan;
  const unsupported = new BrowserAudioGraphOutput(async () => h.context, new AbortController().signal, vi.fn(), capability); await expect(unsupported.start(format, fallback.value, vi.fn(), new AbortController().signal)).rejects.toMatchObject({ name: "AUFXUnsupportedRealtimeInputError" }); expect(fallback.fallback).not.toHaveBeenCalled(); unsupported.dispose(); next.session.dispose();
});
