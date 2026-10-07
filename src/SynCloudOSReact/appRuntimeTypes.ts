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

import type {
  ColourPanelService,
  DocumentResourceService,
  DragSessionManager,
  FocusManager,
  RuntimeAnimationService,
  RuntimeAppTransferScope,
  RuntimeImageLoadRequest,
  RuntimeImagePolicySubject,
  RuntimeImageResource,
  RuntimeImageService,
  RuntimeAudioActivationToken,
  RuntimeAudioHandle,
  RuntimeAudioLoadRequest,
  RuntimeAudioService,
  TFXTextLayoutService,
  RuntimeTrackingRegionRegistration,
  RuntimeTrackingOption,
  TrackingRegionManager,
  RuntimeSnapshot,
  SynCloudOSPresentationTraits,
  ApplicationDocumentSnapshot,
  DocumentConflict,
  DocumentConflictResolution,
  DocumentController,
  DocumentVersion,
  ConformanceInspectorExport,
  ConformanceInspectorSnapshot,
  ConformanceInspectorSnapshotOptions,
  SynCloudOSAppInfo,
  SynCloudOSRuntime,
  UndoManager,
  UndoOwner,
} from "../SynCloudOS/SynCloudOS";
import type { KeyBindingDeclaration, UndoAction } from "../SynCloudOS/SynCloudOS";
import type { TFXRunDelegate } from "../FX/TextFX/TFXRunDelegate";
import type { TFXRunDelegateReadinessChange, TFXRunDelegateRequest } from "../FX/TextFX/textLayoutTypes";
import type { AppDocumentCloseOptions, AppDocumentResourcesClient, AppWorkspaceDocumentsClient } from "../SynCloudOS/AppSDK/runtimeContracts";
/** Data that a mounted application may observe. These are detached, redacted
 * projections rather than aliases of the kernel store. */
export type SynWareLocaleServicesSnapshot = Omit<RuntimeSnapshot["localeServices"], "activeLocale"> & {
  readonly locale: RuntimeSnapshot["localeServices"]["activeLocale"];
};

export interface SynWareRuntimeSnapshot {
  readonly application: Readonly<{ readonly activeAppId: string | null }>;
  readonly localeServices: SynWareLocaleServicesSnapshot;
  readonly loginServices: Readonly<Pick<RuntimeSnapshot["loginServices"], "isAuthorised" | "status"> & { readonly isStaff: boolean }>;
}

/** The mounted content's only presentation authority. */
export interface SynWarePresentationPort {
  getSnapshot(): SynCloudOSPresentationTraits;
  subscribe(listener: () => void): () => void;
}

export interface SynWareStatePort {
  getSnapshot(): SynWareRuntimeSnapshot;
  subscribe(listener: () => void): () => void;
}

export interface SynWareDiagnosticsIdentity {
  readonly runtimeId: string;
  readonly appId: string;
  readonly responderId: string;
  readonly windowControllerId: string | null;
  readonly live: boolean;
}

/** Diagnostics is a narrow app port. Only the trusted system Diagnostics app
 * receives a full snapshot; other mounts retain their previous identity-only
 * projection and cannot reach the inspector graph. */
export interface SynWareDiagnosticsPort {
  getReport(): ConformanceInspectorSnapshot | SynWareDiagnosticsIdentity;
  refreshConformanceSnapshot(options?: ConformanceInspectorSnapshotOptions): Promise<ConformanceInspectorSnapshot>;
  exportConformanceSnapshot(snapshot: ConformanceInspectorSnapshot): ConformanceInspectorExport;
}

/** Browser-facing presentation ports are explicit and narrow. The runtime's
 * browser, image, audio and web adapters are never handed to a SynWare. */
export interface SynWarePlatformPort {
  matchMedia(query: string): {
    readonly matches: boolean;
    subscribe(listener: (matches: boolean) => void): () => void;
    dispose(): void;
  };
  online(): boolean;
  subscribeOnline(listener: () => void): () => void;
  now(): number;
  randomUUID(): string;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  requestAnimationFrame(callback: (timestamp: number) => void): unknown;
  cancelAnimationFrame(handle: unknown): void;
  readonly workArea: Pick<SynCloudOSRuntime["environment"]["workArea"], "getSnapshot" | "subscribe">;
  readonly imageGeometry?: Pick<NonNullable<SynCloudOSRuntime["environment"]["imageGeometry"]>, "measure" | "observe" | "localPoint">;
}

export interface SynWareNavigationPort {
  openRoute: SynCloudOSRuntime["routes"]["openRoute"];
}

export interface SynWareCatalogPort {
  getApp(appId: string): Readonly<Pick<SynCloudOSAppInfo, "id" | "name" | "shortName" | "packageName" | "route" | "displayName">> | null;
}

export interface SynWareLifecyclePort {
  closeSelf(options?: Parameters<SynCloudOSRuntime["lifecycle"]["close"]>[1]): ReturnType<SynCloudOSRuntime["lifecycle"]["close"]>;
  subscribe(listener: (event: Readonly<{ state: "suspended" | "closed" }>) => void): () => void;
}

export interface SynWareWindowBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SynWareOwnedWindowSnapshot {
  readonly id: string;
  readonly title: string;
  readonly state: "opening" | "open" | "minimised" | "closing";
  readonly bounds: SynWareWindowBounds;
  readonly documentId: string | null;
  readonly documentAssociationRole: "primary" | "secondary" | "inspector" | null;
  readonly mobilePolicy: "fullscreen" | "sheet" | "popover-to-sheet" | "hidden";
  readonly restorationKey: string | null;
  readonly isKey: boolean;
  readonly isMain: boolean;
}

export interface SynWareWindowSnapshot {
  readonly current: SynWareOwnedWindowSnapshot | null;
  readonly owned: readonly SynWareOwnedWindowSnapshot[];
  /** Mount surface: "window" for document-window mounts, absent for stage mounts. */
  readonly surface?: "application" | "window";
}

export interface SynWareOpenDocumentWindowRequest {
  readonly documentId: string;
  readonly title: string;
  readonly restorationKey: string;
  readonly preferredBounds?: SynWareWindowBounds;
  readonly mobilePolicy?: SynWareOwnedWindowSnapshot["mobilePolicy"];
}

export type SynWareWindowCloseResult =
  | Readonly<{ outcome: "closed"; windowId: string }>
  | Readonly<{ outcome: "cancelled"; windowId: string }>
  | Readonly<{ outcome: "refused"; windowId: string; reason: "not-closable" | "blocked" | "delegate-refused" }>;

/** A deliberately projected, caller-scoped secondary-window port. The raw
 * manager, controllers, records and arbitrary creation request never cross
 * this mounted-runtime boundary. */
export interface SynWareWindowPort {
  getSnapshot(): SynWareWindowSnapshot;
  subscribe(listener: () => void): () => void;
  openDocumentWindow(request: SynWareOpenDocumentWindowRequest): Promise<SynWareOwnedWindowSnapshot>;
  focus(windowId: string): SynWareOwnedWindowSnapshot;
  close(windowId: string): Promise<SynWareWindowCloseResult>;
}

export interface SynWareServiceDenial {
  readonly code: "unavailable" | "denied";
  readonly message: string;
}

export interface SynWareServiceResult<TClient = never> {
  readonly available: boolean;
  readonly client: TClient | null;
  readonly denial: SynWareServiceDenial | null;
}

/** The only service discovery surface granted to a mounted application. The
 * provider chooses the client projection for this app/session; it never leaks
 * the host registry or raw service implementation. */
export type SynWareServicePort = import("../SynCloudOS/AppSDK/runtimeContracts").AppServiceClient;

export type SynWareCommandScope = "focused" | "document" | "window" | "application" | "workspace" | "webspring" | "runtime";
export type SynWareCommandSource = "api" | "keyboard" | "menu" | "toolbar" | "system";
export interface SynWareCommandTitle {
  readonly key: string;
  readonly fallback: string;
  readonly values?: Readonly<Record<string, string | number>>;
}
export interface SynWareCommandPayloadSchema<P> {
  readonly description: string;
  parse(value: unknown): { readonly ok: true; readonly value: P } | { readonly ok: false; readonly issues: readonly string[] };
}
export interface SynWareCommandQueryContext<P> {
  readonly runtime: SynWareRuntime;
  readonly commandId: string;
  readonly responderId: string;
  readonly scopeId: string | null;
  readonly payload: P;
}
export interface SynWareCommandExecutionContext<P> extends SynWareCommandQueryContext<P> {
  readonly operationId: string;
  readonly correlationId: string;
  readonly signal: AbortSignal;
  readonly source: SynWareCommandSource;
  readonly undoManager: SynWareUndoManager | null;
}
export interface SynWareCommandValidation {
  readonly enabled: boolean;
  readonly denied?: boolean;
  readonly hidden?: boolean;
  readonly state?: "off" | "on" | "mixed";
  readonly title?: SynWareCommandTitle;
  readonly disabledReason?: string;
}
export type SynWareCommandUndoPolicy<P, R> =
  | { readonly kind: "none" }
  | {
      readonly kind: "register";
      createAction(context: SynWareCommandExecutionContext<P>, result: R): UndoAction;
      compensate?(context: SynWareCommandExecutionContext<P>, result: R): void | Promise<void>;
    };
export interface SynWareCommandDeclaration<P, R> {
  readonly id: string;
  readonly responderId: string;
  readonly title: SynWareCommandTitle | ((context: SynWareCommandQueryContext<P>) => SynWareCommandTitle);
  readonly icon?: string;
  readonly menuCategory?: string;
  readonly payload: SynWareCommandPayloadSchema<P>;
  readonly defaultKeyBindings: readonly KeyBindingDeclaration[];
  readonly allowReservedBrowserShortcut?: boolean;
  readonly scope: SynWareCommandScope;
  readonly undo: SynWareCommandUndoPolicy<P, R>;
  readonly telemetry?: { readonly category: string; readonly sensitivePayload: boolean };
  validate?(context: SynWareCommandQueryContext<P>): SynWareCommandValidation | Promise<SynWareCommandValidation>;
  execute(context: SynWareCommandExecutionContext<P>): R | Promise<R>;
}
declare const synWareCommandAcceptanceBrand: unique symbol;
export interface SynWareCommandAcceptance {
  readonly [synWareCommandAcceptanceBrand]?: true;
  readonly commandId: string;
  readonly responderId: string;
}
export interface SynWareCommandDispatchOptions {
  readonly source?: SynWareCommandSource;
  readonly correlationId?: string;
  readonly signal?: AbortSignal;
  readonly acceptance?: SynWareCommandAcceptance;
}
export interface SynWareCommandValidationOptions {
  readonly signal?: AbortSignal;
  readonly source?: SynWareCommandSource;
}
export type SynWareCommandDispatchResult<R> =
  | { readonly status: "executed"; readonly commandId: string; readonly responderId: string; readonly operationId: string; readonly correlationId: string; readonly value: R }
  | { readonly status: "invalid-payload"; readonly commandId: string; readonly issues: readonly string[] }
  | { readonly status: "disabled" | "denied"; readonly commandId: string; readonly responderId: string; readonly reason: string }
  | { readonly status: "unhandled"; readonly commandId: string }
  | { readonly status: "cancelled"; readonly commandId: string; readonly operationId: string; readonly reason: string }
  | { readonly status: "unknown"; readonly commandId: string; readonly operationId: string; readonly reason: string; readonly error?: { readonly code: string; readonly name: string; readonly message: string; readonly cause?: unknown } }
  | { readonly status: "failed"; readonly commandId: string; readonly operationId: string; readonly error: { readonly code: string; readonly name: string; readonly message: string; readonly cause?: unknown } };
export interface SynWareCommandPresentation {
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

/** Read/format/translate locale operations are safe application capabilities.
 * Hydration and bundle/translation registration remain kernel-owned. */
export interface SynWareLocalePort extends Pick<
  SynCloudOSRuntime["locale"],
  "getActiveLocale" |
  "formatDate" | "formatTime" | "formatNumber" | "formatFileSize" | "formatRelativeTime" | "formatList" | "t"
> {
  getSnapshot(): SynWareLocaleServicesSnapshot;
  /** The mounted facade owns runtime-state observation; callers receive only
   * locale presentation changes. */
  subscribe(listener: () => void): () => void;
  /** The public client exposes locale codes, not host locale metadata. */
  getSupportedLocales(): readonly string[];
}

export type SynWarePersistencePort = Pick<SynCloudOSRuntime["persistence"], "getPreference" | "setPreference" | "removePreference">;
export type SynWareDocumentStorePort = Pick<
  SynCloudOSRuntime["documentStore"],
  "getKind" | "listKinds" | "readPublished" | "listPublished" | "getDraft" | "saveDraft" | "listDraftVersions" |
  "readDraftVersion" | "deleteDraft" | "createRevision" | "publish" | "unpublish" | "resolveSlug" | "attachMedia"
>;
export type SynWareDocumentResourcesPort = Pick<DocumentResourceService, "assetCapabilities" | "acquireAsset" | "persist" | "acquire" | "isActive" | "resolve" | "subscribeInvalidation" | "release"> & Pick<AppDocumentResourcesClient, "prepareEdit">;
/** App-owned document sessions expose immutable snapshots, never the live
 * ApplicationDocument controller or its adapter authority. */
export interface SynWareWorkspaceDocumentPort {
  registerWorkflowProvider: AppWorkspaceDocumentsClient["registerWorkflowProvider"];
  transactDocument: AppWorkspaceDocumentsClient["transactDocument"];
  registerEditingParticipant: AppWorkspaceDocumentsClient["registerEditingParticipant"];
  settleEditing: AppWorkspaceDocumentsClient["settleEditing"];
  saveAsDocument: AppWorkspaceDocumentsClient["saveAsDocument"];
  duplicateDocument: AppWorkspaceDocumentsClient["duplicateDocument"];
  moveDocument: AppWorkspaceDocumentsClient["moveDocument"];
  revertDocument: AppWorkspaceDocumentsClient["revertDocument"];
  hasType(typeId: string): boolean;
  getDocument(documentId: string): ApplicationDocumentSnapshot<unknown> | null;
  subscribeDocument(documentId: string, listener: () => void): () => void;
  /** Retains an existing exact document generation as an owner. Components
   * must release this reference rather than directly closing shared documents. */
  retainDocument<TModel>(documentId: string): ApplicationDocumentSnapshot<TModel> | null;
  releaseDocument(documentId: string): Promise<boolean>;
  getUndoManager(documentId: string): SynWareUndoManager;
  openDocument<TModel, TSerialized = TModel>(
    request: Parameters<DocumentController["openDocument"]>[0],
  ): Promise<ApplicationDocumentSnapshot<TModel>>;
  newDocument<TModel, TSerialized = TModel>(
    request: Parameters<DocumentController["newDocument"]>[0],
  ): Promise<ApplicationDocumentSnapshot<TModel>>;
  newProjectionDocument<TModel, TSerialized = TModel>(
    request: Parameters<DocumentController["newProjectionDocument"]>[0],
  ): Promise<ApplicationDocumentSnapshot<TModel>>;
  updateDocument<TModel>(
    documentId: string,
    transform: (current: Readonly<TModel>) => TModel,
    options: { readonly actionName: string; readonly coalescingKey?: string; readonly recordUndo?: boolean },
  ): void;
  /** Mirror a view/editor projection into the owned document without adding
   * a second history entry; the view's document undo adapter owns that entry
   * (including selection restoration). */
  synchroniseDocument<TModel>(documentId: string, transform: (current: Readonly<TModel>) => TModel): void;
  /** Lists versions through the canonical owned document. The caller signal is
   * forwarded to the document adapter's version read. */
  listDocumentVersions(documentId: string, signal?: AbortSignal): Promise<readonly DocumentVersion[]>;
  /** Reads a saved version's model without changing the document, as NSFileVersion opens one. */
  readDocumentVersion<TModel>(documentId: string, version: DocumentVersion, signal?: AbortSignal): Promise<TModel>;
  /** Restores a historical version as the canonical document's later dirty
   * revision; persistence remains an explicit subsequent document save. */
  restoreDocumentVersion(documentId: string, version: DocumentVersion, signal?: AbortSignal): Promise<void>;
  /** Places the owned canonical document into its standard conflict state. */
  enterDocumentConflict<TModel>(
    documentId: string,
    conflict: Omit<DocumentConflict<TModel>, "detectedAt"> & { readonly detectedAt?: string },
  ): void;
  /** Resolves a canonical conflict.  Revoking the caller's mount aborts any
   * adapter acknowledgement/recreation work before it may change the model. */
  resolveDocumentConflict<TModel>(
    documentId: string,
    resolution: DocumentConflictResolution<TModel>,
    signal?: AbortSignal,
  ): Promise<void>;
  saveDocument: DocumentController["saveDocument"];
  /** Returns the framework's explicit closed/cancelled/refused result. */
  closeDocument(documentId: string, options?: AppDocumentCloseOptions | Parameters<DocumentController["closeDocument"]>[1], signal?: AbortSignal): ReturnType<DocumentController["closeDocument"]>;
}
export interface SynWareCommandPort {
  register(declaration: object): { readonly commandId: string; readonly responderId: string; dispose(): boolean };
  /** Creates an immutable object payload without reflecting on app-owned data.
   * Provide alternating bounded string keys and primitive, mounted-capability,
   * or previously runtime-created values. */
  createPayload(...fields: readonly unknown[]): Readonly<Record<string, unknown>>;
  /** Creates an immutable array payload from primitive, mounted-capability,
   * or previously runtime-created values. */
  createPayloadArray(...values: readonly unknown[]): readonly unknown[];
  dispatch<R = unknown>(id: string, payload?: unknown, options?: SynWareCommandDispatchOptions): Promise<any>;
  prepareDispatch(id: string, payload?: unknown, options?: SynWareCommandDispatchOptions): any;
  validate(id: string, payload?: unknown, options?: SynWareCommandValidationOptions): Promise<SynWareCommandPresentation>;
  validateMany(requests: readonly { readonly key: string; readonly commandId: string; readonly payload?: unknown }[], options?: SynWareCommandValidationOptions): Promise<ReadonlyMap<string, SynWareCommandPresentation>>;
}
export type SynWareFocusPort = Pick<FocusManager, "requestFocus" | "openScope" | "isScopeWithin" | "getFocusedResponderId">;
export interface SynWareUndoPort {
  get(owner: SynWareUndoOwner): SynWareUndoManager | null;
  create(owner: SynWareUndoOwner, options?: Parameters<SynCloudOSRuntime["undo"]["create"]>[1]): SynWareUndoManager;
}
export type SynWareSettingsPort = Pick<SynCloudOSRuntime["settings"], "subscribe" | "supportsVibration" | "notificationsAllowed" | "appNotificationsAllowed"> & {
  get(): Omit<ReturnType<SynCloudOSRuntime["settings"]["get"]>, "masterVolume" | "appVolumes">;
};
export type SynWareEventsPort = Pick<SynCloudOSRuntime["events"], "subscribe">;
export type SynWareNotificationsPort = Pick<SynCloudOSRuntime["notifications"], "post">;
export type SynWareErrorsPort = Pick<SynCloudOSRuntime["errors"], "capture">;

export interface SynWareTrackingDiagnostics {
  readonly regionCount: number;
}

export interface SynWareTextLayoutDiagnostics {
  readonly activeOperationCount: number;
  readonly activeMeasurementNodeCount: number;
  readonly lastLayoutWork: {
    readonly segmentCount: number;
    readonly measurementCount: number;
    readonly graphemeAdvanceCount: number;
    readonly lineCount: number;
  };
}

export interface SynWareAnimationDiagnostics {
  readonly activeCount: number;
  readonly pausedCount: number;
}

export interface SynWareImageDiagnostics {
  readonly activeOperationCount: number;
  readonly activeReferenceCount: number;
}

export interface SynWareAudioDiagnostics {
  readonly handleCount: number;
  readonly playingCount: number;
  readonly pendingLoadCount: number;
}

export interface SynWareWebContentDiagnostics {
  readonly sessionCount: number;
  readonly pendingOperationCount: number;
}

/** This port intentionally has no runtime id or disposal entry point. */
export type SynWareColourPanelPort = Pick<
  ColourPanelService,
  "ownerToken" | "getSnapshot" | "getPickers" | "subscribe" | "registerPicker" | "activateTarget" |
  "open" | "close" | "choosePicker" | "preview" | "commit" | "cancel" | "addRecent" | "setSwatches"
>;
export type SynWareTrackingPort = Pick<TrackingRegionManager, "register"> & { diagnostics(): SynWareTrackingDiagnostics };
export type SynWareTextLayoutPort = Pick<TFXTextLayoutService, "geometryCapabilities" | "segment" | "layout" | "measure" | "fontReadinessGeneration" | "registerFont" | "registerFontResource" | "subscribeFontReadiness"> & {
  readonly attachmentReadinessGeneration: number;
  resolveRunDelegate(request: TFXRunDelegateRequest, signal?: AbortSignal): Promise<TFXRunDelegate>;
  subscribeAttachmentReadiness(listener: (change: TFXRunDelegateReadinessChange) => void): () => void;
  diagnostics(): SynWareTextLayoutDiagnostics;
};
export type SynWareAnimationPort = Pick<RuntimeAnimationService, "acquireOwner" | "animate"> & { diagnostics(): SynWareAnimationDiagnostics };
export type SynWareImagePort = Pick<RuntimeImageService, "createGraphicsIdentifierIssuer"> & { diagnostics(): SynWareImageDiagnostics } & {
  load(request: SynWareImageLoadRequest): RuntimeImageResource;
};
export type SynWareAudioPort = Pick<RuntimeAudioService, "activation" | "play" | "pause" | "stop" | "setLoop" | "setVolume" | "setRate" | "setCurrentTime" | "release"> & { diagnostics(): SynWareAudioDiagnostics } & {
  load(request: SynWareAudioLoadRequest, signal?: AbortSignal): Promise<RuntimeAudioHandle>;
  suspend(): void;
  resume(): void;
};

export interface SynWareImageLoadRequest {
  readonly subject?: Pick<RuntimeImagePolicySubject, "capability" | "documentId">;
  readonly source: RuntimeImageLoadRequest["source"];
  readonly accessibleLabel?: string;
  readonly renderingMode?: RuntimeImageLoadRequest["renderingMode"];
  readonly tintColour?: string;
  readonly capInsets?: RuntimeImageLoadRequest["capInsets"];
  readonly resizingMode?: RuntimeImageLoadRequest["resizingMode"];
}

export interface SynWareAudioLoadRequest {
  readonly source: RuntimeAudioLoadRequest["source"];
  readonly ownerId: string;
  readonly loop?: boolean;
  readonly volume?: number;
}

export interface SynWareWebContentPort {
  createSession: RuntimeAppTransferScope["webContent"]["createSession"];
  diagnostics(): SynWareWebContentDiagnostics;
}

/** The one explicit, immutable AppSDK capability list. It is intentionally
 * not structurally related to SynCloudOSRuntime: adding a kernel service does
 * not make it available to mounted application code by accident. */
export interface SynWareRuntime {
  /** Immutable identity of the mounted kernel runtime. This is separate from
   * redacted Diagnostics report identities. */
  readonly id: string;
  readonly app: Readonly<Pick<SynCloudOSAppInfo, "id" | "name" | "shortName" | "packageName" | "route">>;
  /** The mounted responder root for this presentation generation. It is an
   * owned identity, not a kernel responder graph capability. */
  readonly responderId: string;
  readonly signal: AbortSignal;
  readonly state: SynWareStatePort;
  readonly presentation: SynWarePresentationPort;
  readonly platform: SynWarePlatformPort;
  readonly navigation: SynWareNavigationPort;
  readonly catalog: SynWareCatalogPort;
  readonly application: SynWareLifecyclePort;
  readonly windows: SynWareWindowPort;
  readonly services: SynWareServicePort;
  readonly locale: SynWareLocalePort;
  readonly persistence: SynWarePersistencePort;
  readonly documentStore: SynWareDocumentStorePort;
  readonly documentResources: SynWareDocumentResourcesPort;
  readonly workspaceDocuments: SynWareWorkspaceDocumentPort;
  readonly commands: SynWareCommandPort;
  readonly focus: SynWareFocusPort;
  readonly undo: SynWareUndoPort;
  readonly colourPanel: SynWareColourPanelPort;
  readonly pasteboards: RuntimeAppTransferScope["pasteboards"];
  readonly drag: RuntimeAppTransferScope["drag"];
  readonly webContent: SynWareWebContentPort;
  readonly tracking: SynWareTrackingPort;
  readonly textLayout: SynWareTextLayoutPort;
  readonly images: SynWareImagePort;
  readonly animations: SynWareAnimationPort;
  readonly audio: SynWareAudioPort;
  readonly events: SynWareEventsPort;
  readonly notifications: SynWareNotificationsPort;
  readonly errors: SynWareErrorsPort;
  readonly diagnostics: SynWareDiagnosticsPort;
  readonly settings: SynWareSettingsPort;
  readonly appearance: Pick<SynCloudOSRuntime["appearance"], "get" | "resolved" | "subscribe">;
}

/** Narrow helper types exported for NSE components without making an app
 * depend on a complete raw manager. */
export type SynWareAnimationOwnerLease = ReturnType<SynWareAnimationPort["acquireOwner"]>;
/**
 * A mounted app receives only the command/history surface required by an
 * editor.  Manager disposal, clearing, grouping and inspection remain kernel
 * responsibilities; exposing those mutators would let an app corrupt a
 * document's shared history or observe unrelated state.
 */
export type SynWareUndoManager = Pick<UndoManager,
  "canUndo" | "canRedo" | "undoTitle" | "redoTitle" | "isExecuting" | "register" | "reserve" | "undo" | "redo" | "subscribe"
>;
export type SynWareUndoOwner = UndoOwner;
export type SynWareTrackingRegistration = RuntimeTrackingRegionRegistration;
export type SynWareTrackingOptions = readonly RuntimeTrackingOption[];
export type SynWareDragManager = Pick<DragSessionManager, "ownerToken">;
export type SynWareAudioActivation = RuntimeAudioActivationToken;
