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

import { DocumentUnavailableError } from "../DocumentErrors";
import {
  canonicalDocumentLocation,
  documentVersionsEqual,
  type DocumentLocation,
  type DocumentRecord,
  type DocumentVersion,
} from "../documentTypes";
import { cloneDocumentRecord, throwIfDocumentAborted } from "./InMemoryDocumentAdapter";
import type {
  DocumentAdapterEnvironment,
  DocumentCloseStorageTransaction,
  DocumentListQuery,
  DocumentReadOptions,
  DocumentStorageAdapter,
  DocumentWriteRequest,
} from "./documentAdapterTypes";
import { DocumentVersionConflictError } from "../DocumentErrors";
import type { PersistedDocumentSyncQueueItem } from "./SynchronisingDocumentAdapter";
import { canonicalDocumentJson, immutableDocumentValue } from "../documentTypes";

export interface IndexedDBDocumentAdapterOptions {
  readonly indexedDB: IDBFactory;
  readonly databaseName: string;
  readonly environment: DocumentAdapterEnvironment;
}

interface StoredRecord {
  readonly key: string;
  readonly record: DocumentRecord<unknown>;
}

interface StoredVersion extends StoredRecord { readonly sequence: number }
interface StoredIdempotency extends StoredRecord { readonly idempotencyKey: string; readonly fingerprint: string }
interface StoredSynchronisationMetadata { readonly key: "queue-order"; readonly value: number }
interface StoredCloseLease {
  readonly key: string;
  readonly token: string;
  readonly expiresAt: number;
}

const CLOSE_LEASE_DURATION_MS = 5 * 60 * 1_000;
const CLOSE_LEASE_RENEWAL_MS = 60 * 1_000;

interface IndexedDBCloseLocationState {
  readonly record: StoredRecord | null;
  readonly versions: readonly StoredVersion[];
  readonly idempotency: readonly StoredIdempotency[];
  readonly queue: readonly PersistedDocumentSyncQueueItem[];
  readonly queueOrder: StoredSynchronisationMetadata | null;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

function raceIndexedDBLifecycle<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  disposalSignal: AbortSignal,
): Promise<T> {
  throwIfDocumentAborted(signal);
  if (disposalSignal.aborted) {
    throw new DocumentUnavailableError("The IndexedDB document adapter is disposed.", { retryable: false });
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onOperationAbort);
      disposalSignal.removeEventListener("abort", onDispose);
      callback();
    };
    const onOperationAbort = () => finish(() => {
      try { throwIfDocumentAborted(signal); } catch (error) { reject(error); }
    });
    const onDispose = () => finish(() => reject(
      new DocumentUnavailableError("The IndexedDB document adapter is disposed.", { retryable: false }),
    ));
    signal?.addEventListener("abort", onOperationAbort, { once: true });
    disposalSignal.addEventListener("abort", onDispose, { once: true });
    promise.then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)));
  });
}

function writeFingerprint(request: DocumentWriteRequest<unknown>): string {
  return canonicalDocumentJson({
    location: request.location,
    typeId: request.typeId,
    schemaVersion: request.schemaVersion,
    content: request.content,
    expectedVersion: request.expectedVersion,
    idempotencyKey: request.idempotencyKey,
    metadata: request.metadata ?? {},
  }, request.typeId);
}

function etagFor(value: unknown, typeId: string): string {
  const source = canonicalDocumentJson(value, typeId);
  let hash = 2_166_136_261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `"${(hash >>> 0).toString(16).padStart(8, "0")}"`;
}

function mapIndexedDBError(error: unknown): DocumentUnavailableError | unknown {
  if (error instanceof DocumentVersionConflictError || error instanceof DocumentUnavailableError) return error;
  if (error instanceof DOMException && ["AbortError", "QuotaExceededError", "SecurityError", "InvalidStateError", "UnknownError"].includes(error.name)) {
    return new DocumentUnavailableError(`IndexedDB document storage failed: ${error.message}`, { cause: error, retryable: error.name !== "SecurityError" });
  }
  return error;
}

export class IndexedDBDocumentAdapter implements DocumentStorageAdapter {
  readonly id = "indexed-db";
  readonly atomicSynchronisationQueueAdoption = true;
  readonly atomicIntermediateSynchronisationQueueAdoption = true;
  readonly capabilities = Object.freeze({
    versions: true,
    delete: true,
    watch: false,
    offline: true,
    atomicConditionalWrite: true,
  });
  readonly #indexedDB: IDBFactory;
  readonly #databaseName: string;
  readonly #environment: DocumentAdapterEnvironment;
  #databasePromise: Promise<IDBDatabase> | null = null;
  readonly #disposeController = new AbortController();
  readonly #transactions = new Set<IDBTransaction>();
  readonly #closeTransactions = new Set<string>();
  readonly #closeLeaseHeartbeats = new Map<string, unknown>();
  #disposed = false;

  constructor(options: IndexedDBDocumentAdapterOptions) {
    this.#indexedDB = options.indexedDB;
    this.#databaseName = options.databaseName;
    this.#environment = options.environment;
  }

  supports(location: DocumentLocation): boolean {
    return location.kind === "indexed-db" && location.database === this.#databaseName;
  }

  async open(signal?: AbortSignal): Promise<void> { await this.#database(signal); }

  close(): void {
    const pending = this.#databasePromise;
    this.#databasePromise = null;
    void pending?.then((database) => database.close(), () => undefined);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#disposeController.abort("indexeddb-document-adapter-disposed");
    for (const transaction of [...this.#transactions]) {
      try { transaction.abort(); } catch { /* transaction already completed */ }
    }
    this.#transactions.clear();
    for (const key of [...this.#closeLeaseHeartbeats.keys()]) this.#cancelCloseLeaseHeartbeat(key);
    this.close();
  }

  async read<TSerialized>(location: DocumentLocation, options: DocumentReadOptions = {}): Promise<DocumentRecord<TSerialized> | null> {
    throwIfDocumentAborted(options.signal);
    const database = await this.#database(options.signal);
    const transaction = this.#transaction(database, "records", "readonly");
    const stored = await requestResult(transaction.objectStore("records").get(this.#key(location))) as StoredRecord | undefined;
    await transactionComplete(transaction);
    throwIfDocumentAborted(options.signal);
    return stored ? cloneDocumentRecord(stored.record as DocumentRecord<TSerialized>) : null;
  }

  async write<TSerialized>(request: DocumentWriteRequest<TSerialized>): Promise<DocumentRecord<TSerialized>> {
    return this.#writeTransaction(request);
  }

  async writeWithSynchronisationIntent<TSerialized>(
    request: DocumentWriteRequest<TSerialized>,
    createItem: (record: DocumentRecord<TSerialized>) => PersistedDocumentSyncQueueItem,
  ): Promise<DocumentRecord<TSerialized>> {
    return this.#writeTransaction(request, createItem);
  }

  async #writeTransaction<TSerialized>(
    request: DocumentWriteRequest<TSerialized>,
    createItem?: (record: DocumentRecord<TSerialized>) => PersistedDocumentSyncQueueItem,
  ): Promise<DocumentRecord<TSerialized>> {
    throwIfDocumentAborted(request.signal);
    request = {
      ...request,
      content: immutableDocumentValue(request.content, request.typeId),
      metadata: request.metadata ? immutableDocumentValue(request.metadata, request.typeId) : undefined,
    };
    const key = this.#key(request.location);
    const fingerprint = writeFingerprint(request);
    const database = await this.#database(request.signal);
    const transaction = this.#transaction(database,
      createItem
        ? ["records", "versions", "idempotency", "syncQueue", "syncMetadata", "closeLeases"]
        : ["records", "versions", "idempotency", "closeLeases"],
      "readwrite",
    );
    const completed = transactionComplete(transaction);
    try {
      await this.#assertCloseMutationAllowed(transaction, key, request.closeTransactionToken);
      if (createItem) {
        const locationIdentity = canonicalDocumentLocation(request.location);
        const queue = await requestResult(
          transaction.objectStore("syncQueue").getAll(),
        ) as PersistedDocumentSyncQueueItem[];
        if (queue.some((item) => item.state === "discarded" &&
            canonicalDocumentLocation(item.localLocation) === locationIdentity)) {
          throw new DocumentUnavailableError(
            "A durable synchronisation discard is still reconciling this location.",
            { retryable: true },
          );
        }
      }
      const idempotency = await requestResult(transaction.objectStore("idempotency").get(request.idempotencyKey)) as StoredIdempotency | undefined;
      if (idempotency) {
        if (idempotency.fingerprint !== fingerprint) {
          throw new DocumentUnavailableError(`Idempotency key "${request.idempotencyKey}" was reused for a different write.`, { retryable: false });
        }
        await completed;
        return cloneDocumentRecord(idempotency.record as DocumentRecord<TSerialized>);
      }
      const currentStored = await requestResult(transaction.objectStore("records").get(key)) as StoredRecord | undefined;
      const current = currentStored?.record as DocumentRecord<TSerialized> | undefined;
      if ((request.expectedVersion === null && current) ||
          (request.expectedVersion !== null && (!current || !documentVersionsEqual(request.expectedVersion, current.version)))) {
        throw new DocumentVersionConflictError(request.location, request.expectedVersion, current ? cloneDocumentRecord(current) : null);
      }
      const savedAt = new Date(this.#environment.now()).toISOString();
      const sequence = (current?.version.sequence ?? 0) + 1;
      const record: DocumentRecord<TSerialized> = {
        location: structuredClone(request.location),
        typeId: request.typeId,
        schemaVersion: request.schemaVersion,
        content: structuredClone(request.content),
        version: {
          id: this.#environment.randomUUID(),
          sequence,
          savedAt,
          etag: etagFor({ fingerprint, sequence, savedAt }, request.typeId),
        },
        createdAt: current?.createdAt ?? savedAt,
        updatedAt: savedAt,
        metadata: { ...(request.metadata ?? {}) },
      };
      const stored: StoredRecord = { key, record: cloneDocumentRecord(record) };
      await requestResult(transaction.objectStore("records").put(stored));
      await requestResult(transaction.objectStore("versions").put({ ...stored, sequence } satisfies StoredVersion));
      await requestResult(transaction.objectStore("idempotency").put({
        ...stored,
        idempotencyKey: request.idempotencyKey,
        fingerprint,
      } satisfies StoredIdempotency));
      if (createItem) {
        const metadataStore = transaction.objectStore("syncMetadata");
        const metadata = await requestResult(metadataStore.get("queue-order")) as StoredSynchronisationMetadata | undefined;
        const order = (metadata?.value ?? 0) + 1;
        await requestResult(metadataStore.put({ key: "queue-order", value: order } satisfies StoredSynchronisationMetadata));
        await requestResult(transaction.objectStore("syncQueue").put(structuredClone({
          ...createItem(record),
          order,
        })));
      }
      await completed;
      return cloneDocumentRecord(record);
    } catch (error) {
      try { transaction.abort(); } catch { /* already completed */ }
      await completed.catch(() => undefined);
      throw mapIndexedDBError(error);
    }
  }

  async remove(location: DocumentLocation, expectedVersion: DocumentVersion, options: DocumentReadOptions = {}): Promise<void> {
    throwIfDocumentAborted(options.signal);
    const key = this.#key(location);
    const database = await this.#database(options.signal);
    const transaction = this.#transaction(database, ["records", "idempotency", "closeLeases"], "readwrite");
    const completed = transactionComplete(transaction);
    try {
      await this.#assertCloseMutationAllowed(transaction, key, options.closeTransactionToken);
      const stored = await requestResult(transaction.objectStore("records").get(key)) as StoredRecord | undefined;
      if (!stored || !documentVersionsEqual(stored.record.version, expectedVersion)) {
        throw new DocumentVersionConflictError(location, expectedVersion, stored ? cloneDocumentRecord(stored.record) : null);
      }
      await requestResult(transaction.objectStore("records").delete(key));
      const idempotency = await requestResult(transaction.objectStore("idempotency").getAll()) as StoredIdempotency[];
      for (const entry of idempotency) {
        if (entry.key === key && documentVersionsEqual(entry.record.version, expectedVersion)) {
          await requestResult(transaction.objectStore("idempotency").delete(entry.idempotencyKey));
        }
      }
      await completed;
    } catch (error) {
      try { transaction.abort(); } catch { /* already completed */ }
      await completed.catch(() => undefined);
      throw mapIndexedDBError(error);
    }
  }

  async readSynchronisationQueue(signal?: AbortSignal): Promise<readonly PersistedDocumentSyncQueueItem[]> {
    throwIfDocumentAborted(signal);
    const database = await this.#database(signal);
    const transaction = this.#transaction(database, "syncQueue", "readonly");
    const items = await requestResult(transaction.objectStore("syncQueue").getAll()) as PersistedDocumentSyncQueueItem[];
    await transactionComplete(transaction);
    throwIfDocumentAborted(signal);
    return Object.freeze(items
      .map((item) => structuredClone(immutableDocumentValue(item, "document.sync-queue") as PersistedDocumentSyncQueueItem))
      .sort((left, right) => left.order - right.order));
  }

  async persistSynchronisationQueueItem(item: PersistedDocumentSyncQueueItem, signal?: AbortSignal): Promise<void> {
    throwIfDocumentAborted(signal);
    item = immutableDocumentValue(item, "document.sync-queue") as PersistedDocumentSyncQueueItem;
    const database = await this.#database(signal);
    const transaction = this.#transaction(database, ["syncQueue", "closeLeases"], "readwrite");
    const completed = transactionComplete(transaction);
    try {
      await this.#assertCloseMutationAllowed(
        transaction,
        this.#key(item.localLocation),
        undefined,
      );
      await requestResult(transaction.objectStore("syncQueue").put(structuredClone(item)));
      await completed;
    } catch (error) {
      try { transaction.abort(); } catch { /* already completed */ }
      await completed.catch(() => undefined);
      throw mapIndexedDBError(error);
    }
  }

  async claimSynchronisationQueueItem(
    id: string,
    ownerId: string,
    expectedGeneration: number,
    now: number,
    leaseMs: number,
    signal?: AbortSignal,
  ): Promise<PersistedDocumentSyncQueueItem | null> {
    throwIfDocumentAborted(signal);
    const database = await this.#database(signal);
    const transaction = this.#transaction(database, ["syncQueue", "closeLeases"], "readwrite");
    const completed = transactionComplete(transaction);
    try {
      const store = transaction.objectStore("syncQueue");
      const current = await requestResult(store.get(id)) as PersistedDocumentSyncQueueItem | undefined;
      if (!current) { await completed; return null; }
      await this.#assertCloseMutationAllowed(transaction, this.#key(current.localLocation), undefined);
      if (current.state === "discarded") { await completed; return null; }
      if ((current.leaseGeneration ?? 0) !== expectedGeneration) {
        await completed;
        return null;
      }
      if (current.leaseOwnerId && current.leaseOwnerId !== ownerId &&
          current.leaseExpiresAt && Date.parse(current.leaseExpiresAt) > now) {
        await completed;
        return null;
      }
      const claimed: PersistedDocumentSyncQueueItem = {
        ...current,
        state: "sending",
        attemptCount: current.attemptCount + 1,
        nextAttemptAt: null,
        leaseOwnerId: ownerId,
        leaseExpiresAt: new Date(now + leaseMs).toISOString(),
        leaseGeneration: expectedGeneration + 1,
      };
      await requestResult(store.put(structuredClone(claimed)));
      await completed;
      return structuredClone(claimed);
    } catch (error) {
      try { transaction.abort(); } catch { /* already completed */ }
      await completed.catch(() => undefined);
      throw mapIndexedDBError(error);
    }
  }

  async renewSynchronisationQueueLease(
    id: string,
    ownerId: string,
    generation: number,
    now: number,
    leaseMs: number,
    signal?: AbortSignal,
  ): Promise<boolean> {
    return this.#mutateClaimedQueueItem(id, ownerId, generation, signal, (current) => ({
      ...current,
      leaseExpiresAt: new Date(now + leaseMs).toISOString(),
    }));
  }

  async updateClaimedSynchronisationQueueItem(
    item: PersistedDocumentSyncQueueItem,
    ownerId: string,
    generation: number,
    signal?: AbortSignal,
  ): Promise<boolean> {
    return this.#mutateClaimedQueueItem(item.id, ownerId, generation, signal, () => ({
      ...structuredClone(item),
      leaseGeneration: generation,
    }));
  }

  async removeClaimedSynchronisationQueueItem(
    id: string,
    ownerId: string,
    generation: number,
    signal?: AbortSignal,
  ): Promise<boolean> {
    throwIfDocumentAborted(signal);
    const database = await this.#database(signal);
    const transaction = this.#transaction(database, ["syncQueue", "closeLeases"], "readwrite");
    const completed = transactionComplete(transaction);
    try {
      const store = transaction.objectStore("syncQueue");
      const current = await requestResult(store.get(id)) as PersistedDocumentSyncQueueItem | undefined;
      if (!this.#ownsQueueLease(current, ownerId, generation)) { await completed; return false; }
      await this.#assertCloseMutationAllowed(transaction, this.#key(current.localLocation), undefined);
      await requestResult(store.delete(id));
      await completed;
      return true;
    } catch (error) {
      try { transaction.abort(); } catch { /* already completed */ }
      await completed.catch(() => undefined);
      throw mapIndexedDBError(error);
    }
  }

  async rebaseAndRemoveClaimedSynchronisationQueueItem(
    completedId: string,
    ownerId: string,
    generation: number,
    nextId: string,
    expectedVersion: DocumentVersion,
    signal?: AbortSignal,
    completedRecord?: DocumentRecord<unknown>,
    completedLocalVersion?: DocumentVersion,
  ): Promise<PersistedDocumentSyncQueueItem | null> {
    throwIfDocumentAborted(signal);
    const database = await this.#database(signal);
    const transaction = this.#transaction(
      database,
      completedRecord && completedLocalVersion
        ? ["syncQueue", "versions", "idempotency", "closeLeases"]
        : ["syncQueue", "closeLeases"],
      "readwrite",
    );
    const completed = transactionComplete(transaction);
    try {
      const store = transaction.objectStore("syncQueue");
      const current = await requestResult(store.get(completedId)) as PersistedDocumentSyncQueueItem | undefined;
      const next = await requestResult(store.get(nextId)) as PersistedDocumentSyncQueueItem | undefined;
      if (!this.#ownsQueueLease(current, ownerId, generation) || !next ||
          (next.leaseOwnerId && next.leaseOwnerId !== ownerId)) {
        await completed;
        return null;
      }
      await this.#assertCloseMutationAllowed(transaction, this.#key(current.localLocation), undefined);
      await this.#assertCloseMutationAllowed(transaction, this.#key(next.localLocation), undefined);
      const rebased: PersistedDocumentSyncQueueItem = {
        ...next,
        request: { ...next.request, expectedVersion: structuredClone(expectedVersion) },
      };
      await requestResult(store.put(structuredClone(rebased)));
      if (completedRecord && completedLocalVersion) {
        const key = this.#key(completedRecord.location);
        const versions = transaction.objectStore("versions");
        const historical = await requestResult(
          versions.get([key, completedLocalVersion.sequence]),
        ) as StoredVersion | undefined;
        if (!historical || !documentVersionsEqual(historical.record.version, completedLocalVersion)) {
          throw new DocumentVersionConflictError(
            completedRecord.location,
            completedLocalVersion,
            historical?.record ?? null,
          );
        }
        const stored: StoredRecord = { key, record: cloneDocumentRecord(completedRecord) };
        if (completedLocalVersion.sequence !== completedRecord.version.sequence) {
          await requestResult(versions.delete([key, completedLocalVersion.sequence]));
        }
        await requestResult(versions.put({
          ...stored,
          sequence: completedRecord.version.sequence,
        } satisfies StoredVersion));
        const idempotencyStore = transaction.objectStore("idempotency");
        const idempotency = await requestResult(idempotencyStore.getAll()) as StoredIdempotency[];
        for (const entry of idempotency) {
          if (entry.key === key && documentVersionsEqual(entry.record.version, completedLocalVersion)) {
            await requestResult(idempotencyStore.put({
              ...entry,
              record: cloneDocumentRecord(completedRecord),
            } satisfies StoredIdempotency));
          }
        }
      }
      await requestResult(store.delete(completedId));
      await completed;
      return structuredClone(rebased);
    } catch (error) {
      try { transaction.abort(); } catch { /* already completed */ }
      await completed.catch(() => undefined);
      throw mapIndexedDBError(error);
    }
  }

  async removeSynchronisationQueueItem(id: string, signal?: AbortSignal): Promise<void> {
    throwIfDocumentAborted(signal);
    const database = await this.#database(signal);
    const transaction = this.#transaction(database, ["syncQueue", "closeLeases"], "readwrite");
    const completed = transactionComplete(transaction);
    try {
      const store = transaction.objectStore("syncQueue");
      const current = await requestResult(store.get(id)) as PersistedDocumentSyncQueueItem | undefined;
      if (current) await this.#assertCloseMutationAllowed(transaction, this.#key(current.localLocation), undefined);
      await requestResult(store.delete(id));
      await completed;
    } catch (error) {
      try { transaction.abort(); } catch { /* already completed */ }
      await completed.catch(() => undefined);
      throw mapIndexedDBError(error);
    }
  }

  async rollbackSynchronisationIntent<TSerialized>(
    itemId: string,
    committed: DocumentRecord<TSerialized>,
    previous: DocumentRecord<TSerialized> | null,
    signal?: AbortSignal,
  ): Promise<void> {
    throwIfDocumentAborted(signal);
    const key = this.#key(committed.location);
    const database = await this.#database(signal);
    const transaction = this.#transaction(database, ["records", "versions", "idempotency", "syncQueue", "closeLeases"], "readwrite");
    const completed = transactionComplete(transaction);
    try {
      await this.#assertCloseMutationAllowed(transaction, key, undefined);
      const records = transaction.objectStore("records");
      const current = await requestResult(records.get(key)) as StoredRecord | undefined;
      if (!current || !documentVersionsEqual(current.record.version, committed.version)) {
        throw new DocumentVersionConflictError(committed.location, committed.version, current?.record ?? null);
      }
      if (previous) await requestResult(records.put({ key, record: cloneDocumentRecord(previous) } satisfies StoredRecord));
      else await requestResult(records.delete(key));
      await requestResult(transaction.objectStore("versions").delete([key, committed.version.sequence]));
      const idempotency = await requestResult(transaction.objectStore("idempotency").getAll()) as StoredIdempotency[];
      for (const entry of idempotency) {
        if (entry.key === key && documentVersionsEqual(entry.record.version, committed.version)) {
          await requestResult(transaction.objectStore("idempotency").delete(entry.idempotencyKey));
        }
      }
      await requestResult(transaction.objectStore("syncQueue").delete(itemId));
      await completed;
    } catch (error) {
      try { transaction.abort(); } catch { /* already completed */ }
      await completed.catch(() => undefined);
      throw mapIndexedDBError(error);
    }
  }

  async discardSynchronisationIntents(
    location: DocumentLocation,
    signal?: AbortSignal,
    previous: DocumentRecord<unknown> | null = null,
    discarded: DocumentRecord<unknown> | null = null,
    closeTransactionToken?: string,
  ): Promise<{
    readonly matched: boolean;
    readonly tombstones: readonly PersistedDocumentSyncQueueItem[];
  }> {
    throwIfDocumentAborted(signal);
    const key = this.#key(location);
    const locationIdentity = canonicalDocumentLocation(location);
    const database = await this.#database(signal);
    const transaction = this.#transaction(database, ["records", "versions", "idempotency", "syncQueue", "closeLeases"], "readwrite");
    const completed = transactionComplete(transaction);
    try {
      await this.#assertCloseMutationAllowed(transaction, key, closeTransactionToken);
      const queueStore = transaction.objectStore("syncQueue");
      const queue = await requestResult(queueStore.getAll()) as PersistedDocumentSyncQueueItem[];
      const matchingQueue = queue.filter((item) => canonicalDocumentLocation(item.localLocation) === locationIdentity);
      if (matchingQueue.length === 0) {
        await completed;
        return { matched: false, tombstones: Object.freeze([]) };
      }
      if (previous) {
        await requestResult(transaction.objectStore("records").put({ key, record: cloneDocumentRecord(previous) } satisfies StoredRecord));
      } else {
        await requestResult(transaction.objectStore("records").delete(key));
      }
      const versionsStore = transaction.objectStore("versions");
      const versions = await requestResult(versionsStore.getAll()) as StoredVersion[];
      const tombstones: PersistedDocumentSyncQueueItem[] = [];
      for (const item of matchingQueue) {
        if (item.state !== "sending" || !item.leaseOwnerId) continue;
        const exact = versions.find((version) => version.key === key &&
          documentVersionsEqual(version.record.version, item.localVersion))?.record ??
          (discarded && documentVersionsEqual(discarded.version, item.localVersion) ? discarded : null);
        if (!exact) {
          throw new DocumentUnavailableError(
            "The claimed synchronisation intent has no exact local record for discard compensation.",
            { retryable: false },
          );
        }
        const tombstone: PersistedDocumentSyncQueueItem = {
          ...item,
          state: "discarded",
          nextAttemptAt: null,
          leaseOwnerId: null,
          leaseExpiresAt: null,
          leaseGeneration: (item.leaseGeneration ?? 0) + 1,
          conflict: null,
          discard: {
            discardedRecord: cloneDocumentRecord(exact),
            previousRecord: previous ? cloneDocumentRecord(previous) : null,
            senderOwnerId: item.leaseOwnerId,
            senderGeneration: item.leaseGeneration ?? 0,
            requestedAt: new Date(this.#environment.now()).toISOString(),
          },
        };
        tombstones.push(tombstone);
      }
      const discardedVersionIds = new Set<string>();
      for (const version of versions) {
        if (version.key === key && (!previous || !documentVersionsEqual(version.record.version, previous.version))) {
          discardedVersionIds.add(version.record.version.id);
          await requestResult(transaction.objectStore("versions").delete([key, version.sequence]));
        }
      }
      const idempotency = await requestResult(transaction.objectStore("idempotency").getAll()) as StoredIdempotency[];
      for (const entry of idempotency) {
        if (entry.key === key && discardedVersionIds.has(entry.record.version.id)) {
          await requestResult(transaction.objectStore("idempotency").delete(entry.idempotencyKey));
        }
      }
      for (const item of matchingQueue) {
        const tombstone = tombstones.find(({ id }) => id === item.id);
        if (tombstone) await requestResult(queueStore.put(structuredClone(tombstone)));
        else await requestResult(queueStore.delete(item.id));
      }
      await completed;
      return {
        matched: true,
        tombstones: Object.freeze(tombstones.map((item) => structuredClone(item))),
      };
    } catch (error) {
      try { transaction.abort(); } catch { /* already completed */ }
      await completed.catch(() => undefined);
      throw mapIndexedDBError(error);
    }
  }

  async completeDiscardedSynchronisationQueueItem(
    id: string,
    generation: number,
    signal?: AbortSignal,
  ): Promise<boolean> {
    throwIfDocumentAborted(signal);
    const database = await this.#database(signal);
    const transaction = this.#transaction(database, ["syncQueue", "closeLeases"], "readwrite");
    const completed = transactionComplete(transaction);
    try {
      const store = transaction.objectStore("syncQueue");
      const current = await requestResult(store.get(id)) as PersistedDocumentSyncQueueItem | undefined;
      if (!current || current.state !== "discarded" || (current.leaseGeneration ?? 0) !== generation) {
        await completed;
        return false;
      }
      await this.#assertCloseMutationAllowed(transaction, this.#key(current.localLocation), undefined);
      await requestResult(store.delete(id));
      await completed;
      return true;
    } catch (error) {
      try { transaction.abort(); } catch { /* already completed */ }
      await completed.catch(() => undefined);
      throw mapIndexedDBError(error);
    }
  }

  async conflictDiscardedSynchronisationQueueItem(
    id: string,
    generation: number,
    currentRecord: DocumentRecord<unknown>,
    signal?: AbortSignal,
  ): Promise<boolean> {
    throwIfDocumentAborted(signal);
    const database = await this.#database(signal);
    const transaction = this.#transaction(database, ["syncQueue", "closeLeases"], "readwrite");
    const completed = transactionComplete(transaction);
    try {
      const store = transaction.objectStore("syncQueue");
      const current = await requestResult(store.get(id)) as PersistedDocumentSyncQueueItem | undefined;
      if (!current || current.state !== "discarded" || (current.leaseGeneration ?? 0) !== generation) {
        await completed;
        return false;
      }
      await this.#assertCloseMutationAllowed(transaction, this.#key(current.localLocation), undefined);
      await requestResult(store.put(structuredClone({
        ...current,
        state: "conflicted",
        nextAttemptAt: null,
        leaseOwnerId: null,
        leaseExpiresAt: null,
        conflict: {
          currentRecord: cloneDocumentRecord(currentRecord),
        },
      } satisfies PersistedDocumentSyncQueueItem)));
      await completed;
      return true;
    } catch (error) {
      try { transaction.abort(); } catch { /* already completed */ }
      await completed.catch(() => undefined);
      throw mapIndexedDBError(error);
    }
  }

  async releaseSynchronisationQueueLeases(ownerId: string, signal?: AbortSignal): Promise<void> {
    throwIfDocumentAborted(signal);
    const database = await this.#database(signal);
    const transaction = this.#transaction(database, ["syncQueue", "closeLeases"], "readwrite");
    const completed = transactionComplete(transaction);
    try {
      const store = transaction.objectStore("syncQueue");
      const queue = await requestResult(store.getAll()) as PersistedDocumentSyncQueueItem[];
      for (const item of queue) {
        if (item.leaseOwnerId !== ownerId) continue;
        await this.#assertCloseMutationAllowed(transaction, this.#key(item.localLocation), undefined);
        await requestResult(store.put(structuredClone({
          ...item,
          state: item.state === "sending" ? "queued" : item.state,
          leaseOwnerId: null,
          leaseExpiresAt: null,
          leaseGeneration: (item.leaseGeneration ?? 0) + 1,
        })));
      }
      await completed;
    } catch (error) {
      try { transaction.abort(); } catch { /* already completed */ }
      await completed.catch(() => undefined);
      throw mapIndexedDBError(error);
    }
  }

  async adoptSynchronisedRecord<TSerialized>(
    record: DocumentRecord<TSerialized>,
    expectedLocalVersion: DocumentVersion,
    options: DocumentReadOptions & {
      readonly removeQueueItemId?: string;
      readonly synchronisationQueueLease?: { readonly ownerId: string; readonly generation: number };
    } = {},
  ): Promise<void> {
    throwIfDocumentAborted(options.signal);
    const key = this.#key(record.location);
    const database = await this.#database(options.signal);
    const stores = options.removeQueueItemId
      ? ["records", "versions", "idempotency", "syncQueue", "closeLeases"]
      : ["records", "versions", "idempotency", "closeLeases"];
    const transaction = this.#transaction(database, stores, "readwrite");
    const completed = transactionComplete(transaction);
    try {
      await this.#assertCloseMutationAllowed(transaction, key, options.closeTransactionToken);
      if (options.removeQueueItemId && options.synchronisationQueueLease) {
        const queueItem = await requestResult(
          transaction.objectStore("syncQueue").get(options.removeQueueItemId),
        ) as PersistedDocumentSyncQueueItem | undefined;
        if (!this.#ownsQueueLease(
          queueItem,
          options.synchronisationQueueLease.ownerId,
          options.synchronisationQueueLease.generation,
        )) {
          throw new DocumentUnavailableError("The synchronisation queue lease is stale.", { retryable: true });
        }
      }
      const currentStored = await requestResult(transaction.objectStore("records").get(key)) as StoredRecord | undefined;
      const current = currentStored?.record as DocumentRecord<TSerialized> | undefined;
      if (!current || !documentVersionsEqual(current.version, expectedLocalVersion)) {
        throw new DocumentVersionConflictError(record.location, expectedLocalVersion, current ? cloneDocumentRecord(current) : null);
      }
      const stored: StoredRecord = { key, record: cloneDocumentRecord(record) };
      await requestResult(transaction.objectStore("records").put(stored));
      if (expectedLocalVersion.sequence !== record.version.sequence) {
        await requestResult(transaction.objectStore("versions").delete([key, expectedLocalVersion.sequence]));
      }
      await requestResult(transaction.objectStore("versions").put({
        ...stored,
        sequence: record.version.sequence,
      } satisfies StoredVersion));
      const idempotency = await requestResult(transaction.objectStore("idempotency").getAll()) as StoredIdempotency[];
      for (const entry of idempotency) {
        if (entry.key === key && documentVersionsEqual(entry.record.version, expectedLocalVersion)) {
          await requestResult(transaction.objectStore("idempotency").put({
            ...entry,
            record: cloneDocumentRecord(record),
          } satisfies StoredIdempotency));
        }
      }
      if (options.removeQueueItemId) {
        await requestResult(transaction.objectStore("syncQueue").delete(options.removeQueueItemId));
      }
      await completed;
    } catch (error) {
      try { transaction.abort(); } catch { /* already completed */ }
      await completed.catch(() => undefined);
      throw mapIndexedDBError(error);
    }
  }

  async adoptIntermediateSynchronisedRecord<TSerialized>(
    record: DocumentRecord<TSerialized>,
    expectedLocalVersion: DocumentVersion,
    options: DocumentReadOptions = {},
  ): Promise<void> {
    throwIfDocumentAborted(options.signal);
    const key = this.#key(record.location);
    const database = await this.#database(options.signal);
    const transaction = this.#transaction(database, ["versions", "idempotency", "closeLeases"], "readwrite");
    const completed = transactionComplete(transaction);
    try {
      await this.#assertCloseMutationAllowed(transaction, key, options.closeTransactionToken);
      const versions = transaction.objectStore("versions");
      const historical = await requestResult(
        versions.get([key, expectedLocalVersion.sequence]),
      ) as StoredVersion | undefined;
      if (historical && documentVersionsEqual(historical.record.version, record.version)) {
        await completed;
        return;
      }
      if (!historical || !documentVersionsEqual(historical.record.version, expectedLocalVersion)) {
        throw new DocumentVersionConflictError(record.location, expectedLocalVersion, historical?.record ?? null);
      }
      const stored: StoredRecord = { key, record: cloneDocumentRecord(record) };
      if (expectedLocalVersion.sequence !== record.version.sequence) {
        await requestResult(versions.delete([key, expectedLocalVersion.sequence]));
      }
      await requestResult(versions.put({ ...stored, sequence: record.version.sequence } satisfies StoredVersion));
      const idempotencyStore = transaction.objectStore("idempotency");
      const idempotency = await requestResult(idempotencyStore.getAll()) as StoredIdempotency[];
      for (const entry of idempotency) {
        if (entry.key === key && documentVersionsEqual(entry.record.version, expectedLocalVersion)) {
          await requestResult(idempotencyStore.put({ ...entry, record: cloneDocumentRecord(record) } satisfies StoredIdempotency));
        }
      }
      await completed;
    } catch (error) {
      try { transaction.abort(); } catch { /* already completed */ }
      await completed.catch(() => undefined);
      throw mapIndexedDBError(error);
    }
  }

  async list(query: DocumentListQuery): Promise<readonly DocumentRecord<unknown>[]> {
    throwIfDocumentAborted(query.signal);
    if (query.locationKind && query.locationKind !== "indexed-db") return Object.freeze([]);
    const database = await this.#database(query.signal);
    const transaction = this.#transaction(database, "records", "readonly");
    const records = await requestResult(transaction.objectStore("records").getAll()) as StoredRecord[];
    await transactionComplete(transaction);
    return Object.freeze(records.map(({ record }) => cloneDocumentRecord(record))
      .filter((record) => !query.typeId || record.typeId === query.typeId));
  }

  async listVersions(location: DocumentLocation, options: DocumentReadOptions = {}): Promise<readonly DocumentVersion[]> {
    throwIfDocumentAborted(options.signal);
    const key = this.#key(location);
    const database = await this.#database(options.signal);
    const transaction = this.#transaction(database, "versions", "readonly");
    const versions = await requestResult(transaction.objectStore("versions").getAll()) as StoredVersion[];
    await transactionComplete(transaction);
    return Object.freeze(versions.filter((entry) => entry.key === key)
      .sort((left, right) => left.sequence - right.sequence)
      .map(({ record }) => structuredClone(record.version)));
  }

  async readVersion<TSerialized>(location: DocumentLocation, version: DocumentVersion, options: DocumentReadOptions = {}): Promise<DocumentRecord<TSerialized> | null> {
    throwIfDocumentAborted(options.signal);
    const key = this.#key(location);
    const database = await this.#database(options.signal);
    const transaction = this.#transaction(database, "versions", "readonly");
    const stored = await requestResult(transaction.objectStore("versions").get([key, version.sequence])) as StoredVersion | undefined;
    await transactionComplete(transaction);
    if (!stored || !documentVersionsEqual(stored.record.version, version)) return null;
    return cloneDocumentRecord(stored.record as DocumentRecord<TSerialized>);
  }

  async beginCloseTransaction(
    location: DocumentLocation,
    options: DocumentReadOptions = {},
  ): Promise<DocumentCloseStorageTransaction> {
    throwIfDocumentAborted(options.signal);
    const key = this.#key(location);
    if (this.#closeTransactions.has(key)) {
      throw new DocumentUnavailableError("This document already has an active IndexedDB close transaction.", { retryable: true });
    }
    this.#closeTransactions.add(key);
    const token = `indexeddb-close:${this.#environment.randomUUID()}`;
    let before: IndexedDBCloseLocationState;
    try {
      const database = await this.#database(options.signal);
      const transaction = this.#transaction(
        database,
        ["records", "versions", "idempotency", "syncQueue", "syncMetadata", "closeLeases"],
        "readwrite",
      );
      const completed = transactionComplete(transaction);
      try {
        const leases = transaction.objectStore("closeLeases");
        const existing = await requestResult(leases.get(key)) as StoredCloseLease | undefined;
        if (existing && !this.#closeLeaseExpired(existing)) {
          throw new DocumentUnavailableError("This document already has a durable close transaction.", { retryable: true });
        }
        if (existing) await requestResult(leases.delete(key));
        await requestResult(leases.put({
          key,
          token,
          expiresAt: this.#environment.now() + CLOSE_LEASE_DURATION_MS,
        } satisfies StoredCloseLease));
        before = await this.#captureCloseLocationState(transaction, key, canonicalDocumentLocation(location));
        if (before.queue.some((item) => item.state === "sending" || item.state === "discarded")) {
          throw new DocumentUnavailableError(
            "A claimed or discarded synchronisation intent cannot enter a close transaction.",
            { retryable: true },
          );
        }
        await completed;
      } catch (error) {
        try { transaction.abort(); } catch { /* transaction already completed */ }
        await completed.catch(() => undefined);
        throw mapIndexedDBError(error);
      }
    } catch (error) {
      this.#closeTransactions.delete(key);
      throw error;
    }
    this.#scheduleCloseLeaseHeartbeat(key, token);
    let after: IndexedDBCloseLocationState | null = null;
    let settled = false;
    return {
      token,
      seal: async () => {
        if (settled) throw new DocumentUnavailableError("The IndexedDB close transaction is settled.", { retryable: false });
        after = await this.#readCloseLocationState(location, options.signal, token);
      },
      rollback: async () => {
        if (settled) return;
        try {
          const database = await this.#database();
          const transaction = this.#transaction(
            database,
            ["records", "versions", "idempotency", "syncQueue", "syncMetadata", "closeLeases"],
            "readwrite",
          );
          const completed = transactionComplete(transaction);
          try {
            await this.#assertCloseMutationAllowed(transaction, key, token);
            const current = await this.#captureCloseLocationState(transaction, key, canonicalDocumentLocation(location));
            if (after && this.#closeLocationFingerprint(current, false) !== this.#closeLocationFingerprint(after, false)) {
              throw new DocumentUnavailableError("The IndexedDB document changed after close precommit.", { retryable: true });
            }
            const records = transaction.objectStore("records");
            if (before.record) await requestResult(records.put(structuredClone(before.record)));
            else await requestResult(records.delete(key));

            const versions = transaction.objectStore("versions");
            for (const entry of current.versions) await requestResult(versions.delete([key, entry.sequence]));
            for (const entry of before.versions) await requestResult(versions.put(structuredClone(entry)));

            const idempotency = transaction.objectStore("idempotency");
            for (const entry of current.idempotency) await requestResult(idempotency.delete(entry.idempotencyKey));
            for (const entry of before.idempotency) await requestResult(idempotency.put(structuredClone(entry)));

            const queue = transaction.objectStore("syncQueue");
            for (const item of current.queue) await requestResult(queue.delete(item.id));
            for (const item of before.queue) await requestResult(queue.put(structuredClone(item)));

            if (after && this.#closeLocationFingerprint(current, true) === this.#closeLocationFingerprint(after, true)) {
              const metadata = transaction.objectStore("syncMetadata");
              if (before.queueOrder) await requestResult(metadata.put(structuredClone(before.queueOrder)));
              else await requestResult(metadata.delete("queue-order"));
            }
            await requestResult(transaction.objectStore("closeLeases").delete(key));
            await completed;
            settled = true;
            this.#cancelCloseLeaseHeartbeat(key);
          } catch (error) {
            try { transaction.abort(); } catch { /* transaction already completed */ }
            await completed.catch(() => undefined);
            throw mapIndexedDBError(error);
          }
        } finally {
          if (settled) this.#closeTransactions.delete(key);
        }
      },
      commit: async () => {
        if (settled) return;
        await this.#releaseCloseLease(key, token);
        settled = true;
      },
    };
  }

  async #readCloseLocationState(
    location: DocumentLocation,
    signal?: AbortSignal,
    closeTransactionToken?: string,
  ): Promise<IndexedDBCloseLocationState> {
    const key = this.#key(location);
    const database = await this.#database(signal);
    const transaction = this.#transaction(
      database,
      ["records", "versions", "idempotency", "syncQueue", "syncMetadata", "closeLeases"],
      "readwrite",
    );
    const completed = transactionComplete(transaction);
    await this.#assertCloseMutationAllowed(transaction, key, closeTransactionToken);
    const state = await this.#captureCloseLocationState(transaction, key, canonicalDocumentLocation(location));
    await completed;
    throwIfDocumentAborted(signal);
    return state;
  }

  async #captureCloseLocationState(
    transaction: IDBTransaction,
    key: string,
    locationIdentity: string,
  ): Promise<IndexedDBCloseLocationState> {
    const [record, versions, idempotency, queue, queueOrder] = await Promise.all([
      requestResult(transaction.objectStore("records").get(key)) as Promise<StoredRecord | undefined>,
      requestResult(transaction.objectStore("versions").getAll()) as Promise<StoredVersion[]>,
      requestResult(transaction.objectStore("idempotency").getAll()) as Promise<StoredIdempotency[]>,
      requestResult(transaction.objectStore("syncQueue").getAll()) as Promise<PersistedDocumentSyncQueueItem[]>,
      requestResult(transaction.objectStore("syncMetadata").get("queue-order")) as Promise<StoredSynchronisationMetadata | undefined>,
    ]);
    return structuredClone({
      record: record ?? null,
      versions: versions.filter((entry) => entry.key === key).sort((left, right) => left.sequence - right.sequence),
      idempotency: idempotency.filter((entry) => entry.key === key)
        .sort((left, right) => left.idempotencyKey < right.idempotencyKey ? -1 : left.idempotencyKey > right.idempotencyKey ? 1 : 0),
      queue: queue.filter((item) => canonicalDocumentLocation(item.localLocation) === locationIdentity)
        .sort((left, right) => left.order - right.order || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
      queueOrder: queueOrder ?? null,
    } satisfies IndexedDBCloseLocationState);
  }

  #closeLocationFingerprint(state: IndexedDBCloseLocationState, metadataOnly: boolean): string {
    return canonicalDocumentJson(
      metadataOnly
        ? { queueOrder: state.queueOrder }
        : {
            record: state.record,
            versions: state.versions,
            idempotency: state.idempotency,
            queue: state.queue,
          },
      "document.indexeddb-close-transaction",
    );
  }

  async #assertCloseMutationAllowed(
    transaction: IDBTransaction,
    key: string,
    token: string | undefined,
  ): Promise<void> {
    const lease = await requestResult(transaction.objectStore("closeLeases").get(key)) as StoredCloseLease | undefined;
    if (!lease) {
      if (token) {
        throw new DocumentUnavailableError("The durable close transaction lease is no longer authoritative.", { retryable: true });
      }
      return;
    }
    const leases = transaction.objectStore("closeLeases");
    if (this.#closeLeaseExpired(lease)) {
      await requestResult(leases.delete(key));
      if (lease.token === token) {
        throw new DocumentUnavailableError("The durable close transaction lease expired.", { retryable: true });
      }
      return;
    }
    if (lease.token !== token) {
      throw new DocumentUnavailableError("This document is reserved by a durable close transaction.", { retryable: true });
    }
    await requestResult(leases.put({
      ...lease,
      expiresAt: this.#environment.now() + CLOSE_LEASE_DURATION_MS,
    } satisfies StoredCloseLease));
  }

  async #releaseCloseLease(key: string, token: string): Promise<void> {
    const database = await this.#database();
    const transaction = this.#transaction(database, "closeLeases", "readwrite");
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore("closeLeases");
    const lease = await requestResult(store.get(key)) as StoredCloseLease | undefined;
    if (lease?.token === token) await requestResult(store.delete(key));
    await completed;
    this.#closeTransactions.delete(key);
    this.#cancelCloseLeaseHeartbeat(key);
  }

  #closeLeaseExpired(lease: StoredCloseLease): boolean {
    return !Number.isFinite(lease.expiresAt) || lease.expiresAt <= this.#environment.now();
  }

  #cancelCloseLeaseHeartbeat(key: string): void {
    const handle = this.#closeLeaseHeartbeats.get(key);
    this.#closeLeaseHeartbeats.delete(key);
    if (handle !== undefined) this.#environment.clearTimeout?.(handle);
  }

  #scheduleCloseLeaseHeartbeat(key: string, token: string): void {
    if (!this.#environment.setTimeout || !this.#environment.clearTimeout || this.#disposed) return;
    this.#cancelCloseLeaseHeartbeat(key);
    const handle = this.#environment.setTimeout(() => {
      this.#closeLeaseHeartbeats.delete(key);
      if (this.#disposed || !this.#closeTransactions.has(key)) return;
      void this.#renewCloseLease(key, token).then(
        () => this.#scheduleCloseLeaseHeartbeat(key, token),
        () => this.#scheduleCloseLeaseHeartbeat(key, token),
      );
    }, CLOSE_LEASE_RENEWAL_MS);
    this.#closeLeaseHeartbeats.set(key, handle);
  }

  async #renewCloseLease(key: string, token: string): Promise<void> {
    const database = await this.#database();
    const transaction = this.#transaction(database, "closeLeases", "readwrite");
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore("closeLeases");
    const lease = await requestResult(store.get(key)) as StoredCloseLease | undefined;
    if (!lease || lease.token !== token || this.#closeLeaseExpired(lease)) {
      try { transaction.abort(); } catch { /* transaction already completed */ }
      await completed.catch(() => undefined);
      throw new DocumentUnavailableError("The durable close transaction lease is no longer authoritative.", { retryable: true });
    }
    await requestResult(store.put({
      ...lease,
      expiresAt: this.#environment.now() + CLOSE_LEASE_DURATION_MS,
    } satisfies StoredCloseLease));
    await completed;
  }

  #key(location: DocumentLocation): string {
    if (!this.supports(location)) throw new DocumentUnavailableError(`IndexedDB adapter "${this.#databaseName}" does not support this location.`, { retryable: false });
    return canonicalDocumentLocation(location);
  }

  #ownsQueueLease(
    item: PersistedDocumentSyncQueueItem | undefined,
    ownerId: string,
    generation: number,
  ): item is PersistedDocumentSyncQueueItem {
    return Boolean(item && item.leaseOwnerId === ownerId && (item.leaseGeneration ?? 0) === generation);
  }

  async #mutateClaimedQueueItem(
    id: string,
    ownerId: string,
    generation: number,
    signal: AbortSignal | undefined,
    transform: (item: PersistedDocumentSyncQueueItem) => PersistedDocumentSyncQueueItem,
  ): Promise<boolean> {
    throwIfDocumentAborted(signal);
    const database = await this.#database(signal);
    const transaction = this.#transaction(database, ["syncQueue", "closeLeases"], "readwrite");
    const completed = transactionComplete(transaction);
    try {
      const store = transaction.objectStore("syncQueue");
      const current = await requestResult(store.get(id)) as PersistedDocumentSyncQueueItem | undefined;
      if (!this.#ownsQueueLease(current, ownerId, generation)) { await completed; return false; }
      await this.#assertCloseMutationAllowed(transaction, this.#key(current.localLocation), undefined);
      await requestResult(store.put(structuredClone(transform(current))));
      await completed;
      return true;
    } catch (error) {
      try { transaction.abort(); } catch { /* already completed */ }
      await completed.catch(() => undefined);
      throw mapIndexedDBError(error);
    }
  }

  async #database(signal?: AbortSignal): Promise<IDBDatabase> {
    this.#assertActive();
    throwIfDocumentAborted(signal);
    if (!this.#databasePromise) {
      this.#databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
        let settled = false;
        const request = this.#indexedDB.open(this.#databaseName, 3);
        const fail = (error: unknown) => {
          if (settled) return;
          settled = true;
          reject(mapIndexedDBError(error));
        };
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains("records")) database.createObjectStore("records", { keyPath: "key" });
          if (!database.objectStoreNames.contains("versions")) database.createObjectStore("versions", { keyPath: ["key", "sequence"] });
          if (!database.objectStoreNames.contains("idempotency")) database.createObjectStore("idempotency", { keyPath: "idempotencyKey" });
          if (!database.objectStoreNames.contains("syncQueue")) database.createObjectStore("syncQueue", { keyPath: "id" });
          if (!database.objectStoreNames.contains("closeLeases")) database.createObjectStore("closeLeases", { keyPath: "key" });
          const createdMetadata = !database.objectStoreNames.contains("syncMetadata");
          if (createdMetadata) database.createObjectStore("syncMetadata", { keyPath: "key" });
          if (createdMetadata) {
            const upgrade = request.transaction!;
            const queueRequest = upgrade.objectStore("syncQueue").getAll();
            queueRequest.onsuccess = () => {
              const maximum = (queueRequest.result as PersistedDocumentSyncQueueItem[])
                .reduce((value, item) => Math.max(value, item.order), 0);
              upgrade.objectStore("syncMetadata").put({
                key: "queue-order",
                value: maximum,
              } satisfies StoredSynchronisationMetadata);
            };
          }
        };
        request.onblocked = () => fail(new DocumentUnavailableError("IndexedDB document database upgrade was blocked."));
        request.onerror = () => fail(request.error ?? new Error("IndexedDB open failed."));
        request.onsuccess = () => {
          if (settled) { request.result.close(); return; }
          settled = true;
          request.result.onversionchange = () => request.result.close();
          resolve(request.result);
        };
      }).catch((error) => {
        this.#databasePromise = null;
        throw error;
      });
    }
    const database = await raceIndexedDBLifecycle(this.#databasePromise, signal, this.#disposeController.signal);
    this.#assertActive();
    throwIfDocumentAborted(signal);
    return database;
  }

  #transaction(
    database: IDBDatabase,
    storeNames: string | string[],
    mode: IDBTransactionMode,
  ): IDBTransaction {
    this.#assertActive();
    const transaction = database.transaction(storeNames, mode);
    this.#transactions.add(transaction);
    const clear = () => this.#transactions.delete(transaction);
    transaction.addEventListener("complete", clear, { once: true });
    transaction.addEventListener("abort", clear, { once: true });
    transaction.addEventListener("error", clear, { once: true });
    return transaction;
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new DocumentUnavailableError("The IndexedDB document adapter is disposed.", { retryable: false });
    }
  }
}
