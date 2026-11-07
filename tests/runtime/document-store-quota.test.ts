import { describe, expect, it } from "vitest";
import { createInMemoryDocumentStore } from "../../src/SynCloudOS/DocumentStore/InMemoryDocumentStore";
import { createPersistenceDocumentStore, type SynCloudOSDocumentStoreLock } from "../../src/SynCloudOS/DocumentStore/PersistenceDocumentStore";
import { createPersistence } from "../../src/SynCloudOS/Persistence/Persistence";

const kind = { kind: "quota.note", displayName: "Note", version: 1 };
const image = "data:image/png;base64," + "abc123".repeat(20_000);
const draft = (title: string) => ({ id: "note", kind: kind.kind, title, body: { image, literal: [0, 0], nested: { text: "retained" } }, publishState: "draft" as const });
function lock(): SynCloudOSDocumentStoreLock {
  let tail: Promise<unknown> = Promise.resolve();
  return { request: (_name, _options, callback) => {
    const result = tail.then(callback);
    tail = result.catch(() => undefined);
    return result;
  } };
}
function storage(initial: string, quota: number): Storage {
  const items = new Map<string, string>([["quota:documentStore:v1", initial]]);
  return {
    get length() { return items.size; },
    key: index => [...items.keys()][index] ?? null,
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => {
      const other = [...items].reduce((total, [existing, text]) => total + (existing === key ? 0 : text.length), 0);
      if (other + value.length > quota) throw new DOMException("Storage full", "QuotaExceededError");
      items.set(key, value);
    },
    removeItem: key => { items.delete(key); }, clear: () => items.clear(),
  };
}
async function fixture() {
  const memory = createInMemoryDocumentStore({ kinds: [kind] });
  const first = await memory.saveDraft(draft("First"), undefined, { ifMatch: null, idempotencyKey: "create" });
  const legacy = JSON.stringify(memory.exportSnapshot());
  const backing = storage(legacy, legacy.length + 1000);
  const persistence = () => createPersistence({ runtimeId: "runtime:quota" as never, storage: backing, namespace: "quota" });
  const sharedLock = lock();
  const open = () => createPersistenceDocumentStore({ kinds: [kind], persistence: persistence(), conditionalWriteLock: sharedLock });
  return { first, legacy, backing, open };
}

describe("DocumentStore history under browser storage quota", () => {
  it("saves repeated image history losslessly instead of exhausting storage with duplicate bytes", async () => {
    const { first, legacy, backing, open } = await fixture();
    const store = open();
    const second = await store.saveDraft(draft("Second"), undefined, { ifMatch: first.storageVersion.etag, idempotencyKey: "second" });
    expect(backing.getItem("quota:documentStore:v1")!.length).toBeLessThan(legacy.length);
    const reloaded = open();
    expect(await reloaded.getDraft("note")).toEqual(second);
    expect(await reloaded.readDraftVersion("note", first.storageVersion.id)).toEqual(first);
    expect(await reloaded.listDraftVersions("note")).toHaveLength(2);
    expect(await reloaded.saveDraft(draft("First"), undefined, { ifMatch: null, idempotencyKey: "create" })).toEqual(first);
    expect((await reloaded.exportSnapshot()).schemaVersion).toBe(2);
    expect((await reloaded.getDraft("note"))!.body).toEqual(draft("Second").body);
  });

  it("keeps concurrent writers and stale ETag refusal after compact storage is reopened", async () => {
    const { first, open } = await fixture();
    const a = open(), b = open();
    const second = await a.saveDraft(draft("Second"), undefined, { ifMatch: first.storageVersion.etag });
    await expect(b.saveDraft(draft("Stale"), undefined, { ifMatch: first.storageVersion.etag })).rejects.toMatchObject({ code: "document-store-version-conflict" });
    await b.saveDraft({ ...draft("Other"), id: "other" }, undefined, { ifMatch: null });
    const reloaded = open();
    expect(await reloaded.getDraft("note")).toEqual(second);
    expect((await reloaded.getDraft("other"))!.title).toBe("Other");
  });

  it("does not report a missing lock when persistence rejects a write with a real lock installed", async () => {
    const backing = storage("", 0);
    const store = createPersistenceDocumentStore({ kinds: [kind], persistence: createPersistence({ runtimeId: "runtime:quota" as never, storage: backing, namespace: "quota" }), conditionalWriteLock: lock() });
    const error = await store.saveDraft(draft("Unsaved"), undefined, { ifMatch: null }).catch(error => error);
    expect(error).toMatchObject({ code: "document-store-atomicity-unavailable" });
    expect(error.message).toMatch(/storage|persist/i);
    expect(error.message).not.toMatch(/injected cross-context lock/i);
    expect(await store.getDraft("note")).toBeNull();
  });

  it("also reopens compact history through persistence ports without raw-text access", async () => {
    const backing = storage("", 400_000);
    const persistence = () => ({ ...createPersistence({ runtimeId: "runtime:quota" as never, storage: backing, namespace: "quota" }), readPreferenceText: undefined, writePreferenceText: undefined });
    const store = createPersistenceDocumentStore({ kinds: [kind], persistence: persistence(), conditionalWriteLock: lock() });
    const saved = await store.saveDraft(draft("First"), undefined, { ifMatch: null, idempotencyKey: "create" });
    const reloaded = createPersistenceDocumentStore({ kinds: [kind], persistence: persistence(), conditionalWriteLock: lock() });
    expect(await reloaded.getDraft("note")).toEqual(saved);
    expect(await reloaded.readDraftVersion("note", saved.storageVersion.id)).toEqual(saved);
  });
});
