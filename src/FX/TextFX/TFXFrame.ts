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

import type { GFXPoint, GFXRect } from "../GraphicsFX/GFXGeometry";
import { GFXPath } from "../GraphicsFX/GFXPath";
import type { GFXFillRule } from "../GraphicsFX/graphicsTypes";
import type { TFXLine } from "./TFXLine";

export interface TFXFrameLine { readonly origin: GFXPoint; readonly line: TFXLine }
export type TFXFrameProgression = "topToBottom" | "rightToLeft" | "leftToRight";
export class TFXFrame {
  readonly bounds: GFXRect;
  readonly path: GFXPath;
  readonly pathFillRule: GFXFillRule;
  readonly lines: readonly TFXFrameLine[];
  readonly visibleRange: Readonly<{ start: number; end: number }>;
  readonly progression: TFXFrameProgression;
  constructor(bounds: GFXRect, lines: readonly TFXFrameLine[], start: number, end: number, path: GFXPath = GFXPath.rect(bounds), pathFillRule: GFXFillRule = "nonzero", progression: TFXFrameProgression = "topToBottom") {
    this.bounds = Object.freeze({ ...bounds });
    this.path = path;
    this.pathFillRule = pathFillRule;
    this.progression = progression;
    this.lines = Object.freeze(lines.map(item => Object.freeze({ origin: Object.freeze({ ...item.origin }), line: item.line })));
    this.visibleRange = Object.freeze({ start, end });
    Object.freeze(this);
  }
  stringIndexForPosition(point: GFXPoint): number {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new RangeError("Text hit-test coordinates must be finite.");
    let closest: TFXFrameLine | undefined;
    let distance = Infinity;
    for (const item of this.lines) {
      const vertical = item.line.orientation === "vertical";
      const dx = vertical
        ? Math.max(item.origin.x - item.line.ascent - point.x, 0, point.x - item.origin.x - item.line.descent)
        : Math.max(item.origin.x - point.x, 0, point.x - item.origin.x - item.line.width);
      const dy = vertical
        ? Math.max(item.origin.y - point.y, 0, point.y - item.origin.y - item.line.width)
        : Math.max(item.origin.y - item.line.ascent - point.y, 0, point.y - item.origin.y - item.line.descent);
      const delta = dx * dx + dy * dy;
      if (delta < distance) { closest = item; distance = delta; }
    }
    return closest ? closest.line.stringIndexForPosition(closest.line.orientation === "vertical" ? point.y - closest.origin.y : point.x - closest.origin.x) : this.visibleRange.start;
  }
}
