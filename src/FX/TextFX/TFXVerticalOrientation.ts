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

/**
 * Compact portable subset of Unicode Vertical_Orientation used by TextFX.
 * The table policy is pinned so browser Unicode updates cannot silently change
 * layout. Fonts still own glyph substitution through HarfBuzz vert/vrt2.
 */
export const TFX_VERTICAL_ORIENTATION_UNICODE_VERSION = "17.0.0";

export type TFXVerticalOrientation = "auto" | "upright" | "sideways";
export type TFXVerticalPresentation = "upright" | "sideways" | "combined";
export type TFXTextCombine = "none" | "all" | "digits2";
export type TFXLineBreakPolicy = "auto" | "strict" | "normal" | "loose";

const uprightScripts = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u;
const uprightSymbols = /[\p{Extended_Pictographic}\u2E80-\u2FFF\u3000-\u303F\u31C0-\u31EF\u3200-\u33FF\uFE10-\uFE1F\uFE30-\uFE4F\uFF01-\uFF60\uFFE0-\uFFE6]/u;
const defaultIgnorable = /\p{Default_Ignorable_Code_Point}/u;
const combining = /\p{Mark}/u;

export function tfxVerticalOrientationForGrapheme(grapheme: string): Exclude<TFXVerticalOrientation, "auto"> {
  if (typeof grapheme !== "string" || grapheme.length === 0 || grapheme.length > 256) {
    throw new RangeError("Vertical-orientation input must be one bounded grapheme.");
  }
  const significant = [...grapheme].filter(character => !defaultIgnorable.test(character) && !combining.test(character));
  if (!significant.length) return "upright";
  return significant.some(character => uprightScripts.test(character) || uprightSymbols.test(character))
    ? "upright"
    : "sideways";
}

const strictNoBreakBefore = /^[ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶー々〻ヽヾゝゞ〱-〵、。，．・：；？！‼⁇⁈⁉)\]｝〕〉》」』】〗〙〛]/u;
const normalNoBreakBefore = /^[、。，．・：；？！‼⁇⁈⁉)\]｝〕〉》」』】〗〙〛]/u;
const noBreakAfterOpening = /[(\[｛〔〈《「『【〖〘〚]$/u;

export function tfxAllowsLineBreak(
  previousGrapheme: string,
  nextGrapheme: string,
  policy: TFXLineBreakPolicy,
  language?: string,
): boolean {
  if (policy === "auto") return true;
  const locale = language?.toLowerCase() ?? "";
  const isCJK = /^(?:ja|zh|ko)(?:-|$)/u.test(locale);
  if (!isCJK) return true;
  if (noBreakAfterOpening.test(previousGrapheme)) return false;
  if (policy === "strict") return !strictNoBreakBefore.test(nextGrapheme);
  if (policy === "normal") return !normalNoBreakBefore.test(nextGrapheme);
  return !normalNoBreakBefore.test(nextGrapheme);
}
