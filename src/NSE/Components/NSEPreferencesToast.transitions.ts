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

import type { AFXAnimationTiming } from "../../FX/AnimationFX/animationTypes";
import {
  NSEAnimationDefaults,
  type NSELayoutTransitionTiming,
  type NSEPresentationSpec,
  type NSETransformComponents,
  type NSETranslationUnit,
} from "../Animation";

export type NSEPreferencesPaneDirection = "forward" | "back";

/** A view's AnimationFX presentations into and out of the panel. */
export interface NSEPreferencesPresentation {
  readonly enter: NSEPresentationSpec;
  readonly exit: NSEPresentationSpec;
}

export interface NSEPreferencesTransitions {
  /** The panel glides up from the lower screen and back down. */
  readonly toast: NSEPreferencesPresentation;
  /** The desk's dim and blur. */
  readonly veil: NSEPreferencesPresentation;
  /** Header titles pass through each other, vertically, with the navigation. */
  readonly title: (direction: NSEPreferencesPaneDirection) => NSEPreferencesPresentation;
  /** Panes push and pop horizontally with the navigation. */
  readonly pane: (direction: NSEPreferencesPaneDirection) => NSEPreferencesPresentation;
  readonly back: NSEPreferencesPresentation;
  /** How the panel's body grows and shrinks to the pane it shows. */
  readonly resize: NSELayoutTransitionTiming;
}

interface Pose {
  readonly opacity: number;
  readonly transform?: NSETransformComponents;
}

const bezier = (x1: number, y1: number, x2: number, y2: number): AFXAnimationTiming =>
  Object.freeze({ kind: "cubic-bezier", x1, y1, x2, y2 });
const glideOut = bezier(0.215, 0.61, 0.355, 1);
const glideIn = bezier(0.55, 0.055, 0.675, 0.19);
const emphasized = NSEAnimationDefaults.easing.emphasized;
// Framer tweens given only a duration ease with easeInOut.
const framerTween = "ease-in-out";

function move(from: Pose, to: Pose, duration: number, timing: AFXAnimationTiming, unit: NSETranslationUnit = "px"): NSEPresentationSpec {
  const tracks: NSEPresentationSpec["tracks"][number][] = [{ keyPath: "opacity", values: [from.opacity, to.opacity] }];
  if (from.transform || to.transform) tracks.push({ keyPath: "transform", unit, values: [from.transform ?? {}, to.transform ?? {}] });
  return Object.freeze({ duration, timing, tracks: Object.freeze(tracks) });
}

const shown: Pose = Object.freeze({ opacity: 1 });
const hidden: Pose = Object.freeze({ opacity: 0 });
const presentation = (enter: NSEPresentationSpec, exit: NSEPresentationSpec): NSEPreferencesPresentation => Object.freeze({ enter, exit });

/** Enters from `from` and leaves toward `to`, whichever way the stack moves. */
function directional(forward: { from: Pose; to: Pose }, back: { from: Pose; to: Pose }, duration: number, unit: NSETranslationUnit) {
  const forwards = presentation(move(forward.from, shown, duration, emphasized, unit), move(shown, forward.to, duration, emphasized, unit));
  const backwards = presentation(move(back.from, shown, duration, emphasized, unit), move(shown, back.to, duration, emphasized, unit));
  return (direction: NSEPreferencesPaneDirection) => direction === "back" ? backwards : forwards;
}

const lowered: Pose = Object.freeze({ opacity: 0, transform: Object.freeze({ y: 34, scale: 0.94 }) });
const fade = (duration: number) => presentation(move(hidden, shown, duration, framerTween), move(shown, hidden, duration, framerTween));
const reducedFade = fade(0.1);

const standard: NSEPreferencesTransitions = Object.freeze({
  toast: presentation(move(lowered, shown, 0.36, glideOut, "vh"), move(shown, lowered, 0.26, glideIn, "vh")),
  veil: presentation(move(hidden, shown, 0.34, glideOut), move(shown, hidden, 0.24, glideIn)),
  title: directional(
    { from: { opacity: 0, transform: { y: -90 } }, to: { opacity: 0, transform: { y: 90 } } },
    { from: { opacity: 0, transform: { y: 90 } }, to: { opacity: 0, transform: { y: -90 } } },
    0.26, "%"),
  pane: directional(
    { from: { opacity: 0, transform: { x: 28 } }, to: { opacity: 0, transform: { x: -22 } } },
    { from: { opacity: 0, transform: { x: -22 } }, to: { opacity: 0, transform: { x: 28 } } },
    0.22, "%"),
  back: presentation(
    move({ opacity: 0, transform: { x: 34 } }, shown, 0.28, emphasized),
    move(shown, { opacity: 0, transform: { x: -26 } }, 0.28, emphasized)),
  // Framer Motion's spring (stiffness 210, damping 28, mass 1), to within
  // 1/10000 of rest.
  resize: Object.freeze({ duration: Math.log(10000) / (28 / 2), timing: Object.freeze({ kind: "spring", stiffness: 210, damping: 28, mass: 1 }) as AFXAnimationTiming }),
});

const reduced: NSEPreferencesTransitions = Object.freeze({
  toast: presentation(move(hidden, shown, 0.14, framerTween), move(shown, hidden, 0.1, framerTween)),
  veil: reducedFade,
  title: () => reducedFade,
  pane: () => reducedFade,
  back: reducedFade,
  resize: Object.freeze({ duration: 0.12, timing: framerTween }),
});

export function resolveNSEPreferencesTransitions(reducedMotion: boolean): NSEPreferencesTransitions {
  return reducedMotion ? reduced : standard;
}
