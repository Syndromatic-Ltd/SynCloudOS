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

import { type UndoManager, type UndoReservation } from "../Undo";
import { stageDocumentEdit } from "./DocumentEditTransaction";
import { createDocumentEditHistoryAction } from "./documentEditHistory";
import type { DocumentEditOptions, DocumentEditReceipt, DocumentEditResourceRetention, DocumentEditResult } from "./documentEditTypes";
import type { DocumentEditAdmission } from "./documentEditAdmission";
import type { DocumentResourceChange, DocumentResourceLifecycle, DocumentResourceModelPreparation } from "./documentResourceLifecycle";
import { DocumentEditingParticipants, requireSettledDocumentEditing } from "./DocumentEditingParticipants";
import type { DocumentEditingLifetimeOptions, DocumentEditingParticipant, DocumentEditingParticipantRegistration, DocumentEditingReason, DocumentEditingSettlementResult } from "./documentEditingTypes";
import {
  DocumentAbortError,
  DocumentDeletedError,
  DocumentError,
  DocumentLocationRequiredError,
  DocumentNotFoundError,
  DocumentReadOnlyError,
  DocumentSchemaError,
  DocumentUnavailableError,
  DocumentVersionConflictError,
  DocumentWriteOutcomeUnknownError,
} from "./DocumentErrors";
import { AutosaveScheduler } from "./AutosaveScheduler";
import { canonicalDocumentContentHash, type DocumentRecoveryRecord, type DocumentRecoveryStore } from "./DocumentRecoveryStore";
import { documentAdoptionAuthority, type DocumentAdoptionAuthority } from "./documentAdoptionAuthority";
import { documentProjectionAuthority, type DocumentProjectionAuthority } from "./documentProjectionAuthority";
import { migrateDocumentPayload } from "./DocumentTypeRegistry";
import { canonicalDocumentJson, canonicalDocumentLocation, immutableDocumentValue } from "./documentTypes";
import type {
  DocumentConflict,
  DocumentConflictResolution,
  DocumentKind,
  DocumentLocation,
  DocumentRecord,
  DocumentRuntimeEnvironment,
  DocumentState,
  DocumentType,
  DocumentVersion,
  DocumentWindowAssociation,
  SaveDocumentOptions,
} from "./documentTypes";
import type {
  DocumentStorageAdapter,
  DocumentSynchronisationEvent,
  DocumentWatchSubscription,
  DocumentWriteRequest,
} from "./Adapters/documentAdapterTypes";
import { throwIfDocumentAborted } from "./Adapters/InMemoryDocumentAdapter";

export interface ApplicationDocumentSnapshot<TModel> {
  readonly id: string;
  readonly applicationId: string | null;
  readonly typeId: string;
  readonly location: DocumentLocation | null;
  readonly state: DocumentState;
  readonly documentKind: DocumentKind;
  readonly readOnly: boolean;
  readonly model: TModel;
  readonly currentVersion: DocumentVersion | null;
  readonly dirtyRevision: number;
  readonly lastError: DocumentError | null;
  readonly conflict: DocumentConflict<TModel> | null;
  readonly windowControllerIds: readonly string[];
  readonly windowAssociations: readonly DocumentWindowAssociation[];
}

interface BaseApplicationDocumentOptions<TModel, TSerialized> {
  readonly id: string;
  readonly applicationId?: string | null;
  readonly type: DocumentType<TModel, TSerialized>;
  readonly undoManager: UndoManager;
  readonly recovery: DocumentRecoveryStore;
  readonly persistenceNamespace: string;
  readonly environment: DocumentRuntimeEnvironment;
  readonly observeError?: (error: unknown, context: string) => void;
  readonly onWillSave?: (request: {
    readonly documentId: string;
    readonly reason: SaveDocumentOptions["reason"];
    readonly content: TSerialized;
    readonly dirtyRevision: number;
  }) => void;
}

export interface CreateApplicationDocumentOptions<TModel, TSerialized>
  extends BaseApplicationDocumentOptions<TModel, TSerialized> {
  readonly model?: TModel;
  readonly location?: DocumentLocation;
  readonly adapter?: DocumentStorageAdapter;
}

export interface OpenApplicationDocumentOptions<TModel, TSerialized>
  extends BaseApplicationDocumentOptions<TModel, TSerialized> {
  readonly record: DocumentRecord<TSerialized>;
  readonly adapter: DocumentStorageAdapter;
}

export interface ApplicationDocumentCloseTransaction {
  readonly token: string;
}

export interface ApplicationDocumentAdoptionTransaction {
  readonly token: object;
}

interface ApplicationDocumentAdoptionState<TModel, TSerialized> {
  readonly publicTransaction: ApplicationDocumentAdoptionTransaction;
  readonly before: {
    readonly location: DocumentLocation | null;
    readonly adapter: DocumentStorageAdapter | null;
    readonly model: TModel;
    readonly state: DocumentState;
    readonly currentVersion: DocumentVersion | null;
    readonly lastSavedRecord: DocumentRecord<TSerialized> | null;
    readonly lastAcknowledgedRecord: DocumentRecord<TSerialized> | null;
    readonly recoveryRecord: DocumentRecoveryRecord | null;
    readonly dirtyRevision: number;
    readonly savedDirtyRevision: number;
    readonly contentIdentity: string;
    readonly savedContentIdentity: string | null;
    readonly lastError: DocumentError | null;
    readonly conflict: DocumentConflict<TModel> | null;
    readonly synchronisationPending: boolean;
    readonly snapshotCache: ApplicationDocumentSnapshot<TModel> | null;
    readonly controllerNotificationPending: boolean;
  };
}

interface ActiveApplicationDocumentCloseTransaction<TModel, TSerialized> {
  readonly publicTransaction: ApplicationDocumentCloseTransaction;
  readonly closeToken: string;
  readonly storageToken?: string;
  readonly before: {
    readonly location: DocumentLocation | null;
    readonly adapter: DocumentStorageAdapter | null;
    readonly model: TModel;
    readonly state: DocumentState;
    readonly currentVersion: DocumentVersion | null;
    readonly lastSavedRecord: DocumentRecord<TSerialized> | null;
    readonly lastAcknowledgedRecord: DocumentRecord<TSerialized> | null;
    readonly recoveryRecord: DocumentRecoveryRecord | null;
    readonly dirtyRevision: number;
    readonly savedDirtyRevision: number;
    readonly contentIdentity: string;
    readonly savedContentIdentity: string | null;
    readonly lastError: DocumentError | null;
    readonly conflict: DocumentConflict<TModel> | null;
    readonly synchronisationPending: boolean;
    readonly snapshotCache: ApplicationDocumentSnapshot<TModel> | null;
  };
  notificationPending: boolean;
}

interface TerminalWriteReconciliation<TSerialized> {
  readonly adapter: DocumentStorageAdapter;
  readonly request: DocumentWriteRequest<TSerialized>;
  readonly dirtyRevision: number;
  outcome: "pending" | "fulfilled" | "rejected";
  record: DocumentRecord<TSerialized> | null;
  error: unknown;
}

interface ActiveTerminalReconciliation {
  readonly token: object;
  readonly generation: number;
  readonly controller: AbortController;
  flight: {
    readonly phase: "save" | "recover";
    readonly promise: Promise<void>;
  } | null;
}

function immutableClone<T>(value: T): T {
  return immutableDocumentValue(value);
}

function asDocumentError(error: unknown): DocumentError {
  if (error instanceof DocumentError) return error;
  return new DocumentUnavailableError(
    error instanceof Error ? error.message : "The document operation failed.",
    { cause: error, retryable: false },
  );
}

function decodeRecord<TModel, TSerialized>(
  type: DocumentType<TModel, TSerialized>,
  record: DocumentRecord<TSerialized>,
): TModel {
  if (record.typeId !== type.id) {
    throw new DocumentSchemaError(type.id, `Document record type "${record.typeId}" does not match "${type.id}".`);
  }
  if (record.schemaVersion > type.schemaVersion) {
    throw new DocumentSchemaError(type.id, `Document content for "${type.id}" uses a future schema version.`);
  }
  const serialized = migrateDocumentPayload(
    type as DocumentType<unknown, TSerialized>,
    record.content,
    record.schemaVersion,
  );
  if (!type.validate(serialized)) throw new DocumentSchemaError(type.id);
  return immutableClone(type.read(serialized, { typeId: type.id, schemaVersion: type.schemaVersion }));
}

function sameVersion(left: DocumentVersion | null, right: DocumentVersion | null): boolean {
  if (!left || !right) return left === right;
  return left.id === right.id && left.sequence === right.sequence && left.savedAt === right.savedAt && left.etag === right.etag;
}

function combinedDocumentSignal(caller: AbortSignal | undefined, lifecycle: AbortSignal): AbortSignal {
  return caller ? AbortSignal.any([caller, lifecycle]) : lifecycle;
}

/** Provider conflict hooks are permitted to ignore AbortSignal. Canonical
 * ownership is not: once a mount is revoked, its tracked operation must settle
 * so the owner lease can be released. Attaching both settlement handlers also
 * observes a detached provider rejection after the abort wins the race. */
function awaitProviderConflictOperation<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  throwIfDocumentAborted(signal);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(new DocumentAbortError(
      "The document conflict operation was aborted.",
      { cause: signal.reason },
    )));
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

export class ApplicationDocument<TModel, TSerialized = TModel> {
  readonly id: string;
  readonly applicationId: string | null;
  readonly type: DocumentType<TModel, TSerialized>;
  readonly undoManager: UndoManager;
  readonly #recovery: DocumentRecoveryStore;
  readonly #environment: DocumentRuntimeEnvironment;
  readonly #observeError?: (error: unknown, context: string) => void;
  readonly #recoveryId: string;
  readonly #onWillSave?: (request: {
    readonly documentId: string;
    readonly reason: SaveDocumentOptions["reason"];
    readonly content: unknown;
    readonly dirtyRevision: number;
  }) => void;
  readonly #listeners = new Set<() => void>();
  readonly #associations = new Map<string, DocumentWindowAssociation>();
  readonly #autosave: AutosaveScheduler | null;
  readonly #recoveryScheduler: AutosaveScheduler;
  readonly #editing: DocumentEditingParticipants<TModel>;
  #location: DocumentLocation | null;
  #adapter: DocumentStorageAdapter | null;
  #model: TModel;
  #state: DocumentState;
  readonly #documentKind: DocumentKind;
  #currentVersion: DocumentVersion | null;
  #lastSavedRecord: DocumentRecord<TSerialized> | null;
  #lastAcknowledgedRecord: DocumentRecord<TSerialized> | null;
  #recoveryRecord: DocumentRecoveryRecord | null = null;
  #dirtyRevision = 0;
  #savedDirtyRevision = 0;
  #contentIdentity: string;
  #savedContentIdentity: string | null;
  #editInProgress = false;
  #publicationProtected = false;
  #deferredClose: { authority?: DocumentAdoptionAuthority; promise: Promise<void>; resolve: () => void } | null = null;
  #resourceLifecycle: DocumentResourceLifecycle | null = null;
  #observedResourceTail: Promise<void> = Promise.resolve();
  #editBoundary = 0;
  #lastError: DocumentError | null = null;
  #conflict: DocumentConflict<TModel> | null = null;
  #saveTail: Promise<void> = Promise.resolve();
  #recoveryTail: Promise<void> = Promise.resolve();
  #lastRecoveryOperation: Promise<void> = Promise.resolve();
  #snapshotCache: ApplicationDocumentSnapshot<TModel> | null = null;
  #controllerNotificationPending = false;
  #closeGateToken: string | null = null;
  #mutationGeneration = 0;
  #mutationAbortController = new AbortController();
  #adapterWatch: DocumentWatchSubscription | null = null;
  #synchronisationWatch: DocumentWatchSubscription | null = null;
  #synchronisationPending = false;
  #activeCloseTransaction: ActiveApplicationDocumentCloseTransaction<TModel, TSerialized> | null = null;
  readonly #adoptionTransactions = new WeakMap<object, ApplicationDocumentAdoptionState<TModel, TSerialized>>();
  #closeCleanupPromise: Promise<void> | null = null;
  #terminalReconciliation: ActiveTerminalReconciliation | null = null;
  #terminalGeneration = 0;
  #indeterminateTerminalWrite: TerminalWriteReconciliation<TSerialized> | null = null;
  #deferredTerminalSynchronisation: DocumentSynchronisationEvent | null = null;

  private constructor(options: BaseApplicationDocumentOptions<TModel, TSerialized> & {
    readonly documentKind: DocumentKind;
    readonly model: TModel;
    readonly location: DocumentLocation | null;
    readonly adapter: DocumentStorageAdapter | null;
    readonly record: DocumentRecord<TSerialized> | null;
  }) {
    if (!options.id.trim()) throw new TypeError("Document IDs must not be empty.");
    if (options.applicationId !== undefined && options.applicationId !== null && !options.applicationId.trim()) {
      throw new TypeError("Document application IDs must not be empty.");
    }
    if (!options.persistenceNamespace.trim()) throw new TypeError("Document persistence namespaces must not be empty.");
    this.id = options.id;
    this.applicationId = options.applicationId?.trim() || null;
    this.type = options.type;
    this.undoManager = options.undoManager;
    this.#recovery = options.recovery;
    this.#environment = options.environment;
    this.#observeError = options.observeError;
    this.#recoveryId = JSON.stringify([options.persistenceNamespace, options.id]);
    this.#onWillSave = options.onWillSave
      ? (request) => options.onWillSave?.({ ...request, content: request.content as TSerialized })
      : undefined;
    this.#location = options.location ? immutableClone(options.location) : null;
    this.#adapter = options.adapter;
    this.#model = immutableClone(options.model);
    this.#contentIdentity = this.#modelContentIdentity(this.#model);
    this.#savedContentIdentity = this.#contentIdentity;
    this.#documentKind = options.documentKind;
    this.#state = "clean";
    this.#currentVersion = options.record ? immutableClone(options.record.version) : null;
    this.#lastSavedRecord = options.record ? immutableClone(options.record) : null;
    this.#lastAcknowledgedRecord = options.record ? immutableClone(options.record) : null;
    this.#synchronisationPending = Boolean(
      options.record && options.adapter && options.adapter.isSynchronisationPending?.(options.record.location),
    );
    if (this.#synchronisationPending) this.#state = "dirty";
    this.#bindAdapterWatch();
    this.undoManager.markClean();
    const autosaveDelay = options.type.autosave === "disabled"
      ? null
      : options.type.autosave === "immediate"
        ? 0
        : options.type.autosave.delayMs;
    this.#autosave = autosaveDelay === null ? null : new AutosaveScheduler(
      autosaveDelay,
      (signal) => this.save({ reason: "autosave", signal }),
      (error) => this.#observeAutosaveError(error),
      options.environment,
    );
    this.#recoveryScheduler = new AutosaveScheduler(
      250,
      (signal) => this.#enqueueRecoveryWrite(signal),
      (error) => {
        this.#lastError = asDocumentError(error);
        this.#emit();
      },
      options.environment,
    );
    this.#editing = new DocumentEditingParticipants({
      documentId: this.id, lifecycleSignal: () => this.#mutationAbortController.signal,
      assertAvailable: () => { this.#assertNotClosed(); this.#assertNoTerminalReconciliation(); this.#assertCloseGateAllowsMutation(); },
      transact: (transform, editOptions, admission) => this.transact(transform, editOptions, admission),
      observeError: (error, context) => this.#reportCleanupError(error, context),
    });
  }

  static create<TModel, TSerialized = TModel>(
    options: CreateApplicationDocumentOptions<TModel, TSerialized>,
  ): ApplicationDocument<TModel, TSerialized> {
    if (Object.hasOwn(options as object, "documentKind")) {
      throw new TypeError("Document kind is kernel-minted and cannot be supplied to ordinary construction.");
    }
    if (Boolean(options.location) !== Boolean(options.adapter)) {
      throw new TypeError("A pre-bound new document requires both a location and an adapter.");
    }
    const model = options.model === undefined
      ? options.type.create({ typeId: options.type.id })
      : options.model;
    return new ApplicationDocument({
      ...options,
      documentKind: "standard",
      model,
      location: options.location ?? null,
      adapter: options.adapter ?? null,
      record: null,
    });
  }

  static open<TModel, TSerialized = TModel>(
    options: OpenApplicationDocumentOptions<TModel, TSerialized>,
  ): ApplicationDocument<TModel, TSerialized> {
    if (Object.hasOwn(options as object, "documentKind")) {
      throw new TypeError("Document kind is kernel-minted and cannot be supplied through restoration.");
    }
    return new ApplicationDocument({
      ...options,
      documentKind: "standard",
      model: decodeRecord(options.type, options.record),
      location: options.record.location,
      record: options.record,
    });
  }

  /** Dedicated kernel-only constructor. Ordinary create/open paths cannot
   * name the projection kind, and the authority is not exported publicly. */
  static createProjection<TModel, TSerialized = TModel>(
    options: CreateApplicationDocumentOptions<TModel, TSerialized>,
    authority: DocumentProjectionAuthority,
  ): ApplicationDocument<TModel, TSerialized> {
    if (authority !== documentProjectionAuthority) throw new DOMException("Projection construction authority is invalid.", "SecurityError");
    if (Object.hasOwn(options as object, "documentKind")) {
      throw new TypeError("Projection construction does not accept a caller-supplied document kind.");
    }
    if (Boolean(options.location) !== Boolean(options.adapter)) {
      throw new TypeError("A pre-bound new document requires both a location and an adapter.");
    }
    if (options.location || options.adapter) throw new TypeError("Projection documents cannot carry storage authority.");
    const model = options.model === undefined
      ? options.type.create({ typeId: options.type.id })
      : options.model;
    return new ApplicationDocument({
      ...options,
      documentKind: "projection",
      model,
      location: null,
      adapter: null,
      record: null,
    });
  }

  get location(): DocumentLocation | null { return this.#location ? immutableClone(this.#location) : null; }
  get model(): TModel { return this.#model; }
  get state(): DocumentState { return this.#state; }
  get documentKind(): DocumentKind { return this.#documentKind; }
  get readOnly(): boolean { return this.#documentKind === "projection"; }
  get currentVersion(): DocumentVersion | null { return this.#currentVersion ? immutableClone(this.#currentVersion) : null; }
  get lastSavedRecord(): DocumentRecord<TSerialized> | null { return this.#lastSavedRecord ? immutableClone(this.#lastSavedRecord) : null; }
  get recoveryRecord(): DocumentRecoveryRecord | null { return this.#recoveryRecord ? immutableClone(this.#recoveryRecord) : null; }
  get hasRecoverableAutosave(): boolean { return this.#recoveryRecord !== null; }
  get dirtyRevision(): number { return this.#dirtyRevision; }
  get hasUnsavedChanges(): boolean {
    return this.#contentIdentity !== this.#savedContentIdentity || this.#state === "conflicted" || this.#synchronisationPending;
  }
  get lastError(): DocumentError | null { return this.#lastError; }
  get conflict(): DocumentConflict<TModel> | null { return this.#conflict ? immutableClone(this.#conflict) : null; }
  get windowControllerIds(): readonly string[] { return Object.freeze([...this.#associations.keys()]); }
  get windowAssociations(): readonly DocumentWindowAssociation[] {
    return Object.freeze([...this.#associations.values()].map(immutableClone));
  }

  snapshot(): ApplicationDocumentSnapshot<TModel> {
    if (this.#snapshotCache) return this.#snapshotCache;
    this.#snapshotCache = Object.freeze({
      id: this.id,
      applicationId: this.applicationId,
      typeId: this.type.id,
      location: this.location,
      state: this.#state,
      documentKind: this.#documentKind,
      readOnly: this.#documentKind === "projection",
      model: this.#model,
      currentVersion: this.currentVersion,
      dirtyRevision: this.#dirtyRevision,
      lastError: this.#lastError,
      conflict: this.conflict,
      windowControllerIds: this.windowControllerIds,
      windowAssociations: this.windowAssociations,
    });
    return this.#snapshotCache;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.#listeners.delete(listener);
    };
  }

  /** Private controller installation, after asynchronous initial model admission. */
  installResourceLifecycle(lifecycle: DocumentResourceLifecycle, authority: DocumentAdoptionAuthority): void {
    if (authority !== documentAdoptionAuthority) throw new TypeError("Resource lifecycle installation requires controller authority.");
    this.#assertNotClosed();
    if (this.#resourceLifecycle || this.#editInProgress) throw new DocumentUnavailableError("The document resource lifecycle is already installed or editing.", { retryable: false });
    let change: DocumentResourceChange | undefined;
    let committed = false;
    this.#editInProgress = true;
    try {
      change = lifecycle.stageChange(null, this.#model as Readonly<unknown>, { recordHistory: false });
      this.#assertNotClosed(); this.#publicationProtected = true; change.commit();
      if (this.#deferredClose) throw new DocumentUnavailableError("The document closed during initial resource admission.", { retryable: false });
      this.#resourceLifecycle = lifecycle; committed = true;
    }
    finally {
      try { committed ? change?.release() : change?.rollback(); } catch (error) { this.#reportCleanupError(error, "document-resource-install-cleanup"); }
      this.#finishPublication();
    }
  }

  /** Private async preflight; a stale/canceled result releases its acquired candidate. */
  async prepareResourceModel(model: TModel, authority: DocumentAdoptionAuthority, signal?: AbortSignal): Promise<DocumentResourceModelPreparation> {
    if (authority !== documentAdoptionAuthority) throw new TypeError("Resource model preparation requires controller authority.");
    this.#assertNotClosed();
    const revision = this.#dirtyRevision, generation = this.#mutationGeneration;
    const operationSignal = combinedDocumentSignal(signal, this.#mutationAbortController.signal);
    throwIfDocumentAborted(operationSignal);
    if (!this.#resourceLifecycle) return { release() {} };
    let abandoned = false;
    const pending = this.#resourceLifecycle.prepareModel(model as Readonly<unknown>, operationSignal);
    void pending.then(handle => {
      if (abandoned) void Promise.resolve().then(() => handle.release()).catch(error => this.#reportCleanupError(error, "document-resource-late-preparation-release"));
    }, () => undefined);
    let preparation: DocumentResourceModelPreparation;
    try { preparation = await awaitProviderConflictOperation(pending, operationSignal); }
    catch (error) { abandoned = true; throw error; }
    let released = false;
    const release = async () => {
      if (released) return; released = true;
      try { await preparation?.release(); } catch (error) { this.#reportCleanupError(error, "document-resource-preparation-release"); }
    };
    try {
      throwIfDocumentAborted(operationSignal); this.#assertNotClosed();
      if (revision !== this.#dirtyRevision || generation !== this.#mutationGeneration) throw new DocumentUnavailableError("The document changed during resource preparation.", { retryable: false });
      return { release };
    } catch (error) { await release(); throw error; }
  }

  update(
    transform: (current: Readonly<TModel>) => TModel,
    options: Omit<DocumentEditOptions<TModel>, "expectedRevision"> & { readonly expectedRevision?: number; readonly recordUndo?: boolean },
    admission?: DocumentEditAdmission,
  ): DocumentEditReceipt {
    this.#assertEditable();
    this.undoManager.assertCanRegister();
    if (!options.actionName.trim()) throw new DocumentSchemaError(this.type.id, "Document edits require an action name.");
    const beforeRevision = this.#dirtyRevision;
    const generation = this.#mutationGeneration;
    const expected = options.expectedRevision ?? beforeRevision;
    const revalidate = () => {
      throwIfDocumentAborted(options.signal);
      this.#assertWritable(this.#publicationProtected);
      if (admission && !admission.isCurrent()) throw new DocumentUnavailableError("The document edit admission was revoked.", { retryable: false });
      if (generation !== this.#mutationGeneration || expected !== this.#dirtyRevision) {
        throw new DocumentUnavailableError("The document edit base is stale.", { retryable: false });
      }
    };
    revalidate();
    this.#editInProgress = true;
    let reservation: UndoReservation | undefined;
    let retention: DocumentEditResourceRetention | undefined;
    let resourceChange: DocumentResourceChange | undefined;
    const retentions = new Set<DocumentEditResourceRetention>();
    let admitted = false;
    try {
      const previous = this.#model;
      const staged = stageDocumentEdit(previous, this.type, transform, options.validateModel);
      const next = staged.model;
      const identity = staged.contentIdentity;
      const selection = options.selection ? immutableClone(options.selection) : undefined;
      revalidate();
      resourceChange = this.#resourceLifecycle?.stageChange(previous as Readonly<unknown>, next as Readonly<unknown>, { recordHistory: options.recordUndo !== false });
      if (resourceChange?.historyRetention) retentions.add(resourceChange.historyRetention);
      if (options.recordUndo !== false) reservation = admission ? admission.reserveHistory() : this.undoManager.reserve();
      const callerRetention = options.retainResources?.(previous, next);
      if (callerRetention && typeof (callerRetention as unknown as { then?: unknown }).then === "function") {
        // Acquire asynchronously before the edit; do not admit history before retention exists.
        const pending = callerRetention as unknown as Promise<DocumentEditResourceRetention>;
        void Promise.resolve(pending).then((handle) => handle.release()).catch((error) => this.#reportCleanupError(error, "document-edit-async-retention-release"));
        throw new DocumentSchemaError(this.type.id, "Resource retention must be prepared before synchronous commitment.");
      }
      if (callerRetention) retentions.add(callerRetention);
      for (const handle of retentions) if (!Array.isArray(handle.resourceIds) || typeof handle.release !== "function") throw new DocumentSchemaError(this.type.id, "Invalid document history retention handle.");
      const resourceIds = Object.freeze([...new Set([...retentions].flatMap(handle => [...handle.resourceIds]))]);
      if (resourceIds.some((id) => typeof id !== "string" || !id.trim())) throw new DocumentSchemaError(this.type.id, "Retained resource IDs must be nonempty strings.");
      let released = false;
      retention = { resourceIds, release: () => {
        if (released) return; released = true;
        for (const handle of retentions) { try { handle.release(); } catch (error) { this.#reportCleanupError(error, "document-edit-retention-release"); } }
      } };
      revalidate();
      // Structural close is deferred from resource/history admission through
      // publication. Revocation in history notifications fences the next edit.
      this.#publicationProtected = true;
      resourceChange?.commit();
      revalidate();
      if (this.#deferredClose) throw new DocumentUnavailableError("The document closed during resource admission.", { retryable: false });
      let historyEntryId: string | null = null;
      if (reservation) {
        historyEntryId = reservation.commit(createDocumentEditHistoryAction({
          documentId: this.id, before: previous, after: next, options: { ...options, selection }, retention,
          apply: (model) => this.#applyUndoModel(model), revision: () => this.#dirtyRevision,
          observeError: (error, context) => this.#reportCleanupError(error, context),
        }), options.coalescingKey ? {
          automaticGroup: { kind: "typing", key: options.coalescingKey, boundaryId: `document:${this.id}:${this.#editBoundary}` },
        } : undefined);
      } else {
        // A non-history model adoption must not leave replay closures for an obsolete base.
        this.undoManager.clear();
        this.#editBoundary += 1;
      }
      admitted = true;
      this.#applyChangedModel(next, identity);
      if (!reservation) {
        try { retention?.release(); } catch (error) { this.#reportCleanupError(error, "document-edit-retention-release"); }
      }
      return Object.freeze({ status: "committed", documentId: this.id,
        changeId: `document-edit:${this.id}:${this.#dirtyRevision}`, beforeRevision, afterRevision: this.#dirtyRevision,
        historyEntryId, retainedResourceIds: resourceIds, ...(selection ? { selection } : {}),
      });
    } finally {
      try { reservation?.cancel(); } catch (error) { this.#reportCleanupError(error, "document-edit-reservation-cancel"); }
      if (!admitted) {
        try { resourceChange?.rollback(); } catch (error) { this.#reportCleanupError(error, "document-resource-rollback"); }
        if (retention) retention.release();
        else for (const handle of retentions) { try { handle.release(); } catch (error) { this.#reportCleanupError(error, "document-edit-retention-release"); } }
      } else {
        try { resourceChange?.release(); } catch (error) { this.#reportCleanupError(error, "document-resource-release"); }
      }
      this.#finishPublication();
    }
  }

  transact(transform: (current: Readonly<TModel>) => TModel, options: DocumentEditOptions<TModel>, admission?: DocumentEditAdmission): DocumentEditResult {
    if (!Number.isSafeInteger(options.expectedRevision) || options.expectedRevision < 0) {
      return Object.freeze({ status: "rejected", documentId: this.id, reason: "invalid", error: new DocumentSchemaError(this.type.id, "Expected revision must be a nonnegative safe integer.") });
    }
    if (options.expectedRevision !== this.#dirtyRevision) {
      return Object.freeze({ status: "rejected", documentId: this.id, reason: "stale", error: new DocumentUnavailableError("The document edit base is stale.", { retryable: false }) });
    }
    try { return this.update(transform, options, admission); }
    catch (error) {
      return Object.freeze({ status: "rejected", documentId: this.id,
        reason: error instanceof DocumentAbortError ? "aborted" : error instanceof DocumentReadOnlyError ? "read-only" :
          error instanceof DocumentSchemaError ? "invalid" : error instanceof DocumentUnavailableError || error instanceof DocumentDeletedError ? "unavailable" : "failed",
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  get hasEditingParticipants(): boolean { return this.#editing.hasParticipants; }

  registerEditingParticipant(participant: DocumentEditingParticipant<TModel>, options?: DocumentEditingLifetimeOptions, admission?: DocumentEditAdmission): DocumentEditingParticipantRegistration {
    return this.#editing.register(participant, options, admission);
  }

  settleEditing(reason: DocumentEditingReason, signal?: AbortSignal): Promise<DocumentEditingSettlementResult> {
    this.#editBoundary += 1;
    return this.#editing.settle(reason, signal);
  }

  discardEditing(reason: DocumentEditingReason, signal?: AbortSignal): Promise<DocumentEditingSettlementResult> {
    this.#editBoundary += 1;
    return this.#editing.discard(reason, signal);
  }

  get hasTerminalReconciliationLease(): boolean { return this.#terminalReconciliation !== null; }
  /** The exact write identity remains private to the document kernel, while
   * terminal receipts may report that recovery (rather than another save) is
   * now the only safe canonical mutation. */
  get hasIndeterminateTerminalWrite(): boolean { return this.#indeterminateTerminalWrite !== null; }

  beginTerminalReconciliation(authority: DocumentAdoptionAuthority): object {
    if (authority !== documentAdoptionAuthority) throw new TypeError("Terminal reconciliation requires controller authority.");
    this.#assertNotClosed();
    this.#assertCloseGateAllowsMutation();
    if (this.#terminalReconciliation) {
      throw new DocumentUnavailableError(`Document "${this.id}" already has a terminal reconciliation lease.`, { retryable: false });
    }
    const generation = ++this.#terminalGeneration;
    const token = Object.freeze({ documentId: this.id, generation });
    this.#terminalReconciliation = {
      token,
      generation,
      controller: new AbortController(),
      flight: null,
    };
    this.#autosave?.cancel("document-terminal-reconciliation");
    this.#recoveryScheduler.cancel("document-terminal-reconciliation");
    this.#mutationGeneration += 1;
    this.#mutationAbortController.abort("document-terminal-reconciliation");
    this.#mutationAbortController = new AbortController();
    return token;
  }

  async endTerminalReconciliation(token: object, authority: DocumentAdoptionAuthority): Promise<boolean> {
    const terminal = this.#requireTerminalReconciliation(token, authority);
    terminal.controller.abort("document-terminal-reconciliation-released");
    if (terminal.flight) await Promise.allSettled([terminal.flight.promise]);
    if (this.#terminalReconciliation !== terminal) return false;
    this.#terminalReconciliation = null;
    const deferred = this.#deferredTerminalSynchronisation;
    this.#deferredTerminalSynchronisation = null;
    if (deferred) this.#environment.setTimeout(() => this.#receiveStorageObservation(null, deferred), 0);
    return true;
  }

  validateTerminalReconciliation(token: object, authority: DocumentAdoptionAuthority): void {
    this.#assertTerminalReconciliation(token, authority);
  }

  /** Lets the terminal receipt observe an ordinary write which was fenced by
   * terminal admission before deciding whether a failed provider may release
   * its recovery authority. The public save promise has settled by this point
   * even when its adapter is still non-cooperatively completing in the
   * background. */
  async awaitTerminalWriteHandoff(token: object, authority: DocumentAdoptionAuthority): Promise<void> {
    this.#assertTerminalReconciliation(token, authority);
    await this.#saveTail;
    // #saveTail settles through the public save boundary; the terminal-aware
    // adapter handoff publishes its exact recovery marker in the immediately
    // following continuation.
    await Promise.resolve();
  }

  synchroniseTerminalModel(
    token: object,
    authority: DocumentAdoptionAuthority,
    transform: (current: Readonly<TModel>) => TModel,
  ): void {
    this.#assertTerminalReconciliation(token, authority);
    this.undoManager.assertCanRegister();
    const staged = stageDocumentEdit(this.#model, this.type, transform);
    this.#withResourceChange(staged.model, () => {
      this.undoManager.clear();
      this.#model = staged.model;
      this.#contentIdentity = staged.contentIdentity;
      this.#dirtyRevision += 1;
      if (this.#state !== "conflicted") this.#state = "dirty";
      this.#lastError = null;
      this.#emit();
    });
  }

  saveTerminalReconciliation(
    token: object,
    authority: DocumentAdoptionAuthority,
    signal?: AbortSignal,
  ): Promise<void> {
    const terminal = this.#requireTerminalReconciliation(token, authority);
    return this.#runTerminalFlight(terminal, "save", () => {
      if (this.#indeterminateTerminalWrite) {
        const pending = this.#indeterminateTerminalWrite.request;
        throw new DocumentWriteOutcomeUnknownError(
          pending.location,
          pending.idempotencyKey,
          "The original terminal write must be reconciled before a new write is permitted.",
        );
      }
      const operationSignal = signal
        ? AbortSignal.any([signal, terminal.controller.signal])
        : terminal.controller.signal;
      return this.#enqueueSave({ reason: "explicit", signal: operationSignal }, undefined, false, token);
    });
  }

  recoverTerminalReconciliationWrite(
    token: object,
    authority: DocumentAdoptionAuthority,
    signal?: AbortSignal,
  ): Promise<void> {
    const terminal = this.#requireTerminalReconciliation(token, authority);
    return this.#runTerminalFlight(terminal, "recover", async () => {
      const pending = this.#indeterminateTerminalWrite;
      if (!pending) return;
      const operationSignal = signal
        ? AbortSignal.any([signal, terminal.controller.signal])
        : terminal.controller.signal;
      let record: DocumentRecord<TSerialized> | null;
      if (pending.outcome === "fulfilled") {
        record = pending.record;
      } else if (pending.outcome === "rejected" && !(pending.error instanceof DocumentWriteOutcomeUnknownError)) {
        this.#indeterminateTerminalWrite = null;
        this.#lastError = null;
        if (this.#state === "saving") this.#state = "dirty";
        this.#emit();
        return;
      } else {
        if (!pending.adapter.recoverWriteByIdempotencyKey) {
          throw new DocumentWriteOutcomeUnknownError(pending.request.location, pending.request.idempotencyKey);
        }
        record = await pending.adapter.recoverWriteByIdempotencyKey<TSerialized>({
          ...pending.request,
          signal: operationSignal,
        });
      }
      throwIfDocumentAborted(operationSignal);
      this.#assertTerminalReconciliation(token, authority);
      if (!record || canonicalDocumentLocation(record.location) !== canonicalDocumentLocation(pending.request.location) ||
          record.typeId !== pending.request.typeId || record.schemaVersion !== pending.request.schemaVersion ||
          canonicalDocumentJson(record.content, pending.request.typeId) !== canonicalDocumentJson(pending.request.content, pending.request.typeId) ||
          canonicalDocumentJson(record.metadata, pending.request.typeId) !== canonicalDocumentJson(pending.request.metadata ?? {}, pending.request.typeId)) {
        throw new DocumentWriteOutcomeUnknownError(pending.request.location, pending.request.idempotencyKey);
      }
      this.#lastSavedRecord = immutableClone(record);
      this.#lastAcknowledgedRecord = immutableClone(record);
      this.#currentVersion = immutableClone(record.version);
      this.#savedContentIdentity = canonicalDocumentJson(record.content, this.type.id);
      const currentSerialized = this.type.write(this.#model, { typeId: this.type.id, schemaVersion: this.type.schemaVersion });
      const recoveredCurrentModel = pending.dirtyRevision === this.#dirtyRevision &&
        canonicalDocumentJson(currentSerialized, this.type.id) === canonicalDocumentJson(pending.request.content, this.type.id);
      if (recoveredCurrentModel) this.#savedDirtyRevision = pending.dirtyRevision;
      this.#state = recoveredCurrentModel ? "clean" : "dirty";
      this.#lastError = null;
      this.#conflict = null;
      this.#indeterminateTerminalWrite = null;
      if (this.#state === "clean") this.undoManager.markClean();
      this.#emit();
    });
  }

  save(options: SaveDocumentOptions): Promise<void> {
    if (this.hasEditingParticipants && (options.reason === "explicit" || options.reason === "close")) {
      return this.settleEditing("save", options.signal).then((result) => {
        requireSettledDocumentEditing(result);
        return this.#enqueueSave(options);
      });
    }
    return this.#enqueueSave(options);
  }

  saveWithControllerAuthority(
    options: SaveDocumentOptions,
    authority: DocumentAdoptionAuthority,
    closeToken?: string,
  ): Promise<void> {
    if (authority !== documentAdoptionAuthority) {
      return Promise.reject(new TypeError("Controller-authorised saves require document adoption authority."));
    }
    return this.#enqueueSave(options, closeToken);
  }

  #enqueueSave(
    options: SaveDocumentOptions,
    closeToken?: string,
    fenceCallerAbortAfterCommit = false,
    terminalToken?: object,
  ): Promise<void> {
    try {
      this.#assertNotClosed();
      if (terminalToken) this.#assertTerminalReconciliation(terminalToken, documentAdoptionAuthority);
      else this.#assertNoTerminalReconciliation();
      if (this.#indeterminateTerminalWrite && !terminalToken) {
        const pending = this.#indeterminateTerminalWrite.request;
        throw new DocumentWriteOutcomeUnknownError(
          pending.location,
          pending.idempotencyKey,
          "The indeterminate document write must be reconciled before a new write is permitted.",
        );
      }
      if (this.#closeGateToken && this.#closeGateToken !== closeToken) this.#assertCloseGateAllowsMutation();
      // Projections have no save destination; an attempted save is a caller
      // bug, rejected with the same read-only error as any other mutation.
      if (this.#documentKind === "projection") throw new DocumentReadOnlyError(`Document "${this.id}" is a read-only projection.`);
      if (this.#state === "read-only") throw new DocumentReadOnlyError();
      if (this.#state === "deleted") throw new DocumentDeletedError();
    } catch (error) {
      return Promise.reject(error);
    }
    if (!this.#location || !this.#adapter) return Promise.reject(new DocumentLocationRequiredError(this.id));
    this.#editBoundary += 1;
    if (this.#state === "conflicted" && options.reason !== "conflict-resolution") {
      if (options.reason === "autosave") return Promise.resolve();
      const conflict = this.#conflict;
      return Promise.reject(new DocumentVersionConflictError(
        this.#location,
        this.#currentVersion,
        conflict?.remote as DocumentRecord<TSerialized> | undefined ?? null,
      ));
    }
    const operationId = this.#environment.randomUUID();
    const generation = this.#mutationGeneration;
    const lifecycleSignal = this.#mutationAbortController.signal;
    const execution = this.#saveTail.then(
      () => this.#performSave(options, this.#currentVersion, this.#model, operationId, closeToken, generation, lifecycleSignal, fenceCallerAbortAfterCommit, terminalToken),
      () => this.#performSave(options, this.#currentVersion, this.#model, operationId, closeToken, generation, lifecycleSignal, fenceCallerAbortAfterCommit, terminalToken),
    );
    this.#saveTail = execution.catch(() => undefined);
    return execution;
  }

  async revert(version?: DocumentVersion, signal?: AbortSignal): Promise<void> {
    this.#assertEditable();
    if (this.hasEditingParticipants) requireSettledDocumentEditing(await this.settleEditing("revert", signal));
    this.#assertEditable();
    const revision = this.#dirtyRevision;
    const operationSignal = combinedDocumentSignal(signal, this.#mutationAbortController.signal);
    const { location, adapter } = this.#requirePersistence();
    const record = version
      ? await adapter.readVersion<TSerialized>(location, version, { signal: operationSignal })
      : await adapter.read<TSerialized>(location, { signal: operationSignal });
    throwIfDocumentAborted(operationSignal);
    if (!record) throw new DocumentNotFoundError(location);
    this.#assertEditable();
    if (revision !== this.#dirtyRevision) throw new DocumentUnavailableError("The document changed during revert.", { retryable: false });
    const preparation = await this.prepareResourceModel(decodeRecord(this.type, record), documentAdoptionAuthority, operationSignal);
    try {
      throwIfDocumentAborted(operationSignal); this.#assertEditable();
      if (revision !== this.#dirtyRevision) throw new DocumentUnavailableError("The document changed during revert.", { retryable: false });
      this.#replaceWithSavedRecord(record, () => {
        throwIfDocumentAborted(operationSignal); this.#assertWritable(true);
        if (revision !== this.#dirtyRevision || adapter !== this.#adapter || location !== this.#location) throw new DocumentUnavailableError("The document changed during revert.", { retryable: false });
      });
    } finally { await preparation.release(); }
    await this.#clearRecovery();
  }

  async restoreVersion(version: DocumentVersion, signal?: AbortSignal): Promise<void> {
    this.#assertEditable();
    if (this.hasEditingParticipants) requireSettledDocumentEditing(await this.settleEditing("revert", signal));
    this.#assertEditable();
    const revision = this.#dirtyRevision;
    const { location, adapter } = this.#requirePersistence();
    const operationSignal = combinedDocumentSignal(signal, this.#mutationAbortController.signal);
    throwIfDocumentAborted(operationSignal);
    const record = await adapter.readVersion<TSerialized>(location, version, { signal: operationSignal });
    // Adapters are allowed to settle after cancellation. Do not let a stale
    // version read replace a newer owner/model after its await boundary.
    throwIfDocumentAborted(operationSignal);
    if (!record) throw new DocumentNotFoundError(location);
    this.#assertEditable();
    if (revision !== this.#dirtyRevision) throw new DocumentUnavailableError("The document changed during version restoration.", { retryable: false });
    const restoredModel = decodeRecord(this.type, record);
    const preparation = await this.prepareResourceModel(restoredModel, documentAdoptionAuthority, operationSignal);
    try {
      throwIfDocumentAborted(operationSignal); this.#assertEditable();
      if (revision !== this.#dirtyRevision) throw new DocumentUnavailableError("The document changed during version restoration.", { retryable: false });
      this.update(() => restoredModel, { actionName: "Restore Version", expectedRevision: revision, signal: operationSignal });
    } finally { await preparation.release(); }
  }

  /** A saved version's model, read without changing the document (NSFileVersion's contents). */
  async readVersion(version: DocumentVersion, signal?: AbortSignal): Promise<TModel> {
    this.#assertNotClosed();
    const { location, adapter } = this.#requirePersistence();
    throwIfDocumentAborted(signal);
    const record = await adapter.readVersion<TSerialized>(location, version, { signal });
    throwIfDocumentAborted(signal);
    if (!record) throw new DocumentNotFoundError(location);
    return immutableClone(decodeRecord(this.type, record));
  }

  async listVersions(signal?: AbortSignal): Promise<readonly DocumentVersion[]> {
    const { location, adapter } = this.#requirePersistence();
    return adapter.listVersions(location, { signal });
  }

  enterConflict(conflict: Omit<DocumentConflict<TModel>, "detectedAt"> & { readonly detectedAt?: string }): void {
    this.#assertNotClosed();
    this.#assertNoTerminalReconciliation();
    this.#assertCloseGateAllowsMutation();
    // A projection must never become conflicted: conflict state implies
    // unsaved divergence, which a healthy projection cannot have.
    if (this.#documentKind === "projection") throw new DocumentReadOnlyError(`Document "${this.id}" is a read-only projection.`);
    if (this.#editInProgress || this.undoManager.isExecuting) throw new DocumentUnavailableError("Conflict adoption cannot reenter document editing or history replay.", { retryable: false });
    this.#editInProgress = true;
    try {
      const staged = stageDocumentEdit(this.#model, this.type, () => conflict.localModel);
      const changed = canonicalDocumentJson(staged.model, this.type.id) !== canonicalDocumentJson(this.#model, this.type.id);
      const nextConflict = immutableClone({ ...conflict, localModel: staged.model,
        detectedAt: conflict.detectedAt ?? new Date(this.#environment.now()).toISOString(),
      });
      this.#withResourceChange(staged.model, () => {
      if (changed) { this.undoManager.assertCanRegister(); this.undoManager.clear(); this.#editBoundary += 1; }
      this.#model = changed ? staged.model : this.#model;
      this.#contentIdentity = staged.contentIdentity;
      if (changed) this.#dirtyRevision += 1;
      this.#conflict = nextConflict;
      this.#state = "conflicted";
      try { this.#autosave?.cancel("document-conflict"); } catch (error) { this.#reportCleanupError(error, "document-conflict-autosave-cancel"); }
      try { this.#queueRecovery(); } catch (error) { this.#reportCleanupError(error, "document-conflict-recovery-schedule"); }
      this.#emit();
      });
    } finally { this.#finishPublication(); }
  }

  async resolveConflict(resolution: DocumentConflictResolution<TModel>, signal?: AbortSignal): Promise<void> {
    this.#assertNotClosed();
    this.#assertNoTerminalReconciliation();
    this.#assertCloseGateAllowsMutation();
    if (this.hasEditingParticipants) requireSettledDocumentEditing(await this.settleEditing("revert", signal));
    this.#assertNotClosed(); this.#assertNoTerminalReconciliation(); this.#assertCloseGateAllowsMutation();
    const operationSignal = combinedDocumentSignal(signal, this.#mutationAbortController.signal);
    throwIfDocumentAborted(operationSignal);
    const conflict = this.#conflict;
    if (!conflict) return;
    const revision = this.#dirtyRevision;
    const assertCurrent = (allowPublication = false) => {
      throwIfDocumentAborted(operationSignal);
      this.#assertNotClosed(); this.#assertNoTerminalReconciliation(); this.#assertCloseGateAllowsMutation(allowPublication);
      if ((!allowPublication && this.#editInProgress) || this.undoManager.isExecuting || revision !== this.#dirtyRevision || conflict !== this.#conflict) throw new DocumentUnavailableError("The conflict decision became stale; provider acceptance may already have completed.", { retryable: false });
    };
    if (resolution.kind === "use-remote") {
      if (conflict.remote) {
        const preparation = await this.prepareResourceModel(decodeRecord(this.type, conflict.remote as DocumentRecord<TSerialized>), documentAdoptionAuthority, operationSignal);
        try {
        assertCurrent();
        if (this.#adapter && this.#location) {
          const providerOperation = this.#adapter.acceptRemoteConflict?.(
            this.#location,
            conflict.remote,
            { signal: operationSignal },
          );
          if (providerOperation) await awaitProviderConflictOperation(providerOperation, operationSignal);
        }
        // Providers are permitted to settle a request after cancellation.
        // Fence the canonical replacement at the await boundary instead of
        // allowing a revoked mount to overwrite a newer owner.
        assertCurrent();
        this.#replaceWithSavedRecord(conflict.remote as DocumentRecord<TSerialized>, () => assertCurrent(true));
        } finally { await preparation.release(); }
        await this.#clearRecovery(operationSignal);
        throwIfDocumentAborted(operationSignal);
      } else {
        if (this.#adapter && this.#location) {
          const providerOperation = this.#adapter.acceptRemoteConflict?.(
            this.#location,
            conflict.remoteState === "read-only" ? conflict.base : null,
            { signal: operationSignal },
          );
          if (providerOperation) await awaitProviderConflictOperation(providerOperation, operationSignal);
        }
        assertCurrent();
        this.undoManager.assertCanRegister();
        this.#withResourceChange(this.#model, () => {
        // Accepting the terminal remote state explicitly discards local intent.
        // The retained model is an inert display snapshot, not another save.
        this.undoManager.clear();
        this.#savedContentIdentity = this.#contentIdentity;
        this.#savedDirtyRevision = this.#dirtyRevision;
        this.#conflict = null;
        this.#synchronisationPending = false;
        this.#state = conflict.remoteState === "read-only" ? "read-only" : "deleted";
        this.#lastError = conflict.remoteState === "read-only" ? new DocumentReadOnlyError() : new DocumentDeletedError();
        this.#emit();
        }, () => assertCurrent(true));
        await this.#clearRecovery(operationSignal);
      }
      return;
    }
    // The canonical local model includes edits and undo/redo after detection.
    const staged = stageDocumentEdit(this.#model, this.type, () => resolution.kind === "merge" ? resolution.model : this.#model);
    const model = staged.model;
    const preparation = await this.prepareResourceModel(model, documentAdoptionAuthority, operationSignal);
    try {
    assertCurrent();
    if (resolution.kind === "recreate") {
      if (conflict.remote !== null || conflict.remoteState === "read-only") {
        throw new DocumentUnavailableError("Only a deleted remote document can be recreated.", { retryable: false });
      }
      if (this.#adapter && this.#location) {
        const providerOperation = this.#adapter.prepareDocumentRecreation?.(
          this.#location,
          { signal: operationSignal },
        );
        if (providerOperation) await awaitProviderConflictOperation(providerOperation, operationSignal);
      }
      assertCurrent();
    } else {
      assertCurrent();
    }
    this.undoManager.assertCanRegister();
    this.#withResourceChange(model, () => {
    this.undoManager.clear();
    this.#model = model;
    this.#contentIdentity = staged.contentIdentity;
    this.#editBoundary += 1;
    this.#dirtyRevision += 1;
    if (resolution.kind === "recreate") {
      this.#currentVersion = null;
      this.#lastSavedRecord = null;
      // A terminal deletion is the authoritative durable base. Recreated
      // content is a new create intent; discarding it must restore absence,
      // never the record which the remote has deleted.
      this.#lastAcknowledgedRecord = null;
    } else {
      this.#currentVersion = immutableClone(resolution.expectedRemoteVersion);
      if (conflict.remote && sameVersion(conflict.remote.version, resolution.expectedRemoteVersion)) {
        this.#lastSavedRecord = immutableClone(conflict.remote as DocumentRecord<TSerialized>);
      }
    }
    this.#conflict = null;
    this.#state = "dirty";
    try { this.#queueRecovery(); } catch (error) { this.#reportCleanupError(error, "document-conflict-resolution-recovery"); }
    this.#emit();
    }, () => assertCurrent(true));
    } finally { await preparation.release(); }
    // A normal caller cancellation may still adopt a write that the provider
    // committed before reporting completion. Conflict resolution is different:
    // the signal carries mount ownership, so a revoked owner must fence a
    // late provider acknowledgement/recreation save.
    await this.#enqueueSave({ reason: "conflict-resolution", signal: operationSignal }, undefined, true);
    throwIfDocumentAborted(operationSignal);
  }

  async flushRecovery(signal?: AbortSignal): Promise<void> {
    throwIfDocumentAborted(signal);
    await this.#recoveryScheduler.flush();
    await this.#lastRecoveryOperation;
    throwIfDocumentAborted(signal);
  }

  associateWindow(association: DocumentWindowAssociation): void {
    this.#assertNotClosed();
    this.#assertCloseGateAllowsMutation();
    const previous = this.#associations.get(association.windowControllerId);
    if (previous?.role === association.role) return;
    this.#associations.set(association.windowControllerId, immutableClone(association));
    this.#emit();
  }

  dissociateWindow(windowControllerId: string): void {
    this.#assertCloseGateAllowsMutation();
    if (!this.#associations.delete(windowControllerId)) return;
    this.#editing.revokeWindow(windowControllerId);
    this.#emit();
  }

  async prepareToClose(options: {
    readonly preserveRecovery?: boolean;
    readonly discardPendingSynchronisation?: boolean;
    readonly signal?: AbortSignal;
  } = {}): Promise<void> {
    this.#assertNotClosed();
    throwIfDocumentAborted(options.signal);
    await this.#autosave?.cancelAndWait("document-closing");
    await this.#recoveryScheduler.cancelAndWait("document-closing");
    await this.#saveTail;
    await this.#recoveryTail;
    throwIfDocumentAborted(options.signal);
    if (options.discardPendingSynchronisation && this.#adapter && this.#location) {
      await this.#adapter.discardPendingSynchronisation?.(this.#location, {
        signal: options.signal,
        closeTransactionToken: this.#activeCloseTransaction?.storageToken,
        discardedRecord: this.#lastSavedRecord,
        previousRecord: this.#lastAcknowledgedRecord,
      });
      this.#synchronisationPending = false;
    }
    if (!options.preserveRecovery) await this.#clearRecovery(options.signal);
  }

  beginCloseTransaction(
    closeToken: string,
    authority: DocumentAdoptionAuthority,
    storageToken?: string,
  ): ApplicationDocumentCloseTransaction {
    if (authority !== documentAdoptionAuthority) throw new TypeError("Document close transactions require controller authority.");
    this.assertCloseGate(closeToken, authority);
    if (this.#activeCloseTransaction) {
      throw new DocumentUnavailableError(`Document "${this.id}" already has an active close transaction.`, { retryable: false });
    }
    const publicTransaction = Object.freeze({ token: `document-close-state:${this.#environment.randomUUID()}` });
    this.#activeCloseTransaction = {
      publicTransaction,
      closeToken,
      ...(storageToken ? { storageToken } : {}),
      before: {
        location: this.#location,
        adapter: this.#adapter,
        model: this.#model,
        state: this.#state,
        currentVersion: this.#currentVersion,
        lastSavedRecord: this.#lastSavedRecord,
        lastAcknowledgedRecord: this.#lastAcknowledgedRecord,
        recoveryRecord: this.#recoveryRecord,
        dirtyRevision: this.#dirtyRevision,
        savedDirtyRevision: this.#savedDirtyRevision,
        contentIdentity: this.#contentIdentity,
        savedContentIdentity: this.#savedContentIdentity,
        lastError: this.#lastError,
        conflict: this.#conflict,
        synchronisationPending: this.#synchronisationPending,
        snapshotCache: this.#snapshotCache,
      },
      notificationPending: false,
    };
    return publicTransaction;
  }

  rollbackCloseTransaction(
    transaction: ApplicationDocumentCloseTransaction,
    authority: DocumentAdoptionAuthority,
  ): void {
    if (authority !== documentAdoptionAuthority) throw new TypeError("Document close transactions require controller authority.");
    const active = this.#requireCloseTransaction(transaction);
    const before = active.before;
    const bindingChanged = this.#adapter !== before.adapter ||
      (this.#location === null || before.location === null
        ? this.#location !== before.location
        : canonicalDocumentLocation(this.#location) !== canonicalDocumentLocation(before.location));
    this.#location = before.location;
    this.#adapter = before.adapter;
    this.#model = before.model;
    this.#state = before.state;
    this.#currentVersion = before.currentVersion;
    this.#lastSavedRecord = before.lastSavedRecord;
    this.#lastAcknowledgedRecord = before.lastAcknowledgedRecord;
    this.#recoveryRecord = before.recoveryRecord;
    this.#dirtyRevision = before.dirtyRevision;
    this.#savedDirtyRevision = before.savedDirtyRevision;
    this.#contentIdentity = before.contentIdentity;
    this.#savedContentIdentity = before.savedContentIdentity;
    this.#lastError = before.lastError;
    this.#conflict = before.conflict;
    this.#synchronisationPending = before.synchronisationPending;
    this.#activeCloseTransaction = null;
    this.#snapshotCache = before.snapshotCache;
    if (bindingChanged) this.#bindAdapterWatch();
  }

  captureStorageBinding(
    authority: DocumentAdoptionAuthority,
    closeToken?: string,
  ): { readonly location: DocumentLocation; readonly adapter: DocumentStorageAdapter } | null {
    if (authority !== documentAdoptionAuthority) throw new TypeError("Document storage binding capture requires controller authority.");
    this.assertControllerOperation(authority, closeToken);
    return this.#location && this.#adapter
      ? Object.freeze({ location: this.#location, adapter: this.#adapter })
      : null;
  }

  commitCloseTransaction(
    transaction: ApplicationDocumentCloseTransaction,
    authority: DocumentAdoptionAuthority,
  ): void {
    if (authority !== documentAdoptionAuthority) throw new TypeError("Document close transactions require controller authority.");
    this.#requireCloseTransaction(transaction);
    this.#activeCloseTransaction = null;
  }

  markClosed(authority?: DocumentAdoptionAuthority): Promise<void> {
    if (authority !== undefined && authority !== documentAdoptionAuthority) {
      throw new TypeError("Document structural close requires controller authority.");
    }
    if (this.#publicationProtected) {
      if (!this.#deferredClose) {
        let resolve!: () => void;
        const promise = new Promise<void>(done => { resolve = done; });
        this.#deferredClose = { authority, promise, resolve };
      }
      return this.#deferredClose.promise;
    }
    if (this.#state === "closed") return this.#closeCleanupPromise ?? Promise.resolve();
    try { this.#autosave?.cancel("document-closed"); } catch (error) { this.#reportCleanupError(error, "document-close-timer-autosave"); }
    try { this.#recoveryScheduler.cancel("document-closed"); } catch (error) { this.#reportCleanupError(error, "document-close-timer-recovery"); }
    this.#mutationGeneration += 1;
    try { this.#mutationAbortController.abort("document-closed"); } catch (error) { this.#reportCleanupError(error, "document-close-abort"); }
    this.#editing.dispose();
    const adapterWatch = this.#adapterWatch;
    this.#adapterWatch = null;
    try { adapterWatch?.dispose(); } catch (error) { this.#reportCleanupError(error, "document-close-watch-adapter"); }
    const synchronisationWatch = this.#synchronisationWatch;
    this.#synchronisationWatch = null;
    try { synchronisationWatch?.dispose(); } catch (error) { this.#reportCleanupError(error, "document-close-watch-synchronisation"); }
    const recoveryRecord = this.#recoveryRecord;
    if (recoveryRecord) this.#recoveryRecord = null;
    this.#state = "closed";
    if (authority === documentAdoptionAuthority) {
      this.#snapshotCache = null;
      this.#controllerNotificationPending = true;
    } else {
      this.#emit();
    }
    let recoveryCleanup = Promise.resolve();
    if (recoveryRecord) {
      try {
        recoveryCleanup = Promise.resolve(
          this.#recovery.remove(recoveryRecord.recoveryId, recoveryRecord.recoveryVersion),
        ).catch((error) => {
          this.#reportCleanupError(error, "document-close-recovery-remove");
        });
      } catch (error) {
        this.#reportCleanupError(error, "document-close-recovery-remove");
      }
    }
    const lifecycle = this.#resourceLifecycle;
    this.#resourceLifecycle = null;
    const resourceCleanup = Promise.resolve().then(() => lifecycle?.dispose()).catch(error => this.#reportCleanupError(error, "document-resource-dispose"));
    this.#closeCleanupPromise = Promise.all([recoveryCleanup, resourceCleanup]).then(() => undefined);
    return this.#closeCleanupPromise;
  }

  publishControllerState(authority: DocumentAdoptionAuthority): void {
    if (authority !== documentAdoptionAuthority) throw new TypeError("Document publication requires controller authority.");
    if (!this.#controllerNotificationPending) return;
    this.#controllerNotificationPending = false;
    this.#emit();
  }

  beginAdoptionTransaction(authority: DocumentAdoptionAuthority): ApplicationDocumentAdoptionTransaction {
    if (authority !== documentAdoptionAuthority) throw new TypeError("Document adoption transactions require controller authority.");
    this.#assertNotClosed();
    const publicTransaction = Object.freeze({ token: Object.freeze({}) });
    this.#adoptionTransactions.set(publicTransaction.token, {
      publicTransaction,
      before: {
        location: this.#location,
        adapter: this.#adapter,
        model: this.#model,
        state: this.#state,
        currentVersion: this.#currentVersion,
        lastSavedRecord: this.#lastSavedRecord,
        lastAcknowledgedRecord: this.#lastAcknowledgedRecord,
        recoveryRecord: this.#recoveryRecord,
        dirtyRevision: this.#dirtyRevision,
        savedDirtyRevision: this.#savedDirtyRevision,
        contentIdentity: this.#contentIdentity,
        savedContentIdentity: this.#savedContentIdentity,
        lastError: this.#lastError,
        conflict: this.#conflict,
        synchronisationPending: this.#synchronisationPending,
        snapshotCache: this.#snapshotCache,
        controllerNotificationPending: this.#controllerNotificationPending,
      },
    });
    return publicTransaction;
  }

  commitAdoptionTransaction(transaction: ApplicationDocumentAdoptionTransaction, authority: DocumentAdoptionAuthority): void {
    if (authority !== documentAdoptionAuthority) throw new TypeError("Document adoption transactions require controller authority.");
    if (!this.#adoptionTransactions.delete(transaction.token)) throw new DocumentUnavailableError("Document adoption transaction authority is stale.", { retryable: false });
  }

  rollbackAdoptionTransaction(transaction: ApplicationDocumentAdoptionTransaction, authority: DocumentAdoptionAuthority): void {
    if (authority !== documentAdoptionAuthority) throw new TypeError("Document adoption transactions require controller authority.");
    const active = this.#adoptionTransactions.get(transaction.token);
    if (!active) throw new DocumentUnavailableError("Document adoption transaction authority is stale.", { retryable: false });
    this.#adoptionTransactions.delete(transaction.token);
    const before = active.before;
    // Save As may yield while recovery cleanup or a fallible adapter hook is
    // running. Preserve edits made during that yield while restoring only the
    // adoption's storage binding and saved-record projection.
    const newerLocalEdit = this.#dirtyRevision !== before.dirtyRevision;
    const newerDirtyRevision = this.#dirtyRevision;
    const newerModel = this.#model;
    const newerState = this.#state;
    const newerLastError = this.#lastError;
    const newerConflict = this.#conflict;
    const newerSynchronisationPending = this.#synchronisationPending;
    this.#autosave?.cancel("document-adoption-rollback");
    this.#recoveryScheduler.cancel("document-adoption-rollback");
    const adapterWatch = this.#adapterWatch;
    this.#adapterWatch = null;
    try { adapterWatch?.dispose(); } catch (error) { this.#reportCleanupError(error, "document-adoption-rollback-watch"); }
    const synchronisationWatch = this.#synchronisationWatch;
    this.#synchronisationWatch = null;
    try { synchronisationWatch?.dispose(); } catch (error) { this.#reportCleanupError(error, "document-adoption-rollback-synchronisation"); }
    this.#location = before.location;
    this.#adapter = before.adapter;
    this.#model = before.model;
    this.#state = before.state;
    this.#currentVersion = before.currentVersion;
    this.#lastSavedRecord = before.lastSavedRecord;
    this.#lastAcknowledgedRecord = before.lastAcknowledgedRecord;
    this.#recoveryRecord = before.recoveryRecord;
    this.#dirtyRevision = before.dirtyRevision;
    this.#savedDirtyRevision = before.savedDirtyRevision;
    this.#contentIdentity = before.contentIdentity;
    this.#savedContentIdentity = before.savedContentIdentity;
    this.#lastError = before.lastError;
    this.#conflict = before.conflict;
    this.#synchronisationPending = before.synchronisationPending;
    this.#snapshotCache = before.snapshotCache;
    this.#controllerNotificationPending = before.controllerNotificationPending;
    if (newerLocalEdit) {
      this.#model = newerModel;
      this.#contentIdentity = this.#modelContentIdentity(newerModel);
      this.#dirtyRevision = newerDirtyRevision;
      this.#state = newerState === "clean" ? "dirty" : newerState;
      this.#lastError = newerLastError;
      this.#conflict = newerConflict;
      this.#synchronisationPending = newerSynchronisationPending;
      this.#snapshotCache = null;
      if (this.#state === "dirty" || this.#state === "conflicted") {
        if (!this.#recoveryRecord) this.#queueRecovery();
        if (this.#state === "dirty") this.#autosave?.schedule();
      }
    }
    try { this.#bindAdapterWatch(); }
    catch (error) {
      this.#reportCleanupError(error, "document-adoption-rollback-bind");
      throw error;
    }
  }

  adoptSavedRecord(
    record: DocumentRecord<TSerialized>,
    adapter: DocumentStorageAdapter,
    authority: DocumentAdoptionAuthority,
    savedDirtyRevision = this.#dirtyRevision,
    closeToken?: string,
  ): void {
    if (authority !== documentAdoptionAuthority) throw new TypeError("Document adoption requires controller authority.");
    this.#assertNotClosed();
    if (this.#closeGateToken && this.#closeGateToken !== closeToken) this.#assertCloseGateAllowsMutation();
    this.#adapter = adapter;
    this.#location = immutableClone(record.location);
    this.#bindAdapterWatch();
    this.#lastSavedRecord = immutableClone(record);
    this.#currentVersion = immutableClone(record.version);
    this.#savedContentIdentity = canonicalDocumentJson(record.content, this.type.id);
    this.#editBoundary += 1;
    const pendingSynchronisation = adapter.isSynchronisationPending?.(record.location) === true;
    this.#synchronisationPending = pendingSynchronisation;
    if (!pendingSynchronisation) this.#lastAcknowledgedRecord = immutableClone(record);
    this.#conflict = null;
    this.#lastError = null;
    if (this.#contentIdentity === this.#savedContentIdentity && !pendingSynchronisation) {
      this.#state = "clean";
      this.#savedDirtyRevision = savedDirtyRevision;
      if (!this.#activeCloseTransaction) this.undoManager.markClean();
    } else {
      this.#state = "dirty";
      this.#queueRecovery();
      this.#autosave?.schedule();
    }
    this.#emit();
  }

  captureForExternalSave(
    authority: DocumentAdoptionAuthority,
    closeToken?: string,
    preserveUnsaved = false,
  ): {
    readonly model: TModel;
    readonly serializedContent: TSerialized;
    readonly dirtyRevision: number;
  } {
    if (authority !== documentAdoptionAuthority) throw new TypeError("Document save capture requires controller authority.");
    this.#assertNotClosed();
    // Save-as on a projection would mint a writable copy of read-only data
    // through the back door; duplicating projection content must go through
    // an explicit export path, never the save pipeline.
    if (this.#documentKind === "projection") throw new DocumentReadOnlyError(`Document "${this.id}" is a read-only projection.`);
    if (!preserveUnsaved && this.#state === "read-only") throw new DocumentReadOnlyError();
    if (!preserveUnsaved && this.#state === "deleted") throw new DocumentDeletedError();
    if (this.#closeGateToken && this.#closeGateToken !== closeToken) this.#assertCloseGateAllowsMutation();
    const model = immutableClone(this.#model);
    const serializedContent = this.type.write(model, { typeId: this.type.id, schemaVersion: this.type.schemaVersion });
    if (!this.type.validate(serializedContent)) throw new DocumentSchemaError(this.type.id);
    return Object.freeze({ model, serializedContent: immutableClone(serializedContent), dirtyRevision: this.#dirtyRevision });
  }

  markUnsaved(authority: DocumentAdoptionAuthority): void {
    if (authority !== documentAdoptionAuthority) throw new TypeError("Unsaved document state requires controller authority.");
    this.#assertNotClosed();
    this.#assertNoTerminalReconciliation();
    // Kernel state annotations may reach read-only projections and a prepared
    // close; they do not replace the model. Admission callbacks still cannot
    // invalidate the saved identity or revision of an in-flight edit.
    if (this.#editInProgress || this.#publicationProtected) {
      throw new DocumentUnavailableError("Document model admission/publication is in progress.", { retryable: false });
    }
    if (this.#dirtyRevision === 0) this.#dirtyRevision = 1;
    this.#savedContentIdentity = null;
    this.#state = "dirty";
    this.#queueRecovery();
    this.#autosave?.schedule();
    this.#emit();
  }

  async beginCloseGate(
    token: string,
    authority: DocumentAdoptionAuthority,
    signal?: AbortSignal,
    terminalToken?: object,
  ): Promise<void> {
    if (authority !== documentAdoptionAuthority) throw new TypeError("Document close gating requires controller authority.");
    this.#assertCloseGateAllowsMutation();
    if (terminalToken) this.#assertTerminalReconciliation(terminalToken, authority);
    else this.#assertNoTerminalReconciliation();
    if (this.#closeGateToken) throw new DocumentUnavailableError(`Document "${this.id}" already has a prepared close.`, { retryable: false });
    this.#closeGateToken = token;
    this.#mutationGeneration += 1;
    this.#mutationAbortController.abort("document-close-gate");
    this.#mutationAbortController = new AbortController();
    await this.#autosave?.cancelAndWait("document-close-gate");
    if (terminalToken) this.#assertTerminalReconciliation(terminalToken, authority);
    if (this.#closeGateToken !== token) return;
    await this.#saveTail;
    if (terminalToken) this.#assertTerminalReconciliation(terminalToken, authority);
    if (this.#closeGateToken !== token) return;
    if (!signal?.aborted && this.hasUnsavedChanges && !this.#recoveryMatchesCurrentState()) {
      try { await this.#enqueueRecoveryWrite(signal); } catch (error) {
        this.#lastError = asDocumentError(error);
      }
    }
    if (this.#closeGateToken !== token) return;
    await this.#recoveryScheduler.cancelAndWait("document-close-gate");
    if (terminalToken) this.#assertTerminalReconciliation(terminalToken, authority);
    if (this.#closeGateToken !== token) return;
    await this.#recoveryTail;
    if (terminalToken) this.#assertTerminalReconciliation(terminalToken, authority);
    if (this.#closeGateToken !== token) return;
    throwIfDocumentAborted(signal);
  }

  async beginRuntimeDisposalGate(
    token: string,
    authority: DocumentAdoptionAuthority,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.beginCloseGate(token, authority, signal);
  }

  endCloseGate(token: string, authority: DocumentAdoptionAuthority): void {
    if (authority !== documentAdoptionAuthority) throw new TypeError("Document close gating requires controller authority.");
    if (this.#closeGateToken === token) {
      this.#closeGateToken = null;
      if (this.hasUnsavedChanges) {
        this.#queueRecovery();
        if (this.#state === "dirty") this.#autosave?.schedule();
      }
    }
  }

  assertCloseGate(token: string, authority: DocumentAdoptionAuthority, terminalToken?: object): void {
    if (authority !== documentAdoptionAuthority) throw new TypeError("Document close gating requires controller authority.");
    this.#assertNotClosed();
    if (terminalToken) this.#assertTerminalReconciliation(terminalToken, authority);
    else this.#assertNoTerminalReconciliation();
    if (this.#closeGateToken !== token) {
      throw new DocumentUnavailableError(`Document "${this.id}" no longer owns the selected close gate.`, { retryable: false });
    }
  }

  endRuntimeDisposalGate(token: string, authority: DocumentAdoptionAuthority): void {
    if (authority !== documentAdoptionAuthority) throw new TypeError("Document disposal gating requires controller authority.");
    if (this.#closeGateToken !== token) return;
    this.#closeGateToken = null;
    if (this.#state === "dirty") {
      this.#queueRecovery();
      this.#autosave?.schedule();
    }
  }

  async finishExternalSave(authority: DocumentAdoptionAuthority, signal?: AbortSignal): Promise<void> {
    if (authority !== documentAdoptionAuthority) throw new TypeError("External save completion requires controller authority.");
    if (this.#state !== "clean") return;
    if (this.#activeCloseTransaction) return;
    try {
      await this.#clearRecovery(signal);
    } catch (error) {
      this.#lastError = asDocumentError(error);
      this.#emit();
    }
  }

  restoreRecoveredModel(
    model: TModel,
    dirtyRevision: number,
    recoveryRecord: DocumentRecoveryRecord | null,
    authority: DocumentAdoptionAuthority,
  ): void {
    if (authority !== documentAdoptionAuthority) throw new TypeError("Recovered document state requires controller authority.");
    // Recovery records only exist for dirty documents. A projection holding
    // one means the kernel invariant already failed — refuse loudly rather
    // than resurrecting the projection as a dirty document.
    if (this.#documentKind === "projection") throw new DocumentReadOnlyError(`Document "${this.id}" is a read-only projection.`);
    if (!Number.isSafeInteger(dirtyRevision) || dirtyRevision <= 0) throw new TypeError("Recovered dirty revisions must be positive integers.");
    this.#assertNotClosed();
    if (this.#editInProgress || this.undoManager.isExecuting) throw new DocumentUnavailableError("Recovered model adoption cannot reenter editing or replay.", { retryable: false });
    this.undoManager.assertCanRegister();
    const staged = stageDocumentEdit(this.#model, this.type, () => model);
    this.#withResourceChange(staged.model, () => {
    this.#recoveryScheduler.cancel("recovery-restored");
    this.undoManager.clear();
    this.#model = staged.model;
    this.#contentIdentity = staged.contentIdentity;
    if (!this.#lastSavedRecord) this.#savedContentIdentity = null;
    this.#dirtyRevision = Math.max(dirtyRevision, this.#dirtyRevision);
    this.#savedDirtyRevision = 0;
    this.#recoveryRecord = recoveryRecord ? immutableClone(recoveryRecord) : null;
    this.#state = "dirty";
    this.#lastError = null;
    this.#conflict = null;
    if (!recoveryRecord) { try { this.#queueRecovery(); } catch (error) { this.#reportCleanupError(error, "document-restoration-recovery"); } }
    this.#emit();
    });
  }

  assertControllerOperation(authority: DocumentAdoptionAuthority, closeToken?: string): void {
    if (authority !== documentAdoptionAuthority) throw new TypeError("Document controller operation requires controller authority.");
    this.#assertNotClosed();
    this.#assertNoTerminalReconciliation();
    if (this.#closeGateToken && this.#closeGateToken !== closeToken) this.#assertCloseGateAllowsMutation();
  }

  #applyUndoModel(model: TModel): void {
    this.#assertEditable();
    const staged = stageDocumentEdit(this.#model, this.type, () => model);
    this.#withResourceChange(staged.model, () => this.#applyChangedModel(staged.model, staged.contentIdentity));
  }

  #withResourceChange(model: TModel, publish: () => void, beforePublication?: () => void): void {
    const wasEditing = this.#editInProgress;
    this.#editInProgress = true;
    let change: DocumentResourceChange | undefined;
    let published = false;
    try {
      beforePublication?.();
      change = this.#resourceLifecycle?.stageChange(this.#model as Readonly<unknown>, model as Readonly<unknown>, { recordHistory: false });
      this.#assertNotClosed();
      this.#publicationProtected = true;
      change?.commit();
      if (this.#deferredClose) throw new DocumentUnavailableError("The document closed during resource admission.", { retryable: false });
      // Reversible resource callbacks are still before canonical/history
      // admission. Fence caller cancellation and captured owner authority here.
      beforePublication?.();
      publish(); published = true;
    } finally {
      try { published ? change?.release() : change?.rollback(); }
      catch (error) { this.#reportCleanupError(error, "document-resource-change-cleanup"); }
      if (!wasEditing) this.#finishPublication();
    }
  }

  #finishPublication(): void {
    this.#publicationProtected = false;
    this.#editInProgress = false;
    const close = this.#deferredClose;
    this.#deferredClose = null;
    if (close) {
      try { void this.markClosed(close.authority).then(close.resolve, error => { this.#reportCleanupError(error, "document-deferred-close"); close.resolve(); }); }
      catch (error) { this.#reportCleanupError(error, "document-deferred-close"); close.resolve(); }
    }
  }

  #modelContentIdentity(model: TModel): string {
    return canonicalDocumentJson(this.type.write(model, { typeId: this.type.id, schemaVersion: this.type.schemaVersion }), this.type.id);
  }

  #applyChangedModel(model: TModel, identity = this.#modelContentIdentity(model)): void {
    this.#model = model;
    this.#contentIdentity = identity;
    this.#dirtyRevision += 1;
    if (this.#state !== "conflicted") this.#state = this.hasUnsavedChanges ? "dirty" : "clean";
    this.#lastError = null;
    if (this.hasUnsavedChanges) {
      try { this.#queueRecovery(); } catch (error) { this.#reportCleanupError(error, "document-edit-recovery-schedule"); }
      if (this.#state !== "conflicted") {
        try { this.#autosave?.schedule(); } catch (error) { this.#reportCleanupError(error, "document-edit-autosave-schedule"); }
      }
    } else {
      try { this.#autosave?.cancel("document-content-clean"); } catch (error) { this.#reportCleanupError(error, "document-edit-autosave-cancel"); }
      try { this.#recoveryScheduler.cancel("document-content-clean"); } catch (error) { this.#reportCleanupError(error, "document-edit-recovery-cancel"); }
    }
    this.#emit();
  }

  async #performSave(
    options: SaveDocumentOptions,
    expectedVersion: DocumentVersion | null,
    model: TModel,
    operationId: string,
    closeToken?: string,
    generation = this.#mutationGeneration,
    lifecycleSignal = this.#mutationAbortController.signal,
    fenceCallerAbortAfterCommit = false,
    terminalToken?: object,
  ): Promise<void> {
    const operationSignal = combinedDocumentSignal(options.signal, lifecycleSignal);
    throwIfDocumentAborted(operationSignal);
    if (generation !== this.#mutationGeneration && closeToken !== this.#closeGateToken) {
      throw new DocumentUnavailableError(`Document "${this.id}" operation was fenced by close.`, { retryable: false });
    }
    this.#assertNotClosed();
    if (terminalToken) this.#assertTerminalReconciliation(terminalToken, documentAdoptionAuthority);
    else this.#assertNoTerminalReconciliation();
    if (this.#closeGateToken && this.#closeGateToken !== closeToken) this.#assertCloseGateAllowsMutation();
    const { location, adapter } = this.#requirePersistence();
    const capturedModel = immutableClone(model);
    const capturedRevision = this.#dirtyRevision;
    const capturedBase = this.#lastSavedRecord ? immutableClone(this.#lastSavedRecord) : null;
    try {
      const serialized = this.type.write(capturedModel, { typeId: this.type.id, schemaVersion: this.type.schemaVersion });
      if (!this.type.validate(serialized)) throw new DocumentSchemaError(this.type.id);
      this.#state = "saving";
      this.#lastError = null;
      this.#emit();
      this.#onWillSave?.({
        documentId: this.id,
        reason: options.reason,
        content: immutableClone(serialized),
        dirtyRevision: capturedRevision,
      });
      const closeTransaction = this.#activeCloseTransaction;
      const request: DocumentWriteRequest<TSerialized> = {
        location,
        typeId: this.type.id,
        schemaVersion: this.type.schemaVersion,
        content: serialized,
        expectedVersion,
        idempotencyKey: `document-save:${this.id}:${operationId}`,
        signal: operationSignal,
        closeTransactionToken: closeTransaction && closeTransaction.closeToken === closeToken
          ? closeTransaction.storageToken
          : undefined,
      };
      let record: DocumentRecord<TSerialized>;
      try {
        record = await this.#awaitTerminalAwareWrite(adapter, request, capturedRevision, operationSignal);
      } catch (error) {
        if (terminalToken && error instanceof DocumentWriteOutcomeUnknownError) {
          this.#indeterminateTerminalWrite ??= {
            adapter,
            request,
            dirtyRevision: capturedRevision,
            outcome: "rejected",
            record: null,
            error,
          };
        }
        throw error;
      }
      if ((fenceCallerAbortAfterCommit && operationSignal.aborted) || lifecycleSignal.aborted ||
          (generation !== this.#mutationGeneration && closeToken !== this.#closeGateToken) ||
          this.state === "closed" || this.state === "closing") {
        await this.#reconcileFencedSave(adapter, location, record, expectedVersion, capturedBase, operationId);
      }
      throwIfDocumentAborted(fenceCallerAbortAfterCommit ? operationSignal : lifecycleSignal);
      if (generation !== this.#mutationGeneration && closeToken !== this.#closeGateToken) {
        throw new DocumentUnavailableError(`Document "${this.id}" operation was fenced by close.`, { retryable: false });
      }
      this.#assertNotClosed();
      this.#lastSavedRecord = immutableClone(record);
      this.#currentVersion = immutableClone(record.version);
      this.#savedContentIdentity = canonicalDocumentJson(serialized, this.type.id);
      this.#conflict = null;
      this.#lastError = null;
      const pendingSynchronisation = adapter.isSynchronisationPending?.(location) === true;
      this.#synchronisationPending = pendingSynchronisation;
      if (!pendingSynchronisation) this.#lastAcknowledgedRecord = immutableClone(record);
      if (this.#contentIdentity === this.#savedContentIdentity && !pendingSynchronisation) {
        this.#state = "clean";
        this.#savedDirtyRevision = capturedRevision;
        if (!this.#activeCloseTransaction) {
          this.undoManager.markClean();
          try {
            await this.#clearRecovery();
          } catch (error) {
            this.#lastError = asDocumentError(error);
          }
        }
      } else {
        this.#state = "dirty";
        this.#queueRecovery();
        if (!pendingSynchronisation) this.#autosave?.schedule();
      }
      this.#emit();
    } catch (error) {
      if (this.#state === "closed" || this.#state === "closing") throw error;
      if (error instanceof DocumentVersionConflictError) {
        this.#conflict = immutableClone({
          base: this.#lastSavedRecord,
          localModel: capturedModel,
          remote: error.currentRecord,
          detectedAt: new Date(this.#environment.now()).toISOString(),
        });
        this.#state = "conflicted";
        this.#autosave?.cancel("document-conflict");
      } else {
        this.#state = error instanceof DocumentReadOnlyError
          ? "read-only"
          : error instanceof DocumentDeletedError
            ? "deleted"
            : "dirty";
      }
      this.#lastError = asDocumentError(error);
      this.#emit();
      throw error;
    }
  }

  #awaitTerminalAwareWrite(
    adapter: DocumentStorageAdapter,
    request: DocumentWriteRequest<TSerialized>,
    dirtyRevision: number,
    signal: AbortSignal,
  ): Promise<DocumentRecord<TSerialized>> {
    let provider: Promise<DocumentRecord<TSerialized>>;
    try {
      provider = Promise.resolve(adapter.write<TSerialized>(request));
    } catch (error) {
      return Promise.reject(error);
    }
    return new Promise<DocumentRecord<TSerialized>>((resolve, reject) => {
      let publicSettled = false;
      let handedOff: TerminalWriteReconciliation<TSerialized> | null = null;
      const finish = (callback: () => void): void => {
        if (publicSettled) return;
        publicSettled = true;
        signal.removeEventListener("abort", onAbort);
        callback();
      };
      const onAbort = () => {
        if (!this.#terminalReconciliation) return;
        handedOff = {
          adapter,
          request,
          dirtyRevision,
          outcome: "pending",
          record: null,
          error: null,
        };
        this.#indeterminateTerminalWrite = handedOff;
        finish(() => reject(new DocumentWriteOutcomeUnknownError(
          request.location,
          request.idempotencyKey,
          "The write was handed to terminal reconciliation before its provider outcome was known.",
          { cause: signal.reason },
        )));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
      provider.then(
        (record) => {
          if (handedOff) {
            handedOff.outcome = "fulfilled";
            handedOff.record = immutableClone(record);
            return;
          }
          finish(() => resolve(record));
        },
        (error) => {
          if (handedOff) {
            handedOff.outcome = "rejected";
            handedOff.error = error;
            return;
          }
          finish(() => reject(error));
        },
      );
    });
  }

  #queueRecovery(): void {
    if (this.#terminalReconciliation) return;
    this.#recoveryScheduler.schedule();
  }

  #reportCleanupError(error: unknown, context: string): void {
    try { this.#observeError?.(error, context); } catch { /* diagnostics cannot own close authority */ }
  }

  async #enqueueRecoveryWrite(signal?: AbortSignal): Promise<void> {
    throwIfDocumentAborted(signal);
    const generation = this.#mutationGeneration;
    const dirtyRevision = this.#dirtyRevision;
    let serializedContent: TSerialized;
    try {
      serializedContent = this.type.write(this.#model, { typeId: this.type.id, schemaVersion: this.type.schemaVersion });
      if (!this.type.validate(serializedContent)) throw new DocumentSchemaError(this.type.id);
    } catch (error) {
      this.#lastError = asDocumentError(error);
      return;
    }
    const input: Omit<DocumentRecoveryRecord, "recoveryVersion"> = {
      schemaVersion: 1,
      recoveryId: this.#recoveryId,
      documentId: this.id,
      typeId: this.type.id,
      typeSchemaVersion: this.type.schemaVersion,
      location: this.#location ? immutableClone(this.#location) : null,
      baseVersion: this.#currentVersion ? immutableClone(this.#currentVersion) : null,
      dirtyRevision,
      serializedContent: immutableClone(serializedContent),
      contentHash: canonicalDocumentContentHash(serializedContent),
      capturedAt: new Date(this.#environment.now()).toISOString(),
    };
    const operation = this.#recoveryTail.then(async () => {
      const next = await this.#recovery.write(input, this.#recoveryRecord?.recoveryVersion ?? null, signal);
      if (this.#state === "closed") {
        await this.#recovery.remove(next.recoveryId, next.recoveryVersion).catch(() => undefined);
        return;
      }
      this.#recoveryRecord = immutableClone(next);
      if ((generation !== this.#mutationGeneration || dirtyRevision !== this.#dirtyRevision) && this.#closeGateToken === null) {
        this.#recoveryScheduler.schedule();
      }
    });
    this.#lastRecoveryOperation = operation;
    this.#recoveryTail = operation.catch(() => undefined);
    await operation;
  }

  #recoveryMatchesCurrentState(): boolean {
    const record = this.#recoveryRecord;
    if (!record || record.documentId !== this.id || record.typeId !== this.type.id ||
        record.typeSchemaVersion !== this.type.schemaVersion || record.dirtyRevision !== this.#dirtyRevision ||
        !sameVersion(record.baseVersion, this.#currentVersion)) return false;
    if (record.location === null || this.#location === null) {
      if (record.location !== this.#location) return false;
    } else if (canonicalDocumentLocation(record.location) !== canonicalDocumentLocation(this.#location)) {
      return false;
    }
    try {
      const serialized = this.type.write(this.#model, { typeId: this.type.id, schemaVersion: this.type.schemaVersion });
      return this.type.validate(serialized) && canonicalDocumentContentHash(serialized) === record.contentHash;
    } catch {
      return false;
    }
  }

  async #clearRecovery(signal?: AbortSignal): Promise<void> {
    const revision = this.#savedDirtyRevision;
    // Saving may synchronously publish a newer edit through clean-state
    // subscribers. Only the persisted revision owns recovery cleanup.
    if (revision !== this.#dirtyRevision && this.#closeGateToken === null) return;
    this.#recoveryScheduler.cancel("recovery-cleared");
    const operation = this.#recoveryTail.then(async () => {
      throwIfDocumentAborted(signal);
      // A new edit can arrive while an earlier recovery write is settling.
      // Its recovery must survive the older save's cleanup.
      if (revision !== this.#dirtyRevision && this.#closeGateToken === null) return;
      const record = this.#recoveryRecord;
      if (!record) return;
      await this.#recovery.remove(record.recoveryId, record.recoveryVersion, signal);
      // Reflect a committed removal even if cancellation arrived while the
      // store was settling, before another queued write reads its version.
      if (this.#recoveryRecord === record) this.#recoveryRecord = null;
      throwIfDocumentAborted(signal);
    });
    // Deletion and writing share the same queue and recovery-version owner.
    this.#recoveryTail = operation.catch(() => undefined);
    try { await operation; }
    finally {
      if (revision !== this.#dirtyRevision && this.#state === "dirty" && this.#closeGateToken === null && !this.#terminalReconciliation) {
        this.#queueRecovery();
      }
    }
  }

  #replaceWithSavedRecord(record: DocumentRecord<TSerialized>, beforePublication?: () => void): void {
    this.undoManager.assertCanRegister();
    const staged = stageDocumentEdit(this.#model, this.type, () => decodeRecord(this.type, record));
    const saved = immutableClone(record);
    this.#withResourceChange(staged.model, () => {
    this.#autosave?.cancel("document-replaced");
    this.undoManager.clear();
    this.#model = staged.model;
    this.#contentIdentity = staged.contentIdentity;
    this.#savedContentIdentity = this.#contentIdentity;
    this.#editBoundary += 1;
    this.#location = immutableClone(record.location);
    this.#lastSavedRecord = saved;
    this.#lastAcknowledgedRecord = saved;
    this.#currentVersion = immutableClone(record.version);
    this.#dirtyRevision += 1;
    this.#savedDirtyRevision = this.#dirtyRevision;
    this.#conflict = null;
    this.#lastError = null;
    this.#state = "clean";
    this.#synchronisationPending = false;
    this.undoManager.markClean();
    this.#emit();
    }, beforePublication);
  }

  #bindAdapterWatch(): void {
    this.#adapterWatch?.dispose();
    this.#adapterWatch = null;
    this.#synchronisationWatch?.dispose();
    this.#synchronisationWatch = null;
    const adapter = this.#adapter;
    const location = this.#location;
    if (!adapter || !location) return;
    if (adapter.capabilities.watch && adapter.watch) {
      this.#adapterWatch = adapter.watch(location, (event) => {
        if (event.kind !== "written") return;
        this.#environment.setTimeout(() => this.#receiveStorageObservation(event.record as DocumentRecord<TSerialized>), 0);
      });
    }
    if (adapter.subscribeSynchronisation) {
      this.#synchronisationWatch = adapter.subscribeSynchronisation(location, (event) => this.#receiveStorageObservation(null, event));
    }
  }

  #receiveStorageObservation(record: DocumentRecord<TSerialized> | null, event?: DocumentSynchronisationEvent): void {
    if (this.#state === "closed" || this.#state === "closing" || this.#closeGateToken) return;
    if (event && this.#terminalReconciliation) { this.#deferredTerminalSynchronisation = event; return; }
    const process = () => event ? this.#observeSynchronisation(event) : record && this.#adoptWatchedRecord(record);
    if (!this.#resourceLifecycle) { process(); return; }
    const adapter = this.#adapter, location = this.#location;
    const observed = record ?? (event?.kind === "acknowledged" ? event.record : event?.currentRecord);
    this.#observedResourceTail = this.#observedResourceTail.then(async () => {
      if (adapter !== this.#adapter || location !== this.#location || this.#state === "closed" || this.#closeGateToken) return;
      const preparation = observed ? await this.prepareResourceModel(decodeRecord(this.type, observed as DocumentRecord<TSerialized>), documentAdoptionAuthority) : null;
      try {
        if (adapter !== this.#adapter || location !== this.#location || this.state === "closed" || this.#closeGateToken || this.#editInProgress) return;
        process();
      } finally { await preparation?.release(); }
    }).catch(error => this.#reportCleanupError(error, "document-resource-storage-observation"));
  }

  #observeSynchronisation(event: DocumentSynchronisationEvent): void {
    if (this.#state === "closed" || this.#state === "closing" || this.#closeGateToken) return;
    if (this.#terminalReconciliation) {
      this.#deferredTerminalSynchronisation = event;
      return;
    }
    if (event.kind === "acknowledged") {
      if (this.#adapter && this.#location && this.#adapter.isSynchronisationPending?.(this.#location)) return;
      if (!this.#adoptWatchedRecord(event.record as DocumentRecord<TSerialized>)) {
        this.enterConflict({
          base: this.#lastAcknowledgedRecord,
          localModel: this.#model,
          remote: event.record,
        });
        this.#synchronisationPending = false;
      }
      return;
    }
    this.enterConflict({
      base: this.#lastAcknowledgedRecord,
      localModel: this.#model,
      remote: event.currentRecord,
      ...(event.terminalState ? { remoteState: event.terminalState } : {}),
    });
  }

  #adoptWatchedRecord(record: DocumentRecord<TSerialized>): boolean {
    if (this.#state === "closed" || this.#state === "closing" || this.#state === "saving" || this.#closeGateToken || this.#terminalReconciliation) return false;
    const adapter = this.#adapter;
    const location = this.#location;
    if (!adapter || !location || adapter.isSynchronisationPending?.(location)) return false;
    if (record.typeId !== this.type.id) return false;
    if (sameVersion(record.version, this.#currentVersion)) return true;
    try {
      const current = this.type.write(this.#model, { typeId: this.type.id, schemaVersion: this.type.schemaVersion });
      if (canonicalDocumentContentHash(current) !== canonicalDocumentContentHash(record.content)) {
        decodeRecord(this.type, record);
        return false;
      }
      const saved = immutableClone(record);
      this.#withResourceChange(this.#model, () => {
      this.#lastSavedRecord = saved;
      this.#lastAcknowledgedRecord = immutableClone(record);
      this.#currentVersion = immutableClone(record.version);
      this.#savedDirtyRevision = this.#dirtyRevision;
      this.#savedContentIdentity = this.#contentIdentity;
      this.#synchronisationPending = false;
      this.#state = "clean";
      this.#lastError = null;
      this.undoManager.markClean();
      void this.#clearRecovery().catch((error) => {
        this.#lastError = asDocumentError(error);
        this.#emit();
      });
      this.#emit();
      });
      return true;
    } catch (error) {
      this.#lastError = asDocumentError(error);
      this.#emit();
      return false;
    }
  }

  async refreshSynchronisation(signal?: AbortSignal): Promise<void> {
    this.#assertNotClosed();
    const adapter = this.#adapter;
    const location = this.#location;
    if (!adapter || !location) return;
    if (adapter.readLastAcknowledgedRecord) {
      this.#lastAcknowledgedRecord = await adapter.readLastAcknowledgedRecord<TSerialized>(location, { signal });
    }
    await adapter.refreshSynchronisation?.(location, { signal });
  }

  async #reconcileFencedSave(
    adapter: DocumentStorageAdapter,
    location: DocumentLocation,
    committed: DocumentRecord<TSerialized>,
    expectedVersion: DocumentVersion | null,
    base: DocumentRecord<TSerialized> | null,
    operationId: string,
  ): Promise<never> {
    try {
      if (adapter.reconcileFencedWrite) {
        await adapter.reconcileFencedWrite(location, committed, base);
      } else if (expectedVersion === null) {
        await adapter.remove(location, committed.version);
      } else if (base && sameVersion(base.version, expectedVersion)) {
        await adapter.write({
          location,
          typeId: base.typeId,
          schemaVersion: base.schemaVersion,
          content: base.content,
          expectedVersion: committed.version,
          idempotencyKey: `document-save-reconcile:${this.id}:${operationId}`,
          metadata: base.metadata,
        });
      } else {
        throw new DocumentUnavailableError("A fenced document commit has no authoritative base to restore.", { retryable: false });
      }
    } catch (error) {
      throw new DocumentUnavailableError("A fenced document commit could not be reconciled safely.", {
        cause: error,
        retryable: false,
      });
    }
    throw new DocumentAbortError("The document save was fenced by close after the backend committed.");
  }

  #observeAutosaveError(error: unknown): void {
    if (error instanceof DocumentAbortError && this.#state === "conflicted") return;
    this.#lastError = asDocumentError(error);
    if (this.#state === "saving") this.#state = "dirty";
    this.#emit();
  }

  #requirePersistence(): { readonly location: DocumentLocation; readonly adapter: DocumentStorageAdapter } {
    if (!this.#location || !this.#adapter) throw new DocumentLocationRequiredError(this.id);
    return { location: this.#location, adapter: this.#adapter };
  }

  #assertEditable(): void {
    if (this.#editInProgress) throw new DocumentUnavailableError("Document edit staging/publication is already in progress.", { retryable: false });
    this.#assertWritable();
  }

  #assertWritable(allowPublication = false): void {
    this.#assertNotClosed();
    this.#assertNoTerminalReconciliation();
    this.#assertCloseGateAllowsMutation(allowPublication);
    // Projections are immutable by kind, independent of the lifecycle state:
    // no update, revert, or version-restore path may touch them.
    if (this.#documentKind === "projection") throw new DocumentReadOnlyError(`Document "${this.id}" is a read-only projection.`);
    if (this.#state === "read-only") throw new DocumentReadOnlyError();
    if (this.#state === "deleted") throw new DocumentDeletedError();
  }

  #assertNoTerminalReconciliation(): void {
    if (this.#terminalReconciliation) {
      throw new DocumentUnavailableError(`Document "${this.id}" has an active terminal reconciliation lease.`, { retryable: false });
    }
  }

  #assertTerminalReconciliation(token: object, authority: DocumentAdoptionAuthority): void {
    this.#requireTerminalReconciliation(token, authority);
  }

  #requireTerminalReconciliation(token: object, authority: DocumentAdoptionAuthority): ActiveTerminalReconciliation {
    const terminal = this.#terminalReconciliation;
    if (authority !== documentAdoptionAuthority || !terminal || terminal.token !== token || terminal.generation !== this.#terminalGeneration) {
      throw new DocumentUnavailableError(`Document "${this.id}" terminal reconciliation authority is stale.`, { retryable: false });
    }
    this.#assertNotClosed();
    return terminal;
  }

  #runTerminalFlight(
    terminal: ActiveTerminalReconciliation,
    phase: "save" | "recover",
    operation: () => Promise<void> | void,
  ): Promise<void> {
    if (terminal.flight) {
      if (terminal.flight.phase === phase) return terminal.flight.promise;
      return Promise.reject(new DocumentUnavailableError(
        `Document "${this.id}" is already performing terminal ${terminal.flight.phase}.`,
        { retryable: false },
      ));
    }
    const promise = Promise.resolve().then(() => {
      if (this.#terminalReconciliation !== terminal || terminal.generation !== this.#terminalGeneration) {
        throw new DocumentUnavailableError(`Document "${this.id}" terminal reconciliation authority is stale.`, { retryable: false });
      }
      return operation();
    });
    terminal.flight = { phase, promise };
    const settle = () => {
      if (terminal.flight?.promise === promise) terminal.flight = null;
    };
    void promise.then(settle, settle);
    return promise;
  }

  #assertCloseGateAllowsMutation(allowPublication = false): void {
    if (this.#publicationProtected && !allowPublication) throw new DocumentUnavailableError("Document model admission/publication is in progress.", { retryable: false });
    if (this.#closeGateToken) {
      throw new DocumentUnavailableError(`Document "${this.id}" has a prepared close.`, { retryable: false });
    }
  }

  #assertNotClosed(): void {
    if (this.#state === "closed" || this.#state === "closing") {
      throw new DocumentUnavailableError(`Document "${this.id}" is closing or closed.`, { retryable: false });
    }
  }

  #emit(): void {
    this.#snapshotCache = null;
    if (this.#activeCloseTransaction) {
      this.#activeCloseTransaction.notificationPending = true;
      return;
    }
    for (const listener of [...this.#listeners]) {
      try { listener(); } catch { /* subscriber isolation */ }
    }
  }

  #requireCloseTransaction(
    transaction: ApplicationDocumentCloseTransaction,
  ): ActiveApplicationDocumentCloseTransaction<TModel, TSerialized> {
    const active = this.#activeCloseTransaction;
    if (!active || active.publicTransaction !== transaction) {
      throw new DocumentUnavailableError("Document close transaction authority is stale.", { retryable: false });
    }
    return active;
  }
}
