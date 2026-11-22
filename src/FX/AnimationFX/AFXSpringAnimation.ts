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

import { AFXAnimation, type AFXAnimationOptions } from "./AFXAnimation";
import { AFXKeyframeAnimation } from "./AFXKeyframeAnimation";
import { sampleSpring, sampleSpringVelocity, springParameters, springSettlingDuration } from "./AFXTimingFunction";
import { afxProgressVelocity, afxScaledDistance, type AFXAnimationVelocity } from "./animationVelocity";
import { interpolateAFXValue } from "./interpolation";
import {
  afxAnimationNumber,
  afxAnimationScalar,
  afxAnimationDataRecord,
} from "./animationValues";
import type { AFXAnimationKeyPath, AFXAnimationScalar } from "./animationTypes";

export class AFXSpringAnimation {
  readonly mass: number;
  readonly stiffness: number;
  readonly damping: number;
  readonly initialVelocity: number;
  readonly settlingDuration: number;
  /** Core Animation's perceptual duration: the period of the undamped spring. */
  readonly perceptualDuration: number;
  /** Core Animation's bounce: 0 is critically damped, positive bounces and negative is overdamped. */
  readonly bounce: number;
  readonly animation: AFXAnimation;
  readonly targetId: string;
  readonly keyPath: AFXAnimationKeyPath;
  readonly from: AFXAnimationScalar;
  readonly to: AFXAnimationScalar;
  constructor(
    input: Readonly<{
      targetId: string;
      keyPath: AFXAnimationKeyPath;
      from: AFXAnimationScalar;
      to: AFXAnimationScalar;
      mass?: number;
      stiffness?: number;
      damping?: number;
      initialVelocity?: number;
      perceptualDuration?: number;
      bounce?: number;
      options?: Partial<AFXAnimationOptions>;
    }>,
  ) {
    input = afxAnimationDataRecord(
      input,
      "spring options",
    ) as unknown as typeof input;
    if (input.options)
      input = {
        ...input,
        options: afxAnimationDataRecord(input.options, "spring timing options"),
      };
    const perceptual = input.perceptualDuration !== undefined || input.bounce !== undefined;
    if (perceptual && (input.mass !== undefined || input.stiffness !== undefined || input.damping !== undefined))
      throw new TypeError("A spring takes either perceptualDuration and bounce, or mass, stiffness and damping.");
    let mass = input.mass ?? 1, stiffness = input.stiffness ?? 100, damping = input.damping ?? 10;
    if (perceptual) {
      const duration = afxAnimationNumber(input.perceptualDuration, "spring perceptual duration", 0.07, 10);
      const bounce = input.bounce ?? 0;
      if (typeof bounce !== "number" || !Number.isFinite(bounce) || bounce <= -1 || bounce >= 1)
        throw new RangeError("spring bounce is outside its supported bounds.");
      ({ mass, stiffness, damping } = springParameters(duration, bounce));
    }
    this.mass = afxAnimationNumber(mass, "spring mass", 0.01, 100);
    this.stiffness = afxAnimationNumber(stiffness, "spring stiffness", 0.01, 10000);
    this.damping = afxAnimationNumber(damping, "spring damping", 0.01, 10000);
    const ratio = this.damping / (2 * Math.sqrt(this.stiffness * this.mass));
    this.perceptualDuration = 2 * Math.PI / Math.sqrt(this.stiffness / this.mass);
    this.bounce = ratio <= 1 ? 1 - ratio : 1 / ratio - 1;
    this.#explicitVelocity = input.initialVelocity !== undefined;
    this.initialVelocity = afxAnimationNumber(
      input.initialVelocity ?? 0,
      "initial velocity",
      -10000,
      10000,
    );
    this.settlingDuration = Math.max(
      0.001,
      springSettlingDuration(this.mass, this.stiffness, this.damping, this.initialVelocity),
    );
    this.animation = new AFXAnimation({
      duration: input.options?.duration ?? this.settlingDuration,
      ...input.options,
      timing: "linear",
    });
    this.targetId = input.targetId;
    this.keyPath = input.keyPath;
    this.from = afxAnimationScalar(input.from, "spring start");
    this.to = afxAnimationScalar(input.to, "spring end");
    Object.freeze(this);
  }
  readonly #explicitVelocity: boolean;
  /** The velocity at `seconds` in units per second, or null for values without a linear distance. */
  velocity(seconds: number): AFXAnimationVelocity {
    const progress = this.animation.progressAt(seconds);
    if (progress === null) return null;
    const { delay, speed, duration, autoreverses } = this.animation;
    const active = (seconds - delay) * speed;
    const settled = progress === 1 || seconds < delay || seconds >= this.animation.totalDuration;
    const reversing = autoreverses && duration > 0 && Math.floor(active / duration) % 2 === 1;
    const rate = settled ? 0 : sampleSpringVelocity(progress * duration, this.mass, this.stiffness, this.damping, this.initialVelocity) * speed * (reversing ? -1 : 1);
    return afxScaledDistance(this.from, this.to, rate);
  }
  sample(seconds: number): AFXAnimationScalar | null {
    const progress = this.animation.progressAt(seconds);
    if (progress === null) return null;
    return interpolateAFXValue(
      this.from,
      this.to,
      progress === 1
        ? 1
        : sampleSpring(
            progress * this.animation.duration,
            this.mass,
            this.stiffness,
            this.damping,
            this.initialVelocity,
          ),
    );
  }
  toRuntime() {
    const values = Array.from(
      { length: 121 },
      (_, i) =>
        this.sample(
          this.animation.delay + (this.animation.cycleDuration * i) / 120,
        ) ?? this.to,
    ).map((value) =>
      this.keyPath === "opacity" && typeof value === "number"
        ? Math.max(0, Math.min(1, value))
        : value,
    );
    return new AFXKeyframeAnimation({
      targetId: this.targetId,
      keyPath: this.keyPath,
      values,
      animation: this.animation,
    }).toRuntime();
  }
  retarget(from: AFXAnimationScalar, velocity?: AFXAnimationVelocity): AFXSpringAnimation {
    const inherited = !this.#explicitVelocity && velocity !== undefined && velocity !== null;
    const initialVelocity = inherited
      ? Math.max(-10000, Math.min(10000, afxProgressVelocity(from, this.to, velocity)))
      : this.initialVelocity;
    return new AFXSpringAnimation({
      targetId: this.targetId,
      keyPath: this.keyPath,
      from,
      to: this.to,
      mass: this.mass,
      stiffness: this.stiffness,
      damping: this.damping,
      initialVelocity,
      options: {
        duration: this.animation.duration,
        speed: this.animation.speed,
        delay: this.animation.delay,
        iterations: this.animation.iterations,
        autoreverses: this.animation.autoreverses,
        fill: this.animation.fill,
        reducedMotion: this.animation.reducedMotion,
      },
    });
  }
}
