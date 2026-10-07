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

import type {
  AFXAnimationDefinition,
  AFXAnimationTiming,
  AFXReducedMotionPolicy,
} from "./animationTypes";
import {
  afxAnimationDataRecord,
  afxAnimationNumber,
  afxAnimationTiming,
} from "./animationValues";
import { AFXTimingFunction } from "./AFXTimingFunction";

export interface AFXAnimationOptions {
  readonly duration: number;
  readonly delay?: number;
  readonly iterations?: number;
  readonly speed?: number;
  readonly repeatDuration?: number;
  readonly autoreverses?: boolean;
  readonly fill?: AFXAnimationDefinition["fill"];
  readonly timing?: AFXAnimationTiming;
  readonly reducedMotion?: AFXReducedMotionPolicy;
}

export class AFXAnimation {
  readonly #timingFunction: AFXTimingFunction;
  readonly duration: number;
  readonly delay: number;
  readonly iterations: number;
  readonly speed: number;
  readonly autoreverses: boolean;
  readonly fill: NonNullable<AFXAnimationDefinition["fill"]>;
  readonly timing: AFXAnimationTiming;
  readonly reducedMotion: AFXReducedMotionPolicy;

  constructor(options: AFXAnimationOptions) {
    const input = afxAnimationDataRecord(
      options,
      "AFXAnimation options",
    ) as unknown as AFXAnimationOptions;
    this.duration = afxAnimationNumber(
      input.duration,
      "animation duration",
      0,
      600,
    );
    this.delay = afxAnimationNumber(input.delay ?? 0, "animation delay", 0, 60);
    this.speed = afxAnimationNumber(
      input.speed ?? 1,
      "animation speed",
      0.001,
      1000,
    );
    if (this.duration / this.speed > 600)
      throw new RangeError("Effective animation cycle exceeds 600 seconds.");
    if (
      input.repeatDuration !== undefined &&
      (input.iterations !== undefined || this.duration === 0)
    )
      throw new TypeError(
        "repeatDuration requires a nonzero cycle and cannot also specify iterations.",
      );
    this.iterations = afxAnimationNumber(
      input.repeatDuration === undefined
        ? (input.iterations ?? 1)
        : afxAnimationNumber(
            input.repeatDuration,
            "repeat duration",
            0.00001,
            600000,
          ) /
            (this.duration * (input.autoreverses ? 2 : 1)),
      "animation iterations",
      0.00001,
      1_000,
    );
    if (
      input.autoreverses !== undefined &&
      typeof input.autoreverses !== "boolean"
    )
      throw new TypeError("Animation autoreverses must be boolean.");
    this.autoreverses = input.autoreverses ?? false;
    if (
      input.fill !== undefined &&
      !["none", "forwards", "backwards", "both"].includes(input.fill)
    )
      throw new TypeError("Animation fill is unsupported.");
    this.fill = input.fill ?? "forwards";
    this.timing = afxAnimationTiming(input.timing ?? "ease");
    this.#timingFunction = new AFXTimingFunction(this.timing);
    if (
      input.reducedMotion !== undefined &&
      !["system", "always", "never"].includes(input.reducedMotion)
    )
      throw new TypeError("Reduced-motion policy is unsupported.");
    this.reducedMotion = input.reducedMotion ?? "system";
    Object.freeze(this);
  }

  definition() {
    return Object.freeze({
      duration: this.cycleDuration,
      delay: this.delay,
      iterations: this.iterations,
      autoreverses: this.autoreverses,
      fill: this.fill,
      timing: this.timing,
      reducedMotion: this.reducedMotion,
    });
  }
  get totalDuration(): number {
    return (
      this.delay +
      this.cycleDuration * this.iterations * (this.autoreverses ? 2 : 1)
    );
  }
  get cycleDuration(): number {
    return this.duration / this.speed;
  }
  /** Null means that this animation contributes no presentation value at this time. */
  progressAt(seconds: number): number | null {
    if (!Number.isFinite(seconds))
      throw new RangeError("Animation time must be finite.");
    if (seconds < this.delay)
      return this.fill === "backwards" || this.fill === "both" ? 0 : null;
    const active = (seconds - this.delay) * this.speed,
      cycles = this.iterations * (this.autoreverses ? 2 : 1);
    if (this.duration === 0 || active >= this.duration * cycles) {
      if (this.fill === "none" || this.fill === "backwards") return null;
      const fractional = cycles % 1;
      const final = fractional === 0 ? 1 : fractional;
      const progress =
        this.autoreverses && Math.ceil(cycles) % 2 === 0 ? 1 - final : final;
      return this.#timingFunction.sample(progress, this.duration);
    }
    const cycle = Math.floor(active / this.duration);
    let progress = (active % this.duration) / this.duration;
    if (this.autoreverses && cycle % 2 === 1) progress = 1 - progress;
    return this.#timingFunction.sample(progress, this.duration);
  }
}
