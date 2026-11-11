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
  it("recovers retained drafts without losing another context's documents, deletions or ETags", async () => {
    const storage = memoryStorage(), lock = exclusiveLock();
    const a = createPersistenceDocumentStore({ persistence: sharedPersistence(storage), conditionalWriteLock: lock, kinds: [kind] });
    await a.saveDraft(draft("shared", "Original"));
    await a.saveDraft(draft("deleted", "Delete me"));
    const b = createPersistenceDocumentStore({ persistence: sharedPersistence(storage), conditionalWriteLock: lock, kinds: [kind] });
    const write = vi.spyOn(storage, "setItem");
    write.mockImplementation(() => { throw new DOMException("Storage full", "QuotaExceededError"); });
    const local = await a.saveDraft(draft("local", "Retained"), undefined, { idempotencyKey: "local-write" });
    await a.publish("local", { slug: "retained" });
    write.mockRestore();
    const remote = await b.saveDraft(draft("shared", "Other context"));
    await b.deleteDraft("deleted");
    await b.saveDraft(draft("remote", "Remote only"));
    await a.saveDraft(draft("recovery", "Recovered"));

    const restored = createPersistenceDocumentStore({ persistence: sharedPersistence(storage), kinds: [kind] });
    expect((await restored.listDrafts()).map(document => document.id).sort()).toEqual(["recovery", "remote", "shared"]);
    expect(await restored.getDraft("shared")).toEqual(remote);
    expect((await restored.readPublished("local"))?.title).toBe("Retained");
    expect((await restored.listDraftVersions("local")).map(version => version.etag)).toContain(local.storageVersion.etag);
    expect(await a.saveDraft(draft("local", "Retained"), undefined, { idempotencyKey: "local-write" })).toEqual(local);
  });

  it("rejects stale ETags after recovery and accepts the other context's current ETag", async () => {
    const storage = memoryStorage(), lock = exclusiveLock();
    const a = createPersistenceDocumentStore({ persistence: sharedPersistence(storage), conditionalWriteLock: lock, kinds: [kind] });
    const original = await a.saveDraft(draft("shared", "Original"));
    const b = createPersistenceDocumentStore({ persistence: sharedPersistence(storage), conditionalWriteLock: lock, kinds: [kind] });
    const write = vi.spyOn(storage, "setItem").mockImplementation(() => { throw new DOMException("Storage full", "QuotaExceededError"); });
    await a.saveDraft(draft("local", "Retained"));
    write.mockRestore();
    const remote = await b.saveDraft(draft("shared", "Other context"));
    const stored = storage.getItem(storage.key(0)!);
    await expect(a.saveDraft(draft("shared", "Stale"), undefined, { ifMatch: original.storageVersion.etag })).rejects.toMatchObject({
      code: "document-store-version-conflict", currentDocument: JSON.parse(JSON.stringify(remote)),
    });
    expect(storage.getItem(storage.key(0)!)).toBe(stored);
    expect((await a.getDraft("local"))?.title).toBe("Retained");
    await a.saveDraft(draft("shared", "Reconciled"), undefined, { ifMatch: remote.storageVersion.etag });
    const restored = createPersistenceDocumentStore({ persistence: sharedPersistence(storage), kinds: [kind] });
    expect((await restored.getDraft("shared"))?.title).toBe("Reconciled");
    expect((await restored.getDraft("local"))?.title).toBe("Retained");
  });

  it("keeps both copies and reports a conflict when a retained document also changed in storage", async () => {
    const storage = memoryStorage(), lock = exclusiveLock();
    const a = createPersistenceDocumentStore({ persistence: sharedPersistence(storage), conditionalWriteLock: lock, kinds: [kind] });
    await a.saveDraft(draft("shared", "Original"));
    const b = createPersistenceDocumentStore({ persistence: sharedPersistence(storage), conditionalWriteLock: lock, kinds: [kind] });
    const write = vi.spyOn(storage, "setItem").mockImplementation(() => { throw new DOMException("Storage full", "QuotaExceededError"); });
    const local = await a.saveDraft(draft("shared", "Retained local copy"));
    write.mockRestore();
    const remote = await b.saveDraft(draft("shared", "Other context"));
    const stored = storage.getItem(storage.key(0)!);
    await expect(a.saveDraft(draft("recovery", "Must not overwrite either copy"))).rejects.toMatchObject({
      code: "document-store-version-conflict", documentId: "shared", currentDocument: JSON.parse(JSON.stringify(remote)),
    });
    expect(await a.getDraft("shared")).toEqual(local);
    expect(storage.getItem(storage.key(0)!)).toBe(stored);
    expect(await a.getDraft("recovery")).toBeNull();
    // Resolution uses the existing conditional save contract, with the ETag
    // reported by the conflict, rather than leaving the runtime write-blocked.
    const resolved = await a.saveDraft(draft("shared", "Explicitly reconciled copy"), undefined, { ifMatch: remote.storageVersion.etag });
    const restored = createPersistenceDocumentStore({ persistence: sharedPersistence(storage), kinds: [kind] });
    expect(await restored.getDraft("shared")).toEqual(resolved);
    expect((await restored.listDraftVersions("shared")).map(version => version.etag)).toEqual([
      ...(await b.listDraftVersions("shared")).map(version => version.etag), resolved.storageVersion.etag,
    ]);
  });

  it("rebases retained changes after another recovery write is rejected", async () => {
    const storage = memoryStorage(), lock = exclusiveLock();
    const a = createPersistenceDocumentStore({ persistence: sharedPersistence(storage), conditionalWriteLock: lock, kinds: [kind] });
    await a.saveDraft(draft("shared", "Original"));
    const b = createPersistenceDocumentStore({ persistence: sharedPersistence(storage), conditionalWriteLock: lock, kinds: [kind] });
    let reject = true;
    const setItem = storage.setItem;
    vi.spyOn(storage, "setItem").mockImplementation((key, value) => {
      if (reject) throw new DOMException("Storage full", "QuotaExceededError");
      setItem(key, value);
    });
    await a.saveDraft(draft("local-1", "Retained one"));
    reject = false;
    await b.saveDraft(draft("shared", "Remote one"));
    reject = true;
    await a.saveDraft(draft("local-2", "Retained two"));
    reject = false;
    const remote = await b.saveDraft(draft("shared", "Remote two"));
    await a.saveDraft(draft("recovery", "Recovered"));
    const restored = createPersistenceDocumentStore({ persistence: sharedPersistence(storage), kinds: [kind] });
    expect(await restored.getDraft("shared")).toEqual(remote);
    expect((await restored.listDrafts()).map(document => document.id).sort()).toEqual(["local-1", "local-2", "recovery", "shared"]);
  });

  it("keeps recovery in memory while a previously populated snapshot cannot be read", async () => {
    const storage = memoryStorage(), lock = exclusiveLock();
    const a = createPersistenceDocumentStore({ persistence: sharedPersistence(storage), conditionalWriteLock: lock, kinds: [kind] });
    await a.saveDraft(draft("shared", "Original"));
    const b = createPersistenceDocumentStore({ persistence: sharedPersistence(storage), conditionalWriteLock: lock, kinds: [kind] });
    const write = vi.spyOn(storage, "setItem").mockImplementation(() => { throw new DOMException("Storage full", "QuotaExceededError"); });
    await a.saveDraft(draft("local-1", "Retained one"));
    write.mockRestore();
    const remote = await b.saveDraft(draft("shared", "Other context"));
    const read = vi.spyOn(storage, "getItem").mockImplementation(() => { throw new DOMException("Read denied", "SecurityError"); });
    const writes = vi.spyOn(storage, "setItem");
    await a.saveDraft(draft("local-2", "Retained two"));
    expect(writes).not.toHaveBeenCalled();
    expect((await a.getDraft("shared"))?.title).toBe("Original");
    expect((await a.getDraft("local-1"))?.title).toBe("Retained one");
    read.mockRestore();
    await a.saveDraft(draft("recovery", "Recovered"));
    const restored = createPersistenceDocumentStore({ persistence: sharedPersistence(storage), kinds: [kind] });
    expect(await restored.getDraft("shared")).toEqual(remote);
    expect((await restored.listDrafts()).map(document => document.id).sort()).toEqual(["local-1", "local-2", "recovery", "shared"]);
  });

  it("retains a saved draft for publication when browser persistence rejects writes", async () => {
    const storage = memoryStorage();
    vi.spyOn(storage, "setItem").mockImplementation(() => { throw new DOMException("Storage unavailable", "QuotaExceededError"); });
    const store = createPersistenceDocumentStore({ persistence: sharedPersistence(storage), conditionalWriteLock: exclusiveLock(), kinds: [kind] });
    await store.saveDraft(draft("journal-post-webspring-4-0-enters-first-implementation", "Webspring"));
    await store.publish("journal-post-webspring-4-0-enters-first-implementation", { slug: "webspring-4-0-enters-first-implementation" });
    expect((await store.readPublished("journal-post-webspring-4-0-enters-first-implementation"))?.title).toBe("Webspring");
    await store.saveDraft(draft("second", "Second"));
    expect(await store.readPublished("journal-post-webspring-4-0-enters-first-implementation")).not.toBeNull();
    vi.restoreAllMocks();
    store.registerKind({ kind: "another.note", displayName: "Another Note", version: 1 });
    await store.saveDraft(draft("third", "Third"));
    const restored = createPersistenceDocumentStore({ persistence: sharedPersistence(storage), kinds: [kind] });
    expect(await restored.readPublished("journal-post-webspring-4-0-enters-first-implementation")).not.toBeNull();
    expect(await restored.getDraft("second")).not.toBeNull();
    expect(await restored.getDraft("third")).not.toBeNull();
  });

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
