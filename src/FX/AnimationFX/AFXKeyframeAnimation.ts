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

import { AFXAnimation } from "./AFXAnimation";
import { AFXTimingFunction } from "./AFXTimingFunction";
import type {
  AFXAnimationKeyPath,
  AFXAnimationScalar,
  AFXAnimationTiming,
  AFXAnimationDefinition,
} from "./animationTypes";
import { afxAnimationScalar, afxAnimationDataRecord } from "./animationValues";
import { interpolateAFXValue } from "./interpolation";
import { GFXGradient } from "../GraphicsFX/GFXGradient";
import { GFXPath } from "../GraphicsFX/GFXPath";

export class AFXKeyframeAnimation {
  readonly targetId: string;
  readonly keyPath: AFXAnimationKeyPath;
  readonly values: readonly AFXAnimationScalar[];
  readonly keyTimes: readonly number[];
  readonly timingFunctions: readonly AFXTimingFunction[];
  readonly animation: AFXAnimation;
  constructor(
    input: Readonly<{
      targetId: string;
      keyPath: AFXAnimationKeyPath;
      values: readonly AFXAnimationScalar[];
      keyTimes?: readonly number[];
      timingFunctions?: readonly AFXAnimationTiming[];
      animation: AFXAnimation;
    }>,
  ) {
    input = afxAnimationDataRecord(
      input,
      "keyframe options",
    ) as unknown as typeof input;
    if (
      !input.targetId ||
      input.values.length < 2 ||
      input.values.length > 1000
    )
      throw new RangeError("Keyframes require a target and 2–1000 values.");
    const times =
      input.keyTimes ??
      input.values.map((_, i) => i / (input.values.length - 1));
    if (
      times.length !== input.values.length ||
      times[0] !== 0 ||
      times.at(-1) !== 1 ||
      times.some(
        (x, i) =>
          !Number.isFinite(x) || x < 0 || x > 1 || (i > 0 && x <= times[i - 1]),
      )
    )
      throw new RangeError(
        "Key times must strictly increase from zero to one.",
      );
    if (
      input.timingFunctions &&
      input.timingFunctions.length !== times.length - 1
    )
      throw new RangeError(
        "Each keyframe segment requires one timing function.",
      );
    if (!(input.animation instanceof AFXAnimation))
      throw new TypeError("Keyframes require AFXAnimation timing.");
    this.targetId = input.targetId;
    this.keyPath = input.keyPath;
    this.values = Object.freeze(
      input.values.map((x) => afxAnimationScalar(x, "keyframe")),
    );
    for (let index = 1; index < this.values.length; index++) {
      const left = this.values[index - 1]!;
      const right = this.values[index]!;
      if (left instanceof GFXPath || right instanceof GFXPath || left instanceof GFXGradient || right instanceof GFXGradient)
        interpolateAFXValue(left, right, 0.5);
    }
    this.keyTimes = Object.freeze([...times]);
    this.animation = input.animation;
    this.timingFunctions = Object.freeze(
      times
        .slice(1)
        .map(
          (_, i) =>
            new AFXTimingFunction(input.timingFunctions?.[i] ?? "linear"),
        ),
    );
    Object.freeze(this);
  }
  sample(seconds: number): AFXAnimationScalar | null {
    const progress = this.animation.progressAt(seconds);
    if (progress === null) return null;
    if (progress <= 0) return this.values[0];
    if (progress >= 1) return this.values.at(-1)!;
    let index = 0;
    while (
      index < this.keyTimes.length - 2 &&
      progress > this.keyTimes[index + 1]
    )
      index++;
    const local =
      (progress - this.keyTimes[index]) /
      (this.keyTimes[index + 1] - this.keyTimes[index]);
    return interpolateAFXValue(
      this.values[index],
      this.values[index + 1],
      this.timingFunctions[index].sample(
        local,
        this.animation.duration *
          (this.keyTimes[index + 1] - this.keyTimes[index]),
      ),
    );
  }
  toRuntime(): AFXAnimationDefinition {
    // Segment timing is sampled into bounded real keyframes; no native spring/easing fiction.
    const offsets = [
      ...new Set([
        ...this.keyTimes,
        ...Array.from({ length: 121 }, (_, i) => i / 120),
      ]),
    ].sort((a, b) => a - b);
    const frames = offsets.map((offset) =>
      Object.freeze({
        offset,
        value:
          this.sample(
            this.animation.delay + this.animation.cycleDuration * offset,
          ) ?? this.values.at(-1)!,
      }),
    );
    return Object.freeze({
      ...this.animation.definition(),
      timing: "linear",
      animations: Object.freeze([
        Object.freeze({
          targetId: this.targetId,
          keyPath: this.keyPath,
          from: this.values[0],
          to: this.values.at(-1)!,
          keyframes: Object.freeze(frames),
        }),
      ]),
    });
  }
  retarget(from: AFXAnimationScalar): AFXKeyframeAnimation {
    return new AFXKeyframeAnimation({
      targetId: this.targetId,
      keyPath: this.keyPath,
      values: [from, ...this.values.slice(1)],
      keyTimes: this.keyTimes,
      timingFunctions: this.timingFunctions.map((timing) => timing.value),
      animation: this.animation,
    });
  }
}
