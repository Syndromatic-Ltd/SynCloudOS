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

import type { LUFXIndexSnapshot } from "./LUFXIndex";
import { LUFXQuery, type LUFXQueryDescriptor, type LUFXQueryFilter } from "./LUFXQuery";
import { LUFX_RANKER_VERSION, rankLUFXItems, type LUFXRankedItem } from "./LUFXRanker";
import { createLUFXSnippet, createLUFXSuggestions, type LUFXSnippet, type LUFXSuggestionOptions, type LUFXSuggestionResult } from "./LUFXSuggestions";
import { LUFX_TOKENIZER_VERSION } from "./LUFXTokenizer";

const encoder = new TextEncoder();

export interface LUFXQueryExecutionOptions {
  readonly signal?: AbortSignal;
  readonly cursor?: string;
}

export interface LUFXQueryResultEntry {
  readonly item: LUFXRankedItem["item"];
  readonly score: number;
  readonly snippet: LUFXSnippet;
}

export interface LUFXQueryResultPage {
  readonly checkpoint: LUFXIndexSnapshot["checkpoint"];
  readonly tokenizerVersion: typeof LUFX_TOKENIZER_VERSION;
  readonly rankerVersion: typeof LUFX_RANKER_VERSION;
  readonly results: readonly LUFXQueryResultEntry[];
  readonly nextCursor?: string;
}

interface CursorPayload {
  readonly version: 1;
  readonly generation: number;
  readonly queryFingerprint: string;
  readonly tokenizerVersion: typeof LUFX_TOKENIZER_VERSION;
  readonly rankerVersion: typeof LUFX_RANKER_VERSION;
  readonly last: Readonly<{ score: number; normalizedTitle: string; domain: string; id: string }>;
}

function queryValue(value: LUFXQuery | LUFXQueryDescriptor): LUFXQuery {
  return value instanceof LUFXQuery ? value : new LUFXQuery(value);
}

function fingerprint(query: LUFXQuery): string {
  const json = JSON.stringify(query.toJSON());
  let hash = 0x811c9dc5;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function cursorFor(generation: number, queryFingerprint: string, entry: LUFXRankedItem): string {
  const payload: CursorPayload = {
    version: 1,
    generation,
    queryFingerprint,
    tokenizerVersion: LUFX_TOKENIZER_VERSION,
    rankerVersion: LUFX_RANKER_VERSION,
    last: { score: entry.score, normalizedTitle: entry.normalizedTitle, domain: entry.item.domain, id: entry.item.id },
  };
  return encodeURIComponent(JSON.stringify(payload));
}

function parseCursor(value: string): CursorPayload {
  if (typeof value !== "string" || value.length === 0 || value.length > 4_096) throw new DOMException("Lumina cursor is invalid.", "InvalidStateError");
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<CursorPayload>;
    if (parsed.version !== 1 || !Number.isSafeInteger(parsed.generation) || typeof parsed.queryFingerprint !== "string" ||
      parsed.tokenizerVersion !== LUFX_TOKENIZER_VERSION || parsed.rankerVersion !== LUFX_RANKER_VERSION ||
      !parsed.last || typeof parsed.last.score !== "number" || !Number.isFinite(parsed.last.score) ||
      typeof parsed.last.normalizedTitle !== "string" || typeof parsed.last.domain !== "string" || typeof parsed.last.id !== "string") {
      throw new Error("invalid cursor");
    }
    return parsed as CursorPayload;
  } catch {
    throw new DOMException("Lumina cursor is invalid.", "InvalidStateError");
  }
}

function filterMatches(item: LUFXRankedItem["item"], filter: LUFXQueryFilter): boolean {
  switch (filter.kind) {
    case "and": return filter.filters.every((entry) => filterMatches(item, entry));
    case "or": return filter.filters.some((entry) => filterMatches(item, entry));
    case "domain": return filter.values.includes(item.domain);
    case "content-type": return filter.values.includes(item.contentType);
    case "created-at": {
      const timestamp = item.createdAt;
      return timestamp !== undefined && (filter.minimum === undefined || timestamp >= filter.minimum) && (filter.maximum === undefined || timestamp <= filter.maximum);
    }
    case "modified-at": {
      const timestamp = item.modifiedAt;
      return timestamp !== undefined && (filter.minimum === undefined || timestamp >= filter.minimum) && (filter.maximum === undefined || timestamp <= filter.maximum);
    }
  }
}

function prefilter(snapshot: LUFXIndexSnapshot, query: LUFXQuery): readonly LUFXRankedItem["item"][] {
  return snapshot.items.filter((item) =>
    (query.domains.length === 0 || query.domains.includes(item.domain)) &&
    (query.contentTypes.length === 0 || query.contentTypes.includes(item.contentType)) &&
    (query.filter === undefined || filterMatches(item, query.filter))
  );
}

function cursorIndex(ranked: readonly LUFXRankedItem[], cursor: CursorPayload): number {
  return ranked.findIndex((entry) => entry.score === cursor.last.score && entry.normalizedTitle === cursor.last.normalizedTitle && entry.item.domain === cursor.last.domain && entry.item.id === cursor.last.id);
}

export class LUFXQueryPlanner {
  execute(snapshot: LUFXIndexSnapshot, value: LUFXQuery | LUFXQueryDescriptor, options: LUFXQueryExecutionOptions = {}): LUFXQueryResultPage {
    options.signal?.throwIfAborted();
    if (snapshot.state !== "ready") throw new DOMException("Lumina index requires rebuilding before query.", "InvalidStateError");
    const query = queryValue(value);
    const queryFingerprint = fingerprint(query);
    const ranked = rankLUFXItems(prefilter(snapshot, query), query);
    let start = 0;
    if (options.cursor !== undefined) {
      const cursor = parseCursor(options.cursor);
      if (cursor.generation !== snapshot.checkpoint.generation || cursor.queryFingerprint !== queryFingerprint) {
        throw new DOMException("Lumina cursor does not match the current query generation.", "InvalidStateError");
      }
      const position = cursorIndex(ranked, cursor);
      if (position < 0) throw new DOMException("Lumina cursor sort key is no longer present in this generation.", "InvalidStateError");
      start = position + 1;
    }
    const selected: LUFXRankedItem[] = [];
    let returnedBytes = 0;
    for (const entry of ranked.slice(start)) {
      if (selected.length >= query.limit) break;
      const estimate = encoder.encode(JSON.stringify(entry.item.toJSON())).byteLength + 512;
      if (returnedBytes + estimate > query.maximumBytes) break;
      selected.push(entry);
      returnedBytes += estimate;
    }
    const next = start + selected.length < ranked.length ? selected.at(-1) : undefined;
    options.signal?.throwIfAborted();
    return Object.freeze({
      checkpoint: Object.freeze({ ...snapshot.checkpoint }),
      tokenizerVersion: LUFX_TOKENIZER_VERSION,
      rankerVersion: LUFX_RANKER_VERSION,
      results: Object.freeze(selected.map((entry) => Object.freeze({ item: entry.item, score: entry.score, snippet: createLUFXSnippet(entry, query) }))),
      ...(next ? { nextCursor: cursorFor(snapshot.checkpoint.generation, queryFingerprint, next) } : {}),
    });
  }

  suggest(snapshot: LUFXIndexSnapshot, value: LUFXQuery | LUFXQueryDescriptor, options: LUFXSuggestionOptions & { readonly signal?: AbortSignal } = {}): LUFXSuggestionResult {
    options.signal?.throwIfAborted();
    if (snapshot.state !== "ready") throw new DOMException("Lumina index requires rebuilding before suggestions.", "InvalidStateError");
    const query = queryValue(value);
    const ranked = rankLUFXItems(prefilter(snapshot, query), query);
    const result = createLUFXSuggestions(ranked, options);
    options.signal?.throwIfAborted();
    return result;
  }
}
