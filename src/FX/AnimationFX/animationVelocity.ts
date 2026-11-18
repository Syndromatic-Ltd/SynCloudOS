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

import type { AFXSampledAnimation } from "./AFXAnimationGroup";
import type { AFXAnimationScalar } from "./animationTypes";

/** Units per second: a number, or a record for points, sizes and rects. Null when the value has no linear velocity. */
export type AFXAnimationVelocity = number | Readonly<Record<string, number>> | null;

const step = 1 / 240;

/** A plain record of finite numbers, such as a point or rect. Class instances like paths and gradients are excluded. */
export function afxNumericRecord(value: unknown): Readonly<Record<string, number>> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const entries = Object.entries(value);
  if (!entries.length || entries.some(([, entry]) => typeof entry !== "number" || !Number.isFinite(entry))) return null;
  return value as Readonly<Record<string, number>>;
}

/** Scales the from→to distance by `rate`, per component; null for values without a linear distance. */
export function afxScaledDistance(from: AFXAnimationScalar, to: AFXAnimationScalar, rate: number): AFXAnimationVelocity {
  if (typeof from === "number" && typeof to === "number") return (to - from) * rate;
  const start = afxNumericRecord(from), end = afxNumericRecord(to);
  if (!start || !end) return null;
  const keys = Object.keys(start);
  if (keys.length !== Object.keys(end).length || keys.some(key => !(key in end))) return null;
  return Object.freeze(Object.fromEntries(keys.map(key => [key, (end[key]! - start[key]!) * rate])));
}

/** Velocity of a sampled animation at `seconds`, by central difference inside its active interval. */
export function afxSampledVelocity(animation: AFXSampledAnimation, seconds: number): AFXAnimationVelocity {
  const total = animation.animation.totalDuration;
  const low = Math.max(0, seconds - step);
  const high = Number.isFinite(total) ? Math.min(total, seconds + step) : seconds + step;
  if (!(high > low)) return null;
  const before = animation.sample(low), after = animation.sample(high);
  if (before === null || after === null) return null;
  return afxScaledDistance(before, after, 1 / (high - low));
}

/** Projects a velocity onto the from→to direction, in fractions of the distance per second. */
export function afxProgressVelocity(from: AFXAnimationScalar, to: AFXAnimationScalar, velocity: AFXAnimationVelocity): number {
  if (velocity === null) return 0;
  if (typeof from === "number" && typeof to === "number") {
    const distance = to - from;
    return typeof velocity === "number" && distance !== 0 ? velocity / distance : 0;
  }
  const start = afxNumericRecord(from), end = afxNumericRecord(to), rate = afxNumericRecord(velocity);
  if (!start || !end || !rate) return 0;
  let dot = 0, norm = 0;
  for (const key of Object.keys(start)) {
    if (!(key in end)) continue;
    const distance = end[key]! - start[key]!;
    dot += (rate[key] ?? 0) * distance;
    norm += distance * distance;
  }
  return norm === 0 ? 0 : dot / norm;
}
