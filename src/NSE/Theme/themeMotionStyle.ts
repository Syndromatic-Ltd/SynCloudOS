/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { sampleSpring, springParameters, springSettlingDuration } from "../../FX/AnimationFX/AFXTimingFunction";
import type { NSETheme } from "./NSETheme";
import { nseThemeMotionProperties, nseThemeMotionRoles, type NSEThemeMotion } from "./contract/motion";

const springSamples = 48;
const number = (value: number) => String(Number(value.toFixed(4)));
const cache = new WeakMap<NSETheme["motion"], Readonly<Record<string, string>>>();

/** CSS duration and easing for one role. A spring runs for its settling time along a sampled `linear()` curve. */
export function nseThemeMotionTiming(motion: NSEThemeMotion): Readonly<{ duration: string; easing: string }> {
  if ("timingFunction" in motion) {
    return Object.freeze({ duration: `${number(motion.duration * 1000)}ms`, easing: `cubic-bezier(${motion.timingFunction.map(number).join(", ")})` });
  }
  const { mass, stiffness, damping } = springParameters(motion.duration, motion.bounce);
  const settle = springSettlingDuration(mass, stiffness, damping);
  const points = Array.from({ length: springSamples + 1 }, (_, index) =>
    index === springSamples ? 1 : sampleSpring(settle * index / springSamples, mass, stiffness, damping));
  return Object.freeze({ duration: `${number(settle * 1000)}ms`, easing: `linear(${points.map(number).join(", ")})` });
}

/** Every role's custom properties for an appearance root. */
export function nseThemeMotionStyle(theme: NSETheme): Readonly<Record<string, string>> {
  const known = cache.get(theme.motion);
  if (known) return known;
  const style: Record<string, string> = {};
  for (const role of nseThemeMotionRoles) {
    const timing = nseThemeMotionTiming(theme.motion[role]);
    style[nseThemeMotionProperties[role].duration] = timing.duration;
    style[nseThemeMotionProperties[role].easing] = timing.easing;
  }
  const frozen = Object.freeze(style);
  cache.set(theme.motion, frozen);
  return frozen;
}
