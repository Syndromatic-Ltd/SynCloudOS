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

import type { TFXGlyphInfo, TFXGlyphRun, TFXTextDirection } from "./TFXGlyphRun";

export type TFXLineOrientation = "horizontal" | "vertical";
export const isVerticalDirection = (direction: TFXTextDirection) => direction === "ttb" || direction === "btt";
export const inlineAdvance = (run: TFXGlyphRun) => isVerticalDirection(run.direction) ? run.advance.height : run.advance.width;
export const positionedInlineAdvance = (run: Readonly<{ shaped: TFXGlyphRun; inlineAdvanceOverride?: number }>) =>
  run.inlineAdvanceOverride ?? inlineAdvance(run.shaped);
export const glyphInlinePosition = (glyph: TFXGlyphInfo, direction: TFXTextDirection) =>
  isVerticalDirection(direction) ? -glyph.position.y : glyph.position.x;
export const glyphInlineAdvance = (glyph: TFXGlyphInfo, direction: TFXTextDirection) =>
  Math.abs(isVerticalDirection(direction) ? glyph.advance.y : glyph.advance.x);
export const glyphInlineOffset = (glyph: TFXGlyphInfo, direction: TFXTextDirection) =>
  isVerticalDirection(direction) ? -glyph.offset.y : glyph.offset.x;
export const logicalDirection = (direction: TFXTextDirection): "ltr" | "rtl" =>
  direction === "rtl" || direction === "btt" ? "rtl" : "ltr";
