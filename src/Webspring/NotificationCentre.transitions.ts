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

import { useMemo, type CSSProperties } from "react";
import {
  NSEAnimationDefaults,
  nseFilterStyle,
  nseTransformStyle,
  useNSEAnimationEnvironment,
  type NSEPresentationEnter,
  type NSEPresentationSpec,
  type NSEPresentationTrack,
} from "../NSE/Animation";
import type { AFXAnimationTiming } from "../FX/AnimationFX/animationTypes";

/** A presented element's model style and the presentation into it. */
export interface NotificationStatePresentation {
  readonly style: CSSProperties;
  readonly enter: NSEPresentationEnter;
}

/** The banner cube's rotor: hidden until its screen slice is ready, then
 * flipped into view; a replacement flips it away and a new rotor back in. */
export type NotificationRotorState = "hidden" | "presented" | "replaced" | "incoming";

export interface NotificationMotion {
  readonly bannerStage: Readonly<{ exit: NSEPresentationSpec }>;
  readonly rotor: (state: NotificationRotorState) => NotificationStatePresentation;
  /** Flips the rotor away as the banner is dismissed, from the state it shows. */
  readonly rotorExit: (state: NotificationRotorState) => NSEPresentationSpec;
  readonly bannerScreenFace: NotificationStatePresentation;
  readonly bannerStatusStrip: NotificationStatePresentation;
  /** Returns a dragged banner that was not dismissed to rest. */
  readonly dragRelease: ((offset: number) => NSEPresentationSpec) | null;
  readonly centre: Readonly<{ enter: NSEPresentationSpec; exit: NSEPresentationSpec }>;
  readonly group: Readonly<{ enter: NSEPresentationSpec; exit: NSEPresentationSpec }>;
}

const { standard: material, emphasized, accelerate } = NSEAnimationDefaults.easing;
const reducedFade = NSEAnimationDefaults.durationSeconds.reducedFade;
const bezier = (x1: number, y1: number, x2: number, y2: number): AFXAnimationTiming =>
  Object.freeze({ kind: "cubic-bezier", x1, y1, x2, y2 });
const bannerPresentEase = bezier(0.2, 0, 0.12, 1);
const bannerDismissEase = bezier(0.34, 0, 0.2, 1);
const bannerReplaceEase = bezier(0.28, 0, 0.18, 1);
// Framer tweens given only a duration ease with easeInOut (CSS ease-in-out).
const framerTween = "ease-in-out";
// Framer's default spring for a released translation.
const releaseSpring: AFXAnimationTiming = Object.freeze({ kind: "spring", stiffness: 500, damping: 25, mass: 1 });
const releaseSettling = Math.log(10000) / (25 / 2);

const track = (keyPath: NSEPresentationTrack["keyPath"], values: readonly unknown[]): NSEPresentationTrack =>
  Object.freeze({ keyPath, values: Object.freeze(values) }) as NSEPresentationTrack;
const spec = (duration: number, timing: AFXAnimationTiming, tracks: readonly NSEPresentationTrack[], delay = 0): NSEPresentationSpec =>
  Object.freeze({ duration, timing, tracks: Object.freeze(tracks), ...(delay > 0 ? { delay } : {}) });

const hiddenRotation = 92;

function standardMotion(): NotificationMotion {
  const flip = (from: number, to: number, duration: number, timing: AFXAnimationTiming) =>
    spec(duration, timing, [track("transform.rotateX", [from, to])]);
  const hidden: CSSProperties = Object.freeze({ transform: nseTransformStyle({ rotateX: hiddenRotation }) });
  const rotation = (state: NotificationRotorState) => state === "presented" ? 0 : hiddenRotation;
  const screenFace = { opacity: 0.82, filter: { brightness: 0.72, saturate: 0.92 } };
  const statusStrip = { opacity: 0.52, filter: { brightness: 0.26 } };
  return {
    bannerStage: { exit: spec(0.08, framerTween, [track("opacity", [1, 0])], 0.3) },
    rotor: (state) => state === "presented"
      ? { style: {}, enter: (previous) => previous === "replaced" || previous === "incoming"
          ? flip(hiddenRotation, 0, 0.24, bannerReplaceEase)
          : previous === "hidden" || previous === null ? flip(hiddenRotation, 0, 0.42, bannerPresentEase) : null }
      : state === "replaced"
        ? { style: hidden, enter: flip(0, hiddenRotation, 0.24, bannerReplaceEase) }
        : { style: hidden, enter: null },
    rotorExit: (state) => flip(rotation(state), hiddenRotation, 0.36, bannerDismissEase),
    bannerScreenFace: {
      style: { opacity: screenFace.opacity, filter: nseFilterStyle(screenFace.filter) },
      enter: spec(0.42, material, [
        track("opacity", [1, screenFace.opacity]),
        track("filter", [{ brightness: 1, saturate: 1 }, screenFace.filter]),
      ]),
    },
    bannerStatusStrip: {
      style: { opacity: statusStrip.opacity, filter: nseFilterStyle(statusStrip.filter) },
      enter: spec(0.42, material, [
        track("opacity", [0.36, statusStrip.opacity]),
        track("filter", [{ brightness: 0.68 }, statusStrip.filter]),
      ]),
    },
    dragRelease: (offset) => spec(releaseSettling, releaseSpring, [track("transform.y", [offset, 0])]),
    centre: {
      enter: spec(0.34, emphasized, [track("opacity", [0, 1]), track("transform.y", [-16, 0]), track("transform.scale", [0.982, 1])]),
      exit: spec(0.2, accelerate, [track("opacity", [1, 0]), track("transform.y", [0, -12]), track("transform.scale", [1, 0.986])]),
    },
    group: {
      enter: spec(0.22, material, [track("opacity", [0, 1]), track("height", [0, "auto"])]),
      exit: spec(0.22, material, [track("opacity", [1, 0]), track("height", ["auto", 0])]),
    },
  };
}

function reducedMotion(): NotificationMotion {
  const fade = (from: number, to: number, duration: number, timing: AFXAnimationTiming = framerTween) =>
    spec(duration, timing, [track("opacity", [from, to])]);
  return {
    bannerStage: { exit: spec(0.08, framerTween, [track("opacity", [1, 0])], 0.3) },
    rotor: (state) => state === "presented"
      ? { style: {}, enter: (previous) => previous === "replaced" || previous === "incoming"
          ? fade(0, 1, 0.08)
          : previous === "hidden" || previous === null
            ? spec(reducedFade, material, [track("opacity", [0, 1]), track("transform.y", [-6, 0])])
            : null }
      : state === "replaced"
        ? { style: { opacity: 0 }, enter: fade(1, 0, 0.08) }
        : state === "incoming"
          ? { style: { opacity: 0 }, enter: null }
          : { style: { opacity: 0, transform: nseTransformStyle({ y: -6 }) }, enter: null },
    rotorExit: (state) => fade(state === "presented" ? 1 : 0, 0, 0.08),
    bannerScreenFace: { style: { opacity: 0 }, enter: null },
    bannerStatusStrip: { style: { opacity: 0 }, enter: null },
    dragRelease: null,
    centre: { enter: fade(0, 1, 0.1), exit: fade(1, 0, 0.08) },
    group: { enter: fade(0, 1, 0.08), exit: fade(1, 0, 0.08) },
  };
}

const motions = Object.freeze({ standard: standardMotion(), reduced: reducedMotion() });

export function resolveNotificationMotion(reduced: boolean): NotificationMotion {
  return reduced ? motions.reduced : motions.standard;
}

export function useNotificationMotion(): NotificationMotion {
  const { reducedMotion } = useNSEAnimationEnvironment();
  return useMemo(() => resolveNotificationMotion(reducedMotion), [reducedMotion]);
}
