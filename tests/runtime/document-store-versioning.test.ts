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

import { describe, expect, it } from "vitest";
import {
  SynCloudOSDocumentStoreAtomicityUnavailableError,
  SynCloudOSDocumentStoreIdempotencyConflictError,
  SynCloudOSDocumentStoreVersionConflictError,
  createInMemoryDocumentStore,
  createPersistenceDocumentStore,
  type SynCloudOSDocumentDraftInput,
  type SynCloudOSDocumentKindMetadata,
} from "../../src/SynCloudOS/DocumentStore";
import { createPersistence } from "../../src/SynCloudOS/Persistence/Persistence";

const applicationKind: SynCloudOSDocumentKindMetadata = {
  kind: "application.document",
  version: 1,
  displayName: "Application Document",
  permissions: {
    getDraft: { public: true },
    saveDraft: { public: true },
    listDraftVersions: { public: true },
    readDraftVersion: { public: true },
    deleteDraft: { public: true },
  },
};

const draft = (id: string, title: string): SynCloudOSDocumentDraftInput => ({
  id,
  kind: applicationKind.kind,
  version: 1,
  title,
  slug: id,
  body: "",
  tags: [],
  publishState: "draft",
  createdAt: "2026-07-29T10:00:00.000Z",
  ownership: { kind: "system" },
  updatedAt: "2026-07-29T10:00:00.000Z",
});

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

describe("DocumentStore conditional writes", () => {
  it("rejects a stale writer and preserves the current draft", async () => {
    let tick = 0;
    const store = createInMemoryDocumentStore({
      kinds: [applicationKind],
      clock: () => new Date(Date.UTC(2026, 6, 29, 10, 0, tick++)),
    });
    const first = await store.saveDraft(draft("note-1", "First"), undefined, {
      ifMatch: null,
      idempotencyKey: "create-note-1",
    });
    const second = await store.saveDraft(
      { ...first, title: "Second" },
      undefined,
      { ifMatch: first.storageVersion.etag, idempotencyKey: "save-note-1-a" },
    );

    await expect(
      store.saveDraft(
        { ...first, title: "Stale" },
        undefined,
        { ifMatch: first.storageVersion.etag, idempotencyKey: "save-note-1-b" },
      ),
    ).rejects.toBeInstanceOf(SynCloudOSDocumentStoreVersionConflictError);
    expect((await store.getDraft("note-1"))?.title).toBe("Second");
    expect(second.storageVersion.sequence).toBe(2);
  });

  it("returns immutable revisions and makes operation-correct repeats safe", async () => {
    const store = createInMemoryDocumentStore({ kinds: [applicationKind] });
    const saved = await store.saveDraft(draft("note-2", "Versioned"), undefined, {
      ifMatch: null,
      idempotencyKey: "create-note-2",
    });
    const repeated = await store.saveDraft(draft("note-2", "Versioned"), undefined, {
      ifMatch: null,
      idempotencyKey: "create-note-2",
    });
    expect(repeated.storageVersion).toEqual(saved.storageVersion);
    expect(await store.listDraftVersions("note-2")).toHaveLength(1);

    repeated.title = "mutated";
    expect((await store.readDraftVersion("note-2", saved.storageVersion.id))?.title).toBe("Versioned");
    await expect(store.saveDraft(draft("note-2", "Different"), undefined, {
      ifMatch: saved.storageVersion.etag,
      idempotencyKey: "create-note-2",
    })).rejects.toBeInstanceOf(SynCloudOSDocumentStoreIdempotencyConflictError);
  });

  it("deletes conditionally while retaining immutable version history", async () => {
    const store = createInMemoryDocumentStore({ kinds: [applicationKind] });
    const saved = await store.saveDraft(draft("note-delete", "Delete"), undefined, {
      ifMatch: null,
      idempotencyKey: "create-delete",
    });
    await expect(store.deleteDraft("note-delete", undefined, {
      ifMatch: "stale",
      idempotencyKey: "delete-stale",
    })).rejects.toBeInstanceOf(SynCloudOSDocumentStoreVersionConflictError);
    await store.deleteDraft("note-delete", undefined, {
      ifMatch: saved.storageVersion.etag,
      idempotencyKey: "delete-current",
    });
    expect(await store.getDraft("note-delete")).toBeNull();
    expect(await store.listDraftVersions("note-delete")).toEqual([saved.storageVersion]);
  });

  it("requires an injected cross-context lock for persistent conditional writes", async () => {
    const storage = createMemoryStorage();
    const persistence = createPersistence({
      runtimeId: "runtime:persistent-conditional" as never,
      storage,
      namespace: "tests:persistent-conditional",
    });
    const unlocked = createPersistenceDocumentStore({ kinds: [applicationKind], persistence });
    await expect(unlocked.saveDraft(draft("persistent", "First"), undefined, {
      ifMatch: null,
      idempotencyKey: "persistent-create",
    })).rejects.toBeInstanceOf(SynCloudOSDocumentStoreAtomicityUnavailableError);

    const calls: string[] = [];
    const locked = createPersistenceDocumentStore({
      kinds: [applicationKind],
      persistence,
      conditionalWriteLock: {
        request: async (name, options, callback) => {
          calls.push(`${name}:${options.mode}`);
          return callback();
        },
      },
    });
    const saved = await locked.saveDraft(draft("persistent", "First"), undefined, {
      ifMatch: null,
      idempotencyKey: "persistent-create",
    });
    expect(saved.storageVersion.sequence).toBe(1);
    expect(calls).toEqual(["document-store:documentStore:v1:exclusive"]);

    const hydrated = createPersistenceDocumentStore({ kinds: [applicationKind], persistence });
    expect((await hydrated.getDraft("persistent"))?.storageVersion).toEqual(saved.storageVersion);
    expect(hydrated.exportSnapshot()).toMatchObject({ schemaVersion: 2 });
  });
});
