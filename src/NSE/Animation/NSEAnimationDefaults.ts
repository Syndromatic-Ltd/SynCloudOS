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

import type { AFXAnimationTiming } from "../../FX/AnimationFX/public";
import { afxAnimationTiming } from "../../FX/AnimationFX/animationValues";

export interface NSEAnimationDefaults {
  readonly easing: {
    readonly standard: Extract<AFXAnimationTiming, { readonly kind: "cubic-bezier" }>;
    readonly emphasized: Extract<AFXAnimationTiming, { readonly kind: "cubic-bezier" }>;
    readonly decelerate: Extract<AFXAnimationTiming, { readonly kind: "cubic-bezier" }>;
    readonly accelerate: Extract<AFXAnimationTiming, { readonly kind: "cubic-bezier" }>;
  };
  readonly durationSeconds: {
    readonly instant: number;
    readonly reducedFade: number;
    readonly quick: number;
    readonly standard: number;
  };
}

type CubicBezierTiming = Extract<
  AFXAnimationTiming,
  { readonly kind: "cubic-bezier" }
>;

function cubicBezier(value: CubicBezierTiming): CubicBezierTiming {
  return afxAnimationTiming(value) as CubicBezierTiming;
}

const easing = Object.freeze({
  standard: Object.freeze(cubicBezier({
    kind: "cubic-bezier",
    x1: 0.2,
    y1: 0.8,
    x2: 0.2,
    y2: 1,
  })),
  emphasized: Object.freeze(cubicBezier({
    kind: "cubic-bezier",
    x1: 0.2,
    y1: 0.9,
    x2: 0.18,
    y2: 1,
  })),
  decelerate: Object.freeze(cubicBezier({
    kind: "cubic-bezier",
    x1: 0.16,
    y1: 0.94,
    x2: 0.18,
    y2: 1,
  })),
  accelerate: Object.freeze(cubicBezier({
    kind: "cubic-bezier",
    x1: 0.62,
    y1: 0,
    x2: 0.92,
    y2: 0.42,
  })),
});

const durationSeconds = Object.freeze({
  instant: 0.01,
  reducedFade: 0.12,
  quick: 0.16,
  standard: 0.18,
});

export const NSEAnimationDefaults: NSEAnimationDefaults = Object.freeze({
  easing,
  durationSeconds,
});
