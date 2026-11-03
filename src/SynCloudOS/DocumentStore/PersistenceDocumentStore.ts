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

import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";
import { createPersistence } from "../Persistence/Persistence";
import { canonicalDocumentJson } from "../Documents/documentTypes";
import type { SynCloudOSPersistence, SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";
import type { UndoManagerRegistry } from "../SynCloudOS";
import { SynCloudOSInMemoryDocumentStore, type SynCloudOSInMemoryDocumentStoreOptions } from "./InMemoryDocumentStore";
import type {
  DocumentStoreReadOptions,
  DocumentStoreWriteOptions,
  SynCloudOSDocument,
  SynCloudOSDocumentDraftInput,
  SynCloudOSDocumentKindMetadata,
  SynCloudOSDocumentKindRegistrationOptions,
  SynCloudOSDocumentMediaAttachment,
  SynCloudOSDocumentOwnership,
  SynCloudOSDocumentPublishOptions,
  SynCloudOSDocumentReference,
  SynCloudOSDocumentRevision,
  SynCloudOSDocumentRevisionOptions,
  SynCloudOSDocumentSlugResolveOptions,
  SynCloudOSDocumentStoreAdapter,
  SynCloudOSDocumentStoreContext,
  SynCloudOSDocumentStoreDraftVersions,
  SynCloudOSDocumentStoreIdempotencyEntry,
  SynCloudOSDocumentStoreSnapshot,
  SynCloudOSDocumentUnpublishOptions,
  SynCloudOSDraftDocumentQuery,
  SynCloudOSPublishedDocumentQuery
} from "./documentStoreTypes";
import {
  SynCloudOSDocumentStoreAtomicityUnavailableError,
  SynCloudOSDocumentStoreIdempotencyConflictError,
  SynCloudOSDocumentStoreMutationLockedError,
  SynCloudOSDocumentStorePayloadError,
  SynCloudOSDocumentStoreUnsupportedSchemaError,
  SynCloudOSDocumentStoreVersionConflictError,
} from "./documentStoreErrors";
import { throwIfDocumentStoreAborted } from "./InMemoryDocumentStore";
import { documentStoreSnapshotText, readDocumentStoreSnapshotValue } from "../PlatformAdapters/documentStoreSnapshotText";

const defaultPreferenceKey = "documentStore:v1";
const terminalMutationAuthority = Symbol("SynCloudOS.DocumentStore.terminalMutationAuthority");

export interface SynCloudOSPersistenceDocumentStoreOptions extends SynCloudOSInMemoryDocumentStoreOptions {
  preferenceKey?: string;
  persistence?: SynCloudOSPersistence;
  storage?: Storage | null;
  persistenceNamespace?: string;
  runtimeId?: SynCloudOSRuntimeId;
  undo?: Pick<UndoManagerRegistry, "get">;
  /** Resolves the runtime undo registry after its responder-dependent assembly. */
  resolveUndo?: () => Pick<UndoManagerRegistry, "get"> | undefined;
  conditionalWriteLock?: SynCloudOSDocumentStoreLock;
}

export interface SynCloudOSDocumentStoreLock {
  request<T>(
    name: string,
    options: { readonly mode: "exclusive"; readonly signal?: AbortSignal },
    callback: () => T | Promise<T>,
  ): Promise<T>;
}

export interface SynCloudOSDocumentStoreTerminalMutationLease {
  readonly documentId: string;
  readonly identity: string;
  authorise(context?: SynCloudOSDocumentStoreContext): SynCloudOSDocumentStoreContext;
  release(): boolean;
}

interface ActiveTerminalMutationLock {
  readonly lease: SynCloudOSDocumentStoreTerminalMutationLease;
  readonly documentId: string;
  readonly identity: string;
}

interface RecoveryResolution {
  readonly documentId: string;
  readonly etag: string | null;
}

function createDetachedPersistence(options: SynCloudOSPersistenceDocumentStoreOptions): SynCloudOSPersistence {
  return createPersistence({
    runtimeId: options.runtimeId ?? "runtime:document-store" as SynCloudOSRuntimeId,
    storage: options.storage ?? null,
    namespace: options.persistenceNamespace ?? "SynCloudOS4",
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clonePlain<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function toSerializableKind(metadata: SynCloudOSDocumentKindMetadata): SynCloudOSDocumentKindMetadata {
  return {
    kind: metadata.kind,
    version: metadata.version,
    displayName: metadata.displayName,
    description: metadata.description,
    indexes: metadata.indexes?.map((index) => ({ ...index, fields: [...index.fields] })),
    permissions: metadata.permissions
      ? Object.fromEntries(
          Object.entries(metadata.permissions).map(([operation, permission]) => [
            operation,
            permission
              ? {
                  ...permission,
                  requiredCapabilities: permission.requiredCapabilities ? [...permission.requiredCapabilities] : undefined,
                  requiredRoles: permission.requiredRoles ? [...permission.requiredRoles] : undefined
                }
              : permission
          ])
        ) as SynCloudOSDocumentKindMetadata["permissions"]
      : undefined,
    migrations: undefined
  };
}
function isOwnership(value: unknown): value is SynCloudOSDocumentOwnership {
  if (!isPlainObject(value) || (value.kind !== "system" && value.kind !== "application")) return false;
  if (value.kind === "system") return !Object.prototype.hasOwnProperty.call(value, "applicationId");
  return typeof value.applicationId === "string" && value.applicationId.trim().length > 0;
}

function ownershipKey(value: SynCloudOSDocument | SynCloudOSDocumentRevision): string {
  return value.ownership.kind === "application"
    ? `application:${normalizeBundleIdentifier(value.ownership.applicationId)}`
    : "system";
}

function isDocument(value: unknown): value is SynCloudOSDocument {
  if (!isPlainObject(value) ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    typeof value.kind !== "string" ||
    value.kind.length === 0 ||
    typeof value.version !== "number" ||
    !Number.isSafeInteger(value.version) ||
    value.version < 0 ||
    typeof value.createdAt !== "string" ||
    value.createdAt.length === 0 ||
    typeof value.updatedAt !== "string" ||
    value.updatedAt.length === 0 ||
    (value.publishState !== "draft" &&
      value.publishState !== "scheduled" &&
      value.publishState !== "published" &&
      value.publishState !== "unlisted" &&
      value.publishState !== "archived" &&
      value.publishState !== "deleted") ||
    !isOwnership(value.ownership)) {
    return false;
  }
  if (value.ownership.kind === "application") {
    return typeof value.applicationId === "string" && normalizeBundleIdentifier(value.applicationId) === normalizeBundleIdentifier(value.ownership.applicationId);
  }
  return !Object.prototype.hasOwnProperty.call(value, "applicationId");
}

function isRevision(value: unknown): value is SynCloudOSDocumentRevision {
  return isPlainObject(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.documentId === "string" &&
    value.documentId.length > 0 &&
    typeof value.kind === "string" &&
    value.kind.length > 0 &&
    typeof value.version === "number" &&
    Number.isSafeInteger(value.version) &&
    value.version >= 0 &&
    typeof value.createdAt === "string" &&
    value.createdAt.length > 0 &&
    isOwnership(value.ownership) &&
    !Object.prototype.hasOwnProperty.call(value, "applicationId") &&
    isDocument(value.snapshot);
}

function isKind(value: unknown): value is SynCloudOSDocumentKindMetadata {
  return isPlainObject(value) &&
    typeof value.kind === "string" &&
    value.kind.length > 0 &&
    typeof value.version === "number" &&
    Number.isSafeInteger(value.version) &&
    value.version >= 0 &&
    typeof value.displayName === "string" &&
    value.displayName.length > 0;
}

function isDraftVersions(value: unknown): value is SynCloudOSDocumentStoreDraftVersions {
  return isPlainObject(value) &&
    typeof value.documentId === "string" &&
    value.documentId.length > 0 &&
    Array.isArray(value.documents) &&
    value.documents.every(isDocument);
}

function isIdempotencyEntry(value: unknown): value is SynCloudOSDocumentStoreIdempotencyEntry {
  return isPlainObject(value) &&
    typeof value.key === "string" &&
    value.key.length > 0 &&
    typeof value.fingerprint === "string" &&
    value.fingerprint.length > 0 &&
    (value.operation === "saveDraft" || value.operation === "deleteDraft") &&
    (value.document === null || isDocument(value.document));
}

function validateSnapshotIntegrity(snapshot: {
  readonly documents: readonly SynCloudOSDocument[];
  readonly revisions: readonly SynCloudOSDocumentRevision[];
  readonly draftVersions: readonly SynCloudOSDocumentStoreDraftVersions[];
  readonly idempotentDraftWrites: readonly SynCloudOSDocumentStoreIdempotencyEntry[];
}) {
  const records = new Map<string, { readonly kind: string; readonly owner: string }>();
  const remember = (document: SynCloudOSDocument, provenance: string) => {
    const current = { kind: document.kind, owner: ownershipKey(document) };
    const previous = records.get(document.id);
    if (previous && (previous.kind !== current.kind || previous.owner !== current.owner)) {
      throw new SynCloudOSDocumentStorePayloadError(
        `${provenance} conflicts with another persisted kind or owner for document ${document.id}.`,
      );
    }
    records.set(document.id, current);
  };
  const assertRevisionSnapshot = (revision: SynCloudOSDocumentRevision) => {
    if (revision.snapshot.id !== revision.documentId ||
      revision.snapshot.kind !== revision.kind ||
      revision.snapshot.version !== revision.version ||
      ownershipKey(revision.snapshot) !== ownershipKey(revision)) {
      throw new SynCloudOSDocumentStorePayloadError(
        `Revision ${revision.id} does not consistently identify document ${revision.documentId}.`,
      );
    }
  };

  for (const document of snapshot.documents) remember(document, `Document ${document.id}`);
  for (const revision of snapshot.revisions) {
    assertRevisionSnapshot(revision);
    remember(revision.snapshot, `Revision ${revision.id}`);
  }
  for (const entry of snapshot.draftVersions) {
    let first: { readonly kind: string; readonly owner: string } | undefined;
    for (const document of entry.documents) {
      if (document.id !== entry.documentId) {
        throw new SynCloudOSDocumentStorePayloadError(
          `Draft-version entry ${entry.documentId} contains another document ID.`,
        );
      }
      const current = { kind: document.kind, owner: ownershipKey(document) };
      if (first && (first.kind !== current.kind || first.owner !== current.owner)) {
        throw new SynCloudOSDocumentStorePayloadError(
          `Draft-version entry ${entry.documentId} contains conflicting kind or ownership.`,
        );
      }
      first = current;
      remember(document, `Draft version ${entry.documentId}`);
    }
  }
  const idempotencyEntries = new Map<string, SynCloudOSDocumentStoreIdempotencyEntry>();
  for (const entry of snapshot.idempotentDraftWrites) {
    const previous = idempotencyEntries.get(entry.key);
    if (previous && (
      previous.fingerprint !== entry.fingerprint ||
      previous.operation !== entry.operation ||
      (previous.document === null) !== (entry.document === null) ||
      (previous.document && entry.document && (
        previous.document.id !== entry.document.id ||
        ownershipKey(previous.document) !== ownershipKey(entry.document)
      ))
    )) {
      throw new SynCloudOSDocumentStorePayloadError(
        `Idempotency key ${entry.key} is replayed with a different operation.`,
      );
    }
    idempotencyEntries.set(entry.key, entry);
    if (entry.document) remember(entry.document, `Idempotency entry ${entry.key}`);
  }
}

function normaliseSnapshot(value: unknown): SynCloudOSDocumentStoreSnapshot {
  if (value !== null && value !== undefined) {
    try {
      value = JSON.parse(canonicalDocumentJson(value, "document-store.snapshot", {
        maxDepth: 80,
        maxNodes: 250_000,
        maxBytes: 16 * 1024 * 1024,
      })) as unknown;
    } catch (error) {
      throw new SynCloudOSDocumentStorePayloadError(
        error instanceof Error ? error.message : "DocumentStore snapshot is malformed.",
        error,
      );
    }
  }
  if (value === null || value === undefined) {
    return {
      schemaVersion: 2,
      savedAt: new Date(0).toISOString(),
      kinds: [],
      documents: [],
      revisions: [],
      draftVersions: [],
      idempotentDraftWrites: [],
    };
  }
  if (!isPlainObject(value) || typeof value.schemaVersion !== "number") {
    throw new SynCloudOSDocumentStorePayloadError("DocumentStore snapshot envelope is malformed.");
  }
  if (value.schemaVersion > 2) {
    throw new SynCloudOSDocumentStoreUnsupportedSchemaError(value.schemaVersion);
  }
  if (value.schemaVersion !== 2) {
    throw new SynCloudOSDocumentStorePayloadError("DocumentStore snapshots must use schema version 2.");
  }
  if (typeof value.savedAt !== "string" ||
    !Array.isArray(value.kinds) ||
    !value.kinds.every(isKind) ||
    !Array.isArray(value.documents) ||
    !value.documents.every(isDocument) ||
    !Array.isArray(value.revisions) ||
    !value.revisions.every(isRevision) ||
    !Array.isArray(value.draftVersions) ||
    !value.draftVersions.every(isDraftVersions) ||
    !Array.isArray(value.idempotentDraftWrites) ||
    !value.idempotentDraftWrites.every(isIdempotencyEntry)) {
    throw new SynCloudOSDocumentStorePayloadError("DocumentStore snapshot schema 2 contains malformed entries.");
  }

  const snapshot = {
    schemaVersion: 2 as const,
    savedAt: value.savedAt,
    kinds: value.kinds.map(toSerializableKind),
    documents: value.documents.map(clonePlain),
    revisions: value.revisions.map(clonePlain),
    draftVersions: value.draftVersions.map(clonePlain),
    idempotentDraftWrites: value.idempotentDraftWrites.map(clonePlain),
  };
  validateSnapshotIntegrity(snapshot);
  return snapshot;
}

/** Parses stored snapshot text with getPreference's semantics: absent, empty
 * or unparseable text reads as no snapshot. */
function parseStoredSnapshot(text: string | null): unknown {
  if (!text) return null;
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  return readDocumentStoreSnapshotValue(value);
}

function persistenceUnavailable(): SynCloudOSDocumentStoreAtomicityUnavailableError {
  const error = new SynCloudOSDocumentStoreAtomicityUnavailableError();
  error.message = "DocumentStore could not persist this write because storage is full or unavailable. The previous saved document has not been replaced.";
  return error;
}

function mergeById<T extends { id: string }>(seed: T[] = [], persisted: T[] = []) {
  const items = new Map<string, T>();
  for (const item of seed) items.set(item.id, clonePlain(item));
  for (const item of persisted) items.set(item.id, clonePlain(item));
  return Array.from(items.values());
}

function mergeKinds(seed: SynCloudOSDocumentKindMetadata[] = [], persisted: SynCloudOSDocumentKindMetadata[] = []) {
  const items = new Map<string, SynCloudOSDocumentKindMetadata>();
  for (const kind of persisted) items.set(kind.kind, toSerializableKind(kind));
  for (const kind of seed) items.set(kind.kind, kind);
  return Array.from(items.values());
}

/** Compare the persisted representation, including ETags, regardless of key order
 * or optional undefined fields present only in the in-memory record. */
function recoveryValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return canonicalDocumentJson(JSON.parse(JSON.stringify(value)), "document-store.recovery", {
    maxDepth: 80, maxNodes: 250_000, maxBytes: 16 * 1024 * 1024,
  });
}

/** Apply only changes since the rejected write's base. A concurrent change to
 * the same entry is an explicit conflict, never a last-writer-wins overwrite. */
function reconcileEntries<T>(
  base: readonly T[], local: readonly T[], stored: readonly T[],
  key: (entry: T) => string, conflict: (key: string) => void,
): T[] {
  const before = new Map(base.map(entry => [key(entry), entry]));
  const retained = new Map(local.map(entry => [key(entry), entry]));
  const result = new Map(stored.map(entry => [key(entry), entry]));
  for (const id of new Set([...before.keys(), ...retained.keys()])) {
    const original = recoveryValue(before.get(id));
    const changed = recoveryValue(retained.get(id));
    if (original === changed) continue;
    const current = recoveryValue(result.get(id));
    if (current !== original && current !== changed) {
      // A non-throwing callback explicitly selects the stored entry as the
      // basis of a conditional resolution; the caller's mutation follows.
      conflict(id);
      continue;
    }
    const entry = retained.get(id);
    if (entry === undefined) result.delete(id);
    else result.set(id, entry);
  }
  return [...result.values()];
}

/** @internal Coarse observations of this canonical store's actual mutation tail.
 * Queued and running stages remain counted until their real promise settles.
 * This is neither a durability assertion nor a census of other persistence owners.
 */
export interface DocumentStorePersistenceObservation {
  getSnapshot(): Readonly<{ revision: number; pending: number; ended: boolean }>;
  subscribe(listener: () => void): () => void;
}
const persistenceObservations = new WeakMap<object, DocumentStorePersistenceObservation>();
export function observeDocumentStorePersistence(store: SynCloudOSDocumentStoreAdapter): DocumentStorePersistenceObservation | null {
  return persistenceObservations.get(store) ?? null;
}
function createMutationObservation(owner: object) {
  let snapshot: ReturnType<DocumentStorePersistenceObservation["getSnapshot"]> = Object.freeze({ revision: 0, pending: 0, ended: false });
  const listeners = new Set<() => void>();
  const publish = (pending: number, ended = snapshot.ended) => {
    snapshot = Object.freeze({ revision: snapshot.revision + 1, pending, ended });
    for (const listener of [...listeners]) { try { listener(); } catch { /* Inspection cannot affect mutations. */ } }
    if (ended && pending === 0) listeners.clear();
  };
  persistenceObservations.set(owner, Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      if (snapshot.ended && snapshot.pending === 0) return () => undefined;
      listeners.add(listener); return () => { listeners.delete(listener); };
    },
  }));
  return {
    begin() {
      publish(snapshot.pending + 1);
      let released = false;
      return () => { if (!released) { released = true; publish(snapshot.pending - 1); } };
    },
    end() { if (!snapshot.ended) publish(snapshot.pending, true); },
  };
}

export class SynCloudOSPersistenceDocumentStore implements SynCloudOSDocumentStoreAdapter {
  readonly runtimeId?: SynCloudOSRuntimeId;
  private readonly preferenceKey: string;
  private readonly persistence: SynCloudOSPersistence;
  private store: SynCloudOSInMemoryDocumentStore;
  private readonly resolveUndo: () => Pick<UndoManagerRegistry, "get"> | undefined;
  private readonly runtimeInstanceId?: SynCloudOSRuntimeId;
  private readonly options: SynCloudOSPersistenceDocumentStoreOptions;
  private readonly conditionalWriteLock?: SynCloudOSDocumentStoreLock;
  private readonly runtimeKinds = new Map<string, SynCloudOSDocumentKindMetadata>();
  private readonly terminalMutationLocks = new Map<string, ActiveTerminalMutationLock>();
  private readonly ordinaryMutationsByDocumentId = new Map<string, number>();
  private mutationTail: Promise<void> = Promise.resolve();
  private readonly mutationObservation = createMutationObservation(this);
  private readonly importedSnapshotSavedAt?: string;
  private snapshotDirty = false;
  /** Storage state against which accepted, memory-only changes were made. */
  private unpersistedBase: SynCloudOSInMemoryDocumentStore | null = null;
  private disposed = false;
  /**
   * The exact stored text `store` was last loaded from or written as, when
   * the persistence exposes text. Under the write lock, storage still holding
   * this text means no other context has written since, so the next mutation
   * forks the current store instead of re-reading, re-validating and
   * rebuilding every record. Any other outcome clears it.
   */
  private persistedText: string | null = null;

  get supportsAtomicConditionalWrites(): boolean { return this.conditionalWriteLock !== undefined; }

  reserveTerminalMutation(documentId: string, identity: string): SynCloudOSDocumentStoreTerminalMutationLease {
    this.assertActive();
    documentId = documentId.trim();
    identity = identity.trim();
    if (!documentId) throw new TypeError("Terminal mutation document IDs must not be empty.");
    if (!identity) throw new TypeError("Terminal mutation identities must not be empty.");
    if (this.terminalMutationLocks.has(documentId) || (this.ordinaryMutationsByDocumentId.get(documentId) ?? 0) > 0) {
      throw new SynCloudOSDocumentStoreMutationLockedError(documentId);
    }
    let released = false;
    let active!: ActiveTerminalMutationLock;
    const lease: SynCloudOSDocumentStoreTerminalMutationLease = Object.freeze({
      documentId,
      identity,
      authorise: (context: SynCloudOSDocumentStoreContext = {}) => {
        if (released || this.terminalMutationLocks.get(documentId) !== active) {
          throw new SynCloudOSDocumentStoreMutationLockedError(documentId);
        }
        return { ...context, [terminalMutationAuthority]: lease };
      },
      release: () => {
        if (released) return false;
        released = true;
        if (this.terminalMutationLocks.get(documentId) !== active) return false;
        this.terminalMutationLocks.delete(documentId);
        return true;
      },
    });
    active = { lease, documentId, identity };
    this.terminalMutationLocks.set(documentId, active);
    return lease;
  }

  isTerminalMutationLocked(documentId: string): boolean {
    return this.terminalMutationLocks.has(documentId);
  }
  constructor(options: SynCloudOSPersistenceDocumentStoreOptions = {}) {
    this.options = options;
    this.preferenceKey = options.preferenceKey ?? defaultPreferenceKey;
    this.persistence = options.persistence ?? createDetachedPersistence(options);
    this.resolveUndo = options.resolveUndo ?? (() => options.undo);
    this.runtimeId = options.runtimeId;
    this.runtimeInstanceId = options.runtimeId;
    this.conditionalWriteLock = options.conditionalWriteLock;
    for (const kind of options.kinds ?? []) this.runtimeKinds.set(kind.kind, kind);
    const text = this.readSnapshotText();
    const persisted = text === undefined ? readDocumentStoreSnapshotValue(this.persistence.getPreference<unknown>(this.preferenceKey, null)) : parseStoredSnapshot(text);
    const hasPersistedSnapshot = persisted !== null && persisted !== undefined;
    const snapshot = normaliseSnapshot(persisted);
    if (hasPersistedSnapshot) this.importedSnapshotSavedAt = snapshot.savedAt;
    this.store = this.createStore(snapshot);
    this.persistedText = text ?? null;
  }

  registerKind<TDocument extends SynCloudOSDocument>(
    metadata: SynCloudOSDocumentKindMetadata<TDocument>,
    options: SynCloudOSDocumentKindRegistrationOptions = {},
  ) {
    this.assertActive();
    const registered = this.store.registerKind(metadata, options);
    this.runtimeKinds.set(registered.kind, registered);
    // The store now differs from what was stored.
    this.persistedText = null;
    if (this.conditionalWriteLock) {
      void this.enqueueMutation(() => this.withMutationLock(undefined, async () => {
        const { store, canPersist } = this.lockedMutationStore();
        if (!store.getKind(registered.kind)) store.registerKind(registered, { emitEvent: false });
        if (!canPersist || !this.persistStore(store)) throw persistenceUnavailable();
        this.snapshotDirty = true;
        this.store = store;
        this.unpersistedBase = null;
      })).catch(() => undefined);
    } else {
      this.persist();
      this.snapshotDirty = true;
    }
    return registered;
  }


  getKind(kind: string) {
    this.assertActive();
    return this.store.getKind(kind);
  }

  listKinds() {
    this.assertActive();
    return this.store.listKinds();
  }

  readPublished(reference: SynCloudOSDocumentReference, context?: SynCloudOSDocumentStoreContext) {
    this.assertActive();
    return this.store.readPublished(reference, context);
  }

  listPublished(query?: SynCloudOSPublishedDocumentQuery, context?: SynCloudOSDocumentStoreContext) {
    this.assertActive();
    return this.store.listPublished(query, context);
  }

  listDrafts(query?: SynCloudOSDraftDocumentQuery, context?: SynCloudOSDocumentStoreContext) {
    this.assertActive();
    return this.store.listDrafts(query, context);
  }

  getDraft(documentId: string, context?: SynCloudOSDocumentStoreContext) {
    this.assertActive();
    return this.store.getDraft(documentId, context);
  }

  listDraftVersions(documentId: string, context?: SynCloudOSDocumentStoreContext, options?: DocumentStoreReadOptions) {
    this.assertActive();
    return this.store.listDraftVersions(documentId, context, options);
  }

  readDraftVersion(documentId: string, versionId: string, context?: SynCloudOSDocumentStoreContext, options?: DocumentStoreReadOptions) {
    this.assertActive();
    return this.store.readDraftVersion(documentId, versionId, context, options);
  }

  async saveDraft<TBody = unknown, TMetadata extends Record<string, unknown> = Record<string, unknown>>(
    draft: SynCloudOSDocumentDraftInput<TBody, TMetadata>,
    context?: SynCloudOSDocumentStoreContext,
    options: DocumentStoreWriteOptions = {},
  ) {
    this.assertActive();
    const mutation = () => this.mutateStore(options.signal ?? context?.signal, options.ifMatch !== undefined, async (store) => {
      const saved = await store.saveDraft(this.withRuntimeId(draft), context, options);
      return saved;
    }, draft.id && options.ifMatch !== undefined ? { documentId: draft.id, etag: options.ifMatch } : undefined);
    return (draft.id ? this.trackDocumentMutation(draft.id, context, mutation) : mutation()).then(({ value: saved, persisted }) => {
      if (persisted) this.resolveUndo()?.get({ kind: "document", id: saved.id })?.markClean();
      return saved;
    });
  }

  async deleteDraft(documentId: string, context?: SynCloudOSDocumentStoreContext, options: DocumentStoreWriteOptions = {}) {
    this.assertActive();
    return this.trackDocumentMutation(documentId, context, () =>
      this.mutateStore(options.signal ?? context?.signal, options.ifMatch !== undefined, (store) =>
        store.deleteDraft(documentId, context, options))).then(() => undefined);
  }

  async createRevision(documentId: string, options?: SynCloudOSDocumentRevisionOptions, context?: SynCloudOSDocumentStoreContext) {
    this.assertActive();
    return this.trackDocumentMutation(documentId, context, () =>
      this.mutateStore(context?.signal, false, (store) => store.createRevision(documentId, options, context)))
      .then(({ value }) => value);
  }

  async publish(documentId: string, options?: SynCloudOSDocumentPublishOptions, context?: SynCloudOSDocumentStoreContext) {
    this.assertActive();
    return this.trackDocumentMutation(documentId, context, () =>
      this.mutateStore(context?.signal, options?.ifMatch !== undefined, (store) => store.publish(documentId, options, context)))
      .then(({ value: published, persisted }) => {
        if (persisted) this.resolveUndo()?.get({ kind: "document", id: published.id })?.markClean();
        return published;
      });
  }

  async unpublish(documentId: string, options?: SynCloudOSDocumentUnpublishOptions, context?: SynCloudOSDocumentStoreContext) {
    this.assertActive();
    return this.trackDocumentMutation(documentId, context, () =>
      this.mutateStore(context?.signal, options?.ifMatch !== undefined, (store) => store.unpublish(documentId, options, context)))
      .then(({ value }) => value);
  }

  resolveSlug(slug: string, options?: SynCloudOSDocumentSlugResolveOptions, context?: SynCloudOSDocumentStoreContext) {
    this.assertActive();
    return this.store.resolveSlug(slug, options, context);
  }

  async attachMedia(documentId: string, media: SynCloudOSDocumentMediaAttachment, context?: SynCloudOSDocumentStoreContext) {
    this.assertActive();
    return this.trackDocumentMutation(documentId, context, () =>
      this.mutateStore(context?.signal, false, (store) => store.attachMedia(documentId, media, context)))
      .then(({ value }) => value);
  }

  exportSnapshot() {
    this.assertActive();
    const snapshot = this.store.exportSnapshot();
    return !this.snapshotDirty && this.importedSnapshotSavedAt !== undefined
      ? { ...snapshot, savedAt: this.importedSnapshotSavedAt }
      : snapshot;
  }

  dispose() {
    this.disposed = true;
    this.mutationObservation.end();
    this.terminalMutationLocks.clear();
    this.ordinaryMutationsByDocumentId.clear();
  }

  private assertActive() {
    if (this.disposed) throw new Error("DocumentStore is disposed.");
  }

  private withRuntimeId<T extends { runtimeId?: string }>(document: T): T {
    return this.runtimeInstanceId ? { ...document, runtimeId: this.runtimeInstanceId } : document;
  }

  private trackDocumentMutation<T>(
    documentId: string,
    context: SynCloudOSDocumentStoreContext | undefined,
    operation: () => Promise<T>,
  ): Promise<T> {
    const active = this.terminalMutationLocks.get(documentId);
    const authority = context && (context as SynCloudOSDocumentStoreContext & {
      readonly [terminalMutationAuthority]?: SynCloudOSDocumentStoreTerminalMutationLease;
    })[terminalMutationAuthority];
    if (active && authority !== active.lease) {
      return Promise.reject(new SynCloudOSDocumentStoreMutationLockedError(documentId));
    }
    if (active) return operation();
    this.ordinaryMutationsByDocumentId.set(documentId, (this.ordinaryMutationsByDocumentId.get(documentId) ?? 0) + 1);
    let result: Promise<T>;
    try { result = operation(); }
    catch (error) { result = Promise.reject(error); }
    return result.finally(() => {
      const remaining = (this.ordinaryMutationsByDocumentId.get(documentId) ?? 1) - 1;
      if (remaining <= 0) this.ordinaryMutationsByDocumentId.delete(documentId);
      else this.ordinaryMutationsByDocumentId.set(documentId, remaining);
    });
  }

  private createStore(snapshot: SynCloudOSDocumentStoreSnapshot) {
    return new SynCloudOSInMemoryDocumentStore({
      kinds: mergeKinds([...this.runtimeKinds.values()], snapshot.kinds),
      documents: mergeById(this.options.documents, snapshot.documents).map((document) => this.withRuntimeId(document)),
      revisions: mergeById(this.options.revisions, snapshot.revisions),
      draftVersions: snapshot.draftVersions,
      idempotentDraftWrites: snapshot.idempotentDraftWrites,
      events: this.options.events,
      authorise: this.options.authorise,
      clock: this.options.clock,
      etag: this.options.etag,
    });
  }

  private enqueueMutation<T>(mutation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(mutation, mutation);
    this.mutationTail = result.then(() => undefined, () => undefined);
    // Establish queue ordering before notifying observers: reentrant work must
    // join this tail. Logical cancellation/disposal never releases real work.
    const release = this.mutationObservation.begin();
    void result.then(release, release);
    return result;
  }

  private withMutationLock<T>(signal: AbortSignal | undefined, callback: () => Promise<T>): Promise<T> {
    if (!this.conditionalWriteLock) {
      return Promise.reject(new SynCloudOSDocumentStoreAtomicityUnavailableError());
    }
    return this.conditionalWriteLock.request(
      `document-store:${this.preferenceKey}`,
      { mode: "exclusive", signal },
      callback,
    );
  }

  private mutateStore<T>(
    signal: AbortSignal | undefined,
    requireAtomic: boolean,
    mutation: (store: SynCloudOSInMemoryDocumentStore) => Promise<T>,
    resolution?: RecoveryResolution,
  ): Promise<{ readonly value: T; readonly persisted: boolean }> {
    if (requireAtomic && !this.conditionalWriteLock) {
      return Promise.reject(new SynCloudOSDocumentStoreAtomicityUnavailableError());
    }
    return this.enqueueMutation(async () => {
      throwIfDocumentStoreAborted(signal);
      const execute = async () => {
        throwIfDocumentStoreAborted(signal);
        const { store, base, canPersist } = this.conditionalWriteLock
          ? this.lockedMutationStore(resolution)
          : { store: this.store, base: this.store, canPersist: true };
        this.persistedText = null;
        const value = await mutation(store);
        throwIfDocumentStoreAborted(signal);
        const persisted = canPersist && this.persistStore(store);
        if (requireAtomic && !persisted) throw persistenceUnavailable();
        this.snapshotDirty = true;
        this.store = store;
        this.unpersistedBase = persisted || !this.conditionalWriteLock ? null : base;
        return { value, persisted } as const;
      };
      return this.conditionalWriteLock ? this.withMutationLock(signal, execute) : execute();
    });
  }

  private persist() {
    return this.persistStore(this.store);
  }

  /** Stored snapshot text, or undefined when the persistence only offers values. */
  private readSnapshotText(): string | null | undefined {
    const { readPreferenceText, writePreferenceText } = this.persistence;
    if (typeof readPreferenceText !== "function" || typeof writePreferenceText !== "function") return undefined;
    return readPreferenceText.call(this.persistence, this.preferenceKey);
  }

  private readStoredSnapshot(): unknown {
    const text = this.readSnapshotText();
    return text === undefined ? readDocumentStoreSnapshotValue(this.persistence.getPreference<unknown>(this.preferenceKey, null)) : parseStoredSnapshot(text);
  }

  /** Acquire storage under the write lock, then rebase any accepted memory-only
   * changes. Return the observed base separately so another rejected write can
   * retain those changes without claiming adopted remote records as local. */
  private lockedMutationStore(resolution?: RecoveryResolution): { store: SynCloudOSInMemoryDocumentStore; base: SynCloudOSInMemoryDocumentStore; canPersist: boolean } {
    const text = this.readSnapshotText();
    if (!this.unpersistedBase && text !== undefined && text !== null && text === this.persistedText) {
      return { store: this.store.fork(), base: this.store, canPersist: true };
    }
    const snapshot = text === undefined ? this.readStoredSnapshot() : parseStoredSnapshot(text);
    const before = this.unpersistedBase?.serialisableSnapshot();
    // Persistence readers map denied reads and malformed text to null, just as
    // they do a missing key. Once a populated base disappears, it is unsafe to
    // interpret that ambiguity as remote deletions or overwrite unseen writes.
    // Best-effort operations remain live in memory until storage is readable.
    if (snapshot == null && before && (before.documents.length || before.revisions.length
      || before.draftVersions.length || before.idempotentDraftWrites.length)) {
      return { store: this.store.fork(), base: this.unpersistedBase!, canPersist: false };
    }
    const base = this.createStore(normaliseSnapshot(snapshot));
    if (!before) return { store: base.fork(), base, canPersist: true };

    // Preserve accepted memory-only writes, but also observe changes made by
    // another context under this same lock. Rebase even if persistence fails
    // again, so adopted remote changes are not mistaken for local edits later.
    const local = this.store.serialisableSnapshot();
    const stored = base.serialisableSnapshot();
    const documentConflict = (id: string): never => {
      throw new SynCloudOSDocumentStoreVersionConflictError(id,
        resolution?.documentId === id ? resolution.etag : before.documents.find(document => document.id === id)?.storageVersion?.etag ?? null,
        clonePlain(stored.documents.find(document => document.id === id) ?? null));
    };
    const resolveDocument = (id: string): void => {
      const current = stored.documents.find(document => document.id === id);
      // Only an explicit conditional replacement of this document may resolve
      // its divergent draft/history. Retain the committed history and append
      // the caller's chosen replacement through the normal saveDraft path.
      if (resolution?.documentId === id && (current ? current.storageVersion?.etag === resolution.etag : resolution.etag === null)) return;
      documentConflict(id);
    };
    const merged: SynCloudOSDocumentStoreSnapshot = {
      schemaVersion: 2, savedAt: stored.savedAt,
      kinds: reconcileEntries(before.kinds, local.kinds, stored.kinds, entry => entry.kind, id => {
        throw new SynCloudOSDocumentStorePayloadError(`DocumentStore kind ${id} changed during persistence recovery.`);
      }),
      documents: reconcileEntries(before.documents, local.documents, stored.documents, entry => entry.id, resolveDocument),
      revisions: reconcileEntries(before.revisions, local.revisions, stored.revisions, entry => entry.id, id => {
        const revision = local.revisions.find(entry => entry.id === id) ?? stored.revisions.find(entry => entry.id === id)!;
        return documentConflict(revision.documentId);
      }),
      draftVersions: reconcileEntries(before.draftVersions, local.draftVersions, stored.draftVersions, entry => entry.documentId, resolveDocument),
      idempotentDraftWrites: reconcileEntries(before.idempotentDraftWrites, local.idempotentDraftWrites, stored.idempotentDraftWrites, entry => entry.key, id => {
        throw new SynCloudOSDocumentStoreIdempotencyConflictError(id);
      }),
    };
    validateSnapshotIntegrity(merged);
    return { store: this.createStore(merged), base, canPersist: true };
  }

  private persistStore(store: SynCloudOSInMemoryDocumentStore) {
    this.persistedText = null;
    const { writePreferenceText } = this.persistence;
    if (typeof writePreferenceText === "function" && typeof this.persistence.readPreferenceText === "function") {
      // Serialised straight from the stored records: identical text to
      // setPreference(exportSnapshot()), without cloning every record first.
      const snapshot = store.serialisableSnapshot();
      const text = documentStoreSnapshotText({ ...snapshot, kinds: snapshot.kinds.map(toSerializableKind) });
      const persisted = writePreferenceText.call(this.persistence, this.preferenceKey, text);
      if (persisted) this.persistedText = text;
      return persisted;
    }
    const snapshot = store.exportSnapshot();
    const text = documentStoreSnapshotText({
      ...snapshot,
      kinds: snapshot.kinds.map(toSerializableKind),
    });
    return this.persistence.setPreference<unknown>(this.preferenceKey, JSON.parse(text));
  }
}

type SynCloudOSRuntimeDocumentStore = SynCloudOSPersistenceDocumentStore & {
  readonly runtimeId: SynCloudOSRuntimeId;
};

export function createPersistenceDocumentStore(
  options: SynCloudOSPersistenceDocumentStoreOptions & { readonly runtimeId: SynCloudOSRuntimeId },
): SynCloudOSRuntimeDocumentStore;
export function createPersistenceDocumentStore(
  options?: SynCloudOSPersistenceDocumentStoreOptions,
): SynCloudOSPersistenceDocumentStore;
export function createPersistenceDocumentStore(
  options: SynCloudOSPersistenceDocumentStoreOptions = {},
): SynCloudOSPersistenceDocumentStore | SynCloudOSRuntimeDocumentStore {
  return new SynCloudOSPersistenceDocumentStore(options);
}

export function clearPersistenceDocumentStoreSnapshot(
  preferenceKey = defaultPreferenceKey,
  persistence?: SynCloudOSPersistence,
) {
  persistence?.removePreference(preferenceKey);
}
