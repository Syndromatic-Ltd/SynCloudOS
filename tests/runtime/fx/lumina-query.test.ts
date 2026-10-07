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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { LUFXIndex } from "../../../src/FX/LuminaFX/LUFXIndex";
import type { LUFXIndexBackend, LUFXIndexBackendSnapshot } from "../../../src/FX/LuminaFX/LUFXIndexBackend";
import { LUFXQuery, type LUFXQueryDescriptor } from "../../../src/FX/LuminaFX/LUFXQuery";
import { LUFXSearchableItem, type LUFXSearchableItemJSON } from "../../../src/FX/LuminaFX/LUFXSearchableItem";
import { LUFX_TOKENIZER_VERSION, tokenizeLUFXText } from "../../../src/FX/LuminaFX/LUFXTokenizer";
import { LUFX_RANKER_VERSION } from "../../../src/FX/LuminaFX/LUFXRanker";

const corpus = JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/lumina/relevance-corpus.json"), "utf8")) as LUFXSearchableItemJSON[];
const judgments = JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/lumina/relevance-judgments.json"), "utf8")) as Record<string, string[]>;

class SnapshotBackend implements LUFXIndexBackend {
  snapshotValue: LUFXIndexBackendSnapshot;
  pending: Promise<LUFXIndexBackendSnapshot> | null = null;

  constructor(items = corpus, generation = 1) {
    this.snapshotValue = { state: "ready", schemaVersion: 1, checkpoint: { generation, revision: generation }, items };
  }

  async mutate(): Promise<never> { throw new Error("query fixture does not mutate"); }
  snapshot(signal?: AbortSignal): Promise<LUFXIndexBackendSnapshot> {
    signal?.throwIfAborted();
    return this.pending ?? Promise.resolve(this.snapshotValue);
  }
  dispose(): void {}
}

function query(value: LUFXQueryDescriptor): LUFXQuery { return new LUFXQuery(value); }

describe("Lumina lexical querying", () => {
  it("delegates query execution to a capable backend", async () => {
    const delegated = vi.fn(async () => ({ checkpoint: { generation: 9, revision: 9 }, tokenizerVersion: LUFX_TOKENIZER_VERSION, rankerVersion: LUFX_RANKER_VERSION, results: [] }));
    const backend = {
      async mutate() { throw new Error("not used"); },
      async snapshot() { throw new Error("snapshot should not run"); },
      query: delegated,
      dispose() {},
    } satisfies LUFXIndexBackend & { query: typeof delegated };
    const index = new LUFXIndex(backend);
    const descriptor = { text: "resume", locale: "en", limit: 1 } as const;
    await index.query(descriptor);
    expect(delegated).toHaveBeenCalledTimes(1);
    expect(delegated.mock.calls[0]?.[0]).toEqual(new LUFXQuery(descriptor).toJSON());
  });

  it("normalizes multilingual text deterministically without mutating display text", () => {
    expect(LUFX_TOKENIZER_VERSION).toBe("lufx-tokenizer-v1");
    expect(tokenizeLUFXText("Cafe\u0301 Lumière", { locale: "en" }).map((token) => token.term)).toEqual(["cafe", "lumiere"]);
    expect(tokenizeLUFXText("Straße", { locale: "de" }).map((token) => token.term)).toEqual(["strasse"]);
    expect(tokenizeLUFXText("İstanbul Isparta", { locale: "tr" }).map((token) => token.term)).toEqual(["istanbul", "ısparta"]);
    expect(tokenizeLUFXText("東京旅行", { locale: "ja" }).map((token) => token.term)).toEqual(["東", "京", "旅", "行"]);
    expect(tokenizeLUFXText("دليل العمارة", { locale: "ar" }).map((token) => token.term)).toEqual(["دليل", "العمارة"]);
  });

  it("ranks unique exact titles first and preserves deterministic top-k ordering", async () => {
    const index = new LUFXIndex(new SnapshotBackend());
    const result = await index.query(query({ text: "resume builder", locale: "en", asOf: 1_710_000_000_000, limit: 10 }));
    expect(result.tokenizerVersion).toBe(LUFX_TOKENIZER_VERSION);
    expect(result.rankerVersion).toBe(LUFX_RANKER_VERSION);
    expect(result.results.slice(0, 2).map((entry) => entry.item.id)).toEqual(judgments["resume builder"]);
    expect(result.results[0]?.item.title).toBe("Résumé Builder");
    expect(result.results.every((entry) => Number.isFinite(entry.score))).toBe(true);
    expect((await index.query(query({ text: "resume builder", locale: "en", asOf: 1_710_000_000_000, limit: 10 }))).results.map((entry) => entry.item.id))
      .toEqual(result.results.map((entry) => entry.item.id));
  });

  it("enforces phrases while supporting bounded prefix and fuzzy matching", async () => {
    const index = new LUFXIndex(new SnapshotBackend());
    const phrase = await index.query(query({ text: "\"neural design\"", locale: "en", limit: 10 }));
    expect(phrase.results.map((entry) => entry.item.id)).toEqual(judgments["\"neural design\""]);

    const prefix = await index.query(query({ text: "resum", locale: "en", prefix: true, limit: 10 }));
    expect(prefix.results[0]?.item.id).toBe("resume-exact");
    const fuzzy = await index.query(query({ text: "strase", locale: "de", fuzzy: true, limit: 10 }));
    expect(fuzzy.results[0]?.item.id).toBe("german-street");
    await expect(index.query(query({ text: "x", locale: "en", fuzzy: true, limit: 10 }))).resolves.toMatchObject({ results: [] });
  });

  it('searches the full corpus for a one-character prefix after a completed term', async () => {
    const values = Array.from({ length: 150 }, (_, index) => new LUFXSearchableItem({
      id: `clip-${index}`, domain: 'clips', contentType: 'video', title: `Placeholder blue ${index}`,
      activation: { kind: 'named-route', version: 1, routeName: 'clip', parameters: { id: String(index) } }, revision: '1',
    }).toJSON());
    values.push({ ...values[0]!, id: 'red', title: 'Placeholder red', keywords: ['rose'] });
    const index = new LUFXIndex(new SnapshotBackend(values));
    for (const text of ['placeholder r', 'placeholder re', 'placeholder  red ']) {
      const result = await index.query({ text, prefix: true, limit: 100, locale: 'en' });
      expect(result.results.map(entry => entry.item.id)).toEqual(['red']);
      expect(result.results[0]!.snippet.matches.length).toBeGreaterThan(0);
    }
    await expect(index.query({ text: 'placeholder r', prefix: false, limit: 100, locale: 'en' }))
      .resolves.toMatchObject({ results: [] });
  });

  it("matches combining marks, Turkish case folding, CJK and RTL fixtures", async () => {
    const index = new LUFXIndex(new SnapshotBackend());
    for (const [text, locale, expected] of [
      ["cafe", "en", "combining-cafe"],
      ["istanbul", "tr", "turkish-istanbul"],
      ["ısparta", "tr", "turkish-isparta"],
      ["strasse", "de", "german-street"],
      ["東京", "ja", "cjk-tokyo"],
      ["عمارة", "ar", "rtl-arabic"],
    ] as const) {
      const result = await index.query(query({ text, locale, limit: 5 }));
      expect(result.results[0]?.item.id, `${text}/${locale}`).toBe(expected);
    }
  });

  it("applies bounded typed filters and fixed-asOf recency without raw predicates", async () => {
    const recent = new LUFXSearchableItem({
      id: "recent", domain: "docs", contentType: "article", title: "Shared Result", body: "ranking target",
      modifiedAt: 1_700_000_000_000, activation: { version: 1, kind: "named-route", routeName: "docs.item", parameters: { id: "recent" } }, revision: "r1",
    }).toJSON();
    const old = new LUFXSearchableItem({
      id: "old", domain: "docs", contentType: "article", title: "Shared Result", body: "ranking target",
      modifiedAt: 1_600_000_000_000, activation: { version: 1, kind: "named-route", routeName: "docs.item", parameters: { id: "old" } }, revision: "r1",
    }).toJSON();
    const index = new LUFXIndex(new SnapshotBackend([old, recent]));
    const ranked = await index.query(query({ text: "shared result", locale: "en", asOf: 1_710_000_000_000 }));
    expect(ranked.results.map((entry) => entry.item.id)).toEqual(["recent", "old"]);
    expect((await index.query(query({ text: "shared result", locale: "en", asOf: 1_710_000_000_000 }))).results.map((entry) => entry.item.id))
      .toEqual(["recent", "old"]);
    const result = await index.query(query({
      text: "shared result",
      locale: "en",
      asOf: 1_710_000_000_000,
      filter: { kind: "and", filters: [
        { kind: "domain", values: ["docs"] },
        { kind: "modified-at", minimum: 1_650_000_000_000, maximum: 1_710_000_000_000 },
      ] },
    }));
    expect(result.results.map((entry) => entry.item.id)).toEqual(["recent"]);
    expect(() => query({ text: "x", filter: { kind: "raw", expression: "domain = 'docs'" } as never })).toThrow(/filter/i);
  });

  it("uses stable title/domain/id tie breaks and bounds returned result bytes", async () => {
    const make = (id: string, domain = "same") => new LUFXSearchableItem({
      id, domain, contentType: "note", title: "Identical", body: "same query",
      activation: { version: 1, kind: "named-route", routeName: "item", parameters: { id } }, revision: "r1",
    }).toJSON();
    const largeBody = "result ".repeat(55_000);
    const large = new LUFXSearchableItem({
      id: "large", domain: "same", contentType: "note", title: "Large Result", body: largeBody.slice(0, 256 * 1_024),
      activation: { version: 1, kind: "named-route", routeName: "item", parameters: { id: "large" } }, revision: "r1",
    }).toJSON();
    const index = new LUFXIndex(new SnapshotBackend([make("b"), make("a"), large]));
    const tied = await index.query(query({ text: "same query", locale: "en", limit: 10 }));
    expect(tied.results.slice(0, 2).map((entry) => entry.item.id)).toEqual(["a", "b"]);
    const bounded = await index.query(query({ text: "result", locale: "en", limit: 10, maximumBytes: 512 * 1_024 }));
    expect(bounded.results.map((entry) => entry.item.id)).toEqual(["large"]);
    expect(() => query({ text: "x", maximumBytes: 1024 })).toThrow(/maximumBytes/i);
  });

  it("binds cursors to the query and index generation", async () => {
    const backend = new SnapshotBackend(corpus, 7);
    const index = new LUFXIndex(backend);
    const first = await index.query(query({ text: "", locale: "en", limit: 1 }));
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await index.query(query({ text: "", locale: "en", limit: 1 }), { cursor: first.nextCursor! });
    expect(second.results[0]?.item.id).not.toBe(first.results[0]?.item.id);

    backend.snapshotValue = { ...backend.snapshotValue, checkpoint: { generation: 8, revision: 8 } };
    await expect(index.query(query({ text: "", locale: "en", limit: 1 }), { cursor: first.nextCursor! }))
      .rejects.toMatchObject({ name: "InvalidStateError" });
    await expect(index.query(query({ text: "different", locale: "en", limit: 1 }), { cursor: first.nextCursor! }))
      .rejects.toMatchObject({ name: "InvalidStateError" });
  });

  it("builds plain-text snippets and suggestions from the same prefiltered candidate set", async () => {
    const donatedOnly = corpus.filter((item) => item.visibility === "eligible-donation");
    const index = new LUFXIndex(new SnapshotBackend(donatedOnly));
    const result = await index.query(query({ text: "aurora", locale: "en", limit: 10 }));
    expect(result.results.map((entry) => entry.item.id)).toEqual(["public-aurora"]);
    expect(result.results[0]?.snippet.text).not.toContain("<");
    expect(result.results[0]?.snippet.matches.every((range) => range.start >= 0 && range.end <= result.results[0]!.snippet.text.length && range.end > range.start)).toBe(true);
    const suggestions = await index.suggest(query({ text: "aur", locale: "en", prefix: true, limit: 10 }), { limit: 5, maximumBytes: 128 });
    expect(suggestions.suggestions).toContain("Aurora Lighting Study");
    expect(suggestions.suggestions.join("\n")).not.toContain("Private Aurora Project");
  });

  it("rejects a delayed query batch after caller cancellation", async () => {
    const backend = new SnapshotBackend();
    let resolve!: (value: LUFXIndexBackendSnapshot) => void;
    backend.pending = new Promise((accept) => { resolve = accept; });
    const index = new LUFXIndex(backend);
    const controller = new AbortController();
    const pending = index.query(query({ text: "resume", locale: "en" }), { signal: controller.signal });
    controller.abort(new DOMException("superseded query", "AbortError"));
    resolve(backend.snapshotValue);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
