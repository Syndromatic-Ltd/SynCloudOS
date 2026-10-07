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

import type { AUFXAudioFormat } from "../../FX/AudioFX/AUFXAudioFormat";
import type { AUFXAudioRealtimeSource } from "../../FX/AudioFX/AUFXAudioGraphOutput";
import type { AUFXRenderEvent, AUFXRenderPlan } from "../../FX/AudioFX/AUFXAudioRenderPlan";
import type { AUFXAudioPlanAcknowledgement } from "../../FX/AudioFX/AUFXAudioTimelineTransport";
import workletModuleURL from "../../FX/AudioFX/AUFXAudioRenderRuntime.js?url&no-inline";
import { validateAUFXRenderPlan } from "../../FX/AudioFX/AUFXAudioRenderRuntime.js";
import { connectBrowserAUFXInput, type BrowserAUFXInputConnection } from "./BrowserAudioCaptureAdapter";
export const AUFX_AUDIO_WORKLET_PROCESSOR = "syncloudos-aufx-output";
export const AUFX_AUDIO_WORKLET_MODULE_URL = workletModuleURL;
type Message = AUFXRenderEvent | { type: "error"; message: string } | ({ type: "plan-applied"; version: number } & Partial<AUFXAudioPlanAcknowledgement>);
type InputBinding = Readonly<{ nodeId: number; inputIndex: number; token: object; capability: object }>;
type ActiveInputBinding = InputBinding & Readonly<{ connection: BrowserAUFXInputConnection }>;

/** Private graph-plan transport. Supported graph DSP executes in AudioWorkletGlobalScope. */
export class AUFXAudioWorkletTransport {
  #timelineWaiter: { version: number; resolve: (value: AUFXAudioPlanAcknowledgement) => void; reject: (error: unknown) => void; cleanup: () => void } | null = null;
  applyTimelinePlan(plan: AUFXRenderPlan, signal: AbortSignal): Promise<AUFXAudioPlanAcknowledgement> {
    signal.throwIfAborted();
    if (this.#disposed || !this.#node) throw new DOMException("Audio worklet is unavailable.", "AbortError");
    if (this.#timelineWaiter) throw new DOMException("An audio timeline acknowledgement is pending.", "InvalidStateError");
    validateAUFXRenderPlan(plan); this.#inputsFor(plan);
    return new Promise((resolve, reject) => {
      const abort = () => this.#rejectTimeline(signal.reason ?? new DOMException("Audio timeline transition cancelled.", "AbortError"));
      const timeout = setTimeout(() => this.#rejectTimeline(new DOMException("Audio worklet did not acknowledge the timeline revision.", "TimeoutError")), 5_000);
      this.#timelineWaiter = { version: plan.version, resolve, reject, cleanup: () => { clearTimeout(timeout); signal.removeEventListener("abort", abort); } };
      signal.addEventListener("abort", abort, { once: true });
      this.#queuePlan(plan);
    });
  }
  #rejectTimeline(error: unknown) {
    const waiter = this.#timelineWaiter; this.#timelineWaiter = null;
    if (waiter) { waiter.cleanup(); waiter.reject(error); }
  }
  static isSupported(context: AudioContext) { return !!context.audioWorklet && typeof globalThis.AudioWorkletNode === "function"; }
  readonly #context: AudioContext; readonly #format: AUFXAudioFormat; readonly #source: AUFXAudioRealtimeSource; readonly #failed: (error: unknown) => void; readonly #capability: object;
  #node: AudioWorkletNode | null = null; #unsubscribe: (() => void) | null = null; #paused = false; #disposed = false; #planInFlightVersion: number | null = null; #queuedPlan: AUFXRenderPlan | null = null; #inFlightInputs: readonly InputBinding[] | null = null; #signal: AbortSignal | null = null; readonly #inputConnections = new Map<number, ActiveInputBinding>(); readonly #sentSchedules = new Set<string>();
  constructor(context: AudioContext, format: AUFXAudioFormat, source: AUFXAudioRealtimeSource, failed: (error: unknown) => void, capability: object = Object.freeze({})) { this.#context = context; this.#format = format; this.#source = source; this.#failed = failed; this.#capability = capability; }
  async start(destination: AudioNode, signal: AbortSignal) {
    signal.throwIfAborted(); if (this.#format.sampleRate !== this.#context.sampleRate) { const error = new Error(`AudioWorklet output requires the context sample rate (${this.#context.sampleRate} Hz), received ${this.#format.sampleRate} Hz.`); error.name = "AUFXUnsupportedRealtimeFormatError"; throw error; } const plan = this.#source.snapshot(); validateAUFXRenderPlan(plan); const inputs = this.#inputsFor(plan); this.#rememberSchedules(plan); this.#signal = signal; this.#unsubscribe = this.#source.subscribe(next => this.#queuePlan(next)); await this.#context.audioWorklet.addModule(AUFX_AUDIO_WORKLET_MODULE_URL); signal.throwIfAborted(); if (this.#disposed) throw new Error("Audio graph worklet start was cancelled.");
    const node = new AudioWorkletNode(this.#context, AUFX_AUDIO_WORKLET_PROCESSOR, { numberOfInputs: 4, numberOfOutputs: 1, outputChannelCount: [this.#format.channelCount], channelCount: this.#format.channelCount, channelCountMode: "explicit", channelInterpretation: "speakers", processorOptions: { plan } }); this.#node = node;
    node.port.onmessage = event => this.#receive(event.data as Message); node.onprocessorerror = () => this.#failed(new Error("Audio graph worklet processor terminated.")); node.connect(destination);
    try { this.#prepareInputs(inputs); }
    catch (error) { this.dispose(); throw error; }
    this.#sendPlan();
  }
  #inputsFor(plan: AUFXRenderPlan): readonly InputBinding[] { const inputs = this.#source.inputs?.(plan) ?? []; this.#validateInputs(plan, inputs); return Object.freeze(inputs.map(input => Object.freeze({ ...input }))); }
  #validateInputs(plan: AUFXRenderPlan, inputs: readonly InputBinding[]) { const planned = plan.nodes.filter(node => node.kind === "input"); if (inputs.length !== planned.length || inputs.length > 4) throw new Error("Audio graph input bindings do not match its worklet topology."); const seen = new Set<number>(); for (const input of inputs) { if (input.capability !== this.#capability || !Number.isInteger(input.inputIndex) || input.inputIndex < 0 || input.inputIndex >= 4 || seen.has(input.inputIndex) || !planned.some(node => node.id === input.nodeId && node.inputIndex === input.inputIndex)) throw new DOMException("Audio input does not belong to this mounted graph.", "SecurityError"); seen.add(input.inputIndex); } }
  #prepareInputs(inputs: readonly InputBinding[]) {
    const node = this.#node, signal = this.#signal; if (!node || !signal) throw new Error("Audio graph worklet input host is unavailable.");
    const occupied = new Map<number, ActiveInputBinding>(); for (const active of this.#inputConnections.values()) occupied.set(active.inputIndex, active);
    for (const input of inputs) {
      const active = this.#inputConnections.get(input.nodeId);
      if (active) {
        if (active.inputIndex !== input.inputIndex || active.token !== input.token || active.capability !== input.capability) { const error = new Error("Live audio input cannot move between worklet ports within one revision."); error.name = "AUFXInputPortReassignmentError"; throw error; }
        continue;
      }
      const occupant = occupied.get(input.inputIndex);
      if (occupant) { const error = new Error("Live audio input port replacement requires the previous revision acknowledgement."); error.name = "AUFXInputPortReassignmentError"; throw error; }
      const connection = connectBrowserAUFXInput(input.token, this.#capability, this.#context, node, input.inputIndex, signal); connection.setPaused(this.#paused);
      const value = Object.freeze({ ...input, connection }); this.#inputConnections.set(input.nodeId, value); occupied.set(input.inputIndex, value);
    }
  }
  #finalizeInputs(inputs: readonly InputBinding[]) { const retained = new Set(inputs.map(input => input.nodeId)); for (const [nodeId, active] of [...this.#inputConnections]) if (!retained.has(nodeId)) { this.#inputConnections.delete(nodeId); try { active.connection.dispose(); } catch { /* Continue releasing every acknowledged input. */ } } }
  #rememberSchedules(plan: AUFXRenderPlan) { for (const node of plan.nodes) if (node.kind === "player") for (const item of node.schedules) this.#sentSchedules.add(`${node.id}:${item.id}`); }
  #compactPlan(plan: AUFXRenderPlan): AUFXRenderPlan { const active = new Set<string>(); const nodes = plan.nodes.map(node => node.kind !== "player" ? node : Object.freeze({ ...node, schedules: Object.freeze(node.schedules.map(item => { const key = `${node.id}:${item.id}`; active.add(key); if (!node.retainForTimeline && this.#sentSchedules.has(key)) return Object.freeze({ ...item, channels: null }); this.#sentSchedules.add(key); return item; })) })); for (const key of [...this.#sentSchedules]) if (!active.has(key)) this.#sentSchedules.delete(key); return Object.freeze({ ...plan, nodes: Object.freeze(nodes) }); }
  #queuePlan(plan: AUFXRenderPlan) { if (this.#disposed) return; try { validateAUFXRenderPlan(plan); this.#inputsFor(plan); if (this.#queuedPlan?.version === this.#timelineWaiter?.version && plan.version !== this.#queuedPlan?.version) this.#rejectTimeline(new DOMException("Audio timeline revision was superseded before dispatch.", "AbortError")); this.#queuedPlan = plan; this.#sendPlan(); } catch (error) { this.#rejectTimeline(error); this.#failed(error); } }
  #sendPlan() { if (this.#planInFlightVersion !== null || !this.#queuedPlan || !this.#node) return; try { const plan = this.#compactPlan(this.#queuedPlan), inputs = this.#inputsFor(plan); this.#prepareInputs(inputs); this.#queuedPlan = null; this.#planInFlightVersion = plan.version; this.#inFlightInputs = inputs; this.#node.port.postMessage({ type: "replace-plan", plan }); } catch (error) { this.#failed(error); } }
  #receive(message: Message) {
    if (this.#disposed) return;
    if (message.type === "error") { this.#rejectTimeline(new Error(message.message)); this.#failed(new Error(message.message)); return; }
    if (message.type === "plan-applied") {
      if (message.version !== this.#planInFlightVersion) return;
      const inputs = this.#inFlightInputs ?? []; this.#planInFlightVersion = null; this.#inFlightInputs = null; this.#finalizeInputs(inputs);
      const waiter = this.#timelineWaiter;
      if (waiter?.version === message.version) {
        if (!Number.isSafeInteger(message.contextFrame) || message.contextFrame! < 0 || !Array.isArray(message.players) || message.players.some(player => !Number.isSafeInteger(player.id) || !Number.isFinite(player.position) || player.position < 0))
          this.#rejectTimeline(new DOMException("Audio worklet acknowledgement omitted its applied sample position.", "InvalidStateError"));
        else {
          this.#timelineWaiter = null; waiter.cleanup();
          waiter.resolve(Object.freeze({ version: message.version, contextFrame: message.contextFrame!, players: Object.freeze(message.players.map(player => Object.freeze({ ...player }))) }));
        }
      }
      this.#sendPlan(); return;
    }
    try { this.#source.receive(message); if (message.type === "tap") this.#node?.port.postMessage({ type: "tap-ack" }); } catch (error) { this.#failed(error); }
  }
  setPaused(paused: boolean) { if (this.#disposed || this.#paused === paused) return; this.#paused = paused; for (const active of this.#inputConnections.values()) { try { active.connection.setPaused(paused); } catch { /* Continue every owned input lease. */ } } this.#node?.port.postMessage({ type: "pause", paused }); }
  flush() { if (!this.#disposed) this.#queuePlan(this.#source.snapshot()); }
  dispose() { if (this.#disposed) return; this.#disposed = true; this.#rejectTimeline(new DOMException("Audio worklet was disposed before acknowledgement.", "AbortError")); this.#queuedPlan = null; this.#planInFlightVersion = null; this.#inFlightInputs = null; this.#signal = null; const cleanup = (action: () => void) => { try { action(); } catch { /* Continue independent native teardown. */ } }; const unsubscribe = this.#unsubscribe; this.#unsubscribe = null; cleanup(() => unsubscribe?.()); const connections = [...this.#inputConnections.values()]; this.#inputConnections.clear(); for (const active of connections) cleanup(() => active.connection.dispose()); const node = this.#node; this.#node = null; if (node) { node.port.onmessage = null; node.onprocessorerror = null; cleanup(() => node.port.postMessage({ type: "stop" })); cleanup(() => node.port.close()); cleanup(() => node.disconnect()); } }
}
