/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
/** The motion roles a theme times. Theme transitions use their published duration and easing properties. */
export const nseThemeMotionRoles = Object.freeze([
  "standard",
  "control",
  "selection",
  "presentation",
  "dismissal",
  "scrollBoundary",
] as const);

export type NSEThemeMotionRole = (typeof nseThemeMotionRoles)[number];

/** A spring in Core Animation's perceptual terms, or a duration with `CAMediaTimingFunction` control points. */
export type NSEThemeMotion =
  | Readonly<{ duration: number; bounce: number }>
  | Readonly<{ duration: number; timingFunction: readonly [number, number, number, number] }>;

const kebab = (role: string) => role.replace(/[A-Z]/gu, letter => "-" + letter.toLowerCase());

/** Custom property names, such as `--nse-motion-scroll-boundary-duration`. */
export const nseThemeMotionProperties = Object.freeze(Object.fromEntries(nseThemeMotionRoles.map(role => [role, Object.freeze({
  duration: `--nse-motion-${kebab(role)}-duration`,
  easing: `--nse-motion-${kebab(role)}-easing`,
})])) as Readonly<Record<NSEThemeMotionRole, Readonly<{ duration: string; easing: string }>>>);
