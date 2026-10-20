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
import type { CommandSystem } from "../Commands/commandTypes";
import type { OperationCoordinator } from "../Operations";
import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";
import type { RuntimeDisposalPreparation, RuntimeDisposalPrepareContext } from "../Runtime/disposalTypes";
import type { UndoManagerRegistry } from "../Undo";
import {
  ApplicationDocument,
  type ApplicationDocumentCloseTransaction,
  type ApplicationDocumentSnapshot,
} from "./ApplicationDocument";
import {
  DocumentAbortError,
  DocumentAdapterAmbiguousError,
  DocumentAdapterUnavailableError,
  DocumentDestinationConflictError,
  DocumentError,
  DocumentLocationAlreadyOpenError,
  DocumentLocationRequiredError,
  DocumentNotFoundError,
  DocumentPresentationCloseContractError,
  DocumentCloseTransactionUnavailableError,
  DocumentRequestedIdConflictError,
  DocumentRecoveryCorruptError,
  DocumentRecoveryMissingError,
  DocumentRecoveryUnavailableError,
  DocumentReadOnlyError,
  DocumentSameLocationMoveError,
  DocumentSchemaError,
  DocumentSourceRemovalError,
  DocumentUnavailableError,
  DocumentVersionConflictError,
  DocumentWriteOutcomeUnknownError,
} from "./DocumentErrors";
import type { DocumentRecoveryStore } from "./DocumentRecoveryStore";
import { canonicalDocumentContentHash, type DocumentRecoveryRecord } from "./DocumentRecoveryStore";
import type { DocumentPresentationCloseCoordinator } from "./DocumentPresentationCloseCoordinator";
import { DocumentTypeRegistry } from "./DocumentTypeRegistry";
import { documentAdoptionAuthority } from "./documentAdoptionAuthority";
import { documentProjectionAuthority } from "./documentProjectionAuthority";
import {
  canonicalDocumentJson,
  canonicalDocumentLocation,
  type ApplicationSessionCloseLease,
  type ApplicationSessionMutationTicket,
  documentVersionsEqual,
  type CloseAllDocumentsResult,
  type DocumentClosePreparation,
  type DocumentCloseSetPreparation,
  type DocumentCloseReason,
  type DocumentCloseResult,
  type DocumentCloseReviewer,
  type DocumentCloseReviewerRegistration,
  type DocumentConflictReviewDecision,
  type DocumentConflictReviewer,
  type DocumentConflictReviewerRegistration,
  type DocumentDestinationConflictPolicy,
  type DocumentLocation,
  type DocumentPresentationCloseCoordinatorRegistration,
  type DocumentPresentationClosePreparation,
  type DocumentPresentationCloseSetPreparation,
  type DocumentReferenceLease,
  type DocumentRuntimeEnvironment,
  type DocumentSaveDestinationProvider,
  type DocumentSaveDestinationProviderRegistration,
  type DocumentType,
  type DocumentTypeRegistration,
  type ImportDocumentRequest,
  type MoveDocumentRequest,
  type MoveDocumentResult,
  type NewDocumentRequest,
  type NewProjectionDocumentRequest,
  type OpenDocumentRequest,
  type RecentDocument,
  type SaveAsDocumentRequest,
  type SaveAsDocumentResult,
  type SaveDocumentOptions,
} from "./documentTypes";
import type { DocumentRecord, DocumentVersion, DocumentWindowAssociation } from "./documentTypes";
import { throwIfDocumentAborted } from "./Adapters/InMemoryDocumentAdapter";
import type { DocumentCloseStorageTransaction, DocumentStorageAdapter, DocumentWriteRequest } from "./Adapters/documentAdapterTypes";
import {
  validateDocumentRestorationSnapshot,
  type DocumentRestorationReport,
  type DocumentRestorationSnapshot,
  type RestorableDocument,
} from "./DocumentRestoration";
import type { DocumentAdapterRegistration } from "./Adapters/documentAdapterTypes";
import { settleBoundedDocumentCleanup } from "./Adapters/boundedDocumentCleanup";
import type { DocumentEditOptions, DocumentEditResult } from "./documentEditTypes";
import type { DocumentResourceLifecycle } from "./documentResourceLifecycle";
import { requireSettledDocumentEditing } from "./DocumentEditingParticipants";
import type { DocumentEditingLifetimeOptions, DocumentEditingParticipant, DocumentEditingParticipantRegistration, DocumentEditingReason, DocumentEditingSettlementResult } from "./documentEditingTypes";

export interface DocumentControllerDependencies {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly operations: OperationCoordinator;
  readonly commands: CommandSystem;
  readonly undo: UndoManagerRegistry;
  readonly recovery: DocumentRecoveryStore;
  readonly persistenceNamespace: string;
  readonly environment: DocumentRuntimeEnvironment;
  readonly observeError?: (error: unknown, context: string) => void;
  readonly resourceLifecycle?: (document: ApplicationDocument<unknown, unknown>, signal?: AbortSignal) => Promise<DocumentResourceLifecycle>;
  readonly transformAdapter?: (adapter: DocumentStorageAdapter) => DocumentStorageAdapter;
}


export type TerminalProviderOperationStatus = "pending" | "accepted" | "failed";
export type TerminalProviderResultStatus = "pending" | "available" | "unavailable";

export interface TerminalProviderOperationError {
  readonly name: string;
  readonly message: string;
}

export interface TerminalProviderOperationSnapshot<TState = unknown, TResult = unknown> {
  readonly serviceId: string;
  readonly receiptId: string;
  readonly applicationId: string;
  readonly documentId: string;
  readonly providerDocumentId: string;
  readonly operationKind: string;
  readonly operationIdentity: string;
  readonly providerStatus: TerminalProviderOperationStatus;
  readonly providerResultStatus: TerminalProviderResultStatus;
  readonly providerResult: TResult | null;
  readonly providerError: TerminalProviderOperationError | null;
  /** Live kernel truth, not an application-serialised compatibility marker. */
  readonly canonicalWriteOutcomeUnknown: boolean;
  readonly state: TState;
}

export interface TerminalProviderOperationExecution<TResult> {
  readonly promise: Promise<TResult>;
  releaseProviderLock(): boolean;
}

export interface ReserveTerminalProviderOperationRequest<TState, TResult> {
  readonly serviceId: string;
  readonly applicationId: string;
  readonly documentId: string;
  readonly providerDocumentId: string;
  readonly operationKind: string;
  readonly operationIdentity: string;
  readonly initialState: TState;
  /** A mounted facade supplies this before the irreversible provider call so
   * no sibling facade can adopt the just-reserved receipt re-entrantly. */
  readonly initialClaim: TerminalProviderOperationClaimRequest;
  execute(): TerminalProviderOperationExecution<TResult>;
}

export interface TerminalProviderOperationClaimRequest {
  readonly claimant: object;
  readonly windowControllerId: string | null;
}

export interface TerminalProviderOperationReceipt<TState = unknown, TResult = unknown> {
  readonly serviceId: string;
  readonly receiptId: string;
  readonly applicationId: string;
  readonly documentId: string;
  readonly providerDocumentId: string;
  readonly operationKind: string;
  readonly operationIdentity: string;
  snapshot(): TerminalProviderOperationSnapshot<TState, TResult>;
  waitForProvider(signal?: AbortSignal): Promise<TResult>;
  updateState(state: TState): TerminalProviderOperationSnapshot<TState, TResult>;
  documentSnapshot<TModel>(): ApplicationDocumentSnapshot<TModel>;
  synchronise<TModel>(transform: (current: Readonly<TModel>) => TModel): void;
  save(signal?: AbortSignal): Promise<void>;
  recoverWrite(signal?: AbortSignal): Promise<void>;
  close(reason: DocumentCloseReason, signal?: AbortSignal): Promise<DocumentCloseResult>;
  complete(): Promise<boolean>;
}

/** Internal runtime claim. AppSDK exposes its receipt only while this exact
 * claim generation remains current; receipt listings deliberately do not. */
export interface TerminalProviderOperationClaim<TState = unknown, TResult = unknown> {
  readonly receiptId: string;
  readonly documentId: string;
  readonly applicationId: string;
  readonly windowControllerId: string | null;
  readonly generation: number;
  readonly receipt: TerminalProviderOperationReceipt<TState, TResult>;
  release(): boolean;
}

// Runtime configuration and instance properties are declared in the canonical
// runtime type module; this controller only implements the document graph.

interface PreparedClose {
  readonly publicPreparation: Extract<DocumentClosePreparation, { status: "ready" }>;
  readonly document: ApplicationDocument<unknown, unknown>;
  readonly presentation: {
    readonly coordinator: DocumentPresentationCloseCoordinator;
    readonly preparation: Extract<DocumentPresentationClosePreparation, { status: "ready" }>;
  } | null;
  readonly signal?: AbortSignal;
  readonly terminalToken?: object;
  closeTransaction: {
    readonly application: ApplicationDocumentCloseTransaction;
    readonly storage: DocumentCloseStorageTransaction | null;
    readonly controller: PreparedCloseControllerTransaction;
    readonly adapter: DocumentStorageAdapter | null;
  } | null;
  settled: boolean;
}

interface PreparedCloseControllerTransaction {
  readonly locationOwners: readonly (readonly [string, string | null])[];
  readonly closedLocationOwners: readonly (readonly [string, string | null | undefined])[];
  readonly recentDocuments: readonly (readonly [string, RecentDocument | null])[];
  readonly reservedLocationKeys: readonly string[];
}

interface PreparedCloseSet {
  readonly publicPreparation: Extract<DocumentCloseSetPreparation, { status: "ready" }>;
  readonly preparations: readonly Extract<DocumentClosePreparation, { status: "ready" }>[];
  readonly presentation: {
    readonly coordinator: DocumentPresentationCloseCoordinator;
    readonly preparation: Extract<DocumentPresentationCloseSetPreparation, { status: "ready" }>;
  } | null;
  settled: boolean;
  committing: boolean;
  cancellation: Promise<void> | null;
}

interface OpeningDocument {
  readonly documentId: string;
  readonly typeId: string;
  readonly applicationId: string | null;
  readonly promise: Promise<ApplicationDocument<unknown, unknown>>;
}

interface RuntimeDisposalDocumentPreparation {
  readonly token: string;
  readonly document: ApplicationDocument<unknown, unknown>;
  readonly decision: "clean" | "save" | "discard";
  readonly saveTarget:
    | { readonly kind: "current-location" }
    | { readonly kind: "save-as"; readonly destination: DocumentLocation; readonly conflict?: DocumentDestinationConflictPolicy }
    | null;
  gateSettled: boolean;
  gateSettlement: Promise<void> | null;
}

interface ActiveRuntimeDisposalPreparation {
  readonly id: string;
  readonly documents: readonly RuntimeDisposalDocumentPreparation[];
  state: "ready" | "rolled-back" | "committed";
}

interface DocumentReferenceLeaseRecord {
  readonly lease: DocumentReferenceLease;
  readonly document: ApplicationDocument<unknown, unknown>;
  readonly owner: boolean;
  released: boolean;
  cleanupStarted: boolean;
}

interface IndeterminateSaveAsWrite {
  readonly document: ApplicationDocument<unknown, unknown>;
  readonly destination: DocumentLocation;
  readonly destinationKey: string;
  readonly adapter: DocumentStorageAdapter;
  readonly adapterGeneration: number;
  readonly request: DocumentWriteRequest<unknown>;
  readonly previousRecord: DocumentRecord<unknown> | null;
  readonly dirtyRevision: number;
  recoveredRecord: DocumentRecord<unknown> | null;
}

interface ActiveTerminalProviderOperation<TState = unknown, TResult = unknown> {
  readonly serviceId: string;
  readonly receiptId: string;
  readonly applicationId: string;
  readonly documentId: string;
  readonly providerDocumentId: string;
  readonly operationKind: string;
  readonly operationIdentity: string;
  readonly document: ApplicationDocument<unknown, unknown>;
  readonly terminalToken: object;
  providerStatus: TerminalProviderOperationStatus;
  providerResultStatus: TerminalProviderResultStatus;
  providerResult: TResult | null;
  providerError: TerminalProviderOperationError | null;
  state: TState;
  providerOutcome: Promise<TResult>;
  releaseProviderLock: () => boolean;
  clearPromise: Promise<boolean> | null;
  reservationSequence: number;
  claim: ActiveTerminalProviderOperationClaim<TState, TResult> | null;
}

interface ActiveTerminalProviderOperationClaim<TState = unknown, TResult = unknown> {
  readonly claimant: object;
  readonly applicationId: string;
  readonly document: ApplicationDocument<unknown, unknown>;
  readonly windowControllerId: string | null;
  readonly generation: number;
  readonly receipt: TerminalProviderOperationReceipt<TState, TResult>;
}

interface DeferredFinalOwnerCleanup {
  readonly document: ApplicationDocument<unknown, unknown>;
  readonly applicationId: string;
  readonly terminalToken: object | null;
  promise: Promise<void> | null;
}

function terminalProviderError(error: unknown): TerminalProviderOperationError {
  return Object.freeze({
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
  });
}

function sameLocation(left: DocumentLocation | null, right: DocumentLocation): boolean {
  return left !== null && canonicalDocumentLocation(left) === canonicalDocumentLocation(right);
}

/** A recovery endpoint is authoritative only for the adapter's idempotency
 * protocol. The controller still verifies the returned durable bytes before it
 * makes that record the document's saved base or attempts compensation. */
function recoveredSaveAsRecordMatchesRequest(
  record: DocumentRecord<unknown>,
  request: DocumentWriteRequest<unknown>,
): boolean {
  try {
    return canonicalDocumentLocation(record.location) === canonicalDocumentLocation(request.location) &&
      record.typeId === request.typeId &&
      record.schemaVersion === request.schemaVersion &&
      canonicalDocumentJson(record.content, request.typeId) === canonicalDocumentJson(request.content, request.typeId) &&
      canonicalDocumentJson(record.metadata, request.typeId) === canonicalDocumentJson(request.metadata ?? {}, request.typeId);
  } catch {
    return false;
  }
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function sameAssociations(left: readonly DocumentWindowAssociation[], right: readonly DocumentWindowAssociation[]): boolean {
  if (left.length !== right.length) return false;
  const expected = new Map(right.map(({ windowControllerId, role }) => [windowControllerId, role]));
  return left.every(({ windowControllerId, role }) => expected.get(windowControllerId) === role);
}

const projectionRequestFields = new Set(["documentId", "typeId", "applicationId", "initialModel", "activate", "signal"]);

/**
 * Strict shape gate for projection creation. The kernel accepts ownership
 * only through the validated `applicationId` channel (stamped by the app
 * facade, which rejects caller-supplied values first); everything else that
 * could smuggle persistence, kind escalation, or prototype pollution is
 * rejected here, before any admission ticket is consumed.
 */
function assertProjectionRequestShape(request: NewProjectionDocumentRequest<unknown>): void {
  if (!request || typeof request !== "object") throw new TypeError("Projection document requests must be plain data records.");
  const prototype = Object.getPrototypeOf(request);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Projection document requests must be plain data records.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(request);
  for (const field of Reflect.ownKeys(descriptors)) {
    if (typeof field !== "string") throw new TypeError("Projection document requests must not carry symbol fields.");
    if (!projectionRequestFields.has(field)) {
      throw new TypeError(`Projection document requests must not carry "${field}".`);
    }
    const descriptor = descriptors[field]!;
    if (!descriptor.enumerable) throw new TypeError(`Projection document request field "${field}" must be enumerable.`);
    if (!("value" in descriptor)) throw new TypeError(`Projection document request field "${field}" must be a data property.`);
  }
  if (!("initialModel" in descriptors) || descriptors.initialModel?.value === undefined) {
    throw new TypeError("Projection document requests require an own initialModel field.");
  }
  const stringField = (field: "documentId" | "typeId" | "applicationId", required = false) => {
    const value = descriptors[field]?.value;
    if (value === undefined && !required) return;
    if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
      throw new TypeError(`Projection document request ${field} must be a non-empty canonical string.`);
    }
  };
  stringField("documentId");
  stringField("typeId", true);
  stringField("applicationId");
  if ("activate" in descriptors && typeof descriptors.activate?.value !== "boolean") {
    throw new TypeError("Projection document request activate must be boolean.");
  }
  if ("signal" in descriptors && descriptors.signal?.value !== undefined && !(descriptors.signal.value instanceof AbortSignal)) {
    throw new TypeError("Projection document request signal must be an AbortSignal.");
  }
}

function sourceRemovalError(location: DocumentLocation, error: unknown): DocumentSourceRemovalError {
  return new DocumentSourceRemovalError(location, error);
}

function awaitDocumentSignal<T>(value: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return value;
  throwIfDocumentAborted(signal);
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
    value.then(
      (result) => finish(() => resolve(result)),
      (error) => finish(() => reject(error)),
    );
  });
}

export class DocumentController {
  readonly #types = new DocumentTypeRegistry();
  readonly #adapters = new Map<string, DocumentStorageAdapter>();
  readonly #adapterGenerations = new Map<string, number>();
  #nextAdapterGeneration = 0;
  readonly #documents = new Map<string, ApplicationDocument<unknown, unknown>>();
  readonly #documentIdsByLocation = new Map<string, string>();
  /** Durable-in-runtime ownership memory for closed application documents.
   * A location must not become an ambient adoption oracle merely because its
   * live controller was removed during close. */
  readonly #closedLocationOwners = new Map<string, string | null>();
  readonly #reservedLocations = new Map<string, string>();
  readonly #reservedDocumentIds = new Set<string>();
  readonly #recentDocuments = new Map<string, RecentDocument>();
  readonly #subscriptions = new Map<string, () => void>();
  readonly #listeners = new Set<() => void>();
  readonly #preparedCloses = new Map<string, PreparedClose>();
  readonly #preparedCloseSets = new Map<string, PreparedCloseSet>();
  readonly #activationOrder: string[] = [];
  readonly #openingDocuments = new Map<string, OpeningDocument>();
  readonly #applicationEpochs = new Map<string, number>();
  readonly #applicationCloseLeases = new Map<string, ApplicationSessionCloseLease>();
  readonly #applicationAdmissions = new Map<string, Set<Promise<unknown>>>();
  readonly #closeCleanupsByDocumentId = new Map<string, Promise<void>>();
  readonly #documentRelocations = new Set<string>();
  readonly #indeterminateSaveAsWrites = new Map<string, IndeterminateSaveAsWrite>();
  readonly #documentReferenceLeases = new Map<DocumentReferenceLease, DocumentReferenceLeaseRecord>();
  readonly #terminalProviderOperations = new Map<string, ActiveTerminalProviderOperation>();
  readonly #deferredFinalOwnerCleanups = new Map<ApplicationDocument<unknown, unknown>, DeferredFinalOwnerCleanup>();
  #documentReferenceGeneration = 0;
  #terminalProviderReservationSequence = 0;
  #terminalProviderClaimGeneration = 0;
  readonly #registrationGenerations = { close: 0, conflict: 0, destination: 0, presentation: 0 };
  #notificationSuppression = 0;
  #notificationPending = false;
  #closeReviewer: DocumentCloseReviewer | null = null;
  #conflictReviewer: DocumentConflictReviewer | null = null;
  #saveDestinationProvider: DocumentSaveDestinationProvider | null = null;
  #presentationCloseCoordinator: DocumentPresentationCloseCoordinator | null = null;
  #activeDocumentId: string | null = null;
  #runtimeDisposalPreparation: ActiveRuntimeDisposalPreparation | null = null;

  constructor(private readonly dependencies: DocumentControllerDependencies) {
    if (!dependencies.persistenceNamespace.trim()) throw new TypeError("Document persistence namespaces must not be empty.");
  }

  get openDocuments(): readonly ApplicationDocument<unknown, unknown>[] {
    return Object.freeze([...this.#documents.values()]);
  }

  get recentDocuments(): readonly RecentDocument[] {
    return Object.freeze([...this.#recentDocuments.values()]
      .sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt))
      .map((entry) => Object.freeze(structuredClone(entry))));
  }

  get activeDocumentId(): string | null { return this.#activeDocumentId; }
  get hasSaveDestinationProvider(): boolean { return this.#saveDestinationProvider !== null; }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    let disposed = false;
    return () => { if (disposed) return; disposed = true; this.#listeners.delete(listener); };
  }

  hasType(typeId: string): boolean { return this.#types.has(typeId); }
  isTypeAvailableToApplication(typeId: string, applicationId: string): boolean {
    if (!this.#types.has(typeId)) return false;
    const type = this.#types.require(typeId);
    const creating = type.creatingApplicationId;
    const opening = type.openingApplicationIds;
    if (!creating && !opening) return true;
    return normalizeBundleIdentifier(creating) === normalizeBundleIdentifier(applicationId) ||
      Boolean(opening?.some((owner) => normalizeBundleIdentifier(owner) === normalizeBundleIdentifier(applicationId)));
  }
  hasAdapter(adapterId: string): boolean { return this.#adapters.has(adapterId); }
  registerType<TModel, TSerialized = TModel>(type: DocumentType<TModel, TSerialized>): DocumentTypeRegistration {
    return this.#types.register(type);
  }

  registerAdapter(adapter: DocumentStorageAdapter): DocumentAdapterRegistration {
    if (!adapter.id.trim()) throw new TypeError("Document adapter IDs must not be empty.");
    if (this.#adapters.has(adapter.id)) throw new DocumentUnavailableError(`Document adapter "${adapter.id}" is already registered.`, { retryable: false });
    const originalId = adapter.id;
    adapter = this.dependencies.transformAdapter?.(adapter) ?? adapter;
    if (adapter.id !== originalId) throw new TypeError("Document adapter transforms must preserve the canonical adapter ID.");
    this.#adapters.set(adapter.id, adapter);
    const generation = ++this.#nextAdapterGeneration;
    this.#adapterGenerations.set(adapter.id, generation);
    let disposed = false;
    return { dispose: () => {
      if (disposed) return;
      disposed = true;
      if (this.#adapters.get(adapter.id) === adapter) this.#adapters.delete(adapter.id);
    } };
  }

  acquireDocumentReferenceLease(
    documentId: string,
    applicationId: string,
    kind: DocumentReferenceLease["kind"],
  ): DocumentReferenceLease {
    const document = this.#requireOpenDocument(documentId);
    if (normalizeBundleIdentifier(document.applicationId) !== normalizeBundleIdentifier(applicationId)) {
      throw new DocumentUnavailableError("A document reference lease may only be issued to its owning application.", { retryable: false });
    }
    const lease = Object.freeze({
      documentId,
      applicationId,
      kind,
      generation: ++this.#documentReferenceGeneration,
    }) satisfies DocumentReferenceLease;
    this.#documentReferenceLeases.set(lease, {
      lease,
      document,
      owner: kind === "owner",
      released: false,
      cleanupStarted: false,
    });
    return lease;
  }

  hasDocumentReferenceLease(lease: DocumentReferenceLease, kind?: DocumentReferenceLease["kind"]): boolean {
    const record = this.#documentReferenceLeases.get(lease);
    return Boolean(record && !record.released && (!kind || record.lease.kind === kind) &&
      this.#documents.get(record.document.id) === record.document &&
      normalizeBundleIdentifier(record.document.applicationId) === normalizeBundleIdentifier(record.lease.applicationId));
  }

  hasActiveDocumentOwnerLease(documentId: string, applicationId: string): boolean {
    return [...this.#documentReferenceLeases.values()].some((record) => !record.released && record.owner &&
      record.lease.documentId === documentId && normalizeBundleIdentifier(record.lease.applicationId) === normalizeBundleIdentifier(applicationId) &&
      this.#documents.get(record.document.id) === record.document);
  }

  async releaseDocumentReferenceLease(lease: DocumentReferenceLease, options: { readonly closeIfFinalOwner?: boolean } = {}): Promise<boolean> {
    const record = this.#documentReferenceLeases.get(lease);
    if (!record || record.released) return false;
    record.released = true;
    this.#documentReferenceLeases.delete(lease);
    if (!record.owner || !options.closeIfFinalOwner || this.hasActiveDocumentOwnerLease(lease.documentId, lease.applicationId)) return true;
    await this.#requestFinalOwnerCleanup(record.document, lease.applicationId);
    return true;
  }

  registerCloseReviewer(reviewer: DocumentCloseReviewer): DocumentCloseReviewerRegistration {
    return this.#replaceRegistration("close", reviewer);
  }

  registerConflictReviewer(reviewer: DocumentConflictReviewer): DocumentConflictReviewerRegistration {
    return this.#replaceRegistration("conflict", reviewer);
  }

  registerSaveDestinationProvider(provider: DocumentSaveDestinationProvider): DocumentSaveDestinationProviderRegistration {
    return this.#replaceRegistration("destination", provider);
  }

  registerPresentationCloseCoordinator(
    coordinator: DocumentPresentationCloseCoordinator,
  ): DocumentPresentationCloseCoordinatorRegistration {
    return this.#replaceRegistration("presentation", coordinator);
  }

  getDocument(documentId: string): ApplicationDocument<unknown, unknown> | null {
    return this.#documents.get(documentId) ?? null;
  }

  getTerminalProviderOperationSnapshot<TState = unknown, TResult = unknown>(
    applicationId: string,
    documentId: string,
  ): TerminalProviderOperationSnapshot<TState, TResult> | null {
    const record = this.#terminalProviderOperations.get(this.#terminalProviderOperationKey(applicationId, documentId));
    return record ? this.#terminalProviderOperationSnapshot(record) as TerminalProviderOperationSnapshot<TState, TResult> : null;
  }

  listTerminalProviderOperations<TState = unknown, TResult = unknown>(
    applicationId: string,
  ): readonly TerminalProviderOperationSnapshot<TState, TResult>[] {
    return Object.freeze([...this.#terminalProviderOperations.values()]
      .filter((record) => normalizeBundleIdentifier(record.applicationId) === normalizeBundleIdentifier(applicationId))
      .sort((left, right) => left.reservationSequence - right.reservationSequence)
      .map((record) => this.#terminalProviderOperationSnapshot(record) as TerminalProviderOperationSnapshot<TState, TResult>));
  }

  claimTerminalProviderOperation<TState = unknown, TResult = unknown>(
    applicationId: string,
    request: TerminalProviderOperationClaimRequest & { readonly serviceId: string; readonly preferredDocumentId?: string },
  ): TerminalProviderOperationClaim<TState, TResult> | null {
    const claimedApplicationId = applicationId.trim();
    if (!claimedApplicationId) throw new TypeError("Terminal provider operation application IDs must not be empty.");
    const serviceId = request.serviceId.trim();
    if (!serviceId) throw new TypeError("Terminal provider operation service IDs must not be empty.");
    if (!request.claimant || typeof request.claimant !== "object") {
      throw new TypeError("Terminal provider operation claims require a mounted claimant object.");
    }
    const preferredDocumentId = request.preferredDocumentId?.trim() || null;
    const candidates = [...this.#terminalProviderOperations.values()]
      .filter((record) => normalizeBundleIdentifier(record.applicationId) === normalizeBundleIdentifier(claimedApplicationId) && record.serviceId === serviceId && record.claim === null &&
        this.#documents.get(record.documentId) === record.document && normalizeBundleIdentifier(record.document.applicationId) === normalizeBundleIdentifier(claimedApplicationId))
      .sort((left, right) => {
        const leftPreferred = left.documentId === preferredDocumentId ? 0 : 1;
        const rightPreferred = right.documentId === preferredDocumentId ? 0 : 1;
        return leftPreferred - rightPreferred || left.reservationSequence - right.reservationSequence;
      });
    const record = candidates[0];
    return record
      ? this.#claimTerminalProviderOperationRecord(record as ActiveTerminalProviderOperation<TState, TResult>, request)
      : null;
  }

  reserveTerminalProviderOperation<TState, TResult>(
    request: ReserveTerminalProviderOperationRequest<TState, TResult>,
  ): TerminalProviderOperationClaim<TState, TResult> {
    const serviceId = request.serviceId.trim();
    const applicationId = request.applicationId.trim();
    const documentId = request.documentId.trim();
    const providerDocumentId = request.providerDocumentId.trim();
    const operationKind = request.operationKind.trim();
    const operationIdentity = request.operationIdentity.trim();
    if (!serviceId || !applicationId || !documentId || !providerDocumentId || !operationKind || !operationIdentity) {
      throw new TypeError("Terminal provider operation identities must not be empty.");
    }
    const document = this.#requireOpenDocument(documentId);
    if (normalizeBundleIdentifier(document.applicationId) !== normalizeBundleIdentifier(applicationId)) {
      throw new DocumentUnavailableError("A terminal provider operation may only reserve its owning application document.", { retryable: false });
    }
    const key = this.#terminalProviderOperationKey(applicationId, documentId);
    const existing = this.#terminalProviderOperations.get(key);
    if (existing) {
      if (existing.serviceId === serviceId && existing.providerDocumentId === providerDocumentId && existing.operationKind === operationKind &&
          existing.operationIdentity === operationIdentity && existing.document === document) {
        throw new DocumentUnavailableError(
          "The matching terminal provider operation is already claimed by a mounted facade.",
          { retryable: false },
        );
      }
      throw new DocumentUnavailableError(`Document "${documentId}" already has a terminal provider operation.`, { retryable: false });
    }

    if (!request.initialClaim || !request.initialClaim.claimant || typeof request.initialClaim.claimant !== "object") {
      throw new TypeError("Terminal provider operations require an initial mounted receipt claim.");
    }
    const initialState = structuredClone(request.initialState);
    const receiptId = `terminal-provider:${this.dependencies.environment.randomUUID()}`;
    const terminalToken = document.beginTerminalReconciliation(documentAdoptionAuthority);
    let record!: ActiveTerminalProviderOperation<TState, TResult>;
    record = {
      serviceId,
      receiptId,
      applicationId,
      documentId,
      providerDocumentId,
      operationKind,
      operationIdentity,
      document,
      terminalToken,
      providerStatus: "pending",
      providerResultStatus: "pending",
      providerResult: null,
      providerError: null,
      state: initialState,
      providerOutcome: Promise.resolve(undefined as TResult),
      releaseProviderLock: () => false,
      clearPromise: null,
      reservationSequence: ++this.#terminalProviderReservationSequence,
      claim: null,
    };
    this.#terminalProviderOperations.set(key, record as ActiveTerminalProviderOperation);
    const claim = this.#claimTerminalProviderOperationRecord(record, request.initialClaim);

    let execution: TerminalProviderOperationExecution<TResult>;
    try {
      execution = request.execute();
      record.releaseProviderLock = execution.releaseProviderLock;
    } catch (error) {
      execution = { promise: Promise.reject(error), releaseProviderLock: () => false };
    }
    record.providerOutcome = Promise.resolve(execution.promise).then(
      (result) => {
        let detached: TResult;
        try {
          detached = structuredClone(result);
        } catch (error) {
          if (this.#terminalProviderOperations.get(key) === record) {
            record.providerStatus = "accepted";
            record.providerResultStatus = "unavailable";
            record.providerResult = null;
            record.providerError = terminalProviderError(error);
            this.#emit();
          }
          throw new DocumentUnavailableError(
            "The provider accepted the terminal operation, but its result could not be detached.",
            { cause: error, retryable: false },
          );
        }
        if (this.#terminalProviderOperations.get(key) === record) {
          record.providerStatus = "accepted";
          record.providerResultStatus = "available";
          record.providerResult = detached;
          record.providerError = null;
          this.#emit();
        }
        return detached;
      },
      async (error) => {
        if (this.#terminalProviderOperations.get(key) === record) {
          record.providerStatus = "failed";
          record.providerResultStatus = "unavailable";
          record.providerResult = null;
          record.providerError = terminalProviderError(error);
          this.#emit();
          // Terminal admission may have fenced an already-started ordinary
          // write. Wait for that public handoff before deciding whether this
          // failed provider may release the only exact-recovery authority.
          await record.document.awaitTerminalWriteHandoff(record.terminalToken, documentAdoptionAuthority);
          if (this.#terminalProviderOperations.get(key) !== record) throw error;
          if (record.document.hasIndeterminateTerminalWrite) {
            if (record.claim === null) {
              void this.#recoverFailedTerminalProviderOperation(record).catch((caught) => {
                this.#reportError(caught, "terminal-provider-failed-write-recovery");
              });
            }
          } else {
            await this.#clearTerminalProviderOperation(record);
          }
        }
        throw error;
      },
    );
    void record.providerOutcome.catch(() => undefined);
    this.#emit();
    return claim;
  }

  applicationDocumentIds(applicationId: string): readonly string[] {
    return Object.freeze([...this.#documents.values()]
      .filter((document) => normalizeBundleIdentifier(document.applicationId) === normalizeBundleIdentifier(applicationId))
      .map(({ id }) => id));
  }

  captureApplicationMutation(applicationId: string | null | undefined): ApplicationSessionMutationTicket | null {
    if (applicationId === null || applicationId === undefined) return null;
    applicationId = applicationId.trim();
    if (!applicationId) throw new TypeError("Application IDs must not be empty.");
    this.assertApplicationAdmissionAllowed(applicationId);
    return Object.freeze({
      applicationId,
      epoch: this.#applicationEpochs.get(normalizeBundleIdentifier(applicationId)) ?? 0,
      token: `application-mutation:${this.dependencies.environment.randomUUID()}`,
    });
  }

  assertApplicationAdmissionAllowed(applicationId: string | null | undefined): void {
    if (applicationId === null || applicationId === undefined) return;
    applicationId = applicationId.trim();
    if (!applicationId) throw new TypeError("Application IDs must not be empty.");
    if (this.#applicationCloseLeases.has(normalizeBundleIdentifier(applicationId))) {
      throw new DocumentUnavailableError(`Application "${applicationId}" membership is reserved by close.`, { retryable: true });
    }
  }

  validateApplicationMutation(ticket: ApplicationSessionMutationTicket | null): void {
    if (!ticket) return;
    if (this.#applicationCloseLeases.has(normalizeBundleIdentifier(ticket.applicationId)) ||
        (this.#applicationEpochs.get(normalizeBundleIdentifier(ticket.applicationId)) ?? 0) !== ticket.epoch) {
      throw new DocumentUnavailableError(
        `Application "${ticket.applicationId}" membership changed while the operation was pending.`,
        { retryable: true },
      );
    }
  }

  advanceApplicationSessionEpoch(applicationId: string): void {
    applicationId = applicationId.trim();
    if (!applicationId) throw new TypeError("Application IDs must not be empty.");
    this.assertApplicationAdmissionAllowed(applicationId);
    this.#applicationEpochs.set(normalizeBundleIdentifier(applicationId), (this.#applicationEpochs.get(normalizeBundleIdentifier(applicationId)) ?? 0) + 1);
  }

  acquireApplicationCloseLease(applicationId: string): ApplicationSessionCloseLease {
    applicationId = applicationId.trim();
    if (!applicationId) throw new TypeError("Application IDs must not be empty.");
    if (this.#applicationCloseLeases.has(normalizeBundleIdentifier(applicationId))) {
      throw new DocumentUnavailableError(`Application "${applicationId}" already has a close in progress.`, { retryable: true });
    }
    const epoch = (this.#applicationEpochs.get(normalizeBundleIdentifier(applicationId)) ?? 0) + 1;
    this.#applicationEpochs.set(normalizeBundleIdentifier(applicationId), epoch);
    const lease = Object.freeze({
      applicationId,
      epoch,
      token: `application-close:${this.dependencies.environment.randomUUID()}`,
    });
    this.#applicationCloseLeases.set(normalizeBundleIdentifier(applicationId), lease);
    return lease;
  }

  async settleApplicationAdmissions(lease: ApplicationSessionCloseLease): Promise<void> {
    this.#requireApplicationCloseLease(lease);
    const pending = [...(this.#applicationAdmissions.get(normalizeBundleIdentifier(lease.applicationId)) ?? [])];
    if (pending.length > 0) await Promise.allSettled(pending);
    this.#requireApplicationCloseLease(lease);
  }

  validateApplicationCloseLease(
    lease: ApplicationSessionCloseLease,
    expectedDocumentIds: readonly string[],
  ): void {
    this.#requireApplicationCloseLease(lease);
    if (!sameStringSet(this.applicationDocumentIds(lease.applicationId), expectedDocumentIds)) {
      throw new DocumentUnavailableError("Application document membership changed during close.", { retryable: true });
    }
  }

  releaseApplicationCloseLease(lease: ApplicationSessionCloseLease): void {
    if (this.#applicationCloseLeases.get(normalizeBundleIdentifier(lease.applicationId)) === lease) {
      this.#applicationCloseLeases.delete(normalizeBundleIdentifier(lease.applicationId));
    }
  }

  activateDocument(documentId: string): void {
    this.#requireOpenDocument(documentId);
    this.#activeDocumentId = documentId;
    const index = this.#activationOrder.indexOf(documentId);
    if (index >= 0) this.#activationOrder.splice(index, 1);
    this.#activationOrder.push(documentId);
    this.#emit();
  }

  associateWindow(documentId: string, association: DocumentWindowAssociation): void {
    this.#requireOpenDocument(documentId).associateWindow(association);
  }

  dissociateWindow(documentId: string, windowControllerId: string): void {
    const document = this.#requireOpenDocument(documentId);
    document.dissociateWindow(windowControllerId);
    // A window-pinned final-owner cleanup resumes when its last window goes
    // away; without this the document would leak after outliving its owners.
    const deferred = this.#deferredFinalOwnerCleanups.get(document);
    if (deferred && !deferred.promise && document.windowControllerIds.length === 0) {
      void this.#requestFinalOwnerCleanup(document, deferred.applicationId);
    }
  }

  async newDocument<TModel, TSerialized = TModel>(
    request: NewDocumentRequest<TModel>,
  ): Promise<ApplicationDocument<TModel, TSerialized>> {
    const ticket = this.captureApplicationMutation(request.applicationId);
    return this.#trackApplicationAdmission(ticket, this.#operate(
      "documents.new",
      request,
      request.signal,
      () => this.#newDocumentCore<TModel, TSerialized>(request, ticket),
    ));
  }

  /**
   * Mints a read-only, non-dirty projection document. The path itself is the
   * declaration: there is no kind flag for callers to set, no location to
   * save to, and no markUnsaved — the document is born clean with
   * dirtyRevision 0 and stays that way because every mutation path rejects
   * the projection kind.
   */
  async newProjectionDocument<TModel, TSerialized = TModel>(
    request: NewProjectionDocumentRequest<TModel>,
  ): Promise<ApplicationDocument<TModel, TSerialized>> {
    assertProjectionRequestShape(request);
    const ticket = this.captureApplicationMutation(request.applicationId);
    return this.#trackApplicationAdmission(ticket, this.#operate(
      "documents.new-projection",
      request,
      request.signal,
      () => this.#newProjectionCore<TModel, TSerialized>(request, ticket),
    ));
  }

  async openDocument<TModel, TSerialized = TModel>(
    request: OpenDocumentRequest,
  ): Promise<ApplicationDocument<TModel, TSerialized>> {
    const locationKey = canonicalDocumentLocation(request.location);
    const liveOwner = this.#documents.get(this.#documentIdsByLocation.get(locationKey) ?? "")?.applicationId;
    const closedOwner = this.#closedLocationOwners.get(locationKey);
    if (this.#closedLocationOwners.has(locationKey) && request.applicationId && normalizeBundleIdentifier(closedOwner) !== normalizeBundleIdentifier(request.applicationId)) {
      throw new DocumentUnavailableError("A closed document location is owned by another application.", { retryable: false });
    }
    const ticket = this.captureApplicationMutation(
      request.applicationId ?? liveOwner ?? closedOwner ?? this.#openingDocuments.get(locationKey)?.applicationId,
    );
    return this.#trackApplicationAdmission(ticket, this.#operate(
      "documents.open",
      request,
      request.signal,
      () => this.#openDocumentCore<TModel, TSerialized>(request, ticket),
    ));
  }

  async importDocument<TModel, TSerialized = TModel>(
    request: ImportDocumentRequest<TSerialized>,
  ): Promise<ApplicationDocument<TModel, TSerialized>> {
    const ticket = this.captureApplicationMutation(request.applicationId);
    return this.#trackApplicationAdmission(ticket, this.#operate("documents.import", request, request.signal, async () => {
      throwIfDocumentAborted(request.signal);
      const typeAdmission = this.#types.admission(request.typeId);
      const type = typeAdmission.type as DocumentType<TModel, TSerialized>;
      const serialized = await request.decode(request.source, { typeId: type.id, schemaVersion: type.schemaVersion });
      throwIfDocumentAborted(request.signal);
      if (!this.#types.isCurrent(typeAdmission)) throw new DocumentAbortError("The document import admission became stale during decoding.");
      if (!type.validate(serialized)) throw new DocumentSchemaError(type.id);
      const model = type.read(serialized, { typeId: type.id, schemaVersion: type.schemaVersion });
      const document = await this.#newDocumentCore<TModel, TSerialized>({
        typeId: request.typeId,
        applicationId: request.applicationId,
        initialModel: model,
        activate: request.activate,
        signal: request.signal,
      }, ticket);
      try {
        await this.#saveAsCore({ documentId: document.id, destination: request.destination, signal: request.signal });
        return document;
      } catch (error) {
        await document.prepareToClose().catch(() => undefined);
        this.#commitDocumentStructuralClose(document)();
        throw error;
      }
    }));
  }

  async duplicateDocument(
    documentId: string,
    location: DocumentLocation,
  ): Promise<ApplicationDocument<unknown, unknown>> {
    const source = this.#requireOpenDocument(documentId);
    // Duplicating a projection would mint a writable copy of read-only data.
    if (source.documentKind === "projection") throw new DocumentReadOnlyError(`Document "${source.id}" is a read-only projection.`);
    const ticket = this.captureApplicationMutation(source.applicationId);
    return this.#trackApplicationAdmission(ticket, this.#operate("documents.duplicate", { documentId, location }, undefined, async () => {
      const duplicate = await this.#newDocumentCore({
        typeId: source.type.id,
        applicationId: source.applicationId ?? undefined,
        initialModel: source.model,
      }, ticket);
      try {
        await this.#saveAsCore({ documentId: duplicate.id, destination: location });
        return duplicate;
      } catch (error) {
        await duplicate.prepareToClose().catch(() => undefined);
        this.#commitDocumentStructuralClose(duplicate)();
        throw error;
      }
    }));
  }

  async reopenDocument(recentDocumentId: string): Promise<ApplicationDocument<unknown, unknown>> {
    return this.#operate("documents.reopen", { recentDocumentId }, undefined, () => {
      const recent = this.#recentDocuments.get(recentDocumentId);
      if (!recent) throw new DocumentNotFoundError({ kind: "memory", namespace: "recent", key: recentDocumentId });
      return this.#openDocumentCore({ typeId: recent.typeId, location: recent.location });
    });
  }

  async saveDocument(documentId: string, options: SaveDocumentOptions = { reason: "explicit" }): Promise<void> {
    if (this.#requireOpenDocument(documentId).hasTerminalReconciliationLease) {
      throw new DocumentUnavailableError(`Document "${documentId}" has an active terminal reconciliation lease.`, { retryable: false });
    }
    return this.#operate("documents.save", { documentId, options }, options.signal, () => this.#saveDocumentCore(documentId, options));
  }

  transactDocument<TModel>(documentId: string, transform: (current: Readonly<TModel>) => TModel, options: DocumentEditOptions<TModel>, admission?: import("./documentEditAdmission").DocumentEditAdmission): DocumentEditResult {
    const document = this.#documents.get(documentId) as ApplicationDocument<TModel> | undefined;
    if (!document) return Object.freeze({ status: "rejected", documentId, reason: "unavailable", error: new DocumentUnavailableError(`Document "${documentId}" is unavailable.`, { retryable: false }) });
    return document.transact(transform, options, admission);
  }

  registerEditingParticipant<TModel>(documentId: string, participant: DocumentEditingParticipant<TModel>, options?: DocumentEditingLifetimeOptions, admission?: import("./documentEditAdmission").DocumentEditAdmission): DocumentEditingParticipantRegistration {
    return (this.#requireOpenDocument(documentId) as ApplicationDocument<TModel>).registerEditingParticipant(participant, options, admission);
  }

  settleEditing(documentId: string, reason: DocumentEditingReason, signal?: AbortSignal): Promise<DocumentEditingSettlementResult> {
    const document = this.#documents.get(documentId);
    return document ? document.settleEditing(reason, signal) : Promise.resolve(Object.freeze({ status: "revoked", documentId, reason, revocationReason: "document-revoked", settledParticipantIds: Object.freeze([]) }));
  }

  discardEditing(documentId: string, reason: DocumentEditingReason, signal?: AbortSignal): Promise<DocumentEditingSettlementResult> {
    const document = this.#documents.get(documentId);
    return document ? document.discardEditing(reason, signal) : Promise.resolve(Object.freeze({ status: "revoked", documentId, reason, revocationReason: "document-revoked", settledParticipantIds: Object.freeze([]) }));
  }

  async closeTerminalReconciliation(
    documentId: string,
    token: object,
    reason: DocumentCloseReason,
    signal?: AbortSignal,
  ): Promise<DocumentCloseResult> {
    const document = this.#requireOpenDocument(documentId);
    document.validateTerminalReconciliation(token, documentAdoptionAuthority);
    return this.#operate("documents.close.terminal-reconciliation", { documentId, reason }, signal, async () => {
      const preparation = await this.#prepareCloseCore(documentId, reason, signal, { terminalToken: token });
      if (preparation.status === "cancelled") return { outcome: "cancelled", documentId };
      if (preparation.status === "refused") return { outcome: "refused", documentId, reason: preparation.reason };
      try { return await this.#commitCloseCore(preparation); }
      catch (error) { this.cancelCloseDocument(preparation); throw error; }
    });
  }

  async saveAsDocument(request: SaveAsDocumentRequest): Promise<SaveAsDocumentResult> {
    const document = this.#requireOpenDocument(request.documentId);
    const ticket = this.captureApplicationMutation(document.applicationId);
    return this.#trackApplicationAdmission(ticket, this.#operate("documents.save-as", request, request.signal, () => this.#saveAsCore(request, undefined, undefined, ticket)));
  }

  async moveDocument(request: MoveDocumentRequest): Promise<MoveDocumentResult> {
    return this.#operate("documents.move", request, request.signal, async () => {
      const document = this.#requireOpenDocument(request.documentId);
      // A projection has no location to move from; reject with the semantic
      // error before the location check so callers see *why* it is refused.
      if (document.documentKind === "projection") throw new DocumentReadOnlyError(`Document "${document.id}" is a read-only projection.`);
      const source = document.location;
      if (!source) throw new DocumentLocationRequiredError(document.id);
      if (sameLocation(source, request.destination)) {
        throw new DocumentSameLocationMoveError(source, request.destination);
      }
      const sourceAdapter = this.#resolveAdapter(source);
      const result = await this.#saveAsCore(request);
      try {
        await sourceAdapter.remove(source, request.expectedSourceVersion, { signal: request.signal });
        this.#recentDocuments.delete(canonicalDocumentLocation(source));
        this.#emit();
        return { ...result, outcome: "moved" };
      } catch (error) {
        return { ...result, outcome: "copied-source-retained", sourceRemovalError: sourceRemovalError(source, error) };
      }
    });
  }

  async revertDocument(documentId: string, version?: DocumentVersion, signal?: AbortSignal): Promise<void> {
    return this.#operate("documents.revert", { documentId, version }, signal, () => this.#requireOpenDocument(documentId).revert(version, signal));
  }

  async restoreVersion(documentId: string, version: DocumentVersion, signal?: AbortSignal): Promise<void> {
    return this.#operate(
      "documents.restore-version",
      { documentId, version },
      signal,
      () => this.#requireOpenDocument(documentId).restoreVersion(version, signal),
    );
  }

  async prepareCloseDocument(
    documentId: string,
    reason: DocumentCloseReason,
    signal?: AbortSignal,
  ): Promise<DocumentClosePreparation> {
    return this.#operate("documents.close.prepare", { documentId, reason }, signal, () => this.#prepareCloseCore(documentId, reason, signal));
  }

  async commitCloseDocument(
    preparation: Extract<DocumentClosePreparation, { status: "ready" }>,
  ): Promise<DocumentCloseResult> {
    return this.#operate("documents.close.commit", preparation, undefined, () => this.#commitCloseCore(preparation));
  }

  cancelCloseDocument(preparation: Extract<DocumentClosePreparation, { status: "ready" }>): void {
    const prepared = this.#preparedCloses.get(preparation.token);
    if (!prepared || prepared.publicPreparation !== preparation || prepared.settled) return;
    this.#rollbackPrepared(prepared);
  }

  async prepareCloseDocuments(
    documentIds: readonly string[],
    reason: DocumentCloseReason,
    signal?: AbortSignal,
    presentationRootIds?: readonly string[],
  ): Promise<DocumentCloseSetPreparation> {
    return this.#operate(
      "documents.close-set.prepare",
      { documentIds: Object.freeze([...documentIds]), reason },
      signal,
      () => this.#prepareCloseSetCore(documentIds, reason, signal, presentationRootIds),
    );
  }

  validateCloseDocuments(preparation: Extract<DocumentCloseSetPreparation, { status: "ready" }>): void {
    const prepared = this.#requirePreparedSet(preparation);
    for (const member of prepared.preparations) {
      const exact = this.#requirePrepared(member);
      if (this.#documents.get(member.documentId) !== exact.document) {
        throw new DocumentPresentationCloseContractError("A selected document close preparation is stale.");
      }
      exact.document.assertCloseGate(member.token, documentAdoptionAuthority, exact.terminalToken);
      if (exact.document.dirtyRevision !== member.dirtyRevision) {
        throw new DocumentPresentationCloseContractError("A selected document changed after close preparation.");
      }
    }
    if (prepared.presentation) {
      const validate = prepared.presentation.coordinator.validateCloseSet;
      if (!validate) throw new DocumentPresentationCloseContractError("The presentation coordinator cannot validate selected closes.");
      validate.call(prepared.presentation.coordinator, prepared.presentation.preparation);
    }
  }

  async settleClosedDocuments(documentIds: readonly string[]): Promise<void> {
    const cleanups = documentIds.map((documentId) => ({
      documentId,
      cleanup: this.#closeCleanupsByDocumentId.get(documentId),
    })).filter((entry): entry is { documentId: string; cleanup: Promise<void> } => Boolean(entry.cleanup));
    await Promise.all(cleanups.map(({ cleanup }) => cleanup));
    for (const { documentId, cleanup } of cleanups) {
      if (this.#closeCleanupsByDocumentId.get(documentId) === cleanup) {
        this.#closeCleanupsByDocumentId.delete(documentId);
      }
    }
  }

  commitCloseDocuments(
    preparation: Extract<DocumentCloseSetPreparation, { status: "ready" }>,
  ): CloseAllDocumentsResult {
    const prepared = this.#requirePreparedSet(preparation);
    this.validateCloseDocuments(preparation);
    const exactMembers = prepared.preparations.map((member) => this.#requirePrepared(member));
    let commitCount = 0;
    let callbackLive = true;
    const documentPublications: Array<() => void> = [];
    // Consume the public set token before entering presentation-owned code.
    // Individual document gates stay installed until the exact synchronous
    // structural callback runs, so re-entrant cancellation cannot reopen the
    // documents between validation and commit.
    prepared.committing = true;
    const releaseUncommittedMembers = () => {
      prepared.committing = false;
    };
    const commitDocuments = () => {
      if (!callbackLive) throw new DocumentPresentationCloseContractError("The selected close callback is no longer live.");
      commitCount += 1;
      if (commitCount !== 1) throw new DocumentPresentationCloseContractError();
      for (const member of prepared.preparations) {
        const exact = this.#preparedCloses.get(member.token);
        if (exact) exact.settled = true;
        this.#preparedCloses.delete(member.token);
      }
      for (const member of prepared.preparations) {
        const document = this.#documents.get(member.documentId);
        if (document) documentPublications.push(this.#commitDocumentStructuralClose(document));
      }
    };
    let postCallbackError: unknown = null;
    try {
      if (prepared.presentation) {
        const commit = prepared.presentation.coordinator.commitCloseSet;
        if (!commit) throw new DocumentPresentationCloseContractError("The presentation coordinator cannot commit selected closes.");
        commit.call(prepared.presentation.coordinator, prepared.presentation.preparation, commitDocuments);
      } else {
        commitDocuments();
      }
    } catch (error) {
      callbackLive = false;
      if (commitCount === 0) {
        releaseUncommittedMembers();
        if (error instanceof DocumentPresentationCloseContractError) throw error;
        throw new DocumentPresentationCloseContractError(error instanceof Error ? error.message : undefined);
      }
      // The presentation owner has already invoked the one irreversible
      // structural callback. A later cleanup error cannot make that committed
      // state look rolled back or strand provider transaction authority.
      postCallbackError = error;
    }
    callbackLive = false;
    if (commitCount !== 1) {
      releaseUncommittedMembers();
      throw new DocumentPresentationCloseContractError();
    }
    prepared.settled = true;
    prepared.committing = false;
    this.#preparedCloseSets.delete(preparation.token);
    for (const exact of exactMembers) this.#commitPreparedCloseTransaction(exact);
    if (postCallbackError) this.#reportError(postCallbackError, "document-close-presentation-post-commit");
    // Presentation-owned structural publication happens inside commitCloseSet.
    // Publish each selected document only after that call returns so direct
    // ApplicationDocument subscribers and service observers all inspect the
    // complete document/window transaction.
    for (const publishDocument of documentPublications) publishDocument();
    this.#emit();
    return { outcome: "closed", closedDocumentIds: preparation.documentIds };
  }

  async cancelCloseDocuments(preparation: Extract<DocumentCloseSetPreparation, { status: "ready" }>): Promise<void> {
    const prepared = this.#preparedCloseSets.get(preparation.token);
    if (!prepared || prepared.publicPreparation !== preparation || prepared.settled) return;
    if (prepared.committing) return;
    if (!prepared.cancellation) {
      prepared.cancellation = this.#cancelPreparedCloseSet(prepared).catch((error) => {
        prepared.cancellation = null;
        throw error;
      });
    }
    return prepared.cancellation;
  }

  async #cancelPreparedCloseSet(prepared: PreparedCloseSet): Promise<void> {
    const rollbackErrors: unknown[] = [];
    for (const member of [...prepared.preparations].reverse()) {
      const exact = this.#preparedCloses.get(member.token);
      if (!exact) continue;
      try { await this.#rollbackPreparedCloseTransaction(exact); }
      catch (error) {
        rollbackErrors.push(error);
        this.#reportError(error, "document-close-storage-rollback");
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(rollbackErrors, "Selected document close rollback failed.");
    }
    if (prepared.presentation) {
      try { prepared.presentation.coordinator.rollbackCloseSet?.(prepared.presentation.preparation); }
      catch (error) {
        this.#reportError(error, "document-close-presentation-rollback");
        throw error;
      }
    }
    prepared.settled = true;
    this.#preparedCloseSets.delete(prepared.publicPreparation.token);
    for (const member of [...prepared.preparations].reverse()) this.cancelCloseDocument(member);
  }

  async closeDocument(documentId: string, reason: DocumentCloseReason, signal?: AbortSignal): Promise<DocumentCloseResult> {
    return this.#closeDocumentCore(documentId, reason, signal);
  }

  async #closeDocumentCore(
    documentId: string,
    reason: DocumentCloseReason,
    signal?: AbortSignal,
    commitGuard?: () => boolean,
  ): Promise<DocumentCloseResult> {
    if (this.#requireOpenDocument(documentId).hasTerminalReconciliationLease) {
      throw new DocumentUnavailableError(`Document "${documentId}" has an active terminal reconciliation lease.`, { retryable: false });
    }
    return this.#operate("documents.close", { documentId, reason }, signal, async () => {
      const preparation = await this.#prepareCloseCore(documentId, reason, signal);
      if (preparation.status === "cancelled") return { outcome: "cancelled", documentId };
      if (preparation.status === "refused") return { outcome: "refused", documentId, reason: preparation.reason };
      try {
        return await this.#commitCloseCore(preparation, commitGuard);
      } catch (error) {
        this.cancelCloseDocument(preparation);
        throw error;
      }
    });
  }

  /** Roll back an exact clean projection created solely for window
   * restoration before any window adopted it. This is kernel-only cleanup,
   * not an AppSDK capability. */
  discardRestorationProjection(documentId: string, applicationId: string): boolean {
    const document = this.#documents.get(documentId);
    if (!document || normalizeBundleIdentifier(document.applicationId) !== normalizeBundleIdentifier(applicationId) || document.documentKind !== "projection" ||
        document.state !== "clean" || document.hasUnsavedChanges || document.location !== null ||
        document.windowControllerIds.length > 0 || document.hasTerminalReconciliationLease ||
        this.hasActiveDocumentOwnerLease(documentId, applicationId)) return false;
    const publish = this.#commitDocumentStructuralClose(document);
    publish();
    this.#emit();
    return true;
  }

  async closeAll(reason: DocumentCloseReason, signal?: AbortSignal): Promise<CloseAllDocumentsResult> {
    return this.#operate("documents.close-all", { reason }, signal, async () => {
      const ordered = [...this.#activationOrder].reverse()
        .map((id) => this.#documents.get(id))
        .filter((document): document is ApplicationDocument<unknown, unknown> => Boolean(document));
      for (const document of this.#documents.values()) if (!ordered.includes(document)) ordered.push(document);
      const documentIds = Object.freeze(ordered.map(({ id }) => id));
      if (documentIds.length === 0) return { outcome: "closed", closedDocumentIds: documentIds };

      const preparation = await this.#prepareCloseSetCore(documentIds, reason, signal);
      if (preparation.status !== "ready") {
        const remainingDocumentIds = this.openDocuments.map(({ id }) => id);
        if (preparation.status === "refused") {
          return {
            outcome: "refused",
            refusedDocumentId: preparation.documentId,
            reason: preparation.reason,
            closedDocumentIds: [] as const,
            remainingDocumentIds,
          };
        }
        return {
          outcome: "cancelled",
          cancelledDocumentId: preparation.documentId,
          closedDocumentIds: [] as readonly string[],
          remainingDocumentIds,
        };
      }
      try {
        const result = this.commitCloseDocuments(preparation);
        await this.settleClosedDocuments(preparation.documentIds);
        return result;
      } catch (error) {
        await this.cancelCloseDocuments(preparation);
        throw error;
      }
    });
  }

  async reviewConflict(documentId: string): Promise<DocumentConflictReviewDecision> {
    return this.#operate("documents.conflict.review", { documentId }, undefined, async () => {
      const document = this.#requireOpenDocument(documentId);
      document.assertControllerOperation(documentAdoptionAuthority);
      const conflict = document.conflict;
      if (!conflict || !this.#conflictReviewer) return { kind: "cancel" };
      const decision = await this.#conflictReviewer.review({
        documentId,
        displayName: document.type.displayName,
        conflict,
        availableDecisions: conflict.remoteState === "read-only"
          ? ["use-remote", "cancel"]
          : conflict.remote === null
          ? ["recreate", "use-remote", "cancel"]
          : ["use-local", "use-remote", "merge", "cancel"],
      });
      if (decision.kind !== "cancel") await document.resolveConflict(decision);
      return decision;
    });
  }

  async chooseSaveDestination(
    documentId: string,
    reason: "save" | "save-as" | "move",
    signal?: AbortSignal,
  ): Promise<{ readonly destination: DocumentLocation; readonly conflict?: DocumentDestinationConflictPolicy } | null> {
    throwIfDocumentAborted(signal);
    const document = this.#requireOpenDocument(documentId);
    document.assertControllerOperation(documentAdoptionAuthority);
    const provider = this.#saveDestinationProvider;
    if (!provider) return null;
    const selection = await awaitDocumentSignal(provider.chooseDestination({
      documentId,
      displayName: document.type.displayName,
      currentLocation: document.location,
      reason,
      signal,
    }), signal);
    throwIfDocumentAborted(signal);
    return selection ? structuredClone(selection) : null;
  }

  listDocumentVersions(documentId: string, signal?: AbortSignal): Promise<readonly DocumentVersion[]> {
    return this.#requireOpenDocument(documentId).listVersions(signal);
  }

  /** A saved version's model; the open document is left as it is. */
  readDocumentVersion<TModel>(documentId: string, version: DocumentVersion, signal?: AbortSignal): Promise<TModel> {
    return this.#requireOpenDocument(documentId).readVersion(version, signal) as Promise<TModel>;
  }

  async prepareRuntimeDisposal(context: RuntimeDisposalPrepareContext): Promise<RuntimeDisposalPreparation> {
    if (this.#runtimeDisposalPreparation?.state === "ready") {
      return { status: "cancelled", reason: "document-disposal-already-prepared" };
    }
    const ordered = [...this.#activationOrder].reverse()
      .map((id) => this.#documents.get(id))
      .filter((document): document is ApplicationDocument<unknown, unknown> => Boolean(document));
    for (const document of this.#documents.values()) if (!ordered.includes(document)) ordered.push(document);
    const preparationId = `document-runtime-disposal:${this.dependencies.environment.randomUUID()}`;
    const prepared: RuntimeDisposalDocumentPreparation[] = [];
    const releaseGates = () => {
      for (const entry of [...prepared].reverse()) {
        // Cancellation restores mutation admission immediately. The generation
        // installed by beginRuntimeDisposalGate still fences any late save and
        // forces its backend result through reconciliation.
        entry.document.endRuntimeDisposalGate(entry.token, documentAdoptionAuthority);
      }
    };

    try {
      // Settle the entire selected membership before any gate rejects editing.
      for (const document of ordered) if (document.hasEditingParticipants) {
        const settlement = await document.settleEditing("close", context.preparationSignal);
        if (settlement.status !== "settled") return { status: "cancelled", reason: `document-editing-${settlement.status}:${document.id}` };
      }
      for (const document of ordered) {
        throwIfDocumentAborted(context.preparationSignal);
        const token = `${preparationId}:${document.id}`;
        const entry: RuntimeDisposalDocumentPreparation = {
          token,
          document,
          decision: "clean",
          saveTarget: null,
          gateSettled: false,
          gateSettlement: null,
        };
        prepared.push(entry);
        entry.gateSettlement = document.beginRuntimeDisposalGate(
          token,
          documentAdoptionAuthority,
          context.preparationSignal,
        ).finally(() => { entry.gateSettled = true; });
        await awaitDocumentSignal(
          entry.gateSettlement,
          context.preparationSignal,
        );
      }

      for (let index = 0; index < prepared.length; index += 1) {
        throwIfDocumentAborted(context.preparationSignal);
        const entry = prepared[index]!;
        const document = entry.document;
        if (!document.hasUnsavedChanges) continue;
        if (document.documentKind === "projection") {
          // Invariant failure, never a discard: a healthy projection is
          // clean and skips review above. A dirty or conflicted projection
          // means a mutation guard failed somewhere upstream, so refuse the
          // whole close and say so — silently discarding would hide data loss.
          this.#reportError(
            new DocumentReadOnlyError(`Projection document "${document.id}" reached close with unsaved changes.`),
            `documents.close.projection-dirty:${document.id}`,
          );
          releaseGates();
          return { status: "cancelled", reason: `document-close-cancelled:${document.id}` };
        }
        const reviewer = this.#closeReviewer;
        const decision = reviewer
          ? await awaitDocumentSignal(reviewer.review({
              documentId: document.id,
              displayName: document.type.displayName,
              reason: "runtime-dispose",
              hasRecoverableAutosave: document.hasRecoverableAutosave,
              signal: context.preparationSignal,
            }), context.preparationSignal)
          : "cancel";
        throwIfDocumentAborted(context.preparationSignal);
        if (decision === "cancel") {
          releaseGates();
          return { status: "cancelled", reason: `document-close-cancelled:${document.id}` };
        }
        if (decision === "save" && document.state === "conflicted") {
          releaseGates();
          return { status: "cancelled", reason: `document-conflict-unresolved:${document.id}` };
        }
        let saveTarget: RuntimeDisposalDocumentPreparation["saveTarget"] = null;
        if (decision === "save") {
          if (document.location) {
            saveTarget = { kind: "current-location" };
          } else {
            const provider = this.#saveDestinationProvider;
            const selection = provider
              ? await awaitDocumentSignal(provider.chooseDestination({
                  documentId: document.id,
                  displayName: document.type.displayName,
                  currentLocation: null,
                  reason: "save",
                  signal: context.preparationSignal,
                }), context.preparationSignal)
              : null;
            throwIfDocumentAborted(context.preparationSignal);
            if (!selection) {
              releaseGates();
              return { status: "cancelled", reason: `document-save-destination-cancelled:${document.id}` };
            }
            saveTarget = { kind: "save-as", ...structuredClone(selection) };
          }
        }
        prepared[index] = { ...entry, decision, saveTarget };
      }

      for (const entry of prepared) {
        if (entry.decision !== "save" || !entry.saveTarget) continue;
        await awaitDocumentSignal(context.operations.run({
          id: `documents.save-before-disposal:${entry.document.id}`,
          execute: async (signal) => {
            if (entry.saveTarget?.kind === "current-location") {
              await entry.document.saveWithControllerAuthority(
                { reason: "close", signal },
                documentAdoptionAuthority,
                entry.token,
              );
            } else if (entry.saveTarget?.kind === "save-as") {
              await this.#saveAsCore({
                documentId: entry.document.id,
                destination: entry.saveTarget.destination,
                conflict: entry.saveTarget.conflict,
                signal,
              }, entry.token);
            }
          },
        }), context.preparationSignal);
      }
    } catch (error) {
      releaseGates();
      const reason = error instanceof DocumentError || error instanceof Error
        ? error.message
        : "Document disposal preparation failed.";
      return { status: "cancelled", reason };
    }

    const active: ActiveRuntimeDisposalPreparation = {
      id: preparationId,
      documents: Object.freeze([...prepared]),
      state: "ready",
    };
    this.#runtimeDisposalPreparation = active;
    return {
      status: "ready",
      rollback: () => {
        if (active.state !== "ready") return;
        active.state = "rolled-back";
        releaseGates();
        if (this.#runtimeDisposalPreparation === active) this.#runtimeDisposalPreparation = null;
      },
      commit: async () => {
        if (active.state === "committed") return;
        if (active.state !== "ready" || this.#runtimeDisposalPreparation !== active) {
          throw new DocumentUnavailableError("The document disposal preparation is stale.", { retryable: false });
        }
        if (!context.runtimeSignal.aborted) {
          throw new DocumentUnavailableError("Document disposal cannot commit before the runtime abort point.", { retryable: false });
        }
        active.state = "committed";
        const cleanupErrors: unknown[] = [];
        const cleanupTimers = {
          schedule: (callback: () => void, delayMs: number) =>
            this.dependencies.environment.setTimeout(callback, delayMs),
          cancel: (handle: unknown) => this.dependencies.environment.clearTimeout(handle),
        };
        const cleanupTimeoutMs = () => typeof context.deadlineAt === "number"
          ? Math.max(0, context.deadlineAt - this.dependencies.environment.now())
          : 1_000;
        for (const entry of active.documents) {
          if (this.#documents.get(entry.document.id) !== entry.document) continue;
          const error = await settleBoundedDocumentCleanup(
            `document ${entry.document.id} close preparation`,
            () => entry.document.prepareToClose({
              discardPendingSynchronisation: entry.decision === "discard",
            }),
            cleanupTimeoutMs(),
            cleanupTimers,
          );
          if (error) cleanupErrors.push(error);
          this.#commitDocumentStructuralClose(entry.document)();
        }
        for (const adapter of this.#adapters.values()) {
          if (!adapter.dispose) continue;
          const error = await settleBoundedDocumentCleanup(
            `adapter ${adapter.id} disposal`,
            () => adapter.dispose!(),
            cleanupTimeoutMs(),
            cleanupTimers,
          );
          if (error) cleanupErrors.push(error);
        }
        this.#adapters.clear();
        if (this.dependencies.recovery.dispose) {
          const error = await settleBoundedDocumentCleanup(
            "document recovery disposal",
            () => this.dependencies.recovery.dispose!(),
            cleanupTimeoutMs(),
            cleanupTimers,
          );
          if (error) cleanupErrors.push(error);
        }
        this.#closeReviewer = null;
        this.#conflictReviewer = null;
        this.#saveDestinationProvider = null;
        this.#presentationCloseCoordinator = null;
        this.#runtimeDisposalPreparation = null;
        this.#emit();
        if (cleanupErrors.length > 0) {
          throw new AggregateError(cleanupErrors, "Document runtime disposal encountered cleanup failures.");
        }
      },
    };
  }

  createRestorationSnapshot(): DocumentRestorationSnapshot {
    // Projections are never persisted: they carry no location, no unsaved
    // work, and no recovery record, and the restore path can only mint
    // standard documents. The owning application rematerialises its
    // projections from source data before its windows restore (Journal
    // does this for detached notes), so persisting them would only create a
    // kind-escalation surface — a restored "copy" would come back editable.
    const documents = this.openDocuments.filter((document) => document.documentKind === "standard").map((document): RestorableDocument => {
      const location = document.location;
      const baseVersion = document.currentVersion;
      const dirty = document.hasUnsavedChanges;
      let recovery: RestorableDocument["recovery"] = { kind: "none" };
      if (dirty) {
        const capture = document.captureForExternalSave(documentAdoptionAuthority, undefined, true);
        const hash = canonicalDocumentContentHash(capture.serializedContent);
        const durable = document.recoveryRecord;
        const durableMatches = durable !== null && durable.documentId === document.id &&
          durable.typeId === document.type.id && durable.typeSchemaVersion === document.type.schemaVersion &&
          durable.dirtyRevision === capture.dirtyRevision && durable.contentHash === hash &&
          this.#sameOptionalLocation(durable.location, location) &&
          this.#sameOptionalVersion(durable.baseVersion, baseVersion);
        if (durableMatches) {
          recovery = {
            kind: "record",
            recoveryId: durable.recoveryId,
            recoveryVersion: durable.recoveryVersion,
            dirtyRevision: durable.dirtyRevision,
            contentHash: durable.contentHash,
          };
        } else {
          const serialized = JSON.stringify(capture.serializedContent);
          if (new TextEncoder().encode(serialized).byteLength > 65_536) {
            throw new DocumentRecoveryUnavailableError(
              `Document "${document.id}" requires a matching durable recovery record before snapshotting.`,
            );
          }
          recovery = {
            kind: "inline",
            dirtyRevision: capture.dirtyRevision,
            serializedContent: structuredClone(capture.serializedContent),
            contentHash: hash,
            capturedAt: new Date(this.dependencies.environment.now()).toISOString(),
          };
        }
      }
      return Object.freeze({
        documentId: document.id,
        applicationId: document.applicationId,
        typeId: document.type.id,
        typeSchemaVersion: document.type.schemaVersion,
        location,
        baseVersion,
        recovery,
        windowAssociations: document.windowAssociations,
      });
    });
    return Object.freeze({
      schemaVersion: 1,
      activeDocumentId: this.#activeDocumentId,
      documents: Object.freeze(documents),
      recentLocations: Object.freeze(this.recentDocuments.map(({ location }) => structuredClone(location))),
      capturedAt: new Date(this.dependencies.environment.now()).toISOString(),
    });
  }

  async restoreSession(snapshot: DocumentRestorationSnapshot): Promise<DocumentRestorationReport> {
    return this.#operate("documents.restore-session", snapshot, undefined, async () => {
      validateDocumentRestorationSnapshot(snapshot);
      const outcomes: Array<{
        readonly documentId: string;
        readonly restored: boolean;
        readonly conflicted: boolean;
        readonly failure?: { readonly code: import("./DocumentErrors").DocumentErrorCode; readonly message: string };
      } | undefined> = new Array(snapshot.documents.length);
      let cursor = 0;
      const worker = async () => {
        while (true) {
          const index = cursor;
          cursor += 1;
          if (index >= snapshot.documents.length) return;
          const entry = snapshot.documents[index]!;
          try {
            const restored = await this.#restoreEntry(entry);
            outcomes[index] = { documentId: entry.documentId, restored: true, conflicted: restored.state === "conflicted" };
          } catch (error) {
            const documentError = error instanceof DocumentError
              ? error
              : new DocumentUnavailableError(error instanceof Error ? error.message : "Document restoration failed.", { cause: error, retryable: false });
            outcomes[index] = {
              documentId: entry.documentId,
              restored: false,
              conflicted: false,
              failure: { code: documentError.code, message: documentError.message },
            };
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, snapshot.documents.length) }, () => worker()));
      for (const location of snapshot.recentLocations) {
        const matching = snapshot.documents.find((entry) => entry.location && sameLocation(entry.location, location));
        if (matching) this.#touchRecent(matching.typeId, location);
      }
      if (snapshot.activeDocumentId && this.#documents.has(snapshot.activeDocumentId)) {
        this.activateDocument(snapshot.activeDocumentId);
      }
      const settled = outcomes.filter((outcome): outcome is NonNullable<typeof outcome> => Boolean(outcome));
      return Object.freeze({
        restoredDocumentIds: Object.freeze(settled.filter(({ restored }) => restored).map(({ documentId }) => documentId)),
        conflictedDocumentIds: Object.freeze(settled.filter(({ conflicted }) => conflicted).map(({ documentId }) => documentId)),
        failures: Object.freeze(settled.flatMap(({ documentId, failure }) => failure ? [{ documentId, ...failure }] : [])),
      });
    });
  }

  #restoreEntry(entry: RestorableDocument): Promise<ApplicationDocument<unknown, unknown>> {
    const ticket = this.captureApplicationMutation(entry.applicationId ?? null);
    return this.#trackApplicationAdmission(ticket, this.#restoreEntryCore(entry, ticket));
  }

  async #restoreEntryCore(
    entry: RestorableDocument,
    admissionTicket: ApplicationSessionMutationTicket | null,
  ): Promise<ApplicationDocument<unknown, unknown>> {
    this.validateApplicationMutation(admissionTicket);
    const existing = this.#documents.get(entry.documentId);
    if (existing) {
      if (normalizeBundleIdentifier(existing.applicationId) !== normalizeBundleIdentifier(entry.applicationId ?? null) ||
          existing.type.id !== entry.typeId ||
          !this.#sameOptionalLocation(existing.location, entry.location)) {
        throw new DocumentRequestedIdConflictError(entry.documentId);
      }
      for (const association of entry.windowAssociations) existing.associateWindow(association);
      return existing;
    }
    if (entry.location) {
      const locationOwner = this.#documentIdsByLocation.get(canonicalDocumentLocation(entry.location));
      if (locationOwner) throw new DocumentLocationAlreadyOpenError(entry.location, locationOwner);
    }
    const type = this.#types.require(entry.typeId);
    if (entry.typeSchemaVersion > type.schemaVersion) throw new DocumentSchemaError(entry.typeId, "Restoration content uses a future schema version.");
    if (entry.recovery.kind === "none") {
      if (!entry.location) {
        return this.#createCleanUntitledRestoration(entry, type, admissionTicket);
      }
      const document = await this.#openDocumentCore({
        documentId: entry.documentId,
        typeId: entry.typeId,
        applicationId: entry.applicationId ?? undefined,
        location: entry.location,
      }, admissionTicket);
      this.validateApplicationMutation(admissionTicket);
      for (const association of entry.windowAssociations) document.associateWindow(association);
      return document;
    }

    const recoveryRecord = entry.recovery.kind === "record"
      ? await this.#loadRecoveryRecord(entry)
      : null;
    this.validateApplicationMutation(admissionTicket);
    const serializedContent = entry.recovery.kind === "record"
      ? recoveryRecord!.serializedContent
      : entry.recovery.serializedContent;
    if (canonicalDocumentContentHash(serializedContent) !== entry.recovery.contentHash) {
      throw new DocumentRecoveryCorruptError(entry.recovery.kind === "record" ? entry.recovery.recoveryId : entry.documentId);
    }
    const model = this.#decodeRestoredModel(type, serializedContent, entry.typeSchemaVersion);
    const restoreBeforePublication = async (document: ApplicationDocument<unknown, unknown>) => {
      const preparation = await document.prepareResourceModel(model, documentAdoptionAuthority);
      try {
        this.validateApplicationMutation(admissionTicket);
        if (entry.recovery.kind === "none") throw new DocumentRecoveryCorruptError(entry.documentId);
        document.restoreRecoveredModel(model, entry.recovery.dirtyRevision, recoveryRecord, documentAdoptionAuthority);
      } finally { await preparation.release(); }
    };

    if (!entry.location) {
      const document = await this.#newDocumentCore({
        documentId: entry.documentId,
        typeId: entry.typeId,
        applicationId: entry.applicationId ?? undefined,
        initialModel: model,
        activate: false,
      }, admissionTicket, restoreBeforePublication);
      this.validateApplicationMutation(admissionTicket);
      for (const association of entry.windowAssociations) document.associateWindow(association);
      return document;
    }

    const adapter = this.#resolveAdapter(entry.location);
    const current = await adapter.read(entry.location);
    this.validateApplicationMutation(admissionTicket);
    if (!current && entry.baseVersion) throw new DocumentNotFoundError(entry.location);
    if (!current) {
      const document = await this.#newDocumentCore({
        documentId: entry.documentId,
        typeId: entry.typeId,
        applicationId: entry.applicationId ?? undefined,
        location: entry.location,
        initialModel: model,
        activate: false,
      }, admissionTicket, restoreBeforePublication);
      this.validateApplicationMutation(admissionTicket);
      for (const association of entry.windowAssociations) document.associateWindow(association);
      return document;
    }

    const document = await this.#openDocumentCore({
      documentId: entry.documentId,
      typeId: entry.typeId,
      applicationId: entry.applicationId ?? undefined,
      location: entry.location,
      activate: false,
    }, admissionTicket, async (document) => {
      await restoreBeforePublication(document);
      const openedRecord = document.lastSavedRecord;
      if (!openedRecord) throw new DocumentNotFoundError(entry.location!);
      if (!this.#sameOptionalVersion(openedRecord.version, entry.baseVersion)) {
        const base = entry.baseVersion ? await adapter.readVersion(entry.location!, entry.baseVersion) : null;
        this.validateApplicationMutation(admissionTicket);
        document.enterConflict({ base, localModel: document.model, remote: openedRecord });
      }
    });
    this.validateApplicationMutation(admissionTicket);
    this.validateApplicationMutation(admissionTicket);
    for (const association of entry.windowAssociations) document.associateWindow(association);
    return document;
  }

  async #loadRecoveryRecord(entry: RestorableDocument): Promise<DocumentRecoveryRecord> {
    if (entry.recovery.kind !== "record") throw new DocumentRecoveryCorruptError(entry.documentId);
    const record = await this.dependencies.recovery.read(entry.recovery.recoveryId);
    if (!record) throw new DocumentRecoveryMissingError(entry.recovery.recoveryId);
    const matches = record.schemaVersion === 1 && record.recoveryVersion === entry.recovery.recoveryVersion &&
      record.documentId === entry.documentId && record.typeId === entry.typeId &&
      record.typeSchemaVersion === entry.typeSchemaVersion && record.dirtyRevision === entry.recovery.dirtyRevision &&
      record.contentHash === entry.recovery.contentHash && this.#sameOptionalLocation(record.location, entry.location) &&
      this.#sameOptionalVersion(record.baseVersion, entry.baseVersion);
    if (!matches || canonicalDocumentContentHash(record.serializedContent) !== record.contentHash) {
      throw new DocumentRecoveryCorruptError(entry.recovery.recoveryId);
    }
    return record;
  }

  #decodeRestoredModel(
    type: DocumentType<unknown, unknown>,
    input: unknown,
    schemaVersion: number,
  ): unknown {
    return this.#types.decodeVersioned(type.id, input, schemaVersion);
  }

  async #createCleanUntitledRestoration(
    entry: RestorableDocument,
    type: DocumentType<unknown, unknown>,
    admissionTicket: ApplicationSessionMutationTicket | null,
  ): Promise<ApplicationDocument<unknown, unknown>> {
    this.#assertDocumentIdAvailable(entry.documentId);
    const undoManager = this.dependencies.undo.create({ kind: "document", id: entry.documentId });
    const document = ApplicationDocument.create({
      id: entry.documentId,
      applicationId: entry.applicationId ?? null,
      type,
      undoManager,
      recovery: this.dependencies.recovery,
      persistenceNamespace: this.dependencies.persistenceNamespace,
      environment: this.dependencies.environment,
      observeError: this.dependencies.observeError,
    });
    try {
      await this.#installResourceLifecycle(document);
      this.validateApplicationMutation(admissionTicket);
      this.#addDocument(document, false);
      for (const association of entry.windowAssociations) document.associateWindow(association);
      return document;
    } catch (error) {
      await document.markClosed(documentAdoptionAuthority).catch(() => undefined);
      this.dependencies.undo.remove({ kind: "document", id: entry.documentId });
      throw error;
    }
  }

  async #installResourceLifecycle<TModel, TSerialized>(document: ApplicationDocument<TModel, TSerialized>, signal?: AbortSignal): Promise<void> {
    if (!this.dependencies.resourceLifecycle) return;
    const revision = document.dirtyRevision;
    let abandoned = false;
    const pending = this.dependencies.resourceLifecycle(document, signal);
    void pending.then(lifecycle => {
      if (abandoned) void Promise.resolve().then(() => lifecycle.dispose()).catch(error => this.#reportError(error, "document-resource-late-factory-dispose"));
    }, () => undefined);
    let lifecycle: DocumentResourceLifecycle;
    try { lifecycle = await awaitDocumentSignal(pending, signal); }
    catch (error) { abandoned = true; throw error; }
    let installed = false;
    try {
      throwIfDocumentAborted(signal);
      document.assertControllerOperation(documentAdoptionAuthority);
      if (document.dirtyRevision !== revision) throw new DocumentAbortError("The initial document resource admission became stale.");
      document.installResourceLifecycle(lifecycle, documentAdoptionAuthority);
      installed = true;
      document.assertControllerOperation(documentAdoptionAuthority);
    } finally {
      if (!installed) { try { await lifecycle.dispose(); } catch (error) { this.#reportError(error, "document-resource-install-dispose"); } }
    }
  }

  #sameOptionalLocation(left: DocumentLocation | null, right: DocumentLocation | null): boolean {
    return left === null || right === null
      ? left === right
      : canonicalDocumentLocation(left) === canonicalDocumentLocation(right);
  }

  #sameOptionalVersion(left: DocumentVersion | null, right: DocumentVersion | null): boolean {
    return left === null || right === null ? left === right : documentVersionsEqual(left, right);
  }

  async #newDocumentCore<TModel, TSerialized = TModel>(
    request: NewDocumentRequest<TModel>,
    admissionTicket: ApplicationSessionMutationTicket | null = this.captureApplicationMutation(request.applicationId),
    beforePublication?: (document: ApplicationDocument<TModel, TSerialized>) => Promise<void>,
  ): Promise<ApplicationDocument<TModel, TSerialized>> {
    throwIfDocumentAborted(request.signal);
    this.validateApplicationMutation(admissionTicket);
    const documentId = request.documentId ?? this.dependencies.environment.randomUUID();
    this.#assertDocumentIdAvailable(documentId);
    this.#reservedDocumentIds.add(documentId);
    try {
    const typeAdmission = this.#types.admission(request.typeId);
    const type = typeAdmission.type as DocumentType<TModel, TSerialized>;
    let adapter: DocumentStorageAdapter | undefined;
    let adapterAdmission: { readonly adapter: DocumentStorageAdapter; readonly generation: number } | null = null;
    let locationKey: string | null = null;
    if (request.location) {
      locationKey = canonicalDocumentLocation(request.location);
      if (this.#documentIdsByLocation.has(locationKey) || this.#reservedLocations.has(locationKey)) {
        throw new DocumentDestinationConflictError(request.location);
      }
      const closedOwner = this.#closedLocationOwners.get(locationKey);
      if (this.#closedLocationOwners.has(locationKey) && request.applicationId && normalizeBundleIdentifier(closedOwner) !== normalizeBundleIdentifier(request.applicationId)) {
        throw new DocumentUnavailableError("A closed document location is owned by another application.", { retryable: false });
      }
      this.#reservedLocations.set(locationKey, documentId);
      try {
        adapterAdmission = this.#captureAdapter(request.location);
        adapter = adapterAdmission.adapter;
        const existing = await adapter.read(request.location, { signal: request.signal });
        // Storage adapters are allowed to be non-cooperative. Revalidate both
        // caller cancellation and application membership before allocating the
        // document controller or publishing its location ownership.
        throwIfDocumentAborted(request.signal);
        this.validateApplicationMutation(admissionTicket);
        if (!this.#types.isCurrent(typeAdmission) || (adapterAdmission !== null && !this.#isCurrentAdapter(adapterAdmission))) {
          throw new DocumentAbortError("The document creation admission became stale during storage I/O.");
        }
        if (existing) throw new DocumentDestinationConflictError(request.location, existing);
      } catch (error) {
        this.#reservedLocations.delete(locationKey);
        throw error;
      }
    }
    const undoManager = this.dependencies.undo.create({ kind: "document", id: documentId });
    let document: ApplicationDocument<TModel, TSerialized> | null = null;
    try {
      this.validateApplicationMutation(admissionTicket);
      if (!this.#types.isCurrent(typeAdmission) || (adapterAdmission !== null && !this.#isCurrentAdapter(adapterAdmission))) {
        throw new DocumentAbortError("The document creation admission became stale before construction.");
      }
      document = ApplicationDocument.create({
        id: documentId,
        applicationId: request.applicationId ?? null,
        type,
        model: request.initialModel,
        location: request.location,
        adapter,
        undoManager,
        recovery: this.dependencies.recovery,
        persistenceNamespace: this.dependencies.persistenceNamespace,
        environment: this.dependencies.environment,
        observeError: this.dependencies.observeError,
      });
      await this.#installResourceLifecycle(document, request.signal);
      throwIfDocumentAborted(request.signal);
      document.markUnsaved(documentAdoptionAuthority);
      await beforePublication?.(document);
      this.validateApplicationMutation(admissionTicket);
      if (!this.#types.isCurrent(typeAdmission) || (adapterAdmission !== null && !this.#isCurrentAdapter(adapterAdmission))) {
        throw new DocumentAbortError("The document creation admission became stale before publication.");
      }
      if (locationKey) this.#documentIdsByLocation.set(locationKey, documentId);
      this.#addDocument(document, request.activate !== false);
      return document;
    } catch (error) {
      if (document) await document.markClosed(documentAdoptionAuthority).catch(() => undefined);
      this.dependencies.undo.remove({ kind: "document", id: documentId });
      throw error;
    } finally {
      if (locationKey) this.#reservedLocations.delete(locationKey);
    }
    } finally {
      this.#reservedDocumentIds.delete(documentId);
    }
  }

  async #newProjectionCore<TModel, TSerialized = TModel>(
    request: NewProjectionDocumentRequest<TModel>,
    admissionTicket: ApplicationSessionMutationTicket | null = this.captureApplicationMutation(request.applicationId),
  ): Promise<ApplicationDocument<TModel, TSerialized>> {
    throwIfDocumentAborted(request.signal);
    this.validateApplicationMutation(admissionTicket);
    const documentId = request.documentId ?? this.dependencies.environment.randomUUID();
    this.#assertDocumentIdAvailable(documentId);
    this.#reservedDocumentIds.add(documentId);
    // The constructor clone-freezes the model, so the caller's object can
    // never alias projection state even when the caller kept it mutable.
    let document: ApplicationDocument<TModel, TSerialized> | null = null;
    try {
      const typeAdmission = this.#types.admission(request.typeId);
      const type = typeAdmission.type as DocumentType<TModel, TSerialized>;
      const undoManager = this.dependencies.undo.create({ kind: "document", id: documentId });
      try {
        this.validateApplicationMutation(admissionTicket);
        if (!this.#types.isCurrent(typeAdmission)) {
          throw new DocumentAbortError("The document creation admission became stale before construction.");
        }
        document = ApplicationDocument.createProjection({
          id: documentId,
          applicationId: request.applicationId ?? null,
          type,
          model: request.initialModel,
          undoManager,
          recovery: this.dependencies.recovery,
          persistenceNamespace: this.dependencies.persistenceNamespace,
          environment: this.dependencies.environment,
          observeError: this.dependencies.observeError,
        }, documentProjectionAuthority);
        await this.#installResourceLifecycle(document, request.signal);
        throwIfDocumentAborted(request.signal);
        // No markUnsaved: a projection is born clean (dirtyRevision 0) and
        // every mutation path rejects the kind, so it can never become dirty
        // through any supported operation.
        this.validateApplicationMutation(admissionTicket);
        if (!this.#types.isCurrent(typeAdmission)) {
          throw new DocumentAbortError("The document creation admission became stale before publication.");
        }
        this.#addDocument(document, request.activate !== false);
        return document;
      } catch (error) {
        if (document) await document.markClosed(documentAdoptionAuthority).catch(() => undefined);
        this.dependencies.undo.remove({ kind: "document", id: documentId });
        throw error;
      }
    } finally {
      this.#reservedDocumentIds.delete(documentId);
    }
  }

  async #openDocumentCore<TModel, TSerialized>(
    request: OpenDocumentRequest,
    admissionTicket: ApplicationSessionMutationTicket | null = this.captureApplicationMutation(request.applicationId),
    beforePublication?: (document: ApplicationDocument<TModel, TSerialized>) => Promise<void>,
  ): Promise<ApplicationDocument<TModel, TSerialized>> {
    throwIfDocumentAborted(request.signal);
    this.validateApplicationMutation(admissionTicket);
    const locationKey = canonicalDocumentLocation(request.location);
    const liveId = this.#documentIdsByLocation.get(locationKey);
    if (liveId) {
      if (request.documentId && request.documentId !== liveId) throw new DocumentRequestedIdConflictError(request.documentId);
      const live = this.#requireOpenDocument(liveId);
      if (admissionTicket && normalizeBundleIdentifier(live.applicationId) !== normalizeBundleIdentifier(admissionTicket.applicationId)) {
        throw new DocumentUnavailableError("A canonical document cannot change application ownership.", { retryable: false });
      }
      if (live.type.id !== request.typeId) {
        throw new DocumentSchemaError(request.typeId, `Open location is already owned by document type "${live.type.id}".`);
      }
      if (request.activate !== false) this.activateDocument(liveId);
      return live as ApplicationDocument<TModel, TSerialized>;
    }
    const opening = this.#openingDocuments.get(locationKey);
    if (opening) {
      if (request.documentId && request.documentId !== opening.documentId) {
        throw new DocumentRequestedIdConflictError(request.documentId);
      }
      if (opening.typeId !== request.typeId) {
        throw new DocumentSchemaError(request.typeId, `Open location is already being opened as document type "${opening.typeId}".`);
      }
      if (admissionTicket && normalizeBundleIdentifier(opening.applicationId) !== normalizeBundleIdentifier(admissionTicket.applicationId)) {
        throw new DocumentUnavailableError("An opening canonical document cannot change application ownership.", { retryable: false });
      }
      const document = await this.#awaitOpening(opening.promise, request.signal);
      this.validateApplicationMutation(admissionTicket);
      if (admissionTicket && normalizeBundleIdentifier(document.applicationId) !== normalizeBundleIdentifier(admissionTicket.applicationId)) {
        throw new DocumentUnavailableError("An opening canonical document changed application ownership.", { retryable: false });
      }
      if (request.activate !== false) this.activateDocument(document.id);
      return document as ApplicationDocument<TModel, TSerialized>;
    }
    if (this.#reservedLocations.has(locationKey)) throw new DocumentDestinationConflictError(request.location);
    const documentId = request.documentId ?? this.dependencies.environment.randomUUID();
    this.#assertDocumentIdAvailable(documentId);
    this.#reservedDocumentIds.add(documentId);
    const promise = this.#performOpen<TModel, TSerialized>(documentId, locationKey, request, admissionTicket, beforePublication);
    this.#openingDocuments.set(locationKey, {
      documentId,
      typeId: request.typeId,
      applicationId: admissionTicket?.applicationId ?? request.applicationId ?? null,
      promise,
    });
    try {
      return await promise;
    } finally {
      if (this.#openingDocuments.get(locationKey)?.promise === promise) this.#openingDocuments.delete(locationKey);
      this.#reservedDocumentIds.delete(documentId);
    }
  }

  async #performOpen<TModel, TSerialized>(
    documentId: string,
    locationKey: string,
    request: OpenDocumentRequest,
    admissionTicket: ApplicationSessionMutationTicket | null,
    beforePublication?: (document: ApplicationDocument<TModel, TSerialized>) => Promise<void>,
  ): Promise<ApplicationDocument<TModel, TSerialized>> {
    const adapterAdmission = this.#captureAdapter(request.location);
    const adapter = adapterAdmission.adapter;
    const typeAdmission = this.#types.admission(request.typeId);
    const record = await adapter.read<TSerialized>(request.location, { signal: request.signal });
    throwIfDocumentAborted(request.signal);
    if (!this.#isCurrentAdapter(adapterAdmission) || !this.#types.isCurrent(typeAdmission)) {
      throw new DocumentAbortError("The document open admission became stale during storage I/O.");
    }
    if (!record) throw new DocumentNotFoundError(request.location);
    const type = typeAdmission.type as DocumentType<TModel, TSerialized>;
    const undoManager = this.dependencies.undo.create({ kind: "document", id: documentId });
    let document: ApplicationDocument<TModel, TSerialized> | null = null;
    try {
      this.validateApplicationMutation(admissionTicket);
      if (!this.#isCurrentAdapter(adapterAdmission) || !this.#types.isCurrent(typeAdmission)) {
        throw new DocumentAbortError("The document open admission became stale before construction.");
      }
      document = ApplicationDocument.open({
        id: documentId,
        applicationId: admissionTicket?.applicationId ?? request.applicationId ?? null,
        type,
        record,
        adapter,
        undoManager,
        recovery: this.dependencies.recovery,
        persistenceNamespace: this.dependencies.persistenceNamespace,
        environment: this.dependencies.environment,
        observeError: this.dependencies.observeError,
      });
      await this.#installResourceLifecycle(document, request.signal);
      await document.refreshSynchronisation(request.signal);
      await beforePublication?.(document);
      throwIfDocumentAborted(request.signal);
      this.validateApplicationMutation(admissionTicket);
      if (!this.#isCurrentAdapter(adapterAdmission) || !this.#types.isCurrent(typeAdmission)) {
        throw new DocumentAbortError("The document open admission became stale before publication.");
      }
      this.#documentIdsByLocation.set(locationKey, documentId);
      this.#touchRecent(document.type.id, request.location);
      this.#addDocument(document, request.activate !== false);
      return document;
    } catch (error) {
      if (document) await document.markClosed(documentAdoptionAuthority).catch(() => undefined);
      this.dependencies.undo.remove({ kind: "document", id: documentId });
      throw error;
    }
  }

  #awaitOpening<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
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
      const onAbort = () => finish(() => reject(new DocumentAbortError("The document open was aborted.", { cause: signal.reason })));
      signal.addEventListener("abort", onAbort, { once: true });
      promise.then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
    });
  }

  async #saveDocumentCore(documentId: string, options: SaveDocumentOptions): Promise<void> {
    const document = this.#requireOpenDocument(documentId);
    // Projections have no save destination by construction; reject with the
    // semantic error before the destination-provider lookup.
    if (document.documentKind === "projection") throw new DocumentReadOnlyError(`Document "${document.id}" is a read-only projection.`);
    document.assertControllerOperation(documentAdoptionAuthority);
    if (document.hasEditingParticipants && options.reason !== "autosave") requireSettledDocumentEditing(await document.settleEditing("save", options.signal));
    document.assertControllerOperation(documentAdoptionAuthority);
    if (this.#documents.get(documentId) !== document) throw new DocumentUnavailableError("The document save owner changed.", { retryable: false });
    if (document.location) {
      await document.saveWithControllerAuthority(options, documentAdoptionAuthority);
      this.#touchRecent(document.type.id, document.location);
      this.#emit();
      return;
    }
    if (!this.#saveDestinationProvider) throw new DocumentLocationRequiredError(documentId);
    const selection = await this.#saveDestinationProvider.chooseDestination({
      documentId,
      displayName: document.type.displayName,
      currentLocation: null,
      reason: "save",
      signal: options.signal,
    });
    throwIfDocumentAborted(options.signal);
    if (!selection) return;
    await this.#saveAsCore({ documentId, ...selection, signal: options.signal }, undefined, undefined, undefined, true);
  }

  async #saveAsCore(
    request: SaveAsDocumentRequest,
    closeToken?: string,
    preparedAdapter?: DocumentStorageAdapter,
    admissionTicket?: ApplicationSessionMutationTicket | null,
    editingSettled = false,
  ): Promise<SaveAsDocumentResult> {
    throwIfDocumentAborted(request.signal);
    const document = this.#requireOpenDocument(request.documentId);
    // Save-as and move share this core. A projection has no save
    // destination by construction; persisting its content must go through an
    // explicit export path, never the save pipeline.
    if (document.documentKind === "projection") throw new DocumentReadOnlyError(`Document "${document.id}" is a read-only projection.`);
    // A prepared close owns the application admission through its close token;
    // capturing a fresh mutation ticket here would (correctly) reject the
    // save-as as soon as the close lease is reserved.
    const ticket = admissionTicket ?? (closeToken ? null : this.captureApplicationMutation(document.applicationId));
    this.validateApplicationMutation(ticket);
    document.assertControllerOperation(documentAdoptionAuthority, closeToken);
    if (!closeToken && !editingSettled && document.hasEditingParticipants) requireSettledDocumentEditing(await document.settleEditing("save-as", request.signal));
    document.assertControllerOperation(documentAdoptionAuthority, closeToken);
    this.validateApplicationMutation(ticket);
    if (this.#documents.get(document.id) !== document) throw new DocumentUnavailableError("The Save As owner changed.", { retryable: false });
    const typeAdmission = this.#types.admission(document.type.id);
    const previousLocation = document.location;
    const destination = structuredClone(request.destination);
    if (sameLocation(previousLocation, destination)) {
      if (request.conflict?.kind === "replace" && !documentVersionsEqual(request.conflict.expectedVersion, document.currentVersion)) {
        throw new DocumentDestinationConflictError(destination, document.lastSavedRecord);
      }
      const binding = document.captureStorageBinding(documentAdoptionAuthority, closeToken);
      const adapterAdmission = binding ? this.#registeredAdapterAdmission(binding.adapter) : null;
      const previousRecord = document.lastSavedRecord;
      if (adapterAdmission && !previousRecord && !adapterAdmission.adapter.capabilities.delete && !adapterAdmission.adapter.reconcileFencedWrite) {
        throw new DocumentUnavailableError("In-place Save As cannot safely compensate an empty destination with this adapter.", { retryable: false });
      }
      const transaction = document.beginAdoptionTransaction(documentAdoptionAuthority);
      let transactionActive = true;
      let saveCompleted = false;
      try {
        if (closeToken) {
          await document.saveWithControllerAuthority(
            { reason: "explicit", signal: request.signal },
            documentAdoptionAuthority,
            closeToken,
          );
        } else {
          await document.saveWithControllerAuthority({ reason: "explicit", signal: request.signal }, documentAdoptionAuthority);
        }
        saveCompleted = true;
        throwIfDocumentAborted(request.signal);
        this.validateApplicationMutation(ticket);
        if (!this.#types.isCurrent(typeAdmission) || (adapterAdmission && !this.#isCurrentAdapter(adapterAdmission)) || this.#documents.get(document.id) !== document) {
          throw new DocumentAbortError("The in-place Save As admission became stale after the destination write.");
        }
        const version = document.currentVersion;
        if (!version) throw new DocumentUnavailableError("The in-place save returned no version.", { retryable: false });
        document.commitAdoptionTransaction(transaction, documentAdoptionAuthority);
        transactionActive = false;
        this.#touchRecent(document.type.id, destination);
        if (!closeToken) this.#emit();
        return { documentId: document.id, previousLocation, location: destination, version };
      } catch (error) {
        const committed = document.lastSavedRecord;
        const writeCommitted = Boolean(committed && (!previousRecord || !documentVersionsEqual(committed.version, previousRecord.version)));
        if (transactionActive && (saveCompleted || writeCommitted)) {
          let compensationError: unknown;
          if (binding && committed) {
            try { await this.#reconcileFencedWrite(binding.adapter, destination, committed, previousRecord); }
            catch (reconciliationError) { compensationError = reconciliationError; }
          }
          try { document.rollbackAdoptionTransaction(transaction, documentAdoptionAuthority); transactionActive = false; }
          catch (rollbackError) { compensationError = compensationError ?? rollbackError; }
          if (compensationError) {
            throw new DocumentUnavailableError("In-place Save As failed and could not restore its authoritative state.", { cause: compensationError, retryable: false });
          }
        } else if (transactionActive) {
          try { document.commitAdoptionTransaction(transaction, documentAdoptionAuthority); transactionActive = false; }
          catch { /* preserve the original save failure */ }
        }
        throw error;
      }
    }
    const destinationKey = canonicalDocumentLocation(destination);
    const owner = this.#documentIdsByLocation.get(destinationKey);
    const reserver = this.#reservedLocations.get(destinationKey);
    if ((owner && owner !== document.id) || (reserver && reserver !== document.id)) {
      throw new DocumentDestinationConflictError(destination, owner ? this.#documents.get(owner)?.lastSavedRecord ?? null : null);
    }
    if (this.#documentRelocations.has(document.id)) {
      throw new DocumentUnavailableError(`Document "${document.id}" already has a relocation in progress.`, { retryable: false });
    }
    this.#documentRelocations.add(document.id);
    this.#reservedLocations.set(destinationKey, document.id);
    try {
      const adapterAdmission = preparedAdapter
        ? this.#registeredAdapterAdmission(preparedAdapter)
        : this.#captureAdapter(destination);
      const adapter = adapterAdmission.adapter;
      const assertSaveAsAdmission = () => {
        throwIfDocumentAborted(request.signal);
        this.validateApplicationMutation(ticket);
        if (!this.#types.isCurrent(typeAdmission) || !this.#isCurrentAdapter(adapterAdmission)) {
          throw new DocumentAbortError("The Save As admission became stale.");
        }
        if (this.#documents.get(document.id) !== document || (ticket && normalizeBundleIdentifier(document.applicationId) !== normalizeBundleIdentifier(ticket.applicationId))) {
          throw new DocumentAbortError("The Save As document admission became stale.");
        }
      };
      if (!adapter.supports(destination)) {
        throw new DocumentUnavailableError(`Prepared adapter "${adapter.id}" no longer supports the save destination.`, { retryable: false });
      }
      assertSaveAsAdmission();
      const recoveryKey = `${document.id}\u0000${destinationKey}`;
      const pendingWrite = this.#indeterminateSaveAsWrites.get(recoveryKey);
      let current: DocumentRecord<unknown> | null;
      let capture: { readonly serializedContent: unknown; readonly dirtyRevision: number };
      let record: DocumentRecord<unknown>;
      if (pendingWrite) {
        if (pendingWrite.document !== document || pendingWrite.destinationKey !== destinationKey ||
            pendingWrite.adapter !== adapter || pendingWrite.adapterGeneration !== adapterAdmission.generation) {
          throw new DocumentWriteOutcomeUnknownError(
            destination,
            pendingWrite.request.idempotencyKey,
            "A prior Save As has an indeterminate destination owned by a different document or adapter generation.",
          );
        }
        let recovered = pendingWrite.recoveredRecord;
        if (!recovered && adapter.recoverWriteByIdempotencyKey) {
          try {
            // Recovery intentionally does not inherit a cancelled caller
            // signal: it is a status query for an already-sent write.
            recovered = await adapter.recoverWriteByIdempotencyKey(pendingWrite.request);
          } catch (error) {
            throw new DocumentWriteOutcomeUnknownError(
              destination,
              pendingWrite.request.idempotencyKey,
              "The prior Save As outcome could not be recovered from its provider.",
              { cause: error },
            );
          }
        }
        if (!recovered) {
          throw new DocumentWriteOutcomeUnknownError(
            destination,
            pendingWrite.request.idempotencyKey,
            "A prior Save As may have created the destination, but the provider cannot prove its idempotent result.",
          );
        }
        if (!recoveredSaveAsRecordMatchesRequest(recovered, pendingWrite.request)) {
          throw new DocumentWriteOutcomeUnknownError(
            destination,
            pendingWrite.request.idempotencyKey,
            "The recovered Save As record does not prove the bytes sent by the indeterminate write.",
          );
        }
        pendingWrite.recoveredRecord = recovered;
        current = pendingWrite.previousRecord;
        capture = { serializedContent: pendingWrite.request.content, dirtyRevision: pendingWrite.dirtyRevision };
        record = recovered;
        assertSaveAsAdmission();
      } else {
        current = await adapter.read(destination, { signal: request.signal });
        assertSaveAsAdmission();
        const conflict: DocumentDestinationConflictPolicy = request.conflict ?? { kind: "fail-if-exists" };
        let expectedVersion: DocumentVersion | null = null;
        if (current) {
          if (conflict.kind !== "replace" || !documentVersionsEqual(conflict.expectedVersion, current.version)) {
            throw new DocumentDestinationConflictError(destination, current);
          }
          if (!adapter.capabilities.atomicConditionalWrite) {
            throw new DocumentUnavailableError("Replacing a destination requires atomic conditional writes.", { retryable: false });
          }
          expectedVersion = conflict.expectedVersion;
        } else if (conflict.kind === "replace") {
          throw new DocumentDestinationConflictError(destination, null);
        }
        if (!current && !adapter.capabilities.delete && !adapter.reconcileFencedWrite) {
          throw new DocumentUnavailableError("Save As cannot safely compensate an empty destination with this adapter.", { retryable: false });
        }
        capture = document.captureForExternalSave(documentAdoptionAuthority, closeToken);
        assertSaveAsAdmission();
        const writeRequest: DocumentWriteRequest<unknown> = {
          location: destination,
          typeId: document.type.id,
          schemaVersion: document.type.schemaVersion,
          content: capture.serializedContent,
          expectedVersion,
          idempotencyKey: `document-save-as:${document.id}:${this.dependencies.environment.randomUUID()}`,
          signal: request.signal,
          closeTransactionToken: closeToken
            ? this.#preparedCloses.get(closeToken)?.closeTransaction?.storage?.token
            : undefined,
        };
        try {
          record = await adapter.write(writeRequest);
        } catch (error) {
          if (!(error instanceof DocumentWriteOutcomeUnknownError)) throw error;
          const indeterminate: IndeterminateSaveAsWrite = {
            document,
            destination: structuredClone(destination),
            destinationKey,
            adapter,
            adapterGeneration: adapterAdmission.generation,
            request: structuredClone({ ...writeRequest, signal: undefined, closeTransactionToken: undefined }) as DocumentWriteRequest<unknown>,
            previousRecord: current,
            dirtyRevision: capture.dirtyRevision,
            recoveredRecord: null,
          };
          this.#indeterminateSaveAsWrites.set(recoveryKey, indeterminate);
          if (!adapter.recoverWriteByIdempotencyKey) throw error;
          try {
            const recovered = await adapter.recoverWriteByIdempotencyKey(indeterminate.request);
            if (!recovered || !recoveredSaveAsRecordMatchesRequest(recovered, indeterminate.request)) {
              throw error;
            }
            indeterminate.recoveredRecord = recovered;
            record = recovered;
          } catch (recoveryError) {
            throw new DocumentWriteOutcomeUnknownError(
              destination,
              writeRequest.idempotencyKey,
              "The Save As response was lost and recovery could not establish the destination record.",
              { cause: new AggregateError([error, recoveryError], "Save As write and recovery failed.") },
            );
          }
        }
      }
      let adoptionTransaction: ReturnType<ApplicationDocument<unknown, unknown>["beginAdoptionTransaction"]> | null = null;
      const previousLocationKey = previousLocation ? canonicalDocumentLocation(previousLocation) : null;
      const previousRecent = previousLocationKey ? this.#recentDocuments.get(previousLocationKey) : undefined;
      const destinationRecent = this.#recentDocuments.get(destinationKey);
      const notificationPendingBefore = this.#notificationPending;
      let adoptionDirtyRevision: number | null = null;
      let fenced = false;
      this.#notificationSuppression += 1;
      try {
        adoptionTransaction = document.beginAdoptionTransaction(documentAdoptionAuthority);
        adoptionDirtyRevision = document.dirtyRevision;
        assertSaveAsAdmission();
        // A newer local edit is safe to retain: adoptSavedRecord compares the
        // captured revision with the current one and keeps the document dirty
        // when they differ. The identity/session fences above are the
        // authority boundary; treating a concurrent edit as stale would make
        // a successful Save As fail even though its captured bytes are safely
        // isolated from that newer in-memory model.
        if (this.#documents.get(document.id) !== document || (ticket && normalizeBundleIdentifier(document.applicationId) !== normalizeBundleIdentifier(ticket.applicationId))) {
          throw new DocumentAbortError("The Save As admission became stale after the destination write.");
        }
        assertSaveAsAdmission();
        document.adoptSavedRecord(
          record,
          adapter,
          documentAdoptionAuthority,
          capture.dirtyRevision,
          closeToken,
        );
        assertSaveAsAdmission();
        await document.finishExternalSave(documentAdoptionAuthority);
        assertSaveAsAdmission();
        this.#touchRecent(document.type.id, destination);
        assertSaveAsAdmission();
        if (previousLocationKey) this.#documentIdsByLocation.delete(previousLocationKey);
        this.#documentIdsByLocation.set(destinationKey, document.id);
        assertSaveAsAdmission();
        if (!closeToken) this.#emit();
        assertSaveAsAdmission();
        document.commitAdoptionTransaction(adoptionTransaction, documentAdoptionAuthority);
        fenced = true;
        this.#indeterminateSaveAsWrites.delete(recoveryKey);
      } catch (error) {
        let compensationError: unknown;
        try { await this.#reconcileFencedWrite(adapter, destination, record, current); }
        catch (reconciliationError) { compensationError = reconciliationError; }
        if (previousLocationKey) this.#documentIdsByLocation.set(previousLocationKey, document.id);
        if (this.#documentIdsByLocation.get(destinationKey) === document.id) this.#documentIdsByLocation.delete(destinationKey);
        if (previousRecent) this.#recentDocuments.set(previousLocationKey!, previousRecent);
        else if (previousLocationKey) this.#recentDocuments.delete(previousLocationKey);
        if (destinationRecent) this.#recentDocuments.set(destinationKey, destinationRecent);
        else this.#recentDocuments.delete(destinationKey);
        const newerDocumentMutation = adoptionDirtyRevision !== null && document.dirtyRevision !== adoptionDirtyRevision;
        this.#notificationPending = notificationPendingBefore || newerDocumentMutation;
        if (adoptionTransaction) {
          try { document.rollbackAdoptionTransaction(adoptionTransaction, documentAdoptionAuthority); }
          catch (rollbackError) { compensationError = compensationError ?? rollbackError; }
        }
        if (!compensationError) this.#indeterminateSaveAsWrites.delete(recoveryKey);
        if (compensationError) {
          throw new DocumentUnavailableError("Save As failed and could not restore its authoritative state.", { cause: compensationError, retryable: false });
        }
        throw error;
      } finally {
        this.#notificationSuppression -= 1;
        if (this.#notificationSuppression === 0 && this.#notificationPending) {
          this.#notificationPending = false;
          this.#emit();
        }
      }
      if (!fenced) throw new DocumentAbortError("The Save As admission became stale after the destination write.");
      return {
        documentId: document.id,
        previousLocation,
        location: structuredClone(destination),
        version: structuredClone(record.version),
      };
    } finally {
      if (this.#reservedLocations.get(destinationKey) === document.id &&
          !this.#preparedCloseOwnsLocation(closeToken, destinationKey)) {
        this.#reservedLocations.delete(destinationKey);
      }
      this.#documentRelocations.delete(document.id);
    }
  }

  async #reconcileFencedWrite<TSerialized>(
    adapter: DocumentStorageAdapter,
    destination: DocumentLocation,
    committed: DocumentRecord<TSerialized>,
    previous: DocumentRecord<TSerialized> | null,
  ): Promise<void> {
    if (adapter.reconcileFencedWrite) {
      await adapter.reconcileFencedWrite(destination, committed, previous, {});
      return;
    }
    if (previous) {
      await adapter.write({
        location: destination,
        typeId: previous.typeId,
        schemaVersion: previous.schemaVersion,
        content: previous.content,
        expectedVersion: committed.version,
        idempotencyKey: `document-save-as-reconcile:${committed.version.id}`,
      });
      return;
    }
    if (adapter.capabilities.delete) await adapter.remove(destination, committed.version, {});
  }

  async #prepareCloseSetCore(
    requestedDocumentIds: readonly string[],
    reason: DocumentCloseReason,
    signal?: AbortSignal,
    presentationRootIds?: readonly string[],
  ): Promise<DocumentCloseSetPreparation> {
    throwIfDocumentAborted(signal);
    const documentIds = Object.freeze([...new Set(requestedDocumentIds)]);
    if (documentIds.length === 0) throw new DocumentUnavailableError("A selected close requires at least one document.", { retryable: false });
    const selected = documentIds.map((documentId) => {
      const document = this.#requireOpenDocument(documentId);
      return Object.freeze({ document, associations: document.windowAssociations });
    });
    const coordinator = this.#presentationCloseCoordinator;
    const hasPresentations = selected.some(({ associations }) => associations.length > 0) ||
      Boolean(presentationRootIds?.length);
    if (hasPresentations && (!coordinator?.prepareCloseSet || !coordinator.validateCloseSet || !coordinator.commitCloseSet)) {
      return { status: "refused", documentId: documentIds[0]!, reason: "presentation-coordinator-unavailable" };
    }

    for (const { document } of selected) if (document.hasEditingParticipants) {
      const settlement = await document.settleEditing("close", signal);
      throwIfDocumentAborted(signal);
      if (settlement.status !== "settled") return { status: "refused", documentId: document.id, reason: settlement.status === "refused" ? "editing-refused" : "editing-revoked" };
      if (this.#documents.get(document.id) !== document) return { status: "refused", documentId: document.id, reason: "editing-revoked" };
    }

    // Calling every async preparation before awaiting any of them installs all
    // close gates synchronously. The presentation coordinator is then invoked
    // in the same turn, so its forest reservation precedes every reviewer.
    const pending = selected.map(({ document, associations }) => this.#prepareCloseCore(
      document.id,
      reason,
      signal,
      { skipPresentation: true, expectedAssociations: associations, editingSettled: true },
    ));
    let pendingPresentation: Promise<DocumentPresentationCloseSetPreparation | null>;
    try {
      pendingPresentation = hasPresentations
        ? coordinator!.prepareCloseSet!({
            documents: Object.freeze(selected.map(({ document, associations }) => Object.freeze({
              documentId: document.id,
              associations,
            }))),
            ...(presentationRootIds ? { presentationRootIds: Object.freeze([...presentationRootIds]) } : {}),
            reason,
            signal,
          })
        : Promise.resolve(null);
    } catch (error) {
      // Keep the synchronous provider failure inside the common settlement
      // path so every document preparation that was started above is owned
      // and released before the failure is surfaced.
      pendingPresentation = Promise.reject(error);
    }
    let presentation: PreparedCloseSet["presentation"] = null;
    const ready: Array<Extract<DocumentClosePreparation, { status: "ready" }>> = [];
    let preparedSetToken: string | null = null;
    try {
      const settled = await Promise.allSettled([
        awaitDocumentSignal(pendingPresentation, signal),
        ...pending,
      ]);
      const presentationSettlement = settled[0] as PromiseSettledResult<DocumentPresentationCloseSetPreparation | null>;
      const preparationSettlements = settled.slice(1) as Array<PromiseSettledResult<DocumentClosePreparation>>;
      const preparations = preparationSettlements
        .filter((candidate): candidate is PromiseFulfilledResult<DocumentClosePreparation> => candidate.status === "fulfilled")
        .map(({ value }) => value);
      const rejectedSettlement = settled.find((candidate) => candidate.status === "rejected") as PromiseRejectedResult | undefined;
      if (rejectedSettlement) {
        if (presentationSettlement.status === "fulfilled" && presentationSettlement.value?.status === "ready") {
          try { coordinator?.rollbackCloseSet?.(presentationSettlement.value); } catch { /* retain original error */ }
        }
        for (const candidate of [...preparations].reverse()) {
          if (candidate.status === "ready") this.cancelCloseDocument(candidate);
        }
        throw rejectedSettlement.reason;
      }
      const presentationPreparation = (presentationSettlement as PromiseFulfilledResult<DocumentPresentationCloseSetPreparation | null>).value;
      if (presentationPreparation) {
        if (presentationPreparation.status !== "ready") {
          for (const candidate of preparations) if (candidate.status === "ready") this.cancelCloseDocument(candidate);
          return { status: "cancelled", documentId: documentIds[0]! };
        }
        const actualIds = presentationPreparation.documentIds;
        if (!sameStringSet(actualIds, documentIds)) {
          try { coordinator!.rollbackCloseSet?.(presentationPreparation); }
          catch { /* provider cleanup cannot retain selected document gates */ }
          for (const candidate of [...preparations].reverse()) {
            if (candidate.status === "ready") {
              try { this.cancelCloseDocument(candidate); }
              catch { /* attempt every independently owned document gate */ }
            }
          }
          throw new DocumentPresentationCloseContractError("Presentation close-set preparation selected different documents.");
        }
        presentation = { coordinator: coordinator!, preparation: presentationPreparation };
      }
      const rejected = preparations.find((preparation) => preparation.status !== "ready");
      if (rejected) {
        for (const candidate of [...preparations].reverse()) {
          if (candidate.status === "ready") this.cancelCloseDocument(candidate);
        }
        if (presentation) {
          try { presentation.coordinator.rollbackCloseSet?.(presentation.preparation); }
          catch { /* cancellation result remains authoritative */ }
        }
        return rejected;
      }
      ready.push(...preparations as Array<Extract<DocumentClosePreparation, { status: "ready" }>>);
      // Acquire every provider/application before-image before the first
      // close-time write or discard. A later provider refusing transaction
      // support therefore cannot leave an earlier selected member mutated.
      for (const preparation of ready) await this.#beginPreparedCloseTransaction(preparation);
      for (const preparation of ready) {
        await this.#prepareCloseCommitWork(preparation);
        await this.#requirePrepared(preparation).closeTransaction?.storage?.seal();
      }
      const token = `document-close-set:${this.dependencies.environment.randomUUID()}`;
      preparedSetToken = token;
      const publicPreparation: Extract<DocumentCloseSetPreparation, { status: "ready" }> = Object.freeze({
        status: "ready",
        token,
        documentIds,
        reason,
      });
      this.#preparedCloseSets.set(token, {
        publicPreparation,
        preparations: Object.freeze([...ready]),
        presentation,
        settled: false,
        committing: false,
        cancellation: null,
      });
      this.validateCloseDocuments(publicPreparation);
      return publicPreparation;
    } catch (error) {
      if (preparedSetToken) this.#preparedCloseSets.delete(preparedSetToken);
      const rollbackErrors: unknown[] = [];
      const rolledBack: Array<Extract<DocumentClosePreparation, { status: "ready" }>> = [];
      for (const preparation of [...ready].reverse()) {
        const prepared = this.#preparedCloses.get(preparation.token);
        if (!prepared) continue;
        try {
          await this.#rollbackPreparedCloseTransaction(prepared);
          rolledBack.push(preparation);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
          this.#reportError(rollbackError, "document-close-storage-rollback");
        }
      }
      if (rollbackErrors.length === 0 && presentation) {
        try { presentation.coordinator.rollbackCloseSet?.(presentation.preparation); }
        catch (rollbackError) {
          rollbackErrors.push(rollbackError);
          this.#reportError(rollbackError, "document-close-presentation-rollback");
        }
      }
      if (rollbackErrors.length === 0) {
        for (const preparation of rolledBack) this.cancelCloseDocument(preparation);
      }
      if (rollbackErrors.length > 0) {
        throw new AggregateError([error, ...rollbackErrors], "Selected document close preparation and rollback failed.");
      }
      if (error instanceof DocumentCloseTransactionUnavailableError) {
        return {
          status: "refused",
          documentId: documentIds[0]!,
          reason: "storage-transaction-unavailable",
        };
      }
      throw error;
    }
  }

  async #prepareCloseCore(
    documentId: string,
    reason: DocumentCloseReason,
    signal?: AbortSignal,
    options: {
      readonly skipPresentation?: boolean;
      readonly expectedAssociations?: readonly DocumentWindowAssociation[];
      readonly terminalToken?: object;
      readonly editingSettled?: boolean;
    } = {},
  ): Promise<DocumentClosePreparation> {
    throwIfDocumentAborted(signal);
    const document = this.#requireOpenDocument(documentId);
    const validateTerminalAuthority = () => {
      if (options.terminalToken) {
        document.validateTerminalReconciliation(options.terminalToken, documentAdoptionAuthority);
      }
    };
    if (this.#documentRelocations.has(documentId)) {
      throw new DocumentUnavailableError(`Document "${documentId}" has a relocation in progress.`, { retryable: false });
    }
    if (!options.terminalToken && !options.editingSettled && document.hasEditingParticipants) {
      const settlement = await document.settleEditing("close", signal);
      throwIfDocumentAborted(signal);
      if (settlement.status !== "settled") return { status: "refused", documentId, reason: settlement.status === "refused" ? "editing-refused" : "editing-revoked" };
      if (this.#documents.get(documentId) !== document) return { status: "refused", documentId, reason: "editing-revoked" };
    }
    const token = `document-close:${this.dependencies.environment.randomUUID()}`;
    let presentation: PreparedClose["presentation"] = null;
    let gateSettled = false;
    const gateReady = document.beginCloseGate(token, documentAdoptionAuthority, signal, options.terminalToken)
      .finally(() => { gateSettled = true; });
    try {
      await awaitDocumentSignal(
        gateReady,
        signal,
      );
      validateTerminalAuthority();
      const associations = document.windowAssociations;
      if (options.expectedAssociations && !sameAssociations(associations, options.expectedAssociations)) {
        throw new DocumentPresentationCloseContractError("The selected document presentation membership changed.");
      }
      const coordinator = this.#presentationCloseCoordinator;
      if (!options.skipPresentation && associations.length > 0 && !coordinator) {
        document.endCloseGate(token, documentAdoptionAuthority);
        return { status: "refused", documentId, reason: "presentation-coordinator-unavailable" };
      }
      let decision: "clean" | "save" | "discard" = "clean";
      let saveTarget: Extract<DocumentClosePreparation, { status: "ready" }>["saveTarget"] = null;
      if (document.hasUnsavedChanges) {
        if (document.documentKind === "projection") {
          // Same invariant as the disposal path: a healthy projection is
          // clean and never reaches review. A dirty or conflicted projection
          // means a mutation guard failed upstream — refuse, diagnose, and
          // never consult a reviewer or discard.
          this.#reportError(
            new DocumentReadOnlyError(`Projection document "${document.id}" reached close with unsaved changes.`),
            `documents.close.projection-dirty:${document.id}`,
          );
          document.endCloseGate(token, documentAdoptionAuthority);
          return { status: "cancelled", documentId };
        }
        const reviewed = this.#closeReviewer
          ? await awaitDocumentSignal(this.#closeReviewer.review({
              documentId,
              displayName: document.type.displayName,
              reason,
              hasRecoverableAutosave: document.hasRecoverableAutosave,
              signal,
            }), signal)
          : "cancel";
        throwIfDocumentAborted(signal);
        validateTerminalAuthority();
        if (reviewed === "cancel") {
          document.endCloseGate(token, documentAdoptionAuthority);
          return { status: "cancelled", documentId };
        }
        decision = reviewed;
        if (reviewed === "save") {
          if (document.state === "conflicted") {
            document.endCloseGate(token, documentAdoptionAuthority);
            return { status: "cancelled", documentId };
          }
          if (document.location) saveTarget = { kind: "current-location" };
          else {
            const selection = this.#saveDestinationProvider
              ? await awaitDocumentSignal(this.#saveDestinationProvider.chooseDestination({
                  documentId,
                  displayName: document.type.displayName,
                  currentLocation: null,
                  reason: "save",
                  signal,
                }), signal)
              : null;
            throwIfDocumentAborted(signal);
            validateTerminalAuthority();
            if (!selection) {
              document.endCloseGate(token, documentAdoptionAuthority);
              return { status: "cancelled", documentId };
            }
            saveTarget = { kind: "save-as", ...selection };
          }
        }
      }
      if (options.expectedAssociations && !sameAssociations(document.windowAssociations, options.expectedAssociations)) {
        throw new DocumentPresentationCloseContractError("The selected document presentation membership changed during review.");
      }
      if (!options.skipPresentation && coordinator && associations.length > 0) {
        const before = document.snapshot();
        const prepared = await awaitDocumentSignal(
          coordinator.prepareClose({ documentId, associations, reason, signal }),
          signal,
        );
        throwIfDocumentAborted(signal);
        validateTerminalAuthority();
        if (document.snapshot() !== before) throw new DocumentPresentationCloseContractError("Presentation close preparation mutated the document.");
        if (prepared.status === "cancelled") {
          document.endCloseGate(token, documentAdoptionAuthority);
          return { status: "cancelled", documentId };
        }
        const associationIds = associations.map(({ windowControllerId }) => windowControllerId);
        if (prepared.documentId !== documentId || !sameStringSet(prepared.associationIds, associationIds)) {
          try { coordinator.rollbackClose(prepared); } catch { /* contract diagnostics replace provider errors */ }
          throw new DocumentPresentationCloseContractError("Presentation close preparation did not match the document associations.");
        }
        presentation = { coordinator, preparation: prepared };
      }
      const publicPreparation: Extract<DocumentClosePreparation, { status: "ready" }> = Object.freeze({
        status: "ready",
        token,
        documentId,
        reason,
        dirtyRevision: document.dirtyRevision,
        decision,
        saveTarget,
      });
      this.#preparedCloses.set(token, {
        publicPreparation,
        document,
        presentation,
        signal,
        ...(options.terminalToken ? { terminalToken: options.terminalToken } : {}),
        closeTransaction: null,
        settled: false,
      });
      return publicPreparation;
    } catch (error) {
      if (presentation) {
        try { presentation.coordinator.rollbackClose(presentation.preparation); } catch { /* contract diagnostics replace provider errors */ }
      }
      if (gateSettled) {
        document.endCloseGate(token, documentAdoptionAuthority);
      } else {
        void gateReady.then(
          () => document.endCloseGate(token, documentAdoptionAuthority),
          () => document.endCloseGate(token, documentAdoptionAuthority),
        );
      }
      throw error;
    }
  }

  async #commitCloseCore(
    preparation: Extract<DocumentClosePreparation, { status: "ready" }>,
    commitGuard?: () => boolean,
  ): Promise<DocumentCloseResult> {
    await this.#prepareCloseCommitWork(preparation);
    const prepared = this.#requirePrepared(preparation);
    prepared.document.assertCloseGate(preparation.token, documentAdoptionAuthority, prepared.terminalToken);
    if (commitGuard && !commitGuard()) {
      this.cancelCloseDocument(preparation);
      return { outcome: "cancelled", documentId: preparation.documentId };
    }
    this.#commitPreparedStructure(preparation);
    await this.settleClosedDocuments([preparation.documentId]);
    return { outcome: "closed", documentId: preparation.documentId };
  }

  async #beginPreparedCloseTransaction(
    preparation: Extract<DocumentClosePreparation, { status: "ready" }>,
  ): Promise<void> {
    const prepared = this.#requirePrepared(preparation);
    if (prepared.closeTransaction) return;
    const controller = this.#beginPreparedCloseControllerTransaction(prepared, preparation);
    let storage: DocumentCloseStorageTransaction | null = null;
    const currentBinding = prepared.document.captureStorageBinding(documentAdoptionAuthority, preparation.token);
    const needsSynchronisationDiscard = preparation.decision === "discard" &&
      Boolean(currentBinding?.adapter.isSynchronisationPending?.(currentBinding.location)) &&
      typeof currentBinding?.adapter.discardPendingSynchronisation === "function";
    const adapter = preparation.saveTarget?.kind === "save-as"
      ? this.#resolveAdapter(preparation.saveTarget.destination)
      : preparation.saveTarget?.kind === "current-location" ||
          needsSynchronisationDiscard
        ? currentBinding?.adapter ?? null
        : null;
    const mutationLocation = preparation.saveTarget?.kind === "save-as"
      ? preparation.saveTarget.destination
      : adapter
        ? currentBinding?.location ?? null
        : null;
    try {
      if (mutationLocation) {
        if (!adapter) {
          throw new DocumentUnavailableError("Selected-close storage binding is unavailable.", { retryable: false });
        }
        if (!adapter.beginCloseTransaction) {
          throw new DocumentCloseTransactionUnavailableError(adapter.id);
        }
        if (!adapter.supports(mutationLocation)) {
          throw new DocumentUnavailableError(
            `Captured adapter "${adapter.id}" no longer supports its selected-close location.`,
            { retryable: false },
          );
        }
        storage = await adapter.beginCloseTransaction(mutationLocation, { signal: prepared.signal });
      }
      const application = prepared.document.beginCloseTransaction(
        preparation.token,
        documentAdoptionAuthority,
        storage?.token,
      );
      prepared.closeTransaction = { application, storage, controller, adapter };
    } catch (error) {
      this.#rollbackPreparedCloseControllerTransaction(controller);
      await storage?.rollback().catch((rollbackError) => {
        this.#reportError(rollbackError, "document-close-storage-rollback");
      });
      throw error;
    }
  }

  async #rollbackPreparedCloseTransaction(prepared: PreparedClose): Promise<void> {
    const transaction = prepared.closeTransaction;
    if (!transaction) return;
    await transaction.storage?.rollback();
    prepared.document.rollbackCloseTransaction(transaction.application, documentAdoptionAuthority);
    this.#rollbackPreparedCloseControllerTransaction(transaction.controller);
    prepared.closeTransaction = null;
  }

  #commitPreparedCloseTransaction(prepared: PreparedClose): void {
    const transaction = prepared.closeTransaction;
    if (!transaction) return;
    prepared.closeTransaction = null;
    if (transaction.storage) {
      try {
        this.#trackCloseCleanup(
          prepared.document.id,
          Promise.resolve(transaction.storage.commit()),
          "document-close-storage-finalize",
        );
      } catch (error) {
        this.#reportError(error, "document-close-storage-finalize");
      }
    }
    prepared.document.commitCloseTransaction(transaction.application, documentAdoptionAuthority);
    this.#releasePreparedCloseControllerReservations(transaction.controller);
  }

  #beginPreparedCloseControllerTransaction(
    prepared: PreparedClose,
    preparation: Extract<DocumentClosePreparation, { status: "ready" }>,
  ): PreparedCloseControllerTransaction {
    const locationKeys = new Set<string>();
    const reservedLocationKeys: string[] = [];
    if (preparation.saveTarget?.kind === "save-as") {
      const destinationKey = canonicalDocumentLocation(preparation.saveTarget.destination);
      locationKeys.add(destinationKey);
      const previousLocation = prepared.document.location;
      if (previousLocation) locationKeys.add(canonicalDocumentLocation(previousLocation));
      if (!previousLocation || !sameLocation(previousLocation, preparation.saveTarget.destination)) {
        for (const key of locationKeys) {
          const reserver = this.#reservedLocations.get(key);
          if (reserver && reserver !== prepared.document.id) {
            throw new DocumentUnavailableError(`Document location "${key}" is reserved by another operation.`, { retryable: true });
          }
        }
        for (const key of locationKeys) {
          this.#reservedLocations.set(key, prepared.document.id);
          reservedLocationKeys.push(key);
        }
      }
    }
    return {
      locationOwners: Object.freeze([...locationKeys].map((key) => Object.freeze([
        key,
        this.#documentIdsByLocation.get(key) ?? null,
      ] as const))),
      closedLocationOwners: Object.freeze([...locationKeys].map((key) => Object.freeze([
        key,
        this.#closedLocationOwners.has(key) ? this.#closedLocationOwners.get(key)! : undefined,
      ] as const))),
      recentDocuments: Object.freeze([...locationKeys].map((key) => Object.freeze([
        key,
        this.#recentDocuments.get(key) ? structuredClone(this.#recentDocuments.get(key)!) : null,
      ] as const))),
      reservedLocationKeys: Object.freeze(reservedLocationKeys),
    };
  }

  #rollbackPreparedCloseControllerTransaction(transaction: PreparedCloseControllerTransaction): void {
    for (const [key, owner] of transaction.locationOwners) {
      if (owner) this.#documentIdsByLocation.set(key, owner);
      else this.#documentIdsByLocation.delete(key);
    }
    for (const [key, owner] of transaction.closedLocationOwners) {
      if (owner !== undefined) this.#closedLocationOwners.set(key, owner);
      else this.#closedLocationOwners.delete(key);
    }
    for (const [key, recent] of transaction.recentDocuments) {
      if (recent) this.#recentDocuments.set(key, Object.freeze(structuredClone(recent)));
      else this.#recentDocuments.delete(key);
    }
    this.#releasePreparedCloseControllerReservations(transaction);
  }

  #releasePreparedCloseControllerReservations(transaction: PreparedCloseControllerTransaction): void {
    for (const key of transaction.reservedLocationKeys) this.#reservedLocations.delete(key);
  }

  #preparedCloseOwnsLocation(closeToken: string | undefined, locationKey: string): boolean {
    if (!closeToken) return false;
    return this.#preparedCloses.get(closeToken)?.closeTransaction?.controller.reservedLocationKeys.includes(locationKey) ?? false;
  }

  async #prepareCloseCommitWork(preparation: Extract<DocumentClosePreparation, { status: "ready" }>): Promise<void> {
    const prepared = this.#requirePrepared(preparation);
    prepared.document.assertCloseGate(preparation.token, documentAdoptionAuthority, prepared.terminalToken);
    if (preparation.saveTarget?.kind === "save-as") {
      await this.#saveAsCore({
        documentId: preparation.documentId,
        destination: preparation.saveTarget.destination,
        conflict: preparation.saveTarget.conflict,
        signal: prepared.signal,
      }, preparation.token, prepared.closeTransaction?.adapter ?? undefined);
    } else if (preparation.saveTarget?.kind === "current-location") {
      await prepared.document.saveWithControllerAuthority(
        { reason: "close", signal: prepared.signal },
        documentAdoptionAuthority,
        preparation.token,
      );
    }
    if (prepared.document.dirtyRevision !== preparation.dirtyRevision) {
      throw new DocumentUnavailableError("The document changed after close preparation.", { retryable: false });
    }
    await awaitDocumentSignal(
      prepared.document.prepareToClose({
        signal: prepared.signal,
        discardPendingSynchronisation: preparation.decision === "discard",
        preserveRecovery: true,
      }),
      prepared.signal,
    );
    prepared.document.assertCloseGate(preparation.token, documentAdoptionAuthority, prepared.terminalToken);
  }

  #commitPreparedStructure(preparation: Extract<DocumentClosePreparation, { status: "ready" }>): void {
    const prepared = this.#requirePrepared(preparation);
    let commitCount = 0;
    const commitDocument = () => {
      commitCount += 1;
      if (commitCount !== 1) throw new DocumentPresentationCloseContractError();
      const publishDocument = this.#commitDocumentStructuralClose(prepared.document);
      publishDocument();
    };
    try {
      if (prepared.presentation) prepared.presentation.coordinator.commitClose(prepared.presentation.preparation, commitDocument);
      else commitDocument();
    } catch (error) {
      if (this.#documents.get(prepared.document.id) !== prepared.document) {
        prepared.settled = true;
        this.#preparedCloses.delete(preparation.token);
        this.#emit();
      }
      if (error instanceof DocumentPresentationCloseContractError) throw error;
      throw new DocumentPresentationCloseContractError(error instanceof Error ? error.message : undefined);
    }
    if (commitCount !== 1) throw new DocumentPresentationCloseContractError();
    prepared.settled = true;
    this.#preparedCloses.delete(preparation.token);
    this.#emit();
  }

  #rollbackPrepared(prepared: PreparedClose): void {
    if (prepared.settled) return;
    if (prepared.closeTransaction) {
      void this.#rollbackPreparedCloseTransaction(prepared).catch((error) => {
        this.#reportError(error, "document-close-storage-rollback");
      });
    }
    prepared.settled = true;
    this.#preparedCloses.delete(prepared.publicPreparation.token);
    if (prepared.presentation) {
      try { prepared.presentation.coordinator.rollbackClose(prepared.presentation.preparation); } catch { /* rollback is contractually non-throwing */ }
    }
    if (this.#documents.get(prepared.document.id) === prepared.document) {
      prepared.document.endCloseGate(prepared.publicPreparation.token, documentAdoptionAuthority);
    }
  }

  #requirePrepared(preparation: Extract<DocumentClosePreparation, { status: "ready" }>): PreparedClose {
    const prepared = this.#preparedCloses.get(preparation.token);
    if (!prepared || prepared.publicPreparation !== preparation || prepared.settled || prepared.document.id !== preparation.documentId) {
      throw new DocumentPresentationCloseContractError("The document close preparation is stale or invalid.");
    }
    return prepared;
  }

  #requirePreparedSet(preparation: Extract<DocumentCloseSetPreparation, { status: "ready" }>): PreparedCloseSet {
    const prepared = this.#preparedCloseSets.get(preparation.token);
    if (!prepared || prepared.publicPreparation !== preparation || prepared.settled || prepared.committing || prepared.cancellation) {
      throw new DocumentPresentationCloseContractError("The selected document close preparation is stale or invalid.");
    }
    return prepared;
  }

  #commitDocumentStructuralClose(document: ApplicationDocument<unknown, unknown>): () => void {
    if (this.#documents.get(document.id) !== document) return () => undefined;
    this.#deferredFinalOwnerCleanups.delete(document);
    // A retry proof belongs to this exact live document object. Once it has
    // closed, a same-ID replacement must never inherit an old indeterminate
    // Save As transaction; normal destination conflict checks remain the
    // authority for any remote record that outlived the closed document.
    for (const [key, pending] of this.#indeterminateSaveAsWrites) {
      if (pending.document === document) this.#indeterminateSaveAsWrites.delete(key);
    }
    const location = document.location;
    if (location) {
      const key = canonicalDocumentLocation(location);
      this.#documentIdsByLocation.delete(key);
      this.#closedLocationOwners.set(key, document.applicationId);
    }
    this.#subscriptions.get(document.id)?.();
    this.#subscriptions.delete(document.id);
    this.#documents.delete(document.id);
    try { this.dependencies.undo.remove({ kind: "document", id: document.id }); }
    catch (error) { this.#reportError(error, "document-close-undo"); }
    const activationIndex = this.#activationOrder.indexOf(document.id);
    if (activationIndex >= 0) this.#activationOrder.splice(activationIndex, 1);
    if (this.#activeDocumentId === document.id) this.#activeDocumentId = this.#activationOrder.at(-1) ?? null;
    this.#trackCloseCleanup(
      document.id,
      document.markClosed(documentAdoptionAuthority),
      "document-close-recovery-finalize",
    );
    return () => document.publishControllerState(documentAdoptionAuthority);
  }

  #trackCloseCleanup(documentId: string, cleanup: Promise<void>, context: string): void {
    const previous = this.#closeCleanupsByDocumentId.get(documentId) ?? Promise.resolve();
    const observed = cleanup.catch((error) => { this.#reportError(error, context); });
    const tracked = previous.then(() => observed);
    this.#closeCleanupsByDocumentId.set(documentId, tracked);
  }

  #addDocument(document: ApplicationDocument<unknown, unknown>, activate: boolean): void {
    this.#documents.set(document.id, document);
    this.#subscriptions.set(document.id, document.subscribe(() => this.#emit()));
    this.#activationOrder.push(document.id);
    if (activate) this.#activeDocumentId = document.id;
    this.#emit();
  }

  #terminalProviderOperationKey(applicationId: string, documentId: string): string {
    return `${normalizeBundleIdentifier(applicationId.trim())}\u0000${documentId.trim()}`;
  }

  #terminalProviderOperationSnapshot<TState, TResult>(
    record: ActiveTerminalProviderOperation<TState, TResult>,
  ): TerminalProviderOperationSnapshot<TState, TResult> {
    const state = structuredClone(record.state);
    const stateProjection = state && typeof state === "object" && !Array.isArray(state)
      ? state as Record<string, unknown>
      : {};
    return Object.freeze({
      ...stateProjection,
      serviceId: record.serviceId,
      receiptId: record.receiptId,
      applicationId: record.applicationId,
      documentId: record.documentId,
      providerDocumentId: record.providerDocumentId,
      operationKind: record.operationKind,
      operationIdentity: record.operationIdentity,
      providerStatus: record.providerStatus,
      providerResultStatus: record.providerResultStatus,
      providerResult: record.providerResultStatus === "available" && record.providerResult !== null
        ? structuredClone(record.providerResult)
        : null,
      providerError: record.providerError ? Object.freeze({ ...record.providerError }) : null,
      canonicalWriteOutcomeUnknown: record.document.hasIndeterminateTerminalWrite,
      state,
    });
  }

  #claimTerminalProviderOperationRecord<TState, TResult>(
    record: ActiveTerminalProviderOperation<TState, TResult>,
    request: TerminalProviderOperationClaimRequest,
  ): TerminalProviderOperationClaim<TState, TResult> {
    if (record.claim !== null || this.#documents.get(record.documentId) !== record.document ||
        normalizeBundleIdentifier(record.document.applicationId) !== normalizeBundleIdentifier(record.applicationId)) {
      throw new DocumentUnavailableError("The terminal provider operation receipt is no longer available to claim.", { retryable: false });
    }
    let claim!: ActiveTerminalProviderOperationClaim<TState, TResult>;
    const receipt = this.#createTerminalProviderOperationReceipt(record, () => claim);
    claim = {
      claimant: request.claimant,
      applicationId: record.applicationId,
      document: record.document,
      windowControllerId: request.windowControllerId,
      generation: ++this.#terminalProviderClaimGeneration,
      receipt,
    };
    record.claim = claim;
    return Object.freeze({
      receiptId: record.receiptId,
      documentId: record.documentId,
      applicationId: record.applicationId,
      windowControllerId: claim.windowControllerId,
      generation: claim.generation,
      receipt,
      release: () => this.#releaseTerminalProviderOperationClaim(record, claim),
    });
  }

  #createTerminalProviderOperationReceipt<TState, TResult>(
    record: ActiveTerminalProviderOperation<TState, TResult>,
    claimForReceipt: () => ActiveTerminalProviderOperationClaim<TState, TResult>,
  ): TerminalProviderOperationReceipt<TState, TResult> {
    const key = this.#terminalProviderOperationKey(record.applicationId, record.documentId);
    const requireCurrentClaim = (): ActiveTerminalProviderOperation<TState, TResult> => {
      const claim = claimForReceipt();
      if (this.#terminalProviderOperations.get(key) !== record || record.claim !== claim ||
          this.#documents.get(record.documentId) !== record.document ||
          normalizeBundleIdentifier(record.document.applicationId) !== normalizeBundleIdentifier(record.applicationId)) {
        throw new DocumentUnavailableError("The terminal provider operation receipt claim is no longer authoritative.", { retryable: false });
      }
      return record;
    };
    return Object.freeze({
      receiptId: record.receiptId,
      applicationId: record.applicationId,
      documentId: record.documentId,
      providerDocumentId: record.providerDocumentId,
      operationKind: record.operationKind,
      operationIdentity: record.operationIdentity,
      snapshot: () => this.#terminalProviderOperationSnapshot(requireCurrentClaim()),
      serviceId: record.serviceId,
      waitForProvider: (signal?: AbortSignal) => awaitDocumentSignal(requireCurrentClaim().providerOutcome, signal),
      updateState: (state: TState) => {
        requireCurrentClaim();
        record.state = structuredClone(state);
        this.#emit();
        return this.#terminalProviderOperationSnapshot(record);
      },
      documentSnapshot: <TModel>() => {
        requireCurrentClaim();
        return (record.document as ApplicationDocument<TModel>).snapshot();
      },
      synchronise: <TModel>(transform: (current: Readonly<TModel>) => TModel) => {
        requireCurrentClaim();
        (record.document as ApplicationDocument<TModel>).synchroniseTerminalModel(
          record.terminalToken,
          documentAdoptionAuthority,
          transform,
        );
      },
      save: (signal?: AbortSignal) => {
        requireCurrentClaim();
        return record.document.saveTerminalReconciliation(record.terminalToken, documentAdoptionAuthority, signal);
      },
      recoverWrite: async (signal?: AbortSignal) => {
        requireCurrentClaim();
        await record.document.recoverTerminalReconciliationWrite(record.terminalToken, documentAdoptionAuthority, signal);
        if (record.providerStatus === "failed" && !record.document.hasIndeterminateTerminalWrite &&
            this.#terminalProviderOperations.get(key) === record) {
          await this.#clearTerminalProviderOperation(record);
        }
      },
      close: async (reason: DocumentCloseReason, signal?: AbortSignal) => {
        requireCurrentClaim();
        const result = await this.closeTerminalReconciliation(record.documentId, record.terminalToken, reason, signal);
        if (result.outcome === "closed" && this.#terminalProviderOperations.get(key) === record) {
          await this.#clearTerminalProviderOperation(record);
        }
        return result;
      },
      complete: () => {
        if (this.#terminalProviderOperations.get(key) !== record) return record.clearPromise ?? Promise.resolve(false);
        requireCurrentClaim();
        if (record.providerStatus !== "accepted" || record.document.hasIndeterminateTerminalWrite) {
          return Promise.reject(new DocumentUnavailableError(
            "A terminal provider operation cannot complete before its accepted provider result and canonical write are determinate.",
            { retryable: false },
          ));
        }
        return this.#clearTerminalProviderOperation(record);
      },
    });
  }

  #releaseTerminalProviderOperationClaim<TState, TResult>(
    record: ActiveTerminalProviderOperation<TState, TResult>,
    claim: ActiveTerminalProviderOperationClaim<TState, TResult>,
  ): boolean {
    const key = this.#terminalProviderOperationKey(record.applicationId, record.documentId);
    if (this.#terminalProviderOperations.get(key) !== record || record.claim !== claim ||
        this.#documents.get(record.documentId) !== record.document) return false;
    record.claim = null;
    this.#emit();
    if (record.providerStatus === "failed" && record.document.hasIndeterminateTerminalWrite) {
      void this.#recoverFailedTerminalProviderOperation(record).catch((error) => {
        this.#reportError(error, "terminal-provider-released-claim-write-recovery");
      });
    }
    return true;
  }

  async #recoverFailedTerminalProviderOperation(record: ActiveTerminalProviderOperation): Promise<void> {
    const key = this.#terminalProviderOperationKey(record.applicationId, record.documentId);
    if (this.#terminalProviderOperations.get(key) !== record || record.providerStatus !== "failed" ||
        !record.document.hasIndeterminateTerminalWrite) return;
    await record.document.recoverTerminalReconciliationWrite(record.terminalToken, documentAdoptionAuthority);
    if (this.#terminalProviderOperations.get(key) === record && !record.document.hasIndeterminateTerminalWrite) {
      await this.#clearTerminalProviderOperation(record);
    }
  }

  #terminalProviderOperationForDocument(
    document: ApplicationDocument<unknown, unknown>,
    applicationId: string,
  ): ActiveTerminalProviderOperation | null {
    return [...this.#terminalProviderOperations.values()].find((record) =>
      record.document === document && normalizeBundleIdentifier(record.applicationId) === normalizeBundleIdentifier(applicationId)) ?? null;
  }

  async #requestFinalOwnerCleanup(
    document: ApplicationDocument<unknown, unknown>,
    applicationId: string,
  ): Promise<void> {
    if (this.#documents.get(document.id) !== document || normalizeBundleIdentifier(document.applicationId) !== normalizeBundleIdentifier(applicationId)) {
      this.#deferredFinalOwnerCleanups.delete(document);
      return;
    }
    if (this.hasActiveDocumentOwnerLease(document.id, applicationId)) return;
    // Open windows pin the document: suspending an app releases its mounts'
    // owner leases, but a document backing live windows must not be cleaned
    // up from underneath them. The entry is kept so the last window's
    // dissociation resumes the cleanup (see dissociateWindow).
    let deferred = this.#deferredFinalOwnerCleanups.get(document);
    if (document.windowControllerIds.length > 0) {
      if (!deferred) {
        this.#deferredFinalOwnerCleanups.set(document, {
          document,
          applicationId,
          terminalToken: this.#terminalProviderOperationForDocument(document, applicationId)?.terminalToken ?? null,
          promise: null,
        });
      }
      return;
    }
    if (!deferred) {
      deferred = {
        document,
        applicationId,
        terminalToken: this.#terminalProviderOperationForDocument(document, applicationId)?.terminalToken ?? null,
        promise: null,
      };
      this.#deferredFinalOwnerCleanups.set(document, deferred);
    }
    // Serialisation: a terminal lease defers entirely, and an in-flight
    // cleanup is joined rather than duplicated — exactly one task per doc.
    if (document.hasTerminalReconciliationLease) return;
    if (deferred.promise) return deferred.promise;
    const dirtyRevision = document.dirtyRevision;
    const cleanup = (async () => {
      try {
        if (this.#documents.get(document.id) !== document || normalizeBundleIdentifier(document.applicationId) !== normalizeBundleIdentifier(applicationId) ||
            document.hasTerminalReconciliationLease || this.hasActiveDocumentOwnerLease(document.id, applicationId) ||
            document.windowControllerIds.length > 0) return;
        if (document.state === "dirty") await this.saveDocument(document.id, { reason: "explicit" });
        if (this.#documents.get(document.id) !== document || normalizeBundleIdentifier(document.applicationId) !== normalizeBundleIdentifier(applicationId) ||
            document.hasTerminalReconciliationLease || document.dirtyRevision !== dirtyRevision ||
            this.hasActiveDocumentOwnerLease(document.id, applicationId) ||
            document.windowControllerIds.length > 0) return;
        await this.#closeDocumentCore(document.id, "parent-close", undefined, () => (
          this.#documents.get(document.id) === document &&
          normalizeBundleIdentifier(document.applicationId) === normalizeBundleIdentifier(applicationId) &&
          !document.hasTerminalReconciliationLease &&
          !this.hasActiveDocumentOwnerLease(document.id, applicationId) &&
          document.windowControllerIds.length === 0
        ));
      } catch {
        // Final-owner cleanup is intentionally best effort. A failed save or
        // close leaves this exact document open rather than closing a newer
        // same-ID generation.
      }
    })();
    deferred.promise = cleanup;
    void cleanup.finally(() => {
      if (this.#deferredFinalOwnerCleanups.get(document) !== deferred) return;
      deferred!.promise = null;
      // A window-pinned bail keeps its entry: the last window's dissociation
      // resumes it. Only a terminal lease or a completed pass clears it.
      if (!document.hasTerminalReconciliationLease && document.windowControllerIds.length === 0) {
        this.#deferredFinalOwnerCleanups.delete(document);
      }
    });
    return cleanup;
  }

  #resumeDeferredFinalOwnerCleanup(record: ActiveTerminalProviderOperation): void {
    const deferred = this.#deferredFinalOwnerCleanups.get(record.document);
    if (!deferred || normalizeBundleIdentifier(deferred.applicationId) !== normalizeBundleIdentifier(record.applicationId) || deferred.terminalToken !== record.terminalToken) return;
    void this.#requestFinalOwnerCleanup(record.document, record.applicationId).catch((error) => {
      this.#reportError(error, "terminal-provider-final-owner-cleanup");
    });
  }

  #clearTerminalProviderOperation(record: ActiveTerminalProviderOperation): Promise<boolean> {
    if (record.clearPromise) return record.clearPromise;
    const key = this.#terminalProviderOperationKey(record.applicationId, record.documentId);
    const clear = (async () => {
      if (this.#terminalProviderOperations.get(key) !== record) return false;
      if (this.#documents.get(record.documentId) === record.document) {
        const ended = await record.document.endTerminalReconciliation(
          record.terminalToken,
          documentAdoptionAuthority,
        );
        if (!ended && this.#documents.get(record.documentId) === record.document) {
          throw new DocumentUnavailableError(
            "The terminal provider operation could not release its canonical reconciliation authority.",
            { retryable: false },
          );
        }
      }
      record.releaseProviderLock();
      if (this.#terminalProviderOperations.get(key) !== record) return false;
      record.claim = null;
      this.#terminalProviderOperations.delete(key);
      this.#emit();
      this.#resumeDeferredFinalOwnerCleanup(record);
      return true;
    })();
    record.clearPromise = clear;
    return clear;
  }

  #reportError(error: unknown, context: string): void {
    try { this.dependencies.observeError?.(error, context); } catch { /* diagnostics cannot own document authority */ }
  }

  #trackApplicationAdmission<T>(
    ticket: ApplicationSessionMutationTicket | null,
    operation: Promise<T>,
  ): Promise<T> {
    if (!ticket) return operation;
    const admissions = this.#applicationAdmissions.get(normalizeBundleIdentifier(ticket.applicationId)) ?? new Set<Promise<unknown>>();
    this.#applicationAdmissions.set(normalizeBundleIdentifier(ticket.applicationId), admissions);
    admissions.add(operation);
    void operation.finally(() => {
      admissions.delete(operation);
      if (admissions.size === 0 && this.#applicationAdmissions.get(normalizeBundleIdentifier(ticket.applicationId)) === admissions) {
        this.#applicationAdmissions.delete(normalizeBundleIdentifier(ticket.applicationId));
      }
    }).catch(() => undefined);
    return operation;
  }

  #requireApplicationCloseLease(lease: ApplicationSessionCloseLease): void {
    if (this.#applicationCloseLeases.get(normalizeBundleIdentifier(lease.applicationId)) !== lease ||
        (this.#applicationEpochs.get(normalizeBundleIdentifier(lease.applicationId)) ?? 0) !== lease.epoch) {
      throw new DocumentUnavailableError("Application close authority is stale.", { retryable: true });
    }
  }

  #touchRecent(typeId: string, location: DocumentLocation): void {
    const id = canonicalDocumentLocation(location);
    this.#recentDocuments.set(id, Object.freeze({
      id,
      typeId,
      location: structuredClone(location),
      lastOpenedAt: new Date(this.dependencies.environment.now()).toISOString(),
    }));
  }

  #assertDocumentIdAvailable(documentId: string): void {
    if (!documentId.trim() || this.#documents.has(documentId) || this.#reservedDocumentIds.has(documentId)) {
      throw new DocumentRequestedIdConflictError(documentId);
    }
  }

  #requireOpenDocument(documentId: string): ApplicationDocument<unknown, unknown> {
    const document = this.#documents.get(documentId);
    if (!document) throw new DocumentUnavailableError(`Document "${documentId}" is not open.`, { retryable: false });
    return document;
  }

  #resolveAdapter(location: DocumentLocation): DocumentStorageAdapter {
    const candidates = [...this.#adapters.values()].filter((adapter) => adapter.supports(location));
    if (candidates.length === 0) throw new DocumentAdapterUnavailableError(location);
    if (candidates.length > 1) throw new DocumentAdapterAmbiguousError(location, candidates.map(({ id }) => id));
    return candidates[0]!;
  }

  #captureAdapter(location: DocumentLocation): { readonly adapter: DocumentStorageAdapter; readonly generation: number } {
    const adapter = this.#resolveAdapter(location);
    const generation = this.#adapterGenerations.get(adapter.id);
    if (generation === undefined) throw new DocumentAdapterUnavailableError(location);
    return Object.freeze({ adapter, generation });
  }

  #registeredAdapterAdmission(adapter: DocumentStorageAdapter): { readonly adapter: DocumentStorageAdapter; readonly generation: number } {
    const generation = this.#adapterGenerations.get(adapter.id);
    if (generation === undefined || this.#adapters.get(adapter.id) !== adapter) {
      throw new DocumentUnavailableError(`Document adapter "${adapter.id}" is no longer registered.`, { retryable: false });
    }
    return Object.freeze({ adapter, generation });
  }

  #isCurrentAdapter(admission: { readonly adapter: DocumentStorageAdapter; readonly generation: number }): boolean {
    return this.#adapters.get(admission.adapter.id) === admission.adapter && this.#adapterGenerations.get(admission.adapter.id) === admission.generation;
  }

  #replaceRegistration(
    kind: "close",
    value: DocumentCloseReviewer,
  ): DocumentCloseReviewerRegistration;
  #replaceRegistration(
    kind: "conflict",
    value: DocumentConflictReviewer,
  ): DocumentConflictReviewerRegistration;
  #replaceRegistration(
    kind: "destination",
    value: DocumentSaveDestinationProvider,
  ): DocumentSaveDestinationProviderRegistration;
  #replaceRegistration(
    kind: "presentation",
    value: DocumentPresentationCloseCoordinator,
  ): DocumentPresentationCloseCoordinatorRegistration;
  #replaceRegistration(
    kind: "close" | "conflict" | "destination" | "presentation",
    value: DocumentCloseReviewer | DocumentConflictReviewer | DocumentSaveDestinationProvider | DocumentPresentationCloseCoordinator,
  ): { dispose(): void } {
    const generation = ++this.#registrationGenerations[kind];
    if (kind === "close") this.#closeReviewer = value as DocumentCloseReviewer;
    else if (kind === "conflict") this.#conflictReviewer = value as DocumentConflictReviewer;
    else if (kind === "destination") this.#saveDestinationProvider = value as DocumentSaveDestinationProvider;
    else this.#presentationCloseCoordinator = value as DocumentPresentationCloseCoordinator;
    let disposed = false;
    return { dispose: () => {
      if (disposed) return;
      disposed = true;
      if (this.#registrationGenerations[kind] !== generation) return;
      if (kind === "close") this.#closeReviewer = null;
      else if (kind === "conflict") this.#conflictReviewer = null;
      else if (kind === "destination") this.#saveDestinationProvider = null;
      else this.#presentationCloseCoordinator = null;
    } };
  }

  async #operate<I, T>(kind: string, input: I, signal: AbortSignal | undefined, run: () => Promise<T>): Promise<T> {
    throwIfDocumentAborted(signal);
    const handle = this.dependencies.operations.run({ kind, input, commit: run });
    const cancel = () => handle.cancel("Document operation aborted.");
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    try {
      const result = await handle.result;
      if (result.status === "completed") return result.value;
      if (result.status === "cancelled") throw new DocumentAbortError(result.reason);
      const cause = result.error.cause;
      if (cause) throw cause;
      throw new DocumentUnavailableError(result.error.message, { retryable: false });
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }

  #emit(): void {
    if (this.#notificationSuppression > 0) {
      this.#notificationPending = true;
      return;
    }
    for (const listener of [...this.#listeners]) {
      try { listener(); } catch { /* subscriber isolation */ }
    }
  }
}
