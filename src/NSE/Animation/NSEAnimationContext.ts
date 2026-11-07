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
import { NSEAnimationDefaults } from "./NSEAnimationDefaults";

/** A cubic Bézier curve, as CAMediaTimingFunction's control points describe one. */
type NSEAnimationTimingFunction = Extract<AFXAnimationTiming, { readonly kind: "cubic-bezier" }>;

/**
 * NSAnimationContext: the duration and timing function NSE animates with, and whether views
 * animate changes implicitly. Use `NSEAnimationContext.current` when you start your own AnimationFX
 * animation so it moves as the system's do; the curves themselves come from the theme (Atmo's are
 * `atmoMotion`).
 */
export class NSEAnimationContext {
  static readonly #current = new NSEAnimationContext(NSEAnimationDefaults.durationSeconds.standard, NSEAnimationDefaults.easing.standard, false);

  /** NSAnimationContext.duration, in seconds. */
  readonly duration: number;
  /** NSAnimationContext.timingFunction (a CAMediaTimingFunction in AppKit). */
  readonly timingFunction: NSEAnimationTimingFunction;
  /** NSAnimationContext.allowsImplicitAnimation. NSE views animate changes only when asked to. */
  readonly allowsImplicitAnimation: boolean;

  private constructor(duration: number, timingFunction: NSEAnimationTimingFunction, allowsImplicitAnimation: boolean) {
    this.duration = duration;
    this.timingFunction = timingFunction;
    this.allowsImplicitAnimation = allowsImplicitAnimation;
    Object.freeze(this);
  }

  /** NSAnimationContext.current. */
  static get current(): NSEAnimationContext { return NSEAnimationContext.#current; }
}
