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

import type { LUFXQuery } from "./LUFXQuery";
import type { LUFXRankedItem } from "./LUFXRanker";
import { matchesLUFXTerm, parseLUFXUserText } from "./LUFXRanker";
import { tokenizeLUFXText } from "./LUFXTokenizer";

export interface LUFXMatchRange { readonly start: number; readonly end: number }
export interface LUFXSnippet { readonly text: string; readonly matches: readonly LUFXMatchRange[] }

export interface LUFXSuggestionOptions {
  readonly limit?: number;
  readonly maximumBytes?: number;
}

export interface LUFXSuggestionResult {
  readonly suggestions: readonly string[];
}

const encoder = new TextEncoder();

function plainText(value: string): string {
  return value.replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim();
}

function sourceText(entry: LUFXRankedItem): string {
  return entry.item.body ?? entry.item.subtitle ?? entry.item.title;
}

export function createLUFXSnippet(entry: LUFXRankedItem, query: LUFXQuery): LUFXSnippet {
  const parsed = parseLUFXUserText(query.text, query.locale);
  const source = plainText(sourceText(entry));
  const tokens = tokenizeLUFXText(source, { locale: query.locale });
  const matchedTokens = tokens.filter((token) => parsed.terms.some((term) => matchesLUFXTerm(token.term, term, query)));
  const first = matchedTokens[0];
  const maximum = 240;
  let start = first ? Math.max(0, first.start - 80) : 0;
  let end = Math.min(source.length, start + maximum);
  if (end - start < maximum) start = Math.max(0, end - maximum);
  const text = source.slice(start, end);
  const matches = matchedTokens
    .filter((token) => token.end > start && token.start < end)
    .map((token) => Object.freeze({ start: Math.max(0, token.start - start), end: Math.min(text.length, token.end - start) }))
    .filter((range) => range.end > range.start);
  return Object.freeze({ text, matches: Object.freeze(matches) });
}

/** Validated suggestion bounds (defaults: 10 suggestions, 4 KiB of titles). */
export function lufxSuggestionBounds(options: LUFXSuggestionOptions = {}): Readonly<{ limit: number; maximumBytes: number }> {
  const limit = options.limit ?? 10;
  const maximumBytes = options.maximumBytes ?? 4_096;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new RangeError("Lumina suggestion limit must be an integer from 1 through 50.");
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 64 * 1_024) throw new RangeError("Lumina suggestion byte limit must be from 1 through 65536 bytes.");
  return Object.freeze({ limit, maximumBytes });
}

export function createLUFXSuggestions(ranked: readonly LUFXRankedItem[], options: LUFXSuggestionOptions = {}): LUFXSuggestionResult {
  const { limit, maximumBytes } = lufxSuggestionBounds(options);
  const suggestions: string[] = [];
  let bytes = 0;
  for (const entry of ranked) {
    if (suggestions.includes(entry.item.title)) continue;
    const size = encoder.encode(entry.item.title).byteLength;
    if (bytes + size > maximumBytes) continue;
    suggestions.push(entry.item.title);
    bytes += size;
    if (suggestions.length >= limit) break;
  }
  return Object.freeze({ suggestions: Object.freeze(suggestions) });
}
