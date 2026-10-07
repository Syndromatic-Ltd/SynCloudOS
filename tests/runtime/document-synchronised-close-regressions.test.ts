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
  DocumentSchemaError,
  InMemoryDocumentAdapter,
  SynchronisingDocumentAdapter,
  canonicalDocumentJson,
  type DocumentReadOptions,
  type DocumentLocation,
  type DocumentRecord,
  type DocumentStorageAdapter,
  type DocumentVersion,
  type DocumentWriteRequest,
  type PersistedDocumentSyncQueueItem,
} from "../../src/SynCloudOS/Documents";
import { createDocumentTestDependencies } from "../fixtures/documentTestDependencies";
import { noteType } from "../fixtures/noteDocumentType";
import { createTestRuntimeEnvironment } from "./helpers";

function controllerWith(adapter: DocumentStorageAdapter, dependencies = createDocumentTestDependencies()) {
  const controller = new DocumentController(dependencies);
  controller.registerType(noteType);
  controller.registerAdapter(adapter);
  return { controller, dependencies };
}

function durableLocal(environment: ReturnType<typeof createTestRuntimeEnvironment>) {
  const local = new InMemoryDocumentAdapter(environment);
  const queue = new Map<string, PersistedDocumentSyncQueueItem>();
  return {
    queue,
    adapter: Object.assign(local, {
      async readSynchronisationQueue() { return [...queue.values()].map((item) => structuredClone(item)); },
      async persistSynchronisationQueueItem(item: PersistedDocumentSyncQueueItem) { queue.set(item.id, structuredClone(item)); },
      async removeSynchronisationQueueItem(id: string) { queue.delete(id); },
      async writeWithSynchronisationIntent<T>(
        request: DocumentWriteRequest<T>,
        createItem: (record: DocumentRecord<T>) => PersistedDocumentSyncQueueItem,
      ) {
        const record = await local.write(request);
        const item = createItem(record);
        queue.set(item.id, structuredClone(item));
        return record;
      },
    }),
  };
}

describe("synchronised save and close regressions", () => {
  it("rolls back a late offline synchronising save without publishing discarded content", async () => {
    const dependencies = createDocumentTestDependencies();
    const local = new InMemoryDocumentAdapter(dependencies.environment);
    const remote = new InMemoryDocumentAdapter(dependencies.environment);
    let online = false;
    const sync = new SynchronisingDocumentAdapter({ local, remote, online: () => online, environment: dependencies.environment });
    let committed!: () => void;
    let release!: () => void;
    const committedPromise = new Promise<void>((resolve) => { committed = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const adapter: DocumentStorageAdapter = {
      id: "late-offline-sync",
      capabilities: sync.capabilities,
      supports: (location) => sync.supports(location),
      read: (location, options) => sync.read(location, options),
      write: async <T,>(request: DocumentWriteRequest<T>) => {
        const record = await sync.write(request);
        committed();
        await blocked;
        return record;
      },
      remove: (location, version, options) => sync.remove(location, version, options),
      list: (query) => sync.list(query),
      listVersions: (location, options) => sync.listVersions(location, options),
      readVersion: (location, version, options) => sync.readVersion(location, version, options),
      isSynchronisationPending: (location) => sync.isSynchronisationPending(location),
      subscribeSynchronisation: (location, listener) => sync.subscribeSynchronisation(location, listener),
      reconcileFencedWrite: (location, committedRecord, previous, options) =>
        sync.reconcileFencedWrite(location, committedRecord, previous, options),
    };
    const { controller } = controllerWith(adapter, dependencies);
    const location = { kind: "memory", namespace: "final-review", key: "discarded-offline" } as const;
    const document = await controller.newDocument({ documentId: "discarded-offline", typeId: noteType.id, location });
    document.update((model) => ({ ...model, body: "must never publish" }), { actionName: "Type" });
    const saving = document.save({ reason: "explicit" });
    await committedPromise;
    document.markClosed();
    release();
    await expect(saving).rejects.toMatchObject({ code: expect.stringMatching(/abort|unavailable/) });
    expect(await local.read(location)).toBeNull();
    expect(sync.queueSnapshot()).toHaveLength(0);
    online = true;
    expect(await sync.flush()).toEqual({ outcome: "completed", sent: 0, conflicted: 0 });
    expect(await remote.read(location)).toBeNull();
    await dependencies.cleanup();
  });

  it("honours an explicit location mapper denial", async () => {
    const environment = createTestRuntimeEnvironment();
    const local = new InMemoryDocumentAdapter(environment);
    const remote = new InMemoryDocumentAdapter(environment);
    const sync = new SynchronisingDocumentAdapter({ local, remote, online: () => true, environment, mapLocation: () => null });
    const location = { kind: "memory", namespace: "final-review", key: "denied" } as const;
    expect(sync.supports(location)).toBe(false);
    await expect(sync.write({
      location, typeId: noteType.id, schemaVersion: 1, content: { title: "", body: "" },
      expectedVersion: null, idempotencyKey: "denied",
    })).rejects.toMatchObject({ code: "document-unavailable" });
    expect(await local.read(location)).toBeNull();
  });

  it("cancels an already-durable offline intent when close explicitly discards it", async () => {
    const dependencies = createDocumentTestDependencies();
    const local = new InMemoryDocumentAdapter(dependencies.environment);
    const remote = new InMemoryDocumentAdapter(dependencies.environment);
    let online = false;
    const sync = new SynchronisingDocumentAdapter({ local, remote, online: () => online, environment: dependencies.environment });
    const { controller } = controllerWith(sync, dependencies);
    controller.registerCloseReviewer({ review: async () => "discard" });
    const location = { kind: "memory", namespace: "final-review", key: "durable-discard" } as const;
    const document = await controller.newDocument({ documentId: "durable-discard", typeId: noteType.id, location });
    document.update((model) => ({ ...model, body: "discard durable" }), { actionName: "Type" });
    await document.save({ reason: "explicit" });
    expect(sync.queueSnapshot()).toHaveLength(1);
    await expect(controller.closeDocument(document.id, "user")).resolves.toMatchObject({ outcome: "closed" });
    expect(sync.queueSnapshot()).toHaveLength(0);
    expect(await local.read(location)).toBeNull();
    online = true;
    expect(await sync.flush()).toEqual({ outcome: "completed", sent: 0, conflicted: 0 });
    expect(await remote.read(location)).toBeNull();
    await dependencies.cleanup();
  });

  it("turns a terminal remote deletion into a live recreate conflict", async () => {
    const dependencies = createDocumentTestDependencies();
    const local = new InMemoryDocumentAdapter(dependencies.environment);
    const remoteBacking = new InMemoryDocumentAdapter(dependencies.environment);
    let deleted = true;
    const remote: DocumentStorageAdapter = {
      id: "deleted-remote",
      capabilities: remoteBacking.capabilities,
      supports: (location) => remoteBacking.supports(location),
      read: (location, options) => remoteBacking.read(location, options),
      write: <T,>(request: DocumentWriteRequest<T>) => deleted
        ? Promise.reject(new DocumentDeletedError())
        : remoteBacking.write(request),
      remove: (location, version, options) => remoteBacking.remove(location, version, options),
      list: (query) => remoteBacking.list(query),
      listVersions: (location, options) => remoteBacking.listVersions(location, options),
      readVersion: (location, version, options) => remoteBacking.readVersion(location, version, options),
    };
    let online = false;
    const sync = new SynchronisingDocumentAdapter({ local, remote, online: () => online, environment: dependencies.environment });
    const { controller } = controllerWith(sync, dependencies);
    const location = { kind: "memory", namespace: "final-review", key: "deleted" } as const;
    const document = await controller.newDocument({ documentId: "deleted", typeId: noteType.id, location });
    document.update((model) => ({ ...model, body: "recreate me" }), { actionName: "Type" });
    await document.save({ reason: "explicit" });
    online = true;
    expect(await sync.flush()).toEqual({ outcome: "completed", sent: 0, conflicted: 1 });
    expect(document.state).toBe("conflicted");
    expect(document.conflict?.remote).toBeNull();
    expect(document.conflict?.remoteState).toBe("deleted");
    deleted = false;
    await document.resolveConflict({ kind: "recreate" });
    await sync.flush();
    expect((await remoteBacking.read(location))?.content).toEqual(expect.objectContaining({ body: "recreate me" }));
    await dependencies.cleanup();
  });

  it("hydrates durable pending intent before a controller exposes a reopened document", async () => {
    const environment = createTestRuntimeEnvironment();
    const durable = durableLocal(environment);
    const remote = new InMemoryDocumentAdapter(environment);
    const first = new SynchronisingDocumentAdapter({ local: durable.adapter, remote, online: () => false, environment });
    const location = { kind: "memory", namespace: "final-review", key: "pending-open" } as const;
    await first.write({
      location, typeId: noteType.id, schemaVersion: 1, content: { title: "Pending", body: "offline" },
      expectedVersion: null, idempotencyKey: "pending-open",
    });
    const second = new SynchronisingDocumentAdapter({ local: durable.adapter, remote, online: () => false, environment });
    const dependencies = createDocumentTestDependencies({ environment });
    const { controller } = controllerWith(second, dependencies);
    const document = await controller.openDocument({ documentId: "pending-open", typeId: noteType.id, location });
    expect(second.isSynchronisationPending(location)).toBe(true);
    expect(document.hasUnsavedChanges).toBe(true);
    expect(document.state).toBe("dirty");
    await dependencies.cleanup();
  });

  it("does not assume queue removal is atomic when a basic adopter ignores options", async () => {
    const environment = createTestRuntimeEnvironment();
    const durable = durableLocal(environment);
    const remote = new InMemoryDocumentAdapter(environment);
    const sync = new SynchronisingDocumentAdapter({ local: durable.adapter, remote, online: () => true, environment });
    const location = { kind: "memory", namespace: "final-review", key: "basic-adopter" } as const;
    await sync.write({
      location, typeId: noteType.id, schemaVersion: 1, content: { title: "", body: "adopt" },
      expectedVersion: null, idempotencyKey: "basic-adopter",
    });
    expect(await sync.flush()).toEqual({ outcome: "completed", sent: 1, conflicted: 0 });
    expect(durable.queue.size).toBe(0);
    const reopened = new SynchronisingDocumentAdapter({ local: durable.adapter, remote, online: () => true, environment });
    expect(await reopened.flush()).toEqual({ outcome: "completed", sent: 0, conflicted: 0 });
  });

  it("rejects accessor and negative-zero values and sorts exact Unicode keys deterministically", () => {
    let reads = 0;
    const accessor = Object.defineProperty({}, "value", { enumerable: true, get: () => ++reads });
    expect(() => canonicalDocumentJson(accessor)).toThrow(DocumentSchemaError);
    expect(reads).toBe(0);
    expect(() => canonicalDocumentJson({ value: -0 })).toThrow(DocumentSchemaError);
    const composedFirst = { "é": 1, "e\u0301": 2 };
    const decomposedFirst = { "e\u0301": 2, "é": 1 };
    expect(canonicalDocumentJson(composedFirst)).toBe(canonicalDocumentJson(decomposedFirst));
  });

  it("rejects a mismatched type for both live and concurrently opening locations", async () => {
    const dependencies = createDocumentTestDependencies();
    const backing = new InMemoryDocumentAdapter(dependencies.environment);
    const location = { kind: "memory", namespace: "final-review", key: "typed-live" } as const;
    await backing.write({
      location, typeId: noteType.id, schemaVersion: 1, content: { title: "", body: "" },
      expectedVersion: null, idempotencyKey: "typed-live-seed",
    });
    const controller = new DocumentController(dependencies);
    const otherType = { ...noteType, id: "tests.other-note", extensions: [], mimeTypes: [] };
    controller.registerType(noteType);
    controller.registerType(otherType);
    controller.registerAdapter(backing);
    await controller.openDocument({ documentId: "typed-live", typeId: noteType.id, location });
    await expect(controller.openDocument({ typeId: otherType.id, location })).rejects.toBeInstanceOf(DocumentSchemaError);

    const openingLocation = { kind: "memory", namespace: "final-review", key: "typed-opening" } as const;
    await backing.write({
      location: openingLocation, typeId: noteType.id, schemaVersion: 1, content: { title: "", body: "" },
      expectedVersion: null, idempotencyKey: "typed-opening-seed",
    });
    let readStarted!: () => void;
    let releaseRead!: () => void;
    const readStartedPromise = new Promise<void>((resolve) => { readStarted = resolve; });
    const readBlocked = new Promise<void>((resolve) => { releaseRead = resolve; });
    const delayed: DocumentStorageAdapter = {
      id: "typed-opening-delay",
      capabilities: backing.capabilities,
      supports: (candidate) => backing.supports(candidate),
      read: async <T,>(candidate: DocumentLocation, options?: DocumentReadOptions) => {
        readStarted();
        await readBlocked;
        return backing.read<T>(candidate, options);
      },
      write: (request) => backing.write(request),
      remove: (candidate, version, options) => backing.remove(candidate, version, options),
      list: (query) => backing.list(query),
      listVersions: (candidate, options) => backing.listVersions(candidate, options),
      readVersion: (candidate, version, options) => backing.readVersion(candidate, version, options),
    };
    const secondDependencies = createDocumentTestDependencies();
    const secondController = new DocumentController(secondDependencies);
    secondController.registerType(noteType);
    secondController.registerType(otherType);
    secondController.registerAdapter(delayed);
    const opening = secondController.openDocument({ documentId: "typed-opening", typeId: noteType.id, location: openingLocation });
    await readStartedPromise;
    const mismatch = secondController.openDocument({ typeId: otherType.id, location: openingLocation });
    releaseRead();
    await expect(mismatch).rejects.toBeInstanceOf(DocumentSchemaError);
    await opening;
    await secondDependencies.cleanup();
    await dependencies.cleanup();
  });

  it("disposes a never-settling flush by aborting work and listeners exactly once", async () => {
    const environment = createTestRuntimeEnvironment();
    const local = new InMemoryDocumentAdapter(environment);
    const remoteBacking = new InMemoryDocumentAdapter(environment);
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const remote: DocumentStorageAdapter = {
      id: "never-settling-remote",
      capabilities: remoteBacking.capabilities,
      supports: (location) => remoteBacking.supports(location),
      read: (location, options) => remoteBacking.read(location, options),
      write: vi.fn(async () => { started(); return new Promise<never>(() => undefined); }),
      remove: (location, version, options) => remoteBacking.remove(location, version, options),
      list: (query) => remoteBacking.list(query),
      listVersions: (location, options) => remoteBacking.listVersions(location, options),
      readVersion: (location, version, options) => remoteBacking.readVersion(location, version, options),
    };
    const sync = new SynchronisingDocumentAdapter({ local, remote, online: () => true, environment });
    const location = { kind: "memory", namespace: "final-review", key: "dispose" } as const;
    await sync.write({
      location, typeId: noteType.id, schemaVersion: 1, content: { title: "", body: "" },
      expectedVersion: null, idempotencyKey: "dispose",
    });
    const flushing = sync.flush();
    await startedPromise;
    const disposable = sync as unknown as { dispose(): void | Promise<void> };
    await expect(Promise.resolve(disposable.dispose())).resolves.toBeUndefined();
    await expect(flushing).rejects.toBeInstanceOf(DocumentAbortError);
    await expect(Promise.resolve(disposable.dispose())).resolves.toBeUndefined();
  });
});
