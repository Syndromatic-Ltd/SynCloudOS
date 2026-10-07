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

import { useMemo } from "react";
import { NSEAnimationDefaults, useNSEAnimationEnvironment, type NSEPresentationSpec, type NSETransformComponents } from "../NSE/Animation";

/** AnimationFX presentations for one part of the boot screen. */
export interface SystemStartupMotionPreset {
  readonly enter?: NSEPresentationSpec;
  readonly exit: NSEPresentationSpec;
}

export interface SystemStartupMotion {
  /** The whole layer only fades out as the shell takes over. */
  readonly bootLayer: SystemStartupMotionPreset;
  readonly bootSpinner: SystemStartupMotionPreset;
  readonly bootMaterialReveal: SystemStartupMotionPreset;
  readonly bootOverlayReveal: SystemStartupMotionPreset;
}

const { emphasized } = NSEAnimationDefaults.easing;
const reducedFade = NSEAnimationDefaults.durationSeconds.reducedFade;
// Framer tweens given only a duration ease with easeInOut (CSS ease-in-out).
const framerTween = "ease-in-out";

function presentation(duration: number, timing: NSEPresentationSpec["timing"], opacity: readonly [number, number],
  transform?: readonly [NSETransformComponents, NSETransformComponents]): NSEPresentationSpec {
  return Object.freeze({
    duration,
    timing,
    tracks: Object.freeze([
      Object.freeze({ keyPath: "opacity" as const, values: Object.freeze(opacity) }),
      ...(transform ? [Object.freeze({ keyPath: "transform" as const, values: Object.freeze(transform) })] : []),
    ]),
  });
}

const bootLayer: SystemStartupMotionPreset = Object.freeze({ exit: presentation(0.22, framerTween, [1, 0]) });

const standard: SystemStartupMotion = Object.freeze({
  bootLayer,
  bootSpinner: Object.freeze({
    enter: presentation(0.24, emphasized, [0, 1], [{ scale: 0.94 }, { scale: 1 }]),
    exit: presentation(0.24, emphasized, [1, 0], [{ scale: 1 }, { scale: 0.98 }]),
  }),
  bootMaterialReveal: Object.freeze({
    enter: presentation(0.58, emphasized, [0, 1]),
    exit: presentation(0.58, emphasized, [1, 0]),
  }),
  bootOverlayReveal: Object.freeze({
    enter: presentation(0.72, emphasized, [0, 1], [{ scale: 1.04 }, { scale: 1 }]),
    exit: presentation(0.72, emphasized, [1, 0]),
  }),
});

const reduced: SystemStartupMotion = Object.freeze({
  bootLayer,
  bootSpinner: Object.freeze({ enter: presentation(0.08, framerTween, [0, 1]), exit: presentation(0.08, framerTween, [1, 0]) }),
  bootMaterialReveal: Object.freeze({ enter: presentation(reducedFade, framerTween, [0, 1]), exit: presentation(reducedFade, framerTween, [1, 0]) }),
  bootOverlayReveal: Object.freeze({ enter: presentation(reducedFade, framerTween, [0, 1]), exit: presentation(reducedFade, framerTween, [1, 0]) }),
});

export function resolveSystemStartupMotion(reducedMotion: boolean): SystemStartupMotion {
  return reducedMotion ? reduced : standard;
}

export function useSystemStartupMotion(): SystemStartupMotion {
  const { reducedMotion } = useNSEAnimationEnvironment();
  return useMemo(() => resolveSystemStartupMotion(reducedMotion), [reducedMotion]);
}
