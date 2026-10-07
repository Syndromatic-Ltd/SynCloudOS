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
  DocumentStoreDocumentAdapter,
  DocumentSchemaError,
  InMemoryDocumentAdapter,
  InMemoryDocumentRecoveryStore,
  SynchronisingDocumentAdapter,
  canonicalDocumentJson,
  validateDocumentRestorationSnapshot,
  type DocumentRecoveryStore,
  type DocumentReadOptions,
  type DocumentRecord,
  type DocumentStorageAdapter,
  type DocumentVersion,
  type DocumentWriteRequest,
  type PersistedDocumentSyncQueueItem,
} from "../../src/SynCloudOS/Documents";
import { createPersistenceDocumentStore, type SynCloudOSDocumentStoreLock } from "../../src/SynCloudOS/DocumentStore";
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

function controllerWith(adapter: DocumentStorageAdapter, dependencies = createDocumentTestDependencies()) {
  const controller = new DocumentController(dependencies);
  controller.registerType(noteType);
  controller.registerAdapter(adapter);
  return { controller, dependencies };
}

describe("persistence commits fenced by close", () => {
  it("reconciles a non-cooperative canonical commit fenced by structural close", async () => {
    const dependencies = createDocumentTestDependencies();
    const backing = new InMemoryDocumentAdapter(dependencies.environment);
    let release!: () => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const adapter: DocumentStorageAdapter = {
      id: "non-cooperative-close",
      capabilities: backing.capabilities,
      supports: (location) => backing.supports(location),
      read: (location, options) => backing.read(location, options),
      write: async <T,>(request: DocumentWriteRequest<T>) => {
        started();
        await blocked;
        return backing.write({ ...request, signal: undefined });
      },
      remove: (location, version, options) => backing.remove(location, version, options),
      list: (query) => backing.list(query),
      listVersions: (location, options) => backing.listVersions(location, options),
      readVersion: (location, version, options) => backing.readVersion(location, version, options),
    };
    const { controller } = controllerWith(adapter, dependencies);
    const location = { kind: "memory", namespace: "close-gate", key: "late-close" } as const;
    const document = await controller.newDocument({ documentId: "late-close", typeId: noteType.id, location });
    document.update((model) => ({ ...model, body: "discarded" }), { actionName: "Type" });
    const saving = document.save({ reason: "explicit" });
    await startedPromise;
    document.markClosed();
    release();

    await expect(saving).rejects.toMatchObject({ code: expect.stringMatching(/abort|unavailable/) });
    expect(await backing.read(location)).toBeNull();
    await dependencies.cleanup();
  });

  it("does not let an adapter watch mutate clean/version state inside a close gate", async () => {
    const dependencies = createDocumentTestDependencies();
    const adapter = new InMemoryDocumentAdapter(dependencies.environment);
    const { controller } = controllerWith(adapter, dependencies);
    const location = { kind: "memory", namespace: "close-gate", key: "watched-gate" } as const;
    const document = await controller.newDocument({ documentId: "watched-gate", typeId: noteType.id, location });
    await document.save({ reason: "explicit" });
    const version = document.currentVersion!;
    const preparation = await controller.prepareCloseDocument(document.id, "user");
    expect(preparation.status).toBe("ready");

    await adapter.write({
      location,
      typeId: noteType.id,
      schemaVersion: 1,
      content: document.model,
      expectedVersion: version,
      idempotencyKey: "external-during-gate",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.currentVersion).toEqual(version);
    if (preparation.status === "ready") controller.cancelCloseDocument(preparation);
    await dependencies.cleanup();
  });

  it("rebases the newest recovery after a late non-cooperative recovery commit", async () => {
    const dependencies = createDocumentTestDependencies();
    const backing = new InMemoryDocumentRecoveryStore();
    let release!: () => void;
    let started!: () => void;
    let first = true;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const recovery: DocumentRecoveryStore = {
      read: (id, signal) => backing.read(id, signal),
      remove: (id, version, signal) => backing.remove(id, version, signal),
      write: async (record, expected, _signal) => {
        if (first) {
          first = false;
          started();
          await blocked;
        }
        return backing.write(record, expected);
      },
    };
    const controller = new DocumentController({ ...dependencies, recovery });
    controller.registerType(noteType);
    const document = await controller.newDocument({ documentId: "late-recovery", typeId: noteType.id });
    document.update((model) => ({ ...model, body: "A" }), { actionName: "Type" });
    const firstFlush = document.flushRecovery();
    await startedPromise;
    const abort = new AbortController();
    const closing = controller.closeDocument(document.id, "user", abort.signal);
    await Promise.resolve();
    await Promise.resolve();
    expect(() => document.update((model) => ({ ...model, body: "too early" }), { actionName: "Type" }))
      .toThrow(/prepared close/i);
    abort.abort("cancel-close");
    await expect(closing).rejects.toBeInstanceOf(DocumentAbortError);
    expect(() => document.update((model) => ({ ...model, body: "still too early" }), { actionName: "Type" }))
      .toThrow(/prepared close/i);
    release();
    await firstFlush;
    await new Promise((resolve) => setTimeout(resolve, 0));
    document.update((model) => ({ ...model, body: "B" }), { actionName: "Type" });
    await document.flushRecovery();

    const durable = await backing.read(document.recoveryRecord!.recoveryId);
    expect(durable?.serializedContent).toEqual(expect.objectContaining({ body: "B" }));
    expect(durable?.recoveryVersion).toBe(2);
    await dependencies.cleanup();
  });

  it("uses canonical location identity when rebasing property-order aliases", async () => {
    const environment = createTestRuntimeEnvironment();
    const local = new InMemoryDocumentAdapter(environment);
    const remote = new InMemoryDocumentAdapter(environment);
    let online = false;
    const adapter = new SynchronisingDocumentAdapter({ local, remote, online: () => online, environment });
    const firstLocation = { kind: "memory", namespace: "close-gate", key: "alias" } as const;
    const secondLocation = { key: "alias", namespace: "close-gate", kind: "memory" } as const;
    const first = await adapter.write({
      location: firstLocation, typeId: noteType.id, schemaVersion: 1,
      content: { title: "One", body: "" }, expectedVersion: null, idempotencyKey: "alias-one",
    });
    await adapter.write({
      location: secondLocation, typeId: noteType.id, schemaVersion: 1,
      content: { title: "Two", body: "" }, expectedVersion: first.version, idempotencyKey: "alias-two",
    });
    online = true;
    await expect(adapter.flush()).resolves.toEqual({ outcome: "completed", sent: 2, conflicted: 0 });
    expect((await remote.read(firstLocation))?.content).toEqual(expect.objectContaining({ title: "Two" }));
  });

  it("refreshes a durable queue after prior hydration and CAS-claims it across synchronisers", async () => {
    const environment = createTestRuntimeEnvironment();
    const local = new InMemoryDocumentAdapter(environment);
    const durableQueue = new Map<string, PersistedDocumentSyncQueueItem>();
    const persistentLocal = Object.assign(local, {
      async readSynchronisationQueue() {
        return [...durableQueue.values()].map((item) => structuredClone(item));
      },
      async persistSynchronisationQueueItem(item: PersistedDocumentSyncQueueItem) {
        durableQueue.set(item.id, structuredClone(item));
      },
      async removeSynchronisationQueueItem(id: string) { durableQueue.delete(id); },
      async writeWithSynchronisationIntent<T>(
        request: DocumentWriteRequest<T>,
        createItem: (record: DocumentRecord<T>) => PersistedDocumentSyncQueueItem,
      ) {
        const record = await local.write(request);
        const item = createItem(record);
        durableQueue.set(item.id, structuredClone(item));
        return record;
      },
      async claimSynchronisationQueueItem(
        id: string, ownerId: string, expectedGeneration: number, now: number, leaseMs: number,
      ) {
        const current = durableQueue.get(id);
        if (!current || (current.leaseGeneration ?? 0) !== expectedGeneration) return null;
        if (current.leaseOwnerId && current.leaseOwnerId !== ownerId &&
            current.leaseExpiresAt && Date.parse(current.leaseExpiresAt) > now) return null;
        const claimed = {
          ...current,
          state: "sending" as const,
          attemptCount: current.attemptCount + 1,
          leaseOwnerId: ownerId,
          leaseExpiresAt: new Date(now + leaseMs).toISOString(),
          leaseGeneration: expectedGeneration + 1,
        };
        durableQueue.set(id, structuredClone(claimed));
        return claimed;
      },
      async renewSynchronisationQueueLease(id: string, ownerId: string, generation: number, now: number, leaseMs: number) {
        const current = durableQueue.get(id);
        if (!current || current.leaseOwnerId !== ownerId || current.leaseGeneration !== generation) return false;
        durableQueue.set(id, { ...current, leaseExpiresAt: new Date(now + leaseMs).toISOString() });
        return true;
      },
      async updateClaimedSynchronisationQueueItem(item: PersistedDocumentSyncQueueItem, ownerId: string, generation: number) {
        const current = durableQueue.get(item.id);
        if (!current || current.leaseOwnerId !== ownerId || current.leaseGeneration !== generation) return false;
        durableQueue.set(item.id, structuredClone(item));
        return true;
      },
      async removeClaimedSynchronisationQueueItem(id: string, ownerId: string, generation: number) {
        const current = durableQueue.get(id);
        if (!current || current.leaseOwnerId !== ownerId || current.leaseGeneration !== generation) return false;
        durableQueue.delete(id);
        return true;
      },
      async rebaseAndRemoveClaimedSynchronisationQueueItem(
        completedId: string, ownerId: string, generation: number, nextId: string, expectedVersion: DocumentVersion,
      ) {
        const completed = durableQueue.get(completedId);
        const next = durableQueue.get(nextId);
        if (!completed || !next || completed.leaseOwnerId !== ownerId || completed.leaseGeneration !== generation) return null;
        const rebased = { ...next, request: { ...next.request, expectedVersion: structuredClone(expectedVersion) } };
        durableQueue.set(nextId, structuredClone(rebased));
        durableQueue.delete(completedId);
        return rebased;
      },
      async adoptSynchronisedRecord<T>(
        _record: DocumentRecord<T>,
        _expectedLocalVersion: DocumentVersion,
        options: DocumentReadOptions & {
          readonly removeQueueItemId?: string;
          readonly synchronisationQueueLease?: { readonly ownerId: string; readonly generation: number };
        } = {},
      ) {
        if (!options.removeQueueItemId || !options.synchronisationQueueLease) return;
        const current = durableQueue.get(options.removeQueueItemId);
        if (!current || current.leaseOwnerId !== options.synchronisationQueueLease.ownerId ||
            current.leaseGeneration !== options.synchronisationQueueLease.generation) {
          throw new Error("stale queue lease");
        }
        durableQueue.delete(options.removeQueueItemId);
      },
    });
    const remoteBacking = new InMemoryDocumentAdapter(environment);
    let releaseRemote!: () => void;
    const remoteBlocked = new Promise<void>((resolve) => { releaseRemote = resolve; });
    const remoteWrite = vi.fn(async <T,>(request: DocumentWriteRequest<T>) => {
      await remoteBlocked;
      return remoteBacking.write(request);
    });
    const remote: DocumentStorageAdapter = {
      id: "durable-queue-remote",
      capabilities: remoteBacking.capabilities,
      supports: (location) => remoteBacking.supports(location),
      read: (location, options) => remoteBacking.read(location, options),
      write: remoteWrite,
      remove: (location, version, options) => remoteBacking.remove(location, version, options),
      list: (query) => remoteBacking.list(query),
      listVersions: (location, options) => remoteBacking.listVersions(location, options),
      readVersion: (location, version, options) => remoteBacking.readVersion(location, version, options),
    };
    let online = false;
    const first = new SynchronisingDocumentAdapter({ local: persistentLocal, remote, online: () => online, environment });
    const second = new SynchronisingDocumentAdapter({ local: persistentLocal, remote, online: () => online, environment });
    await second.flush(); // hydrate an empty queue before another runtime writes
    const location = { kind: "memory", namespace: "close-gate", key: "durable-runtimes" } as const;
    await first.write({
      location, typeId: noteType.id, schemaVersion: 1,
      content: { title: "Durable", body: "queued" }, expectedVersion: null, idempotencyKey: "durable-runtime-write",
    });
    online = true;
    const firstFlush = first.flush();
    const secondFlush = second.flush();
    await Promise.resolve();
    releaseRemote();
    await Promise.all([firstFlush, secondFlush]);

    expect(remoteWrite).toHaveBeenCalledTimes(1);
    expect(durableQueue.size).toBe(0);
  });

  it("turns a transformed authoritative ACK into an explicit recoverable conflict", async () => {
    const dependencies = createDocumentTestDependencies();
    const local = new InMemoryDocumentAdapter(dependencies.environment);
    const remoteBacking = new InMemoryDocumentAdapter(dependencies.environment);
    const remote: DocumentStorageAdapter = {
      id: "transforming-remote",
      capabilities: remoteBacking.capabilities,
      supports: (location) => remoteBacking.supports(location),
      read: (location, options) => remoteBacking.read(location, options),
      write: <T,>(request: DocumentWriteRequest<T>) => remoteBacking.write({
        ...request,
        content: { ...(request.content as object), body: "server transformed" } as T,
      }),
      remove: (location, version, options) => remoteBacking.remove(location, version, options),
      list: (query) => remoteBacking.list(query),
      listVersions: (location, options) => remoteBacking.listVersions(location, options),
      readVersion: (location, version, options) => remoteBacking.readVersion(location, version, options),
    };
    let online = false;
    const sync = new SynchronisingDocumentAdapter({ local, remote, online: () => online, environment: dependencies.environment });
    const { controller } = controllerWith(sync, dependencies);
    const document = await controller.newDocument({
      documentId: "transformed-ack",
      typeId: noteType.id,
      location: { kind: "memory", namespace: "close-gate", key: "transformed-ack" },
    });
    document.update((model) => ({ ...model, body: "client" }), { actionName: "Type" });
    await document.save({ reason: "explicit" });
    online = true;
    await sync.flush();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.state).toBe("conflicted");
    expect(document.conflict?.localModel).toEqual(expect.objectContaining({ body: "client" }));
    expect(document.conflict?.remote?.content).toEqual(expect.objectContaining({ body: "server transformed" }));
    expect(sync.queueSnapshot()).toHaveLength(0);
    await dependencies.cleanup();
  });

  it("exposes an explicit recreation resolution for a deleted remote", async () => {
    const dependencies = createDocumentTestDependencies();
    const adapter = new InMemoryDocumentAdapter(dependencies.environment);
    const { controller } = controllerWith(adapter, dependencies);
    const location = { kind: "memory", namespace: "close-gate", key: "recreate" } as const;
    const document = await controller.newDocument({ documentId: "recreate", typeId: noteType.id, location });
    document.update((model) => ({ ...model, body: "local" }), { actionName: "Type" });
    document.enterConflict({ base: null, localModel: document.model, remote: null });

    await document.resolveConflict({ kind: "recreate" });
    expect(document.state).toBe("clean");
    expect((await adapter.read(location))?.content).toEqual(expect.objectContaining({ body: "local" }));
    await dependencies.cleanup();
  });

  it("rejects sparse arrays before traversal or JSON identity formation", () => {
    const sparse: unknown[] = [];
    sparse.length = 100_000_000;
    expect(() => canonicalDocumentJson(sparse)).toThrow(DocumentSchemaError);
    const oneHole = new Array(1);
    expect(() => canonicalDocumentJson(oneHole)).toThrow(DocumentSchemaError);
    expect(canonicalDocumentJson([null])).toBe("[null]");
    const oversized: unknown[] = [];
    oversized.length = 1_001;
    Object.defineProperty(oversized, 0, { get: () => { throw new Error("must not traverse"); } });
    expect(() => validateDocumentRestorationSnapshot({
      schemaVersion: 1,
      activeDocumentId: null,
      documents: oversized,
      recentLocations: [],
      capturedAt: "2026-08-09T00:00:00.000Z",
    })).toThrow(/at most 1000 documents/i);
  });

  it("serialises kind registration and every publishing mutation across store instances", async () => {
    const storage = memoryStorage();
    const persistence = createPersistence({
      runtimeId: "runtime:close-gate-publishing" as never,
      storage,
      namespace: "tests:close-gate-publishing",
    });
    let lockTail: Promise<void> = Promise.resolve();
    const lock: SynCloudOSDocumentStoreLock = {
      request: async (_name, _options, callback) => {
        const run = lockTail.then(callback, callback);
        lockTail = run.then(() => undefined, () => undefined);
        return run;
      },
    };
    const first = createPersistenceDocumentStore({ persistence, conditionalWriteLock: lock });
    const second = createPersistenceDocumentStore({ persistence, conditionalWriteLock: lock });
    first.registerKind({ kind: "close-gate-first", displayName: "First", version: 1 });
    second.registerKind({ kind: "close-gate-second", displayName: "Second", version: 1 });

    await Promise.all([
      first.saveDraft({ id: "first-draft", kind: "close-gate-first", title: "First", body: {}, publishState: "draft" }),
      second.saveDraft({ id: "second-draft", kind: "close-gate-second", title: "Second", body: {}, publishState: "draft" }),
    ]);
    const restored = createPersistenceDocumentStore({ persistence });
    expect(restored.listKinds().map(({ kind }) => kind)).toEqual(expect.arrayContaining(["close-gate-first", "close-gate-second"]));
    expect(restored.getDraft("first-draft")).not.toBeNull();
    expect(restored.getDraft("second-draft")).not.toBeNull();
  });

  it("does not advertise DocumentStore CAS without an explicit atomic capability", () => {
    const bridge = new DocumentStoreDocumentAdapter(createPersistenceDocumentStore());
    expect(bridge.capabilities.atomicConditionalWrite).toBe(false);
  });
});
