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

import { AUFXScheduledEnvelope } from "./AUFXScheduledEnvelope";
import type { AUFXAudioEnvelopeParameters } from "../../FX/AudioFX/AUFXAudioEnvelope";
import { BrowserAudioGraphOutput } from "../PlatformAdapters/BrowserAudioGraphOutput";
import type { AUFXAudioPCMBuffer } from "../../FX/AudioFX/AUFXAudioPCMBuffer";
/** Runtime-owned system feedback bus. The original button sound synthesis is retained exactly. */
export class AUFXSystemFeedbackBus {
  private readonly graphOutputs = new Set<BrowserAudioGraphOutput>();
  private readonly graphContexts = new Map<AudioContext, number>();
  createGraphOutput(signal: AbortSignal, capability: object = Object.freeze({})) {
    signal.throwIfAborted(); if (this.disposed) throw new Error("Audio bus is disposed.");
    if (this.graphOutputs.size >= 32) throw new RangeError("Audio graph output budget exceeded.");
    let context: AudioContext | null = null;
    const releaseContext = () => {
      const released = context;
      if (!released) return;
      context = null;
      const references = this.graphContexts.get(released) ?? 0;
      if (references > 1) { this.graphContexts.set(released, references - 1); return; }
      this.graphContexts.delete(released);
      if (released !== this.audioCtx) {
        try { void released.close().catch(() => {}); } catch { /* Release the other graph owners. */ }
      }
    };
    const output = new BrowserAudioGraphOutput(async format => {
      if (this.disposed) throw new Error("Audio graph output is unavailable.");
      if (context?.state === "closed" || context?.state === "interrupted") releaseContext();
      if (!context) {
        const created = this.factory({ sampleRate: format.sampleRate });
        if (!created) throw new Error("Audio graph output is unavailable.");
        context = created;
        this.graphContexts.set(created, (this.graphContexts.get(created) ?? 0) + 1);
      }
      if (context.state === "suspended") await context.resume();
      if (this.disposed) throw new Error("Audio graph output is unavailable.");
      return context;
    }, signal, () => { this.graphOutputs.delete(output); releaseContext(); }, capability);
    output.setMasterVolume(this.masterVolume); this.graphOutputs.add(output); return output;
  }
  private audioCtx: AudioContext | null = null;
  private audioFilter: BiquadFilterNode | null = null;
  private audioGain: GainNode | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private masterVolume = 1;
  private lastIntensity = 0;
  private disposed = false;
  private resourceSequence = 0;
  private playbackSequence = 0;
  private attemptedPreparation = false;
  get audioState(): "available" | "permission-required" | "unavailable" | "disposed" { return this.disposed ? "disposed" : this.audioCtx ? (this.audioCtx.state === "suspended" ? "permission-required" : "available") : this.attemptedPreparation ? "unavailable" : "permission-required"; }
  private readonly resources = new Map<string, { buffer: AudioBuffer; duration: number; samples: number; finished?: () => void }>();
  private readonly resourcePlayback = new Set<{ id: string; resourceID: string; source: AudioBufferSourceNode; gain: GainNode; panner: StereoPannerNode | null; filter: BiquadFilterNode | null; requestedBrightness: number; envelope: AUFXScheduledEnvelope | null; envelopeAllowed: boolean; envelopeParameters: AUFXAudioEnvelopeParameters; eventDuration: number; startTime: number; offset: number; rate: number; requestedPan: number; requestedPitch: number; requestedVolume: number; dynamicVolume: number; finished?: () => void }>();
  get currentTime() { return performance.now() / 1000; }

  constructor(private readonly factory: (options?: AudioContextOptions) => AudioContext | null) {}
  setMasterVolume(volume: number) { this.masterVolume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1; for (const output of this.graphOutputs) output.setMasterVolume(this.masterVolume); if (this.audioGain) this.audioGain.gain.value = 0.5 * this.lastIntensity * this.masterVolume; for (const playback of this.resourcePlayback) playback.gain.gain.value = playback.requestedVolume * playback.dynamicVolume * this.masterVolume; }
  dispose() {
    for (const output of this.graphOutputs) output.dispose(); this.graphOutputs.clear();
    for (const id of this.resources.keys()) this.cancelAudioResource(id); this.resources.clear();
    this.disposed = true;
    const context = this.audioCtx; this.audioCtx = null; this.audioFilter = null; this.audioGain = null; this.audioBuffer = null;
    if (context) { try { void context.close().catch(() => {}); } catch { /* Native close failure cannot retain runtime ownership. */ } }
  }
  async registerAudioResource(pcm: AUFXAudioPCMBuffer, signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted(); await this.prepare(false); signal?.throwIfAborted();
    if (!this.audioCtx) throw new Error("Audio output is unavailable.");
    const samples = pcm.frameLength * pcm.format.channelCount;
    const retained = [...this.resources.values()].reduce((sum, resource) => sum + resource.samples, 0);
    if (!samples || this.resources.size >= 64 || retained + samples > 8388608) throw new RangeError("Haptic audio resource budget exceeded.");
    const buffer = this.audioCtx.createBuffer(pcm.format.channelCount, pcm.frameLength, pcm.format.sampleRate);
    for (let channel = 0; channel < pcm.format.channelCount; channel++) {
      const destination = buffer.getChannelData(channel);
      for (let frame = 0; frame < pcm.frameLength; frame++) { if (frame % 1024 === 0) signal?.throwIfAborted(); destination[frame] = pcm.getSample(channel, frame); }
    }
    const id = `aufx-feedback-resource:${++this.resourceSequence}`;
    this.resources.set(id, { buffer, duration: pcm.frameLength / pcm.format.sampleRate, samples }); return id;
  }
  playSynthesizedAudio(options: Parameters<AUFXSystemFeedbackBus["playAudioResource"]>[1], finished: () => void): string {
    if (!this.audioCtx || this.disposed || this.resources.size >= 64) throw new Error("Synthesized audio is unavailable or exceeds its budget.");
    // Portable harmonic tone: a one-second periodic buffer, not Apple's device-specific synthesizer.
    const frames = Math.min(48000, this.audioCtx.sampleRate);
    if ([...this.resources.values()].reduce((sum, resource) => sum + resource.samples, frames) > 8388608) throw new RangeError("Synthesized audio resource budget exceeded.");
    const buffer = this.audioCtx.createBuffer(1, frames, frames), data = buffer.getChannelData(0);
    for (let frame = 0; frame < frames; frame++) { let value = 0; for (let harmonic = 1; harmonic <= 8 && harmonic * 220 < frames / 2; harmonic++) value += Math.sin(2 * Math.PI * harmonic * 220 * frame / frames) / harmonic; data[frame] = value * 0.3; }
    const id = `aufx-synthesis:${++this.resourceSequence}`;
    this.resources.set(id, { buffer, duration: 1, samples: frames, finished });
    try { this.playAudioResource(id, { ...options, loop: true }); } catch (error) { this.resources.delete(id); throw error; }
    return id;
  }
  playAudioResource(resourceID: string, options: Readonly<{ delay?: number; offset?: number; duration?: number; volume?: number; rate?: number; pan?: number; pitch?: number; loop?: boolean; brightness?: number; envelope?: AUFXAudioEnvelopeParameters; envelopeAllowed?: boolean; envelopeDuration?: number }> = {}, finished?: () => void): string {
    if (this.disposed || !this.audioCtx) throw new Error("Audio feedback bus is unavailable.");
    if (this.audioCtx.state === "suspended") throw new Error("Audio activation is required before pattern playback.");
    const resource = this.resources.get(resourceID); if (!resource) throw new Error("Audio resource is not registered.");
    const delay = options.delay ?? 0, offset = options.offset ?? 0, volume = options.volume ?? 1, rate = options.rate ?? 1;
    if (options.brightness !== undefined && (!Number.isFinite(options.brightness) || options.brightness < 0 || options.brightness > 1)) throw new RangeError("Invalid audio brightness.");
    const pan = options.pan ?? 0, pitch = options.pitch ?? 0;
    if (![pan, pitch].every(value => Number.isFinite(value) && value >= -1 && value <= 1)) throw new RangeError("Invalid audio pan/pitch.");
    if (options.loop !== undefined && typeof options.loop !== "boolean") throw new TypeError("Invalid audio waveform loop.");
    const release = options.envelope?.sustained !== false ? options.envelope?.releaseTime ?? 0 : 0;
    const duration = options.loop ? (options.duration ?? resource.duration / rate) * rate : options.duration === undefined ? resource.duration - offset : Math.min(resource.duration - offset, options.duration * rate);
    if (![delay, offset, volume, rate, duration].every(Number.isFinite) || delay < 0 || offset < 0 || (!options.loop && offset >= resource.duration) || volume < 0 || volume > 1 || rate <= 0 || rate > 4 || duration < 0) throw new RangeError("Invalid audio event timing/gain.");
    const source = this.audioCtx.createBufferSource(), gain = this.audioCtx.createGain(); source.buffer = resource.buffer; source.loop = options.loop ?? false; source.playbackRate.value = rate;
    const panner = this.audioCtx.createStereoPanner?.() ?? null;
    if ((pan !== 0 && !panner) || (pitch !== 0 && !source.detune)) { source.disconnect(); gain.disconnect(); panner?.disconnect(); throw new Error("Audio pan/pitch controls are unavailable."); }
    if (source.detune) source.detune.value = pitch * 1200;
    gain.gain.value = volume * this.masterVolume; source.connect(gain);
    if (panner) { panner.pan.value = pan; gain.connect(panner); panner.connect(this.audioCtx.destination); } else gain.connect(this.audioCtx.destination);
    const filter = options.brightness === undefined ? null : this.audioCtx.createBiquadFilter();
    if (filter) { filter.type = "lowpass"; filter.Q.value = Math.SQRT1_2; filter.frequency.value = this.brightnessFrequency(options.brightness!); const tail = panner ?? gain; tail.disconnect(); tail.connect(filter); filter.connect(this.audioCtx.destination); }
    const startTime = this.audioCtx.currentTime + delay, eventDuration = options.envelopeDuration ?? offset + duration;
    const envelope = options.envelope ? new AUFXScheduledEnvelope(this.audioCtx, eventDuration, startTime, offset, rate, options.envelope) : null;
    if (envelope) { source.disconnect(); source.connect(envelope.node); envelope.node.connect(gain); }
    const playback = { id: `aufx-feedback-playback:${++this.playbackSequence}`, resourceID, source, gain, panner, filter, envelope, envelopeAllowed: options.envelopeAllowed ?? !!envelope, envelopeParameters: options.envelope ?? {}, eventDuration, startTime, offset, rate, requestedBrightness: options.brightness ?? 1, requestedPan: pan, requestedPitch: pitch, requestedVolume: volume, dynamicVolume: 1, finished }; this.resourcePlayback.add(playback);
    source.onended = () => { this.resourcePlayback.delete(playback); source.disconnect(); gain.disconnect(); panner?.disconnect(); playback.filter?.disconnect(); playback.envelope?.dispose(); playback.finished?.(); if (resource.finished) { this.resources.delete(resourceID); resource.finished(); } };
    try {
      if (options.loop) { source.start(this.audioCtx.currentTime + delay, offset % resource.duration); source.stop(this.audioCtx.currentTime + delay + Math.max(0, eventDuration + release - offset) / rate); }
      else source.start(this.audioCtx.currentTime + delay, offset, Math.min(resource.duration - offset, Math.max(0, eventDuration + release - offset)));
    }
    catch (error) { this.resourcePlayback.delete(playback); source.onended = null; source.disconnect(); gain.disconnect(); panner?.disconnect(); playback.filter?.disconnect(); playback.envelope?.dispose(); throw error; }
    return playback.id;
  }
  private brightnessFrequency(value: number) { return 20 + (Math.min(20000, this.audioCtx!.sampleRate / 2) - 20) * value; }
  setAudioResourceParameter(resourceID: string, parameterID: "audioVolume" | "audioPan" | "audioPitch" | "audioBrightness" | "audioAttackTime" | "audioDecayTime" | "audioReleaseTime", value: number) {
    this.validateAudioParameter(parameterID, value);
    for (const playback of this.resourcePlayback) if (playback.resourceID === resourceID) this.applyAudioPlaybackParameter(playback, parameterID, value);
  }
  setAudioPlaybackParameter(playbackID: string, parameterID: "audioVolume" | "audioPan" | "audioPitch" | "audioBrightness" | "audioAttackTime" | "audioDecayTime" | "audioReleaseTime", value: number) {
    this.validateAudioParameter(parameterID, value);
    const playback = [...this.resourcePlayback].find(candidate => candidate.id === playbackID);
    if (playback) this.applyAudioPlaybackParameter(playback, parameterID, value);
  }
  private validateAudioParameter(parameterID: string, value: number) {
    const minimum = parameterID === "audioVolume" ? 0 : -1;
    if (!["audioVolume", "audioPan", "audioPitch", "audioBrightness", "audioAttackTime", "audioDecayTime", "audioReleaseTime"].includes(parameterID) || !Number.isFinite(value) || value < minimum || value > 1) throw new RangeError("Invalid dynamic audio parameter.");
  }
  private applyAudioPlaybackParameter(playback: (typeof this.resourcePlayback extends Set<infer T> ? T : never), parameterID: "audioVolume" | "audioPan" | "audioPitch" | "audioBrightness" | "audioAttackTime" | "audioDecayTime" | "audioReleaseTime", value: number) {
    if (parameterID === "audioVolume") { this.setAudioPlaybackVolume(playback, value); return; }
      if (parameterID === "audioAttackTime" || parameterID === "audioDecayTime" || parameterID === "audioReleaseTime") {
        if (!playback.envelopeAllowed) return;
        if (!playback.envelope) {
          if (value === 0) return;
          playback.envelope = new AUFXScheduledEnvelope(this.audioCtx!, playback.eventDuration, playback.startTime, playback.offset, playback.rate, playback.envelopeParameters);
          playback.source.disconnect(); playback.source.connect(playback.envelope.node); playback.envelope.node.connect(playback.gain);
        }
        playback.envelope.update(parameterID === "audioAttackTime" ? "attackTime" : parameterID === "audioDecayTime" ? "decayTime" : "releaseTime", value);
        try { playback.source.stop(playback.envelope.endTime); } catch { /* Ended sources are cleaned by their native completion. */ }
      }
      else if (parameterID === "audioBrightness") {
        if (!playback.filter) {
          if (value === 0) return;
          const filter = this.audioCtx!.createBiquadFilter(); filter.type = "lowpass"; filter.Q.value = Math.SQRT1_2;
          const tail = playback.panner ?? playback.gain; tail.disconnect(); tail.connect(filter); filter.connect(this.audioCtx!.destination); playback.filter = filter;
        }
        playback.filter.frequency.value = this.brightnessFrequency(Math.max(0, Math.min(1, playback.requestedBrightness + value)));
      }
      else if (parameterID === "audioPan") { if (!playback.panner) { if (value === 0) return; throw new Error("Audio pan is unavailable."); } playback.panner.pan.value = Math.max(-1, Math.min(1, playback.requestedPan + value)); }
      else { if (!playback.source.detune) { if (value === 0) return; throw new Error("Audio pitch is unavailable."); } playback.source.detune.value = Math.max(-1, Math.min(1, playback.requestedPitch + value)) * 1200; }
  }
  private setAudioPlaybackVolume(playback: (typeof this.resourcePlayback extends Set<infer T> ? T : never), volume: number) {
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw new RangeError("Invalid dynamic audio gain.");
    playback.dynamicVolume = volume; playback.gain.gain.value = playback.requestedVolume * volume * this.masterVolume;
  }
  setAudioResourceVolume(resourceID: string, volume: number) {
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw new RangeError("Invalid dynamic audio gain.");
    for (const playback of this.resourcePlayback) if (playback.resourceID === resourceID) { playback.dynamicVolume = volume; playback.gain.gain.value = playback.requestedVolume * volume * this.masterVolume; }
  }
  cancelAudioResource(resourceID: string) {
    for (const playback of [...this.resourcePlayback]) if (playback.resourceID === resourceID) this.cancelPlayback(playback);
  }
  cancelAudioPlayback(playbackID: string) { const playback = [...this.resourcePlayback].find(candidate => candidate.id === playbackID); if (playback) this.cancelPlayback(playback); }
  private cancelPlayback(playback: (typeof this.resourcePlayback extends Set<infer T> ? T : never)) {
    this.resourcePlayback.delete(playback); playback.source.onended = null;
    try { playback.source.stop(); } catch { /* A failed or already-ended source still needs its nodes disconnected. */ } finally { playback.source.disconnect(); playback.gain.disconnect(); playback.panner?.disconnect(); playback.filter?.disconnect(); playback.envelope?.dispose(); playback.finished?.(); }
  }
  unregisterAudioResource(resourceID: string) { this.cancelAudioResource(resourceID); const resource = this.resources.get(resourceID); this.resources.delete(resourceID); resource?.finished?.(); }
  playClick(intensity: number) {
    if (!this.audioCtx || !this.audioFilter || !this.audioGain || !this.audioBuffer) return;

    const data = this.audioBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 25);
    }

    this.lastIntensity = intensity;
    this.audioGain.gain.value = 0.5 * intensity * this.masterVolume;
    this.audioFilter.frequency.value = (2000 + intensity * 2000) * (1 + (Math.random() - 0.5) * 0.3);

    const source = this.audioCtx.createBufferSource();
    source.buffer = this.audioBuffer;
    source.connect(this.audioFilter);
    source.onended = () => source.disconnect();
    source.start();
  }

  async prepare(resume = true) {
    if (this.disposed) throw new Error("System feedback bus is disposed.");
    if (!this.audioCtx) {
      const factory = this.factory;
      this.attemptedPreparation = true;
      this.audioCtx = factory();

      if (!this.audioCtx) return;

      this.audioFilter = this.audioCtx.createBiquadFilter();
      this.audioFilter.type = "bandpass";
      this.audioFilter.frequency.value = 4000;
      this.audioFilter.Q.value = 8;

      this.audioGain = this.audioCtx.createGain();
      this.audioFilter.connect(this.audioGain);
      this.audioGain.connect(this.audioCtx.destination);

      this.audioBuffer = this.audioCtx.createBuffer(1, this.audioCtx.sampleRate * 0.004, this.audioCtx.sampleRate);
      const data = this.audioBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 25);
      }
    }

    if (resume && this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
      if (this.disposed) throw new Error("System feedback bus is disposed.");
    }
  }

}
