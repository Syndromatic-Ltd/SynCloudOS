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
import {
  InMemoryDocumentAdapter,
  InMemoryDocumentRecoveryStore,
  SynchronisingDocumentAdapter,
  DocumentVersionConflictError,
  canonicalDocumentLocation,
  documentVersionsEqual,
  type DocumentLocation,
  type DocumentRecord,
  type DocumentRecoveryStore,
  type DocumentStorageAdapter,
  type DocumentVersion,
  type DocumentWriteRequest,
} from "../../src/SynCloudOS/Documents";
import {
  WindowContentRegistry,
  WindowController,
  freezeWindowRecord,
  type WindowContentController,
  type WindowRestorationSnapshot,
} from "../../src/SynCloudOS/Windows";
import { noteType, type NoteModel } from "../fixtures/noteDocumentType";
import { documentAdoptionAuthority } from "../../src/SynCloudOS/Documents/documentAdoptionAuthority";
import { createWindowTestDependencies, standardWindow } from "../fixtures/windowTestDependencies";
import { createRuntimeHarness, createTestBundle, createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function cloneRecord<T>(record: DocumentRecord<T>): DocumentRecord<T> {
  return structuredClone(record);
}

interface StoredWrite {
  readonly fingerprint: string;
  readonly record: DocumentRecord<unknown>;
}

interface AdapterLocationState {
  readonly record: DocumentRecord<unknown> | null;
  readonly history: readonly DocumentRecord<unknown>[];
  readonly idempotency: readonly [string, StoredWrite][];
  readonly pending: boolean;
}

/** A deterministic provider used to prove the selected-set rollback contract. */
class CompensableDocumentAdapter implements DocumentStorageAdapter {
  readonly id: string;
  readonly capabilities = Object.freeze({
    versions: true,
    delete: true,
    watch: false,
    offline: true,
    atomicConditionalWrite: true,
  });
  readonly #records = new Map<string, DocumentRecord<unknown>>();
  readonly #history = new Map<string, DocumentRecord<unknown>[]>();
  readonly #idempotency = new Map<string, StoredWrite>();
  readonly #pending = new Set<string>();
  readonly #closeTokens = new Map<string, string>();
  #sequence = 0;
  failWriteKey: string | null = null;
  failDiscardKey: string | null = null;

  constructor(
    id = "compensable-memory",
    readonly namespace = "selected-transaction",
  ) {
    this.id = id;
  }

  supports(location: DocumentLocation): boolean {
    return location.kind === "memory" && location.namespace === this.namespace;
  }

  async read<TSerialized>(location: DocumentLocation): Promise<DocumentRecord<TSerialized> | null> {
    const record = this.#records.get(canonicalDocumentLocation(location));
    return record ? cloneRecord(record as DocumentRecord<TSerialized>) : null;
  }

  async write<TSerialized>(request: DocumentWriteRequest<TSerialized>): Promise<DocumentRecord<TSerialized>> {
    if (request.location.kind === "memory" && request.location.key === this.failWriteKey) {
      throw new Error("second provider save failed");
    }
    const key = canonicalDocumentLocation(request.location);
    const closeToken = this.#closeTokens.get(key);
    if (closeToken && closeToken !== request.closeTransactionToken) {
      throw new Error("provider write lacks selected-close authority");
    }
    const fingerprint = JSON.stringify({
      location: request.location,
      typeId: request.typeId,
      schemaVersion: request.schemaVersion,
      content: request.content,
      expectedVersion: request.expectedVersion,
      metadata: request.metadata ?? {},
    });
    const repeated = this.#idempotency.get(request.idempotencyKey);
    if (repeated) {
      if (repeated.fingerprint !== fingerprint) throw new Error("idempotency mismatch");
      return cloneRecord(repeated.record as DocumentRecord<TSerialized>);
    }
    const current = this.#records.get(key) ?? null;
    if (!documentVersionsEqual(current?.version ?? null, request.expectedVersion)) {
      throw new DocumentVersionConflictError(request.location, request.expectedVersion, current);
    }
    this.#sequence += 1;
    const savedAt = new Date(1_700_000_000_000 + this.#sequence).toISOString();
    const record: DocumentRecord<TSerialized> = {
      location: structuredClone(request.location),
      typeId: request.typeId,
      schemaVersion: request.schemaVersion,
      content: structuredClone(request.content),
      version: {
        id: `provider-version-${this.#sequence}`,
        sequence: (current?.version.sequence ?? 0) + 1,
        savedAt,
        etag: `\"provider-${this.#sequence}\"`,
      },
      createdAt: current?.createdAt ?? savedAt,
      updatedAt: savedAt,
      metadata: structuredClone(request.metadata ?? {}),
    };
    const stored = cloneRecord(record);
    this.#records.set(key, stored);
    this.#history.set(key, [...(this.#history.get(key) ?? []), stored]);
    this.#idempotency.set(request.idempotencyKey, { fingerprint, record: stored });
    this.#pending.add(key);
    return cloneRecord(record);
  }

  async remove(location: DocumentLocation, expectedVersion: DocumentVersion): Promise<void> {
    const key = canonicalDocumentLocation(location);
    const current = this.#records.get(key) ?? null;
    if (!current || !documentVersionsEqual(current.version, expectedVersion)) {
      throw new DocumentVersionConflictError(location, expectedVersion, current);
    }
    this.#records.delete(key);
  }

  async list(): Promise<readonly DocumentRecord<unknown>[]> {
    return [...this.#records.values()].map(cloneRecord);
  }

  async listVersions(location: DocumentLocation): Promise<readonly DocumentVersion[]> {
    return (this.#history.get(canonicalDocumentLocation(location)) ?? []).map(({ version }) => structuredClone(version));
  }

  async readVersion<TSerialized>(location: DocumentLocation, version: DocumentVersion): Promise<DocumentRecord<TSerialized> | null> {
    const record = (this.#history.get(canonicalDocumentLocation(location)) ?? [])
      .find((candidate) => documentVersionsEqual(candidate.version, version));
    return record ? cloneRecord(record as DocumentRecord<TSerialized>) : null;
  }

  isSynchronisationPending(location: DocumentLocation): boolean {
    return this.#pending.has(canonicalDocumentLocation(location));
  }

  acknowledge(location: DocumentLocation): void {
    this.#pending.delete(canonicalDocumentLocation(location));
  }

  async discardPendingSynchronisation(
    location: DocumentLocation,
    options: { readonly discardedRecord?: DocumentRecord<unknown> | null; readonly previousRecord?: DocumentRecord<unknown> | null } = {},
  ): Promise<void> {
    if (location.kind === "memory" && location.key === this.failDiscardKey) {
      throw new Error("second provider discard failed");
    }
    const key = canonicalDocumentLocation(location);
    if (!this.#pending.has(key)) return;
    const previous = options.previousRecord ?? null;
    const discarded = options.discardedRecord ?? this.#records.get(key) ?? null;
    if (previous) this.#records.set(key, cloneRecord(previous));
    else this.#records.delete(key);
    const discardedIds = new Set((this.#history.get(key) ?? [])
      .filter(({ version }) => !previous || version.sequence > previous.version.sequence)
      .map(({ version }) => version.id));
    this.#history.set(key, (this.#history.get(key) ?? [])
      .filter(({ version }) => !discardedIds.has(version.id)));
    for (const [idempotencyKey, entry] of this.#idempotency) {
      if (canonicalDocumentLocation(entry.record.location) === key && discardedIds.has(entry.record.version.id)) {
        this.#idempotency.delete(idempotencyKey);
      }
    }
    if (discarded && !discardedIds.has(discarded.version.id)) {
      throw new Error("discard did not target the pending provider record");
    }
    this.#pending.delete(key);
  }

  async beginCloseTransaction(location: DocumentLocation): Promise<{
    token: string;
    seal(): Promise<void>;
    rollback(): Promise<void>;
    commit(): void;
  }> {
    const key = canonicalDocumentLocation(location);
    if (this.#closeTokens.has(key)) throw new Error("provider close transaction already active");
    const before = this.#capture(key);
    let after: AdapterLocationState | null = null;
    let settled = false;
    const token = `compensable:${this.id}:${key}`;
    this.#closeTokens.set(key, token);
    return {
      token,
      seal: async () => { after = this.#capture(key); },
      rollback: async () => {
        if (settled) return;
        if (after && JSON.stringify(this.#capture(key)) !== JSON.stringify(after)) {
          throw new Error("provider state changed after close precommit");
        }
        this.#restore(key, before);
        settled = true;
        this.#closeTokens.delete(key);
      },
      commit: () => { settled = true; this.#closeTokens.delete(key); },
    };
  }

  inspect(location: DocumentLocation): AdapterLocationState {
    return this.#capture(canonicalDocumentLocation(location));
  }

  #capture(key: string): AdapterLocationState {
    const record = this.#records.get(key);
    return structuredClone({
      record: record ?? null,
      history: this.#history.get(key) ?? [],
      idempotency: [...this.#idempotency.entries()].filter(([, entry]) => canonicalDocumentLocation(entry.record.location) === key),
      pending: this.#pending.has(key),
    });
  }

  #restore(key: string, state: AdapterLocationState): void {
    if (state.record) this.#records.set(key, cloneRecord(state.record));
    else this.#records.delete(key);
    this.#history.set(key, state.history.map(cloneRecord));
    for (const [idempotencyKey, entry] of [...this.#idempotency]) {
      if (canonicalDocumentLocation(entry.record.location) === key) this.#idempotency.delete(idempotencyKey);
    }
    for (const [idempotencyKey, entry] of state.idempotency) {
      this.#idempotency.set(idempotencyKey, structuredClone(entry));
    }
    if (state.pending) this.#pending.add(key);
    else this.#pending.delete(key);
  }
}

async function seedProvider(
  adapter: CompensableDocumentAdapter,
  location: DocumentLocation,
  body: string,
): Promise<DocumentRecord<NoteModel>> {
  const record = await adapter.write({
    location,
    typeId: noteType.id,
    schemaVersion: noteType.schemaVersion,
    content: { title: "Seed", body },
    expectedVersion: null,
    idempotencyKey: `seed:${canonicalDocumentLocation(location)}`,
  });
  adapter.acknowledge(location);
  return record;
}

async function openProviderDocument(
  fixture: ReturnType<typeof createWindowTestDependencies>,
  adapter: CompensableDocumentAdapter,
  documentId: string,
  location: DocumentLocation,
) {
  fixture.runtime.documents.registerAdapter(adapter);
  return fixture.runtime.documents.openDocument<NoteModel>({
    documentId,
    typeId: noteType.id,
    applicationId: "com.syndromatic.Notes",
    location,
  });
}

describe("selected-set precommit compensation", () => {
  it("restores both durable intents, models, dirty state, versions, and recovery when the second discard fails", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const adapter = new CompensableDocumentAdapter();
    const firstLocation = { kind: "memory", namespace: "selected-transaction", key: "discard-a" } as const;
    const secondLocation = { kind: "memory", namespace: "selected-transaction", key: "discard-b" } as const;
    await seedProvider(adapter, firstLocation, "acknowledged a");
    await seedProvider(adapter, secondLocation, "acknowledged b");
    const first = await openProviderDocument(fixture, adapter, "discard-a-document", firstLocation);
    const second = await fixture.runtime.documents.openDocument<NoteModel>({
      documentId: "discard-b-document",
      typeId: noteType.id,
      applicationId: "com.syndromatic.Notes",
      location: secondLocation,
    });
    first.update((model) => ({ ...model, body: "pending a" }), { actionName: "Type" });
    second.update((model) => ({ ...model, body: "pending b" }), { actionName: "Type" });
    await first.save({ reason: "explicit" });
    await second.save({ reason: "explicit" });
    await first.flushRecovery();
    await second.flushRecovery();
    const firstWindow = fixture.manager.create(standardWindow("discard-a-window", {
      documentId: first.id,
      documentAssociationRole: "primary",
    }));
    const secondWindow = fixture.manager.create(standardWindow("discard-b-window", {
      documentId: second.id,
      documentAssociationRole: "primary",
    }));
    await fixture.manager.open(firstWindow.id);
    await fixture.manager.open(secondWindow.id);
    fixture.runtime.documents.registerCloseReviewer({ review: async () => "discard" });
    adapter.failDiscardKey = "discard-b";
    const beginCloseTransaction = vi.spyOn(adapter, "beginCloseTransaction");
    const before = {
      firstDocument: first.snapshot(),
      secondDocument: second.snapshot(),
      firstProvider: adapter.inspect(firstLocation),
      secondProvider: adapter.inspect(secondLocation),
      firstRecovery: first.recoveryRecord,
      secondRecovery: second.recoveryRecord,
    };

    await expect(fixture.manager.requestCloseApplication("com.syndromatic.Notes", {
      reason: "application-quit",
    })).rejects.toThrow("second provider discard failed");

    expect(beginCloseTransaction).toHaveBeenCalledTimes(2);
    expect(first.snapshot()).toEqual(before.firstDocument);
    expect(second.snapshot()).toEqual(before.secondDocument);
    expect(adapter.inspect(firstLocation)).toEqual(before.firstProvider);
    expect(adapter.inspect(secondLocation)).toEqual(before.secondProvider);
    expect(first.recoveryRecord).toEqual(before.firstRecovery);
    expect(second.recoveryRecord).toEqual(before.secondRecovery);
    expect(fixture.manager.list().map(({ id }) => id)).toEqual([firstWindow.id, secondWindow.id]);
  });

  it("restores exact provider versions and dirty recovery when the first save commits and the second save fails", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const manager = fixture.manager;
    const documents = fixture.runtime.documents;
    const adapter = new CompensableDocumentAdapter();
    documents.registerAdapter(adapter);
    const firstLocation = { kind: "memory", namespace: "selected-transaction", key: "save-a" } as const;
    const secondLocation = { kind: "memory", namespace: "selected-transaction", key: "save-b" } as const;
    await seedProvider(adapter, firstLocation, "base a");
    await seedProvider(adapter, secondLocation, "base b");
    const first = await documents.openDocument<NoteModel>({ documentId: "save-a-document", typeId: noteType.id, applicationId: "com.syndromatic.Notes", location: firstLocation });
    const second = await documents.openDocument<NoteModel>({ documentId: "save-b-document", typeId: noteType.id, applicationId: "com.syndromatic.Notes", location: secondLocation });
    first.update((model) => ({ ...model, body: "save a" }), { actionName: "Type" });
    second.update((model) => ({ ...model, body: "save b" }), { actionName: "Type" });
    await first.flushRecovery();
    await second.flushRecovery();
    const firstWindow = manager.create(standardWindow("save-a-window", { documentId: first.id, documentAssociationRole: "primary" }));
    const secondWindow = manager.create(standardWindow("save-b-window", { documentId: second.id, documentAssociationRole: "primary" }));
    await manager.open(firstWindow.id);
    await manager.open(secondWindow.id);
    documents.registerCloseReviewer({ review: async () => "save" });
    adapter.failWriteKey = "save-b";
    const before = {
      firstDocument: first.snapshot(),
      secondDocument: second.snapshot(),
      firstProvider: adapter.inspect(firstLocation),
      secondProvider: adapter.inspect(secondLocation),
      firstRecovery: first.recoveryRecord,
      secondRecovery: second.recoveryRecord,
    };

    await expect(manager.requestCloseApplication("com.syndromatic.Notes", {
      reason: "application-quit",
    })).rejects.toThrow("second provider save failed");

    expect(first.snapshot()).toEqual(before.firstDocument);
    expect(second.snapshot()).toEqual(before.secondDocument);
    expect(adapter.inspect(firstLocation)).toEqual(before.firstProvider);
    expect(adapter.inspect(secondLocation)).toEqual(before.secondProvider);
    expect(first.recoveryRecord).toEqual(before.firstRecovery);
    expect(second.recoveryRecord).toEqual(before.secondRecovery);
    expect(manager.list().map(({ id }) => id)).toEqual([firstWindow.id, secondWindow.id]);
  });

  it("passes the exact destination transaction authority through a selected save-as", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const adapter = new CompensableDocumentAdapter("save-as-authority", "selected-save-as");
    fixture.runtime.documents.registerAdapter(adapter);
    const destination = { kind: "memory", namespace: "selected-save-as", key: "untitled" } as const;
    const document = await fixture.runtime.documents.newDocument<NoteModel>({
      documentId: "selected-save-as-document",
      typeId: noteType.id,
      applicationId: "com.example.selected-save-as-app",
    });
    document.update((model) => ({ ...model, body: "save through the exact transaction" }), { actionName: "Type" });
    fixture.runtime.documents.registerCloseReviewer({ review: async () => "save" });
    fixture.runtime.documents.registerSaveDestinationProvider({
      chooseDestination: async () => ({ destination }),
    });

    await expect(fixture.manager.requestCloseApplication("com.example.selected-save-as-app", {
      reason: "application-quit",
    })).resolves.toMatchObject({ outcome: "closed" });

    await expect(adapter.read<NoteModel>(destination)).resolves.toMatchObject({
      content: { body: "save through the exact transaction" },
    });
  });

  it("rolls back the captured current adapter even when registration changes before close", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const original = new CompensableDocumentAdapter("captured-adapter", "captured-binding");
    const replacement = new CompensableDocumentAdapter("replacement-adapter", "captured-binding");
    const failing = new CompensableDocumentAdapter("later-failing-adapter", "later-binding");
    const originalRegistration = fixture.runtime.documents.registerAdapter(original);
    fixture.runtime.documents.registerAdapter(failing);
    const originalLocation = { kind: "memory", namespace: "captured-binding", key: "first" } as const;
    const failingLocation = { kind: "memory", namespace: "later-binding", key: "second" } as const;
    await seedProvider(original, originalLocation, "original base");
    await seedProvider(failing, failingLocation, "failing base");
    const first = await fixture.runtime.documents.openDocument<NoteModel>({
      documentId: "captured-binding-document",
      typeId: noteType.id,
      applicationId: "com.example.captured-binding-app",
      location: originalLocation,
    });
    const second = await fixture.runtime.documents.openDocument<NoteModel>({
      documentId: "later-binding-document",
      typeId: noteType.id,
      applicationId: "com.example.captured-binding-app",
      location: failingLocation,
    });
    originalRegistration.dispose();
    fixture.runtime.documents.registerAdapter(replacement);
    first.update((model) => ({ ...model, body: "must roll back on original" }), { actionName: "Type" });
    second.update((model) => ({ ...model, body: "fails later" }), { actionName: "Type" });
    fixture.runtime.documents.registerCloseReviewer({ review: async () => "save" });
    failing.failWriteKey = "second";
    const before = original.inspect(originalLocation);

    await expect(fixture.manager.requestCloseApplication("com.example.captured-binding-app", {
      reason: "application-quit",
    })).rejects.toThrow("second provider save failed");

    expect(original.inspect(originalLocation)).toEqual(before);
    expect(first.model.body).toBe("must roll back on original");
    expect(first.state).toBe("dirty");
  });

  it("returns a typed refusal before mutation when a selected save provider cannot compensate", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const backing = new CompensableDocumentAdapter("non-transactional-backing", "non-transactional");
    const adapter: DocumentStorageAdapter = {
      id: "non-transactional",
      capabilities: backing.capabilities,
      supports: (location) => backing.supports(location),
      read: (location, options) => backing.read(location, options),
      write: (request) => backing.write(request),
      remove: (location, version) => backing.remove(location, version),
      list: () => backing.list(),
      listVersions: (location) => backing.listVersions(location),
      readVersion: (location, version) => backing.readVersion(location, version),
    };
    fixture.runtime.documents.registerAdapter(adapter);
    const location = { kind: "memory", namespace: "non-transactional", key: "document" } as const;
    await seedProvider(backing, location, "base");
    const document = await fixture.runtime.documents.openDocument<NoteModel>({
      documentId: "non-transactional-document",
      typeId: noteType.id,
      applicationId: "com.example.non-transactional-app",
      location,
    });
    document.update((model) => ({ ...model, body: "dirty" }), { actionName: "Type" });
    fixture.runtime.documents.registerCloseReviewer({ review: async () => "save" });
    const before = backing.inspect(location);

    await expect(fixture.runtime.documents.prepareCloseDocuments(
      [document.id],
      "application-quit",
    )).resolves.toMatchObject({
      status: "refused",
      documentId: document.id,
      reason: "storage-transaction-unavailable",
    });
    expect(backing.inspect(location)).toEqual(before);
    expect(document.state).toBe("dirty");
  });

  it("settles provider authority when a presentation coordinator throws after the structural callback", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const adapter = new CompensableDocumentAdapter("post-callback-adapter", "post-callback");
    fixture.runtime.documents.registerAdapter(adapter);
    const location = { kind: "memory", namespace: "post-callback", key: "document" } as const;
    await seedProvider(adapter, location, "base");
    const document = await fixture.runtime.documents.openDocument<NoteModel>({
      documentId: "post-callback-document",
      typeId: noteType.id,
      applicationId: "com.example.post-callback-app",
      location,
    });
    document.update((model) => ({ ...model, body: "committed body" }), { actionName: "Type" });
    document.associateWindow({ windowControllerId: "post-callback-window", role: "primary" });
    fixture.runtime.documents.registerCloseReviewer({ review: async () => "save" });
    fixture.runtime.documents.registerPresentationCloseCoordinator({
      prepareCloseSet: async ({ documents }) => ({
        status: "ready",
        token: "post-callback-presentation",
        documentIds: documents.map(({ documentId }) => documentId),
        associationIdsByDocument: Object.fromEntries(documents.map(({ documentId, associations }) => [
          documentId,
          associations.map(({ windowControllerId }) => windowControllerId),
        ])),
      }),
      validateCloseSet: () => undefined,
      commitCloseSet: (_preparation, commitDocuments) => {
        commitDocuments();
        throw new Error("late presentation cleanup failed");
      },
      rollbackCloseSet: () => undefined,
    });
    const preparation = await fixture.runtime.documents.prepareCloseDocuments(
      [document.id],
      "application-quit",
    );
    expect(preparation.status).toBe("ready");
    if (preparation.status !== "ready") throw new Error("expected a ready selected close");

    expect(() => fixture.runtime.documents.commitCloseDocuments(preparation)).not.toThrow();
    expect(fixture.runtime.documents.getDocument(document.id)).toBeNull();
    const committed = await adapter.read<NoteModel>(location);
    expect(committed).not.toBeNull();
    await expect(adapter.write({
      location,
      typeId: noteType.id,
      schemaVersion: noteType.schemaVersion,
      content: { title: "External", body: "authority released" },
      expectedVersion: committed!.version,
      idempotencyKey: "post-callback-external-write",
    })).resolves.toMatchObject({ content: { body: "authority released" } });
  });

  it("refuses a selected synchronising transaction while its remote send is active", async () => {
    const environment = createTestRuntimeEnvironment();
    const local = new InMemoryDocumentAdapter(environment);
    const remoteBacking = new InMemoryDocumentAdapter(environment);
    const remoteEntered = deferred<void>();
    const releaseRemote = deferred<void>();
    const remote: DocumentStorageAdapter = {
      id: "held-remote",
      capabilities: remoteBacking.capabilities,
      supports: (location) => remoteBacking.supports(location),
      read: (location, options) => remoteBacking.read(location, options),
      write: async (request) => {
        remoteEntered.resolve();
        await releaseRemote.promise;
        return remoteBacking.write(request);
      },
      remove: (location, version, options) => remoteBacking.remove(location, version, options),
      list: (query) => remoteBacking.list(query),
      listVersions: (location, options) => remoteBacking.listVersions(location, options),
      readVersion: (location, version, options) => remoteBacking.readVersion(location, version, options),
    };
    let online = false;
    const synchronising = new SynchronisingDocumentAdapter({ local, remote, online: () => online, environment });
    const location = { kind: "memory", namespace: "active-selected-flush", key: "document" } as const;
    await synchronising.write({
      location,
      typeId: noteType.id,
      schemaVersion: noteType.schemaVersion,
      content: { title: "Pending", body: "remote send" },
      expectedVersion: null,
      idempotencyKey: "active-selected-flush",
    });
    online = true;
    const flushing = synchronising.flush();
    await remoteEntered.promise;
    const beginOutcome = await Promise.race([
      synchronising.beginCloseTransaction(location).then(
        () => "resolved" as const,
        () => "rejected" as const,
      ),
      new Promise<"pending">((resolve) => environment.setTimeout(() => resolve("pending"), 0)),
    ]);
    releaseRemote.resolve();
    await flushing;

    expect(beginOutcome).toBe("rejected");
    await synchronising.dispose();
  });

  it("does not report a close settled before durable provider transaction finalisation", async () => {
    const environment = createTestRuntimeEnvironment();
    const fixture = createWindowTestDependencies({ environment });
    cleanups.push(fixture.cleanup);
    const backing = new CompensableDocumentAdapter("held-commit-backing", "held-commit");
    const commitEntered = deferred<void>();
    const releaseCommit = deferred<void>();
    const adapter: DocumentStorageAdapter = {
      id: "held-commit",
      capabilities: backing.capabilities,
      supports: (location) => backing.supports(location),
      read: (location, options) => backing.read(location, options),
      write: (request) => backing.write(request),
      remove: (location, version) => backing.remove(location, version),
      list: () => backing.list(),
      listVersions: (location) => backing.listVersions(location),
      readVersion: (location, version) => backing.readVersion(location, version),
      beginCloseTransaction: async (location) => {
        const transaction = await backing.beginCloseTransaction(location);
        return {
          token: transaction.token,
          seal: () => transaction.seal(),
          rollback: () => transaction.rollback(),
          commit: async () => {
            commitEntered.resolve();
            await releaseCommit.promise;
            transaction.commit();
          },
        };
      },
    };
    fixture.runtime.documents.registerAdapter(adapter);
    const location = { kind: "memory", namespace: "held-commit", key: "document" } as const;
    const document = await fixture.runtime.documents.newDocument<NoteModel>({
      documentId: "held-provider-finalisation-document",
      typeId: noteType.id,
      applicationId: "com.example.held-provider-finalisation-app",
      location,
    });
    document.update((model) => ({ ...model, body: "save before close" }), { actionName: "Type" });
    fixture.runtime.documents.registerCloseReviewer({ review: async () => "save" });

    const closeOutcome = fixture.manager.requestCloseApplication("com.example.held-provider-finalisation-app", {
      reason: "application-quit",
    }).then(
      () => "settled" as const,
      () => "rejected" as const,
    );
    await commitEntered.promise;
    const beforeRelease = await Promise.race([
      closeOutcome,
      new Promise<"pending">((resolve) => environment.setTimeout(() => resolve("pending"), 0)),
    ]);
    releaseCommit.resolve();

    expect(beforeRelease).toBe("pending");
    await expect(closeOutcome).resolves.toBe("settled");
  });

  it("does not report a close settled before its exact recovery record is durably removed", async () => {
    const environment = createTestRuntimeEnvironment();
    const backing = new InMemoryDocumentRecoveryStore();
    const removeEntered = deferred<void>();
    const releaseRemove = deferred<void>();
    const recovery: DocumentRecoveryStore = {
      write: (record, version, signal) => backing.write(record, version, signal),
      read: (recoveryId, signal) => backing.read(recoveryId, signal),
      remove: async (recoveryId, version, signal) => {
        removeEntered.resolve();
        await releaseRemove.promise;
        await backing.remove(recoveryId, version, signal);
      },
    };
    const runtime = createTestRuntime({ environment, applicationDocuments: { recoveryStore: recovery } });
    cleanups.push(async () => { await runtime.dispose("held-recovery-finalisation-test"); });
    runtime.documents.registerType(noteType);
    const document = await runtime.documents.newDocument<NoteModel>({
      documentId: "held-recovery-finalisation-document",
      typeId: noteType.id,
    });
    document.update((model) => ({ ...model, body: "recoverable draft" }), { actionName: "Type" });
    await document.flushRecovery();
    const recoveryId = document.recoveryRecord!.recoveryId;
    runtime.documents.registerCloseReviewer({ review: async () => "discard" });

    const closeOutcome = runtime.documents.closeDocument(document.id, "command").then(
      () => "settled" as const,
      () => "rejected" as const,
    );
    await removeEntered.promise;
    const beforeRelease = await Promise.race([
      closeOutcome,
      new Promise<"pending">((resolve) => environment.setTimeout(() => resolve("pending"), 0)),
    ]);
    releaseRemove.resolve();

    expect(beforeRelease).toBe("pending");
    await expect(closeOutcome).resolves.toBe("settled");
    await expect(backing.read(recoveryId)).resolves.toBeNull();
  });
});

describe("application-session close lease", () => {
  it("closes a same-application dirty document even when the application has no window", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const document = await fixture.runtime.documents.newDocument({
      documentId: "document-only-session",
      typeId: noteType.id,
      applicationId: "com.syndromatic.Notes",
    });
    document.update((model) => ({ ...model, body: "no window" }), { actionName: "Type" });
    fixture.runtime.documents.registerCloseReviewer({ review: async () => "discard" });

    await expect(fixture.manager.requestCloseApplication("com.syndromatic.Notes", {
      reason: "application-quit",
    })).resolves.toMatchObject({ outcome: "closed" });
    expect(fixture.runtime.documents.getDocument(document.id)).toBeNull();
  });

  it("rejects late same-application documents and roots while review is held, then closes with no survivors", async () => {
    const reviewEntered = deferred<void>();
    const finishReview = deferred<"discard">();
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const document = await fixture.runtime.documents.newDocument({
      documentId: "leased-session-document",
      typeId: noteType.id,
      applicationId: "com.syndromatic.Notes",
    });
    document.update((model) => ({ ...model, body: "review held" }), { actionName: "Type" });
    const root = fixture.manager.create(standardWindow("leased-session-root", {
      documentId: document.id,
      documentAssociationRole: "primary",
    }));
    await fixture.manager.open(root.id);
    fixture.runtime.documents.registerCloseReviewer({
      review: async () => {
        reviewEntered.resolve();
        return finishReview.promise;
      },
    });

    const closing = fixture.manager.requestCloseApplication("com.syndromatic.Notes", { reason: "application-quit" });
    await reviewEntered.promise;
    const lateDocumentAdmission = await fixture.runtime.documents.newDocument({
      documentId: "late-session-document",
      typeId: noteType.id,
      applicationId: "com.syndromatic.Notes",
    }).then(
      () => ({ status: "admitted" as const, error: null }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    );
    let lateWindowAdmission: { readonly status: "admitted" | "rejected"; readonly error: unknown };
    try {
      fixture.manager.create(standardWindow("late-session-root"));
      lateWindowAdmission = { status: "admitted", error: null };
    } catch (error) {
      lateWindowAdmission = { status: "rejected", error };
    }
    finishReview.resolve("discard");

    await expect(closing).resolves.toMatchObject({ outcome: "closed" });
    expect(lateDocumentAdmission.status).toBe("rejected");
    expect(String(lateDocumentAdmission.error)).toMatch(/application|closing|reserved|lease/i);
    expect(lateWindowAdmission.status).toBe("rejected");
    expect(String(lateWindowAdmission.error)).toMatch(/application|closing|reserved|lease/i);
    expect(fixture.runtime.documents.openDocuments.filter((candidate) => (
      (candidate as unknown as { readonly applicationId?: string | null }).applicationId === "com.syndromatic.Notes"
    ))).toEqual([]);
    expect(fixture.manager.list({ applicationId: "com.syndromatic.Notes" })).toEqual([]);
  });

  it("releases a cancelled application lease so later document and window admission succeeds", async () => {
    const reviewEntered = deferred<void>();
    const finishReview = deferred<"cancel">();
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const document = await fixture.runtime.documents.newDocument({
      documentId: "cancelled-lease-document",
      typeId: noteType.id,
      applicationId: "com.syndromatic.Notes",
    });
    document.update((model) => ({ ...model, body: "cancel lease" }), { actionName: "Type" });
    const root = fixture.manager.create(standardWindow("cancelled-lease-root", {
      documentId: document.id,
      documentAssociationRole: "primary",
    }));
    await fixture.manager.open(root.id);
    fixture.runtime.documents.registerCloseReviewer({ review: async () => {
      reviewEntered.resolve();
      return finishReview.promise;
    } });

    const closing = fixture.manager.requestCloseApplication("com.syndromatic.Notes", { reason: "application-quit" });
    await reviewEntered.promise;
    const lateAdmission = await fixture.runtime.documents.newDocument({
      typeId: noteType.id,
      applicationId: "com.syndromatic.Notes",
    }).then(
      () => ({ status: "admitted" as const, error: null }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    );
    finishReview.resolve("cancel");
    await expect(closing).resolves.toMatchObject({ outcome: "cancelled" });
    expect(lateAdmission.status).toBe("rejected");
    expect(String(lateAdmission.error)).toMatch(/application|closing|reserved|lease/i);

    await expect(fixture.runtime.documents.newDocument({
      documentId: "after-cancel-document",
      typeId: noteType.id,
      applicationId: "com.syndromatic.Notes",
    })).resolves.toMatchObject({ applicationId: "com.syndromatic.Notes" });
    expect(() => fixture.manager.create(standardWindow("after-cancel-root"))).not.toThrow();
  });

  it("keeps AppRegistry unregister inside the same application lease through lifecycle removal", async () => {
    const applicationWillUnregister = deferred<void>();
    const releaseUnregister = deferred<void>();
    const runtime = createTestRuntime();
    cleanups.push(async () => { await runtime.dispose("registry-lease-test"); });
    const harness = createRuntimeHarness(runtime);
    const appId = "com.example.registry-close-lease";
    harness.AppRegistry.registerBundle(createTestBundle({ bundleIdentifier: appId }, {
      lifecycleHooks: {
        applicationWillUnregister: async () => {
          applicationWillUnregister.resolve();
          await releaseUnregister.promise;
        },
      },
    }));

    const unregistering = harness.AppRegistry.unregister(appId);
    await applicationWillUnregister.promise;
    expect(() => harness.AppRegistry.registerBundle(createTestBundle({ bundleIdentifier: appId })))
      .toThrow(/reserved|close/i);
    await expect(runtime.documents.newDocument({ typeId: noteType.id, applicationId: appId }))
      .rejects.toThrow(/reserved|close/i);
    releaseUnregister.resolve();
    await unregistering;
    expect(harness.AppRegistry.getApp(appId)).toBeNull();
  });

  it("keeps LaunchServices close inside the same application lease through manager suspension", async () => {
    const runtime = createTestRuntime();
    cleanups.push(async () => { await runtime.dispose("launch-lease-test"); });
    const harness = createRuntimeHarness(runtime);
    const appId = "com.example.launch-close-lease";
    harness.AppRegistry.registerBundle(createTestBundle({ bundleIdentifier: appId }));
    const manager = harness.AppManagerController.createManagerForApp(harness.AppRegistry.getApp(appId));
    let lateAdmissionError: unknown = null;
    vi.spyOn(manager, "suspendForApplicationClose").mockImplementation(async () => {
      try {
        runtime.windows.create(standardWindow("late-launch-window", {
          applicationId: appId,
          applicationSessionId: appId,
        }));
      } catch (error) {
        lateAdmissionError = error;
      }
      return false;
    });

    await harness.LaunchServices.closeApp(appId);
    expect(lateAdmissionError).toBeInstanceOf(Error);
    expect(String((lateAdmissionError as Error).message)).toMatch(/reserved|close/i);
    expect(runtime.windows.list({ applicationId: appId })).toEqual([]);
  });

  it("invalidates a launch that was admitted before close while bundle readiness was pending", async () => {
    const moduleLoadEntered = deferred<void>();
    const releaseModule = deferred<{ default: () => null }>();
    const runtime = createTestRuntime();
    cleanups.push(async () => { await runtime.dispose("stale-launch-test"); });
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    const harness = createRuntimeHarness(runtime);
    const appId = "com.example.stale-held-launch";
    harness.PolicyKit.setAccessMode("public");
    harness.AppRegistry.registerBundle(createTestBundle({ bundleIdentifier: appId, policy: { public: true } }, {
      loadModule: async () => {
        moduleLoadEntered.resolve();
        return releaseModule.promise;
      },
    }));

    expect(harness.LaunchServices.openApp(appId, { source: "developer" })).not.toBeNull();
    await moduleLoadEntered.promise;
    await expect(harness.LaunchServices.closeApp(appId)).resolves.toBeNull();
    releaseModule.resolve({ default: () => null });
    await vi.waitFor(() => {
      expect(harness.LaunchServices.inspect().active).toBeNull();
    });

    expect(runtime.windows.list({ applicationId: appId })).toEqual([]);
    expect(harness.LaunchServices.getHistory().filter((entry: { appId: string }) => entry.appId === appId)
      .map((entry: { action: string }) => entry.action)).not.toContain("complete");
  });

  it("removes held same-application launch requests before releasing close authority", async () => {
    const runtime = createTestRuntime();
    cleanups.push(async () => { await runtime.dispose("queued-close-test"); });
    const harness = createRuntimeHarness(runtime);
    const appId = "com.example.queued-before-close";
    harness.AppRegistry.registerBundle(createTestBundle({ bundleIdentifier: appId, policy: { public: true } }));
    expect(harness.LaunchServices.queueLaunch(appId, { source: "developer", hold: true })).not.toBeNull();
    expect(harness.LaunchServices.inspect().queued).toHaveLength(1);

    await harness.LaunchServices.closeApp(appId);

    expect(harness.LaunchServices.inspect().queued).toEqual([]);
    expect(harness.LaunchServices.getHistory().filter((entry: { appId: string }) => entry.appId === appId)
      .map((entry: { action: string }) => entry.action)).toContain("cancelled");
  });

  it("holds application close authority until asynchronous suspend hooks settle", async () => {
    const suspendEntered = deferred<void>();
    const releaseSuspend = deferred<void>();
    const runtime = createTestRuntime();
    cleanups.push(async () => { await runtime.dispose("awaited-suspend-test"); });
    runtime.documents.registerType(noteType);
    const harness = createRuntimeHarness(runtime);
    const appId = "com.example.awaited-suspend-close";
    harness.AppRegistry.registerBundle(createTestBundle({ bundleIdentifier: appId }, {
      lifecycleHooks: {
        applicationWillSuspend: async () => {
          suspendEntered.resolve();
          await releaseSuspend.promise;
        },
      },
    }));
    harness.AppManagerController.createManagerForApp(harness.AppRegistry.getApp(appId));

    const closing = harness.LaunchServices.closeApp(appId);
    await suspendEntered.promise;
    await expect(runtime.documents.newDocument({ typeId: noteType.id, applicationId: appId }))
      .rejects.toThrow(/reserved|close|membership/i);
    releaseSuspend.resolve();
    await closing;
    await expect(runtime.documents.newDocument({ typeId: noteType.id, applicationId: appId }))
      .resolves.toMatchObject({ applicationId: appId });
  });

  it("rejects registration when its will-register hook re-enters application close", async () => {
    const runtime = createTestRuntime();
    cleanups.push(async () => { await runtime.dispose("reentrant-registration-test"); });
    const harness = createRuntimeHarness(runtime);
    const appId = "com.example.reentrant-register-close";
    let closing: Promise<unknown> | null = null;
    const bundle = createTestBundle({ bundleIdentifier: appId }, {
      lifecycleHooks: {
        applicationWillRegister: () => {
          closing = harness.LaunchServices.closeApp(appId);
        },
      },
    });

    expect(() => harness.AppRegistry.registerBundle(bundle)).toThrow(/membership|reserved|changed|close/i);
    await closing;
    expect(harness.AppRegistry.getApp(appId)).toBeNull();
  });

  it("publishes bundle registration only after app, manager, store, and epoch authority commit", async () => {
    const runtime = createTestRuntime();
    cleanups.push(async () => { await runtime.dispose("atomic-registration-publication-test"); });
    const harness = createRuntimeHarness(runtime);
    const appId = "com.example.atomic-registration-publication";
    let observed: { app: boolean; manager: boolean; store: boolean } | null = null;
    let closing: Promise<unknown> | null = null;
    runtime.events.subscribe("bundle.register", (event) => {
      if ((event.payload as { appId?: unknown }).appId !== appId) return;
      observed = {
        app: harness.AppRegistry.getApp(appId)?.bundleIdentifier === appId,
        manager: harness.AppManagerController.getManagerForApp(appId)?.bundleIdentifier === appId,
        store: harness.RuntimeStore.getSnapshot().appInfo[appId]?.bundleIdentifier === appId,
      };
      closing = harness.LaunchServices.closeApp(appId);
    });

    expect(harness.AppRegistry.registerBundle(createTestBundle({ bundleIdentifier: appId }))).toMatchObject({ bundleIdentifier: appId });
    expect(observed).toEqual({ app: true, manager: true, store: true });
    await closing;
  });

  it("publishes bundle updates and manager replacement only after the replacement generation commits", () => {
    const runtime = createTestRuntime();
    cleanups.push(async () => { await runtime.dispose("atomic-registration-update-test"); });
    const harness = createRuntimeHarness(runtime);
    const appId = "com.example.atomic-registration-update";
    harness.AppRegistry.registerBundle(createTestBundle({ bundleIdentifier: appId, displayName: "Generation A" }));
    const observations: Array<{ event: string; app: string | null; manager: string | null; store: string | null }> = [];
    const observe = (event: string) => observations.push({
      event,
      app: harness.AppRegistry.getApp(appId)?.displayName ?? null,
      manager: harness.AppManagerController.getManagerForApp(appId)?.appInfo.displayName ?? null,
      store: harness.RuntimeStore.getSnapshot().appInfo[appId]?.displayName ?? null,
    });
    runtime.events.subscribe("bundle.update", (event) => {
      if ((event.payload as { appId?: unknown }).appId === appId) observe("bundle.update");
    });
    runtime.events.subscribe("app.manager.replace", (event) => {
      if ((event.payload as { appId?: unknown }).appId === appId) observe("app.manager.replace");
    });

    expect(harness.AppRegistry.registerBundle(createTestBundle({ bundleIdentifier: appId, displayName: "Generation B" })))
      .toMatchObject({ displayName: "Generation B" });
    expect(observations).toEqual([
      { event: "bundle.update", app: "Generation B", manager: "Generation B", store: "Generation B" },
      { event: "app.manager.replace", app: "Generation B", manager: "Generation B", store: "Generation B" },
    ]);
  });

  it("rolls back silent bundle authority when manager construction fails before registration commit", () => {
    const runtime = createTestRuntime();
    cleanups.push(async () => { await runtime.dispose("registration-manager-failure-test"); });
    const harness = createRuntimeHarness(runtime);
    const appId = "com.example.registration-manager-failure";
    const publications = vi.fn();
    runtime.events.subscribe("bundle.register", (event) => {
      if ((event.payload as { appId?: unknown }).appId === appId) publications();
    });
    vi.spyOn(harness.AppManagerController, "createManagerForApp")
      .mockImplementationOnce(() => { throw new Error("manager construction failed"); });

    expect(harness.AppRegistry.registerBundle(createTestBundle({ bundleIdentifier: appId }))).toBeNull();
    expect(harness.BundleLoader.getBundle(appId)).toBeNull();
    expect(harness.AppRegistry.getApp(appId)).toBeNull();
    expect(harness.AppManagerController.getManagerForApp(appId)).toBeNull();
    expect(publications).not.toHaveBeenCalled();
  });

  it("restores the exact loaded bundle and manager generation when an update transaction fails", async () => {
    const runtime = createTestRuntime();
    cleanups.push(async () => { await runtime.dispose("registration-update-failure-test"); });
    const harness = createRuntimeHarness(runtime);
    const appId = "com.example.registration-update-failure";
    harness.AppRegistry.registerBundle(createTestBundle({ bundleIdentifier: appId, displayName: "Stable Generation" }));
    const previousBundle = harness.BundleLoader.getBundle(appId);
    const previousLoaded = await harness.BundleLoader.loadBundle(appId);
    const previousManager = harness.AppManagerController.getManagerForApp(appId);
    const publications = vi.fn();
    runtime.events.subscribe("bundle.update", (event) => {
      if ((event.payload as { appId?: unknown }).appId === appId) publications();
    });
    vi.spyOn(harness.AppManagerController, "createManagerForApp")
      .mockImplementationOnce(() => { throw new Error("replacement manager construction failed"); });

    expect(harness.AppRegistry.registerBundle(createTestBundle({ bundleIdentifier: appId, displayName: "Broken Generation" }))).toBeNull();
    expect(harness.BundleLoader.getBundle(appId)).toBe(previousBundle);
    expect(harness.BundleLoader.getLoadedBundle(appId)).toBe(previousLoaded);
    expect(harness.AppManagerController.getManagerForApp(appId)).toBe(previousManager);
    expect(harness.AppRegistry.getApp(appId)?.displayName).toBe("Stable Generation");
    expect(publications).not.toHaveBeenCalled();
  });

  it("releases a self-owned close lease when a non-canonical application ID is rejected", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);

    await expect(fixture.manager.requestCloseApplication(" com.syndromatic.Notes ", {
      reason: "application-quit",
    })).rejects.toThrow(/canonical|application/i);

    const authority = fixture.manager.beginApplicationClose("com.syndromatic.Notes");
    fixture.manager.endApplicationClose(authority);
  });

  it("invalidates deferred workspace restoration admitted before an otherwise empty application closes", async () => {
    const restoreEntered = deferred<void>();
    const releaseRestore = deferred<void>();
    const source = createWindowTestDependencies({
      namespace: "tests.session-restoration",
      installationId: "session-restoration-installation",
    });
    cleanups.push(source.cleanup);
    source.manager.create(standardWindow("stale-restoration-window", {
      applicationId: "com.example.restoration-close-app",
      applicationSessionId: "com.example.restoration-close-app",
    }));
    const snapshot = JSON.parse(JSON.stringify(source.manager.createRestorationSnapshot())) as WindowRestorationSnapshot;
    let restoreAttempts = 0;
    const target = createWindowTestDependencies({
      namespace: "tests.session-restoration",
      installationId: "session-restoration-installation",
      contentRestore: vi.fn(async ({ descriptor }) => {
        restoreAttempts += 1;
        if (restoreAttempts === 1) {
          restoreEntered.resolve();
          await releaseRestore.promise;
        }
        return { descriptor, state: null };
      }),
    });
    cleanups.push(target.cleanup);

    const restoring = target.manager.restoreWorkspace(snapshot);
    await restoreEntered.promise;
    await expect(target.manager.requestCloseApplication("com.example.restoration-close-app", {
      reason: "application-quit",
    })).resolves.toBeNull();
    releaseRestore.resolve();
    const staleReport = await restoring;

    expect(staleReport.restoredWindowControllerIds).toEqual([]);
    expect(staleReport.failures).toEqual([expect.objectContaining({
      windowControllerId: "stale-restoration-window",
    })]);
    expect(target.manager.list({ applicationId: "com.example.restoration-close-app" })).toEqual([]);

    const retried = await target.manager.restoreWorkspace(snapshot);
    expect(retried.failures).toEqual([]);
    expect(retried.restoredWindowControllerIds).toEqual(["stale-restoration-window"]);
    expect(restoreAttempts).toBe(2);
  });

  it("refuses an existing document restoration ID owned by another application", async () => {
    const source = createTestRuntime({ id: "runtime:document-restoration-owner-source" });
    const target = createTestRuntime({ id: "runtime:document-restoration-owner-target" });
    cleanups.push(async () => { await source.dispose("document-restoration-owner-source-test"); });
    cleanups.push(async () => { await target.dispose("document-restoration-owner-target-test"); });
    source.documents.registerType(noteType);
    target.documents.registerType(noteType);
    await source.documents.newDocument({
      documentId: "shared-restoration-document",
      typeId: noteType.id,
      applicationId: "com.example.restoration-owner-a",
    });
    const targetDocument = await target.documents.newDocument({
      documentId: "shared-restoration-document",
      typeId: noteType.id,
      applicationId: "com.example.restoration-owner-b",
    });

    const report = await target.documents.restoreSession(source.documents.createRestorationSnapshot());

    expect(report.restoredDocumentIds).toEqual([]);
    expect(report.failures).toEqual([expect.objectContaining({
      documentId: targetDocument.id,
      code: "document-requested-id-conflict",
    })]);
    expect(targetDocument.applicationId).toBe("com.example.restoration-owner-b");
    expect(targetDocument.windowAssociations).toEqual([]);
  });

  it("refuses an existing document restoration ID with another registered type", async () => {
    const source = createTestRuntime({ id: "runtime:document-restoration-type-source" });
    const target = createTestRuntime({ id: "runtime:document-restoration-type-target" });
    cleanups.push(async () => { await source.dispose("document-restoration-type-source-test"); });
    cleanups.push(async () => { await target.dispose("document-restoration-type-target-test"); });
    const alternateType = Object.freeze({ ...noteType, id: "tests.alternate-restoration-note", displayName: "Alternate Note" });
    source.documents.registerType(alternateType);
    target.documents.registerType(noteType);
    await source.documents.newDocument({
      documentId: "shared-restoration-type-document",
      typeId: alternateType.id,
      applicationId: "com.example.restoration-type-owner",
    });
    const targetDocument = await target.documents.newDocument({
      documentId: "shared-restoration-type-document",
      typeId: noteType.id,
      applicationId: "com.example.restoration-type-owner",
    });

    const report = await target.documents.restoreSession(source.documents.createRestorationSnapshot());

    expect(report.restoredDocumentIds).toEqual([]);
    expect(report.failures).toEqual([expect.objectContaining({
      documentId: targetDocument.id,
      code: "document-requested-id-conflict",
    })]);
    expect(targetDocument.type.id).toBe(noteType.id);
  });

  it("refuses restoration-key reuse for a different workspace and window role", async () => {
    const source = createWindowTestDependencies({ namespace: "tests.exact-restoration-membership" });
    const target = createWindowTestDependencies({ namespace: "tests.exact-restoration-membership" });
    cleanups.push(source.cleanup, target.cleanup);
    const restorationKey = "exact-restoration-membership.shared";
    source.manager.create(standardWindow("saved-restoration-window", {
      restorationKey,
      workspaceId: "saved-workspace",
      role: "panel",
      level: "floating",
    }));
    const existing = target.manager.create(standardWindow("existing-restoration-window", {
      restorationKey,
      workspaceId: "live-workspace",
      role: "standard",
    }));

    const report = await target.manager.restoreWorkspace(source.manager.createRestorationSnapshot());

    expect(report.reusedWindowControllerIds).toEqual([]);
    expect(report.failures).toEqual([expect.objectContaining({
      windowControllerId: "saved-restoration-window",
      reason: "identity-conflict",
    })]);
    expect(target.manager.select(existing.id).record.workspaceId).toBe("live-workspace");
  });

  it("resolves a reused parent ID before validating exact child restoration membership", async () => {
    const source = createWindowTestDependencies({ namespace: "tests.remapped-restoration-parent" });
    const target = createWindowTestDependencies({ namespace: "tests.remapped-restoration-parent" });
    cleanups.push(source.cleanup, target.cleanup);
    const parentKey = "remapped-restoration-parent.parent";
    const childKey = "remapped-restoration-parent.child";
    source.manager.create(standardWindow("saved-parent", { restorationKey: parentKey }));
    source.manager.create(standardWindow("saved-child", {
      restorationKey: childKey,
      parentWindowControllerId: "saved-parent",
    }));
    target.manager.create(standardWindow("live-parent", { restorationKey: parentKey }));
    target.manager.create(standardWindow("live-child", {
      restorationKey: childKey,
      parentWindowControllerId: "live-parent",
    }));

    const report = await target.manager.restoreWorkspace(source.manager.createRestorationSnapshot());

    expect(report.failures).toEqual([]);
    expect(report.reusedWindowControllerIds).toEqual(expect.arrayContaining(["live-parent", "live-child"]));
    expect(target.manager.select("live-child").record.parentWindowControllerId).toBe("live-parent");
  });

  it("cancels an active lifecycle launch before close releases application authority", async () => {
    const launchEntered = deferred<void>();
    const releaseLaunch = deferred<void>();
    const runtime = createTestRuntime();
    cleanups.push(async () => { await runtime.dispose("active-lifecycle-close-test"); });
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    const harness = createRuntimeHarness(runtime);
    const appId = "com.example.active-lifecycle-close";
    harness.PolicyKit.setAccessMode("public");
    harness.AppRegistry.registerBundle(createTestBundle({ bundleIdentifier: appId }, {
      lifecycleHooks: {
        applicationWillLaunch: async () => {
          launchEntered.resolve();
          await releaseLaunch.promise;
        },
      },
    }));
    const manager = harness.AppManagerController.createManagerForApp(harness.AppRegistry.getApp(appId));
    const mutation = runtime.windows.captureApplicationMutation(appId);
    await manager.getReady(mutation);
    const launchOutcome = manager.launch(mutation).then(
      () => "completed" as const,
      () => "cancelled" as const,
    );
    await launchEntered.promise;

    const closeAuthority = runtime.windows.beginApplicationClose(appId);
    await manager.cancelApplicationWorkForClose("active-lifecycle-close-test");
    runtime.windows.endApplicationClose(closeAuthority);
    releaseLaunch.resolve();
    expect(await launchOutcome).toBe("cancelled");

    expect(manager.getState()).not.toBe("active");
    expect(harness.RuntimeStore.getSnapshot().application.activeAppId).not.toBe(appId);
    expect(harness.RuntimeStore.getSnapshot().application.openAppIds).not.toContain(appId);
    expect(runtime.windows.list({ applicationId: appId })).toEqual([]);
  });

  it("evicts a stale held request instead of coalescing it into a replacement registration", async () => {
    const runtime = createTestRuntime();
    cleanups.push(async () => { await runtime.dispose("replacement-registration-launch-test"); });
    const harness = createRuntimeHarness(runtime);
    const appId = "com.example.replacement-registration-launch";
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    harness.PolicyKit.setAccessMode("public");
    harness.AppRegistry.registerBundle(createTestBundle({
      bundleIdentifier: appId,
      displayName: "Generation A",
      policy: { public: true },
    }));
    const generationAManager = harness.LaunchServices.queueLaunch(appId, {
      source: "developer",
      hold: true,
    });
    expect(generationAManager).not.toBeNull();

    await harness.AppRegistry.unregister(appId);
    harness.AppRegistry.registerBundle(createTestBundle({
      bundleIdentifier: appId,
      displayName: "Generation B",
      policy: { public: true },
    }));
    const generationBManager = harness.AppManagerController.getManagerForApp(appId);
    const opened = harness.LaunchServices.openApp(appId, {
      source: "developer",
      hold: true,
    });

    expect(opened).toBe(generationBManager);
    expect(opened).not.toBe(generationAManager);
    expect(harness.LaunchServices.getHistory().filter((entry: { appId: string }) => entry.appId === appId)
      .map((entry: { action: string }) => entry.action)).toContain("cancelled");
  });

  it("does not leave cancelled readiness loading or let its late module settle mutate lifecycle", async () => {
    const loadEntered = deferred<void>();
    const releaseLoad = deferred<{ default: () => null }>();
    const runtime = createTestRuntime();
    cleanups.push(async () => { await runtime.dispose("cancelled-readiness-test"); });
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    const harness = createRuntimeHarness(runtime);
    const appId = "com.example.cancelled-readiness";
    harness.PolicyKit.setAccessMode("public");
    harness.AppRegistry.registerBundle(createTestBundle({ bundleIdentifier: appId, policy: { public: true } }, {
      loadModule: async () => {
        loadEntered.resolve();
        return releaseLoad.promise;
      },
    }));
    const manager = harness.LaunchServices.openApp(appId, { source: "developer" });
    expect(manager).not.toBeNull();
    await loadEntered.promise;

    await harness.LaunchServices.closeApp(appId);
    const afterClose = manager!.getState();
    expect(afterClose).not.toBe("loading");
    releaseLoad.resolve({ default: () => null });
    await Promise.resolve();
    await Promise.resolve();

    expect(manager!.getState()).toBe(afterClose);
    expect(manager!.getState()).not.toBe("active");
  });
});

function createDirectController(options: {
  readonly content: WindowContentController;
  readonly shouldClose?: (signal?: AbortSignal) => Promise<boolean>;
}) {
  const environment = createTestRuntimeEnvironment();
  const runtime = createTestRuntime({ environment });
  const registry = new WindowContentRegistry();
  registry.register({ typeId: "transaction-close", create: () => options.content });
  const record = freezeWindowRecord({
    ...standardWindow("direct-close-controller", {
      applicationId: null,
      applicationSessionId: null,
      content: { rendererId: "transaction-close", parameters: null },
    }),
    runtimeId: runtime.runtimeId,
    state: "closed",
    isKey: false,
    isMain: false,
    zIndex: 0,
    chromeMode: "system",
  });
  const controller = new WindowController(record, {
    responders: runtime.responders,
    contentRegistry: registry,
    parentResponderId: "workspace",
    workspaceResponderId: "workspace",
    webspringResponderId: "webspring",
    runtimeResponderId: "runtime",
    delegate: options.shouldClose ? { shouldClose: ({ signal }) => options.shouldClose!(signal) } : undefined,
  });
  cleanups.push(async () => { controller.dispose(); registry.dispose(); await runtime.dispose("direct-controller-test"); });
  return controller;
}

describe("ready content close-token ownership", () => {
  it("rolls a ready content token back exactly once when the caller aborts as it resolves, and permits retry", async () => {
    const abort = new AbortController();
    const rollback = vi.fn();
    const commit = vi.fn();
    let preparationCount = 0;
    const content: WindowContentController = {
      mountKey: "direct-close",
      responderId: "direct-close-content",
      load: async () => undefined,
      prepareClose: vi.fn(async () => {
        preparationCount += 1;
        if (preparationCount === 1) abort.abort("cancel immediately after content readiness");
        return { status: "ready" as const, token: `ready-${preparationCount}`, commit, rollback };
      }),
      unload: vi.fn(),
      dispose: vi.fn(),
    };
    const controller = createDirectController({ content });
    await controller.loadContent(new AbortController().signal);

    await expect(controller.prepareClose({ reason: "command", signal: abort.signal })).rejects.toBeDefined();
    expect(rollback).toHaveBeenCalledOnce();
    const retry = await controller.prepareClose({ reason: "command" });
    expect(retry.status).toBe("ready");
    if (retry.status === "ready") retry.rollback();
    expect(rollback).toHaveBeenCalledTimes(2);
  });

  it("rolls a ready content token back exactly once when an async delegate is aborted", async () => {
    const abort = new AbortController();
    const delegateEntered = deferred<void>();
    const delegateRelease = deferred<boolean>();
    const rollback = vi.fn();
    const content: WindowContentController = {
      mountKey: "delegate-close",
      responderId: "delegate-close-content",
      load: async () => undefined,
      prepareClose: async () => ({ status: "ready", token: "delegate-ready", commit: vi.fn(), rollback }),
      unload: vi.fn(),
      dispose: vi.fn(),
    };
    const controller = createDirectController({
      content,
      shouldClose: async () => {
        delegateEntered.resolve();
        return delegateRelease.promise;
      },
    });
    await controller.loadContent(new AbortController().signal);

    const preparing = controller.prepareClose({ reason: "command", signal: abort.signal });
    await delegateEntered.promise;
    abort.abort("delegate cancelled");
    delegateRelease.resolve(true);
    await expect(preparing).rejects.toBeDefined();
    expect(rollback).toHaveBeenCalledOnce();
  });
});

describe("transaction-wide structural publication", () => {
  it("publishes controllers, manager, and documents only after the complete selected forest is committed", async () => {
    const fixture = createWindowTestDependencies();
    cleanups.push(fixture.cleanup);
    const firstDocument = await fixture.runtime.documents.newDocument({ documentId: "batched-first-document", typeId: noteType.id, applicationId: "com.syndromatic.Notes" });
    const secondDocument = await fixture.runtime.documents.newDocument({ documentId: "batched-second-document", typeId: noteType.id, applicationId: "com.syndromatic.Notes" });
    const firstWindow = fixture.manager.create(standardWindow("batched-first-window", { documentId: firstDocument.id, documentAssociationRole: "primary" }));
    const secondWindow = fixture.manager.create(standardWindow("batched-second-window", { documentId: secondDocument.id, documentAssociationRole: "primary" }));
    await fixture.manager.open(firstWindow.id);
    await fixture.manager.open(secondWindow.id);
    fixture.runtime.documents.registerCloseReviewer({ review: async () => "discard" });
    const observations: Array<{ source: string; documents: number; windows: number; first: string; second: string }> = [];
    const capture = (source: string) => observations.push({
      source,
      documents: fixture.runtime.documents.openDocuments.length,
      windows: fixture.manager.snapshot().windowControllerIds.length,
      first: `${firstWindow.record.state}/${firstWindow.contentState.status}`,
      second: `${secondWindow.record.state}/${secondWindow.contentState.status}`,
    });
    const unsubscribers = [
      firstWindow.subscribe(() => capture("first-controller")),
      secondWindow.subscribe(() => capture("second-controller")),
      fixture.manager.subscribe(() => capture("windows")),
      fixture.runtime.documents.subscribe(() => capture("documents")),
      firstDocument.subscribe(() => capture("first-document")),
      secondDocument.subscribe(() => capture("second-document")),
    ];

    await expect(fixture.manager.requestCloseApplication("com.syndromatic.Notes", { reason: "application-quit" }))
      .resolves.toMatchObject({ outcome: "closed" });
    for (const unsubscribe of unsubscribers) unsubscribe();

    expect(observations).toEqual([
      { source: "windows", documents: 0, windows: 0, first: "closed/disposed", second: "closed/disposed" },
      { source: "first-controller", documents: 0, windows: 0, first: "closed/disposed", second: "closed/disposed" },
      { source: "second-controller", documents: 0, windows: 0, first: "closed/disposed", second: "closed/disposed" },
      { source: "first-document", documents: 0, windows: 0, first: "closed/disposed", second: "closed/disposed" },
      { source: "second-document", documents: 0, windows: 0, first: "closed/disposed", second: "closed/disposed" },
      { source: "documents", documents: 0, windows: 0, first: "closed/disposed", second: "closed/disposed" },
    ]);
  });
});

describe("document structural cleanup diagnostics", () => {
  it("keeps close authoritative while recording bounded redacted timer, watch, and undo cleanup failures", async () => {
    const baseEnvironment = createTestRuntimeEnvironment();
    let structuralCleanup = false;
    const environment = {
      ...baseEnvironment,
      clearTimeout: vi.fn((handle: unknown) => {
        baseEnvironment.clearTimeout(handle);
        if (structuralCleanup) throw new Error(`timer cleanup leaked secret-token ${"x".repeat(2_000)}`);
      }),
    };
    const watchDispose = vi.fn(() => { throw new Error(`watch cleanup leaked secret-token ${"y".repeat(2_000)}`); });
    const backing = new CompensableDocumentAdapter();
    const adapter: DocumentStorageAdapter = {
      ...backing,
      id: "diagnostic-adapter",
      capabilities: { ...backing.capabilities, watch: true },
      supports: (location) => backing.supports(location),
      read: (location, options) => backing.read(location, options),
      write: (request) => backing.write(request),
      remove: (location, version) => backing.remove(location, version),
      list: () => backing.list(),
      listVersions: (location, options) => backing.listVersions(location, options),
      readVersion: (location, version, options) => backing.readVersion(location, version, options),
      watch: () => ({ dispose: watchDispose }),
    };
    const runtime = createTestRuntime({ environment, applicationDocuments: { initialAdapters: [adapter] } });
    cleanups.push(async () => { await runtime.dispose("diagnostic-test"); });
    runtime.documents.registerType(noteType);
    const diagnostics: Array<{ context: string; message: string }> = [];
    runtime.events.subscribe("document.error", (event) => {
      const payload = event.payload as { context?: unknown; message?: unknown };
      diagnostics.push({ context: String(payload.context), message: String(payload.message) });
    });
    const location = { kind: "memory", namespace: "selected-transaction", key: "diagnostic" } as const;
    const document = await runtime.documents.newDocument({ documentId: "diagnostic-document", typeId: noteType.id, location, applicationId: "com.example.diagnostic-app" });
    document.associateWindow({ windowControllerId: "diagnostic-window", role: "primary" });
    runtime.documents.registerCloseReviewer({ review: async () => "discard" });
    runtime.documents.registerPresentationCloseCoordinator({
      prepareClose: async () => ({ status: "ready", token: "diagnostic-presentation", documentId: document.id, associationIds: ["diagnostic-window"] }),
      commitClose: (_preparation, commitDocument) => {
        structuralCleanup = true;
        // Arm an injected recovery timer in the final structural turn so the
        // close path, rather than review preparation, owns its cleanup error.
        document.markUnsaved(documentAdoptionAuthority);
        commitDocument();
      },
      rollbackClose: () => undefined,
    });
    const originalRemove = runtime.undo.remove.bind(runtime.undo);
    vi.spyOn(runtime.undo, "remove").mockImplementation((owner) => {
      if (owner.kind === "document") throw new Error(`undo cleanup leaked secret-token ${"z".repeat(2_000)}`);
      return originalRemove(owner);
    });

    await expect(runtime.documents.closeDocument(document.id, "application-quit"))
      .resolves.toEqual({ outcome: "closed", documentId: document.id });
    expect(runtime.documents.getDocument(document.id)).toBeNull();
    expect(watchDispose).toHaveBeenCalledOnce();
    expect(diagnostics.map(({ context }) => context)).toEqual(expect.arrayContaining([
      expect.stringContaining("timer"),
      expect.stringContaining("watch"),
      expect.stringContaining("undo"),
    ]));
    for (const diagnostic of diagnostics) {
      expect(diagnostic.message.length).toBeLessThanOrEqual(512);
      expect(diagnostic.message).not.toContain("secret-token");
    }
  });
});
