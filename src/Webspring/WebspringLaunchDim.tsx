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

import { useRef } from "react";
import { NSEAnimationDefaults, NSEPresence, useNSEPresentation, type NSEPresentationSpec } from "../NSE/Animation";

/** The launch dim's resting opacity (its model value) and the AnimationFX
 * presentations that bring it in over the Board or Dial and take it away. */
export interface WebspringLaunchDimMotion {
  readonly opacity: number;
  readonly enter: NSEPresentationSpec;
  readonly exit: NSEPresentationSpec;
}

const fade = (from: number, to: number, duration: number, timing: NSEPresentationSpec["timing"]): NSEPresentationSpec =>
  Object.freeze({ duration, timing, tracks: Object.freeze([Object.freeze({ keyPath: "opacity" as const, values: Object.freeze([from, to]) })]) });

const dim = (opacity: number, duration: number, timing: NSEPresentationSpec["timing"]): WebspringLaunchDimMotion =>
  Object.freeze({ opacity, enter: fade(0, opacity, duration, timing), exit: fade(opacity, 0, duration, timing) });

const standard = dim(0.78, 0.56, "linear");
const reduced = dim(0.72, NSEAnimationDefaults.durationSeconds.reducedFade, "ease-in-out");

export function resolveWebspringLaunchDimMotion(reducedMotion: boolean): WebspringLaunchDimMotion {
  return reducedMotion ? reduced : standard;
}

function LaunchDim({ motion }: { motion: WebspringLaunchDimMotion }) {
  const dimRef = useRef<HTMLDivElement>(null);
  useNSEPresentation(dimRef, motion);
  // As with a Core Animation layer, the element holds its model value and the
  // presentation animates over it; nothing is left applied once it settles.
  return <div ref={dimRef} className="webspring-launch-dim" aria-hidden="true" style={{ opacity: motion.opacity }} />;
}

/** Dims the launcher while an application launches, fading out as it leaves. */
export function WebspringLaunchDim({ visible, motion }: { visible: boolean; motion: WebspringLaunchDimMotion }) {
  return <NSEPresence>{visible ? <LaunchDim motion={motion} /> : null}</NSEPresence>;
}
