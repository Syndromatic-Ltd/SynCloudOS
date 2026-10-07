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

import {
  DocumentAbortError,
  DocumentUnavailableError,
  DocumentVersionConflictError,
} from "../DocumentErrors";
import {
  canonicalDocumentLocation,
  documentVersionsEqual,
  type DocumentLocation,
  type DocumentRecord,
  type DocumentVersion,
} from "../documentTypes";
import type {
  DocumentAdapterEnvironment,
  DocumentCloseStorageTransaction,
  DocumentListQuery,
  DocumentReadOptions,
  DocumentStorageAdapter,
  DocumentWatchListener,
  DocumentWatchSubscription,
  DocumentWriteRequest,
} from "./documentAdapterTypes";
import { canonicalDocumentJson, immutableDocumentValue } from "../documentTypes";

interface IdempotentWrite {
  readonly fingerprint: string;
  readonly record: DocumentRecord<unknown>;
}

interface InMemoryLocationState {
  readonly record: DocumentRecord<unknown> | null;
  readonly history: readonly DocumentRecord<unknown>[];
  readonly idempotency: readonly [string, IdempotentWrite][];
}

interface ActiveCloseTransaction {
  readonly token: string;
  readonly before: InMemoryLocationState;
  readonly events: Parameters<DocumentWatchListener>[0][];
}

export function throwIfDocumentAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DocumentAbortError("The document operation was aborted.", { cause: signal.reason });
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

export function cloneDocumentRecord<T>(record: DocumentRecord<T>): DocumentRecord<T> {
  return structuredClone(immutableDocumentValue(record, record.typeId));
}

export function assertExpectedDocumentVersion<T>(
  location: DocumentLocation,
  expected: DocumentVersion | null,
  current: DocumentRecord<T> | null,
): void {
  if ((expected === null && current !== null) ||
      (expected !== null && (current === null || !documentVersionsEqual(expected, current.version)))) {
    throw new DocumentVersionConflictError(location, expected, current);
  }
}

export class InMemoryDocumentAdapter implements DocumentStorageAdapter {
  readonly id = "memory";
  readonly capabilities = Object.freeze({
    versions: true,
    delete: true,
    watch: true,
    offline: true,
    atomicConditionalWrite: true,
  });
  readonly #records = new Map<string, DocumentRecord<unknown>>();
  readonly #history = new Map<string, readonly DocumentRecord<unknown>[]>();
  readonly #idempotency = new Map<string, IdempotentWrite>();
  readonly #listeners = new Map<string, Set<DocumentWatchListener>>();
  readonly #closeTransactions = new Map<string, ActiveCloseTransaction>();

  constructor(private readonly environment: DocumentAdapterEnvironment) {}

  supports(location: DocumentLocation): boolean { return location.kind === "memory"; }

  async read<TSerialized>(location: DocumentLocation, options: DocumentReadOptions = {}): Promise<DocumentRecord<TSerialized> | null> {
    throwIfDocumentAborted(options.signal);
    this.#requireSupported(location);
    const record = this.#records.get(canonicalDocumentLocation(location));
    return record ? cloneDocumentRecord(record as DocumentRecord<TSerialized>) : null;
  }

  async write<TSerialized>(request: DocumentWriteRequest<TSerialized>): Promise<DocumentRecord<TSerialized>> {
    throwIfDocumentAborted(request.signal);
    this.#requireSupported(request.location);
    if (!request.idempotencyKey.trim()) throw new TypeError("Document writes require a non-empty idempotency key.");
    request = {
      ...request,
      content: immutableDocumentValue(request.content, request.typeId),
      metadata: request.metadata ? immutableDocumentValue(request.metadata, request.typeId) : undefined,
    };
    const fingerprint = writeFingerprint(request);
    const repeated = this.#idempotency.get(request.idempotencyKey);
    if (repeated) {
      if (repeated.fingerprint !== fingerprint) {
        throw new DocumentUnavailableError(`Idempotency key "${request.idempotencyKey}" was reused for a different write.`, { retryable: false });
      }
      return cloneDocumentRecord(repeated.record as DocumentRecord<TSerialized>);
    }
    const key = canonicalDocumentLocation(request.location);
    this.#assertCloseMutationAllowed(key, request.closeTransactionToken);
    const current = (this.#records.get(key) as DocumentRecord<TSerialized> | undefined) ?? null;
    assertExpectedDocumentVersion(request.location, request.expectedVersion, current);
    const savedAt = new Date(this.environment.now()).toISOString();
    const sequence = (current?.version.sequence ?? 0) + 1;
    const record: DocumentRecord<TSerialized> = {
      location: structuredClone(request.location),
      typeId: request.typeId,
      schemaVersion: request.schemaVersion,
      content: structuredClone(request.content),
      version: {
        id: this.environment.randomUUID(),
        sequence,
        savedAt,
        etag: etagFor({ fingerprint, sequence, savedAt }, request.typeId),
      },
      createdAt: current?.createdAt ?? savedAt,
      updatedAt: savedAt,
      metadata: { ...(request.metadata ?? {}) },
    };
    const stored = cloneDocumentRecord(record);
    this.#records.set(key, stored);
    this.#history.set(key, Object.freeze([...(this.#history.get(key) ?? []), stored]));
    this.#idempotency.set(request.idempotencyKey, { fingerprint, record: stored });
    this.#emit(key, { kind: "written", record: cloneDocumentRecord(stored) });
    return cloneDocumentRecord(stored);
  }

  async remove(location: DocumentLocation, expectedVersion: DocumentVersion, options: DocumentReadOptions = {}): Promise<void> {
    throwIfDocumentAborted(options.signal);
    this.#requireSupported(location);
    this.#assertCloseMutationAllowed(canonicalDocumentLocation(location), options.closeTransactionToken);
    const key = canonicalDocumentLocation(location);
    const current = this.#records.get(key) ?? null;
    assertExpectedDocumentVersion(location, expectedVersion, current);
    this.#records.delete(key);
    this.#removeIdempotencyForVersions(key, new Set([expectedVersion.id]));
    this.#emit(key, { kind: "removed", location: structuredClone(location), version: structuredClone(expectedVersion) });
  }

  async adoptSynchronisedRecord<TSerialized>(
    record: DocumentRecord<TSerialized>,
    expectedLocalVersion: DocumentVersion,
    options: DocumentReadOptions = {},
  ): Promise<void> {
    throwIfDocumentAborted(options.signal);
    this.#requireSupported(record.location);
    const key = canonicalDocumentLocation(record.location);
    const current = (this.#records.get(key) as DocumentRecord<TSerialized> | undefined) ?? null;
    assertExpectedDocumentVersion(record.location, expectedLocalVersion, current);
    const stored = cloneDocumentRecord(record);
    this.#records.set(key, stored);
    const history = this.#history.get(key) ?? [];
    if (!history.some((candidate) => documentVersionsEqual(candidate.version, stored.version))) {
      this.#history.set(key, Object.freeze([...history, stored]));
    }
    for (const [idempotencyKey, entry] of this.#idempotency) {
      if (canonicalDocumentLocation(entry.record.location) === key &&
          documentVersionsEqual(entry.record.version, expectedLocalVersion)) {
        this.#idempotency.set(idempotencyKey, { ...entry, record: stored });
      }
    }
    this.#emit(key, { kind: "written", record: cloneDocumentRecord(stored) });
  }

  async adoptIntermediateSynchronisedRecord<TSerialized>(
    record: DocumentRecord<TSerialized>,
    expectedLocalVersion: DocumentVersion,
    options: DocumentReadOptions = {},
  ): Promise<void> {
    throwIfDocumentAborted(options.signal);
    this.#requireSupported(record.location);
    const key = canonicalDocumentLocation(record.location);
    const stored = cloneDocumentRecord(record);
    const history = [...(this.#history.get(key) ?? [])];
    const historicalIndex = history.findIndex(({ version }) =>
      documentVersionsEqual(version, expectedLocalVersion));
    if (historicalIndex < 0) {
      throw new DocumentVersionConflictError(record.location, expectedLocalVersion, this.#records.get(key) ?? null);
    }
    history[historicalIndex] = stored;
    this.#history.set(key, Object.freeze(history));
    for (const [idempotencyKey, entry] of this.#idempotency) {
      if (canonicalDocumentLocation(entry.record.location) === key &&
          documentVersionsEqual(entry.record.version, expectedLocalVersion)) {
        this.#idempotency.set(idempotencyKey, { ...entry, record: stored });
      }
    }
  }

  async rollbackSynchronisationIntent<TSerialized>(
    _itemId: string,
    committed: DocumentRecord<TSerialized>,
    previous: DocumentRecord<TSerialized> | null,
    signal?: AbortSignal,
  ): Promise<void> {
    throwIfDocumentAborted(signal);
    this.#requireSupported(committed.location);
    const key = canonicalDocumentLocation(committed.location);
    const current = (this.#records.get(key) as DocumentRecord<TSerialized> | undefined) ?? null;
    assertExpectedDocumentVersion(committed.location, committed.version, current);
    if (previous) this.#records.set(key, cloneDocumentRecord(previous));
    else this.#records.delete(key);
    const history = this.#history.get(key) ?? [];
    this.#history.set(key, Object.freeze(history.filter(({ version }) =>
      !documentVersionsEqual(version, committed.version))));
    this.#removeIdempotencyForVersions(key, new Set([committed.version.id]));
    this.#emit(key, previous
      ? { kind: "written", record: cloneDocumentRecord(previous) }
      : { kind: "removed", location: structuredClone(committed.location), version: structuredClone(committed.version) });
  }

  async discardSynchronisationIntents(
    location: DocumentLocation,
    signal?: AbortSignal,
    previous: DocumentRecord<unknown> | null = null,
  ): Promise<void> {
    throwIfDocumentAborted(signal);
    this.#requireSupported(location);
    const key = canonicalDocumentLocation(location);
    const history = this.#history.get(key) ?? [];
    const previousIndex = previous
      ? history.findIndex(({ version }) => documentVersionsEqual(version, previous.version))
      : -1;
    const discarded = previousIndex >= 0 ? history.slice(previousIndex + 1) : history;
    if (previous) this.#records.set(key, cloneDocumentRecord(previous));
    else this.#records.delete(key);
    this.#history.set(key, Object.freeze(previousIndex >= 0 ? history.slice(0, previousIndex + 1) : []));
    this.#removeIdempotencyForVersions(key, new Set(discarded.map(({ version }) => version.id)));
    const currentVersion = discarded.at(-1)?.version ?? previous?.version;
    if (previous) this.#emit(key, { kind: "written", record: cloneDocumentRecord(previous) });
    else if (currentVersion) {
      this.#emit(key, { kind: "removed", location: structuredClone(location), version: structuredClone(currentVersion) });
    }
  }

  async list(query: DocumentListQuery): Promise<readonly DocumentRecord<unknown>[]> {
    throwIfDocumentAborted(query.signal);
    if (query.locationKind && query.locationKind !== "memory") return Object.freeze([]);
    return Object.freeze([...this.#records.values()]
      .filter((record) => !query.typeId || record.typeId === query.typeId)
      .map(cloneDocumentRecord));
  }

  async listVersions(location: DocumentLocation, options: DocumentReadOptions = {}): Promise<readonly DocumentVersion[]> {
    throwIfDocumentAborted(options.signal);
    this.#requireSupported(location);
    return Object.freeze((this.#history.get(canonicalDocumentLocation(location)) ?? [])
      .map(({ version }) => structuredClone(version)));
  }

  async readVersion<TSerialized>(
    location: DocumentLocation,
    version: DocumentVersion,
    options: DocumentReadOptions = {},
  ): Promise<DocumentRecord<TSerialized> | null> {
    throwIfDocumentAborted(options.signal);
    this.#requireSupported(location);
    const record = (this.#history.get(canonicalDocumentLocation(location)) ?? [])
      .find((candidate) => documentVersionsEqual(candidate.version, version));
    return record ? cloneDocumentRecord(record as DocumentRecord<TSerialized>) : null;
  }

  watch(location: DocumentLocation, listener: DocumentWatchListener): DocumentWatchSubscription {
    this.#requireSupported(location);
    const key = canonicalDocumentLocation(location);
    const listeners = this.#listeners.get(key) ?? new Set<DocumentWatchListener>();
    listeners.add(listener);
    this.#listeners.set(key, listeners);
    let disposed = false;
    return { dispose: () => { if (disposed) return; disposed = true; listeners.delete(listener); } };
  }

  async beginCloseTransaction(
    location: DocumentLocation,
    options: DocumentReadOptions = {},
  ): Promise<DocumentCloseStorageTransaction> {
    throwIfDocumentAborted(options.signal);
    this.#requireSupported(location);
    const key = canonicalDocumentLocation(location);
    if (this.#closeTransactions.has(key)) {
      throw new DocumentUnavailableError("This document already has an active close storage transaction.", { retryable: true });
    }
    const active: ActiveCloseTransaction = {
      token: `memory-close:${this.environment.randomUUID()}`,
      before: this.#captureLocation(key),
      events: [],
    };
    this.#closeTransactions.set(key, active);
    let after: InMemoryLocationState | null = null;
    let settled = false;
    return {
      token: active.token,
      seal: async () => {
        if (settled) throw new DocumentUnavailableError("The close storage transaction is settled.", { retryable: false });
        after = this.#captureLocation(key);
      },
      rollback: async () => {
        if (settled) return;
        if (after && canonicalDocumentJson(this.#captureLocation(key), "document.close-transaction") !==
            canonicalDocumentJson(after, "document.close-transaction")) {
          throw new DocumentUnavailableError("The document changed after close precommit.", { retryable: true });
        }
        this.#restoreLocation(key, active.before);
        settled = true;
        if (this.#closeTransactions.get(key) === active) this.#closeTransactions.delete(key);
      },
      commit: () => {
        if (settled) return;
        settled = true;
        if (this.#closeTransactions.get(key) === active) this.#closeTransactions.delete(key);
        for (const event of active.events) this.#emit(key, event);
      },
    };
  }

  #assertCloseMutationAllowed(key: string, token: string | undefined): void {
    const transaction = this.#closeTransactions.get(key);
    if (transaction && transaction.token !== token) {
      throw new DocumentUnavailableError("This document is reserved by a close storage transaction.", { retryable: true });
    }
  }

  #emit(key: string, event: Parameters<DocumentWatchListener>[0]): void {
    const transaction = this.#closeTransactions.get(key);
    if (transaction) {
      transaction.events.push(structuredClone(event));
      return;
    }
    for (const listener of [...(this.#listeners.get(key) ?? [])]) {
      try { listener(structuredClone(event)); } catch { /* subscriber isolation */ }
    }
  }

  #captureLocation(key: string): InMemoryLocationState {
    const record = this.#records.get(key);
    return structuredClone({
      record: record ?? null,
      history: this.#history.get(key) ?? [],
      idempotency: [...this.#idempotency.entries()].filter(([, entry]) => (
        canonicalDocumentLocation(entry.record.location) === key
      )),
    });
  }

  #restoreLocation(key: string, state: InMemoryLocationState): void {
    if (state.record) this.#records.set(key, cloneDocumentRecord(state.record));
    else this.#records.delete(key);
    this.#history.set(key, Object.freeze(state.history.map(cloneDocumentRecord)));
    for (const [idempotencyKey, entry] of [...this.#idempotency]) {
      if (canonicalDocumentLocation(entry.record.location) === key) this.#idempotency.delete(idempotencyKey);
    }
    for (const [idempotencyKey, entry] of state.idempotency) {
      this.#idempotency.set(idempotencyKey, structuredClone(entry));
    }
  }

  #removeIdempotencyForVersions(key: string, versionIds: ReadonlySet<string>): void {
    for (const [idempotencyKey, entry] of this.#idempotency) {
      if (canonicalDocumentLocation(entry.record.location) === key && versionIds.has(entry.record.version.id)) {
        this.#idempotency.delete(idempotencyKey);
      }
    }
  }

  #requireSupported(location: DocumentLocation): void {
    if (!this.supports(location)) throw new DocumentUnavailableError(`Adapter "${this.id}" does not support ${location.kind} locations.`, { retryable: false });
  }
}
