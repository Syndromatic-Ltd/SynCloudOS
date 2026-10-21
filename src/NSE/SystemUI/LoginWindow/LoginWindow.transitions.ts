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

import { NSEAnimationDefaults, type NSEPresentationSpec, type NSEPresentationTrack } from "../../Animation";

const { emphasized } = NSEAnimationDefaults.easing;
// Framer tweens given only a duration ease with easeInOut (CSS ease-in-out).
const framerTween = "ease-in-out";

type Presentation = Readonly<{ enter: NSEPresentationSpec; exit: NSEPresentationSpec }>;

type LoginWindowTransitions = {
  /** The whole window fades in and out. */
  readonly window: Presentation;
  /** The placard swings in on its ropes and lifts away. */
  readonly enter: Presentation;
  /** Feedback for a visible sign-in error. */
  readonly shake: NSEPresentationSpec;
};

const track = (keyPath: NSEPresentationTrack["keyPath"], values: readonly number[]) =>
  Object.freeze({ keyPath, values: Object.freeze(values) }) as NSEPresentationTrack;
const spec = (duration: number, timing: NSEPresentationSpec["timing"], tracks: readonly NSEPresentationTrack[]): NSEPresentationSpec =>
  Object.freeze({ duration, timing, tracks: Object.freeze(tracks) });
const fade = (from: number, to: number, duration: number) => spec(duration, framerTween, [track("opacity", [from, to])]);

const windowFade: Presentation = Object.freeze({ enter: fade(0, 1, 0.16), exit: fade(1, 0, 0.16) });

const standard: LoginWindowTransitions = Object.freeze({
  window: windowFade,
  enter: Object.freeze({
    // Each component keeps its own keyframes: the rotation settles through a
    // damped swing while the scale bounces once, over the same 1.18 s.
    enter: spec(1.18, emphasized, [
      track("opacity", [0, 1]),
      track("transform.y", [-10, 0]),
      track("transform.rotate", [-9, 6.5, -3.8, 1.9, -0.7, 0]),
      track("transform.scale", [0.992, 1.006, 0.998, 1]),
    ]),
    exit: spec(0.32, emphasized, [track("opacity", [1, 0]), track("transform.y", [0, -12]), track("transform.scale", [1, 0.99])]),
  }),
  shake: spec(0.42, emphasized, [track("transform.x", [0, -14, 13, -9, 7, -3, 0])]),
});

const reduced: LoginWindowTransitions = Object.freeze({
  window: windowFade,
  enter: Object.freeze({ enter: fade(0, 1, 0.14), exit: fade(1, 0, 0.14) }),
  shake: spec(0.16, framerTween, [track("opacity", [1, 0.82, 1])]),
});

export type LoginMotionPolicy = Readonly<{ kind: "none" | "fade" | "slide" | "swing"; durationMs: number; easing: "linear" | "ease-out" | "ease-in-out" | "decelerate" }>;
export function resolveLoginWindowTransitions(reducedMotion: boolean, policy?: LoginMotionPolicy): LoginWindowTransitions {
  if (!policy || policy.kind === "swing") return reducedMotion ? reduced : standard;
  const duration = policy.kind === "none" ? 0 : Math.min(policy.durationMs / 1000, reducedMotion ? 0.14 : 1.5);
  const timing: NSEPresentationSpec["timing"] = policy.easing === "decelerate" ? { kind: "cubic-bezier", x1: 0.1, y1: 0.9, x2: 0.2, y2: 1 } : policy.easing;
  const slides = policy.kind === "slide" && !reducedMotion;
  return { window: { enter: fade(0,1,Math.min(duration,0.17)), exit: fade(1,0,Math.min(duration,0.17)) },
    enter: { enter: spec(duration,timing,[track("opacity",[0,1]), ...(slides ? [track("transform.y",[20,0])] : [])]), exit: spec(Math.min(duration,0.16),timing,[track("opacity",[1,0]), ...(slides ? [track("transform.y",[0,-12])] : [])]) },
    shake: spec(Math.min(duration,0.16),timing,[track("opacity",[1,0.82,1])]) };
}
