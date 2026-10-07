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

import type {
  NSESmoothSurfaceFocus,
  NSESmoothSurfaceOverflow,
  NSESmoothSurfacePerformance,
  NSESmoothSurfacePhysicalityConfig,
  NSESmoothSurfaceRadius,
  NSESmoothSurfaceScroll,
  NSESmoothSurfaceShadow,
  NSESmoothSurfaceStyle
} from "./smoothSurfaceTypes";

export const nseSmoothSurfaceRadiusTokens = {
  none: "0px",
  xs: "4px",
  sm: "6px",
  md: "8px",
  lg: "12px",
  xl: "18px",
  xxl: "24px",
  app: "38px",
  pill: "999px"
} as const satisfies Record<Exclude<NSESmoothSurfaceRadius, number>, string>;

export const nseSmoothSurfaceFocusTokens = {
  none: {},
  ring: {
    "--nse-smooth-surface-focus-ring": "0 0 0 2px rgba(142, 212, 255, 0.76)",
    "--nse-smooth-surface-focus-offset": "2px"
  },
  within: {
    "--nse-smooth-surface-focus-ring": "inset 0 0 0 1px rgba(142, 212, 255, 0.58)",
    "--nse-smooth-surface-focus-offset": "0px"
  },
  inset: {
    "--nse-smooth-surface-focus-ring": "inset 0 0 0 2px rgba(255, 255, 255, 0.72)",
    "--nse-smooth-surface-focus-offset": "0px"
  }
} as const satisfies Record<NSESmoothSurfaceFocus, NSESmoothSurfaceStyle>;

export const nseSmoothSurfaceOverflowTokens = {
  visible: { overflow: "visible" },
  hidden: { overflow: "hidden" },
  clip: { overflow: "clip" },
  auto: { overflow: "auto" },
  scroll: { overflow: "scroll" }
} as const satisfies Record<NSESmoothSurfaceOverflow, NSESmoothSurfaceStyle>;

export const nseSmoothSurfaceScrollTokens = {
  none: {},
  contained: {
    overscrollBehavior: "contain"
  },
  momentum: {
    overflow: "auto",
    overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch"
  },
  panel: {
    overflow: "auto",
    overscrollBehavior: "contain",
    scrollbarGutter: "stable"
  }
} as const satisfies Record<NSESmoothSurfaceScroll, NSESmoothSurfaceStyle>;

export const nseSmoothSurfaceShadowTokens = {
  none: "none",
  hairline: "0 0 0 1px rgba(255, 255, 255, 0.18)",
  soft: "0 10px 28px rgba(6, 10, 18, 0.24)",
  raised: "0 14px 34px rgba(6, 10, 18, 0.32), 0 1px 0 rgba(255, 255, 255, 0.2) inset",
  floating: "0 22px 52px rgba(6, 10, 18, 0.42), 0 1px 0 rgba(255, 255, 255, 0.24) inset",
  inset: "inset 0 1px 5px rgba(6, 10, 18, 0.42)",
  physical: "inset 0 2px 0 rgba(255,255,255,0.65), inset 0 -2px 0 rgba(0,0,0,0.45)"
} as const satisfies Record<NSESmoothSurfaceShadow, string>;

export const nseSmoothSurfaceDefaultPhysicality = {
  top: { offsetX: 0, offsetY: 2, blur: 0, spread: 0, color: "#ffffff", opacity: 0.65 },
  bottom: { offsetX: 0, offsetY: -2, blur: 0, spread: 0, color: "#000000", opacity: 0.45 }
} as const satisfies NSESmoothSurfacePhysicalityConfig;

export const nseSmoothSurfacePerformanceTokens = {
  auto: {},
  static: {
    contain: "layout paint"
  },
  transform: {
    backfaceVisibility: "hidden",
    transform: "translateZ(0)",
    willChange: "transform"
  },
  paint: {
    contain: "paint"
  },
  strict: {
    contain: "layout paint style",
    contentVisibility: "auto"
  }
} as const satisfies Record<NSESmoothSurfacePerformance, NSESmoothSurfaceStyle>;

export const nseSmoothSurfaceTokens = {
  radius: nseSmoothSurfaceRadiusTokens,
  focus: nseSmoothSurfaceFocusTokens,
  overflow: nseSmoothSurfaceOverflowTokens,
  scroll: nseSmoothSurfaceScrollTokens,
  shadow: nseSmoothSurfaceShadowTokens,
  physicality: nseSmoothSurfaceDefaultPhysicality,
  performance: nseSmoothSurfacePerformanceTokens
} as const;
