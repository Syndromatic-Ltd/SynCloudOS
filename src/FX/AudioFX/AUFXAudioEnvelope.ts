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

export interface AUFXAudioEnvelopeParameters {
  readonly attackTime?: number;
  readonly decayTime?: number;
  readonly releaseTime?: number;
  readonly sustained?: boolean;
}
/** Browser envelope mapping: normalized time 0..1 maps linearly to 0..1 seconds. */
export class AUFXAudioEnvelope {
  static points(duration: number, parameters: AUFXAudioEnvelopeParameters): readonly Readonly<{ time: number; value: number }>[] {
    if (!Number.isFinite(duration) || duration < 0) throw new RangeError("Invalid envelope duration.");
    for (const value of [parameters.attackTime, parameters.decayTime, parameters.releaseTime]) if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)) throw new RangeError("Invalid normalized envelope time.");
    if (parameters.sustained !== undefined && typeof parameters.sustained !== "boolean") throw new TypeError("Invalid envelope sustain.");
    const attack = Math.min(duration, parameters.attackTime ?? 0);
    const end = parameters.sustained === false ? Math.min(duration, attack + (parameters.decayTime ?? 0)) : duration + (parameters.releaseTime ?? 0);
    const points = [{ time: 0, value: attack > 0 ? 0 : 1 }, { time: attack, value: 1 }];
    if (parameters.sustained !== false) points.push({ time: duration, value: 1 });
    points.push({ time: end, value: 0 }); return points;
  }
  static valueAt(time: number, duration: number, parameters: AUFXAudioEnvelopeParameters): number {
    if (!Number.isFinite(time)) throw new RangeError("Invalid envelope time.");
    const points = this.points(duration, parameters); if (time < 0) return 0;
    for (let i = 1; i < points.length; i++) { const a = points[i - 1]!, b = points[i]!; if (time < b.time) return a.value + (b.value - a.value) * (time - a.time) / (b.time - a.time); }
    return 0;
  }
}
