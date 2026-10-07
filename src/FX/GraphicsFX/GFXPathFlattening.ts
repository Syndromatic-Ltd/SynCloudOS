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

import type { GFXPoint } from "./GFXGeometry";
import type { GFXPathCommand } from "./graphicsTypes";

export const GFX_PATH_FLATTEN_TOLERANCE = 0.0625;
const MAX_FLATTEN_DEPTH = 10;
const MAX_FLATTENED_POINTS = 65_536;

export interface GFXFlattenedContour {
  readonly points: readonly GFXPoint[];
  readonly closed: boolean;
}

interface FlatteningBudget { count: number; readonly signal?: AbortSignal }
const samePoint = (a: GFXPoint, b: GFXPoint) => a.x === b.x && a.y === b.y;
const midpoint = (a: GFXPoint, b: GFXPoint): GFXPoint => Object.freeze({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function squaredDistanceToLine(point: GFXPoint, start: GFXPoint, end: GFXPoint): number {
  const dx = end.x - start.x, dy = end.y - start.y;
  if (dx === 0 && dy === 0) return (point.x - start.x) ** 2 + (point.y - start.y) ** 2;
  const area = dx * (start.y - point.y) - (start.x - point.x) * dy;
  return area * area / (dx * dx + dy * dy);
}

function appendPoint(points: GFXPoint[], point: GFXPoint, budget: FlatteningBudget): void {
  if ((budget.count & 255) === 0) budget.signal?.throwIfAborted();
  if (budget.count >= MAX_FLATTENED_POINTS) throw new RangeError(`Path flattening exceeds the ${MAX_FLATTENED_POINTS} point work limit.`);
  budget.count++;
  points.push(Object.freeze({ x: point.x, y: point.y }));
}

function flattenQuadratic(start: GFXPoint, control: GFXPoint, end: GFXPoint, points: GFXPoint[], budget: FlatteningBudget, depth = 0): void {
  if (depth >= MAX_FLATTEN_DEPTH || squaredDistanceToLine(control, start, end) <= GFX_PATH_FLATTEN_TOLERANCE ** 2) {
    appendPoint(points, end, budget); return;
  }
  const a = midpoint(start, control), b = midpoint(control, end), centre = midpoint(a, b);
  flattenQuadratic(start, a, centre, points, budget, depth + 1);
  flattenQuadratic(centre, b, end, points, budget, depth + 1);
}

function flattenCubic(start: GFXPoint, control1: GFXPoint, control2: GFXPoint, end: GFXPoint, points: GFXPoint[], budget: FlatteningBudget, depth = 0): void {
  const tolerance = GFX_PATH_FLATTEN_TOLERANCE ** 2;
  if (depth >= MAX_FLATTEN_DEPTH || (squaredDistanceToLine(control1, start, end) <= tolerance && squaredDistanceToLine(control2, start, end) <= tolerance)) {
    appendPoint(points, end, budget); return;
  }
  const a = midpoint(start, control1), b = midpoint(control1, control2), c = midpoint(control2, end);
  const d = midpoint(a, b), e = midpoint(b, c), centre = midpoint(d, e);
  flattenCubic(start, a, d, centre, points, budget, depth + 1);
  flattenCubic(centre, e, c, end, points, budget, depth + 1);
}

/** Internal shared flattener. Kept out of the GraphicsFX public barrel. */
export function flattenGFXPathCommands(commands: readonly GFXPathCommand[], signal?: AbortSignal): readonly GFXFlattenedContour[] {
  const contours: GFXFlattenedContour[] = [], budget: FlatteningBudget = { count: 0, signal };
  let points: GFXPoint[] = [], drawable = false;
  const finish = (closed: boolean) => {
    if (points.length && drawable) contours.push(Object.freeze({ points: Object.freeze(points), closed }));
    points = []; drawable = false;
  };
  for (let index = 0; index < commands.length; index++) {
    if ((index & 255) === 0) signal?.throwIfAborted();
    const command = commands[index]!;
    if (command.kind === "move") { finish(false); appendPoint(points, command.point, budget); continue; }
    if (command.kind === "close") {
      if (points.length && !samePoint(points[0]!, points.at(-1)!)) appendPoint(points, points[0]!, budget);
      finish(true); continue;
    }
    const current = points.at(-1);
    if (!current) continue;
    drawable = true;
    if (command.kind === "line") appendPoint(points, command.point, budget);
    else if (command.kind === "quad") flattenQuadratic(current, command.control, command.point, points, budget);
    else flattenCubic(current, command.control1, command.control2, command.point, points, budget);
  }
  finish(false);
  return Object.freeze(contours);
}
