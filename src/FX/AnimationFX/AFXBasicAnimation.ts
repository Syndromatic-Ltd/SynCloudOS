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
  AFXAnimationKeyPath,
  AFXAnimationScalar,
  AFXPropertyAnimation,
} from "./animationTypes";
import { AFXAnimation } from "./AFXAnimation";
import { afxAnimationDataRecord, afxAnimationScalar } from "./animationValues";
import { interpolateAFXValue } from "./interpolation";
import { GFXGradient } from "../GraphicsFX/GFXGradient";
import { GFXPath } from "../GraphicsFX/GFXPath";

export class AFXBasicAnimation {
  readonly targetId: string;
  readonly keyPath: AFXAnimationKeyPath;
  readonly from: AFXAnimationScalar;
  readonly to: AFXAnimationScalar;
  readonly animation: AFXAnimation;

  constructor(input: {
    readonly targetId: string;
    readonly keyPath: AFXAnimationKeyPath;
    readonly from: AFXAnimationScalar;
    readonly to: AFXAnimationScalar;
    readonly animation: AFXAnimation;
  }) {
    const value = afxAnimationDataRecord(
      input,
      "AFXBasicAnimation input",
    ) as unknown as typeof input;
    if (
      typeof value.targetId !== "string" ||
      value.targetId.length === 0 ||
      value.targetId.length > 512
    )
      throw new TypeError("AFXBasicAnimation targetId is invalid.");
    if (
      ![
        "frame",
        "transform",
        "sublayerTransform",
        "opacity",
        "backgroundColour",
        "boxShadow",
        "scrollPosition",
        "path",
        "gradient",
      ].includes(value.keyPath)
    )
      throw new TypeError("AFXBasicAnimation key path is unsupported.");
    this.targetId = value.targetId;
    this.keyPath = value.keyPath;
    this.from = afxAnimationScalar(value.from, "AFXBasicAnimation from value");
    this.to = afxAnimationScalar(value.to, "AFXBasicAnimation to value");
    if (this.from instanceof GFXPath || this.to instanceof GFXPath || this.from instanceof GFXGradient || this.to instanceof GFXGradient)
      interpolateAFXValue(this.from, this.to, 0.5);
    if (!(value.animation instanceof AFXAnimation))
      throw new TypeError("AFXBasicAnimation requires an AFXAnimation value.");
    this.animation = value.animation;
    Object.freeze(this);
  }

  toRuntime() {
    const entry: AFXPropertyAnimation = Object.freeze({
      targetId: this.targetId,
      keyPath: this.keyPath,
      from: this.from,
      to: this.to,
    });
    return Object.freeze({
      animations: Object.freeze([entry]),
      ...this.animation.definition(),
    });
  }
  sample(seconds: number): AFXAnimationScalar | null {
    const progress = this.animation.progressAt(seconds);
    if (progress === null) return null;
    if (progress === 0) return this.from;
    if (progress === 1) return this.to;
    return interpolateAFXValue(this.from, this.to, progress);
  }
  retarget(from: AFXAnimationScalar): AFXBasicAnimation {
    return new AFXBasicAnimation({
      targetId: this.targetId,
      keyPath: this.keyPath,
      from,
      to: this.to,
      animation: this.animation,
    });
  }
}
