/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { AUFXAudioEngine } from "../../FX/AudioFX/AUFXAudioEngine";
import type { AUFXAudioFormat } from "../../FX/AudioFX/AUFXAudioFormat";
import type { AUFXAudioSession } from "../../FX/AudioFX/AUFXAudioSession";
import type { AUFXAudioFile, AUFXAudioFileCapabilities, AUFXAudioFileExport, AUFXAudioFileExportOptions, AUFXAudioFileOpenRequest, AUFXAudioStreamExport, AUFXAudioStreamExportOptions } from "../../FX/AudioFX/AUFXAudioFile";
import type { SynCloudOSTranslationParams } from "../LocaleServices/localeTypes";
import type { AppWindowCloseResult } from "./appDefinitionTypes";
import type { SynWareServiceToken } from "./serviceToken";
import type { CommandDispatchOptions, CommandDispatchPreparation, CommandValidationOptions } from "../SynCloudOS";
import type { DocumentAssetReference, DocumentAssetStoreCapabilities } from "../Documents";
import type { DocumentResourceDescriptor, DocumentResourceInput, DocumentResourceInvalidation } from "../Documents";
import type { DocumentEditOptions, DocumentEditResourceRetention, DocumentEditResult } from "../Documents";
import type { DocumentEditingLifetimeOptions, DocumentEditingParticipant, DocumentEditingParticipantRegistration, DocumentEditingReason, DocumentEditingSettlementResult } from "../Documents";
export type {
  AppWindowChromeActions,
  AppWindowChromePointerDownEvent,
  AppWindowChromeProps,
  AppWindowChromeSnapshot,
  AppWindowCloseResult,
} from "./appDefinitionTypes";

/** Opaque release handles are the only registration ownership values exposed
 * to application code. They intentionally do not reveal host implementation
 * objects. */
export interface AppClientHandle {
  dispose(): boolean | void;
}

export interface AppBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type SynCloudOSHorizontalSizeClass = "compact" | "regular" | "wide";

/** Immutable, content-bound presentation values for the current mount. */
export interface SynCloudOSPresentationTraits {
  readonly revision: number;
  readonly contentBounds: AppBounds;
  readonly hostViewportBounds: AppBounds;
  readonly horizontalSizeClass: SynCloudOSHorizontalSizeClass;
  readonly orientation: "portrait" | "landscape";
  readonly workArea: AppBounds;
  readonly visualViewportBounds: AppBounds;
  readonly safeAreaInsets: Readonly<{
    blockStart: number;
    inlineEnd: number;
    blockEnd: number;
    inlineStart: number;
  }>;
  readonly virtualKeyboardInset: number;
  readonly devicePixelRatio: number;
  readonly primaryPointer: "fine" | "coarse" | "none";
  readonly hover: boolean;
  readonly touch: boolean;
  readonly reducedMotion: boolean;
  readonly reducedTransparency: boolean;
  readonly forcedColours: boolean;
}

export interface AppPresentationClient {
  getSnapshot(): SynCloudOSPresentationTraits;
  subscribe(listener: () => void): () => void;
}

export interface AppLifecycleEvent {
  readonly state: "suspended" | "closed";
}

export interface AppLifecycleClient {
  closeSelf(options?: Readonly<Record<string, unknown>>): unknown;
  subscribe(listener: (event: AppLifecycleEvent) => void): () => void;
}

export interface AppCommandClient {
  /** Current command authority evidence, available only while this mount is live. */
  getPresentationGeneration(): Readonly<{ registryGeneration: number; responderGeneration: number }>;
  register(declaration: object): AppClientHandle & Readonly<{ commandId: string; responderId: string }>;
  createPayload(...fields: readonly unknown[]): Readonly<Record<string, unknown>>;
  createPayloadArray(...values: readonly unknown[]): readonly unknown[];
  dispatch<R = unknown>(
    id: string, payload?: unknown,
    options?: Readonly<Record<string, unknown>> | Pick<CommandDispatchOptions, "source" | "correlationId" | "signal" | "acceptance">,
  ): Promise<R>;
  prepareDispatch(
    id: string, payload?: unknown,
    options?: Readonly<Record<string, unknown>> | Pick<CommandDispatchOptions, "source" | "correlationId" | "signal" | "acceptance">,
  ): CommandDispatchPreparation | Promise<CommandDispatchPreparation>;
  validate(id: string, payload?: unknown, options?: Readonly<Record<string, unknown>>): Promise<AppCommandPresentation>;
  validateMany(
    requests: readonly Readonly<{ key: string; commandId: string; payload?: unknown }>[],
    options?: Readonly<Record<string, unknown>> | Pick<CommandValidationOptions, "source" | "signal" | "generation">,
  ): Promise<ReadonlyMap<string, AppCommandPresentation>>;
}

export interface AppCommandPresentation {
  readonly commandId: string;
  readonly responderId: string | null;
  readonly title: string;
  readonly icon?: string;
  readonly enabled: boolean;
  readonly denied: boolean;
  readonly hidden: boolean;
  readonly state: "off" | "on" | "mixed";
  readonly disabledReason?: string;
  readonly stale?: boolean;
}

export interface AppFocusScope extends AppClientHandle {
  readonly id: string;
  close(options?: Readonly<{ restore?: boolean }>): Readonly<{ status: string; scopeId: string; restoredResponderId: string | null }>;
}

export interface AppResponderClient {
  requestFocus(target: string, options?: Readonly<Record<string, unknown>>): unknown;
  openScope(scope: Readonly<Record<string, unknown>>): AppFocusScope;
  isScopeWithin(scopeId: string, ancestorScopeId: string): boolean;
  getFocusedResponderId(): string | null;
}

export interface AppUndoOwner {
  readonly kind: "application" | "document";
  readonly id: string;
}

/** A mounted app may register only application-owned inverse work. This
 * intentionally omits manager-wide grouping, inspection, clearing, and
 * disposal authority. */
export interface AppUndoAction {
  readonly name: string;
  readonly asyncPolicy: "forbid" | "await";
  undo(): void | Promise<void>;
  redo(): void | Promise<void>;
  readonly estimatedBytes?: number;
  cleanup?(): void;
}

export interface AppUndoReservation {
  commit(action: AppUndoAction, options?: Readonly<{
    automaticGroup?: Readonly<{ kind: "typing" | "drag" | "stepper"; key: string; boundaryId: string }>;
  }>): string;
  cancel(): void;
}

export interface AppUndoHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoTitle: string | null;
  readonly redoTitle: string | null;
  readonly isExecuting: boolean;
  register(action: AppUndoAction, options?: Readonly<{
    automaticGroup?: Readonly<{ kind: "typing" | "drag" | "stepper"; key: string; boundaryId: string }>;
  }>): string;
  reserve(): AppUndoReservation;
  undo(signal?: AbortSignal): unknown;
  redo(signal?: AbortSignal): unknown;
  subscribe(listener: () => void): () => void;
}

export interface AppUndoClient {
  get(owner: AppUndoOwner): AppUndoHistory | null;
  create(owner: AppUndoOwner, options?: Readonly<Record<string, unknown>>): AppUndoHistory;
}

/** One captured native candidate; retainResources is consumed by the document transaction. */
export interface AppDocumentAssetPreparedEdit<TModel> {
  readonly expectedRevision: number;
  retainResources(before: Readonly<TModel>, after: Readonly<TModel>): DocumentEditResourceRetention;
  /** Abandons unused preparation; admitted retention belongs to canonical history. */
  release(): Promise<void>;
}

export interface AppDocumentResourcesClient {
  readonly assetCapabilities?: DocumentAssetStoreCapabilities;
  acquire(documentId: string, resource: DocumentResourceInput, signal?: AbortSignal): Promise<DocumentResourceDescriptor>;
  acquireAsset(documentId: string, reference: DocumentAssetReference, signal?: AbortSignal): Promise<DocumentResourceDescriptor>;
  persist(documentId: string, descriptor: DocumentResourceDescriptor, signal?: AbortSignal): Promise<DocumentAssetReference>;
  prepareEdit<TModel>(documentId: string, before: Readonly<TModel>, after: Readonly<TModel>, options?: Readonly<{ signal?: AbortSignal }>): Promise<AppDocumentAssetPreparedEdit<TModel>>;
  isActive(documentId: string, descriptor: unknown): descriptor is DocumentResourceDescriptor;
  resolve(documentId: string, descriptor: DocumentResourceDescriptor, signal?: AbortSignal): Uint8Array | null;
  subscribeInvalidation(listener: (entry: DocumentResourceInvalidation) => void): () => void;
  release(documentId: string, descriptor: DocumentResourceDescriptor): boolean;
}

export interface AppWorkspaceDocumentsClient {
  hasType(typeId: string): boolean;
  getDocument<TModel = unknown>(documentId: string): AppDocumentSnapshot<TModel> | null;
  subscribeDocument(documentId: string, listener: () => void): () => void;
  retainDocument<TModel = unknown>(documentId: string): AppDocumentSnapshot<TModel> | null;
  releaseDocument(documentId: string): Promise<boolean>;
  getUndoManager(documentId: string): AppUndoHistory;
  openDocument<TModel = unknown>(request: AppDocumentOpenRequest<TModel>): Promise<AppDocumentSnapshot<TModel>>;
  newDocument<TModel = unknown>(request: AppDocumentNewRequest<TModel>): Promise<AppDocumentSnapshot<TModel>>;
  registerWorkflowProvider(provider: AppDocumentWorkflowProvider): AppClientHandle;
  newProjectionDocument<TModel = unknown>(request: AppDocumentNewProjectionRequest<TModel>): Promise<AppDocumentSnapshot<TModel>>;
  updateDocument<TModel = unknown>(documentId: string, transform: (current: Readonly<TModel>) => TModel, options: Readonly<{ actionName: string; coalescingKey?: string; recordUndo?: boolean }>): void;
  transactDocument<TModel = unknown>(documentId: string, transform: (current: Readonly<TModel>) => TModel, options: DocumentEditOptions<TModel>): DocumentEditResult;
  registerEditingParticipant<TModel = unknown>(documentId: string, participant: DocumentEditingParticipant<TModel>, options?: Pick<DocumentEditingLifetimeOptions, "signal">): DocumentEditingParticipantRegistration;
  settleEditing(documentId: string, reason: DocumentEditingReason, signal?: AbortSignal): Promise<DocumentEditingSettlementResult>;
  synchroniseDocument<TModel = unknown>(documentId: string, transform: (current: Readonly<TModel>) => TModel): void;
  enterDocumentConflict<TModel = unknown>(documentId: string, conflict: AppDocumentConflictInput<TModel>): void;
  resolveDocumentConflict<TModel = unknown>(documentId: string, resolution: AppDocumentConflictResolution<TModel>, signal?: AbortSignal): Promise<void>;
  saveDocument(documentId: string, options?: AppDocumentSaveOptions): Promise<void>;
  saveAsDocument(request: AppDocumentSaveAsRequest): Promise<AppDocumentSaveAsResult>;
  duplicateDocument<TModel = unknown>(documentId: string, location: AppDocumentLocation): Promise<AppDocumentSnapshot<TModel>>;
  moveDocument(request: AppDocumentMoveRequest): Promise<AppDocumentMoveResult>;
  revertDocument(documentId: string, version?: AppDocumentVersion, signal?: AbortSignal): Promise<void>;
  closeDocument(documentId: string, options?: AppDocumentCloseOptions): Promise<AppDocumentCloseResult>;
  listDocumentVersions(documentId: string, signal?: AbortSignal): Promise<readonly AppDocumentVersion[]>;
  /** A saved version's model, read without changing the open document (NSFileVersion's contents):
   * what a version browser shows and compares. */
  readDocumentVersion<TModel = unknown>(documentId: string, version: AppDocumentVersion, signal?: AbortSignal): Promise<TModel>;
  restoreDocumentVersion(documentId: string, version: AppDocumentVersion, signal?: AbortSignal): Promise<void>;
}

export type AppDocumentLocation =
  | Readonly<{ kind: "memory"; namespace: string; key: string }>
  | Readonly<{ kind: "indexed-db"; database: string; store: string; key: string }>
  | Readonly<{ kind: "document-store"; documentId: string }>
  | Readonly<{ kind: "remote"; url: string }>;

export interface AppDocumentVersion {
  readonly id: string;
  readonly sequence: number;
  readonly savedAt: string;
  readonly etag: string;
}

export interface AppDocumentRecord<TModel = unknown> {
  readonly location: AppDocumentLocation;
  readonly typeId: string;
  readonly schemaVersion: number;
  readonly content: TModel;
  readonly version: AppDocumentVersion;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface AppDocumentConflict<TModel = unknown> {
  readonly base: AppDocumentRecord<unknown> | null;
  readonly localModel: Readonly<TModel>;
  readonly remote: AppDocumentRecord<unknown> | null;
  readonly remoteState?: "deleted" | "read-only";
  readonly detectedAt: string;
}

export interface AppDocumentConflictInput<TModel = unknown> {
  readonly base: AppDocumentRecord<unknown> | null;
  readonly localModel: TModel;
  readonly remote: AppDocumentRecord<unknown> | null;
  readonly remoteState?: "deleted" | "read-only";
}

export type AppDocumentConflictResolution<TModel = unknown> =
  | Readonly<{ kind: "use-local"; expectedRemoteVersion: AppDocumentVersion }>
  | Readonly<{ kind: "use-remote" }>
  | Readonly<{ kind: "recreate" }>
  | Readonly<{ kind: "merge"; model: TModel; expectedRemoteVersion: AppDocumentVersion }>;

export interface AppDocumentOpenRequest<TModel = unknown> {
  readonly documentId?: string;
  readonly typeId: string;
  readonly location: AppDocumentLocation;
  readonly initialModel?: TModel;
  readonly activate?: boolean;
  readonly signal?: AbortSignal;
}

export interface AppDocumentNewRequest<TModel = unknown> {
  readonly documentId?: string;
  readonly typeId: string;
  readonly location?: AppDocumentLocation;
  readonly initialModel?: TModel;
  readonly activate?: boolean;
  readonly signal?: AbortSignal;
}

/**
 * Creation request for a read-only, non-dirty projection document. No
 * location (projections are never saved) and no editable options — the
 * method itself is the declaration.
 */
export interface AppDocumentNewProjectionRequest<TModel = unknown> {
  readonly documentId?: string;
  readonly typeId: string;
  readonly initialModel: TModel;
  readonly activate?: boolean;
  readonly signal?: AbortSignal;
}

export interface AppDocumentSaveOptions {
  readonly reason?: "autosave" | "explicit" | "close" | "conflict-resolution";
  readonly signal?: AbortSignal;
}

export interface AppDocumentCloseOptions {
  readonly reason?: "user" | "window-control" | "window-command";
  readonly signal?: AbortSignal;
}

export interface AppDocumentWorkflowContext {
  readonly applicationId: string;
  readonly signal: AbortSignal;
}

/** App-owned model/type and file-panel choices; validation never opens a panel. */
export interface AppDocumentWorkflowProvider {
  readonly chooseNewDocument?: (context: AppDocumentWorkflowContext) => AppDocumentNewRequest | null | Promise<AppDocumentNewRequest | null>;
  readonly chooseOpenDocument?: (context: AppDocumentWorkflowContext) => AppDocumentOpenRequest | null | Promise<AppDocumentOpenRequest | null>;
  readonly validate?: (action: "new" | "open") => Readonly<{ enabled: boolean; disabledReason?: string }>;
}

export type AppDocumentDestinationConflictPolicy =
  | Readonly<{ kind: "fail-if-exists" }>
  | Readonly<{ kind: "replace"; expectedVersion: AppDocumentVersion }>;

export interface AppDocumentSaveAsRequest {
  readonly documentId: string;
  readonly destination: AppDocumentLocation;
  readonly conflict?: AppDocumentDestinationConflictPolicy;
  readonly signal?: AbortSignal;
}

export interface AppDocumentSaveAsResult {
  readonly documentId: string;
  readonly previousLocation: AppDocumentLocation | null;
  readonly location: AppDocumentLocation;
  readonly version: AppDocumentVersion;
}

export interface AppDocumentMoveRequest extends AppDocumentSaveAsRequest {
  readonly expectedSourceVersion: AppDocumentVersion;
}

export type AppDocumentMoveResult =
  | Readonly<AppDocumentSaveAsResult & { outcome: "moved" }>
  | Readonly<AppDocumentSaveAsResult & {
      outcome: "copied-source-retained";
      sourceRemovalError: Readonly<{ name: string; code: string; message: string }>;
    }>;

export type AppDocumentCloseResult =
  | Readonly<{ outcome: "closed"; documentId: string }>
  | Readonly<{ outcome: "cancelled"; documentId: string }>
  | Readonly<{ outcome: "refused"; documentId: string; reason: "presentation-coordinator-unavailable" | "storage-transaction-unavailable" | "editing-refused" | "editing-revoked" }>;

export interface AppDocumentSnapshot<TModel = unknown> {
  readonly id: string;
  readonly applicationId: string | null;
  readonly typeId: string;
  readonly location: AppDocumentLocation | null;
  readonly model: Readonly<TModel>;
  readonly documentKind: "standard" | "projection";
  readonly readOnly: boolean;
  readonly state: "loading" | "clean" | "dirty" | "saving" | "conflicted" | "read-only" | "deleted" | "closing" | "closed";
  readonly currentVersion: AppDocumentVersion | null;
  readonly dirtyRevision: number;
  readonly conflict: AppDocumentConflict<TModel> | null;
  readonly lastError: Error | null;
}

/** Documents remain app-owned. Generic host document data is intentionally
 * absent; typed app-domain services are introduced separately. */
export interface AppDocumentClient {
  readonly documentResources: AppDocumentResourcesClient;
  readonly workspaceDocuments: AppWorkspaceDocumentsClient;
}

export interface AppPasteboardContext {
  readonly appId: string;
  readonly sessionId?: string;
}

export interface AppPasteboard {
  readonly name: string;
  readonly context: AppPasteboardContext;
  readonly changeCount: number;
  snapshot(signal?: AbortSignal): Promise<readonly unknown[]>;
  write(values: readonly unknown[], signal?: AbortSignal): Promise<unknown>;
  read(types: readonly string[], signal?: AbortSignal): Promise<readonly unknown[]>;
  readFirst(types: readonly string[], signal?: AbortSignal): Promise<unknown | null>;
  clear(): unknown;
}

export interface AppPasteboardClient {
  readonly context: AppPasteboardContext;
  readonly system: AppPasteboard;
  readonly drag: AppPasteboard;
  readonly find: AppPasteboard;
  named(name: string): AppPasteboard;
}

export interface AppDragEndpoint {
  readonly appId: string;
  readonly windowId: string;
  readonly responderId: string;
}

export type AppDragOperation = "copy" | "move" | "link";

/** Opaque session objects can be supplied only to operations on the same
 * mounted client. They intentionally have no caller-visible manager ID. */
export interface AppDragSession {
  readonly opaque: unique symbol;
}

export interface AppDragRepresentation {
  readonly type: string;
  readonly value: unknown;
}

export interface AppDragDestinationRequest {
  readonly endpoint: AppDragEndpoint;
  readonly operations: readonly AppDragOperation[];
  readonly accept?: (session: AppDragSession, signal: AbortSignal) => boolean | void | Promise<boolean | void>;
}

/** Transfer endpoints retain their mounted subject; no global drag authority
 * is part of this application contract. */
export interface AppDragClient {
  endpoint(options?: Readonly<{ responderId?: string }>): AppDragEndpoint;
  begin(input: Readonly<{
    source: AppDragEndpoint;
    representations: readonly AppDragRepresentation[];
    operations: readonly AppDragOperation[];
  }>): AppDragSession;
  active(): AppDragSession | null;
  updateDestination(session: AppDragSession, request: AppDragDestinationRequest): Promise<Readonly<{ operation: AppDragOperation | "none" }>>;
  claimDrop(session: AppDragSession): void;
  readPayload(session: AppDragSession, types: readonly string[], signal: AbortSignal): readonly AppDragRepresentation[];
  performDrop(session: AppDragSession): Promise<Readonly<{ accepted: boolean; operation: AppDragOperation | "none" }>>;
  cancel(session: AppDragSession, reason?: string): void;
  cancelUnclaimed(session: AppDragSession, reason?: string): boolean;
}

export interface AppColourPanelClient {
  /** Opaque same-session marker consumed only by AppSDK-to-NSE adapters. It
   * carries no manager methods or host identity data. */
  readonly authorityToken: object;
  getSnapshot(): AppColourPanelSnapshot;
  getPickers(): readonly object[];
  subscribe(listener: () => void): () => void;
  registerPicker(...arguments_: readonly unknown[]): AppClientHandle;
  activateTarget(...arguments_: readonly unknown[]): AppClientHandle;
  open(...arguments_: readonly unknown[]): unknown;
  close(...arguments_: readonly unknown[]): unknown;
  choosePicker(...arguments_: readonly unknown[]): unknown;
  preview(...arguments_: readonly unknown[]): unknown;
  commit(...arguments_: readonly unknown[]): unknown;
  cancel(...arguments_: readonly unknown[]): unknown;
  addRecent(css: string): void;
  setSwatches(css: readonly string[]): void;
}

export interface AppColourPanelSnapshot {
  readonly status: "active" | "disposed";
  readonly open: boolean;
  readonly activeTargetId: string | null;
  readonly activePickerId: string | null;
  readonly currentCSS: string | null;
  readonly previousCSS: string | null;
  readonly recents: readonly string[];
}

export interface AUFXAudioHandle {
  readonly id: string;
}

export interface AUFXAudioClient {
  createEngine(format: AUFXAudioFormat, signal?: AbortSignal): AUFXAudioEngine;
  createSession(signal?: AbortSignal): AUFXAudioSession;
  fileCapabilities(): AUFXAudioFileCapabilities;
  openFile(request: AUFXAudioFileOpenRequest, signal?: AbortSignal): Promise<AUFXAudioFile>;
  exportFile(file: AUFXAudioFile, signal?: AbortSignal, options?: AUFXAudioFileExportOptions): Promise<AUFXAudioFileExport>;
  exportStream(options: AUFXAudioStreamExportOptions, signal?: AbortSignal): Promise<AUFXAudioStreamExport>;
  activation(handleId: string): unknown;
  load(request: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<AUFXAudioHandle>;
  play(handleId: string, activation?: unknown): Promise<unknown>;
  pause(handleId: string): unknown;
  stop(handleId: string): unknown;
  setLoop(handleId: string, loop: boolean): void;
  setVolume(handleId: string, volume: number): void;
  setRate(handleId: string, rate: number): void;
  setCurrentTime(handleId: string, time: number): void;
  release(handleId: string, reason?: string): boolean;
  suspend(): void;
  resume(): void;
}

export interface AppNavigationRoute {
  readonly pathname: string;
  readonly kind: "webspring" | "app" | "external" | "notFound";
  readonly appId?: string;
}

export interface AppNavigationOptions {
  readonly source?: string;
  readonly syncRoute?: boolean;
  readonly historyMode?: "push" | "replace";
  readonly context?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
  readonly correlationId?: string;
}

export type AppNavigationTransitionResult =
  | Readonly<{ outcome: "settled"; operationId: string; correlationId: string; committed: true; route: AppNavigationRoute; postCommit: "completed" }>
  | Readonly<{ outcome: "route-error"; operationId: string; correlationId: string; committed: true; route: AppNavigationRoute; postCommit: "failed"; code: string; reason: string }>
  | Readonly<{ outcome: "presentation-timeout"; operationId: string; correlationId: string; committed: true; route: AppNavigationRoute; postCommit: "failed"; pendingRoles: readonly string[]; reason: string }>
  | Readonly<{ outcome: "cancelled"; operationId: string; correlationId: string; committed: true; route: AppNavigationRoute; postCommit: "cancelled"; reason: string }>
  | Readonly<{ outcome: "cancelled" | "superseded"; operationId: string; correlationId: string; committed: false; reason: string }>
  | Readonly<{ outcome: "invalid-query"; operationId: string; correlationId: string; committed: false; code: "route-invalid-query"; reason: string }>
  | Readonly<{ outcome: "blocked"; operationId: string; correlationId: string; committed: false; reason: string }>
  | Readonly<{ outcome: "denied"; operationId: string; correlationId: string; committed: false; code: "route-denied" | "route-unauthorised"; reason: string }>
  | Readonly<{ outcome: "not-found"; operationId: string; correlationId: string; committed: false; code: "route-not-found"; reason: string }>
  | Readonly<{ outcome: "redirected"; operationId: string; correlationId: string; committed: false; successorId: string; reason: string }>
  | Readonly<{ outcome: "failed"; operationId: string; correlationId: string; committed: false; code: string; reason: string }>;

export interface AppNavigationTransitionHandle {
  readonly operationId: string;
  readonly correlationId: string;
  readonly signal: AbortSignal;
  readonly result: Promise<AppNavigationTransitionResult>;
  cancel(reason?: string): void;
  retry(): AppNavigationTransitionHandle;
  replace(pathname: string): AppNavigationTransitionHandle;
}

export interface AppNavigationClient {
  openRoute(pathname: string, options?: AppNavigationOptions): AppNavigationTransitionHandle;
}

export interface AppLocaleSnapshot {
  readonly locale: string;
  readonly dictionaryVersion?: number;
  readonly timeZone?: string | null;
}

export interface AppLocaleClient {
  getSnapshot(): AppLocaleSnapshot;
  subscribe(listener: () => void): () => void;
  getActiveLocale(): string;
  getSupportedLocales(): readonly string[];
  formatDate(value: Date | number | string, options?: Intl.DateTimeFormatOptions): string;
  formatTime(value: Date | number | string, options?: Intl.DateTimeFormatOptions): string;
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
  formatFileSize(bytes: number, options?: Readonly<Record<string, unknown>>): string;
  formatRelativeTime(value: number, unit?: Intl.RelativeTimeFormatUnit, options?: Intl.RelativeTimeFormatOptions): string;
  formatList(values: readonly string[], options?: Intl.ListFormatOptions): string;
  t(key: string, params?: SynCloudOSTranslationParams | string, namespace?: string): string;
}

export interface AppAppearanceClient {
  get(): object;
  resolved(): string;
  subscribe(listener: () => void): () => void;
}

export interface AppOwnedWindowSnapshot {
  readonly id: string;
  readonly title: string;
  readonly state: "opening" | "open" | "minimised" | "closing";
  readonly bounds: AppBounds;
  readonly documentId: string | null;
  readonly documentAssociationRole: "primary" | "secondary" | "inspector" | null;
  readonly mobilePolicy: "fullscreen" | "sheet" | "popover-to-sheet" | "hidden";
  readonly restorationKey: string | null;
  readonly isKey: boolean;
  readonly isMain: boolean;
}

export interface AppOpenDocumentWindowRequest {
  readonly documentId: string;
  readonly title: string;
  readonly restorationKey: string;
  readonly preferredBounds?: AppBounds;
  readonly mobilePolicy?: AppOwnedWindowSnapshot["mobilePolicy"];
}

export interface AppWindowSnapshot {
  readonly appId: string;
  readonly sessionId: string;
  readonly state: "open" | "closed";
  readonly current: AppOwnedWindowSnapshot | null;
  readonly owned: readonly AppOwnedWindowSnapshot[];
  /** Mount surface: "window" for document-window mounts, absent/"application"
   * for the stage (app-view) mount. Lets apps distinguish a departing window
   * from the primary surface when `current` is null. */
  readonly surface?: "application" | "window";
}

/** A presentation-scoped window projection. Applications can observe only
 * their own session's lifecycle. */
export interface AppWindowClient {
  getSnapshot(): AppWindowSnapshot;
  subscribe(listener: () => void): () => void;
  openDocumentWindow(request: AppOpenDocumentWindowRequest): Promise<AppOwnedWindowSnapshot>;
  focus(windowId: string): AppOwnedWindowSnapshot;
  close(windowId: string): Promise<AppWindowCloseResult>;
}

export interface AppServiceDenial {
  readonly code: "unavailable" | "denied";
  readonly message: string;
}

export interface AppServiceResult<TClient = never> {
  readonly available: boolean;
  readonly client: TClient | null;
  readonly denial: AppServiceDenial | null;
}

/** Capability discovery returns a deliberately projected application client. */
export interface AppServiceClient {
  optional<TClient>(token: SynWareServiceToken<TClient>): AppServiceResult<TClient>;
  require<TClient>(token: SynWareServiceToken<TClient>): TClient;
  subscribe(token: SynWareServiceToken<unknown>, listener: () => void): () => void;
}
