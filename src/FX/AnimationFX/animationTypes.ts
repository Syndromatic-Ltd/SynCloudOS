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

import type { GFXGradient } from "../GraphicsFX/GFXGradient";
import type { GFXPath } from "../GraphicsFX/GFXPath";

export type AFXAnimationKeyPath =
  | "frame"
  | "transform"
  | "sublayerTransform"
  | "opacity"
  | "backgroundColour"
  | "boxShadow"
  /** A CSS filter list on a view, like CALayer.filters. Layer surfaces do
   * not declare it, so layer animations reject it. */
  | "filter"
  /** A view's CSS block size, as a length (`"84px"`). Layer surfaces do not
   * declare it; layers animate `frame`. */
  | "height"
  | "scrollPosition"
  | "path"
  | "gradient";

export type AFXAnimationTiming =
  | "linear"
  | "ease"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | {
      readonly kind: "cubic-bezier";
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
    }
  | {
      readonly kind: "spring";
      readonly stiffness: number;
      readonly damping: number;
      readonly mass: number;
    };

export type AFXAnimationFill = "none" | "forwards" | "backwards" | "both";
export type AFXReducedMotionPolicy = "system" | "always" | "never";
export type AFXAnimationScalar =
  | number
  | string
  | GFXPath
  | GFXGradient
  | { readonly x: number; readonly y: number }
  | {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }
  | Readonly<Record<string, number | string>>;

export interface AFXPropertyAnimation {
  readonly targetId: string;
  readonly keyPath: AFXAnimationKeyPath;
  readonly from: AFXAnimationScalar;
  readonly to: AFXAnimationScalar;
  readonly keyframes?: readonly Readonly<{
    offset: number;
    value: AFXAnimationScalar;
  }>[];
}

export interface AFXAnimationDefinition {
  readonly animations: readonly AFXPropertyAnimation[];
  readonly duration: number;
  readonly delay?: number;
  readonly iterations?: number;
  readonly autoreverses?: boolean;
  readonly fill?: AFXAnimationFill;
  readonly timing?: AFXAnimationTiming;
  readonly reducedMotion?: AFXReducedMotionPolicy;
}

export type AFXAnimationSettlementState =
  "completed" | "cancelled" | "interrupted" | "failed";

export interface AFXAnimationSettlement {
  readonly state: AFXAnimationSettlementState;
  readonly reduced: boolean;
  readonly reason?: string;
}

export interface AFXAnimationHandle {
  readonly id: string;
  readonly finished: Promise<AFXAnimationSettlement>;
  readonly progress: number;
  readonly state: "running" | "paused" | AFXAnimationSettlementState;
  cancel(reason?: string): void;
  pause(): void;
  resume(): void;
  seek(seconds: number): void;
}
