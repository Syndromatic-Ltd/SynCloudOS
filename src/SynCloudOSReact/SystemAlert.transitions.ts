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

import { NSEAnimationDefaults, type NSEPresentationSpec } from "../NSE/Animation";

const { emphasized } = NSEAnimationDefaults.easing;

const details = (from: { y: number; scale: number }, to: { y: number; scale: number }, opacity: [number, number]): NSEPresentationSpec =>
  Object.freeze({
    duration: NSEAnimationDefaults.durationSeconds.standard,
    timing: emphasized,
    tracks: Object.freeze([
      Object.freeze({ keyPath: "opacity" as const, values: Object.freeze(opacity) }),
      Object.freeze({ keyPath: "transform" as const, values: Object.freeze([Object.freeze(from), Object.freeze(to)]) }),
    ]),
  });

const reducedFade = (from: number, to: number): NSEPresentationSpec => Object.freeze({
  duration: 0.08,
  timing: "ease-in-out",
  tracks: Object.freeze([Object.freeze({ keyPath: "opacity" as const, values: Object.freeze([from, to]) })]),
});

const standard = Object.freeze({
  enter: details({ y: -6, scale: 0.985 }, { y: 0, scale: 1 }, [0, 1]),
  exit: details({ y: 0, scale: 1 }, { y: -3, scale: 0.995 }, [1, 0]),
});

const reduced = Object.freeze({ enter: reducedFade(0, 1), exit: reducedFade(1, 0) });

export function resolveSystemAlertDetailsMotion(reducedMotion: boolean): { readonly enter: NSEPresentationSpec; readonly exit: NSEPresentationSpec } {
  return reducedMotion ? reduced : standard;
}
