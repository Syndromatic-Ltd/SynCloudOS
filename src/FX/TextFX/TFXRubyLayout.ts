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

import type { TFXLineOrientation } from "./TFXInlineGeometry";
import type { TFXRubyAlignment, TFXRubyCollisionPolicy, TFXRubyOverhang, TFXRubyPosition } from "./TFXRubyAnnotation";

export interface TFXRubyLayoutInput {
  readonly position: TFXRubyPosition;
  readonly baseWidth: number;
  readonly rubyWidth: number;
  readonly alignment: TFXRubyAlignment;
  readonly overhang: TFXRubyOverhang;
  readonly collisionPolicy: TFXRubyCollisionPolicy;
  readonly direction: "ltr" | "rtl";
  readonly orientation: TFXLineOrientation;
  readonly baseAscent: number;
  readonly baseDescent: number;
  readonly baseVerticalAscent: number;
  readonly baseVerticalDescent: number;
  readonly rubyAscent: number;
  readonly rubyDescent: number;
  readonly fontSize: number;
}

export interface TFXRubyLayoutResult {
  readonly baseInlineOffset: number;
  readonly cellWidth: number;
  readonly inlineOffset: number;
  readonly crossOffset: number;
  readonly crossMin: number;
  readonly crossMax: number;
  readonly width: number;
}

function overlayPlacement(input: TFXRubyLayoutInput) {
  const contained = input.collisionPolicy !== "allow" || input.overhang === "none" || input.alignment === "lineEdge";
  const cellWidth = contained ? Math.max(input.baseWidth, input.rubyWidth) : input.baseWidth;
  const baseInlineOffset = contained ? (cellWidth - input.baseWidth) / 2 : 0;
  const alignment = input.alignment === "auto" || input.alignment === "lineEdge" ? "center" : input.alignment;
  const startOffset = input.direction === "rtl" ? cellWidth - input.rubyWidth : 0;
  const endOffset = input.direction === "rtl" ? 0 : cellWidth - input.rubyWidth;
  let rubyOffset = alignment === "start" ? startOffset : alignment === "end" ? endOffset : (cellWidth - input.rubyWidth) / 2;
  if (input.collisionPolicy === "lineEdge" || input.alignment === "lineEdge") {
    rubyOffset = Math.min(Math.max(rubyOffset, 0), Math.max(0, cellWidth - input.rubyWidth));
  } else if (input.overhang === "start") {
    rubyOffset = input.direction === "rtl" ? Math.max(rubyOffset, 0) : Math.min(rubyOffset, input.baseWidth - input.rubyWidth);
  } else if (input.overhang === "end") {
    rubyOffset = input.direction === "rtl" ? Math.min(rubyOffset, input.baseWidth - input.rubyWidth) : Math.max(rubyOffset, 0);
  }
  const width = alignment === "distributeLetter" || alignment === "distributeSpace" ? Math.max(input.rubyWidth, cellWidth) : input.rubyWidth;
  return { cellWidth, baseInlineOffset, rubyOffset, width };
}

function neighbourPlacement(input: TFXRubyLayoutInput, beforeBase: boolean) {
  const gap = input.fontSize * 0.08;
  const cellWidth = input.baseWidth + gap + input.rubyWidth;
  const rubyFirst = input.direction === "rtl" ? !beforeBase : beforeBase;
  return rubyFirst
    ? { cellWidth, baseInlineOffset: input.rubyWidth + gap, rubyOffset: 0, width: input.rubyWidth }
    : { cellWidth, baseInlineOffset: 0, rubyOffset: input.baseWidth + gap, width: input.rubyWidth };
}

/**
 * Pure portable ruby geometry. Before/after retain the historical overlay;
 * inline and inter-character reserve neighbouring atomic slots in logical
 * direction so their geometry participates in wrapping and truncation.
 */
export function layoutTFXRuby(input: TFXRubyLayoutInput): TFXRubyLayoutResult {
  const placement = input.position === "inline"
    ? neighbourPlacement(input, false)
    : input.position === "interCharacter"
      ? neighbourPlacement(input, true)
      : overlayPlacement(input);
  const gap = input.fontSize * 0.1;
  let crossOffset = 0;
  if (input.position === "before" || input.position === "after") {
    const beforeSign = input.orientation === "horizontal" ? -1 : 1;
    crossOffset = input.position === "before"
      ? beforeSign * ((input.orientation === "horizontal" ? input.baseAscent : input.baseVerticalDescent) + gap + (beforeSign < 0 ? input.rubyDescent : input.rubyAscent))
      : -beforeSign * ((input.orientation === "horizontal" ? input.baseDescent : input.baseVerticalAscent) + gap + (beforeSign < 0 ? input.rubyAscent : input.rubyDescent));
  }
  return Object.freeze({
    baseInlineOffset: placement.baseInlineOffset,
    cellWidth: placement.cellWidth,
    inlineOffset: placement.rubyOffset - placement.baseInlineOffset,
    crossOffset,
    crossMin: crossOffset - input.rubyAscent,
    crossMax: crossOffset + input.rubyDescent,
    width: placement.width,
  });
}

export function tfxRubyGlyphOffsets(count: number, naturalWidth: number, targetWidth: number, alignment: TFXRubyAlignment): readonly number[] {
  if (count === 0 || targetWidth <= naturalWidth || (alignment !== "distributeLetter" && alignment !== "distributeSpace")) {
    return Object.freeze(new Array(count).fill(0));
  }
  const gapCount = alignment === "distributeLetter" ? Math.max(1, count - 1) : count + 1;
  const gap = (targetWidth - naturalWidth) / gapCount;
  const initial = alignment === "distributeSpace" ? gap : 0;
  return Object.freeze(Array.from({ length: count }, (_, index) => initial + index * gap));
}
