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

import { nseSmoothSurfaceRadiusTokens } from "./smoothSurfaceTokens";
import type {
  NSESmoothSurfaceCorner,
  NSESmoothSurfaceCurve,
  NSESmoothSurfaceOptions,
  NSESmoothSurfaceRadius,
  NSESmoothSurfaceResolvedCorner,
  NSESmoothSurfaceResolvedCorners
} from "./smoothSurfaceTypes";

const DEFAULT_CURVE: NSESmoothSurfaceCurve = "squircle";
const DEFAULT_SMOOTHING = 0.6;
const DEFAULT_EXPONENT = 4;
const DEFAULT_PRESERVE_SMOOTHING = true;
const ARC_KAPPA = 0.5522847498;
const SAMPLE_COUNT = 10;

type CornerName = keyof NSESmoothSurfaceResolvedCorners;

interface NormalizedCorner {
  radius: number;
  budget: number;
}

interface NormalizedCorners {
  topLeft: NormalizedCorner;
  topRight: NormalizedCorner;
  bottomRight: NormalizedCorner;
  bottomLeft: NormalizedCorner;
}

function clamp(min: number, value: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/\.?0+$/, "");
}

function radiusToNumber(radius: NSESmoothSurfaceRadius): number {
  if (typeof radius === "number") return Math.max(0, radius);
  const token = nseSmoothSurfaceRadiusTokens[radius];
  return Number.parseFloat(token) || 0;
}

function cornerToConfig(
  corner: NSESmoothSurfaceCorner | undefined,
  fallback: NSESmoothSurfaceResolvedCorner
): NSESmoothSurfaceResolvedCorner {
  if (corner === undefined) return fallback;
  if (typeof corner === "number" || typeof corner === "string") {
    return { ...fallback, radius: radiusToNumber(corner) };
  }

  return {
    radius: radiusToNumber(corner.radius),
    curve: corner.curve ?? fallback.curve,
    smoothing: clamp(0, corner.smoothing ?? fallback.smoothing, 1),
    exponent: Math.max(0.1, corner.exponent ?? fallback.exponent),
    preserveSmoothing: corner.preserveSmoothing ?? fallback.preserveSmoothing
  };
}

export function resolveNSESmoothSurfaceCorners(options: NSESmoothSurfaceOptions = {}): NSESmoothSurfaceResolvedCorners {
  const base: NSESmoothSurfaceResolvedCorner = {
    radius: radiusToNumber(options.radius ?? "md"),
    curve: options.curve ?? DEFAULT_CURVE,
    smoothing: clamp(0, options.smoothing ?? DEFAULT_SMOOTHING, 1),
    exponent: Math.max(0.1, options.exponent ?? DEFAULT_EXPONENT),
    preserveSmoothing: options.preserveSmoothing ?? DEFAULT_PRESERVE_SMOOTHING
  };

  return {
    topLeft: cornerToConfig(options.topLeft, base),
    topRight: cornerToConfig(options.topRight, base),
    bottomRight: cornerToConfig(options.bottomRight, base),
    bottomLeft: cornerToConfig(options.bottomLeft, base)
  };
}

function distributeRadii(width: number, height: number, corners: NSESmoothSurfaceResolvedCorners): NormalizedCorners {
  const radii = {
    topLeft: Math.min(corners.topLeft.radius, width / 2, height / 2),
    topRight: Math.min(corners.topRight.radius, width / 2, height / 2),
    bottomRight: Math.min(corners.bottomRight.radius, width / 2, height / 2),
    bottomLeft: Math.min(corners.bottomLeft.radius, width / 2, height / 2)
  };

  const topScale = width / Math.max(width, radii.topLeft + radii.topRight);
  const rightScale = height / Math.max(height, radii.topRight + radii.bottomRight);
  const bottomScale = width / Math.max(width, radii.bottomLeft + radii.bottomRight);
  const leftScale = height / Math.max(height, radii.topLeft + radii.bottomLeft);
  const scale = Math.min(topScale, rightScale, bottomScale, leftScale, 1);

  return {
    topLeft: { radius: radii.topLeft * scale, budget: Math.min(width, height) / 2 },
    topRight: { radius: radii.topRight * scale, budget: Math.min(width, height) / 2 },
    bottomRight: { radius: radii.bottomRight * scale, budget: Math.min(width, height) / 2 },
    bottomLeft: { radius: radii.bottomLeft * scale, budget: Math.min(width, height) / 2 }
  };
}

function sampledCorner(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  exponent: number
) {
  const points: string[] = [];
  for (let index = 1; index <= SAMPLE_COUNT; index += 1) {
    const t = index / SAMPLE_COUNT;
    const angle = startAngle + (endAngle - startAngle) * t;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = cx + Math.sign(cos) * radius * Math.pow(Math.abs(cos), 2 / exponent);
    const y = cy + Math.sign(sin) * radius * Math.pow(Math.abs(sin), 2 / exponent);
    points.push(`L ${round(x)} ${round(y)}`);
  }
  return points.join(" ");
}

function arcCorner(
  fromX: number,
  fromY: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  toX: number,
  toY: number
) {
  if (fromX === toX && fromY === toY) return "";
  return `C ${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(toX)} ${round(toY)}`;
}

function cornerSegment(
  name: CornerName,
  width: number,
  height: number,
  corner: NSESmoothSurfaceResolvedCorner,
  normalized: NormalizedCorner
) {
  const radius = normalized.radius;
  if (radius <= 0) return "";

  if (corner.curve === "arc") {
    const k = radius * ARC_KAPPA;
    if (name === "topRight") return arcCorner(width - radius, 0, width - radius + k, 0, width, radius - k, width, radius);
    if (name === "bottomRight") return arcCorner(width, height - radius, width, height - radius + k, width - radius + k, height, width - radius, height);
    if (name === "bottomLeft") return arcCorner(radius, height, radius - k, height, 0, height - radius + k, 0, height - radius);
    return arcCorner(0, radius, 0, radius - k, radius - k, 0, radius, 0);
  }

  const smoothingBoost = corner.curve === "clothoid" ? 0.75 : corner.curve === "squircle" ? 1 : 0;
  const exponent = corner.curve === "superellipse"
    ? corner.exponent
    : corner.curve === "clothoid"
      ? 3.2 + smoothingBoost * corner.smoothing
      : 4 + 2 * corner.smoothing;

  if (name === "topRight") return sampledCorner(width - radius, radius, radius, -Math.PI / 2, 0, exponent);
  if (name === "bottomRight") return sampledCorner(width - radius, height - radius, radius, 0, Math.PI / 2, exponent);
  if (name === "bottomLeft") return sampledCorner(radius, height - radius, radius, Math.PI / 2, Math.PI, exponent);
  return sampledCorner(radius, radius, radius, Math.PI, Math.PI * 1.5, exponent);
}

export function generateNSESmoothSurfacePath(
  width: number,
  height: number,
  options: NSESmoothSurfaceOptions = {}
) {
  if (width <= 0 || height <= 0) return "M 0 0 H 0 V 0 H 0 Z";

  const corners = resolveNSESmoothSurfaceCorners(options);
  const normalized = distributeRadii(width, height, corners);
  const { topLeft, topRight, bottomRight, bottomLeft } = normalized;

  if (topLeft.radius <= 0 && topRight.radius <= 0 && bottomRight.radius <= 0 && bottomLeft.radius <= 0) {
    return `M 0 0 H ${round(width)} V ${round(height)} H 0 Z`;
  }

  return [
    `M ${round(topLeft.radius)} 0`,
    `L ${round(width - topRight.radius)} 0`,
    cornerSegment("topRight", width, height, corners.topRight, topRight),
    `L ${round(width)} ${round(height - bottomRight.radius)}`,
    cornerSegment("bottomRight", width, height, corners.bottomRight, bottomRight),
    `L ${round(bottomLeft.radius)} ${round(height)}`,
    cornerSegment("bottomLeft", width, height, corners.bottomLeft, bottomLeft),
    `L 0 ${round(topLeft.radius)}`,
    cornerSegment("topLeft", width, height, corners.topLeft, topLeft),
    "Z"
  ].filter(Boolean).join(" ");
}

export function generateNSESmoothSurfaceClipPath(
  width: number,
  height: number,
  options: NSESmoothSurfaceOptions = {}
) {
  return `path("${generateNSESmoothSurfacePath(width, height, options)}")`;
}

export function getNSESmoothSurfaceRadiusNumber(radius: NSESmoothSurfaceRadius) {
  return radiusToNumber(radius);
}
