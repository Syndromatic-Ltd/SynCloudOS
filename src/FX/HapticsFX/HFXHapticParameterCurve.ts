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

import type { HFXHapticParameterID } from "./HFXHapticEvent";
export class HFXHapticParameterCurve {
  readonly controlPoints: readonly Readonly<{ time: number; value: number }>[];
  constructor(readonly parameterID: HFXHapticParameterID, points: readonly Readonly<{ time: number; value: number }>[], readonly relativeTime = 0) {
    if (!["intensity", "sharpness", "audioVolume", "audioPan", "audioPitch", "audioBrightness", "hapticAttackTime", "hapticDecayTime", "hapticReleaseTime", "audioAttackTime", "audioDecayTime", "audioReleaseTime"].includes(parameterID) || !Number.isFinite(relativeTime) || relativeTime < 0 || relativeTime > 3600 || points.length < 1 || points.length > 4096) throw new RangeError("Invalid parameter curve.");
    let previous = -1;
    this.controlPoints = Object.freeze(points.map(point => {
      if (!Number.isFinite(point.time) || point.time < 0 || point.time + relativeTime > 3600 || point.time <= previous || !Number.isFinite(point.value) || point.value < (["sharpness", "audioPan", "audioPitch", "audioBrightness", "hapticAttackTime", "hapticDecayTime", "hapticReleaseTime", "audioAttackTime", "audioDecayTime", "audioReleaseTime"].includes(parameterID) ? -1 : 0) || point.value > 1) throw new RangeError("Invalid curve point.");
      previous = point.time; return Object.freeze({ ...point });
    })); Object.freeze(this);
  }
  valueAt(time: number) {
    const t = time - this.relativeTime, points = this.controlPoints;
    if (t <= points[0]!.time) return points[0]!.value;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!, b = points[i]!;
      if (t <= b.time) return a.value + (b.value - a.value) * (t - a.time) / (b.time - a.time);
    }
    return points[points.length - 1]!.value;
  }
}
