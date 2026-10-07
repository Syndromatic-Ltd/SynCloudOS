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
  DocumentController,
  DocumentDeletedError,
  DocumentSchemaError,
  DocumentStoreDocumentAdapter,
  DocumentTypeRegistry,
  DocumentUnavailableError,
  IndexedDBDocumentAdapter,
  InMemoryDocumentAdapter,
  RemoteDocumentAdapter,
  SynchronisingDocumentAdapter,
  type DocumentLocation,
  type DocumentReadOptions,
  type DocumentRecord,
  type DocumentRemoteTransport,
  type DocumentStorageAdapter,
  type DocumentVersion,
  type DocumentWriteRequest,
  type PersistedDocumentSyncQueueItem,
} from "../../src/SynCloudOS/Documents";
import {
  SynCloudOSDocumentStorePayloadError,
  createInMemoryDocumentStore,
  type SynCloudOSDocumentKindMetadata,
} from "../../src/SynCloudOS/DocumentStore";
import { createDocumentTestDependencies } from "../fixtures/documentTestDependencies";
import { noteType } from "../fixtures/noteDocumentType";
import { createTestRuntimeEnvironment } from "./helpers";

function controllerWith(
  adapter: DocumentStorageAdapter,
  dependencies = createDocumentTestDependencies(),
) {
  const controller = new DocumentController(dependencies);
  controller.registerType(noteType);
  controller.registerAdapter(adapter);
  return { controller, dependencies };
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function durableLocal(environment: ReturnType<typeof createTestRuntimeEnvironment>) {
  const local = new InMemoryDocumentAdapter(environment);
  const adoptLocalRecord = local.adoptSynchronisedRecord.bind(local);
  const queue = new Map<string, PersistedDocumentSyncQueueItem>();
  const intentWrites = new Map<string, Promise<DocumentRecord<unknown>>>();
  let order = 0;

  const adapter = Object.assign(local, {
    atomicSynchronisationQueueAdoption: true,
    async readSynchronisationQueue() {
      return [...queue.values()].map((item) => structuredClone(item));
    },
    async persistSynchronisationQueueItem(item: PersistedDocumentSyncQueueItem) {
      queue.set(item.id, structuredClone(item));
    },
    async removeSynchronisationQueueItem(id: string) {
      queue.delete(id);
    },
    async writeWithSynchronisationIntent<T>(
      request: DocumentWriteRequest<T>,
      createItem: (record: DocumentRecord<T>) => PersistedDocumentSyncQueueItem,
    ) {
      const active = intentWrites.get(request.idempotencyKey);
      if (active) return structuredClone(await active) as DocumentRecord<T>;
      const operation = (async () => {
        const record = await local.write(request);
        if (![...queue.values()].some(({ idempotencyKey }) => idempotencyKey === request.idempotencyKey)) {
          const item = createItem(record);
          queue.set(item.id, structuredClone({ ...item, order: ++order }));
        }
        return record as DocumentRecord<unknown>;
      })();
      intentWrites.set(request.idempotencyKey, operation);
      try {
        return structuredClone(await operation) as DocumentRecord<T>;
      } finally {
        intentWrites.delete(request.idempotencyKey);
      }
    },
    async claimSynchronisationQueueItem(
      id: string,
      ownerId: string,
      expectedGeneration: number,
      now: number,
      leaseMs: number,
    ) {
      const current = queue.get(id);
      if (!current || (current.leaseGeneration ?? 0) !== expectedGeneration) return null;
      if (current.leaseOwnerId && current.leaseOwnerId !== ownerId &&
          current.leaseExpiresAt && Date.parse(current.leaseExpiresAt) > now) return null;
      const claimed = {
        ...current,
        state: "sending" as const,
        attemptCount: current.attemptCount + 1,
        nextAttemptAt: null,
        leaseOwnerId: ownerId,
        leaseExpiresAt: new Date(now + leaseMs).toISOString(),
        leaseGeneration: expectedGeneration + 1,
      };
      queue.set(id, structuredClone(claimed));
      return structuredClone(claimed);
    },
    async renewSynchronisationQueueLease(
      id: string,
      ownerId: string,
      generation: number,
      now: number,
      leaseMs: number,
    ) {
      const current = queue.get(id);
      if (!current || current.leaseOwnerId !== ownerId || current.leaseGeneration !== generation) return false;
      queue.set(id, { ...current, leaseExpiresAt: new Date(now + leaseMs).toISOString() });
      return true;
    },
    async updateClaimedSynchronisationQueueItem(
      item: PersistedDocumentSyncQueueItem,
      ownerId: string,
      generation: number,
    ) {
      const current = queue.get(item.id);
      if (!current || current.leaseOwnerId !== ownerId || current.leaseGeneration !== generation) return false;
      queue.set(item.id, structuredClone(item));
      return true;
    },
    async removeClaimedSynchronisationQueueItem(id: string, ownerId: string, generation: number) {
      const current = queue.get(id);
      if (!current || current.leaseOwnerId !== ownerId || current.leaseGeneration !== generation) return false;
      queue.delete(id);
      return true;
    },
    async rebaseAndRemoveClaimedSynchronisationQueueItem(
      completedId: string,
      ownerId: string,
      generation: number,
      nextId: string,
      expectedVersion: DocumentVersion,
    ) {
      const completed = queue.get(completedId);
      const next = queue.get(nextId);
      if (!completed || !next || completed.leaseOwnerId !== ownerId ||
          completed.leaseGeneration !== generation) return null;
      const rebased = {
        ...next,
        request: { ...next.request, expectedVersion: structuredClone(expectedVersion) },
      };
      queue.set(nextId, structuredClone(rebased));
      queue.delete(completedId);
      return structuredClone(rebased);
    },
    async adoptSynchronisedRecord<T>(
      record: DocumentRecord<T>,
      expectedLocalVersion: DocumentVersion,
      options: DocumentReadOptions & {
        readonly removeQueueItemId?: string;
        readonly synchronisationQueueLease?: { readonly ownerId: string; readonly generation: number };
      } = {},
    ) {
      if (options.removeQueueItemId && options.synchronisationQueueLease) {
        const current = queue.get(options.removeQueueItemId);
        if (!current || current.leaseOwnerId !== options.synchronisationQueueLease.ownerId ||
            current.leaseGeneration !== options.synchronisationQueueLease.generation) {
          throw new DocumentUnavailableError("stale queue lease", { retryable: true });
        }
      }
      await adoptLocalRecord(record, expectedLocalVersion, options);
      if (options.removeQueueItemId) queue.delete(options.removeQueueItemId);
    },
    async releaseSynchronisationQueueLeases(ownerId: string) {
      for (const [id, item] of queue) {
        if (item.leaseOwnerId !== ownerId) continue;
        queue.set(id, {
          ...item,
          state: item.state === "sending" ? "queued" : item.state,
          leaseOwnerId: null,
          leaseExpiresAt: null,
          leaseGeneration: (item.leaseGeneration ?? 0) + 1,
        });
      }
    },
  });

  return { adapter, local, queue };
}

describe("durable synchronisation regressions", () => {
  it("threads a reviewed runtime-disposal discard into the durable synchronisation commit", async () => {
    const dependencies = createDocumentTestDependencies();
    const local = new InMemoryDocumentAdapter(dependencies.environment);
    const remote = new InMemoryDocumentAdapter(dependencies.environment);
    let online = false;
    const sync = new SynchronisingDocumentAdapter({ local, remote, online: () => online, environment: dependencies.environment });
    const { controller } = controllerWith(sync, dependencies);
    controller.registerCloseReviewer({ review: async () => "discard" });
    const location = { kind: "memory", namespace: "p05-sync", key: "runtime-discard" } as const;
    const document = await controller.newDocument({ documentId: "runtime-discard", typeId: noteType.id, location });
    document.update((model) => ({ ...model, body: "discard at runtime teardown" }), { actionName: "Type" });
    await document.save({ reason: "explicit" });
    expect(sync.queueSnapshot()).toHaveLength(1);

    const runtimeAbort = new AbortController();
    const preparationAbort = new AbortController();
    const preparation = await controller.prepareRuntimeDisposal({
      reason: "test",
      runtimeSignal: runtimeAbort.signal,
      preparationSignal: preparationAbort.signal,
    });
    expect(preparation.status).toBe("ready");
    runtimeAbort.abort("commit");
    if (preparation.status === "ready") await preparation.commit();

    expect(() => sync.queueSnapshot()).toThrow(DocumentUnavailableError);
    expect(await local.read(location)).toBeNull();
    online = true;
    await expect(sync.flush()).rejects.toBeInstanceOf(DocumentUnavailableError);
    expect(await remote.read(location)).toBeNull();
    await dependencies.cleanup();
  });

  it("preserves the last acknowledged record when an ordinary close discards only in-memory edits", async () => {
    const dependencies = createDocumentTestDependencies();
    const local = new InMemoryDocumentAdapter(dependencies.environment);
    const remote = new InMemoryDocumentAdapter(dependencies.environment);
    const sync = new SynchronisingDocumentAdapter({ local, remote, online: () => true, environment: dependencies.environment });
    const { controller } = controllerWith(sync, dependencies);
    controller.registerCloseReviewer({ review: async () => "discard" });
    const location = { kind: "memory", namespace: "p05-sync", key: "saved-before-edit" } as const;
    const document = await controller.newDocument({ documentId: "saved-before-edit", typeId: noteType.id, location });
    document.update((model) => ({ ...model, body: "acknowledged" }), { actionName: "Type" });
    await document.save({ reason: "explicit" });
    await sync.flush();
    document.update((model) => ({ ...model, body: "discard this edit" }), { actionName: "Type" });

    await expect(controller.closeDocument(document.id, "user")).resolves.toMatchObject({ outcome: "closed" });
    expect((await local.read(location))?.content).toEqual(expect.objectContaining({ body: "acknowledged" }));
    expect((await remote.read(location))?.content).toEqual(expect.objectContaining({ body: "acknowledged" }));
    await dependencies.cleanup();
  });

  it("compensates an ACK that wins the real closeDocument race before discard commit", async () => {
    const dependencies = createDocumentTestDependencies();
    const local = new InMemoryDocumentAdapter(dependencies.environment);
    const remote = new InMemoryDocumentAdapter(dependencies.environment);
    const sync = new SynchronisingDocumentAdapter({ local, remote, online: () => true, environment: dependencies.environment });
    const location = { kind: "memory", namespace: "p05-sync", key: "ack-close-race" } as const;
    await sync.write({
      location, typeId: noteType.id, schemaVersion: 1,
      content: { title: "Race", body: "acknowledged baseline" }, expectedVersion: null,
      idempotencyKey: "ack-close-baseline",
    });
    await sync.flush();
    const baseline = (await sync.read(location))!;

    const committed = deferred();
    const releaseSave = deferred();
    const wrapper: DocumentStorageAdapter = {
      id: "ack-close-wrapper",
      capabilities: sync.capabilities,
      supports: (candidate) => sync.supports(candidate),
      read: (candidate, options) => sync.read(candidate, options),
      write: async <T,>(request: DocumentWriteRequest<T>) => {
        const record = await sync.write(request);
        committed.resolve();
        await releaseSave.promise;
        return record;
      },
      remove: (candidate, version, options) => sync.remove(candidate, version, options),
      list: (query) => sync.list(query),
      listVersions: (candidate, options) => sync.listVersions(candidate, options),
      readVersion: (candidate, version, options) => sync.readVersion(candidate, version, options),
      isSynchronisationPending: (candidate) => sync.isSynchronisationPending(candidate),
      subscribeSynchronisation: (candidate, listener) => sync.subscribeSynchronisation(candidate, listener),
      discardPendingSynchronisation: (candidate, options) => sync.discardPendingSynchronisation(candidate, options),
      reconcileFencedWrite: (candidate, record, previous, options) =>
        sync.reconcileFencedWrite(candidate, record, previous, options),
    };
    const { controller } = controllerWith(wrapper, dependencies);
    controller.registerCloseReviewer({ review: async () => "discard" });
    const document = await controller.openDocument({ documentId: "ack-close-race", typeId: noteType.id, location });
    expect(document.currentVersion).toEqual(baseline.version);
    document.update((model) => ({ ...model, body: "discarded body" }), { actionName: "Type" });
    const saving = document.save({ reason: "explicit" });
    await committed.promise;
    const flushing = sync.flush();
    await flushing;
    const closing = controller.closeDocument(document.id, "user");
    releaseSave.resolve();
    await saving.catch(() => undefined);
    await expect(closing).resolves.toMatchObject({ outcome: "closed" });
    expect((await remote.read(location))?.content).toEqual(expect.objectContaining({ body: "acknowledged baseline" }));
    expect((await local.read(location))?.content).toEqual(expect.objectContaining({ body: "acknowledged baseline" }));
    await dependencies.cleanup();
  });

  it("hydrates a durable terminal deletion into a live conflict after restart", async () => {
    const environment = createTestRuntimeEnvironment();
    const durable = durableLocal(environment);
    const remoteBacking = new InMemoryDocumentAdapter(environment);
    const remote: DocumentStorageAdapter = {
      id: "terminal-deleted",
      capabilities: remoteBacking.capabilities,
      supports: (location) => remoteBacking.supports(location),
      read: (location, options) => remoteBacking.read(location, options),
      write: () => Promise.reject(new DocumentDeletedError()),
      remove: (location, version, options) => remoteBacking.remove(location, version, options),
      list: (query) => remoteBacking.list(query),
      listVersions: (location, options) => remoteBacking.listVersions(location, options),
      readVersion: (location, version, options) => remoteBacking.readVersion(location, version, options),
    };
    let online = false;
    const first = new SynchronisingDocumentAdapter({ local: durable.adapter, remote, online: () => online, environment });
    const location = { kind: "memory", namespace: "p05-sync", key: "terminal-restart" } as const;
    await first.write({
      location, typeId: noteType.id, schemaVersion: 1,
      content: { title: "Terminal", body: "local payload" }, expectedVersion: null,
      idempotencyKey: "terminal-restart",
    });
    online = true;
    expect(await first.flush()).toEqual({ outcome: "completed", sent: 0, conflicted: 1 });

    const second = new SynchronisingDocumentAdapter({ local: durable.adapter, remote, online: () => true, environment });
    const dependencies = createDocumentTestDependencies({ environment });
    const { controller } = controllerWith(second, dependencies);
    const document = await controller.openDocument({ documentId: "terminal-restart", typeId: noteType.id, location });
    expect(document.state).toBe("conflicted");
    expect(document.conflict).toMatchObject({
      base: null,
      remote: null,
      remoteState: "deleted",
      localModel: expect.objectContaining({ body: "local payload" }),
    });
    await dependencies.cleanup();
  });

  it("re-reads the durable queue after a held ACK and rebases a later runtime edit", async () => {
    const environment = createTestRuntimeEnvironment();
    const durable = durableLocal(environment);
    const remoteBacking = new InMemoryDocumentAdapter(environment);
    const remoteStarted = deferred();
    const releaseRemote = deferred();
    let writes = 0;
    const remote: DocumentStorageAdapter = {
      id: "held-ack",
      capabilities: remoteBacking.capabilities,
      supports: (location) => remoteBacking.supports(location),
      read: (location, options) => remoteBacking.read(location, options),
      write: async <T,>(request: DocumentWriteRequest<T>) => {
        writes += 1;
        if (writes === 1) {
          remoteStarted.resolve();
          await releaseRemote.promise;
        }
        return remoteBacking.write(request);
      },
      remove: (location, version, options) => remoteBacking.remove(location, version, options),
      list: (query) => remoteBacking.list(query),
      listVersions: (location, options) => remoteBacking.listVersions(location, options),
      readVersion: (location, version, options) => remoteBacking.readVersion(location, version, options),
    };
    const first = new SynchronisingDocumentAdapter({ local: durable.adapter, remote, online: () => true, environment });
    const second = new SynchronisingDocumentAdapter({ local: durable.adapter, remote, online: () => true, environment });
    const location = { kind: "memory", namespace: "p05-sync", key: "held-ack" } as const;
    const a = await first.write({
      location, typeId: noteType.id, schemaVersion: 1,
      content: { title: "Held", body: "A" }, expectedVersion: null, idempotencyKey: "held-a",
    });
    const flushing = first.flush();
    await remoteStarted.promise;
    await second.write({
      location, typeId: noteType.id, schemaVersion: 1,
      content: { title: "Held", body: "B" }, expectedVersion: a.version, idempotencyKey: "held-b",
    });
    releaseRemote.resolve();
    await expect(flushing).resolves.toEqual({ outcome: "completed", sent: 2, conflicted: 0 });
    expect(durable.queue.size).toBe(0);
    expect((await remoteBacking.read(location))?.content).toEqual(expect.objectContaining({ body: "B" }));
    expect((await durable.local.read(location))?.content).toEqual(expect.objectContaining({ body: "B" }));
  });

  it("reserves an identical durable write once across concurrent awaits", async () => {
    const environment = createTestRuntimeEnvironment();
    const durable = durableLocal(environment);
    const remote = new InMemoryDocumentAdapter(environment);
    const sync = new SynchronisingDocumentAdapter({ local: durable.adapter, remote, online: () => false, environment });
    const request = {
      location: { kind: "memory", namespace: "p05-sync", key: "single-flight" } as const,
      typeId: noteType.id,
      schemaVersion: 1,
      content: { title: "Single", body: "flight" },
      expectedVersion: null,
      idempotencyKey: "single-flight",
    };
    const [first, second] = await Promise.all([sync.write(request), sync.write(request)]);
    expect(first).toEqual(second);
    expect(sync.queueSnapshot()).toHaveLength(1);
    expect(durable.queue.size).toBe(1);
  });

  it("updates same-key retries from the local result to the authoritative ACK", async () => {
    const environment = createTestRuntimeEnvironment();
    const local = new InMemoryDocumentAdapter(environment);
    const remote = new InMemoryDocumentAdapter(environment);
    let online = false;
    const sync = new SynchronisingDocumentAdapter({ local, remote, online: () => online, environment });
    const request = {
      location: { kind: "memory", namespace: "p05-sync", key: "ack-idempotency" } as const,
      typeId: noteType.id,
      schemaVersion: 1,
      content: { title: "Retry", body: "authoritative" },
      expectedVersion: null,
      idempotencyKey: "ack-idempotency",
    };
    const localResult = await sync.write(request);
    online = true;
    await sync.flush();
    const authoritative = await remote.read(request.location);
    expect(authoritative?.version).not.toEqual(localResult.version);
    const retried = await sync.write(request);
    expect(retried.version).toEqual(authoritative?.version);
    expect(sync.queueSnapshot()).toHaveLength(0);
  });

  it("fences every synchronising operation after disposal and does not expose unsupported watch", async () => {
    const environment = createTestRuntimeEnvironment();
    const localBacking = new InMemoryDocumentAdapter(environment);
    const local: DocumentStorageAdapter = {
      id: "no-watch-local",
      capabilities: { ...localBacking.capabilities, watch: false },
      supports: (location) => localBacking.supports(location),
      read: (location, options) => localBacking.read(location, options),
      write: (request) => localBacking.write(request),
      remove: (location, version, options) => localBacking.remove(location, version, options),
      list: (query) => localBacking.list(query),
      listVersions: (location, options) => localBacking.listVersions(location, options),
      readVersion: (location, version, options) => localBacking.readVersion(location, version, options),
    };
    const remote = new InMemoryDocumentAdapter(environment);
    const sync = new SynchronisingDocumentAdapter({ local, remote, online: () => true, environment });
    const location = { kind: "memory", namespace: "p05-sync", key: "disposed" } as const;
    expect(sync.watch).toBeUndefined();
    await sync.dispose();
    await expect(sync.read(location)).rejects.toBeInstanceOf(DocumentUnavailableError);
    await expect(sync.write({
      location, typeId: noteType.id, schemaVersion: 1,
      content: { title: "", body: "" }, expectedVersion: null, idempotencyKey: "disposed",
    })).rejects.toBeInstanceOf(DocumentUnavailableError);
    await expect(sync.list({})).rejects.toBeInstanceOf(DocumentUnavailableError);
    await expect(sync.remove(location, {
      id: "missing", sequence: 1, savedAt: "2026-08-09T00:00:00.000Z", etag: "missing",
    })).rejects.toBeInstanceOf(DocumentUnavailableError);
    await expect(sync.listVersions(location)).rejects.toBeInstanceOf(DocumentUnavailableError);
    await expect(sync.readVersion(location, {
      id: "missing", sequence: 1, savedAt: "2026-08-09T00:00:00.000Z", etag: "missing",
    })).rejects.toBeInstanceOf(DocumentUnavailableError);
    await expect(sync.refreshSynchronisation(location)).rejects.toBeInstanceOf(DocumentUnavailableError);
    await expect(sync.flush()).rejects.toBeInstanceOf(DocumentUnavailableError);
  });

  it("does not let a non-cooperative child disposer hang synchronising disposal", async () => {
    const environment = createTestRuntimeEnvironment();
    const localBacking = new InMemoryDocumentAdapter(environment);
    const local = Object.assign(localBacking, {
      dispose: vi.fn(() => new Promise<void>(() => undefined)),
    });
    const remote = new InMemoryDocumentAdapter(environment);
    const sync = new SynchronisingDocumentAdapter({ local, remote, online: () => true, environment });
    const disposal = sync.dispose();
    const error = await disposal.then(() => null, (reason: unknown) => reason);
    expect(local.dispose).toHaveBeenCalledOnce();
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringMatching(/timed out/i) }),
    ]));
  });

  it("waits for a cooperative durable lease release before disposal resolves", async () => {
    const environment = createTestRuntimeEnvironment();
    const durable = durableLocal(environment);
    const releaseStarted = deferred();
    const finishRelease = deferred();
    durable.adapter.releaseSynchronisationQueueLeases = vi.fn(async () => {
      releaseStarted.resolve();
      await finishRelease.promise;
    });
    const sync = new SynchronisingDocumentAdapter({
      local: durable.adapter,
      remote: new InMemoryDocumentAdapter(environment),
      online: () => true,
      environment,
    });
    let settled = false;
    const disposing = sync.dispose().then(() => { settled = true; });
    await releaseStarted.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    finishRelease.resolve();
    await disposing;
    expect(durable.adapter.releaseSynchronisationQueueLeases).toHaveBeenCalledOnce();
  });

  it("abort-races an IndexedDB open that never cooperates with disposal", async () => {
    const environment = createTestRuntimeEnvironment();
    const request = {} as IDBOpenDBRequest;
    const indexedDB = { open: vi.fn(() => request) } as unknown as IDBFactory;
    const adapter = new IndexedDBDocumentAdapter({ indexedDB, databaseName: "p05-sync-blocked-open", environment });
    const opening = adapter.open().then(() => null, (error: unknown) => error);
    adapter.dispose();
    const outcome = await Promise.race([
      opening,
      new Promise((resolve) => setTimeout(() => resolve("still-pending"), 0)),
    ]);
    expect(outcome).toBeInstanceOf(DocumentUnavailableError);
  });

  it("compensates the local record, history and idempotency when durable enqueue fails", async () => {
    const environment = createTestRuntimeEnvironment();
    const local = Object.assign(new InMemoryDocumentAdapter(environment), {
      async readSynchronisationQueue() { return [] as PersistedDocumentSyncQueueItem[]; },
      async persistSynchronisationQueueItem() { throw new Error("enqueue failed"); },
      async removeSynchronisationQueueItem() { /* no durable item was created */ },
    });
    const remote = new InMemoryDocumentAdapter(environment);
    const sync = new SynchronisingDocumentAdapter({ local, remote, online: () => false, environment });
    const request = {
      location: { kind: "memory", namespace: "p05-sync", key: "enqueue-failure" } as const,
      typeId: noteType.id,
      schemaVersion: 1,
      content: { title: "Atomic", body: "rollback" },
      expectedVersion: null,
      idempotencyKey: "enqueue-failure",
    };
    await expect(sync.write(request)).rejects.toThrow("enqueue failed");
    expect(await local.read(request.location)).toBeNull();
    expect(await local.listVersions(request.location)).toEqual([]);
    const retried = await local.write(request);
    expect(retried.content).toEqual(request.content);
  });

  it("uses an explicit awaited refresh to reconcile a cross-runtime ACK into a live document", async () => {
    const environment = createTestRuntimeEnvironment();
    const durable = durableLocal(environment);
    const remote = new InMemoryDocumentAdapter(environment);
    const origin = new SynchronisingDocumentAdapter({ local: durable.adapter, remote, online: () => false, environment });
    const location = { kind: "memory", namespace: "p05-sync", key: "refresh-ack" } as const;
    await origin.write({
      location, typeId: noteType.id, schemaVersion: 1,
      content: { title: "Refresh", body: "pending" }, expectedVersion: null, idempotencyKey: "refresh-ack",
    });
    const dependencies = createDocumentTestDependencies({ environment });
    const { controller } = controllerWith(origin, dependencies);
    const document = await controller.openDocument({ documentId: "refresh-ack", typeId: noteType.id, location });
    expect(document.state).toBe("dirty");

    const sender = new SynchronisingDocumentAdapter({ local: durable.adapter, remote, online: () => true, environment });
    await sender.flush();
    expect(document.state).toBe("dirty");
    await origin.refreshSynchronisation(location);
    expect(document.state).toBe("clean");
    expect(document.currentVersion).toEqual((await remote.read(location))?.version);
    await dependencies.cleanup();
  });

  it("rejects accessor payloads before remote transport or publishing-store code can execute getters", async () => {
    let requestReads = 0;
    const requestContent = Object.defineProperty({}, "body", {
      enumerable: true,
      get: () => ++requestReads,
    });
    const transport: DocumentRemoteTransport = { request: vi.fn() };
    const remote = new RemoteDocumentAdapter(transport);
    await expect(remote.write({
      location: { kind: "remote", url: "https://documents.example/p05-sync" },
      typeId: noteType.id,
      schemaVersion: 1,
      content: requestContent,
      expectedVersion: null,
      idempotencyKey: "remote-accessor",
    })).rejects.toBeInstanceOf(DocumentSchemaError);
    expect(requestReads).toBe(0);
    expect(transport.request).not.toHaveBeenCalled();

    let responseReads = 0;
    const responseBody = Object.defineProperty({}, "typeId", {
      enumerable: true,
      get: () => ++responseReads,
    });
    const responseRemote = new RemoteDocumentAdapter({
      request: async () => ({ status: 200, headers: {}, body: responseBody }),
    });
    await expect(responseRemote.read({ kind: "remote", url: "https://documents.example/response" }))
      .rejects.toBeInstanceOf(DocumentSchemaError);
    expect(responseReads).toBe(0);

    const versionGetter = vi.fn(() => ({
      id: "remote-version",
      sequence: 1,
      savedAt: "2026-08-09T00:00:00.000Z",
      etag: "remote-version",
    }));
    const versionBody = new Array(1);
    Object.defineProperty(versionBody, "0", { enumerable: true, get: versionGetter });
    const versionRemote = new RemoteDocumentAdapter({
      request: async () => ({ status: 200, headers: {}, body: versionBody }),
    });
    await expect(versionRemote.listVersions({ kind: "remote", url: "https://documents.example/versions" }))
      .rejects.toBeInstanceOf(DocumentSchemaError);
    expect(versionGetter).not.toHaveBeenCalled();

    const environment = createTestRuntimeEnvironment();
    const queueRequestGetter = vi.fn(() => ({
      location: { kind: "memory", namespace: "p05-sync", key: "queue-accessor" },
      typeId: noteType.id,
      schemaVersion: 1,
      content: { title: "Queue", body: "accessor" },
      expectedVersion: null,
      idempotencyKey: "queue-accessor",
    }));
    const queueItem = Object.defineProperty({
      id: "queue-accessor",
      idempotencyKey: "queue-accessor",
      state: "queued",
      attemptCount: 0,
      nextAttemptAt: null,
      localVersion: { id: "local", sequence: 1, savedAt: "2026-08-09T00:00:00.000Z", etag: "local" },
      localLocation: { kind: "memory", namespace: "p05-sync", key: "queue-accessor" },
      order: 1,
    }, "request", { enumerable: true, get: queueRequestGetter });
    const queueLocal = Object.assign(new InMemoryDocumentAdapter(environment), {
      async readSynchronisationQueue() { return [queueItem] as unknown as PersistedDocumentSyncQueueItem[]; },
      async persistSynchronisationQueueItem() { /* read-only malformed persistence fixture */ },
      async removeSynchronisationQueueItem() { /* read-only malformed persistence fixture */ },
    });
    const queueSync = new SynchronisingDocumentAdapter({
      local: queueLocal,
      remote: new InMemoryDocumentAdapter(environment),
      online: () => false,
      environment,
    });
    await expect(queueSync.read({ kind: "memory", namespace: "p05-sync", key: "queue-accessor" }))
      .rejects.toBeInstanceOf(DocumentSchemaError);
    expect(queueRequestGetter).not.toHaveBeenCalled();

    const applicationKind: SynCloudOSDocumentKindMetadata = {
      kind: "application.document",
      version: 1,
      displayName: "Application Document",
      permissions: { saveDraft: { public: true }, getDraft: { public: true } },
    };
    const store = createInMemoryDocumentStore({ kinds: [applicationKind] });
    const storeAdapter = new DocumentStoreDocumentAdapter(store);
    let storeReads = 0;
    const storeContent = Object.defineProperty({}, "body", {
      enumerable: true,
      get: () => ++storeReads,
    });
    await expect(storeAdapter.write({
      location: { kind: "document-store", documentId: "accessor" },
      typeId: noteType.id,
      schemaVersion: 1,
      content: storeContent,
      expectedVersion: null,
      idempotencyKey: "store-accessor",
    })).rejects.toBeInstanceOf(DocumentSchemaError);
    expect(storeReads).toBe(0);

    let directReads = 0;
    const directBody = Object.defineProperty({}, "value", {
      enumerable: true,
      get: () => ++directReads,
    });
    await expect(store.saveDraft({
      id: "direct-accessor",
      kind: applicationKind.kind,
      title: "Accessor",
      body: directBody,
      publishState: "draft",
    }, undefined, { idempotencyKey: "direct-accessor" }))
      .rejects.toBeInstanceOf(SynCloudOSDocumentStorePayloadError);
    expect(directReads).toBe(0);
  });

  it("rejects accessor migration payloads before structured cloning can execute getters", () => {
    const registry = new DocumentTypeRegistry();
    registry.register(noteType);
    const getter = vi.fn(() => 1);
    const payload = Object.defineProperty({}, "schemaVersion", { enumerable: true, get: getter });
    expect(() => registry.decode(noteType.id, payload)).toThrow(DocumentSchemaError);
    expect(getter).not.toHaveBeenCalled();
  });
});
