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

import type { GFXFillRule } from "../GraphicsFX/graphicsTypes";
import type { GFXPath } from "../GraphicsFX/GFXPath";
import { flattenGFXPathCommands, GFX_PATH_FLATTEN_TOLERANCE, type GFXFlattenedContour } from "../GraphicsFX/GFXPathFlattening";

export interface TFXFrameInterval { readonly start: number; readonly end: number }
const MAX_PATH_FRAME_EDGE_WORK = 1_000_000;
const EDGE_EPSILON = 1e-9;

const intersectIntervals = (left: readonly TFXFrameInterval[], right: readonly TFXFrameInterval[]): TFXFrameInterval[] => {
  const result: TFXFrameInterval[] = [];
  let a = 0, b = 0;
  while (a < left.length && b < right.length) {
    const start = Math.max(left[a]!.start, right[b]!.start);
    const end = Math.min(left[a]!.end, right[b]!.end);
    if (end - start > EDGE_EPSILON) result.push({ start, end });
    if (left[a]!.end < right[b]!.end) a++; else b++;
  }
  return result;
};

export class TFXPathFrameGeometry {
  readonly #contours: readonly GFXFlattenedContour[];
  readonly #fillRule: GFXFillRule;
  readonly #criticalYs: readonly number[];
  readonly #criticalXs: readonly number[];
  #work = 0;

  constructor(path: GFXPath, fillRule: GFXFillRule, signal?: AbortSignal) {
    this.#contours = flattenGFXPathCommands(path.commands, signal).filter(contour => contour.points.length >= 3);
    const edges: Array<readonly [GFXFlattenedContour["points"][number], GFXFlattenedContour["points"][number]]> = [];
    const criticalYs: number[] = [], criticalXs: number[] = [];
    let hasArea = false;
    for (const contour of this.#contours) {
      const points = contour.points;
      for (let index = 0; index < points.length; index++) {
        const a = points[index]!, b = points[(index + 1) % points.length]!, c = points[(index + 2) % points.length]!;
        if (a.x !== b.x || a.y !== b.y) edges.push([a, b]);
        criticalYs.push(a.y); criticalXs.push(a.x);
        if (Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) > EDGE_EPSILON) hasArea = true;
      }
    }
    if (!this.#contours.length || !hasArea) throw new RangeError("A text frame path must have non-empty area.");
    // Filled topology can also change where two non-adjacent flattened edges
    // cross, so those heights are band probes just like contour vertices.
    for (let left = 0; left < edges.length; left++) for (let right = left + 1; right < edges.length; right++) {
      if (++this.#work > MAX_PATH_FRAME_EDGE_WORK) throw new RangeError("Text frame path exceeds its edge work limit.");
      if ((this.#work & 255) === 0) signal?.throwIfAborted();
      const [a, b] = edges[left]!, [c, d] = edges[right]!;
      const denominator = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
      if (Math.abs(denominator) <= EDGE_EPSILON) continue;
      const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denominator;
      const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / denominator;
      if (t > EDGE_EPSILON && t < 1 - EDGE_EPSILON && u > EDGE_EPSILON && u < 1 - EDGE_EPSILON) {
        criticalYs.push(a.y + t * (b.y - a.y)); criticalXs.push(a.x + t * (b.x - a.x));
      }
    }
    this.#criticalYs = Object.freeze(criticalYs.sort((a, b) => a - b));
    this.#criticalXs = Object.freeze(criticalXs.sort((a, b) => a - b));
    this.#fillRule = fillRule;
  }

  intervalsForBand(top: number, bottom: number, signal?: AbortSignal): readonly TFXFrameInterval[] {
    return this.#intervalsForCrossBand(top, bottom, "horizontal", signal);
  }

  intervalsForColumnBand(left: number, right: number, signal?: AbortSignal): readonly TFXFrameInterval[] {
    return this.#intervalsForCrossBand(left, right, "vertical", signal);
  }

  #intervalsForCrossBand(start: number, end: number, orientation: "horizontal" | "vertical", signal?: AbortSignal): readonly TFXFrameInterval[] {
    if (!(end > start)) return [];
    const inset = Math.min(GFX_PATH_FLATTEN_TOLERANCE, (end - start) / 4);
    const probes = [start + inset, end - inset, (start + end) / 2];
    for (const critical of orientation === "horizontal" ? this.#criticalYs : this.#criticalXs) {
      if (++this.#work > MAX_PATH_FRAME_EDGE_WORK) throw new RangeError("Text frame path exceeds its edge work limit.");
      if ((this.#work & 255) === 0) signal?.throwIfAborted();
      if (critical > start + inset && critical < end - inset) {
        probes.push(Math.max(start + inset, critical - EDGE_EPSILON), Math.min(end - inset, critical + EDGE_EPSILON));
      }
    }
    probes.sort((a, b) => a - b);
    let result: readonly TFXFrameInterval[] | undefined;
    let previous = Number.NaN;
    for (const y of probes) {
      if (Math.abs(y - previous) <= EDGE_EPSILON) continue;
      previous = y;
      const atY = this.#intervalsAt(y, orientation, signal);
      result = result ? intersectIntervals(result, atY) : atY;
      if (!result.length) break;
    }
    return result ?? [];
  }

  #intervalsAt(cross: number, orientation: "horizontal" | "vertical", signal?: AbortSignal): TFXFrameInterval[] {
    const crossings: Array<{ x: number; delta: number }> = [];
    for (const contour of this.#contours) {
      const points = contour.points;
      for (let index = 0; index < points.length; index++) {
        if (++this.#work > MAX_PATH_FRAME_EDGE_WORK) throw new RangeError("Text frame path exceeds its edge work limit.");
        if ((this.#work & 255) === 0) signal?.throwIfAborted();
        const start = points[index]!, end = points[(index + 1) % points.length]!;
        const startCross = orientation === "horizontal" ? start.y : start.x;
        const endCross = orientation === "horizontal" ? end.y : end.x;
        const startInline = orientation === "horizontal" ? start.x : start.y;
        const endInline = orientation === "horizontal" ? end.x : end.y;
        if (startCross === endCross || !((startCross <= cross && endCross > cross) || (endCross <= cross && startCross > cross))) continue;
        const x = startInline + (cross - startCross) * (endInline - startInline) / (endCross - startCross);
        if (Number.isFinite(x)) crossings.push({ x, delta: endCross > startCross ? 1 : -1 });
      }
    }
    crossings.sort((a, b) => a.x - b.x);
    const result: TFXFrameInterval[] = [];
    let winding = 0, parity = 0, previousX: number | undefined;
    for (let index = 0; index < crossings.length;) {
      const x = crossings[index]!.x;
      const inside = this.#fillRule === "evenodd" ? parity === 1 : winding !== 0;
      if (inside && previousX !== undefined && x - previousX > EDGE_EPSILON) result.push({ start: previousX, end: x });
      let delta = 0, count = 0;
      do { delta += crossings[index]!.delta; count++; index++; }
      while (index < crossings.length && Math.abs(crossings[index]!.x - x) <= EDGE_EPSILON);
      winding += delta;
      parity = (parity + count) & 1;
      previousX = x;
    }
    return result;
  }
}
