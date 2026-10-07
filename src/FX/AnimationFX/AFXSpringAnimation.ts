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
import { sampleSpring } from "./AFXTimingFunction";
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
    this.mass = afxAnimationNumber(input.mass ?? 1, "spring mass", 0.01, 100);
    this.stiffness = afxAnimationNumber(
      input.stiffness ?? 100,
      "spring stiffness",
      0.01,
      10000,
    );
    this.damping = afxAnimationNumber(
      input.damping ?? 10,
      "spring damping",
      0.01,
      10000,
    );
    this.initialVelocity = afxAnimationNumber(
      input.initialVelocity ?? 0,
      "initial velocity",
      -10000,
      10000,
    );
    const decay = this.damping / (2 * this.mass),
      omega = Math.sqrt(this.stiffness / this.mass),
      slow =
        decay > omega
          ? decay - Math.sqrt(decay * decay - omega * omega)
          : decay;
    this.settlingDuration = Math.max(
      0.001,
      Math.log(10000 * (1 + Math.abs(this.initialVelocity))) / slow,
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
  retarget(from: AFXAnimationScalar): AFXSpringAnimation {
    return new AFXSpringAnimation({
      targetId: this.targetId,
      keyPath: this.keyPath,
      from,
      to: this.to,
      mass: this.mass,
      stiffness: this.stiffness,
      damping: this.damping,
      initialVelocity: this.initialVelocity,
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
