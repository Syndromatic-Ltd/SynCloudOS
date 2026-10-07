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
import {
  ApplicationDocument,
  DocumentAbortError,
  DocumentReadOnlyError,
  DocumentRecoveryCorruptError,
  DocumentRequestedIdConflictError,
  DocumentSchemaError,
  DocumentTypeRegistry,
  DocumentVersionConflictError,
  InMemoryDocumentAdapter,
  InMemoryDocumentRecoveryStore,
  RemoteDocumentAdapter,
  SynchronisingDocumentAdapter,
  canonicalDocumentLocation,
  validateDocumentRestorationSnapshot,
  type DocumentRecord,
  type DocumentRemoteTransport,
  type DocumentStorageAdapter,
  type DocumentType,
  type DocumentWriteRequest,
} from "../../src/SynCloudOS/Documents";
import {
  createPersistenceDocumentStore,
  SynCloudOSDocumentStorePayloadError,
} from "../../src/SynCloudOS/DocumentStore";
import { createPersistence } from "../../src/SynCloudOS/Persistence/Persistence";
import { createDocumentTestDependencies } from "../fixtures/documentTestDependencies";
import { noteType } from "../fixtures/noteDocumentType";
import { createTestRuntimeEnvironment } from "./helpers";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

describe("document saves across structural close", () => {
  it("rejects every save after structural close without touching storage", async () => {
    const dependencies = createDocumentTestDependencies();
    const adapter = new InMemoryDocumentAdapter(dependencies.environment);
    const write = vi.spyOn(adapter, "write");
    const controller = new (await import("../../src/SynCloudOS/Documents")).DocumentController(dependencies);
    controller.registerType(noteType);
    controller.registerAdapter(adapter);
    const document = await controller.newDocument({
      documentId: "closed-save",
      typeId: noteType.id,
      location: { kind: "memory", namespace: "review", key: "closed-save" },
    });
    document.markClosed();

    await expect(document.save({ reason: "explicit" })).rejects.toMatchObject({
      code: "document-unavailable",
    });
    expect(write).not.toHaveBeenCalled();
    await dependencies.cleanup();
  });

  it("fences an already-started save when structural close occurs", async () => {
    const dependencies = createDocumentTestDependencies();
    const backing = new InMemoryDocumentAdapter(dependencies.environment);
    let release!: () => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const adapter: DocumentStorageAdapter = {
      id: "close-fenced-write",
      capabilities: backing.capabilities,
      supports: (location) => backing.supports(location),
      read: (location, options) => backing.read(location, options),
      write: async <T,>(request: DocumentWriteRequest<T>) => {
        markStarted();
        await blocked;
        return backing.write(request);
      },
      remove: (location, version, options) => backing.remove(location, version, options),
      list: (query) => backing.list(query),
      listVersions: (location, options) => backing.listVersions(location, options),
      readVersion: (location, version, options) => backing.readVersion(location, version, options),
    };
    const controller = new (await import("../../src/SynCloudOS/Documents")).DocumentController(dependencies);
    controller.registerType(noteType);
    controller.registerAdapter(adapter);
    const location = { kind: "memory", namespace: "review", key: "close-fenced" } as const;
    const document = await controller.newDocument({ documentId: "close-fenced", typeId: noteType.id, location });
    document.update((model) => ({ ...model, body: "discarded" }), { actionName: "Type" });
    const saving = document.save({ reason: "explicit" });
    await started;
    document.markClosed();
    release();
    await expect(saving).rejects.toMatchObject({ code: expect.stringMatching(/abort|unavailable/) });
    expect(document.state).toBe("closed");
    expect(await backing.read(location)).toBeNull();
    await dependencies.cleanup();
  });

  it("keeps failed read-only content recoverable in restoration", async () => {
    const dependencies = createDocumentTestDependencies();
    const adapter = new InMemoryDocumentAdapter(dependencies.environment);
    const controller = new (await import("../../src/SynCloudOS/Documents")).DocumentController(dependencies);
    controller.registerType(noteType);
    controller.registerAdapter(adapter);
    const document = await controller.newDocument({
      documentId: "read-only-recovery",
      typeId: noteType.id,
      location: { kind: "memory", namespace: "review", key: "read-only" },
    });
    document.update((model) => ({ ...model, body: "retain me" }), { actionName: "Type" });
    vi.spyOn(adapter, "write").mockRejectedValueOnce(new DocumentReadOnlyError());
    await expect(document.save({ reason: "explicit" })).rejects.toBeInstanceOf(DocumentReadOnlyError);

    expect(controller.createRestorationSnapshot().documents[0]?.recovery.kind).not.toBe("none");
    await dependencies.cleanup();
  });

  it("adopts a committed write even when the caller aborts before its response is observed", async () => {
    const dependencies = createDocumentTestDependencies();
    const backing = new InMemoryDocumentAdapter(dependencies.environment);
    const abort = new AbortController();
    const adapter: DocumentStorageAdapter = {
      ...backing,
      id: "abort-after-commit",
      capabilities: backing.capabilities,
      supports: (location) => backing.supports(location),
      read: (location, options) => backing.read(location, options),
      write: async <T,>(request: DocumentWriteRequest<T>) => {
        const record = await backing.write(request);
        abort.abort("after-commit");
        return record;
      },
      remove: (location, version, options) => backing.remove(location, version, options),
      list: (query) => backing.list(query),
      listVersions: (location, options) => backing.listVersions(location, options),
      readVersion: (location, version, options) => backing.readVersion(location, version, options),
    };
    const controller = new (await import("../../src/SynCloudOS/Documents")).DocumentController(dependencies);
    controller.registerType(noteType);
    controller.registerAdapter(adapter);
    const document = await controller.newDocument({
      documentId: "abort-after-commit",
      typeId: noteType.id,
      location: { kind: "memory", namespace: "review", key: "abort-after-commit" },
    });

    await expect(document.save({ reason: "explicit", signal: abort.signal })).resolves.toBeUndefined();
    expect(document.state).toBe("clean");
    expect(document.currentVersion?.sequence).toBe(1);
    await dependencies.cleanup();
  });

  it("reserves requested IDs across concurrent asynchronous opens", async () => {
    const dependencies = createDocumentTestDependencies();
    const adapter = new InMemoryDocumentAdapter(dependencies.environment);
    const controller = new (await import("../../src/SynCloudOS/Documents")).DocumentController(dependencies);
    controller.registerType(noteType);
    controller.registerAdapter(adapter);
    const location = { kind: "memory", namespace: "review", key: "opening" } as const;
    await adapter.write({
      location,
      typeId: noteType.id,
      schemaVersion: noteType.schemaVersion,
      content: noteType.write(noteType.create({ typeId: noteType.id }), { typeId: noteType.id, schemaVersion: 1 }),
      expectedVersion: null,
      idempotencyKey: "seed-opening",
    });
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => { release = resolve; });
    const originalRead = adapter.read.bind(adapter);
    vi.spyOn(adapter, "read").mockImplementation(async (candidate, options) => {
      await blocker;
      return originalRead(candidate, options);
    });

    const opening = controller.openDocument({ documentId: "reserved-id", typeId: noteType.id, location });
    await Promise.resolve();
    await expect(controller.newDocument({ documentId: "reserved-id", typeId: noteType.id }))
      .rejects.toBeInstanceOf(DocumentRequestedIdConflictError);
    release();
    await opening;
    await dependencies.cleanup();
  });

  it("settles an abort against a non-cooperative close reviewer and releases the gate", async () => {
    const dependencies = createDocumentTestDependencies();
    const adapter = new InMemoryDocumentAdapter(dependencies.environment);
    const controller = new (await import("../../src/SynCloudOS/Documents")).DocumentController(dependencies);
    controller.registerType(noteType);
    controller.registerAdapter(adapter);
    const document = await controller.newDocument({ documentId: "abort-review", typeId: noteType.id });
    document.update((model) => ({ ...model, body: "review me" }), { actionName: "Type" });
    let resolveReview!: (decision: "cancel") => void;
    let markReviewStarted!: () => void;
    const reviewStarted = new Promise<void>((resolve) => { markReviewStarted = resolve; });
    controller.registerCloseReviewer({ review: () => new Promise((resolve) => {
      resolveReview = resolve;
      markReviewStarted();
    }) });
    const abort = new AbortController();
    const closing = controller.closeDocument(document.id, "user", abort.signal);
    const observed = closing.then(() => null, (error: unknown) => error);
    await reviewStarted;
    abort.abort("caller-cancelled");
    const error = await observed;
    expect(error).toBeInstanceOf(DocumentAbortError);
    resolveReview("cancel");
    expect(() => document.update((model) => ({ ...model, body: "still editable" }), { actionName: "Type" }))
      .not.toThrow();
    await dependencies.cleanup();
  });

  it("uses the strict one-step migration path when opening records", async () => {
    const dependencies = createDocumentTestDependencies();
    const type: DocumentType<{ readonly value: string }, { readonly schemaVersion: number; readonly value: string }> = {
      id: "com.syncloudos.review-migration",
      displayName: "Review migration",
      schemaVersion: 3,
      extensions: ["reviewmigration"],
      mimeTypes: ["application/vnd.syncloudos.review-migration+json"],
      capabilities: { versions: true, conflicts: true },
      autosave: "disabled",
      create: () => ({ value: "" }),
      read: (value) => ({ value: value.value }),
      write: (model) => ({ schemaVersion: 3, value: model.value }),
      validate: (value): value is { readonly schemaVersion: number; readonly value: string } =>
        Boolean(value) && typeof value === "object" && (value as { schemaVersion?: unknown }).schemaVersion === 3,
      migrations: {
        1: () => ({ schemaVersion: 3, value: "jumped" }),
        2: (value) => value,
      },
    };
    const record: DocumentRecord<{ readonly schemaVersion: number; readonly value: string }> = {
      location: { kind: "memory", namespace: "review", key: "migration" },
      typeId: type.id,
      schemaVersion: 1,
      content: { schemaVersion: 1, value: "old" },
      version: { id: "v1", sequence: 1, savedAt: "2026-08-08T12:00:00.000Z", etag: '"v1"' },
      createdAt: "2026-08-08T12:00:00.000Z",
      updatedAt: "2026-08-08T12:00:00.000Z",
      metadata: {},
    };
    expect(() => ApplicationDocument.open({
      id: "strict-migration",
      type,
      record,
      adapter: new InMemoryDocumentAdapter(dependencies.environment),
      undoManager: dependencies.undo.create({ kind: "document", id: "strict-migration" }),
      recovery: dependencies.recovery,
      persistenceNamespace: dependencies.persistenceNamespace,
      environment: dependencies.environment,
    })).toThrow(DocumentSchemaError);
    await dependencies.cleanup();
  });

  it("rejects MIME ownership collisions", () => {
    const registry = new DocumentTypeRegistry();
    registry.register(noteType);
    expect(() => registry.register({
      ...noteType,
      id: "com.syncloudos.note-collision",
      extensions: ["other-note"],
      mimeTypes: [noteType.mimeTypes[0]!.toUpperCase()],
    })).toThrow(/MIME/i);
  });

  it("rejects non-JSON and cyclic payloads with typed schema errors", async () => {
    const adapter = new InMemoryDocumentAdapter(createTestRuntimeEnvironment());
    const location = { kind: "memory", namespace: "review", key: "payload" } as const;
    await expect(adapter.write({
      location,
      typeId: noteType.id,
      schemaVersion: 1,
      content: new Map([["body", "first"]]),
      expectedVersion: null,
      idempotencyKey: "map-payload",
    })).rejects.toBeInstanceOf(DocumentSchemaError);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    await expect(adapter.write({
      location,
      typeId: noteType.id,
      schemaVersion: 1,
      content: cyclic,
      expectedVersion: null,
      idempotencyKey: "cyclic-payload",
    })).rejects.toBeInstanceOf(DocumentSchemaError);
  });

  it("maps bodyless 409/412 responses to stable explicit conflicts", async () => {
    const transport: DocumentRemoteTransport = { request: vi.fn().mockResolvedValue({ status: 412, headers: {}, body: null }) };
    const adapter = new RemoteDocumentAdapter(transport);
    const location = { kind: "remote", url: "https://documents.example/note" } as const;
    await expect(adapter.write({
      location,
      typeId: noteType.id,
      schemaVersion: 1,
      content: { title: "Local", body: "Preserve" },
      expectedVersion: { id: "v1", sequence: 1, savedAt: "2026-08-08T12:00:00.000Z", etag: '"v1"' },
      idempotencyKey: "bodyless-conflict",
    })).rejects.toMatchObject({ code: "document-version-conflict", currentRecord: null });
  });

  it("strips remote URL fragments from identity and transport while preserving query", async () => {
    const left = { kind: "remote", url: "https://documents.example/note?view=full#one" } as const;
    const right = { kind: "remote", url: "https://documents.example/note?view=full#two" } as const;
    expect(canonicalDocumentLocation(left)).toBe(canonicalDocumentLocation(right));
    const request = vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body: {
        typeId: noteType.id,
        schemaVersion: 1,
        content: { title: "Remote", body: "" },
        version: { id: "v1", sequence: 1, savedAt: "2026-08-08T12:00:00.000Z", etag: '"v1"' },
      },
    });
    await new RemoteDocumentAdapter({ request }).read(left);
    expect(request.mock.calls[0]?.[0].url).toBe("https://documents.example/note?view=full");
  });

  it("rebases sequential offline edits instead of conflicting every queued version", async () => {
    const environment = createTestRuntimeEnvironment();
    const local = new InMemoryDocumentAdapter(environment);
    const remote = new InMemoryDocumentAdapter(environment);
    let online = false;
    const adapter = new SynchronisingDocumentAdapter({ local, remote, online: () => online, environment });
    const location = { kind: "memory", namespace: "review", key: "two-edits" } as const;
    const first = await adapter.write({
      location, typeId: noteType.id, schemaVersion: 1,
      content: { title: "One", body: "" }, expectedVersion: null, idempotencyKey: "offline-one",
    });
    await adapter.write({
      location, typeId: noteType.id, schemaVersion: 1,
      content: { title: "Two", body: "" }, expectedVersion: first.version, idempotencyKey: "offline-two",
    });
    online = true;
    await expect(adapter.flush()).resolves.toEqual({ outcome: "completed", sent: 2, conflicted: 0 });
    expect((await remote.read(location))?.content).toEqual({ title: "Two", body: "" });
    expect((await local.read(location))?.content).toEqual({ title: "Two", body: "" });
  });

  it("supports explicit paired local and remote locations", () => {
    const environment = createTestRuntimeEnvironment();
    const local = new InMemoryDocumentAdapter(environment);
    const remote = new RemoteDocumentAdapter({ request: vi.fn() });
    const localLocation = { kind: "memory", namespace: "review", key: "paired" } as const;
    const remoteLocation = { kind: "remote", url: "https://documents.example/paired" } as const;
    const adapter = new SynchronisingDocumentAdapter({
      local,
      remote,
      online: () => false,
      environment,
      mapLocation: (location) => canonicalDocumentLocation(location) === canonicalDocumentLocation(localLocation)
        ? { local: localLocation, remote: remoteLocation }
        : null,
    });
    expect(adapter.supports(localLocation)).toBe(true);
  });

  it("rejects bounded restoration input before large allocation", () => {
    const documents = Array.from({ length: 1_001 }, (_, index) => ({
      documentId: `document-${index}`,
      typeId: noteType.id,
      typeSchemaVersion: 1,
      location: null,
      baseVersion: null,
      recovery: { kind: "none" as const },
      windowAssociations: [],
    }));
    expect(() => validateDocumentRestorationSnapshot({
      schemaVersion: 1,
      activeDocumentId: null,
      documents,
      recentLocations: [],
      capturedAt: "2026-08-08T12:00:00.000Z",
    })).toThrow(DocumentRecoveryCorruptError);
  });

  it("preserves an unsupported future persistence snapshot byte-for-byte", () => {
    const storage = memoryStorage();
    const persistence = createPersistence({
      runtimeId: "runtime:future-document-store" as never,
      storage,
      namespace: "tests:future-document-store",
    });
    const future = { schemaVersion: 3, savedAt: "2026-08-08T12:00:00.000Z", futureData: ["keep"] };
    persistence.setPreference("documentStore:v1", future);
    const before = storage.getItem("tests:future-document-store:documentStore:v1");

    expect(() => createPersistenceDocumentStore({ persistence })).toThrow(/schema/i);
    expect(storage.getItem("tests:future-document-store:documentStore:v1")).toBe(before);
  });

  it("keeps synchronising documents dirty until the remote acknowledgement is adopted", async () => {
    const dependencies = createDocumentTestDependencies();
    const local = new InMemoryDocumentAdapter(dependencies.environment);
    const remote = new InMemoryDocumentAdapter(dependencies.environment);
    let online = false;
    const adapter = new SynchronisingDocumentAdapter({ local, remote, online: () => online, environment: dependencies.environment });
    const controller = new (await import("../../src/SynCloudOS/Documents")).DocumentController(dependencies);
    controller.registerType(noteType);
    controller.registerAdapter(adapter);
    const document = await controller.newDocument({
      documentId: "pending-remote-ack",
      typeId: noteType.id,
      location: { kind: "memory", namespace: "review", key: "pending-remote-ack" },
    });
    document.update((model) => ({ ...model, body: "pending" }), { actionName: "Type" });

    await document.save({ reason: "explicit" });
    expect(document.state).toBe("dirty");
    expect(document.hasUnsavedChanges).toBe(true);

    online = true;
    await adapter.flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.state).toBe("clean");
    expect(document.hasUnsavedChanges).toBe(false);
    expect(document.currentVersion?.sequence).toBe(1);
    await dependencies.cleanup();
  });

  it("propagates a remote synchronisation conflict into the live document protocol", async () => {
    const dependencies = createDocumentTestDependencies();
    const local = new InMemoryDocumentAdapter(dependencies.environment);
    const remote = new InMemoryDocumentAdapter(dependencies.environment);
    const location = { kind: "memory", namespace: "review", key: "remote-conflict" } as const;
    await remote.write({
      location,
      typeId: noteType.id,
      schemaVersion: 1,
      content: { title: "Remote", body: "authoritative" },
      expectedVersion: null,
      idempotencyKey: "remote-conflict-seed",
    });
    let online = false;
    const adapter = new SynchronisingDocumentAdapter({ local, remote, online: () => online, environment: dependencies.environment });
    const controller = new (await import("../../src/SynCloudOS/Documents")).DocumentController(dependencies);
    controller.registerType(noteType);
    controller.registerAdapter(adapter);
    const document = await controller.newDocument({ documentId: "remote-conflict", typeId: noteType.id, location });
    document.update((model) => ({ ...model, body: "local" }), { actionName: "Type" });
    await document.save({ reason: "explicit" });

    online = true;
    await adapter.flush();
    expect(document.state).toBe("conflicted");
    expect(document.conflict?.localModel).toEqual(expect.objectContaining({ body: "local" }));
    expect(document.conflict?.remote).toEqual(expect.objectContaining({ content: expect.objectContaining({ body: "authoritative" }) }));
    await dependencies.cleanup();
  });

  it("preserves runtime kind registration that races a conditional persistence replacement", async () => {
    const storage = memoryStorage();
    const persistence = createPersistence({
      runtimeId: "runtime:kind-race" as never,
      storage,
      namespace: "tests:kind-race",
    });
    let store!: ReturnType<typeof createPersistenceDocumentStore>;
    let registered = false;
    store = createPersistenceDocumentStore({
      persistence,
      conditionalWriteLock: { request: async (_name, _options, callback) => callback() },
      authorise: () => {
        if (registered) return;
        registered = true;
        store.registerKind({ kind: "review-kind", displayName: "Review kind", version: 1 });
      },
    });
    await store.saveDraft({
      id: "kind-race-document",
      kind: "review-kind",
      title: "Race",
      body: {},
      publishState: "draft",
    }, undefined, { ifMatch: null });
    expect(store.getKind("review-kind")?.displayName).toBe("Review kind");
    expect(createPersistenceDocumentStore({ persistence }).getKind("review-kind")?.displayName).toBe("Review kind");
  });

  it("rejects non-JSON DocumentStore idempotency payloads with a typed bounded error", async () => {
    const store = createPersistenceDocumentStore();
    await expect(store.saveDraft({
      id: "map-document",
      kind: "review-map",
      body: new Map([["body", "first"]]),
      publishState: "draft",
    }, undefined, { idempotencyKey: "map-key" })).rejects.toBeInstanceOf(SynCloudOSDocumentStorePayloadError);
  });

  it("disposes every registered adapter once even when an earlier adapter fails", async () => {
    const dependencies = createDocumentTestDependencies();
    const controller = new (await import("../../src/SynCloudOS/Documents")).DocumentController(dependencies);
    const first = new InMemoryDocumentAdapter(dependencies.environment) as InMemoryDocumentAdapter & { dispose: ReturnType<typeof vi.fn> };
    const second = new InMemoryDocumentAdapter(dependencies.environment) as InMemoryDocumentAdapter & { dispose: ReturnType<typeof vi.fn> };
    Object.defineProperty(first, "id", { value: "dispose-first" });
    Object.defineProperty(second, "id", { value: "dispose-second" });
    first.dispose = vi.fn(() => { throw new Error("first disposal failed"); });
    second.dispose = vi.fn();
    controller.registerAdapter(first);
    controller.registerAdapter(second);
    const runtimeAbort = new AbortController();
    const preparationAbort = new AbortController();
    const prepared = await controller.prepareRuntimeDisposal({
      reason: "test",
      runtimeSignal: runtimeAbort.signal,
      preparationSignal: preparationAbort.signal,
    });
    expect(prepared.status).toBe("ready");
    runtimeAbort.abort("commit");
    const cleanupError = await (prepared.status === "ready" ? prepared.commit() : Promise.resolve())
      .then(() => null, (error: unknown) => error);
    expect(cleanupError).toBeInstanceOf(AggregateError);
    expect((cleanupError as AggregateError).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: "first disposal failed" }),
    ]));
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.dispose).toHaveBeenCalledTimes(1);
    await dependencies.cleanup();
  });
});
