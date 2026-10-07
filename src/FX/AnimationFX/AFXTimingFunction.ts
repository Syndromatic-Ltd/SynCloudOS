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

import type { AFXAnimationTiming } from "./animationTypes";
import { afxAnimationTiming } from "./animationValues";

/** Monotonic x cubic-bezier inversion; y may overshoot. */
export function sampleCubicBezier(
  x: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cubic = (t: number, a: number, b: number) =>
    3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
  let low = 0,
    high = 1;
  for (let step = 0; step < 48; step++) {
    const middle = (low + high) / 2;
    if (cubic(middle, x1, x2) < x) low = middle;
    else high = middle;
  }
  return cubic((low + high) / 2, y1, y2);
}

/** Unit step response of a damped oscillator, initial value zero and initial velocity in units/second. */
export function sampleSpring(
  seconds: number,
  mass: number,
  stiffness: number,
  damping: number,
  initialVelocity = 0,
): number {
  if (seconds <= 0) return 0;
  const omega = Math.sqrt(stiffness / mass),
    decay = damping / (2 * mass),
    ratio = decay / omega;
  if (ratio < 1 - 1e-8) {
    const frequency = Math.sqrt(omega * omega - decay * decay);
    return (
      1 -
      Math.exp(-decay * seconds) *
        (Math.cos(frequency * seconds) +
          ((decay - initialVelocity) / frequency) *
            Math.sin(frequency * seconds))
    );
  }
  if (ratio > 1 + 1e-8) {
    const root = Math.sqrt(decay * decay - omega * omega),
      r1 = -decay + root,
      r2 = -decay - root,
      a = (initialVelocity + r2) / (r1 - r2),
      b = -1 - a;
    return 1 + a * Math.exp(r1 * seconds) + b * Math.exp(r2 * seconds);
  }
  return (
    1 + (-1 + (initialVelocity - omega) * seconds) * Math.exp(-omega * seconds)
  );
}

export class AFXTimingFunction {
  readonly value: AFXAnimationTiming;
  constructor(value: AFXAnimationTiming = "ease") {
    this.value = afxAnimationTiming(value);
    Object.freeze(this);
  }
  sample(progress: number, duration = 1): number {
    if (
      !Number.isFinite(progress) ||
      !Number.isFinite(duration) ||
      duration < 0
    )
      throw new RangeError("Timing inputs must be finite.");
    const p = Math.max(0, Math.min(1, progress)),
      v = this.value;
    if (typeof v === "object")
      return v.kind === "cubic-bezier"
        ? sampleCubicBezier(p, v.x1, v.y1, v.x2, v.y2)
        : p === 1
          ? 1
          : sampleSpring(p * duration, v.mass, v.stiffness, v.damping);
    const curves = {
      ease: [0.25, 0.1, 0.25, 1],
      "ease-in": [0.42, 0, 1, 1],
      "ease-out": [0, 0, 0.58, 1],
      "ease-in-out": [0.42, 0, 0.58, 1],
    } as const;
    if (v === "linear") return p;
    const curve = curves[v];
    return sampleCubicBezier(p, curve[0], curve[1], curve[2], curve[3]);
  }
}
