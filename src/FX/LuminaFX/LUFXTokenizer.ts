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

export const LUFX_TOKENIZER_VERSION = "lufx-tokenizer-v1" as const;

export interface LUFXTokenizerOptions {
  readonly locale?: string;
}

export interface LUFXToken {
  readonly term: string;
  readonly display: string;
  readonly start: number;
  readonly end: number;
  readonly position: number;
}

const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const word = /[\p{L}\p{N}\p{M}]/u;
const combiningMarks = /\p{M}+/gu;

export function canonicalLUFXLocale(locale?: string): string {
  if (locale === undefined || locale === "") return "und";
  if (typeof locale !== "string" || locale.length > 64) throw new TypeError("Lumina query locale must be a valid bounded locale identifier.");
  try { return new Intl.Locale(locale).toString(); }
  catch { throw new TypeError("Lumina query locale must be a valid locale identifier."); }
}

export function foldLUFXText(value: string, locale = "und"): string {
  if (typeof value !== "string") throw new TypeError("Lumina tokenizer input must be a string.");
  const canonical = canonicalLUFXLocale(locale);
  const lower = canonical === "und" ? value.toLocaleLowerCase() : value.toLocaleLowerCase(canonical);
  return lower
    .replaceAll("ß", "ss")
    .normalize("NFKD")
    .replace(combiningMarks, "")
    .normalize("NFC");
}

export function tokenizeLUFXText(value: string, options: LUFXTokenizerOptions = {}): readonly LUFXToken[] {
  if (typeof value !== "string") throw new TypeError("Lumina tokenizer input must be a string.");
  const locale = canonicalLUFXLocale(options.locale);
  const tokens: LUFXToken[] = [];
  let buffer = "";
  let bufferStart = 0;
  let offset = 0;

  const push = (display: string, start: number, end: number) => {
    const term = foldLUFXText(display, locale);
    if (!term) return;
    tokens.push(Object.freeze({ term, display, start, end, position: tokens.length }));
  };
  const flush = () => {
    if (!buffer) return;
    push(buffer, bufferStart, offset);
    buffer = "";
  };

  for (const character of value) {
    const start = offset;
    offset += character.length;
    if (cjk.test(character)) {
      flush();
      push(character, start, offset);
      continue;
    }
    if (word.test(character)) {
      if (!buffer) bufferStart = start;
      buffer += character;
      continue;
    }
    flush();
  }
  flush();
  return Object.freeze(tokens);
}

export function luFXEditDistanceAtMostOne(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  if (leftIndex < left.length || rightIndex < right.length) edits += 1;
  return edits <= 1;
}
