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

import type { GFXPoint, GFXSize } from "../GraphicsFX/GFXGeometry";

export type TFXTextDirection = "ltr" | "rtl" | "ttb" | "btt";
export interface TFXGlyphInfo {
  readonly id: number;
  /** UTF-16 offset into the original run input, supplied by the shaping engine. */
  readonly cluster: number;
  readonly position: GFXPoint;
  readonly advance: GFXPoint;
  readonly offset: GFXPoint;
  /** Baseline offsets inside a ligature, sourced from the font's GDEF caret table. */
  readonly ligatureCaretOffsets?: readonly number[];
}
export interface TFXGlyphRun {
  readonly text: string;
  readonly direction: TFXTextDirection;
  readonly glyphs: readonly TFXGlyphInfo[];
  readonly advance: GFXSize;
}
