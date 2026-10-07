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

import { describe, expect, it, vi } from "vitest";
import type { LUFXIndexBackend, LUFXIndexBackendSnapshot } from "../../../src/FX/LuminaFX/LUFXIndexBackend";
import { LUFXQueryPlanner } from "../../../src/FX/LuminaFX/LUFXQueryPlanner";
import { LUFXSearchableItem } from "../../../src/FX/LuminaFX/LUFXSearchableItem";
import { LuminaEligibilityRegistry } from "../../../src/SynCloudOS/LuminaFX/LuminaEligibility";
import { LuminaIndexService } from "../../../src/SynCloudOS/LuminaFX/LuminaIndexService";
import { luminaRestrictionMatcher } from "../../../src/SynCloudOS/LuminaFX/luminaEligibilityRestriction";
import type { LuminaWorkerRequest, LuminaWorkerResponse } from "../../../src/SynCloudOS/LuminaFX/luminaWorkerProtocol";
import { WorkerLuminaIndexBackend } from "../../../src/SynCloudOS/PlatformAdapters/WorkerLuminaIndexBackend";

function item(id: string, options: { domain?: string; route?: string; revision?: string; visibility?: "eligible-donation" | "app-only"; title?: string } = {}) {
  return new LUFXSearchableItem({
    id,
    domain: options.domain ?? "journal.entry",
    contentType: "text/journal",
    title: options.title ?? `Asterion ${id}`,
    activation: { kind: "named-route", version: 1, routeName: options.route ?? "journal.entry", parameters: { id } },
    revision: options.revision ?? "r1",
    visibility: options.visibility ?? "eligible-donation",
  });
}

/** An owner with two domains and a spread of items that each fail one check. */
function fixture() {
  let now = 1_000;
  const registry = new LuminaEligibilityRegistry(() => now);
  registry.registerProjection({ ownerAppId: "journal", domain: "journal.entry", destinationAppId: "journal-reader", routeName: "journal.entry" });
  registry.registerProjection({ ownerAppId: "journal", domain: "journal.note", destinationAppId: "journal-reader", routeName: "journal.note" });
  registry.registerProjection({ ownerAppId: "other", domain: "journal.entry", destinationAppId: "other", routeName: "journal.entry" });
  const eligible = (itemId: string, domain = "journal.entry", revision = "r1", window: { notBeforeMs?: number; notAfterMs?: number } = {}) =>
    registry.setItem({ ownerAppId: "journal", domain, itemId, revision, eligible: true, ...window });
  eligible("current");
  eligible("note", "journal.note");
  eligible("stale-revision", "journal.entry", "r0");
  eligible("wrong-route");
  eligible("app-only");
  eligible("future", "journal.entry", "r1", { notBeforeMs: 2_000 });
  eligible("expired", "journal.entry", "r1", { notAfterMs: 500 });
  eligible("window", "journal.entry", "r1", { notBeforeMs: 900, notAfterMs: 1_100 });
  registry.setItem({ ownerAppId: "other", domain: "journal.entry", itemId: "other-owner", revision: "r1", eligible: true });
  const items = [
    item("current"),
    item("note", { domain: "journal.note", route: "journal.note" }),
    item("stale-revision"),
    item("wrong-route", { route: "journal.other" }),
    item("app-only", { visibility: "app-only" }),
    item("future"),
    item("expired"),
    item("window"),
    item("other-owner"),
    item("never-eligible"),
    item("note-in-wrong-domain", { domain: "journal.unregistered" }),
  ];
  return { registry, items, advance(to: number) { now = to; } };
}

describe("Lumina eligibility restrictions", () => {
  it("admit exactly the items bindingFor binds, as time passes", () => {
    const { registry, items, advance } = fixture();
    for (const time of [1_000, 1_200, 2_500]) {
      advance(time);
      const matches = luminaRestrictionMatcher(registry.restrictionFor("journal"));
      const expected = items.filter((value) => registry.bindingFor("journal", value) !== null).map((value) => value.id);
      expect(items.filter(matches).map((value) => value.id)).toEqual(expected);
      expect(expected.length).toBeGreaterThan(0);
    }
    advance(1_000);
    expect(items.filter(luminaRestrictionMatcher(registry.restrictionFor("journal"))).map((value) => value.id))
      .toEqual(["current", "note", "window"]);
  });

  it("are plain data that survive a structured clone", () => {
    const { registry, items } = fixture();
    const restriction = registry.restrictionFor("journal");
    const cloned = structuredClone(restriction);
    expect(items.filter(luminaRestrictionMatcher(cloned))).toEqual(items.filter(luminaRestrictionMatcher(restriction)));
  });
});

describe("restricted index queries", () => {
  const snapshotOf = (values: readonly LUFXSearchableItem[]): LUFXIndexBackendSnapshot => Object.freeze({
    state: "ready", schemaVersion: 1, checkpoint: Object.freeze({ generation: 1, revision: values.length }),
    items: Object.freeze(values.map((value) => value.toJSON())),
  });

  it("filter and plan where the index lives when the backend can", async () => {
    const { registry, items } = fixture();
    const restriction = registry.restrictionFor("journal");
    const snapshot = vi.fn(async () => snapshotOf(items));
    const queryRestricted = vi.fn(async () => new LUFXQueryPlanner().execute(
      { state: "ready", schemaVersion: 1, checkpoint: { generation: 1, revision: items.length }, items: items.filter(luminaRestrictionMatcher(restriction)) },
      { text: "Asterion" },
    ));
    const backend = { mutate: vi.fn(), snapshot, dispose: vi.fn(), queryRestricted } as unknown as LUFXIndexBackend;
    const service = new LuminaIndexService({ create: () => backend });
    const page = await service.queryRestricted("journal", { text: "Asterion", limit: 20 }, restriction, { signal: new AbortController().signal });
    expect(snapshot).not.toHaveBeenCalled();
    expect(queryRestricted).toHaveBeenCalledWith(expect.objectContaining({ text: "Asterion", limit: 20 }), restriction, expect.anything());
    expect(page.results.map(({ item: value }) => value.id).sort()).toEqual(["current", "note", "window"]);
    expect(backend.dispose).toHaveBeenCalledTimes(1);
  });

  it("filter a snapshot and plan locally otherwise, over the same items", async () => {
    const { registry, items } = fixture();
    const restriction = registry.restrictionFor("journal");
    const backend: LUFXIndexBackend = { mutate: vi.fn(), snapshot: async () => snapshotOf(items), dispose: vi.fn() };
    const service = new LuminaIndexService({ create: () => backend });
    const page = await service.queryRestricted("journal", { text: "Asterion", limit: 20 }, restriction, { signal: new AbortController().signal });
    const expected = new LUFXQueryPlanner().execute(
      { ...snapshotOf(items), items: items.filter((value) => registry.bindingFor("journal", value) !== null) },
      { text: "Asterion", limit: 20 },
    );
    expect(page).toEqual(expected);
    expect(backend.dispose).toHaveBeenCalledTimes(1);
  });

  it("send the restriction with the worker query and return only its page", async () => {
    const posts: LuminaWorkerRequest[] = [];
    let respond!: (response: LuminaWorkerResponse) => void;
    const worker = {
      addEventListener(type: string, listener: (event: MessageEvent<LuminaWorkerResponse>) => void) {
        if (type === "message") respond = (response) => listener({ data: response } as MessageEvent<LuminaWorkerResponse>);
      },
      removeEventListener() {},
      postMessage(message: LuminaWorkerRequest) { posts.push(message); },
      terminate() {},
    };
    const { registry } = fixture();
    const restriction = registry.restrictionFor("journal");
    const backend = new WorkerLuminaIndexBackend(worker as unknown as Worker, "lumina", "journal");
    const pending = backend.queryRestricted({ text: "Asterion", limit: 5 } as never, restriction, { cursor: "c1" });
    expect(posts[0]).toMatchObject({ operation: "query", ownerKey: "journal", query: { text: "Asterion" }, cursor: "c1", restriction });
    const current = item("current");
    respond({ id: posts[0]!.id, ok: true, value: {
      checkpoint: { generation: 1, revision: 3 }, tokenizerVersion: "lufx-tokenizer-v1", rankerVersion: "lufx-lexical-v2",
      results: [{ item: current.toJSON(), score: 2, snippet: { text: "Asterion current", highlights: [] } }],
    } });
    const page = await pending;
    expect(page.results.map(({ item: value }) => value.id)).toEqual(["current"]);
    // A plain query sends no restriction.
    const plain = backend.query({ text: "Asterion" } as never);
    expect(posts.at(-1)).not.toHaveProperty("restriction");
    backend.dispose();
    await expect(plain).rejects.toMatchObject({ name: "AbortError" });
  });
});
