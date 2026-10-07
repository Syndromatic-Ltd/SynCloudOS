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

import type { AFXAnimationScalar } from "./animationTypes";
import { GFXColour } from "../GraphicsFX/GFXColour";
import { GFXGradient } from "../GraphicsFX/GFXGradient";
import { GFXPath } from "../GraphicsFX/GFXPath";
import type { GFXPathCommand } from "../GraphicsFX/graphicsTypes";

const mix = (from: number, to: number, progress: number) => from + (to - from) * progress;
const point = (from: Readonly<{ x: number; y: number }>, to: Readonly<{ x: number; y: number }>, progress: number) =>
  Object.freeze({ x: mix(from.x, to.x, progress), y: mix(from.y, to.y, progress) });

function interpolatePath(from: GFXPath, to: GFXPath, progress: number): GFXPath {
  if (from.commands.length !== to.commands.length)
    throw new TypeError("Shape path topology requires matching command counts.");
  const commands = from.commands.map((left, index): GFXPathCommand => {
    const right = to.commands[index]!;
    if (left.kind !== right.kind)
      throw new TypeError("Shape path topology requires matching command kinds.");
    switch (left.kind) {
      case "move":
      case "line":
        return Object.freeze({ kind: left.kind, point: point(left.point, (right as typeof left).point, progress) });
      case "quad":
        return Object.freeze({ kind: "quad", control: point(left.control, (right as typeof left).control, progress), point: point(left.point, (right as typeof left).point, progress) });
      case "curve":
        return Object.freeze({ kind: "curve", control1: point(left.control1, (right as typeof left).control1, progress), control2: point(left.control2, (right as typeof left).control2, progress), point: point(left.point, (right as typeof left).point, progress) });
      case "close":
        return Object.freeze({ kind: "close" });
    }
  });
  if (progress <= 0) return from;
  if (progress >= 1) return to;
  return new GFXPath(commands);
}

function interpolateColour(from: GFXColour, to: GFXColour, progress: number): GFXColour {
  const left = from.converting("srgb").components;
  const right = to.converting("srgb").components;
  const alpha = mix(left.a, right.a, progress);
  const channel = (key: "r" | "g" | "b") => alpha === 0
    ? 0
    : mix(left[key] * left.a, right[key] * right.a, progress) / alpha;
  return GFXColour.rgba(channel("r"), channel("g"), channel("b"), alpha);
}

function interpolateGradient(from: GFXGradient, to: GFXGradient, progress: number): GFXGradient {
  if (from.stops.length !== to.stops.length)
    throw new TypeError("Gradient interpolation requires matching stop counts.");
  if (from.units !== to.units)
    throw new TypeError("Gradient interpolation requires matching coordinate units.");
  if (from.geometry.kind !== to.geometry.kind)
    throw new TypeError("Gradient interpolation requires matching geometry kinds.");
  const stops = from.stops.map((left, index) => {
    const right = to.stops[index]!;
    return Object.freeze({
      offset: mix(left.offset, right.offset, progress),
      colour: interpolateColour(left.colour, right.colour, progress),
    });
  });
  if (stops.some((stop, index) => index > 0 && stop.offset < stops[index - 1]!.offset))
    throw new TypeError("Interpolated gradient stop offsets must remain monotonic.");
  if (progress <= 0) return from;
  if (progress >= 1) return to;
  const leftGeometry = from.geometry;
  const rightGeometry = to.geometry;
  const geometry = leftGeometry.kind === "linear" && rightGeometry.kind === "linear"
    ? Object.freeze({ kind: "linear" as const, start: point(leftGeometry.start, rightGeometry.start, progress), end: point(leftGeometry.end, rightGeometry.end, progress) })
    : leftGeometry.kind === "radial" && rightGeometry.kind === "radial"
      ? Object.freeze({ kind: "radial" as const, centre: point(leftGeometry.centre, rightGeometry.centre, progress), radius: mix(leftGeometry.radius, rightGeometry.radius, progress) })
      : (() => { throw new TypeError("Gradient interpolation requires matching geometry kinds."); })();
  const transform = Object.freeze({
    a: mix(from.transform.a, to.transform.a, progress),
    b: mix(from.transform.b, to.transform.b, progress),
    c: mix(from.transform.c, to.transform.c, progress),
    d: mix(from.transform.d, to.transform.d, progress),
    tx: mix(from.transform.tx, to.transform.tx, progress),
    ty: mix(from.transform.ty, to.transform.ty, progress),
  });
  return new GFXGradient(stops, geometry, { units: from.units, transform });
}
const cssNumber = /-?(?:\d*\.)?\d+(?:e[+-]?\d+)?/gi;

/** Whether two CSS value strings share a numeric template, so they interpolate
 * component-wise rather than switching discretely. */
export function afxStringsInterpolate(from: string, to: string): boolean {
  const a = from.match(cssNumber), b = to.match(cssNumber);
  return Boolean(a && b && a.length === b.length && from.replace(cssNumber, "#") === to.replace(cssNumber, "#"));
}

/** Numeric/geometry interpolation; matching CSS numeric templates interpolate component-wise. */
export function interpolateAFXValue(
  from: AFXAnimationScalar,
  to: AFXAnimationScalar,
  progress: number,
): AFXAnimationScalar {
  if (from instanceof GFXPath || to instanceof GFXPath) {
    if (!(from instanceof GFXPath) || !(to instanceof GFXPath))
      throw new TypeError("Animation values have incompatible types.");
    return interpolatePath(from, to, progress);
  }
  if (from instanceof GFXGradient || to instanceof GFXGradient) {
    if (!(from instanceof GFXGradient) || !(to instanceof GFXGradient))
      throw new TypeError("Animation values have incompatible types.");
    return interpolateGradient(from, to, progress);
  }
  if (typeof from === "number" && typeof to === "number")
    return from + (to - from) * progress;
  if (typeof from === "string" && typeof to === "string") {
    const token = /-?(?:\d*\.)?\d+(?:e[+-]?\d+)?/gi;
    const a = from.match(token)?.map(Number),
      b = to.match(token)?.map(Number);
    if (
      a &&
      b &&
      a.length === b.length &&
      from.replace(token, "#") === to.replace(token, "#")
    ) {
      let index = 0;
      return to.replace(token, () =>
        String(a[index] + (b[index] - a[index++]) * progress),
      );
    }
    return progress < 1 ? from : to;
  }
  if (typeof from === "object" && typeof to === "object") {
    const keys = Object.keys(from);
    if (keys.slice().sort().join() !== Object.keys(to).sort().join())
      throw new TypeError("Animation values have incompatible fields.");
    const result: Record<string, number | string> = {};
    for (const key of keys) {
      const a = (from as Record<string, number | string>)[key],
        b = (to as Record<string, number | string>)[key];
      result[key] =
        typeof a === "number" && typeof b === "number"
          ? a + (b - a) * progress
          : progress < 1
            ? a
            : b;
    }
    return Object.freeze(result);
  }
  throw new TypeError("Animation values have incompatible types.");
}
