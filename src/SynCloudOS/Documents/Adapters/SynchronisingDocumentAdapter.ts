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

import type { SynCloudOSRuntimeEnvironment } from "../../Runtime/runtimeInstanceTypes";
import {
  DocumentAbortError,
  DocumentDeletedError,
  DocumentReadOnlyError,
  DocumentUnavailableError,
  DocumentVersionConflictError,
} from "../DocumentErrors";
import {
  canonicalDocumentJson,
  canonicalDocumentLocation,
  documentVersionsEqual,
  immutableDocumentValue,
  type DocumentLocation,
  type DocumentRecord,
  type DocumentVersion,
} from "../documentTypes";
import { throwIfDocumentAborted } from "./InMemoryDocumentAdapter";
import { settleBoundedDocumentCleanup } from "./boundedDocumentCleanup";
import type {
  DocumentCloseStorageTransaction,
  DocumentListQuery,
  DocumentReadOptions,
  DocumentSynchronisationDiscardOptions,
  DocumentSynchronisationEvent,
  DocumentStorageAdapter,
  DocumentWatchListener,
  DocumentWatchSubscription,
  DocumentWriteRequest,
} from "./documentAdapterTypes";

export interface SynchronisingDocumentAdapterOptions {
  readonly local: DocumentStorageAdapter;
  readonly remote: DocumentStorageAdapter;
  readonly online: () => boolean;
  readonly environment: Pick<SynCloudOSRuntimeEnvironment, "now" | "randomUUID" | "setTimeout" | "clearTimeout">;
  readonly mapLocation?: (
    location: DocumentLocation,
  ) => { readonly local: DocumentLocation; readonly remote: DocumentLocation } | null;
}

export interface DocumentSyncQueueItem {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly request: DocumentWriteRequest<unknown>;
  readonly state: "queued" | "sending" | "conflicted" | "failed" | "discarded";
  readonly attemptCount: number;
  readonly nextAttemptAt: string | null;
}

export interface PersistedDocumentSyncQueueItem extends DocumentSyncQueueItem {
  readonly localVersion: DocumentVersion;
  readonly localLocation: DocumentLocation;
  readonly order: number;
  readonly leaseOwnerId?: string | null;
  readonly leaseExpiresAt?: string | null;
  readonly leaseGeneration?: number;
  readonly conflict?: {
    readonly currentRecord: DocumentRecord<unknown> | null;
    readonly terminalState?: "deleted" | "read-only";
  } | null;
  readonly discard?: {
    readonly discardedRecord: DocumentRecord<unknown>;
    readonly previousRecord: DocumentRecord<unknown> | null;
    readonly senderOwnerId: string;
    readonly senderGeneration: number;
    readonly requestedAt: string;
  } | null;
}

export type DocumentSyncReport =
  | { readonly outcome: "completed"; readonly sent: number; readonly conflicted: number }
  | { readonly outcome: "offline"; readonly sent: number; readonly conflicted: number }
  | { readonly outcome: "deferred"; readonly sent: number; readonly conflicted: number };

function cloneRequest(request: DocumentWriteRequest<unknown>): DocumentWriteRequest<unknown> {
  const durable: DocumentWriteRequest<unknown> = {
    location: request.location,
    typeId: request.typeId,
    schemaVersion: request.schemaVersion,
    content: request.content,
    expectedVersion: request.expectedVersion,
    idempotencyKey: request.idempotencyKey,
    ...(request.metadata ? { metadata: request.metadata } : {}),
  };
  return immutableDocumentValue(durable, request.typeId);
}

interface SynchronisationPersistence {
  readSynchronisationQueue(signal?: AbortSignal): Promise<readonly PersistedDocumentSyncQueueItem[]>;
  persistSynchronisationQueueItem(item: PersistedDocumentSyncQueueItem, signal?: AbortSignal): Promise<void>;
  removeSynchronisationQueueItem(id: string, signal?: AbortSignal): Promise<void>;
}

interface SynchronisationLeasePersistence {
  readonly atomicIntermediateSynchronisationQueueAdoption?: boolean;
  claimSynchronisationQueueItem(
    id: string,
    ownerId: string,
    expectedGeneration: number,
    now: number,
    leaseMs: number,
    signal?: AbortSignal,
  ): Promise<PersistedDocumentSyncQueueItem | null>;
  renewSynchronisationQueueLease(
    id: string,
    ownerId: string,
    generation: number,
    now: number,
    leaseMs: number,
    signal?: AbortSignal,
  ): Promise<boolean>;
  updateClaimedSynchronisationQueueItem(
    item: PersistedDocumentSyncQueueItem,
    ownerId: string,
    generation: number,
    signal?: AbortSignal,
  ): Promise<boolean>;
  removeClaimedSynchronisationQueueItem(
    id: string,
    ownerId: string,
    generation: number,
    signal?: AbortSignal,
  ): Promise<boolean>;
  rebaseAndRemoveClaimedSynchronisationQueueItem(
    completedId: string,
    ownerId: string,
    generation: number,
    nextId: string,
    expectedVersion: DocumentVersion,
    signal?: AbortSignal,
    completedRecord?: DocumentRecord<unknown>,
    completedLocalVersion?: DocumentVersion,
  ): Promise<PersistedDocumentSyncQueueItem | null>;
  releaseSynchronisationQueueLeases?(ownerId: string, signal?: AbortSignal): Promise<void>;
}

interface SynchronisationDiscardPersistence {
  completeDiscardedSynchronisationQueueItem(
    id: string,
    generation: number,
    signal?: AbortSignal,
  ): Promise<boolean>;
  conflictDiscardedSynchronisationQueueItem(
    id: string,
    generation: number,
    currentRecord: DocumentRecord<unknown>,
    signal?: AbortSignal,
  ): Promise<boolean>;
}

interface SynchronisedRecordAdopter {
  readonly atomicSynchronisationQueueAdoption?: boolean;
  adoptSynchronisedRecord<TSerialized>(
    record: DocumentRecord<TSerialized>,
    expectedLocalVersion: DocumentVersion,
    options?: DocumentReadOptions & {
      readonly removeQueueItemId?: string;
      readonly synchronisationQueueLease?: { readonly ownerId: string; readonly generation: number };
    },
  ): Promise<void>;
}

interface IntermediateSynchronisedRecordAdopter {
  adoptIntermediateSynchronisedRecord<TSerialized>(
    record: DocumentRecord<TSerialized>,
    expectedLocalVersion: DocumentVersion,
    options?: DocumentReadOptions,
  ): Promise<void>;
}

interface SynchronisationRollbackPersistence {
  rollbackSynchronisationIntent<TSerialized>(
    itemId: string,
    committed: DocumentRecord<TSerialized>,
    previous: DocumentRecord<TSerialized> | null,
    signal?: AbortSignal,
  ): Promise<void>;
  discardSynchronisationIntents?(
    location: DocumentLocation,
    signal?: AbortSignal,
    previous?: DocumentRecord<unknown> | null,
    discarded?: DocumentRecord<unknown> | null,
    closeTransactionToken?: string,
  ): Promise<void | {
    readonly matched: boolean;
    readonly tombstones: readonly PersistedDocumentSyncQueueItem[];
  }>;
}

interface AtomicSynchronisationIntentWriter {
  writeWithSynchronisationIntent<TSerialized>(
    request: DocumentWriteRequest<TSerialized>,
    createItem: (record: DocumentRecord<TSerialized>) => PersistedDocumentSyncQueueItem,
  ): Promise<DocumentRecord<TSerialized>>;
}

function synchronisationPersistence(adapter: DocumentStorageAdapter): SynchronisationPersistence | null {
  const candidate = adapter as DocumentStorageAdapter & Partial<SynchronisationPersistence>;
  return typeof candidate.readSynchronisationQueue === "function" &&
    typeof candidate.persistSynchronisationQueueItem === "function" &&
    typeof candidate.removeSynchronisationQueueItem === "function"
    ? candidate as DocumentStorageAdapter & SynchronisationPersistence
    : null;
}

function synchronisedRecordAdopter(adapter: DocumentStorageAdapter): SynchronisedRecordAdopter | null {
  const candidate = adapter as DocumentStorageAdapter & Partial<SynchronisedRecordAdopter>;
  return typeof candidate.adoptSynchronisedRecord === "function"
    ? candidate as DocumentStorageAdapter & SynchronisedRecordAdopter
    : null;
}

function intermediateSynchronisedRecordAdopter(
  adapter: DocumentStorageAdapter,
): IntermediateSynchronisedRecordAdopter | null {
  const candidate = adapter as DocumentStorageAdapter & Partial<IntermediateSynchronisedRecordAdopter>;
  return typeof candidate.adoptIntermediateSynchronisedRecord === "function"
    ? candidate as DocumentStorageAdapter & IntermediateSynchronisedRecordAdopter
    : null;
}

function atomicSynchronisationIntentWriter(adapter: DocumentStorageAdapter): AtomicSynchronisationIntentWriter | null {
  const candidate = adapter as DocumentStorageAdapter & Partial<AtomicSynchronisationIntentWriter>;
  return typeof candidate.writeWithSynchronisationIntent === "function"
    ? candidate as DocumentStorageAdapter & AtomicSynchronisationIntentWriter
    : null;
}

function synchronisationLeasePersistence(adapter: DocumentStorageAdapter): SynchronisationLeasePersistence | null {
  const candidate = adapter as DocumentStorageAdapter & Partial<SynchronisationLeasePersistence>;
  return typeof candidate.claimSynchronisationQueueItem === "function" &&
    typeof candidate.renewSynchronisationQueueLease === "function" &&
    typeof candidate.updateClaimedSynchronisationQueueItem === "function" &&
    typeof candidate.removeClaimedSynchronisationQueueItem === "function" &&
    typeof candidate.rebaseAndRemoveClaimedSynchronisationQueueItem === "function"
    ? candidate as DocumentStorageAdapter & SynchronisationLeasePersistence
    : null;
}

function synchronisationRollbackPersistence(adapter: DocumentStorageAdapter): SynchronisationRollbackPersistence | null {
  const candidate = adapter as DocumentStorageAdapter & Partial<SynchronisationRollbackPersistence>;
  return typeof candidate.rollbackSynchronisationIntent === "function"
    ? candidate as DocumentStorageAdapter & SynchronisationRollbackPersistence
    : null;
}

function synchronisationDiscardPersistence(
  adapter: DocumentStorageAdapter,
): SynchronisationDiscardPersistence | null {
  const candidate = adapter as DocumentStorageAdapter & Partial<SynchronisationDiscardPersistence>;
  return typeof candidate.completeDiscardedSynchronisationQueueItem === "function" &&
    typeof candidate.conflictDiscardedSynchronisationQueueItem === "function"
    ? candidate as DocumentStorageAdapter & SynchronisationDiscardPersistence
    : null;
}

function raceDocumentAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  throwIfDocumentAborted(signal);
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(new DocumentAbortError("The document operation was aborted.", { cause: signal.reason })));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)));
  });
}

export class SynchronisingDocumentAdapter implements DocumentStorageAdapter {
  readonly id = "synchronising";
  readonly capabilities;
  readonly watch?: (location: DocumentLocation, listener: DocumentWatchListener) => DocumentWatchSubscription;
  readonly #queue: PersistedDocumentSyncQueueItem[] = [];
  readonly #listeners = new Set<() => void>();
  readonly #synchronisationListeners = new Map<string, Set<(event: DocumentSynchronisationEvent) => void>>();
  readonly #lastAcknowledgedWrite = new Map<string, {
    readonly localVersion: DocumentVersion;
    readonly remoteVersion: DocumentVersion;
  }>();
  #flushTail: Promise<DocumentSyncReport> = Promise.resolve({ outcome: "completed", sent: 0, conflicted: 0 });
  #hydration: Promise<void> | null = null;
  #lastOrder = 0;
  readonly #leaseOwnerId: string;
  readonly #disposeController = new AbortController();
  readonly #heartbeatStops = new Set<() => void>();
  readonly #pendingWrites = new Map<string, {
    readonly fingerprint: string;
    readonly promise: Promise<DocumentRecord<unknown>>;
  }>();
  readonly #discardFences = new Set<string>();
  readonly #closeTransactionFences = new Map<string, { readonly token: string; localToken?: string }>();
  readonly #activeFlushes = new Map<string, Promise<void>>();
  #closeNotificationDepth = 0;
  #closeNotificationPending = false;
  #closeNotificationPublish = false;
  #disposed = false;
  #disposePromise: Promise<void> | null = null;

  constructor(private readonly options: SynchronisingDocumentAdapterOptions) {
    this.#leaseOwnerId = options.environment.randomUUID();
    this.capabilities = Object.freeze({
      versions: options.local.capabilities.versions,
      delete: options.local.capabilities.delete && options.remote.capabilities.delete,
      watch: options.local.capabilities.watch && typeof options.local.watch === "function",
      offline: true,
      atomicConditionalWrite: options.local.capabilities.atomicConditionalWrite,
    });
    if (options.local.capabilities.watch && options.local.watch) {
      this.watch = (location, listener) => {
        this.#assertActive();
        return options.local.watch!(this.#requireLocations(location).local, listener);
      };
    }
  }

  supports(location: DocumentLocation): boolean {
    const pair = this.#locations(location);
    return pair !== null && this.options.local.supports(pair.local) && this.options.remote.supports(pair.remote);
  }

  async read<TSerialized>(location: DocumentLocation, options?: DocumentReadOptions): Promise<DocumentRecord<TSerialized> | null> {
    this.#assertActive();
    await this.#ensureHydrated(options?.signal);
    const pair = this.#requireLocations(location);
    return this.options.local.read<TSerialized>(pair.local, options);
  }

  async write<TSerialized>(request: DocumentWriteRequest<TSerialized>): Promise<DocumentRecord<TSerialized>> {
    this.#assertActive();
    throwIfDocumentAborted(request.signal);
    request = {
      ...request,
      content: immutableDocumentValue(request.content, request.typeId),
      metadata: request.metadata ? immutableDocumentValue(request.metadata, request.typeId) : undefined,
    };
    const fingerprint = canonicalDocumentJson({
      location: request.location,
      typeId: request.typeId,
      schemaVersion: request.schemaVersion,
      content: request.content,
      expectedVersion: request.expectedVersion,
      idempotencyKey: request.idempotencyKey,
      metadata: request.metadata ?? {},
    }, request.typeId);
    const pending = this.#pendingWrites.get(request.idempotencyKey);
    if (pending) {
      if (pending.fingerprint !== fingerprint) {
        throw new DocumentUnavailableError(
          `Idempotency key "${request.idempotencyKey}" was reused for a different synchronisation write.`,
          { retryable: false },
        );
      }
      return raceDocumentAbort(pending.promise, request.signal) as Promise<DocumentRecord<TSerialized>>;
    }
    const promise = this.#write(request) as Promise<DocumentRecord<unknown>>;
    this.#pendingWrites.set(request.idempotencyKey, { fingerprint, promise });
    try {
      return await raceDocumentAbort(promise, request.signal) as DocumentRecord<TSerialized>;
    } finally {
      if (this.#pendingWrites.get(request.idempotencyKey)?.promise === promise) {
        this.#pendingWrites.delete(request.idempotencyKey);
      }
    }
  }

  async #write<TSerialized>(request: DocumentWriteRequest<TSerialized>): Promise<DocumentRecord<TSerialized>> {
    await this.#ensureHydrated(request.signal);
    const pair = this.#requireLocations(request.location);
    const closeAuthority = this.#closeTransactionFences.get(canonicalDocumentLocation(pair.local));
    if (closeAuthority && closeAuthority.token !== request.closeTransactionToken) {
      throw new DocumentUnavailableError("This synchronised document is reserved by close.", { retryable: true });
    }
    const localRequest = {
      ...request,
      location: pair.local,
      closeTransactionToken: closeAuthority?.localToken,
    };
    const existing = this.#queue.find(({ idempotencyKey }) => idempotencyKey === request.idempotencyKey);
    const previous = await this.options.local.read<TSerialized>(pair.local, { signal: request.signal });
    let createdItem: PersistedDocumentSyncQueueItem | null = null;
    const createItem = (record: DocumentRecord<TSerialized>): PersistedDocumentSyncQueueItem => {
      const item: PersistedDocumentSyncQueueItem = {
        id: this.options.environment.randomUUID(),
        idempotencyKey: request.idempotencyKey,
        request: cloneRequest({
          ...request,
          location: pair.remote,
          expectedVersion: this.#lastQueuedFor(pair.local)?.request.expectedVersion ?? request.expectedVersion,
        }),
        state: "queued",
        attemptCount: 0,
        nextAttemptAt: null,
        localVersion: structuredClone(record.version),
        localLocation: structuredClone(pair.local),
        order: this.#nextOrder(),
        leaseGeneration: 0,
      };
      createdItem = item;
      return item;
    };
    const atomicWriter = !existing ? atomicSynchronisationIntentWriter(this.options.local) : null;
    const localRecord = atomicWriter
      ? await atomicWriter.writeWithSynchronisationIntent(localRequest, createItem)
      : await this.options.local.write(localRequest);
    if (previous && !documentVersionsEqual(request.expectedVersion, previous.version) &&
        !documentVersionsEqual(previous.version, localRecord.version)) {
      // The local adapter returned a completed idempotency result which is no
      // longer the current record. It is already authoritative history and
      // must not be turned into a fresh outbox create.
      return localRecord;
    }
    if (previous && previous.version.id === localRecord.version.id && previous.version.etag === localRecord.version.etag) {
      return localRecord;
    }
    if (!existing) {
      if (atomicWriter) {
        await this.#ensureHydrated(request.signal);
      } else {
        const item = createdItem ?? createItem(localRecord);
        try {
          await this.#persist(item, request.signal);
        } catch (error) {
          await this.#rollbackFailedEnqueue(item, localRecord, previous);
          throw error;
        }
        this.#queue.push(item);
      }
      this.#emit();
    }
    return localRecord;
  }

  async remove(location: DocumentLocation, expectedVersion: DocumentVersion, options: DocumentReadOptions = {}): Promise<void> {
    this.#assertActive();
    throwIfDocumentAborted(options.signal);
    if (!this.options.online()) throw new DocumentUnavailableError("Document deletion cannot synchronise while offline.");
    const pair = this.#requireLocations(location);
    if (this.#closeTransactionFences.has(canonicalDocumentLocation(pair.local))) {
      throw new DocumentUnavailableError(
        "Remote deletion cannot run inside a reversible selected-close transaction.",
        { retryable: true },
      );
    }
    await this.options.remote.remove(pair.remote, expectedVersion, options);
    await this.options.local.remove(pair.local, expectedVersion, options);
  }

  async list(query: DocumentListQuery): Promise<readonly DocumentRecord<unknown>[]> {
    this.#assertActive();
    return this.options.local.list(query);
  }
  async listVersions(location: DocumentLocation, options?: DocumentReadOptions): Promise<readonly DocumentVersion[]> {
    this.#assertActive();
    return this.options.local.listVersions(this.#requireLocations(location).local, options);
  }
  async readVersion<TSerialized>(location: DocumentLocation, version: DocumentVersion, options?: DocumentReadOptions): Promise<DocumentRecord<TSerialized> | null> {
    this.#assertActive();
    return this.options.local.readVersion(this.#requireLocations(location).local, version, options);
  }

  async beginCloseTransaction(
    location: DocumentLocation,
    options: DocumentReadOptions = {},
  ): Promise<DocumentCloseStorageTransaction> {
    this.#assertActive();
    throwIfDocumentAborted(options.signal);
    const pair = this.#requireLocations(location);
    const key = canonicalDocumentLocation(pair.local);
    if (this.#closeTransactionFences.has(key) || this.#discardFences.has(key)) {
      throw new DocumentUnavailableError("This synchronised document already has a close transaction.", { retryable: true });
    }
    if (!this.options.local.beginCloseTransaction) {
      throw new DocumentUnavailableError(
        `Local adapter "${this.options.local.id}" cannot provide exact selected-close rollback.`,
        { retryable: false },
      );
    }
    const token = `synchronising-close:${this.options.environment.randomUUID()}`;
    const closeAuthority = { token, localToken: undefined as string | undefined };
    this.#closeTransactionFences.set(key, closeAuthority);
    let localTransaction: DocumentCloseStorageTransaction | null = null;
    try {
      const active = this.#activeFlushes.get(key);
      if (active) {
        throw new DocumentUnavailableError(
          "An active remote send cannot enter a reversible selected-close transaction.",
          { retryable: true },
        );
      }
      await this.#ensureHydrated(options.signal);
      if (this.#queue.some((item) => this.#sameLocalLocation(item.localLocation, pair.local) &&
          (item.state === "sending" || item.state === "discarded"))) {
        throw new DocumentUnavailableError(
          "A claimed or discarded synchronisation intent cannot enter a selected-close transaction.",
          { retryable: true },
        );
      }
      localTransaction = await this.options.local.beginCloseTransaction(pair.local, options);
      closeAuthority.localToken = localTransaction.token;
    } catch (error) {
      this.#closeTransactionFences.delete(key);
      throw error;
    }
    const beforeItems = this.#matchingQueueSnapshot(pair.local);
    const beforeAcknowledged = this.#lastAcknowledgedWrite.get(key);
    this.#closeNotificationDepth += 1;
    let afterItems: readonly PersistedDocumentSyncQueueItem[] | null = null;
    let settled = false;
    let localRolledBack = false;
    const release = (publish: boolean) => {
      this.#closeTransactionFences.delete(key);
      this.#closeNotificationPublish ||= publish;
      this.#closeNotificationDepth -= 1;
      if (this.#closeNotificationDepth !== 0) return;
      const shouldPublish = this.#closeNotificationPending && this.#closeNotificationPublish;
      this.#closeNotificationPending = false;
      this.#closeNotificationPublish = false;
      if (shouldPublish) this.#publishQueueListeners();
    };
    return {
      token,
      seal: async () => {
        if (settled) throw new DocumentUnavailableError("The synchronisation close transaction is settled.", { retryable: false });
        await localTransaction!.seal();
        afterItems = this.#matchingQueueSnapshot(pair.local);
      },
      rollback: async () => {
        if (settled) return;
        if (!localRolledBack) {
          if (afterItems && canonicalDocumentJson(this.#matchingQueueSnapshot(pair.local), "document.sync-close") !==
              canonicalDocumentJson(afterItems, "document.sync-close")) {
            throw new DocumentUnavailableError("The synchronisation queue changed after close precommit.", { retryable: true });
          }
          await localTransaction!.rollback();
          localRolledBack = true;
        }
        if (synchronisationPersistence(this.options.local)) {
          await this.#ensureHydrated();
        } else {
          for (let index = this.#queue.length - 1; index >= 0; index -= 1) {
            if (this.#sameLocalLocation(this.#queue[index]!.localLocation, pair.local)) this.#queue.splice(index, 1);
          }
          this.#queue.push(...beforeItems.map((item) => structuredClone(item)));
          this.#queue.sort((left, right) => left.order - right.order);
        }
        if (beforeAcknowledged) this.#lastAcknowledgedWrite.set(key, structuredClone(beforeAcknowledged));
        else this.#lastAcknowledgedWrite.delete(key);
        settled = true;
        release(false);
      },
      commit: async () => {
        if (settled) return;
        try {
          await localTransaction!.commit();
        } finally {
          settled = true;
          release(true);
        }
      },
    };
  }

  isSynchronisationPending(location: DocumentLocation): boolean {
    this.#assertActive();
    const pair = this.#requireLocations(location);
    return this.#queue.some((item) => this.#sameLocalLocation(item.localLocation, pair.local));
  }

  subscribeSynchronisation(
    location: DocumentLocation,
    listener: (event: DocumentSynchronisationEvent) => void,
  ): DocumentWatchSubscription {
    this.#assertActive();
    const key = canonicalDocumentLocation(this.#requireLocations(location).local);
    const listeners = this.#synchronisationListeners.get(key) ?? new Set<(event: DocumentSynchronisationEvent) => void>();
    listeners.add(listener);
    this.#synchronisationListeners.set(key, listeners);
    let disposed = false;
    return { dispose: () => {
      if (disposed) return;
      disposed = true;
      listeners.delete(listener);
      if (listeners.size === 0) this.#synchronisationListeners.delete(key);
    } };
  }

  queueSnapshot(): readonly DocumentSyncQueueItem[] {
    this.#assertActive();
    return Object.freeze(this.#queue.map(({ localVersion: _localVersion, order: _order, ...item }) => structuredClone(item)));
  }

  subscribeQueue(listener: () => void): () => void {
    this.#assertActive();
    this.#listeners.add(listener);
    let disposed = false;
    return () => { if (disposed) return; disposed = true; this.#listeners.delete(listener); };
  }

  flush(options: { readonly signal?: AbortSignal } = {}): Promise<DocumentSyncReport> {
    if (this.#disposed) return Promise.reject(new DocumentUnavailableError("The synchronising adapter is disposed.", { retryable: false }));
    const signal = options.signal
      ? AbortSignal.any([options.signal, this.#disposeController.signal])
      : this.#disposeController.signal;
    const run = () => this.#flush(signal);
    const result = this.#flushTail.then(run, run);
    this.#flushTail = result;
    return result;
  }

  async #flush(signal?: AbortSignal): Promise<DocumentSyncReport> {
    throwIfDocumentAborted(signal);
    await this.#ensureHydrated(signal);
    let sent = 0;
    let conflicted = 0;
    if (!this.options.online()) return { outcome: "offline", sent, conflicted };
    for (let index = 0; index < this.#queue.length;) {
      throwIfDocumentAborted(signal);
      const item = this.#queue[index]!;
      if (item.state === "discarded") return { outcome: "deferred", sent, conflicted };
      if (item.state === "conflicted") { conflicted += 1; index += 1; continue; }
      if (item.nextAttemptAt && Date.parse(item.nextAttemptAt) > this.options.environment.now()) {
        return { outcome: "deferred", sent, conflicted };
      }
      const locationKey = canonicalDocumentLocation(item.localLocation);
      if (this.#discardFences.has(locationKey) || this.#closeTransactionFences.has(locationKey)) {
        return { outcome: "deferred", sent, conflicted };
      }
      const leasePersistence = synchronisationLeasePersistence(this.options.local);
      const claimed = leasePersistence
        ? await leasePersistence.claimSynchronisationQueueItem(
            item.id,
            this.#leaseOwnerId,
            item.leaseGeneration ?? 0,
            this.options.environment.now(),
            30_000,
            signal,
          )
        : { ...item, state: "sending" as const, attemptCount: item.attemptCount + 1, nextAttemptAt: null };
      if (!claimed) return { outcome: "deferred", sent, conflicted };
      this.#queue[index] = claimed;
      if (!leasePersistence) await this.#persist(this.#queue[index]!, signal);
      this.#emit();
      const leaseHeartbeat = leasePersistence
        ? this.#startLeaseHeartbeat(leasePersistence, claimed, signal)
        : null;
      let settleActiveFlush!: () => void;
      const activeFlush = new Promise<void>((resolve) => { settleActiveFlush = resolve; });
      this.#activeFlushes.set(locationKey, activeFlush);
      let acknowledgedRemoteRecord: DocumentRecord<unknown> | null = null;
      try {
        const remoteRecord = await raceDocumentAbort(this.options.remote.write({ ...item.request, signal }), signal);
        acknowledgedRemoteRecord = remoteRecord;
        this.#lastAcknowledgedWrite.set(canonicalDocumentLocation(item.localLocation), {
          localVersion: structuredClone(item.localVersion),
          remoteVersion: structuredClone(remoteRecord.version),
        });
        // A different runtime may have atomically converted this claimed send
        // into a durable discard tombstone while the remote PUT was in flight.
        // Observe that state before ACK adoption and compensate the exact
        // authoritative remote commit before releasing the discarder.
        await this.#ensureHydrated(signal);
        if (await this.#completeDiscardedRemoteCommit(item.id, remoteRecord, signal)) continue;
        if (leaseHeartbeat?.lost()) {
          if (await this.#completeDiscardedRemoteCommit(item.id, remoteRecord, signal)) continue;
          return { outcome: "deferred", sent, conflicted };
        }
        // Another runtime may have appended a later edit while this remote send
        // was held. The durable queue, not this instance's prior snapshot, is
        // authoritative for ACK adoption and rebasing.
        await this.#ensureHydrated(signal);
        const persistence = synchronisationPersistence(this.options.local);
        const completedIndex = this.#queue.findIndex((candidate) => candidate.id === item.id);
        if (completedIndex < 0) {
          if (await this.#completeDiscardedRemoteCommit(item.id, remoteRecord, signal)) continue;
          return { outcome: "deferred", sent, conflicted };
        }
        const laterIndex = this.#queue.findIndex((candidate) =>
          candidate.order > item.order && this.#sameLocalLocation(candidate.localLocation, item.localLocation));
        if (laterIndex >= 0) {
          const later = this.#queue[laterIndex]!;
          const localRemoteRecord = { ...remoteRecord, location: structuredClone(item.localLocation) };
          const atomicIntermediateAdoption =
            leasePersistence?.atomicIntermediateSynchronisationQueueAdoption === true;
          const rebased = leasePersistence
            ? await leasePersistence.rebaseAndRemoveClaimedSynchronisationQueueItem(
                item.id,
                this.#leaseOwnerId,
                claimed.leaseGeneration ?? 0,
                later.id,
                remoteRecord.version,
                signal,
                atomicIntermediateAdoption ? localRemoteRecord : undefined,
                atomicIntermediateAdoption ? item.localVersion : undefined,
              )
            : null;
          if (leasePersistence && !rebased) {
            if (await this.#completeDiscardedRemoteCommit(item.id, remoteRecord, signal)) continue;
            return { outcome: "deferred", sent, conflicted };
          }
          this.#queue[laterIndex] = rebased ?? {
            ...later,
            request: { ...later.request, expectedVersion: structuredClone(remoteRecord.version) },
          };
          if (!leasePersistence) {
            await this.#persist(this.#queue[laterIndex]!);
            await this.#removePersisted(item.id);
          }
          if (!atomicIntermediateAdoption) {
            await intermediateSynchronisedRecordAdopter(this.options.local)
              ?.adoptIntermediateSynchronisedRecord(localRemoteRecord, item.localVersion, { signal });
          }
        } else {
          const adopter = synchronisedRecordAdopter(this.options.local);
          if (!adopter) {
            throw new DocumentUnavailableError("The local adapter cannot adopt an authoritative remote version.", { retryable: false });
          }
          const localRemoteRecord = { ...remoteRecord, location: structuredClone(item.localLocation) };
          try {
            await adopter.adoptSynchronisedRecord(
              localRemoteRecord,
              item.localVersion,
              {
                removeQueueItemId: persistence && adopter.atomicSynchronisationQueueAdoption === true ? item.id : undefined,
                synchronisationQueueLease: persistence && adopter.atomicSynchronisationQueueAdoption === true && leasePersistence ? {
                  ownerId: this.#leaseOwnerId,
                  generation: claimed.leaseGeneration ?? 0,
                } : undefined,
              },
            );
          } catch (error) {
            if (!(error instanceof DocumentVersionConflictError) ||
                !error.currentRecord ||
                error.currentRecord.version.id !== remoteRecord.version.id ||
                error.currentRecord.version.etag !== remoteRecord.version.etag) throw error;
          }
          if (persistence && adopter.atomicSynchronisationQueueAdoption !== true) {
            const removed = leasePersistence
              ? await leasePersistence.removeClaimedSynchronisationQueueItem(
                  item.id, this.#leaseOwnerId, claimed.leaseGeneration ?? 0, signal,
                )
              : (await this.#removePersisted(item.id, signal), true);
            if (!removed) {
              const stillDurable = (await persistence.readSynchronisationQueue(signal)).some(({ id }) => id === item.id);
              if (stillDurable) {
                if (await this.#completeDiscardedRemoteCommit(item.id, remoteRecord, signal)) continue;
                return { outcome: "deferred", sent, conflicted };
              }
            }
          } else if (!persistence) await this.#removePersisted(item.id);
        }
        const removalIndex = this.#queue.findIndex((candidate) => candidate.id === item.id);
        if (removalIndex >= 0) this.#queue.splice(removalIndex, 1);
        sent += 1;
        this.#emitSynchronisation(item.localLocation, {
          kind: "acknowledged",
          record: { ...structuredClone(remoteRecord), location: structuredClone(item.localLocation) },
        });
        this.#emit();
      } catch (error) {
        if (error instanceof DocumentAbortError) throw error;
        await this.#ensureHydrated(signal);
        if (acknowledgedRemoteRecord &&
            await this.#completeDiscardedRemoteCommit(item.id, acknowledgedRemoteRecord, signal)) continue;
        const currentIndex = this.#queue.findIndex((candidate) => candidate.id === item.id);
        if (currentIndex < 0) return { outcome: "deferred", sent, conflicted };
        if (this.#queue[currentIndex]?.state === "conflicted") {
          return { outcome: "deferred", sent, conflicted };
        }
        index = currentIndex;
        if (error instanceof DocumentVersionConflictError || error instanceof DocumentDeletedError || error instanceof DocumentReadOnlyError) {
          this.#queue[index] = {
            ...this.#queue[index]!,
            state: "conflicted",
            nextAttemptAt: null,
            leaseOwnerId: null,
            leaseExpiresAt: null,
            conflict: {
              currentRecord: error instanceof DocumentVersionConflictError && error.currentRecord
                ? { ...structuredClone(error.currentRecord), location: structuredClone(item.localLocation) }
                : null,
              ...(error instanceof DocumentDeletedError
                ? { terminalState: "deleted" as const }
                : error instanceof DocumentReadOnlyError
                  ? { terminalState: "read-only" as const }
                  : {}),
            },
          };
          if (leasePersistence) {
            const updated = await leasePersistence.updateClaimedSynchronisationQueueItem(
              this.#queue[index]!, this.#leaseOwnerId, claimed.leaseGeneration ?? 0, signal,
            );
            if (!updated) { await this.#ensureHydrated(signal); return { outcome: "deferred", sent, conflicted }; }
          } else await this.#persist(this.#queue[index]!, signal);
          conflicted += 1;
          index += 1;
          this.#emitSynchronisation(item.localLocation, {
            kind: "conflicted",
            location: structuredClone(item.localLocation),
            expectedVersion: item.request.expectedVersion ? structuredClone(item.request.expectedVersion) : null,
            currentRecord: error instanceof DocumentVersionConflictError && error.currentRecord
              ? { ...structuredClone(error.currentRecord), location: structuredClone(item.localLocation) }
              : null,
            terminalState: error instanceof DocumentDeletedError
              ? "deleted"
              : error instanceof DocumentReadOnlyError
                ? "read-only"
                : undefined,
          });
          this.#emit();
          continue;
        }
        if (error instanceof DocumentUnavailableError && error.retryable) {
          const current = this.#queue[index]!;
          const delayMs = Math.min(60_000, 1_000 * (2 ** Math.max(0, current.attemptCount - 1)));
          this.#queue[index] = {
            ...current,
            state: "queued",
            nextAttemptAt: new Date(this.options.environment.now() + delayMs).toISOString(),
            leaseOwnerId: null,
            leaseExpiresAt: null,
          };
          if (leasePersistence) {
            const updated = await leasePersistence.updateClaimedSynchronisationQueueItem(
              this.#queue[index]!, this.#leaseOwnerId, claimed.leaseGeneration ?? 0, signal,
            );
            if (!updated) { await this.#ensureHydrated(signal); return { outcome: "deferred", sent, conflicted }; }
          } else await this.#persist(this.#queue[index]!, signal);
          this.#emit();
          return { outcome: "deferred", sent, conflicted };
        }
        this.#queue[index] = { ...this.#queue[index]!, state: "failed", nextAttemptAt: null, leaseOwnerId: null, leaseExpiresAt: null };
        if (leasePersistence) {
          const updated = await leasePersistence.updateClaimedSynchronisationQueueItem(
            this.#queue[index]!, this.#leaseOwnerId, claimed.leaseGeneration ?? 0, signal,
          );
          if (!updated) { await this.#ensureHydrated(signal); return { outcome: "deferred", sent, conflicted }; }
        } else await this.#persist(this.#queue[index]!, signal);
        this.#emit();
        index += 1;
      } finally {
        leaseHeartbeat?.stop();
        if (this.#activeFlushes.get(locationKey) === activeFlush) this.#activeFlushes.delete(locationKey);
        settleActiveFlush();
      }
    }
    return { outcome: "completed", sent, conflicted };
  }

  async #ensureHydrated(signal?: AbortSignal): Promise<void> {
    const lifecycleSignal = signal
      ? AbortSignal.any([signal, this.#disposeController.signal])
      : this.#disposeController.signal;
    throwIfDocumentAborted(lifecycleSignal);
    if (!this.#hydration) {
      const persistence = synchronisationPersistence(this.options.local);
      this.#hydration = (persistence
        ? raceDocumentAbort(persistence.readSynchronisationQueue(lifecycleSignal), lifecycleSignal).then((items) => {
          this.#queue.splice(0, this.#queue.length, ...items
            .map((item) => {
              const canonical = immutableDocumentValue(item, "document.sync-queue") as PersistedDocumentSyncQueueItem;
              return {
                ...structuredClone(canonical),
                localLocation: structuredClone(canonical.localLocation ?? canonical.request.location),
              };
            })
            .sort((left, right) => left.order - right.order));
          this.#lastOrder = this.#queue.reduce((maximum, item) => Math.max(maximum, item.order), 0);
        })
        : Promise.resolve()).finally(() => {
          this.#hydration = null;
        });
    }
    await raceDocumentAbort(this.#hydration, lifecycleSignal);
    throwIfDocumentAborted(lifecycleSignal);
  }

  #nextOrder(): number {
    this.#lastOrder = Math.max(this.#lastOrder + 1, this.options.environment.now());
    return this.#lastOrder;
  }

  async #persist(item: PersistedDocumentSyncQueueItem, signal?: AbortSignal): Promise<void> {
    const canonical = immutableDocumentValue(item, "document.sync-queue") as PersistedDocumentSyncQueueItem;
    await synchronisationPersistence(this.options.local)?.persistSynchronisationQueueItem(canonical, signal);
  }

  async #removePersisted(id: string, signal?: AbortSignal): Promise<void> {
    await synchronisationPersistence(this.options.local)?.removeSynchronisationQueueItem(id, signal);
  }

  #startLeaseHeartbeat(
    persistence: SynchronisationLeasePersistence,
    item: PersistedDocumentSyncQueueItem,
    signal?: AbortSignal,
  ): { readonly lost: () => boolean; readonly stop: () => void } {
    let stopped = false;
    let leaseLost = false;
    let timer: ReturnType<SynchronisingDocumentAdapterOptions["environment"]["setTimeout"]> | null = null;
    const renew = () => {
      if (stopped) return;
      timer = this.options.environment.setTimeout(() => {
        void persistence.renewSynchronisationQueueLease(
          item.id,
          this.#leaseOwnerId,
          item.leaseGeneration ?? 0,
          this.options.environment.now(),
          30_000,
          signal,
        ).then((renewed) => {
          if (!renewed) leaseLost = true;
          else renew();
        }, () => { leaseLost = true; });
      }, 10_000);
    };
    renew();
    const stop = () => {
      stopped = true;
      if (timer !== null) this.options.environment.clearTimeout(timer);
      this.#heartbeatStops.delete(stop);
    };
    this.#heartbeatStops.add(stop);
    return {
      lost: () => leaseLost,
      stop,
    };
  }

  #locations(location: DocumentLocation): { readonly local: DocumentLocation; readonly remote: DocumentLocation } | null {
    return this.options.mapLocation
      ? this.options.mapLocation(structuredClone(location))
      : (this.options.local.supports(location) && this.options.remote.supports(location)
        ? { local: structuredClone(location), remote: structuredClone(location) }
        : null);
  }

  async reconcileFencedWrite<TSerialized>(
    location: DocumentLocation,
    committed: DocumentRecord<TSerialized>,
    previous: DocumentRecord<TSerialized> | null,
    options: DocumentReadOptions = {},
  ): Promise<void> {
    this.#assertActive();
    await this.#ensureHydrated(options.signal);
    const pair = this.#requireLocations(location);
    const itemIndex = this.#queue.findIndex((candidate) =>
      this.#sameLocalLocation(candidate.localLocation, pair.local) &&
      candidate.localVersion.id === committed.version.id && candidate.localVersion.etag === committed.version.etag);
    if (itemIndex < 0) {
      // A concurrent flush may already have adopted and removed the intent.
      // The fenced close remains authoritative, so compensate that exact ACK
      // instead of allowing the reviewed-away body to survive remotely.
      await this.#compensateAcknowledgedDiscard(pair, committed, previous, options);
      return;
    }
    const item = this.#queue[itemIndex]!;
    const rollback = synchronisationRollbackPersistence(this.options.local);
    if (rollback) {
      await rollback.rollbackSynchronisationIntent(item.id, committed, previous, options.signal);
    } else {
      if (previous) {
        const adopter = synchronisedRecordAdopter(this.options.local);
        if (adopter) await adopter.adoptSynchronisedRecord(previous, committed.version, options);
        else {
          await this.options.local.write({
            location: pair.local,
            typeId: previous.typeId,
            schemaVersion: previous.schemaVersion,
            content: previous.content,
            expectedVersion: committed.version,
            idempotencyKey: `synchronisation-fenced-rollback:${item.id}`,
            metadata: previous.metadata,
            signal: options.signal,
          });
        }
      } else {
        await this.options.local.remove(pair.local, committed.version, options);
      }
      await this.#removePersisted(item.id, options.signal);
    }
    this.#queue.splice(itemIndex, 1);
    this.#emit();
  }

  async prepareDocumentRecreation(location: DocumentLocation, options: DocumentReadOptions = {}): Promise<void> {
    this.#assertActive();
    await this.#discardPendingSynchronisation(location, null, options);
  }

  async discardPendingSynchronisation(
    location: DocumentLocation,
    options: DocumentSynchronisationDiscardOptions = {},
  ): Promise<void> {
    this.#assertActive();
    const pair = this.#requireLocations(location);
    const key = canonicalDocumentLocation(pair.local);
    const closeAuthority = this.#closeTransactionFences.get(key);
    if (closeAuthority && closeAuthority.token !== options.closeTransactionToken) {
      throw new DocumentUnavailableError("This synchronised document is reserved by close.", { retryable: true });
    }
    this.#discardFences.add(key);
    try {
      const active = this.#activeFlushes.get(key);
      if (active) await raceDocumentAbort(active, options.signal);
      await this.#ensureHydrated(options.signal);
      const items = this.#queue.filter((candidate) => this.#sameLocalLocation(candidate.localLocation, pair.local));
      if (items.length === 0) {
        if (options.discardedRecord) {
          if (closeAuthority) {
            throw new DocumentUnavailableError(
              "A remote acknowledgement escaped before selected-close rollback authority was established.",
              { retryable: true },
            );
          }
          await this.#compensateAcknowledgedDiscard(pair, options.discardedRecord, options.previousRecord ?? null, options);
        }
        return;
      }
      const expectedBase = items[0]?.request.expectedVersion ?? null;
      const previous = options.previousRecord ?? (expectedBase
        ? await this.options.local.readVersion(pair.local, expectedBase, options)
        : null);
      await this.#discardPendingSynchronisation(location, previous, options);
    } finally {
      this.#discardFences.delete(key);
    }
  }

  async acceptRemoteConflict(
    location: DocumentLocation,
    record: DocumentRecord<unknown> | null,
    options: DocumentReadOptions = {},
  ): Promise<void> {
    this.#assertActive();
    await this.#discardPendingSynchronisation(location, record, options);
  }

  async #discardPendingSynchronisation(
    location: DocumentLocation,
    previous: DocumentRecord<unknown> | null,
    options: DocumentSynchronisationDiscardOptions,
  ): Promise<void> {
    await this.#ensureHydrated(options.signal);
    const pair = this.#requireLocations(location);
    const matchingItems = this.#queue.filter((candidate) => this.#sameLocalLocation(candidate.localLocation, pair.local));
    if (matchingItems.length === 0) return;
    const rollback = synchronisationRollbackPersistence(this.options.local);
      if (rollback?.discardSynchronisationIntents) {
      const current = options.discardedRecord ?? await this.options.local.read(pair.local, options);
      const result = await rollback.discardSynchronisationIntents(
        pair.local,
        options.signal,
        previous,
        current,
        this.#closeTransactionFences.get(canonicalDocumentLocation(pair.local))?.localToken,
      );
      if (result && !result.matched) {
        if (current) {
          if (this.#closeTransactionFences.has(canonicalDocumentLocation(pair.local))) {
            throw new DocumentUnavailableError(
              "A remote acknowledgement cannot be compensated inside a reversible selected close.",
              { retryable: true },
            );
          }
          await this.#compensateAcknowledgedDiscard(pair, current, previous, options);
        }
      } else if (result?.tombstones.length) {
        await this.#awaitDiscardTombstones(result.tombstones, options.signal);
      }
      if (result) {
        await this.#ensureHydrated(options.signal);
        if (this.#queue.some((candidate) => this.#sameLocalLocation(candidate.localLocation, pair.local))) {
          throw new DocumentUnavailableError(
            "A synchronisation intent appeared while the durable discard was being reconciled.",
            { retryable: true },
          );
        }
      }
    } else {
      const current = await this.options.local.read(pair.local, options);
      if (current && previous) {
        const adopter = synchronisedRecordAdopter(this.options.local);
        if (adopter) await adopter.adoptSynchronisedRecord(previous, current.version, options);
        else await this.options.local.write({
          location: pair.local,
          typeId: previous.typeId,
          schemaVersion: previous.schemaVersion,
          content: previous.content,
          expectedVersion: current.version,
          idempotencyKey: `synchronisation-discard:${this.#leaseOwnerId}:${this.options.environment.randomUUID()}`,
          metadata: previous.metadata,
          signal: options.signal,
          closeTransactionToken: this.#closeTransactionFences.get(canonicalDocumentLocation(pair.local))?.localToken,
        });
      } else if (current) await this.options.local.remove(pair.local, current.version, {
        ...options,
        closeTransactionToken: this.#closeTransactionFences.get(canonicalDocumentLocation(pair.local))?.localToken,
      });
      for (const item of matchingItems) {
        await this.#removePersisted(item.id, options.signal);
      }
    }
    for (let index = this.#queue.length - 1; index >= 0; index -= 1) {
      if (this.#sameLocalLocation(this.#queue[index]!.localLocation, pair.local)) this.#queue.splice(index, 1);
    }
    this.#emit();
  }

  async #awaitDiscardTombstones(
    tombstones: readonly PersistedDocumentSyncQueueItem[],
    signal?: AbortSignal,
  ): Promise<void> {
    const pendingIds = new Set(tombstones.map(({ id }) => id));
    while (pendingIds.size > 0) {
      throwIfDocumentAborted(signal);
      await this.#ensureHydrated(signal);
      for (const item of this.#queue) {
        if (pendingIds.has(item.id) && item.state !== "discarded") {
          throw new DocumentUnavailableError(
            "A synchronisation discard tombstone changed state before remote compensation.",
            { retryable: false },
          );
        }
      }
      for (const id of [...pendingIds]) {
        if (!this.#queue.some((item) => item.id === id)) pendingIds.delete(id);
      }
      if (pendingIds.size === 0) return;
      await raceDocumentAbort(new Promise<void>((resolve) => {
        this.options.environment.setTimeout(resolve, 5);
      }), signal);
    }
  }

  async #rollbackFailedEnqueue<TSerialized>(
    item: PersistedDocumentSyncQueueItem,
    committed: DocumentRecord<TSerialized>,
    previous: DocumentRecord<TSerialized> | null,
    signal?: AbortSignal,
  ): Promise<void> {
    const rollback = synchronisationRollbackPersistence(this.options.local);
    if (rollback) {
      await rollback.rollbackSynchronisationIntent(item.id, committed, previous, signal);
      return;
    }
    if (previous) {
      const adopter = synchronisedRecordAdopter(this.options.local);
      if (adopter) {
        await adopter.adoptSynchronisedRecord(previous, committed.version, { signal });
        return;
      }
      await this.options.local.write({
        location: committed.location,
        typeId: previous.typeId,
        schemaVersion: previous.schemaVersion,
        content: previous.content,
        expectedVersion: committed.version,
        idempotencyKey: `synchronisation-enqueue-rollback:${item.id}`,
        metadata: previous.metadata,
        signal,
      });
      return;
    }
    await this.options.local.remove(committed.location, committed.version, { signal });
  }

  async #completeDiscardedRemoteCommit(
    itemId: string,
    remoteRecord: DocumentRecord<unknown>,
    signal?: AbortSignal,
  ): Promise<boolean> {
    await this.#ensureHydrated(signal);
    const discarded = this.#queue.find((candidate) => candidate.id === itemId);
    if (discarded?.state !== "discarded" || !discarded.discard) return false;
    const pair = this.#requireLocations(discarded.localLocation);
    const persistence = synchronisationDiscardPersistence(this.options.local);
    if (!persistence) {
      throw new DocumentUnavailableError(
        "The local adapter cannot atomically complete a durable synchronisation discard.",
        { retryable: false },
      );
    }
    try {
      await this.#compensateAcknowledgedDiscard(
        pair,
        { ...structuredClone(remoteRecord), location: structuredClone(pair.local) },
        discarded.discard.previousRecord,
        { signal },
      );
    } catch (error) {
      if (!(error instanceof DocumentVersionConflictError) || !error.currentRecord) throw error;
      const currentRecord = { ...structuredClone(error.currentRecord), location: structuredClone(pair.local) };
      const conflicted = await persistence.conflictDiscardedSynchronisationQueueItem(
        discarded.id,
        discarded.leaseGeneration ?? 0,
        currentRecord,
        signal,
      );
      await this.#ensureHydrated(signal);
      if (conflicted || this.#queue.some((candidate) =>
        candidate.id === discarded.id && candidate.state === "conflicted")) {
        this.#emitSynchronisation(pair.local, {
          kind: "conflicted",
          location: structuredClone(pair.local),
          expectedVersion: structuredClone(remoteRecord.version),
          currentRecord,
        });
        this.#emit();
      }
      throw error;
    }
    const completed = await persistence.completeDiscardedSynchronisationQueueItem(
      discarded.id,
      discarded.leaseGeneration ?? 0,
      signal,
    );
    if (!completed) {
      await this.#ensureHydrated(signal);
      return !this.#queue.some((candidate) => candidate.id === discarded.id);
    }
    const discardedIndex = this.#queue.findIndex((candidate) => candidate.id === discarded.id);
    if (discardedIndex >= 0) this.#queue.splice(discardedIndex, 1);
    this.#emit();
    return true;
  }

  async #compensateAcknowledgedDiscard(
    pair: { readonly local: DocumentLocation; readonly remote: DocumentLocation },
    discarded: DocumentRecord<unknown>,
    previous: DocumentRecord<unknown> | null,
    options: DocumentReadOptions,
  ): Promise<void> {
    if (previous && documentVersionsEqual(previous.version, discarded.version)) return;
    const remoteCurrent = await this.options.remote.read(pair.remote, options);
    if (!remoteCurrent) return;
    const acknowledged = this.#lastAcknowledgedWrite.get(canonicalDocumentLocation(pair.local));
    const authorisedVersion = documentVersionsEqual(remoteCurrent.version, discarded.version)
      ? discarded.version
      : acknowledged && documentVersionsEqual(acknowledged.localVersion, discarded.version)
        ? acknowledged.remoteVersion
        : null;
    if (!authorisedVersion || !documentVersionsEqual(remoteCurrent.version, authorisedVersion)) {
      throw new DocumentVersionConflictError(
        pair.local,
        discarded.version,
        { ...structuredClone(remoteCurrent), location: structuredClone(pair.local) },
      );
    }
    const localCurrent = await this.options.local.read(pair.local, options);
    if (previous) {
      const compensatedRemote = await this.options.remote.write({
        location: pair.remote,
        typeId: previous.typeId,
        schemaVersion: previous.schemaVersion,
        content: previous.content,
        expectedVersion: remoteCurrent.version,
        idempotencyKey: `synchronisation-discard-compensation:${this.#leaseOwnerId}:${this.options.environment.randomUUID()}`,
        metadata: previous.metadata,
        signal: options.signal,
      });
      if (localCurrent) {
        const adopter = synchronisedRecordAdopter(this.options.local);
        if (!adopter) {
          throw new DocumentUnavailableError(
            "The local adapter cannot atomically adopt a discard compensation.",
            { retryable: false },
          );
        }
        await adopter.adoptSynchronisedRecord(
          { ...compensatedRemote, location: structuredClone(pair.local) },
          localCurrent.version,
          options,
        );
      }
    } else {
      await this.options.remote.remove(pair.remote, remoteCurrent.version, options);
      if (localCurrent) await this.options.local.remove(pair.local, localCurrent.version, options);
    }
  }

  dispose(): Promise<void> {
    if (this.#disposePromise) return this.#disposePromise;
    this.#disposed = true;
    this.#disposeController.abort("synchronising-adapter-disposed");
    for (const stop of [...this.#heartbeatStops]) stop();
    this.#lastAcknowledgedWrite.clear();
    this.#listeners.clear();
    this.#synchronisationListeners.clear();
    this.#disposePromise = (async () => {
      await this.#flushTail.catch(() => undefined);
      const timers = {
        schedule: (callback: () => void, delayMs: number) => this.options.environment.setTimeout(callback, delayMs),
        cancel: (handle: unknown) => this.options.environment.clearTimeout(handle),
      };
      const errors: unknown[] = [];
      const leases = synchronisationLeasePersistence(this.options.local);
      if (leases?.releaseSynchronisationQueueLeases) {
        const error = await settleBoundedDocumentCleanup(
          "synchronisation lease release",
          () => leases.releaseSynchronisationQueueLeases!(this.#leaseOwnerId),
          1_000,
          timers,
        );
        if (error) errors.push(error);
      }
      const adapters = this.options.local === this.options.remote ? [this.options.local] : [this.options.local, this.options.remote];
      for (const adapter of adapters) {
        if (!adapter.dispose) continue;
        const error = await settleBoundedDocumentCleanup(
          `adapter ${adapter.id} disposal`,
          () => adapter.dispose!(),
          1_000,
          timers,
        );
        if (error) errors.push(error);
      }
      if (errors.length > 0) throw new AggregateError(errors, "Synchronising adapter disposal failed.");
    })();
    return this.#disposePromise;
  }

  #requireLocations(location: DocumentLocation): { readonly local: DocumentLocation; readonly remote: DocumentLocation } {
    const pair = this.#locations(location);
    if (!pair || !this.options.local.supports(pair.local) || !this.options.remote.supports(pair.remote)) {
      throw new DocumentUnavailableError("Synchronising adapter requires an explicit supported local/remote location pair.", { retryable: false });
    }
    return pair;
  }

  async refreshSynchronisation(
    location: DocumentLocation,
    options: DocumentReadOptions = {},
  ): Promise<DocumentSynchronisationEvent | null> {
    this.#assertActive();
    await this.#ensureHydrated(options.signal);
    const pair = this.#requireLocations(location);
    const items = this.#queue
      .filter((candidate) => this.#sameLocalLocation(candidate.localLocation, pair.local))
      .sort((left, right) => left.order - right.order);
    const conflict = items.find((item) => item.state === "conflicted" && item.conflict);
    let event: DocumentSynchronisationEvent | null = null;
    if (conflict?.conflict) {
      event = {
        kind: "conflicted",
        location: structuredClone(pair.local),
        expectedVersion: conflict.request.expectedVersion
          ? structuredClone(conflict.request.expectedVersion)
          : null,
        currentRecord: conflict.conflict.currentRecord
          ? { ...structuredClone(conflict.conflict.currentRecord), location: structuredClone(pair.local) }
          : null,
        ...(conflict.conflict.terminalState ? { terminalState: conflict.conflict.terminalState } : {}),
      };
    } else if (items.length === 0) {
      const record = await this.options.local.read(pair.local, options);
      if (record) event = { kind: "acknowledged", record };
    }
    if (event) this.#emitSynchronisation(pair.local, event);
    return event ? structuredClone(event) : null;
  }

  async readLastAcknowledgedRecord<TSerialized>(
    location: DocumentLocation,
    options: DocumentReadOptions = {},
  ): Promise<DocumentRecord<TSerialized> | null> {
    this.#assertActive();
    await this.#ensureHydrated(options.signal);
    const pair = this.#requireLocations(location);
    const first = this.#queue
      .filter((candidate) => this.#sameLocalLocation(candidate.localLocation, pair.local))
      .sort((left, right) => left.order - right.order)[0];
    if (!first) return this.options.local.read<TSerialized>(pair.local, options);
    return first.request.expectedVersion
      ? this.options.local.readVersion<TSerialized>(pair.local, first.request.expectedVersion, options)
      : null;
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new DocumentUnavailableError("The synchronising adapter is disposed.", { retryable: false });
    }
  }

  #sameLocalLocation(left: DocumentLocation, right: DocumentLocation): boolean {
    return canonicalDocumentLocation(left) === canonicalDocumentLocation(right);
  }

  #lastQueuedFor(location: DocumentLocation): PersistedDocumentSyncQueueItem | null {
    return [...this.#queue].reverse().find((item) => this.#sameLocalLocation(item.localLocation, location)) ?? null;
  }

  #emit(): void {
    if (this.#closeNotificationDepth > 0) {
      this.#closeNotificationPending = true;
      return;
    }
    this.#publishQueueListeners();
  }

  #publishQueueListeners(): void {
    for (const listener of [...this.#listeners]) {
      try { listener(); } catch { /* subscriber isolation */ }
    }
  }

  #matchingQueueSnapshot(location: DocumentLocation): readonly PersistedDocumentSyncQueueItem[] {
    return Object.freeze(this.#queue
      .filter((item) => this.#sameLocalLocation(item.localLocation, location))
      .map((item) => structuredClone(item))
      .sort((left, right) => left.order - right.order));
  }

  #emitSynchronisation(location: DocumentLocation, event: DocumentSynchronisationEvent): void {
    for (const listener of [...(this.#synchronisationListeners.get(canonicalDocumentLocation(location)) ?? [])]) {
      try { listener(structuredClone(event)); } catch { /* subscriber isolation */ }
    }
  }
}
