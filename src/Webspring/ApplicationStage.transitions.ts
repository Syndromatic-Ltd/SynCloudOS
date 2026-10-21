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

import { useNSEVisualEnvironment } from "../NSE/Appearance";


import { useMemo, type CSSProperties } from "react";
import {
  NSEAnimationDefaults,
  nseFilterStyle,
  nseTransformStyle,
  useNSEAnimationEnvironment,
  type NSEFilterComponents,
  type NSEPresentationEnter,
  type NSEPresentationSpec,
  type NSEPresentationTrack,
  type NSETransformComponents,
} from "../NSE/Animation";
import type { AFXAnimationTiming } from "../FX/AnimationFX/animationTypes";

export type ApplicationStageRole = "incoming" | "outgoing" | null;

/** One stage element's AnimationFX presentation. The element's style is the
 * model value for `state`; `enter` presents a state change and `exit` plays
 * before the stage removes the element. */
export interface ApplicationStagePartMotion {
  readonly state: string;
  readonly style: CSSProperties;
  readonly enter: NSEPresentationEnter;
  readonly exit: NSEPresentationSpec | null;
}

export interface ApplicationStageMotion {
  /** The app view frame: its fade, and its slide during a MultiSwitch. */
  readonly root: ApplicationStagePartMotion;
  /** The window surface: the launch zoom, and its plane during a MultiSwitch. */
  readonly surface: ApplicationStagePartMotion;
  readonly navigationBack: NSEPresentationSpec | null;
  readonly navigationTitle: NSEPresentationSpec | null;
}

export type ApplicationStageShellMotion = Readonly<{ kind: "none" | "fade" | "slide" | "depth"; durationMs: number; easing: "linear" | "ease-out" | "ease-in-out" | "decelerate" }>;
export interface ApplicationStageMotionInput {
  readonly shellMotion?: ApplicationStageShellMotion;
  readonly reducedMotion: boolean;
  readonly role: ApplicationStageRole;
  /** Mounted and painted, but not yet presented. */
  readonly staged: boolean;
  /** The app launches from Webspring: the zoom waits for the launch choreography. */
  readonly launching: boolean;
  /** How a launch zoom follows the launcher's own choreography. */
  readonly launchZoom?: Readonly<{ delay: number; duration: number; easing: keyof typeof NSEAnimationDefaults.easing }>;
  readonly presentationMotion?: "host" | "content";
}

const { standard: material, accelerate } = NSEAnimationDefaults.easing;
const reducedFade = NSEAnimationDefaults.durationSeconds.reducedFade;
const bezier = (x1: number, y1: number, x2: number, y2: number): AFXAnimationTiming =>
  Object.freeze({ kind: "cubic-bezier", x1, y1, x2, y2 });
const multiSwitchEase = bezier(0.55, 0.06, 0.18, 1);
const multiSwitchSettleEase = bezier(0.33, 0.01, 0.22, 1);
// Framer's default tween for a value without a transition, and its default
// ease for a tween given only a duration.
const framerDefaultEase = bezier(0.25, 0.1, 0.35, 1);
const framerTween = "ease-in-out";
const multiSwitchDuration = 0.72;

const opacityTrack = (values: readonly number[], keyTimes?: readonly number[]): NSEPresentationTrack =>
  Object.freeze({ keyPath: "opacity", values: Object.freeze(values), ...(keyTimes ? { keyTimes: Object.freeze(keyTimes) } : {}) });
const transformTrack = (values: readonly NSETransformComponents[], options: Partial<Pick<Extract<NSEPresentationTrack, { keyPath: "transform" }>, "keyTimes" | "unit" | "timingFunctions">> = {}): NSEPresentationTrack =>
  Object.freeze({ keyPath: "transform", values: Object.freeze(values), ...options });
const filterTrack = (values: readonly NSEFilterComponents[], keyTimes: readonly number[]): NSEPresentationTrack =>
  Object.freeze({ keyPath: "filter", values: Object.freeze(values), keyTimes: Object.freeze(keyTimes) });
const spec = (duration: number, timing: AFXAnimationTiming, tracks: readonly NSEPresentationTrack[], delay = 0): NSEPresentationSpec =>
  Object.freeze({ duration, timing, tracks: Object.freeze(tracks), ...(delay > 0 ? { delay } : {}) });
const fade = (from: number, to: number, duration: number, timing: AFXAnimationTiming, delay = 0) =>
  spec(duration, timing, [opacityTrack([from, to])], delay);
/** Presents only a fresh element (mount, launch from staging, or re-entry). */
const onPresentation = (presentation: NSEPresentationSpec) =>
  (previous: string | null) => previous === null || previous === "staged" ? presentation : null;
const onMount = (presentation: NSEPresentationSpec) =>
  (previous: string | null) => previous === null ? presentation : null;

// The outgoing MultiSwitch plane recedes, darkens and leans away; the
// incoming plane settles forward from the pose the outgoing one reaches.
const outgoingKeyTimes = [0, 0.45, 1];
const outgoingPoses: readonly NSETransformComponents[] = [
  { scale: 0.98, z: -24, rotateY: 2 },
  { scale: 0.86, z: -180, rotateY: 14 },
  { scale: 0.86, z: -260, rotateY: 22 },
];
const outgoingFilters: readonly NSEFilterComponents[] = [{ brightness: 1 }, { brightness: 0.6 }, { brightness: 0.4 }];
const outgoingOpacity = [1, 1, 0.94];
const outgoingSurface = spec(multiSwitchDuration, framerTween, [
  opacityTrack(outgoingOpacity, outgoingKeyTimes),
  filterTrack(outgoingFilters, outgoingKeyTimes),
  transformTrack(outgoingPoses, { keyTimes: outgoingKeyTimes }),
]);
const outgoingSurfaceStyle: CSSProperties = Object.freeze({
  opacity: outgoingOpacity.at(-1),
  filter: nseFilterStyle(outgoingFilters.at(-1)!),
  transform: nseTransformStyle(outgoingPoses.at(-1)!),
});
const incomingSurface = spec(multiSwitchDuration, framerTween, [transformTrack([
  { scale: 0.86, z: -260, rotateY: -22 },
  { scale: 0.86, z: -180, rotateY: -14 },
  {},
], { keyTimes: [0, 0.55, 1], timingFunctions: [framerTween, multiSwitchSettleEase] })]);
const outgoingRootPose: NSETransformComponents = { x: -118 };
const outgoingRoot = spec(multiSwitchDuration, multiSwitchEase, [transformTrack([{}, outgoingRootPose], { unit: "vw" })]);
const incomingRoot = spec(multiSwitchDuration, multiSwitchEase, [transformTrack([{ x: 118 }, {}], { unit: "vw" })]);

const modelOpacity = (style: CSSProperties) => typeof style.opacity === "number" ? style.opacity : 1;

/** The stage's presentations for one app view in one role. Timings match the
 * Framer definitions they replace. */
const defaultLaunchZoom = Object.freeze({ delay: 0.72, duration: 0.68, easing: "accelerate" as const });

function resolvePlanarApplicationStageMotion({ reducedMotion, role, staged, shellMotion }: ApplicationStageMotionInput & { shellMotion: ApplicationStageShellMotion }): ApplicationStageMotion {
  const duration = shellMotion.kind === "none" ? 0 : reducedMotion ? Math.min(shellMotion.durationMs / 1000, 0.14) : shellMotion.durationMs / 1000;
  const slides = shellMotion.kind === "slide" && !reducedMotion;
  const timing = shellMotion.easing === "decelerate" ? bezier(0.1, 0.9, 0.2, 1) : shellMotion.easing;
  const enterTracks = [opacityTrack([0, 1]), ...(slides ? [transformTrack([{ x: 32 }, {}])] : [])];
  const outPose = slides ? { x: -32 } : {};
  const root: ApplicationStagePartMotion = role === "outgoing"
    ? { state: "outgoing", style: { opacity: 0, ...(slides ? { transform: nseTransformStyle(outPose) } : {}) }, enter: spec(duration, timing, [opacityTrack([1, 0]), ...(slides ? [transformTrack([{}, outPose])] : [])]), exit: fade(0, 0, 0, timing) }
    : role === "incoming"
      ? { state: "incoming", style: {}, enter: onMount(spec(duration, timing, enterTracks)), exit: fade(1, 0, Math.min(duration, 0.16), timing) }
      : staged
        ? { state: "staged", style: { opacity: 0 }, enter: null, exit: fade(0, 0, 0, timing) }
        : { state: "presented", style: {}, enter: onPresentation(fade(0, 1, Math.min(duration, 0.17), timing)), exit: fade(1, 0, Math.min(duration, 0.17), timing) };
  const surface: ApplicationStagePartMotion = role === "outgoing"
    ? { state: "outgoing", style: { opacity: 0 }, enter: fade(1, 0, duration, timing), exit: fade(0, 0, 0, timing) }
    : role === "incoming"
      ? { state: "incoming", style: {}, enter: onMount(fade(0, 1, Math.min(duration, 0.17), timing)), exit: fade(1, 0, Math.min(duration, 0.17), timing) }
      : staged
        ? { state: "staged", style: { opacity: 0, ...(slides ? { transform: nseTransformStyle({ x: 32 }) } : {}) }, enter: null, exit: fade(0, 0, 0, timing) }
        : { state: "presented", style: {}, enter: onPresentation(spec(duration, timing, enterTracks)), exit: spec(Math.min(duration, 0.2), timing, [opacityTrack([1, 0]), ...(slides ? [transformTrack([{}, { x: -20 }])] : [])]) };
  return { root, surface, navigationBack: null, navigationTitle: null };
}

export function resolveApplicationStageMotion({ reducedMotion, role, staged, launching, launchZoom = defaultLaunchZoom, presentationMotion = "host", shellMotion }: ApplicationStageMotionInput): ApplicationStageMotion {
  if (presentationMotion === "content") {
    const part: ApplicationStagePartMotion = { state: staged ? "staged" : "presented", style: staged ? { opacity: 0 } : {}, enter: null, exit: null };
    return { root: { ...part, state: staged ? "staged" : role ?? "presented" }, surface: part, navigationBack: null, navigationTitle: null };
  }
  if (shellMotion && shellMotion.kind !== "depth") return resolvePlanarApplicationStageMotion({ reducedMotion, role, staged, launching, shellMotion });
  const root = ((): Omit<ApplicationStagePartMotion, "exit"> => {
    if (role === "incoming") return {
      state: "incoming", style: {},
      enter: onMount(reducedMotion ? fade(0, 1, 0.14, material) : incomingRoot),
    };
    if (role === "outgoing") return reducedMotion
      ? { state: "outgoing", style: { opacity: 0 }, enter: fade(1, 0, reducedFade, material) }
      : { state: "outgoing", style: { transform: nseTransformStyle(outgoingRootPose, "vw") }, enter: outgoingRoot };
    if (staged) return { state: "staged", style: { opacity: 0 }, enter: null };
    return { state: "presented", style: {}, enter: onPresentation(fade(0, 1, 0.3, framerDefaultEase)) };
  })();
  const rootOpacity = modelOpacity(root.style);

  const surface = ((): Omit<ApplicationStagePartMotion, "exit"> => {
    if (role === "incoming") return {
      state: "incoming", style: {},
      enter: onMount(reducedMotion ? fade(0, 1, 0.14, material) : incomingSurface),
    };
    if (role === "outgoing") return reducedMotion
      ? { state: "outgoing", style: { opacity: 0 }, enter: fade(1, 0, reducedFade, material) }
      : { state: "outgoing", style: outgoingSurfaceStyle, enter: outgoingSurface };
    if (staged) return {
      state: "staged",
      style: reducedMotion ? { opacity: 0 } : { opacity: 0, transform: nseTransformStyle({ scale: 0.04 }) },
      enter: null,
    };
    // A launch from Webspring waits for the launch choreography before zooming.
    const delay = launching ? launchZoom.delay : 0;
    const duration = launching ? launchZoom.duration : defaultLaunchZoom.duration;
    const easing = launching ? NSEAnimationDefaults.easing[launchZoom.easing] : accelerate;
    return {
      state: "presented", style: {},
      enter: onPresentation(reducedMotion
        ? fade(0, 1, 0.14, framerTween, delay)
        : spec(duration, easing, [opacityTrack([0, 1]), transformTrack([{ scale: 0.04 }, {}])], delay)),
    };
  })();
  const surfaceOpacity = modelOpacity(surface.style);
  const surfaceScale = role === null && staged && !reducedMotion ? 0.04 : 1;

  const switching = role !== null;
  return {
    root: {
      ...root,
      exit: switching
        ? fade(rootOpacity, 0, 0.08, "linear")
        : fade(rootOpacity, 0, 0.2, "linear", 0.3),
    },
    surface: {
      ...surface,
      exit: switching
        ? fade(surfaceOpacity, 0, 0.01, "linear")
        : reducedMotion
          ? fade(surfaceOpacity, 0, 0.08, framerTween)
          // The plane shrinks away while its opacity follows 0.22 s later.
          : spec(0.48, accelerate, [
              opacityTrack([surfaceOpacity, surfaceOpacity, 0, 0], [0, 0.22 / 0.48, 0.44 / 0.48, 1]),
              transformTrack([{ scale: surfaceScale }, { scale: 0 }]),
            ]),
    },
    navigationBack: reducedMotion ? null : spec(0.18, material, [opacityTrack([0, 1]), transformTrack([{ x: -8 }, {}])]),
    navigationTitle: reducedMotion ? null : spec(0.18, material, [opacityTrack([0, 1]), transformTrack([{ x: 8 }, {}])]),
  };
}

export function useApplicationStageMotion(input: Omit<ApplicationStageMotionInput, "reducedMotion">): ApplicationStageMotion {
  const { reducedMotion } = useNSEAnimationEnvironment();
  const { theme } = useNSEVisualEnvironment();
  const shellMotion = theme.presentation.motion?.shell ?? { kind: "none" as const, durationMs: 0, easing: "ease-out" as const };
  const { role, staged, launching, launchZoom, presentationMotion } = input;
  return useMemo(
    () => resolveApplicationStageMotion({ reducedMotion, role, staged, launching, launchZoom, presentationMotion, shellMotion }),
    [launching, launchZoom, reducedMotion, role, staged, presentationMotion, shellMotion],
  );
}
