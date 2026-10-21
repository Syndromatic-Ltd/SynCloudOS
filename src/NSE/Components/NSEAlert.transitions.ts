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

import { NSEAnimationDefaults, type NSEPresentationSpec } from "../Animation";

/** Enter and exit presentations, played through AnimationFX. */
export interface NSEAlertMotion {
  readonly enter: NSEPresentationSpec;
  readonly exit: NSEPresentationSpec;
}

const { decelerate } = NSEAnimationDefaults.easing;
// Framer tweens given only a duration eased with easeInOut (CSS ease-in-out).
const fade = (from: number, to: number, duration: number, timing: NSEPresentationSpec["timing"] = "ease-in-out"): NSEPresentationSpec =>
  Object.freeze({ duration, timing, tracks: Object.freeze([Object.freeze({ keyPath: "opacity" as const, values: Object.freeze([from, to]) })]) });

// The standard alert pops in with a damped overshoot. As with a CAKeyframe
// timing function per segment, the decelerate curve eases every segment.
const alertStandard: NSEAlertMotion = Object.freeze({
  enter: Object.freeze({
    duration: 0.58,
    timing: decelerate,
    tracks: Object.freeze([
      Object.freeze({ keyPath: "opacity" as const, values: Object.freeze([0, 1]) }),
      Object.freeze({ keyPath: "transform" as const, values: Object.freeze([0, 1.18, 0.94, 1.035, 1].map((scale) => Object.freeze({ scale }))) }),
    ]),
  }),
  exit: Object.freeze({
    duration: 0.58,
    timing: decelerate,
    tracks: Object.freeze([
      Object.freeze({ keyPath: "opacity" as const, values: Object.freeze([1, 0]) }),
      Object.freeze({ keyPath: "transform" as const, values: Object.freeze([Object.freeze({ scale: 1 }), Object.freeze({ scale: 0.86 })]) }),
    ]),
  }),
});

const alertReduced: NSEAlertMotion = Object.freeze({
  enter: fade(0, 1, NSEAnimationDefaults.durationSeconds.quick),
  exit: fade(1, 0, NSEAnimationDefaults.durationSeconds.quick),
});

const backdropStandard: NSEAlertMotion = Object.freeze({
  enter: fade(0, 1, NSEAnimationDefaults.durationSeconds.standard),
  exit: fade(1, 0, NSEAnimationDefaults.durationSeconds.standard),
});

const backdropReduced: NSEAlertMotion = Object.freeze({
  enter: fade(0, 1, 0.08),
  exit: fade(1, 0, 0.08),
});

export type NSEOverlayMotionPolicy = Readonly<{ kind: "none" | "fade" | "slide" | "bounce"; durationMs: number; easing: "linear" | "ease-out" | "ease-in-out" | "decelerate" }>;
export function resolveNSEAlertMotion(reducedMotion: boolean, policy?: NSEOverlayMotionPolicy): NSEAlertMotion {
  if (!policy || policy.kind === "bounce") return reducedMotion ? alertReduced : alertStandard;
  const duration = policy.kind === "none" ? 0 : Math.min(policy.durationMs / 1000, reducedMotion ? 0.14 : 1.5);
  const timing: NSEPresentationSpec["timing"] = policy.easing === "decelerate" ? { kind: "cubic-bezier", x1: 0.1, y1: 0.9, x2: 0.2, y2: 1 } : policy.easing;
  const slides = policy.kind === "slide" && !reducedMotion;
  return { enter: { duration, timing, tracks: [{ keyPath:"opacity", values:[0,1] }, ...(slides ? [{ keyPath:"transform" as const, values:[{ y:24 },{}] }] : [])] }, exit: { duration:Math.min(duration,0.16), timing, tracks:[{ keyPath:"opacity",values:[1,0] }, ...(slides ? [{ keyPath:"transform" as const,values:[{},{ y:-12 }] }] : [])] } };
}

export function resolveNSEAlertBackdropMotion(reducedMotion: boolean): NSEAlertMotion {
  return reducedMotion ? backdropReduced : backdropStandard;
}
