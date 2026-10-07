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

import { AUFXAudioEnvelope, type AUFXAudioEnvelopeParameters } from "../../FX/AudioFX/AUFXAudioEnvelope";
/** Native gain scheduling for the documented portable normalized envelope mapping. */
export class AUFXScheduledEnvelope {
  readonly node: GainNode;
  private readonly controls: Partial<Record<"attackTime" | "decayTime" | "releaseTime", number>> = {};
  constructor(private readonly context: AudioContext, private readonly duration: number, private readonly startTime: number, private readonly offset: number, private readonly rate: number, private readonly parameters: AUFXAudioEnvelopeParameters) {
    this.node = context.createGain(); this.schedule();
  }
  private get effective(): AUFXAudioEnvelopeParameters {
    const result = { ...this.parameters };
    for (const key of ["attackTime", "decayTime", "releaseTime"] as const) result[key] = Math.max(0, Math.min(1, (this.parameters[key] ?? 0) + (this.controls[key] ?? 0)));
    return result;
  }
  get endTime() { const points = AUFXAudioEnvelope.points(this.duration, this.effective); return this.startTime + Math.max(0, points[points.length - 1]!.time - this.offset) / this.rate; }
  update(parameter: "attackTime" | "decayTime" | "releaseTime", value: number) { this.controls[parameter] = value; this.schedule(); }
  private schedule() {
    const now = Math.max(this.startTime, this.context.currentTime), position = this.offset + (now - this.startTime) * this.rate, parameters = this.effective;
    this.node.gain.cancelScheduledValues(now); this.node.gain.setValueAtTime(AUFXAudioEnvelope.valueAt(position, this.duration, parameters), now);
    for (const point of AUFXAudioEnvelope.points(this.duration, parameters)) if (point.time > position) this.node.gain.linearRampToValueAtTime(point.value, this.startTime + (point.time - this.offset) / this.rate);
  }
  dispose() { this.node.disconnect(); }
}
