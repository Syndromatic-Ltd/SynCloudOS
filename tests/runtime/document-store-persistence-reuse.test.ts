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

import { afterEach, describe, expect, it, vi } from "vitest";
import { createPersistenceDocumentStore, type SynCloudOSDocumentStoreLock } from "../../src/SynCloudOS/DocumentStore/PersistenceDocumentStore";
import { createPersistence } from "../../src/SynCloudOS/Persistence/Persistence";
import type { SynCloudOSPersistence } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    key: (index: number) => [...items.keys()][index] ?? null,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, String(value)); },
    removeItem: (key: string) => { items.delete(key); },
    clear: () => items.clear(),
  };
}

function exclusiveLock(): SynCloudOSDocumentStoreLock {
  let tail: Promise<void> = Promise.resolve();
  return {
    request: async (_name, _options, callback) => {
      const run = tail.then(callback, callback);
      tail = run.then(() => undefined, () => undefined);
      return run;
    },
  };
}

function sharedPersistence(storage: Storage): SynCloudOSPersistence {
  return createPersistence({ runtimeId: "runtime:reuse" as never, storage, namespace: "tests:reuse" });
}

/** Counts parses of a stored DocumentStore snapshot (a rebuild from storage). */
function countSnapshotParses() {
  const parse = JSON.parse;
  const counts = { parses: 0 };
  vi.spyOn(JSON, "parse").mockImplementation(function (this: JSON, text: string, reviver?: (this: unknown, key: string, value: unknown) => unknown) {
    if (typeof text === "string" && text.includes("idempotentDraftWrites")) counts.parses += 1;
    return parse.call(this, text, reviver);
  });
  return counts;
}

afterEach(() => { vi.restoreAllMocks(); });

const kind = { kind: "reuse.note", displayName: "Note", version: 1 };
const draft = (id: string, title: string) => ({ id, kind: kind.kind, title, body: { text: title }, publishState: "draft" as const });

describe("PersistenceDocumentStore snapshot reuse under the write lock", () => {
  it("rebuilds from storage only when another context has written since this one", async () => {
    const storage = memoryStorage();
    const lock = exclusiveLock();
    const a = createPersistenceDocumentStore({ persistence: sharedPersistence(storage), conditionalWriteLock: lock, kinds: [kind] });
    const b = createPersistenceDocumentStore({ persistence: sharedPersistence(storage), conditionalWriteLock: lock, kinds: [kind] });
    await a.saveDraft(draft("a-1", "A one"));
    await b.saveDraft(draft("b-1", "B one"));
    const counts = countSnapshotParses();
    await a.saveDraft(draft("a-1", "A one, again"));
    // b wrote since a's last write, so a rebuilt from storage and kept b's document.
    expect(counts.parses).toBeGreaterThan(0);
    counts.parses = 0;
    await a.saveDraft(draft("a-2", "A two"));
    await a.saveDraft(draft("a-3", "A three"));
    expect(counts.parses).toBe(0);
    vi.restoreAllMocks();

    const restored = createPersistenceDocumentStore({ persistence: createPersistence({ runtimeId: "runtime:check" as never, storage, namespace: "tests:reuse" }), kinds: [kind] });
    expect((await restored.listDrafts()).map((document) => document.id).sort()).toEqual(["a-1", "a-2", "a-3", "b-1"]);
    expect((await restored.getDraft("a-1"))?.title).toBe("A one, again");
  });

  it("neither shows nor later persists a mutation aborted after it ran", async () => {
    const storage = memoryStorage();
    const persistence = sharedPersistence(storage);
    const abort = new AbortController();
    let abortDuringAuthorisation = false;
    const store = createPersistenceDocumentStore({
      persistence,
      conditionalWriteLock: exclusiveLock(),
      kinds: [kind],
      authorise: () => {
        if (abortDuringAuthorisation) abort.abort();
        return undefined;
      },
    });
    await store.saveDraft(draft("doc", "Original"));
    abortDuringAuthorisation = true;
    await expect(store.saveDraft(draft("doc", "Aborted"), undefined, { signal: abort.signal })).rejects.toThrow();
    abortDuringAuthorisation = false;
    expect((await store.getDraft("doc"))?.title).toBe("Original");
    await store.saveDraft(draft("other", "Other"));
    const restored = createPersistenceDocumentStore({ persistence, kinds: [kind] });
    expect((await restored.getDraft("doc"))?.title).toBe("Original");
    expect(await restored.getDraft("other")).not.toBeNull();
  });

  it("leaves no partial state behind a mutation that fails", async () => {
    const storage = memoryStorage();
    const persistence = sharedPersistence(storage);
    const store = createPersistenceDocumentStore({ persistence, conditionalWriteLock: exclusiveLock(), kinds: [kind] });
    const saved = await store.saveDraft(draft("doc", "Original"));
    await expect(store.saveDraft(draft("doc", "Stale"), undefined, { ifMatch: "not-the-current-etag" })).rejects.toThrow();
    expect((await store.getDraft("doc"))?.title).toBe("Original");
    await store.saveDraft(draft("doc", "Current"), undefined, { ifMatch: saved.storageVersion?.etag ?? null });
    expect((await store.getDraft("doc"))?.title).toBe("Current");
  });

  it("treats an unreadable stored snapshot as empty, as before", async () => {
    const storage = memoryStorage();
    const persistence = sharedPersistence(storage);
    const store = createPersistenceDocumentStore({ persistence, conditionalWriteLock: exclusiveLock(), kinds: [kind] });
    await store.saveDraft(draft("doc", "Original"));
    const key = storage.key(0)!;
    storage.setItem(key, "{not json");
    await store.saveDraft(draft("fresh", "Fresh"));
    const restored = createPersistenceDocumentStore({ persistence, kinds: [kind] });
    expect((await restored.listDrafts()).map((document) => document.id)).toEqual(["fresh"]);
  });
});
