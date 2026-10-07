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
import type { AFXAnimationTiming } from "../FX/AnimationFX/animationTypes";
import {
  NSEAnimationDefaults,
  nseTransformStyle,
  useNSEAnimationEnvironment,
  type NSEPresentationEnter,
  type NSEPresentationSpec,
  type NSETransformComponents,
} from "../NSE/Animation";

export interface WebspringMotion {
  /** Seconds the selector pointer takes to swing to a new application. */
  readonly selectorDuration: number;
  /** The orb swells while an application launches from the Dial. */
  readonly orbLaunchPulse: Readonly<{ scale: number }>;
  /** AnimationFX presentations for the dim behind the login window. */
  readonly loginBackdropDim: Readonly<{ enter: NSEPresentationSpec; exit: NSEPresentationSpec }>;
  readonly getRadialExitForIcon: typeof getWebspringRadialExitForIcon;
}

const opacityFade = (from: number, to: number, duration: number, timing: NSEPresentationSpec["timing"], delay = 0): NSEPresentationSpec =>
  Object.freeze({
    duration, timing, ...(delay > 0 ? { delay } : {}),
    tracks: Object.freeze([Object.freeze({ keyPath: "opacity" as const, values: Object.freeze([from, to]) })]),
  });
const loginBackdropDim = Object.freeze({
  standard: Object.freeze({
    enter: opacityFade(0, 1, 0.55, NSEAnimationDefaults.easing.emphasized, 0.35),
    exit: opacityFade(1, 0, 0.28, NSEAnimationDefaults.easing.emphasized),
  }),
  // Framer tweens given only a duration ease with easeInOut.
  reduced: Object.freeze({ enter: opacityFade(0, 1, 0.1, "ease-in-out"), exit: opacityFade(1, 0, 0.1, "ease-in-out") }),
});

interface RadialVector {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

function radialVector(index: number, total: number, angle?: number): RadialVector {
  const computedAngle = angle ?? -160 + (Math.max(total, 1) === 1 ? 0 : (index / (total - 1)) * 320);
  const radians = (computedAngle * Math.PI) / 180;
  const distance = 560;
  return {
    x: Math.sin(radians) * distance,
    y: -Math.cos(radians) * distance,
    angle: computedAngle,
  };
}

function createRadialExit(index: number, total: number, angle?: number): WebspringRadialExit {
  const vector = radialVector(index, total, angle);
  return Object.freeze({
    x: vector.x,
    y: vector.y,
    scale: 2.85,
    opacity: 0,
    rotate: vector.angle / 18,
  });
}

/** Where a Dial icon flies to as an application launches: out along its
 * spoke, swelling and fading. */
export type WebspringRadialExit = Readonly<{
  x: number;
  y: number;
  scale: number;
  opacity: number;
  rotate: number;
}>;

const radialExitDefinitions = new Map<string, WebspringRadialExit>();

export function getWebspringSelectorTransform(angle: number, radius = -60): string {
  return `translate(-50%, -50%) rotate(${angle}deg) translateY(${radius}px)`;
}

export function getWebspringRadialExitForIcon(index: number, total: number, angle?: number): WebspringRadialExit {
  const key = `${index}:${total}:${angle ?? "auto"}`;
  const interned = radialExitDefinitions.get(key);
  if (interned) return interned;
  const definition = createRadialExit(index, total, angle);
  radialExitDefinitions.set(key, definition);
  return definition;
}

// Framer tweens given only a duration ease with easeInOut.
const framerTween = "ease-in-out";
const orbLaunchPulse = Object.freeze({
  standard: Object.freeze({ scale: 1.06 }),
  reduced: Object.freeze({ scale: 1 }),
});

export function resolveWebspringMotion(reducedMotion: boolean): WebspringMotion {
  return reducedMotion
    ? { selectorDuration: 0.01, orbLaunchPulse: orbLaunchPulse.reduced, loginBackdropDim: loginBackdropDim.reduced, getRadialExitForIcon: getWebspringRadialExitForIcon }
    : { selectorDuration: 0.26, orbLaunchPulse: orbLaunchPulse.standard, loginBackdropDim: loginBackdropDim.standard, getRadialExitForIcon: getWebspringRadialExitForIcon };
}

export function useWebspringMotion(): WebspringMotion {
  const { reducedMotion } = useNSEAnimationEnvironment();
  return useMemo(() => resolveWebspringMotion(reducedMotion), [reducedMotion]);
}

/** The orb's scale while an application launches (its model value) and the
 * 0.45 s tween that swells it and settles it back. */
export function resolveWebspringOrbPresentation(reducedMotion: boolean, launching: boolean): Readonly<{
  state: "launching" | "rest";
  style: CSSProperties;
  enter: NSEPresentationEnter;
}> {
  const pulse = (reducedMotion ? orbLaunchPulse.reduced : orbLaunchPulse.standard).scale;
  const scale = launching ? pulse : 1, from = launching ? 1 : pulse;
  return {
    state: launching ? "launching" : "rest",
    style: scale === 1 ? {} : { transform: nseTransformStyle({ scale }) },
    // The orb appears at rest; it only animates between launch and rest.
    enter: (previous) => previous === null || from === scale ? null : Object.freeze({
      duration: 0.45, timing: framerTween,
      tracks: [{ keyPath: "transform" as const, values: [{ scale: from }, { scale }] }],
    }),
  };
}

// --- Launcher icons --------------------------------------------------------

/** Where a launcher icon is in the Webspring's entrance and launch choreography. */
export type WebspringIconState = "waiting" | "holding" | "ready" | "launching" | "covered" | "returning";

const spring = (stiffness: number, damping: number, mass: number) => Object.freeze({
  timing: Object.freeze({ kind: "spring", stiffness, damping, mass }) as AFXAnimationTiming,
  // An underdamped spring's envelope decays at damping / 2m; this is where it
  // is within 1/10000 of rest.
  duration: Math.log(10000) / (damping / (2 * mass)),
});

/** The icon springs, as Framer Motion configured them for the launcher. */
export const webspringIconSprings = Object.freeze({
  boot: spring(145, 18, 0.9),
  hold: spring(185, 16, 0.8),
  reorder: spring(340, 20, 0.8),
});

const ICON_REVEAL_DELAY = 0.1;
const ICON_REVEAL_STAGGER = 0.075;
const ICON_REVEAL_MAX_DELAY = 0.2;
const LAUNCH_EXIT_STAGGER = 0.045;
const reducedFade = NSEAnimationDefaults.durationSeconds.reducedFade;

interface IconPose {
  readonly opacity: number;
  readonly transform: NSETransformComponents;
}
const waitingPose: IconPose = Object.freeze({ opacity: 0, transform: Object.freeze({ y: 28, scale: 1.72 }) });
const holdingPose: IconPose = Object.freeze({ opacity: 1, transform: Object.freeze({ y: 14, scale: 1.3 }) });
const readyPose: IconPose = Object.freeze({ opacity: 1, transform: Object.freeze({}) });

export interface WebspringIconPresentationOptions {
  readonly reducedMotion: boolean;
  readonly state: WebspringIconState;
  readonly index: number;
  readonly total: number;
  /** Where the icon flies on launch; icons without one never leave. */
  readonly radialExit?: WebspringRadialExit;
  /** Seconds the launch exit takes. Defaults to 0.85. */
  readonly exitDuration?: number;
  /** Seconds between successive icons leaving, the last icon first. Defaults to 0.045. */
  readonly exitStagger?: number;
}

export interface WebspringIconPresentation {
  readonly state: WebspringIconState;
  /** The icon's model pose for `state`. */
  readonly style: CSSProperties;
  readonly enter: NSEPresentationEnter;
}

/**
 * A launcher icon's pose in each choreography state and how it moves between
 * them: it waits large and low, is held part-way while the login gate is up,
 * springs home on reveal, flies out along its spoke as an application
 * launches (the last icon leaving first), and springs back on return.
 * Reduced motion keeps only the fades.
 */
export function resolveWebspringIconPresentation({
  reducedMotion, state, index, total, radialExit, exitDuration = 0.85, exitStagger = LAUNCH_EXIT_STAGGER,
}: WebspringIconPresentationOptions): WebspringIconPresentation {
  const exitPose: IconPose = radialExit
    ? { opacity: radialExit.opacity, transform: { x: radialExit.x, y: radialExit.y, scale: radialExit.scale, rotate: radialExit.rotate } }
    : readyPose;
  const poseOf = (of: WebspringIconState): IconPose => of === "waiting" ? waitingPose
    : of === "holding" ? holdingPose
      : of === "launching" || of === "covered" ? exitPose : readyPose;
  const revealDelay = Math.min(ICON_REVEAL_DELAY + index * ICON_REVEAL_STAGGER, ICON_REVEAL_MAX_DELAY);
  const launchDelay = Math.max(total - index - 1, 0) * exitStagger;
  const move = (from: IconPose, to: IconPose, duration: number, timing: AFXAnimationTiming, delay: number): NSEPresentationSpec => Object.freeze({
    duration, timing, ...(delay > 0 ? { delay } : {}),
    tracks: reducedMotion
      ? [{ keyPath: "opacity" as const, values: [from.opacity, to.opacity] }]
      : [
          { keyPath: "opacity" as const, values: [from.opacity, to.opacity] },
          { keyPath: "transform" as const, values: [from.transform, to.transform] },
        ],
  });
  const target = poseOf(state);
  const enter = (previous: WebspringIconState | null): NSEPresentationSpec | null => {
    // A newly shown icon starts from its waiting pose, unless it is shown
    // held or waiting, where it simply appears in that pose.
    if (previous === null && (state === "waiting" || state === "holding" || state === "covered")) return null;
    const from = poseOf(previous ?? "waiting");
    switch (state) {
      case "waiting":
        return move(from, target, 0, "linear", 0);
      case "holding":
        return reducedMotion
          ? move(from, target, reducedFade, framerTween, revealDelay)
          : move(from, target, webspringIconSprings.hold.duration, webspringIconSprings.hold.timing, revealDelay);
      case "ready":
        // Returning already brought the icon home.
        if (previous === "returning") return null;
        return reducedMotion
          ? move(from, target, 0.08, framerTween, revealDelay)
          : move(from, target, webspringIconSprings.boot.duration, webspringIconSprings.boot.timing, revealDelay);
      case "returning":
        return reducedMotion
          ? move(from, target, 0.08, framerTween, revealDelay)
          : move(from, target, webspringIconSprings.boot.duration, webspringIconSprings.boot.timing, revealDelay);
      case "launching":
        return reducedMotion
          ? move(from, target, reducedFade, framerTween, launchDelay)
          : move(from, target, exitDuration, NSEAnimationDefaults.easing.decelerate, launchDelay);
      case "covered":
        // The launch exit carries on to the same pose; from anywhere else the
        // icon is already covered, so it goes at once.
        return previous === "launching" ? null : move(from, target, 0, "linear", 0);
    }
  };
  return {
    state,
    style: reducedMotion
      ? { opacity: target.opacity }
      : { opacity: target.opacity, transform: nseTransformStyle(target.transform) },
    enter: enter as NSEPresentationEnter,
  };
}
