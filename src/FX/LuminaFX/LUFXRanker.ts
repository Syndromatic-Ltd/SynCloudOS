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
import type { LUFXSearchableItem } from "./LUFXSearchableItem";
import { foldLUFXText, luFXEditDistanceAtMostOne, tokenizeLUFXText, type LUFXToken } from "./LUFXTokenizer";

export const LUFX_RANKER_VERSION = "lufx-lexical-v2" as const;

export interface LUFXParsedQuery {
  readonly terms: readonly string[];
  readonly phrases: readonly (readonly string[])[];
  readonly normalizedText: string;
}

export interface LUFXRankedItem {
  readonly item: LUFXSearchableItem;
  readonly score: number;
  readonly normalizedTitle: string;
  readonly matchedTerms: readonly string[];
}

interface IndexedField {
  readonly weight: number;
  readonly tokens: readonly LUFXToken[];
}

interface PreparedItem {
  readonly fields: readonly IndexedField[];
  readonly normalizedTitle: string;
}

const fieldWeights = Object.freeze({ title: 8, alternateNames: 5, keywords: 4, subtitle: 3, body: 1 });
const fuzzyMinimumLength = 4;
const maximumFuzzyCandidates = 32;
const halfYearMilliseconds = 180 * 24 * 60 * 60 * 1_000;
const preparedItems = new WeakMap<LUFXSearchableItem, Map<string, PreparedItem>>();

export function parseLUFXUserText(text: string, locale: string): LUFXParsedQuery {
  const phrases: string[][] = [];
  const terms: string[] = [];
  const quoted = /"([^"]+)"/gu;
  let cursor = 0;
  let match: RegExpExecArray | null;
  const append = (value: string, phrase: boolean) => {
    const tokens = tokenizeLUFXText(value, { locale }).map((token) => token.term);
    if (phrase && tokens.length > 0) phrases.push([...tokens]);
    terms.push(...tokens);
  };
  while ((match = quoted.exec(text)) !== null) {
    append(text.slice(cursor, match.index), false);
    append(match[1] ?? "", true);
    cursor = match.index + match[0].length;
  }
  append(text.slice(cursor), false);
  const uniqueTerms = [...new Set(terms)];
  if (uniqueTerms.length > 64 || phrases.length > 16 || phrases.some((phrase) => phrase.length > 16)) {
    throw new RangeError("Lumina lexical query exceeds its token or phrase complexity limit.");
  }
  return Object.freeze({
    terms: Object.freeze(uniqueTerms),
    phrases: Object.freeze(phrases.map((phrase) => Object.freeze(phrase))),
    normalizedText: uniqueTerms.join(" "),
  });
}

function field(value: string | undefined, weight: number, locale: string): IndexedField | null {
  if (value === undefined || value.length === 0) return null;
  return { weight, tokens: tokenizeLUFXText(value, { locale }) };
}

function fields(item: LUFXSearchableItem, locale: string): readonly IndexedField[] {
  return [
    field(item.title, fieldWeights.title, locale),
    ...(item.alternateNames ?? []).map((value) => field(value, fieldWeights.alternateNames, locale)),
    ...(item.keywords ?? []).map((value) => field(value, fieldWeights.keywords, locale)),
    field(item.subtitle, fieldWeights.subtitle, locale),
    field(item.body, fieldWeights.body, locale),
  ].filter((entry): entry is IndexedField => entry !== null);
}

function prepareItem(item: LUFXSearchableItem, locale: string): PreparedItem {
  let byLocale = preparedItems.get(item);
  if (!byLocale) {
    byLocale = new Map();
    preparedItems.set(item, byLocale);
  }
  const existing = byLocale.get(locale);
  if (existing) return existing;
  const prepared = Object.freeze({
    fields: fields(item, locale),
    normalizedTitle: tokenizeLUFXText(item.title, { locale }).map((token) => token.term).join(" "),
  });
  byLocale.set(locale, prepared);
  return prepared;
}

/** Prepares immutable lexical field/token caches for a known query locale.
 * Hosts may call this while building a generation so the first query does not
 * pay tokenization cost on the presentation/main thread. */
export function prepareLUFXItems(items: readonly LUFXSearchableItem[], locale: string): void {
  for (const item of items) prepareItem(item, locale);
}

function tokenMatches(candidate: string, term: string, query: LUFXQuery, fuzzyExpansions?: ReadonlyMap<string, ReadonlySet<string>>): boolean {
  if (candidate === term) return true;
  if (query.prefix && term.length >= 1 && candidate.startsWith(term)) return true;
  return query.fuzzy && term.length >= fuzzyMinimumLength && (fuzzyExpansions?.get(term)?.has(candidate) ?? false);
}

function phrasePresent(tokens: readonly LUFXToken[], phrase: readonly string[]): boolean {
  if (phrase.length === 0 || tokens.length < phrase.length) return false;
  outer: for (let start = 0; start <= tokens.length - phrase.length; start += 1) {
    for (let offset = 0; offset < phrase.length; offset += 1) {
      if (tokens[start + offset]?.term !== phrase[offset]) continue outer;
    }
    return true;
  }
  return false;
}

function recency(item: LUFXSearchableItem, asOf: number | undefined): number {
  if (asOf === undefined) return 0;
  const timestamp = item.modifiedAt ?? item.createdAt;
  if (timestamp === undefined) return 0;
  const age = Math.max(0, asOf - timestamp);
  return 2 / (1 + age / halfYearMilliseconds);
}

export function compareLUFXRankedItems(left: LUFXRankedItem, right: LUFXRankedItem): number {
  if (left.score !== right.score) return right.score - left.score;
  const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  const title = compare(left.normalizedTitle, right.normalizedTitle);
  if (title !== 0) return title;
  const domain = compare(left.item.domain, right.item.domain);
  if (domain !== 0) return domain;
  return compare(left.item.id, right.item.id);
}

export function rankLUFXItems(items: readonly LUFXSearchableItem[], query: LUFXQuery): readonly LUFXRankedItem[] {
  const parsed = parseLUFXUserText(query.text, query.locale);
  const indexed = items.map((item) => ({ item, ...prepareItem(item, query.locale) }));
  const lexicon = [...new Set(indexed.flatMap((candidate) => candidate.fields.flatMap((entry) => entry.tokens.map((token) => token.term))))].sort();
  const fuzzyExpansions = new Map<string, ReadonlySet<string>>();
  if (query.fuzzy) {
    for (const term of parsed.terms) {
      if (term.length < fuzzyMinimumLength) continue;
      const expanded = lexicon.filter((candidate) => candidate !== term && luFXEditDistanceAtMostOne(candidate, term)).slice(0, maximumFuzzyCandidates);
      fuzzyExpansions.set(term, new Set(expanded));
    }
  }
  const documentFrequency = new Map<string, number>();
  for (const term of parsed.terms) {
    let count = 0;
    for (const candidate of indexed) {
      if (candidate.fields.some((entry) => entry.tokens.some((token) => tokenMatches(token.term, term, query, fuzzyExpansions)))) count += 1;
    }
    documentFrequency.set(term, count);
  }

  const ranked: LUFXRankedItem[] = [];
  for (const candidate of indexed) {
    const matched = new Set<string>();
    let score = 0;
    for (const term of parsed.terms) {
      let termScore = 0;
      for (const entry of candidate.fields) {
        let frequency = 0;
        for (const token of entry.tokens) {
          if (!tokenMatches(token.term, term, query, fuzzyExpansions)) continue;
          frequency += 1;
        }
        if (frequency > 0) termScore += entry.weight * (frequency / (frequency + 1.2));
      }
      if (termScore > 0) {
        matched.add(term);
        const frequency = documentFrequency.get(term) ?? 0;
        const idf = Math.log(1 + (items.length - frequency + 0.5) / (frequency + 0.5));
        score += termScore * idf;
      }
    }
    if (parsed.terms.length > 0 && matched.size !== parsed.terms.length) continue;
    if (parsed.phrases.some((phrase) => !candidate.fields.some((entry) => phrasePresent(entry.tokens, phrase)))) continue;
    score += parsed.phrases.length * 12;
    const normalizedTitle = candidate.normalizedTitle;
    if (parsed.normalizedText && normalizedTitle === parsed.normalizedText) score += 30;
    else if (parsed.normalizedText && normalizedTitle.startsWith(parsed.normalizedText)) score += 8;
    score += recency(candidate.item, query.asOf);
    score += (candidate.item.rankingHint ?? 0) * 1.5;
    if (!Number.isFinite(score)) continue;
    ranked.push(Object.freeze({ item: candidate.item, score, normalizedTitle, matchedTerms: Object.freeze([...matched]) }));
  }
  ranked.sort(compareLUFXRankedItems);
  return Object.freeze(ranked);
}

export function matchesLUFXTerm(candidate: string, term: string, query: LUFXQuery): boolean {
  const folded = foldLUFXText(candidate, query.locale);
  if (folded === term) return true;
  if (query.prefix && term.length >= 1 && folded.startsWith(term)) return true;
  return query.fuzzy && term.length >= fuzzyMinimumLength && luFXEditDistanceAtMostOne(folded, term);
}
