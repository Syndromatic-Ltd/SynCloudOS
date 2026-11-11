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

import { SynCloudOSLifecycleRecord } from "../../SynCloudOS/fxRuntimeContracts";
import type { HFXHapticLifecycleEvent, HFXHapticPlaybackConfiguration, HFXHapticObservation } from "./HFXHapticLifecycle";
import type { HFXHapticPatternPlayer } from "./HFXHapticPatternPlayer";
import type { AUFXAudioPCMBuffer } from "../AudioFX/AUFXAudioPCMBuffer";
import type { HFXFeedbackOptions, HFXFeedbackRequest, HFXHapticEvent, HFXHapticDynamicParameter } from "./HFXHapticEvent";
import { HFXHapticPattern } from "./HFXHapticPattern";
import { HFXHapticAdvancedPatternPlayer } from "./HFXHapticAdvancedPatternPlayer";
let engineSequence = 0;
export interface HFXAudioResource { readonly id: string; readonly duration: number; }
/** Focused host port; no browser or runtime authority leaks into application-facing options. */
export interface HFXHapticPort {
  readonly supported: boolean;
  readonly currentTime?: number;
  readonly audioState?: "available" | "permission-required" | "unavailable" | "disposed";
  readonly capabilities?: Readonly<{
    amplitude: boolean;
    sharpness: boolean;
    timing?: "precise" | "approximate";
    amplitudeApproximation?: "timing";
    dynamicParameters?: "precise" | "timing-approximation";
  }>;
  trigger(request: HFXFeedbackRequest, options?: HFXFeedbackOptions): Promise<void> | void;
  event?(event: HFXHapticEvent, delay?: number, offset?: number, rate?: number, originalDuration?: number): void;
  parameters?(parameters: readonly HFXHapticDynamicParameter[]): void;
  playerEvent?(owner: object, event: HFXHapticEvent, delay?: number, offset?: number, rate?: number, originalDuration?: number): void;
  playerParameters?(owner: object, parameters: readonly HFXHapticDynamicParameter[]): void;
  playerStart?(owner: object): void;
  registerAudioResource?(buffer: AUFXAudioPCMBuffer, signal?: AbortSignal): Promise<string>;
  unregisterAudioResource?(resourceID: string): void;
  start?(): Promise<void>;
  cancel(): void;
  playerCancel?(owner: object): void;
  dispose(): void;
  setVibrationEnabled?(enabled: boolean): void;
  setButtonSoundEnabled?(enabled: boolean): void;
  setPatternPlayback?(configuration: Readonly<{ audioOnly: boolean; hapticsOnly: boolean }>): void;
}
export interface HFXHapticCapabilities {
  readonly state: "disposed" | "available" | "unavailable";
  readonly timing: boolean;
  readonly amplitude: boolean;
  readonly sharpness: boolean;
  readonly audio: boolean;
  readonly audioState: "available" | "permission-required" | "unavailable" | "disposed";
  readonly dynamicParameters: boolean;
  readonly fidelity: Readonly<{
    timing: "precise" | "approximate" | "unavailable";
    amplitude: "precise" | "timing-approximation" | "unavailable";
    sharpness: "precise" | "unavailable";
    audio: "available" | "permission-required" | "unavailable" | "disposed";
    dynamicParameters: "precise" | "timing-approximation" | "unavailable";
  }>;
  readonly reason: string | null;
}
export class HFXHapticEngine {
  readonly #lifecycle = new SynCloudOSLifecycleRecord({ kind: "HFXHapticEngine" });
  #disposed = false;
  #disposing = false;
  #running = false;
  #stopping = false;
  #configuration = { audioOnly: false, hapticsOnly: false, autoShutdown: false };
  readonly #activePlayers = new Set<HFXHapticAdvancedPatternPlayer>();
  readonly #directActuatorOwner = {};
  #actuatorOwner: object | null = null;
  readonly #observers = new Set<(event: HFXHapticLifecycleEvent) => void>();
  observe(listener: (event: HFXHapticLifecycleEvent) => void): HFXHapticObservation {
    this.#assertLive("observe"); if (typeof listener !== "function" || this.#observers.size >= 128) throw new RangeError("Invalid haptic observation or observer budget exceeded.");
    this.#observers.add(listener); return Object.freeze({ dispose: () => { this.#observers.delete(listener); } });
  }
  configurePlayback(configuration: HFXHapticPlaybackConfiguration) {
    this.#assertLive("configurePlayback");
    for (const key of Object.keys(configuration)) if (!["audioOnly", "hapticsOnly", "autoShutdown"].includes(key) || typeof configuration[key as keyof HFXHapticPlaybackConfiguration] !== "boolean") throw new TypeError("Invalid session playback configuration.");
    const next = { ...this.#configuration, ...configuration }; if (next.audioOnly && next.hapticsOnly) throw new Error("Audio-only and haptics-only policies conflict."); this.#configuration = next; this.#port.setPatternPlayback?.(next);
  }
  #notify(event: HFXHapticLifecycleEvent) { const value = Object.freeze(event); for (const observer of [...this.#observers]) { try { observer(value); } catch { /* One observer cannot interrupt another or teardown. */ } } }
  #didStart() { if (this.#running) return; this.#running = true; this.#notify({ type: "started" }); }
  playerDidStart(player: HFXHapticAdvancedPatternPlayer) {
    this.#assertLive("playerDidStart"); this.#activePlayers.add(player);
    try { this.#port.playerStart?.(player); }
    catch (error) { this.#activePlayers.delete(player); throw error; }
    if (this.#activePlayers.has(player)) this.#didStart();
  }
  playerDidFinish(player: HFXHapticAdvancedPatternPlayer) {
    if (this.#actuatorOwner === player) this.#actuatorOwner = null;
    if (!this.#activePlayers.delete(player) || this.#activePlayers.size) return;
    this.#notify({ type: "players-finished" });
    if (this.#configuration.autoShutdown && !this.#activePlayers.size && !this.#stopping && !this.#disposed) this.#stop("auto-shutdown");
  }
  #stop(reason: "requested" | "auto-shutdown" | "disposed") {
    if (this.#stopping || this.#disposed) return; this.#stopping = true;
    let failure: Readonly<{ error: unknown }> | undefined;
    try { this.cancel(); } catch (error) { failure = { error }; }
    try { if (this.#running) { this.#running = false; this.#notify({ type: "stopped", reason }); } }
    finally { this.#stopping = false; }
    if (failure) throw failure.error;
  }
  #enabled = true;
  #sequence = 0;
  readonly #resourceNamespace = ++engineSequence;
  #pendingResources = 0;
  #resourceEpoch = 0;
  readonly #players = new Set<HFXHapticAdvancedPatternPlayer>();
  readonly #resources = new Map<HFXAudioResource, string>();
  readonly #retiredResources = new Set<string>();
  readonly #port: HFXHapticPort;
  constructor(port: HFXHapticPort) { this.#port = port; }
  get currentTime() { return this.#port.currentTime ?? performance.now() / 1000; }
  get isSupported() { return !this.#disposed && this.#port.supported; }
  get capabilities(): HFXHapticCapabilities {
    const supported = this.isSupported;
    const amplitude = supported && (this.#port.capabilities?.amplitude ?? false), sharpness = supported && (this.#port.capabilities?.sharpness ?? false);
    const audioState = this.#disposed ? "disposed" : this.#port.audioState ?? (this.#port.registerAudioResource ? "available" : "unavailable");
    const dynamicParameters = supported && !!this.#port.parameters;
    const fidelity = Object.freeze({
      timing: this.#disposed || !supported ? "unavailable" as const : this.#port.capabilities?.timing ?? "precise" as const,
      amplitude: this.#disposed || !supported ? "unavailable" as const : amplitude ? "precise" as const : this.#port.capabilities?.amplitudeApproximation === "timing" ? "timing-approximation" as const : "unavailable" as const,
      sharpness: this.#disposed || !supported ? "unavailable" as const : sharpness ? "precise" as const : "unavailable" as const,
      audio: audioState,
      dynamicParameters: this.#disposed || !dynamicParameters ? "unavailable" as const : this.#port.capabilities?.dynamicParameters ?? "precise" as const,
    });
    let reason: string | null = null;
    if (this.#disposed) reason = "Haptic engine is disposed.";
    else if (!supported) reason = audioState === "available" ? "Haptic actuator is unavailable; audio playback remains available." : "Haptic output is unavailable.";
    else {
      const degradation: string[] = [];
      if (fidelity.timing === "approximate") degradation.push("timing is approximate");
      if (fidelity.amplitude === "timing-approximation") degradation.push("amplitude is approximated through timing");
      else if (fidelity.amplitude === "unavailable") degradation.push("amplitude control is unavailable");
      if (fidelity.sharpness === "unavailable") degradation.push("sharpness control is unavailable");
      if (fidelity.dynamicParameters === "timing-approximation") degradation.push("dynamic haptic parameters are timing approximations");
      reason = degradation.length ? `Haptic degradation: ${degradation.join("; ")}.` : null;
    }
    return Object.freeze({ state: this.#disposed ? "disposed" : supported ? "available" : "unavailable", timing: supported, amplitude, sharpness, audio: audioState === "available", audioState, dynamicParameters, fidelity, reason });
  }
  assertActive() { this.#assertLive("assertActive"); }
  #assertLive(operation: string) { if (this.#disposed) throw this.#lifecycle.error({ code: "HFX_HAPTIC_ENGINE_DISPOSED", operation: operation }); }
  async trigger(request: HFXFeedbackRequest, options?: HFXFeedbackOptions) {
    this.#assertLive("trigger");
    if (request !== false && request != null && !["success", "warning", "error", "light", "medium", "heavy", "soft", "rigid", "selection", "nudge", "buzz"].includes(request)) throw new TypeError("Unknown feedback preset.");
    const safe: { intensity?: number; audio?: HFXFeedbackOptions["audio"] } = {};
    if (options !== undefined) {
      if (!options || typeof options !== "object") throw new TypeError("Invalid feedback options.");
      for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(options))) {
        if (!("value" in descriptor) || !["intensity", "audio"].includes(key)) throw new TypeError("Feedback options cannot contain host authority or policy overrides.");
        if (descriptor.value === undefined) continue;
        if (key === "intensity") { if (!Number.isFinite(descriptor.value) || descriptor.value < 0 || descriptor.value > 1) throw new RangeError("Invalid feedback intensity."); safe.intensity = descriptor.value; }
        else { if (![true, false, "desktop", "fallback", "always", "debug", "off"].includes(descriptor.value)) throw new TypeError("Invalid feedback audio mode."); safe.audio = descriptor.value; }
      }
    }
    await this.#port.trigger(request, safe);
  }
  async registerAudioResource(buffer: AUFXAudioPCMBuffer, signal?: AbortSignal): Promise<HFXAudioResource> {
    this.#assertLive("registerAudioResource"); signal?.throwIfAborted();
    if (!this.#port.registerAudioResource || this.#resources.size + this.#pendingResources >= 64) throw new Error("Audio resources are unavailable or exceed the engine limit.");
    const owned = buffer.copy(), epoch = this.#resourceEpoch;
    this.#pendingResources++;
    let backendID: string;
    try { backendID = await this.#port.registerAudioResource(owned, signal); }
    finally { this.#pendingResources--; }
    if (epoch !== this.#resourceEpoch) { try { this.#port.unregisterAudioResource?.(backendID); } catch { this.#retiredResources.add(backendID); } throw new Error("Haptic engine reset during audio registration."); }
    if (this.#disposed || signal?.aborted) { try { this.#port.unregisterAudioResource?.(backendID); } catch { this.#retiredResources.add(backendID); } signal?.throwIfAborted(); throw this.#lifecycle.error({ code: "HFX_HAPTIC_ENGINE_DISPOSED", operation: "registerAudioResource" }); }
    const resource = Object.freeze({ id: `hfx-resource:${this.#resourceNamespace}:${++this.#sequence}`, duration: owned.frameLength / owned.format.sampleRate });
    this.#resources.set(resource, backendID); return resource;
  }
  unregisterAudioResource(resource: HFXAudioResource) {
    this.#assertLive("unregisterAudioResource"); const backendID = this.#resources.get(resource);
    if (!backendID) throw new Error("Audio resource is not owned by this engine.");
    this.#port.unregisterAudioResource?.(backendID); this.#resources.delete(resource);
  }
  private audioResource(id: string) { const entry = [...this.#resources].find(([resource]) => resource.id === id); if (!entry) throw new Error("Audio resource is not registered with this engine."); return entry; }
  #emit(operation: string, event: HFXHapticEvent, delay: number, offset: number, rate: number, originalDuration: number | undefined, actuatorOwner: object) {
    this.#assertLive(operation);
    const audioEvent = event.type === "audio" || event.type === "audioContinuous";
    if ((audioEvent && this.#configuration.hapticsOnly) || (!audioEvent && this.#configuration.audioOnly)) return;
    const send = (resolved: HFXHapticEvent) => {
      if (actuatorOwner !== this.#directActuatorOwner) {
        if (!this.#port.playerEvent) throw new Error("Player-scoped structured events are unavailable on this host.");
        this.#port.playerEvent(actuatorOwner, resolved, delay, offset, rate, originalDuration);
      } else {
        if (!this.#port.event) throw new Error("Structured events are unavailable on this host.");
        this.#port.event(resolved, delay, offset, rate, originalDuration);
      }
    };
    if (event.type === "audio") { const [, backendID] = this.audioResource(event.audioResource!); send({ ...event, audioResource: backendID }); }
    else if (event.type === "audioContinuous") send(event);
    else if (this.#enabled) send(event);
  }
  emit(event: HFXHapticEvent, delay = 0, offset = 0, rate = 1, originalDuration = event.duration) { this.#actuatorOwner = this.#directActuatorOwner; this.#emit("emit", event, delay, offset, rate, originalDuration, this.#directActuatorOwner); }
  emitFromPlayer(player: HFXHapticAdvancedPatternPlayer, event: HFXHapticEvent, delay = 0, offset = 0, rate = 1, originalDuration = event.duration) {
    if (event.type !== "audio" && event.type !== "audioContinuous") this.#actuatorOwner = player;
    this.#emit("emitFromPlayer", event, delay, offset, rate, originalDuration, player);
  }
  sendParameters(parameters: readonly HFXHapticDynamicParameter[], actuatorOwner?: object) {
    this.#assertLive("sendParameters"); if (!this.#port.parameters) throw new Error("Dynamic parameters are unavailable on this host.");
    if (parameters.length > 128) throw new RangeError("Dynamic parameter limit exceeded.");
    for (const parameter of parameters) if (!["intensity", "sharpness", "audioVolume", "audioPan", "audioPitch", "audioBrightness", "hapticAttackTime", "hapticDecayTime", "hapticReleaseTime", "audioAttackTime", "audioDecayTime", "audioReleaseTime"].includes(parameter.parameterID) || !Number.isFinite(parameter.value) || parameter.value < (["sharpness", "audioPan", "audioPitch", "audioBrightness", "hapticAttackTime", "hapticDecayTime", "hapticReleaseTime", "audioAttackTime", "audioDecayTime", "audioReleaseTime"].includes(parameter.parameterID) ? -1 : 0) || parameter.value > 1 || !Number.isFinite(parameter.relativeTime) || parameter.relativeTime < 0) throw new RangeError("Invalid dynamic parameter.");
    if (actuatorOwner) {
      if (!this.#port.playerParameters) throw new Error("Player-scoped dynamic parameters are unavailable on this host.");
      this.#port.playerParameters(actuatorOwner, parameters);
    } else this.#port.parameters(parameters);
  }
  makeAdvancedPlayer(pattern: HFXHapticPattern) {
    this.#assertLive("makeAdvancedPlayer"); if (this.#players.size >= 128) throw new RangeError("Haptic player limit exceeded.");
    if (!this.#port.playerEvent) throw new Error("Custom haptic ports must implement playerEvent before creating players.");
    if (!this.#port.playerCancel) throw new Error("Custom haptic ports must implement playerCancel before creating players.");
    if (this.#port.parameters && !this.#port.playerParameters) throw new Error("Custom haptic ports that advertise dynamic parameters must implement playerParameters before creating players.");
    const resolved = new HFXHapticPattern(pattern.events.map(event => event.type === "audio" ? { ...event, duration: event.duration ?? this.audioResource(event.audioResource!)[0].duration } : event.type === "transient" && event.duration === undefined ? { ...event, duration: 0.008 } : event), pattern.curves);
    const player = new HFXHapticAdvancedPatternPlayer(this, resolved); this.#players.add(player); return player;
  }
  releasePlayer(player: HFXHapticAdvancedPatternPlayer) { this.#players.delete(player); if (this.#actuatorOwner === player) this.#actuatorOwner = null; }
  makePlayer(pattern: HFXHapticPattern): HFXHapticPatternPlayer { this.#assertLive("makePlayer"); return this.makeAdvancedPlayer(pattern); }
  getVibrationEnabled() { return this.#enabled; }
  setVibrationEnabled(enabled: boolean) { this.#assertLive("setVibrationEnabled"); this.#enabled = enabled; this.#port.setVibrationEnabled?.(enabled);  }
  setButtonSoundEnabled(enabled: boolean) { this.#assertLive("setButtonSoundEnabled"); this.#port.setButtonSoundEnabled?.(enabled); }
  stopOutput(actuatorOwner?: object) { if (!this.#disposed) { if (actuatorOwner) this.#port.playerCancel?.(actuatorOwner); else this.#port.cancel(); if (actuatorOwner === undefined || this.#actuatorOwner === actuatorOwner) this.#actuatorOwner = null; } }
  cancel() { if (this.#disposed) return; for (const player of this.#players) player.stop(); this.#actuatorOwner = null; this.#port.cancel(); }
  async start() { this.#assertLive("start"); await this.#port.start?.(); this.#assertLive("start"); this.#didStart(); }
  stop() { this.#stop("requested"); }
  reset() {
    this.#assertLive("reset"); this.#resourceEpoch++;
    let failure: Readonly<{ error: unknown }> | undefined;
    const attempt = (action: () => void) => { try { action(); } catch (error) { failure ??= { error }; } };
    attempt(() => this.#stop("requested"));
    for (const id of new Set([...this.#resources.values(), ...this.#retiredResources])) attempt(() => {
      try { this.#port.unregisterAudioResource?.(id); this.#retiredResources.delete(id); }
      catch (error) { this.#retiredResources.add(id); throw error; }
    });
    this.#resources.clear(); this.#notify({ type: "reset" });
    if (failure) throw failure.error;
  }
  dispose() {
    if (this.#disposed || this.#disposing) return; this.#lifecycle.markDisposed("explicit"); this.#disposing = true;
    try {
      try { this.#stop("disposed"); } catch { /* Backend cancellation cannot prevent revocation. */ } this.#disposed = true; this.#players.clear(); this.#activePlayers.clear(); this.#actuatorOwner = null; this.#observers.clear();
      for (const backendID of new Set([...this.#resources.values(), ...this.#retiredResources])) { try { this.#port.unregisterAudioResource?.(backendID); } catch { /* Release every remaining resource. */ } }
      this.#resources.clear(); this.#retiredResources.clear(); try { this.#port.dispose(); } catch { /* Local disposal remains final even if the backend fails. */ }
    } finally { this.#disposing = false; }
  }
}

