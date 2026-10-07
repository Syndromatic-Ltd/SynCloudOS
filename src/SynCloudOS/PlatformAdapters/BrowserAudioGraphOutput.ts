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

import type { AUFXAudioGraphOutput, AUFXAudioRealtimeSource } from "../../FX/AudioFX/AUFXAudioGraphOutput";
import type { AUFXAudioFormat } from "../../FX/AudioFX/AUFXAudioFormat";
import { AUFXClockObservation } from "../../FX/AudioFX/AUFXClockObservation";
import { AUFXAudioWorkletTransport } from "./AUFXAudioWorkletTransport";
import type { AUFXRenderPlan } from "../../FX/AudioFX/AUFXAudioRenderPlan";
import type { AUFXAudioPlanAcknowledgement } from "../../FX/AudioFX/AUFXAudioTimelineTransport";

/** Scoped browser output: audio-thread graph DSP where supported, bounded PCM scheduling otherwise. */
export class BrowserAudioGraphOutput implements AUFXAudioGraphOutput {
  #prepare: (format: AUFXAudioFormat) => Promise<AudioContext>;
  #gain: GainNode | null = null;
  #context: AudioContext | null = null;
  #format: AUFXAudioFormat | null = null;
  #worklet: AUFXAudioWorkletTransport | null = null;
  #contextCleanup: (() => void) | null = null;
  #sources = new Set<AudioBufferSourceNode>();
  #timer: ReturnType<typeof setInterval> | null = null;
  #pump: (() => void) | null = null;
  #stopped: ((error?: unknown) => void) | null = null;
  #cleanup: (() => void) | null = null;
  #disposed = false;
  #generation = 0;
  #clockGeneration = 0;
  #volume = 1;
  #ownerVolume = 1;
  #muted = false;
  #paused = false;
  #reschedule = false;
  #release: () => void;
  #ownerCleanup: () => void;
  readonly #inputCapability: object;
  constructor(prepare: (format: AUFXAudioFormat) => Promise<AudioContext>, signal: AbortSignal, release: () => void, inputCapability: object = Object.freeze({})) {
    signal.throwIfAborted(); this.#prepare = prepare; this.#release = release;
    this.#inputCapability = inputCapability;
    const abort = () => this.dispose(); signal.addEventListener("abort", abort, { once: true });
    this.#ownerCleanup = () => signal.removeEventListener("abort", abort);
  }
  #applyGain() { if (this.#gain) this.#gain.gain.value = this.#volume * this.#ownerVolume * (this.#muted || this.#paused ? 0 : 1); }
  supportsTimelineTransport(): boolean { return !this.#disposed && !this.#paused && this.#context?.state === "running" && this.#worklet !== null; }
  applyTimelinePlan(plan: AUFXRenderPlan, signal: AbortSignal): Promise<AUFXAudioPlanAcknowledgement> {
    signal.throwIfAborted();
    if (!this.supportsTimelineTransport()) throw new DOMException("Acknowledged timeline playback requires a running AudioWorklet output.", "NotSupportedError");
    return this.#worklet!.applyTimelinePlan(plan, signal);
  }
  observeClock() {
    const context = this.#context, format = this.#format;
    if (!context || !format || !this.#stopped) return null;
    const outputTimestamp = typeof context.getOutputTimestamp === "function" ? context.getOutputTimestamp() : null;
    if (outputTimestamp?.contextTime === 0 && outputTimestamp.performanceTime === 0)
      return new AUFXClockObservation({ samplePosition: Math.round(context.currentTime * format.sampleRate),
        sampleRate: format.sampleRate, domain: "output", hostAnchorSeconds: null,
        uncertaintySeconds: Math.max(0.05, 128 / format.sampleRate), discontinuityGeneration: this.#clockGeneration });
    const timestampContextTime = outputTimestamp?.contextTime, timestampPerformanceTime = outputTimestamp?.performanceTime;
    const contextTime = typeof timestampContextTime === "number" && Number.isFinite(timestampContextTime) ? timestampContextTime : context.currentTime;
    const performanceTime = typeof timestampPerformanceTime === "number" && Number.isFinite(timestampPerformanceTime)
      ? timestampPerformanceTime / 1000
      : typeof performance !== "undefined" && Number.isFinite(performance.now()) ? performance.now() / 1000 : null;
    if (!Number.isFinite(contextTime) || contextTime < 0) return null;
    return new AUFXClockObservation({
      samplePosition: Math.round(contextTime * format.sampleRate),
      sampleRate: format.sampleRate,
      domain: "output",
      hostAnchorSeconds: performanceTime,
      uncertaintySeconds: 128 / format.sampleRate,
      discontinuityGeneration: this.#clockGeneration,
    });
  }
  setMasterVolume(value: number) { this.#volume = value; this.#applyGain(); }
  setOwnerPolicy(policy: Readonly<{ volume: number; muted: boolean; paused: boolean }>) {
    if (this.#disposed) return;
    if (!Number.isFinite(policy.volume) || policy.volume < 0 || policy.volume > 1 || typeof policy.muted !== "boolean" || typeof policy.paused !== "boolean") throw new RangeError("Invalid graph owner policy.");
    const mutedChanged = this.#muted !== policy.muted;
    this.#ownerVolume = policy.volume; this.#muted = policy.muted;
    if (this.#paused !== policy.paused) {
      this.#paused = policy.paused; this.#reschedule = true; this.#clockGeneration++;
      if (this.#paused) { if (this.#timer !== null) clearInterval(this.#timer); this.#timer = null; for (const source of this.#sources) { source.onended = null; try { source.stop(); } catch { /* Ended sources still need disconnection. */ } try { source.disconnect(); } catch { /* Continue the independent source sweep. */ } } this.#sources.clear(); }
      else if (this.#pump && this.#timer === null) this.#timer = setInterval(this.#pump, 10);
      this.#worklet?.setPaused(this.#paused);
    }
    else if (mutedChanged) this.#worklet?.flush();
    this.#applyGain();
  }
  async start(format: AUFXAudioFormat, graphSource: AUFXAudioRealtimeSource, stopped: (error?: unknown) => void, signal: AbortSignal) {
    if (this.#disposed) throw new Error("Audio graph output is disposed.");
    if (this.#stopped) throw new Error("Audio graph output is already running.");
    signal.throwIfAborted(); const generation = ++this.#generation; this.#clockGeneration++; this.#stopped = stopped;
    const abort = () => this.stop(); signal.addEventListener("abort", abort, { once: true }); this.#cleanup = () => signal.removeEventListener("abort", abort);
    try {
      const context = await this.#prepare(format); signal.throwIfAborted();
      if (this.#disposed || generation !== this.#generation) throw new Error("Audio graph start was cancelled.");
      this.#context = context; this.#format = format;
      let observedState = context.state;
      const stateChanged = () => {
        if (context.state !== observedState) {
          observedState = context.state; this.#clockGeneration++;
          if (context.state === "running") this.#reschedule = true;
        }
        if (context.state === "closed" || context.state === "interrupted") this.#finish(new Error("Audio graph output was interrupted."));
      };
      if (typeof context.addEventListener === "function") {
        context.addEventListener("statechange", stateChanged);
        this.#contextCleanup = () => context.removeEventListener("statechange", stateChanged);
      }
      if (AUFXAudioWorkletTransport.isSupported(context)) {
        const worklet = new AUFXAudioWorkletTransport(context, format, graphSource, error => this.#finish(error), this.#inputCapability);
        this.#worklet = worklet;
        this.#gain = context.createGain(); this.#applyGain(); this.#gain.connect(context.destination);
        try { await worklet.start(this.#gain, signal); }
        catch (error) { worklet.dispose(); if (this.#worklet === worklet) this.#worklet = null; throw error; }
        signal.throwIfAborted();
        if (this.#disposed || generation !== this.#generation) throw new Error("Audio graph start was cancelled.");
        this.#worklet.setPaused(this.#paused);
        return;
      }
      if (graphSource.snapshot().nodes.some(node => node.kind === "input")) { const error = new Error("Realtime audio input requires AudioWorklet support."); error.name = "AUFXUnsupportedRealtimeInputError"; throw error; }
      this.#gain = context.createGain(); this.#applyGain(); this.#gain.connect(context.destination);
      const frames = Math.max(128, Math.min(2048, Math.ceil(format.sampleRate * 0.02))), duration = frames / format.sampleRate;
      let nextTime = context.currentTime + 0.01;
      let pumpError: unknown;
      const pump = () => {
        try {
          if (this.#paused) return;
          if (context.state === "suspended") return;
          if (this.#reschedule) { nextTime = context.currentTime + 0.01; this.#reschedule = false; }
          if (context.state !== "running") throw new Error("Audio graph output was interrupted.");
          if (nextTime < context.currentTime) nextTime = context.currentTime + 0.01;
          for (let count = 0; nextTime < context.currentTime + 0.06 && count < 8; count++) {
            if (this.#sources.size >= 32) throw new Error("Audio graph output queue exceeded its budget.");
            const pcm = graphSource.renderFallback(frames);
            if (generation !== this.#generation || this.#paused) return;
            const buffer = context.createBuffer(format.channelCount, frames, format.sampleRate);
            for (let channel = 0; channel < format.channelCount; channel++) { const data = buffer.getChannelData(channel); for (let frame = 0; frame < frames; frame++) data[frame] = pcm.getSample(channel, frame); }
            const source = context.createBufferSource(); source.buffer = buffer; source.connect(this.#gain!); this.#sources.add(source);
            source.onended = () => { this.#sources.delete(source); source.disconnect(); };
            source.start(nextTime); nextTime += duration;
          }
        } catch (error) { pumpError = error; this.#finish(error); }
      };
      this.#pump = pump; pump(); if (pumpError !== undefined) throw pumpError; if (generation === this.#generation && !this.#paused) this.#timer = setInterval(pump, 10);
    } catch (error) { if (generation === this.#generation) this.#finish(error); throw error; }
  }
  #finish(error?: unknown) {
    ++this.#generation; if (this.#timer !== null) clearInterval(this.#timer); this.#timer = null; this.#pump = null;
    this.#context = null; this.#format = null;
    const cleanup = (action: (() => void) | null | undefined) => { try { action?.(); } catch { /* Continue independent native teardown. */ } };
    const signalCleanup = this.#cleanup; this.#cleanup = null; cleanup(signalCleanup);
    const contextCleanup = this.#contextCleanup; this.#contextCleanup = null; cleanup(contextCleanup);
    const worklet = this.#worklet; this.#worklet = null; cleanup(() => worklet?.dispose());
    const sources = [...this.#sources]; this.#sources.clear();
    for (const source of sources) { source.onended = null; cleanup(() => source.stop()); cleanup(() => source.disconnect()); }
    const gain = this.#gain; this.#gain = null; cleanup(() => gain?.disconnect());
    const stopped = this.#stopped; this.#stopped = null; cleanup(() => stopped?.(error));
  }
  stop() { this.#finish(); }
  dispose() { if (this.#disposed) return; this.#disposed = true; this.stop(); try { this.#ownerCleanup(); } finally { this.#release(); } }
}
