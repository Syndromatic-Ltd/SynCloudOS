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
import { NSEAnimationDefaults } from "../Appearance/NSEAnimationDefaults";
import { AFXTransaction } from "../../FX/AnimationFX/AFXTransaction";
import { afxAnimationTiming } from "../../FX/AnimationFX/animationValues";

/** A cubic Bézier curve, as CAMediaTimingFunction's control points describe one. */
type NSEAnimationTimingFunction = Extract<AFXAnimationTiming, { readonly kind: "cubic-bezier" }>;

/**
 * NSAnimationContext: the duration and timing function NSE animates with, and whether views
 * animate changes implicitly. Use `NSEAnimationContext.current` when you start your own AnimationFX
 * animation so it moves as the system's do. Motion is framework-owned: themes do not change it.
 */
export class NSEAnimationContext {
  static readonly #default = new NSEAnimationContext(NSEAnimationDefaults.durationSeconds.standard, NSEAnimationDefaults.easing.standard, false);
  static readonly #groups: NSEAnimationContext[] = [];

  /** NSAnimationContext.duration, in seconds. */
  #duration: number;
  get duration(): number { return this.#duration; }
  set duration(value: number) {
    if (!Number.isFinite(value) || value < 0 || value > 600) throw new RangeError("Animation duration must be finite and between 0 and 600 seconds.");
    this.#duration = value;
    if (NSEAnimationContext.#groups.at(-1) === this) AFXTransaction.setAnimationDuration(value);
  }
  /** NSAnimationContext.timingFunction (a CAMediaTimingFunction in AppKit). */
  #timingFunction: NSEAnimationTimingFunction;
  get timingFunction(): NSEAnimationTimingFunction { return this.#timingFunction; }
  set timingFunction(value: NSEAnimationTimingFunction) {
    const timing = afxAnimationTiming(value);
    if (typeof timing !== "object" || timing.kind !== "cubic-bezier") throw new TypeError("An animation context timing function needs cubic Bézier control points.");
    this.#timingFunction = timing;
    if (NSEAnimationContext.#groups.at(-1) === this) AFXTransaction.setAnimationTimingFunction(timing);
  }
  /** NSAnimationContext.allowsImplicitAnimation. NSE views animate changes only when asked to. */
  #allowsImplicitAnimation: boolean;
  get allowsImplicitAnimation(): boolean { return this.#allowsImplicitAnimation; }
  set allowsImplicitAnimation(value: boolean) {
    if (typeof value !== "boolean") throw new TypeError("allowsImplicitAnimation must be boolean.");
    this.#allowsImplicitAnimation = value;
    if (NSEAnimationContext.#groups.at(-1) === this) AFXTransaction.setDisableActions(!value);
  }

  private constructor(duration: number, timingFunction: NSEAnimationTimingFunction, allowsImplicitAnimation: boolean) {
    this.#duration = duration;
    this.#timingFunction = timingFunction;
    this.#allowsImplicitAnimation = allowsImplicitAnimation;
  }

  /** NSAnimationContext.current. */
  static get current(): NSEAnimationContext { return this.#groups.at(-1) ?? this.#default; }

  /** NSAnimationContext.runAnimationGroup(_:completionHandler:). Changes are synchronous;
   * completion waits for the group's layer and view animations, including nested groups. */
  static runAnimationGroup(changes: (context: NSEAnimationContext) => void, completionHandler?: () => void): void {
    if (typeof changes !== "function" || changes.constructor.name === "AsyncFunction") throw new TypeError("Animation groups require a synchronous callback.");
    if (completionHandler !== undefined && typeof completionHandler !== "function") throw new TypeError("The completion handler must be callable.");
    const parent = this.current;
    const context = new NSEAnimationContext(parent.duration, parent.timingFunction, parent.allowsImplicitAnimation);
    AFXTransaction.begin();
    this.#groups.push(context);
    try {
      context.duration = context.duration;
      context.timingFunction = context.timingFunction;
      context.allowsImplicitAnimation = context.allowsImplicitAnimation;
      if (completionHandler) AFXTransaction.setCompletionBlock(completionHandler);
      const result: unknown = changes(context);
      if (result && typeof (result as PromiseLike<unknown>).then === "function") {
        if (result instanceof Promise) void result.catch(() => {});
        throw new TypeError("Animation groups require a synchronous callback.");
      }
    } finally {
      this.#groups.pop();
      AFXTransaction.commit();
    }
  }
}
