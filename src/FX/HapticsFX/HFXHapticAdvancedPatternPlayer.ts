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

import { HFXHapticParameterCurve } from "./HFXHapticParameterCurve";
import type { HFXHapticEngine } from "./HFXHapticEngine";
import type { HFXHapticPattern } from "./HFXHapticPattern";
import type { HFXHapticDynamicParameter, HFXHapticParameterID } from "./HFXHapticEvent";
export class HFXHapticAdvancedPatternPlayer {
  loopEnabled = false;
  completionHandler?: (reason: "completed" | "cancelled" | "error") => void;
  readonly #engine: HFXHapticEngine;
  #timers: ReturnType<typeof setTimeout>[] = [];
  #curveTimer: ReturnType<typeof setTimeout> | null = null;
  #offset = 0;
  #startedAt = 0;
  #running = false;
  #settled = true;
  #disposed = false;
  #rate = 1;
  #loopEnd: number;
  #muted = false;
  #overrides = new Map<HFXHapticParameterID, number>();
  constructor(engine: HFXHapticEngine, readonly pattern: HFXHapticPattern) { this.#engine = engine; this.#loopEnd = pattern.duration; }
  get playbackRate() { return this.#rate; }
  set playbackRate(value: number) { if (!Number.isFinite(value) || value <= 0 || value > 4) throw new RangeError("Invalid playback rate."); const running = this.#running; if (running) this.pause(); this.#rate = value; if (running) this.resume(); }
  get loopEnd() { return this.#loopEnd; }
  set loopEnd(value: number) { if (!Number.isFinite(value) || value <= 0 || value > this.pattern.duration) throw new RangeError("Invalid loop end."); this.#loopEnd = value; }
  get isMuted() { return this.#muted; }
  set isMuted(value: boolean) { this.#muted = value; if (value) this.#engine.stopOutput(this); }
  private position() { return this.#offset + Math.max(0, this.#engine.currentTime - this.#startedAt) * this.#rate; }
  private valuesAt(time: number) {
    const values = new Map<HFXHapticParameterID, number>();
    for (const curve of this.pattern.curves) if (time >= curve.relativeTime) values.set(curve.parameterID, curve.valueAt(time));
    for (const [id, value] of this.#overrides) values.set(id, value);
    return values;
  }
  private sampleCurves() {
    if (!this.#running) return;
    if (!this.#muted && this.#engine.capabilities.dynamicParameters && this.#engine.currentTime >= this.#startedAt) {
      const parameters = [...this.valuesAt(this.position())].map(([parameterID, value]) => ({ parameterID, value, relativeTime: 0 }));
      if (parameters.length) { try { this.#engine.sendParameters(parameters, this); } catch { this.finish("error"); return; } }
    }
    this.#curveTimer = setTimeout(() => this.sampleCurves(), 16);
  }
  start(delay = 0) { this.begin(delay, true); }
  private begin(delay: number, renewOwnership: boolean) {
    this.#engine.assertActive(); if (this.#disposed) throw new Error("Haptic player is disposed.");
    if (!Number.isFinite(delay) || delay < 0) throw new RangeError("Invalid player timing.");
    if (renewOwnership && this.#running) this.#engine.stopOutput(this);
    this.clear(); this.#running = true;
    if (renewOwnership) {
      this.#settled = false;
      try { this.#engine.playerDidStart(this); }
      catch { this.finish("error"); return; }
    }
    this.#startedAt = this.#engine.currentTime + delay; if (this.#settled) return;
    const boundary = this.loopEnabled ? this.#loopEnd : this.pattern.duration;
    for (const event of this.pattern.events) {
      if (this.#settled) break;
      const baseEnd = event.relativeTime + (event.duration ?? 0);
      const end = Math.min(boundary, baseEnd + ((event.type !== "audio" || event.audioUseVolumeEnvelope) && event.sustained !== false ? event.releaseTime ?? 0 : 0));
      if (event.relativeTime > boundary || (event.relativeTime < this.#offset && !(event.type !== "transient" && end > this.#offset))) continue;
      const onset = Math.max(this.#offset, event.relativeTime), delayUntilEvent = delay + (onset - this.#offset) / this.#rate;
      const emit = (audioDelay = 0) => {
        if (this.#muted) return;
        try {
          const values = this.valuesAt(onset);
          const intensity = (event.intensity ?? 0.5) * (this.#engine.capabilities.dynamicParameters ? 1 : (values.get((event.type === "audio" || event.type === "audioContinuous") ? "audioVolume" : "intensity") ?? 1));
          const sharpness = event.sharpness === undefined && !values.has("sharpness") ? undefined : Math.max(0, Math.min(1, (event.sharpness ?? 0.5) + (this.#engine.capabilities.dynamicParameters ? 0 : (values.get("sharpness") ?? 0))));
          this.#engine.emitFromPlayer(this, { ...event, relativeTime: onset, ...(event.duration === undefined ? {} : { duration: Math.max(0, Math.min(baseEnd, boundary) - onset) / this.#rate }), intensity, ...(sharpness === undefined ? {} : { sharpness }) }, audioDelay, onset - event.relativeTime, this.#rate, event.duration);
        } catch { this.finish("error"); }
      };
      if (event.type === "audio" || event.type === "audioContinuous") emit(delayUntilEvent);
      else this.#timers.push(setTimeout(() => emit(), delayUntilEvent * 1000));
    }
    if (this.#settled) return;
    if (this.#engine.capabilities.dynamicParameters) {
      try { this.#engine.sendParameters([{ parameterID: "intensity", value: 1, relativeTime: 0 }, { parameterID: "sharpness", value: 0, relativeTime: 0 }, { parameterID: "audioVolume", value: 1, relativeTime: 0 }, { parameterID: "audioPan", value: 0, relativeTime: 0 }, { parameterID: "audioPitch", value: 0, relativeTime: 0 }, { parameterID: "audioBrightness", value: 0, relativeTime: 0 }, ...(["hapticAttackTime", "hapticDecayTime", "hapticReleaseTime", "audioAttackTime", "audioDecayTime", "audioReleaseTime"] as const).map(parameterID => ({ parameterID, value: 0, relativeTime: 0 }))], this); }
      catch { this.finish("error"); return; }
    }
    this.sampleCurves();
    this.#timers.push(setTimeout(() => {
      if (this.loopEnabled && boundary > 0) { this.#offset = 0; this.begin(0, false); }
      else this.finish("completed");
    }, (delay + Math.max(0, boundary - this.#offset) / this.#rate) * 1000));
  }
  sendParameters(parameters: readonly HFXHapticDynamicParameter[]) {
    this.#engine.assertActive(); if (this.#disposed) throw new Error("Haptic player is disposed.");
    if (parameters.length > 128 || this.#timers.length + parameters.length > 8192) throw new RangeError("Dynamic parameter scheduling budget exceeded.");
    for (const parameter of parameters) new HFXHapticParameterCurve(parameter.parameterID, [{ time: 0, value: parameter.value }], parameter.relativeTime);
    for (const input of parameters) {
      const parameter = { ...input };
      const apply = () => { this.#engine.sendParameters([{ ...parameter, relativeTime: 0 }], this); this.#overrides.set(parameter.parameterID, parameter.value); };
      if (parameter.relativeTime === 0) apply();
      else {
        if (!Number.isFinite(parameter.relativeTime) || parameter.relativeTime < 0) throw new RangeError("Invalid dynamic parameter time.");
        this.#timers.push(setTimeout(() => { try { apply(); } catch { this.finish("error"); } }, parameter.relativeTime * 1000));
      }
    }
  }
  private clear() { for (const timer of this.#timers) clearTimeout(timer); this.#timers = []; if (this.#curveTimer !== null) clearTimeout(this.#curveTimer); this.#curveTimer = null; }
  private finish(reason: "completed" | "cancelled" | "error") { this.clear(); this.#running = false; this.#offset = 0; if (this.#settled) return; this.#settled = true; if (reason !== "completed") { try { this.#engine.stopOutput(this); } catch { /* Backend cancellation cannot leave the player unsettled. */ } } try { this.#engine.playerDidFinish(this); } catch { /* Host lifecycle hooks cannot prevent local settlement. */ } try { this.completionHandler?.(reason); } catch { /* Completion handlers cannot prevent host teardown. */ } }
  stop() { this.finish("cancelled"); }
  pause() { if (!this.#running) return; this.#offset = Math.min(this.pattern.duration, this.position()); this.clear(); this.#running = false; this.#engine.stopOutput(this); }
  resume() { if (!this.#running) this.start(); }
  seek(offset: number) { if (!Number.isFinite(offset) || offset < 0 || offset > this.pattern.duration) throw new RangeError("Invalid seek offset."); this.#offset = offset; if (this.#running) this.start(); }
  dispose() { if (this.#disposed) return; this.stop(); this.#disposed = true; this.#overrides.clear(); this.#engine.releasePlayer(this); }
}
