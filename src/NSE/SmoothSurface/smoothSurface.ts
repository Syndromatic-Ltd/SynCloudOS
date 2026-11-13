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

import {
  nseSmoothSurfaceDefaultPhysicality,
  nseSmoothSurfaceFocusTokens,
  nseSmoothSurfaceOverflowTokens,
  nseSmoothSurfacePerformanceTokens,
  nseSmoothSurfaceRadiusTokens,
  nseSmoothSurfaceScrollTokens,
  nseSmoothSurfaceShadowTokens,
  nseSmoothSurfaceTokens
} from "./smoothSurfaceTokens";
import {
  getSmoothSurfaceRadiusNumber,
  resolveSmoothSurfaceCorners
} from "./smoothSurfacePath";
import type {
  SmoothSurfaceOptions,
  SmoothSurfacePhysicality,
  SmoothSurfacePhysicalityConfig,
  SmoothSurfacePhysicalityStop,
  SmoothSurfaceProps,
  SmoothSurfaceRadius,
  SmoothSurfaceRequest,
  SmoothSurfaceResolution,
  SmoothSurfaceResolvedOptions,
  SmoothSurfaceShadow,
  SmoothSurfaceShadowConfig,
  SmoothSurfaceStyle,
  NSEOptionalSmoothSurfaceProps
} from "./smoothSurfaceTypes";

export const nseSmoothSurfaceClassNames = {
  root: "nse-smooth-surface",
  radius: "nse-smooth-surface-radius",
  focus: "nse-smooth-surface-focus",
  overflow: "nse-smooth-surface-overflow",
  scroll: "nse-smooth-surface-scroll",
  shadow: "nse-smooth-surface-shadow",
  physicality: "nse-smooth-surface-physicality",
  performance: "nse-smooth-surface-performance"
} as const;

export const nseSmoothSurfaceDefaultOptions = {
  radius: "md",
  curve: "squircle",
  smoothing: 0.6,
  exponent: 4,
  preserveSmoothing: true,
  focus: "ring",
  overflow: "hidden",
  scroll: "none",
  shadow: "soft",
  physicality: "off",
  performance: "auto",
  autoEffects: true
} as const satisfies Omit<SmoothSurfaceResolvedOptions, "corners">;

export const nseAppSmoothSurfaceDefaultOptions = {
  radius: 31,
  curve: "squircle",
  smoothing: 0.6,
  exponent: 4,
  preserveSmoothing: true,
  focus: "none",
  overflow: "hidden",
  scroll: "none",
  shadow: "none",
  physicality: nseSmoothSurfaceDefaultPhysicality,
  performance: "paint",
  autoEffects: false
} as const satisfies Omit<SmoothSurfaceResolvedOptions, "corners">;

export const nseSmoothSurfaceMobileQuery = "(max-width: 760px)";
const nseSmoothSurfaceMobileRadiusCap = 28;

function toClassSegment(value: string | number | boolean | object) {
  if (typeof value === "number") return "custom";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "object") return "custom";
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function compactClassName(parts: Array<string | false | null | undefined>) {
  return parts.filter((part): part is string => typeof part === "string" && part.trim().length > 0).join(" ");
}

function capRadiusForMobile(radius: SmoothSurfaceRadius): SmoothSurfaceRadius {
  if (radius === "pill" || radius === "none") return radius;
  return Math.min(getSmoothSurfaceRadiusNumber(radius), nseSmoothSurfaceMobileRadiusCap);
}

export function getMobileSmoothSurfaceOptions<T extends SmoothSurfaceResolvedOptions | SmoothSurfaceOptions>(options: T): T {
  return {
    ...options,
    radius: capRadiusForMobile(options.radius ?? nseSmoothSurfaceDefaultOptions.radius)
  };
}

export function getMobileSmoothSurfaceRadiusValue(radius: SmoothSurfaceRadius): string {
  return getSmoothSurfaceRadiusValue(capRadiusForMobile(radius));
}

function normalizeRequest(options: SmoothSurfaceRequest): SmoothSurfaceOptions | false {
  if (options === false || options === null || options === undefined || options === "off") return false;
  if (typeof options === "number" || typeof options === "string") return { radius: options };
  return options;
}

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value));
}

function normalisePhysicality(physicality: SmoothSurfacePhysicality | undefined): SmoothSurfacePhysicality {
  if (physicality === undefined) return nseSmoothSurfaceDefaultOptions.physicality;
  if (physicality === false || physicality === "off") return "off";
  return {
    top: physicality.top ?? nseSmoothSurfaceDefaultPhysicality.top,
    bottom: physicality.bottom ?? nseSmoothSurfaceDefaultPhysicality.bottom
  };
}

export function normaliseSmoothSurfaceOptions(
  options: SmoothSurfaceOptions = {}
): SmoothSurfaceResolvedOptions {
  const radius = options.radius ?? nseSmoothSurfaceDefaultOptions.radius;
  const curve = options.curve ?? nseSmoothSurfaceDefaultOptions.curve;
  const smoothing = clampUnit(options.smoothing ?? nseSmoothSurfaceDefaultOptions.smoothing);
  const exponent = Math.max(0.1, options.exponent ?? nseSmoothSurfaceDefaultOptions.exponent);
  const preserveSmoothing = options.preserveSmoothing ?? nseSmoothSurfaceDefaultOptions.preserveSmoothing;
  const shadow = options.shadow ?? nseSmoothSurfaceDefaultOptions.shadow;

  return {
    radius,
    curve,
    smoothing,
    exponent,
    preserveSmoothing,
    focus: options.focus ?? nseSmoothSurfaceDefaultOptions.focus,
    overflow: options.overflow ?? nseSmoothSurfaceDefaultOptions.overflow,
    scroll: options.scroll ?? nseSmoothSurfaceDefaultOptions.scroll,
    shadow,
    physicality: normalisePhysicality(options.physicality),
    performance: options.performance ?? nseSmoothSurfaceDefaultOptions.performance,
    autoEffects: options.autoEffects ?? nseSmoothSurfaceDefaultOptions.autoEffects,
    corners: resolveSmoothSurfaceCorners({
      ...options,
      radius,
      curve,
      smoothing,
      exponent,
      preserveSmoothing
    }),
    innerBorder: options.innerBorder,
    outerBorder: options.outerBorder,
    middleBorder: options.middleBorder,
    innerShadow: options.innerShadow,
    dropShadow: typeof shadow === "string" ? undefined : shadow
  };
}

export function normaliseSmoothSurfaceRequest(options: SmoothSurfaceRequest): SmoothSurfaceResolvedOptions | false {
  const normalized = normalizeRequest(options);
  return normalized === false ? false : normaliseSmoothSurfaceOptions(normalized);
}

export function getSmoothSurfaceRadiusValue(radius: SmoothSurfaceRadius): string {
  return typeof radius === "number" ? `${Math.max(0, radius)}px` : nseSmoothSurfaceRadiusTokens[radius];
}

function physicalityStopToShadow(stop: SmoothSurfacePhysicalityStop) {
  const offsetX = stop.offsetX ?? 0;
  const blur = stop.blur ?? 0;
  const spread = stop.spread ?? 0;
  return `inset ${offsetX}px ${stop.offsetY}px ${blur}px ${spread}px ${hexOrRgbToRgba(stop.color, stop.opacity)}`;
}

function hexOrRgbToRgba(color: string, opacity: number) {
  if (!color.startsWith("#")) return color;
  const h = color.replace("#", "");
  const expanded = h.length === 3 ? h.split("").map((part) => part + part).join("") : h;
  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

function shadowConfigToCss(shadow: SmoothSurfaceShadowConfig) {
  return `${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${shadow.spread}px ${hexOrRgbToRgba(shadow.color, shadow.opacity)}`;
}

function insetShadowConfigToCss(shadow: SmoothSurfaceShadowConfig) {
  return `inset ${shadowConfigToCss(shadow)}`;
}

function listShadowConfigToCss(
  shadow: SmoothSurfaceShadowConfig | SmoothSurfaceShadowConfig[] | undefined,
  inset = false
) {
  if (!shadow) return "";
  const shadows = Array.isArray(shadow) ? shadow : [shadow];
  return shadows.map((item) => inset ? insetShadowConfigToCss(item) : shadowConfigToCss(item)).join(", ");
}

export function getSmoothSurfacePhysicalityShadow(physicality: SmoothSurfacePhysicality) {
  if (!physicality || physicality === "off") return "";
  const config = physicality as SmoothSurfacePhysicalityConfig;
  return [config.top, config.bottom].filter(Boolean).map((stop) => physicalityStopToShadow(stop as SmoothSurfacePhysicalityStop)).join(", ");
}

export function getSmoothSurfaceClassName(
  options: SmoothSurfaceOptions = {},
  className?: string
) {
  const resolved = normaliseSmoothSurfaceOptions(options);

  return compactClassName([
    nseSmoothSurfaceClassNames.root,
    `${nseSmoothSurfaceClassNames.radius}-${toClassSegment(resolved.radius)}`,
    `${nseSmoothSurfaceClassNames.focus}-${toClassSegment(resolved.focus)}`,
    `${nseSmoothSurfaceClassNames.overflow}-${toClassSegment(resolved.overflow)}`,
    `${nseSmoothSurfaceClassNames.scroll}-${toClassSegment(resolved.scroll)}`,
    `${nseSmoothSurfaceClassNames.shadow}-${typeof resolved.shadow === "string" ? toClassSegment(resolved.shadow as SmoothSurfaceShadow) : "custom"}`,
    `${nseSmoothSurfaceClassNames.physicality}-${resolved.physicality === "off" ? "off" : "custom"}`,
    `${nseSmoothSurfaceClassNames.performance}-${toClassSegment(resolved.performance)}`,
    options.className,
    className
  ]);
}

export function getSmoothSurfaceStyle(
  options: SmoothSurfaceOptions = {},
  style?: SmoothSurfaceStyle
): SmoothSurfaceStyle {
  const resolved = normaliseSmoothSurfaceOptions(options);
  const radius = getSmoothSurfaceRadiusValue(resolved.radius);
  const mobileRadius = getMobileSmoothSurfaceRadiusValue(resolved.radius);
  const tokenShadow = typeof resolved.shadow === "string" ? nseSmoothSurfaceShadowTokens[resolved.shadow] : "";
  const configuredInnerShadow = listShadowConfigToCss(resolved.innerShadow, true);
  const physicalityShadow = getSmoothSurfacePhysicalityShadow(resolved.physicality);
  const boxShadow = [tokenShadow, configuredInnerShadow, physicalityShadow].filter(Boolean).join(", ") || "none";

  return {
    "--nse-smooth-surface-radius": radius,
    "--nse-smooth-surface-mobile-radius": mobileRadius,
    "--nse-smooth-surface-radius-number": getSmoothSurfaceRadiusNumber(resolved.radius),
    "--nse-smooth-surface-shadow": boxShadow,
    "--nse-smooth-surface-curve": resolved.curve,
    "--nse-smooth-surface-smoothing": resolved.smoothing,
    borderRadius: "var(--nse-smooth-surface-active-radius, var(--nse-smooth-surface-radius))",
    boxShadow: "var(--nse-smooth-surface-shadow)",
    ...nseSmoothSurfaceFocusTokens[resolved.focus],
    ...nseSmoothSurfaceOverflowTokens[resolved.overflow],
    ...nseSmoothSurfaceScrollTokens[resolved.scroll],
    ...nseSmoothSurfacePerformanceTokens[resolved.performance],
    ...options.style,
    ...style
  };
}

export function resolveSmoothSurface(
  options: SmoothSurfaceOptions = {}
): SmoothSurfaceResolution {
  return {
    className: getSmoothSurfaceClassName(options),
    style: getSmoothSurfaceStyle(options),
    options: normaliseSmoothSurfaceOptions(options)
  };
}

export function getSmoothSurfaceProps(options: SmoothSurfaceOptions = {}): SmoothSurfaceProps {
  const resolved = resolveSmoothSurface(options);

  return {
    className: resolved.className,
    style: resolved.style
  };
}

export function getOptionalSmoothSurfaceProps(
  options: SmoothSurfaceRequest,
  className?: string,
  style?: SmoothSurfaceStyle
): NSEOptionalSmoothSurfaceProps {
  const normalized = normalizeRequest(options);
  if (!normalized) {
    return {
      className,
      style
    };
  }

  return {
    className: getSmoothSurfaceClassName(normalized, className),
    style: getSmoothSurfaceStyle(normalized, style)
  };
}

export const SmoothSurfaceAPI = {
  tokens: nseSmoothSurfaceTokens,
  classNames: nseSmoothSurfaceClassNames,
  defaults: nseSmoothSurfaceDefaultOptions,
  appDefaults: nseAppSmoothSurfaceDefaultOptions,
  normalise: normaliseSmoothSurfaceOptions,
  normaliseRequest: normaliseSmoothSurfaceRequest,
  radiusValue: getSmoothSurfaceRadiusValue,
  className: getSmoothSurfaceClassName,
  style: getSmoothSurfaceStyle,
  props: getSmoothSurfaceProps,
  optionalProps: getOptionalSmoothSurfaceProps,
  physicalityShadow: getSmoothSurfacePhysicalityShadow,
  resolve: resolveSmoothSurface
} as const;
