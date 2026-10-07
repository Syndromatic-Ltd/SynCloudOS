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
  DocumentAbortError,
  DocumentController,
  DocumentDeletedError,
  DocumentRecoveryCorruptError,
  DocumentSchemaError,
  DocumentUnavailableError,
  DocumentVersionConflictError,
  InMemoryDocumentAdapter,
  InMemoryDocumentRecoveryStore,
  RemoteDocumentAdapter,
  SynchronisingDocumentAdapter,
  canonicalDocumentJson,
  validateDocumentRestorationSnapshot,
  type DocumentLocation,
  type DocumentRecord,
  type DocumentStorageAdapter,
  type DocumentWriteRequest,
  type PersistedDocumentSyncQueueItem,
} from "../../src/SynCloudOS/Documents";
import {
  SynCloudOSDocumentStorePayloadError,
  createPersistenceDocumentStore,
} from "../../src/SynCloudOS/DocumentStore";
import { createPersistence } from "../../src/SynCloudOS/Persistence/Persistence";
import { createDocumentTestDependencies } from "../fixtures/documentTestDependencies";
import { noteType } from "../fixtures/noteDocumentType";
import { createTestRuntimeEnvironment } from "./helpers";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

function controllerWith(adapter: DocumentStorageAdapter) {
  const dependencies = createDocumentTestDependencies();
  const controller = new DocumentController(dependencies);
  controller.registerType(noteType);
  controller.registerAdapter(adapter);
  return { controller, dependencies };
}

describe("document persistence and acknowledgement rebasing", () => {
  it("fails closed on a partially corrupt canonical persistence snapshot without rewriting its bytes", () => {
    const storage = memoryStorage();
    const persistence = createPersistence({
      runtimeId: "runtime:p05-corrupt-v2" as never,
      storage,
      namespace: "tests:p05-corrupt-v2",
    });
    persistence.setPreference("documentStore:v1", {
      schemaVersion: 2,
      savedAt: "2026-08-09T12:00:00.000Z",
      kinds: [{ kind: "valid", version: 1, displayName: "Valid" }, { kind: 42 }],
      documents: [],
      revisions: [],
      draftVersions: [],
      idempotentDraftWrites: [],
    });
    const storageKey = "tests:p05-corrupt-v2:documentStore:v1";
    const before = storage.getItem(storageKey);

    expect(() => createPersistenceDocumentStore({ persistence }))
      .toThrow(SynCloudOSDocumentStorePayloadError);
    expect(storage.getItem(storageKey)).toBe(before);
  });

  it("updates the completed A idempotency result when ACK A rebases a later B intent", async () => {
    const environment = createTestRuntimeEnvironment();
    const local = new InMemoryDocumentAdapter(environment);
    const remoteBacking = new InMemoryDocumentAdapter(environment);
    const acknowledgements: DocumentRecord<unknown>[] = [];
    const remote: DocumentStorageAdapter = {
      id: "intermediate-ack-remote",
      capabilities: remoteBacking.capabilities,
      supports: (location) => remoteBacking.supports(location),
      read: (location, options) => remoteBacking.read(location, options),
      write: async (request) => {
        const record = await remoteBacking.write(request);
        acknowledgements.push(record);
        return record;
      },
      remove: (location, version, options) => remoteBacking.remove(location, version, options),
      list: (query) => remoteBacking.list(query),
      listVersions: (location, options) => remoteBacking.listVersions(location, options),
      readVersion: (location, version, options) => remoteBacking.readVersion(location, version, options),
    };
    let online = false;
    const sync = new SynchronisingDocumentAdapter({ local, remote, online: () => online, environment });
    const location = { kind: "memory", namespace: "ack-rebase", key: "intermediate-ack" } as const;
    const requestA = {
      location,
      typeId: noteType.id,
      schemaVersion: 1,
      content: { title: "Order", body: "A" },
      expectedVersion: null,
      idempotencyKey: "intermediate-a",
    } as const;
    const localA = await sync.write(requestA);
    await sync.write({
      ...requestA,
      content: { title: "Order", body: "B" },
      expectedVersion: localA.version,
      idempotencyKey: "intermediate-b",
    });
    online = true;
    await sync.flush();

    const retryA = await sync.write(requestA);
    expect(retryA.version).toEqual(acknowledgements[0]?.version);
    expect(sync.queueSnapshot()).toHaveLength(0);
    expect((await remoteBacking.read(location))?.content).toEqual(expect.objectContaining({ body: "B" }));
  });

  it("clears the acknowledged base when recreating a terminal deletion so discard restores deletion", async () => {
    const environment = createTestRuntimeEnvironment();
    const local = new InMemoryDocumentAdapter(environment);
    const remoteBacking = new InMemoryDocumentAdapter(environment);
    const remote: DocumentStorageAdapter = {
      id: "terminal-recreate-remote",
      capabilities: remoteBacking.capabilities,
      supports: (location) => remoteBacking.supports(location),
      read: (location, options) => remoteBacking.read(location, options),
      write: async <T,>(request: DocumentWriteRequest<T>) => {
        if (request.expectedVersion && !await remoteBacking.read(request.location, { signal: request.signal })) {
          throw new DocumentDeletedError();
        }
        return remoteBacking.write(request);
      },
      remove: (location, version, options) => remoteBacking.remove(location, version, options),
      list: (query) => remoteBacking.list(query),
      listVersions: (location, options) => remoteBacking.listVersions(location, options),
      readVersion: (location, version, options) => remoteBacking.readVersion(location, version, options),
    };
    let online = true;
    const sync = new SynchronisingDocumentAdapter({ local, remote, online: () => online, environment });
    const { controller, dependencies } = controllerWith(sync);
    controller.registerCloseReviewer({ review: async () => "discard" });
    const location = { kind: "memory", namespace: "ack-rebase", key: "recreate-discard" } as const;
    const document = await controller.newDocument({ documentId: "recreate-discard", typeId: noteType.id, location });
    document.update((model) => ({ ...model, body: "baseline" }), { actionName: "Type" });
    await document.save({ reason: "explicit" });
    await sync.flush();
    const baseline = (await remoteBacking.read(location))!;
    await remoteBacking.remove(location, baseline.version);

    online = false;
    document.update((model) => ({ ...model, body: "deleted edit" }), { actionName: "Type" });
    await document.save({ reason: "explicit" });
    online = true;
    await sync.flush();
    expect(document.conflict?.remoteState).toBe("deleted");
    await document.resolveConflict({ kind: "recreate" });
    expect(sync.queueSnapshot()).toHaveLength(1);
    await expect(controller.closeDocument(document.id, "user")).resolves.toMatchObject({ outcome: "closed" });
    expect(await local.read(location)).toBeNull();
    expect(await remoteBacking.read(location)).toBeNull();
    expect(sync.queueSnapshot()).toHaveLength(0);
    await dependencies.cleanup();
  });

  it("releases a cancelled runtime-disposal gate immediately despite a never-settling save", async () => {
    const backing = new InMemoryDocumentAdapter(createTestRuntimeEnvironment());
    const writeStarted = deferred();
    const blocked: DocumentStorageAdapter = {
      id: "blocked-save",
      capabilities: backing.capabilities,
      supports: (location) => backing.supports(location),
      read: (location, options) => backing.read(location, options),
      write: async () => { writeStarted.resolve(); return new Promise<never>(() => undefined); },
      remove: (location, version, options) => backing.remove(location, version, options),
      list: (query) => backing.list(query),
      listVersions: (location, options) => backing.listVersions(location, options),
      readVersion: (location, version, options) => backing.readVersion(location, version, options),
    };
    const { controller, dependencies } = controllerWith(blocked);
    const location = { kind: "memory", namespace: "ack-rebase", key: "cancel-gate" } as const;
    const document = await controller.newDocument({ documentId: "cancel-gate", typeId: noteType.id, location });
    document.update((model) => ({ ...model, body: "saving" }), { actionName: "Type" });
    void document.save({ reason: "explicit" }).catch(() => undefined);
    await writeStarted.promise;
    const preparationAbort = new AbortController();
    const preparing = controller.prepareRuntimeDisposal({
      runtimeId: dependencies.runtimeId,
      reason: "test-cancel",
      runtimeSignal: new AbortController().signal,
      preparationSignal: preparationAbort.signal,
      deadlineAt: null,
      operations: {
        run: async ({ execute }) => execute(preparationAbort.signal),
        drain: async () => ({ status: "drained" as const }),
      },
    });
    preparationAbort.abort("cancel");
    await expect(preparing).resolves.toMatchObject({ status: "cancelled" });
    expect(() => document.update((model) => ({ ...model, body: "admitted" }), { actionName: "Type" }))
      .not.toThrow();
    await dependencies.cleanup();
  });

  it("does not let a retired runtime-disposal gate cancel recovery for a newly admitted edit", async () => {
    const environment = createTestRuntimeEnvironment();
    const recovery = new InMemoryDocumentRecoveryStore();
    const backing = new InMemoryDocumentAdapter(environment);
    const writeStarted = deferred();
    const releaseWrite = deferred();
    let holdFirstWrite = true;
    const blocked: DocumentStorageAdapter = {
      id: "retired-gate-save",
      capabilities: backing.capabilities,
      supports: (location) => backing.supports(location),
      read: (location, options) => backing.read(location, options),
      write: async (request) => {
        if (holdFirstWrite) {
          holdFirstWrite = false;
          writeStarted.resolve();
          await releaseWrite.promise;
        }
        return backing.write({ ...request, signal: undefined });
      },
      remove: (location, version, options) => backing.remove(location, version, options),
      list: (query) => backing.list(query),
      listVersions: (location, options) => backing.listVersions(location, options),
      readVersion: (location, version, options) => backing.readVersion(location, version, options),
    };
    const dependencies = createDocumentTestDependencies({ environment, recovery });
    const controller = new DocumentController(dependencies);
    controller.registerType(noteType);
    controller.registerAdapter(blocked);
    const location = { kind: "memory", namespace: "ack-rebase", key: "retired-gate-recovery" } as const;
    const document = await controller.newDocument({ documentId: "retired-gate-recovery", typeId: noteType.id, location });
    document.update((model) => ({ ...model, body: "held save" }), { actionName: "Type" });
    const saving = document.save({ reason: "explicit" });
    await writeStarted.promise;

    const preparationAbort = new AbortController();
    const preparing = controller.prepareRuntimeDisposal({
      runtimeId: dependencies.runtimeId,
      reason: "retired-gate-recovery",
      runtimeSignal: new AbortController().signal,
      preparationSignal: preparationAbort.signal,
      deadlineAt: null,
      operations: {
        run: async ({ execute }) => execute(preparationAbort.signal),
        drain: async () => ({ status: "drained" as const }),
      },
    });
    preparationAbort.abort("cancel-runtime-disposal");
    await expect(preparing).resolves.toMatchObject({ status: "cancelled" });
    document.update((model) => ({ ...model, body: "admitted after cancellation" }), { actionName: "Type" });

    releaseWrite.resolve();
    await saving.catch(() => undefined);
    await new Promise<void>((resolve) => environment.setTimeout(resolve, 300));

    expect(await backing.read(location)).toBeNull();
    await expect(recovery.read(JSON.stringify(["tests:documents", document.id]))).resolves.toMatchObject({
      serializedContent: expect.objectContaining({ body: "admitted after cancellation" }),
    });
    await dependencies.cleanup();
  });

  it("uses internal cleanup authority when enqueue fails after the caller aborts", async () => {
    const environment = createTestRuntimeEnvironment();
    const controller = new AbortController();
    const local = Object.assign(new InMemoryDocumentAdapter(environment), {
      async readSynchronisationQueue() { return [] as PersistedDocumentSyncQueueItem[]; },
      async persistSynchronisationQueueItem() {
        controller.abort("caller-aborted-during-enqueue");
        throw new Error("enqueue failed after abort");
      },
      async removeSynchronisationQueueItem() { /* no durable intent */ },
    });
    const sync = new SynchronisingDocumentAdapter({
      local,
      remote: new InMemoryDocumentAdapter(environment),
      online: () => false,
      environment,
    });
    const request = {
      location: { kind: "memory", namespace: "ack-rebase", key: "aborted-enqueue" } as const,
      typeId: noteType.id,
      schemaVersion: 1,
      content: { title: "Abort", body: "cleanup" },
      expectedVersion: null,
      idempotencyKey: "aborted-enqueue",
      signal: controller.signal,
    };
    await expect(sync.write(request)).rejects.toBeInstanceOf(DocumentAbortError);
    await Promise.resolve();
    expect(await local.read(request.location)).toBeNull();
    expect(await local.listVersions(request.location)).toEqual([]);
    await expect(local.write({ ...request, signal: undefined })).resolves.toMatchObject({ content: request.content });
  });

  it("rejects non-enumerable array indices and accessor envelopes without executing getters", async () => {
    const nonEnumerable = ["body"];
    Object.defineProperty(nonEnumerable, "0", { value: "body", enumerable: false });
    expect(() => canonicalDocumentJson(nonEnumerable, noteType.id)).toThrow(DocumentSchemaError);

    const transport = { request: vi.fn() };
    const remote = new RemoteDocumentAdapter(transport);
    const envelopeGetter = vi.fn(() => null);
    const request = Object.defineProperty({
      location: { kind: "remote", url: "https://documents.example/envelope" },
      typeId: noteType.id,
      schemaVersion: 1,
      content: { title: "Envelope", body: "safe" },
      idempotencyKey: "accessor-envelope",
    }, "expectedVersion", { enumerable: true, get: envelopeGetter });
    await expect(remote.write(request as DocumentWriteRequest<unknown>)).rejects.toBeInstanceOf(DocumentSchemaError);
    expect(envelopeGetter).not.toHaveBeenCalled();
    expect(transport.request).not.toHaveBeenCalled();

    const etagGetter = vi.fn(() => "etag");
    const version = Object.defineProperty({
      id: "version",
      sequence: 1,
      savedAt: "2026-08-09T12:00:00.000Z",
    }, "etag", { enumerable: true, get: etagGetter });
    await expect(remote.write({
      location: { kind: "remote", url: "https://documents.example/version" },
      typeId: noteType.id,
      schemaVersion: 1,
      content: { title: "Version", body: "safe" },
      expectedVersion: version as never,
      idempotencyKey: "accessor-version",
    })).rejects.toBeInstanceOf(DocumentSchemaError);
    expect(etagGetter).not.toHaveBeenCalled();
    expect(transport.request).not.toHaveBeenCalled();

    const restorationGetter = vi.fn(() => 1);
    const restoration = Object.defineProperty({}, "schemaVersion", {
      enumerable: true,
      get: restorationGetter,
    });
    expect(() => validateDocumentRestorationSnapshot(restoration)).toThrow(DocumentRecoveryCorruptError);
    expect(restorationGetter).not.toHaveBeenCalled();
  });

  it("uses one immutable remote location across pending read, readVersion and remove-conflict operations", async () => {
    const version = {
      id: "remote-location-version",
      sequence: 1,
      savedAt: "2026-08-09T13:00:00.000Z",
      etag: "\"remote-location-version\"",
    } as const;
    const responseBody = {
      typeId: noteType.id,
      schemaVersion: 1,
      content: { title: "Remote", body: "canonical" },
      version,
      createdAt: version.savedAt,
      updatedAt: version.savedAt,
      metadata: {},
    };
    const getterReads: number[] = [];

    for (const operation of ["read", "readVersion", "removeConflict"] as const) {
      const response = deferred<{ status: number; headers: Record<string, string>; body: unknown }>();
      const transport = { request: vi.fn(() => response.promise) };
      const adapter = new RemoteDocumentAdapter(transport);
      const originalUrl = `https://documents.example.test/${operation}#caller-fragment`;
      const location: DocumentLocation = { kind: "remote", url: originalUrl };
      let reads = 0;
      const pending = operation === "read"
        ? adapter.read(location)
        : operation === "readVersion"
          ? adapter.readVersion(location, version)
          : adapter.remove(location, version);
      expect(transport.request).toHaveBeenCalledTimes(1);
      Object.defineProperty(location, "url", {
        configurable: true,
        enumerable: true,
        get: () => {
          reads += 1;
          return "https://attacker.example.test/accessor";
        },
      });
      response.resolve({
        status: operation === "removeConflict" ? 409 : 200,
        headers: {},
        body: responseBody,
      });
      if (operation === "removeConflict") {
        await expect(pending).rejects.toBeInstanceOf(DocumentVersionConflictError);
      } else {
        await expect(pending).resolves.toMatchObject({
          location: { kind: "remote", url: originalUrl },
        });
      }
      getterReads.push(reads);
    }

    expect(getterReads).toEqual([0, 0, 0]);
  });

  it("bounds controller cleanup with injected timers and continues after a never-settling child", async () => {
    const baseEnvironment = createTestRuntimeEnvironment();
    const scheduled: Array<() => void> = [];
    const environment = {
      ...baseEnvironment,
      setTimeout: vi.fn((callback: () => void) => {
        scheduled.push(callback);
        return callback as unknown as ReturnType<typeof setTimeout>;
      }),
      clearTimeout: vi.fn(),
    };
    const dependencies = createDocumentTestDependencies({ environment });
    const controller = new DocumentController(dependencies);
    const first = Object.assign(new InMemoryDocumentAdapter(environment), {
      dispose: vi.fn(() => new Promise<void>(() => undefined)),
    });
    Object.defineProperty(first, "id", { value: "never-disposes" });
    const second = Object.assign(new InMemoryDocumentAdapter(environment), { dispose: vi.fn() });
    Object.defineProperty(second, "id", { value: "still-disposes" });
    controller.registerAdapter(first);
    controller.registerAdapter(second);
    const runtimeAbort = new AbortController();
    const preparation = await controller.prepareRuntimeDisposal({
      runtimeId: dependencies.runtimeId,
      reason: "bounded-cleanup",
      runtimeSignal: runtimeAbort.signal,
      preparationSignal: new AbortController().signal,
      deadlineAt: environment.now() + 25,
      operations: {
        run: async ({ execute }) => execute(new AbortController().signal),
        drain: async () => ({ status: "drained" as const }),
      },
    });
    expect(preparation.status).toBe("ready");
    runtimeAbort.abort("commit");
    const committing = preparation.status === "ready"
      ? preparation.commit().then(() => null, (error: unknown) => error)
      : Promise.resolve(null);
    await Promise.resolve();
    expect(scheduled).not.toHaveLength(0);
    scheduled.shift()?.();
    const error = await committing;
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringMatching(/timed out/i) }),
    ]));
    expect(second.dispose).toHaveBeenCalledOnce();
    await dependencies.cleanup();
  });

  it("keeps synchronising watch capability and queue inspection consistent with the disposal fence", async () => {
    const environment = createTestRuntimeEnvironment();
    const backing = new InMemoryDocumentAdapter(environment);
    const local: DocumentStorageAdapter = {
      id: "declared-watch-without-method",
      capabilities: backing.capabilities,
      supports: (location) => backing.supports(location),
      read: (location, options) => backing.read(location, options),
      write: (request) => backing.write(request),
      remove: (location, version, options) => backing.remove(location, version, options),
      list: (query) => backing.list(query),
      listVersions: (location, options) => backing.listVersions(location, options),
      readVersion: (location, version, options) => backing.readVersion(location, version, options),
    };
    const sync = new SynchronisingDocumentAdapter({
      local,
      remote: new InMemoryDocumentAdapter(environment),
      online: () => true,
      environment,
    });
    expect(sync.capabilities.watch).toBe(false);
    expect(sync.watch).toBeUndefined();
    await sync.dispose();
    expect(() => sync.queueSnapshot()).toThrow(DocumentUnavailableError);
  });

  it("records a synchronising cleanup timeout and a later child rejection deterministically", async () => {
    const base = createTestRuntimeEnvironment();
    const scheduled: Array<() => void> = [];
    const environment = {
      ...base,
      setTimeout: (callback: () => void) => {
        scheduled.push(callback);
        return callback as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeout: vi.fn(),
    };
    const late = deferred<void>();
    const local = Object.assign(new InMemoryDocumentAdapter(environment), {
      dispose: vi.fn(() => late.promise),
    });
    const sync = new SynchronisingDocumentAdapter({
      local,
      remote: new InMemoryDocumentAdapter(environment),
      online: () => true,
      environment,
    });
    const disposing = sync.dispose().then(() => null, (error: unknown) => error);
    for (let turn = 0; turn < 5 && scheduled.length === 0; turn += 1) await Promise.resolve();
    scheduled.shift()?.();
    const aggregate = await disposing;
    expect(aggregate).toBeInstanceOf(AggregateError);
    const timeout = (aggregate as AggregateError).errors[0] as { lateErrors?: unknown[] };
    late.reject(new Error("late child rejection"));
    await Promise.resolve();
    expect(timeout.lateErrors).toEqual([
      expect.objectContaining({ message: "late child rejection" }),
    ]);
  });
});
