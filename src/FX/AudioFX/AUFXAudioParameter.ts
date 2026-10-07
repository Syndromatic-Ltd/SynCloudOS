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

const parameterInternals = new WeakMap<AUFXAudioParameter, { snapshot(sampleRate: number): Readonly<{ initial: number; events: readonly Readonly<{ sampleTime: number; value: number; ramp: boolean }>[] }>; observe(listener: () => void): () => void }>();
export class AUFXAudioParameter {
  private events: { time: number; value: number; ramp: boolean }[] = [];
  private readonly observers = new Set<() => void>();
  constructor(private initialValue = 1, readonly minimum = 0, readonly maximum = 1) { this.validate(initialValue, 0); parameterInternals.set(this, { snapshot: sampleRate => Object.freeze({ initial: this.initialValue, events: Object.freeze(this.events.map(event => Object.freeze({ sampleTime: Math.round(event.time * sampleRate), value: event.value, ramp: event.ramp }))) }), observe: listener => { this.observers.add(listener); return () => this.observers.delete(listener); } }); }
  private validate(value: number, time: number) { if (!Number.isFinite(value) || value < this.minimum || value > this.maximum || !Number.isFinite(time) || time < 0) throw new RangeError("Invalid automation value/time."); }
  get value() { return this.initialValue; }
  set value(value: number) { this.validate(value, 0); this.initialValue = value; this.notify(); }
  private schedule(value: number, time: number, ramp: boolean) { this.validate(value, time); if (this.events.length >= 4096) throw new RangeError("Automation event limit exceeded."); this.events = this.events.filter(event => event.time !== time); this.events.push({ value, time, ramp }); this.events.sort((a, b) => a.time - b.time); this.notify(); }
  setValueAtTime(value: number, seconds: number) { this.schedule(value, seconds, false); }
  linearRampToValueAtTime(value: number, seconds: number) { this.schedule(value, seconds, true); }
  cancelScheduledValues(seconds: number) { this.validate(this.initialValue, seconds); this.events = this.events.filter(event => event.time < seconds); this.notify(); }
  valueAt(seconds: number) {
    let previous = { time: 0, value: this.initialValue };
    for (const event of this.events) {
      if (seconds < event.time) return event.ramp ? previous.value + (event.value - previous.value) * (seconds - previous.time) / (event.time - previous.time) : previous.value;
      previous = event;
    }
    return previous.value;
  }
  private notify() { for (const observer of [...this.observers]) observer(); }
}
export function snapshotAUFXParameter(parameter: AUFXAudioParameter, sampleRate: number) { return parameterInternals.get(parameter)!.snapshot(sampleRate); }
export function observeAUFXParameter(parameter: AUFXAudioParameter, listener: () => void) { return parameterInternals.get(parameter)!.observe(listener); }
