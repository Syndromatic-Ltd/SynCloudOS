import type { NSEThemeDefinition } from "../../NSE/Appearance/NSEThemeDefinition";
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

import type { BrowserFilePanelPort } from "../FilePanels/filePanelTypes";
import type { RuntimeResourceLedger } from "../Resources/RuntimeResourceLedger";
import type { HeavyJobAdmission, HeavyJobCapacity } from "../Operations/HeavyJobAdmission";
import type { SynCloudOSRuntimeDiagnostics } from "../Diagnostics/runtimeDiagnostics";
import type { ServiceTerminalOperations } from "../Documents/serviceTerminalOperations";
import type { AFXFrameScheduler } from "../../FX/AnimationFX/AFXLayer";
import type { AnimationLayerHost } from "../AnimationFX/AnimationLayerHost";
import type { AudioGraphHostService } from "../AudioFX/AudioGraphHostService";
import type { AUFXAudioSession } from "../../FX/AudioFX/AUFXAudioSession";
import type { RuntimeAudioFileService } from "../AudioFX/AudioFileService";
import type { MediaClockService } from "../MediaFX/MediaClockService";
import type { HFXHostService } from "../HapticsFX/HapticsHostService";
import type { MotionService } from "../MotionFX/MotionService";
import type { MFXMotionAdapter } from "../MotionFX/motionAdapterTypes";
import type { LocationService, LFXLocationAdapter } from "../LocationFX/LocationService";
import type { MIDIAdapter, MIDIService } from "../MIDIFX/MIDIService";
import type { VideoCaptureService, VideoCaptureSessionHost, VideoDecoderBackendHost, VideoEncoderBackendHost, VideoFrameProcessorBackendHost } from "../VideoFX/VideoCaptureService";
import type { LuminaIndexBackendFactory, LuminaIndexService } from "../LuminaFX/LuminaIndexService";
import type { LUFXHostService } from "../LuminaFX/LUFXHostService";
import type { HFXHapticEngine } from "../../FX/HapticsFX/HFXHapticEngine";
import type { HFXFeedbackOptions } from "../HapticsFX/feedbackTypes";
import type { SynCloudOSAppInfo } from "../AppInfo/appInfoTypes";
import type { SynCloudOSAppLifecycleState } from "../AppManager/appManagerTypes";
import type { AppManager } from "../AppManager/AppManager";
import type { SynCloudOSAppManifest, SynCloudOSAppRegistrationHistoryRecord } from "../AppRegistry/appRegistryTypes";
import type { SynCloudOSLoadedBundle, TrustedSynWareBundle, SynCloudOSBundleLifecycleHookName } from "../BundleLoader/bundleTypes";
import type { SynWareTrustedBundleProvenance } from "../BundleLoader/trustedBundleProvenance";
import type { SynCloudOSServiceDefinition, SynCloudOSServiceReport, SynCloudOSServiceHealthReport, SynCloudOSServiceExplanation, SynCloudOSServiceProvider } from "../ServiceRegistry/serviceTypes";
import type { SynCloudOSBootReport } from "../BootManager/bootTypes";
import type { SynCloudOSAccessMode, SynCloudOSPolicyAuditReport, SynCloudOSRoleCapabilityReportItem, SynCloudOSCapabilityMatrix, SynCloudOSPolicy, SynCloudOSPolicyEvaluationOptions } from "../PolicyKit/policyTypes";
import type { SynCloudOSRuntimeEvent } from "../EventBus/eventTypes";
import type {
  RuntimeSnapshot,
  RuntimeListener,
  RuntimeMutator,
  RuntimePostCommitEffect,
  RuntimeTransactionCallback,
  RuntimeTransactionOptions,
  RuntimeTransactionRecord,
} from "./runtimeTypes";
import type { CapturedSynCloudOSError, SynCloudOSErrorPayload } from "../ErrorManager/errorTypes";
import type {
  OperationDefinition,
  OperationHandle as KernelOperationHandle,
  OperationRecord,
  PresentationSettlementHandle,
  PresentationSettlementInspectionRecord,
  PresentationSettlementRequest,
} from "../Operations/operationTypes";
import type { SynCloudOSNotification, SynCloudOSNotificationPostInput, SynCloudOSNotificationPostOptions } from "../NotificationCenter/notificationTypes";
import type {
  AppActivationResult,
  AppCloseResult,
  AppLaunchResult,
  AppSuspensionResult,
  LifecycleDispatchResult,
  LifecycleRequestOptions,
  SynCloudOSLifecycleControl,
  SynCloudOSLifecycleTransitionOptions,
  SynCloudOSLifecycleTransitionResult,
  SynCloudOSLifecycleStage,
} from "../Lifecycle/lifecycleTypes";
import type { SynCloudOSOpenRouteOptions, SynCloudOSOpenRouteResult, SynCloudOSOpenRouteHandle, SynCloudOSRouteTransitionInspectionRecord } from "../RouteManager/routeTypes";
import type {
  SynCloudOSLaunchExplanation,
  SynCloudOSExternalAppExplanation,
  SynCloudOSLaunchHistoryAction,
  SynCloudOSLaunchHistoryRecord,
  SynCloudOSLaunchQueueItem,
  SynCloudOSLaunchQueueSnapshot,
  SynCloudOSOpenAppOptions,
} from "../LaunchServices/launchTypes";
import type {
  SynCloudOSRouteExplanation,
  SynCloudOSRouteHistoryRecord,
  SynCloudOSRouteNormalization,
  SynCloudOSRouteResolution,
} from "../RouteManager/routeTypes";
import type {
  SynCloudOSStateDefinition,
  SynCloudOSStateName,
  SynCloudOSStateTransitionExplanation,
  SynCloudOSStateTransitionOptions,
  SynCloudOSStateTransitionRecord,
  SynCloudOSStatechartInspection,
} from "../Statechart/statechartTypes";
import type { SynCloudOSInspectorService } from "../Inspector/Inspector";
import type { RuntimeCacheRegistry } from "../Cache/cacheTypes";
import type { IdentitySessionAdapter, IdentitySessionService } from "../Identity/identitySessionTypes";
import type { SystemUIService } from "../SystemUI/systemUIService";
import type { SynCloudOSAlertCenter } from "../SystemUI/alertCenter";
import type { SynCloudOSSettingsService } from "../Settings/settingsService";
import type { SynCloudOSAppearanceService } from "../Appearance/appearanceService";
import type { UndoManagerRegistry } from "../Undo";
import type { SynCloudOSLoginSessionSnapshot } from "../LoginServices/loginServicesTypes";
import type {
  SynCloudOSLocaleBundleResourceInput,
  SynCloudOSLocaleBundleResourceLoader,
  SynCloudOSLocaleFormatFileSizeOptions,
  SynCloudOSLocaleResolutionInput,
  SynCloudOSLocaleServicesSnapshot,
  SynCloudOSTranslationMessages,
  SynCloudOSTranslationParams,
} from "../LocaleServices/localeTypes";
import type {
  UserNotificationActionResult,
  UserNotificationActionHandler,
  UserNotificationDeliveryAdapter,
  UserNotificationDiagnostic,
  UserNotificationPermission,
  UserNotificationPersistenceAdapter,
  UserNotificationPostResult,
  UserNotificationRecord,
  UserNotificationRequest,
} from "../NotificationCenter/notificationDeliveryTypes";
export type RuntimeOperationHandle<T = unknown> = KernelOperationHandle<T>;
export type {
  UserNotificationActionContext,
  UserNotificationActionDeclaration,
  UserNotificationActionHandler,
  UserNotificationActionResult,
  UserNotificationDeliveryAdapter,
  UserNotificationDeliveryAttempt,
  UserNotificationDeliveryResult,
  UserNotificationDiagnostic,
  UserNotificationPermission,
  UserNotificationPolicySummary,
  UserNotificationPersistenceAdapter,
  UserNotificationPostResult,
  UserNotificationRecord,
  UserNotificationRequest,
  UserNotificationCenter,
  UserNotificationState,
} from "../NotificationCenter/notificationDeliveryTypes";
import type {
  RuntimeDisposalParticipant,
  RuntimeDisposalRegistration,
  RuntimeDisposalRequest,
  RuntimeDisposalResult,
  RuntimeDisposalState,
} from "./disposalTypes";
import type { OperationQuiesceLease } from "../Operations/operationTypes";
import type { CommandSystem } from "../Commands/commandTypes";
import type { ResponderGraph } from "../Responders/responderTypes";
import type { FocusManager } from "../Focus/focusTypes";
import type { KeyBindingManager } from "../KeyBindings/keyBindingTypes";
import type {
  SynCloudOSDocumentKindMetadata,
  SynCloudOSDocumentStoreAdapter,
  SynCloudOSDocumentStoreLock,
  SynCloudOSDocumentStoreTerminalMutationLease,
} from "../DocumentStore";
import type { RuntimeNetworkHints, RuntimePerformancePolicy } from "../Performance/RuntimePerformancePolicy";
import type {
  SynCloudOSPolicyDecision,
  SynCloudOSPolicyProfile,
  SynCloudOSPolicyRequest,
  SynCloudOSPolicySubject,
  SynCloudOSPolicySubjectGrant,
  SynCloudOSRoleCapabilityRegistration,
  SynCloudOSRoleCapabilityRegistrationInput,
} from "../PolicyKit/policyTypes";
import type { ScreenService, WindowManager } from "../Windows";
import type { SynCloudOSPresentationTraitsService } from "../ResponsiveModeManager/presentationTypes";
import type { ColourPanelService } from "../ColourPanel";
import type { PreferencePaneRegistry } from "../Preferences";
import type { PasteboardAdapter, PasteboardRegistry } from "../Pasteboard/pasteboardTypes";
import type { DragAuthorisationPort, DragSessionManager } from "../Drag";
import type { DocumentResourceService } from "../Documents";
import type { RuntimePointerAdapter, TrackingRegionManager } from "../Pointer";
import type { TFXTextLayoutAdapterFactory, TFXTextLayoutService } from "../TextFX";
import type { RuntimeImageAdapterFactory, RuntimeImageAuthorisationPort, RuntimeImageService } from "../Images";
import type { RuntimeAnimationAdapterFactory, RuntimeAnimationService } from "../AnimationFX";
import type { RuntimeAudioAdapterFactory, RuntimeAudioService } from "../AudioFX";
import type { RuntimeWebContentAdapterFactory, RuntimeWebContentAuthorisationPort, RuntimeWebContentService } from "../WebContent";
import type { RuntimeTransferAuthority } from "../Transfer";
import type { DocumentController } from "../Documents/DocumentController";
import type { DocumentRecoveryStore } from "../Documents/DocumentRecoveryStore";
import type { DocumentStorageAdapter } from "../Documents/Adapters/documentAdapterTypes";
import type { DocumentType } from "../Documents/documentTypes";
import type { DocumentAssetRuntimeBacking, DocumentAssetRuntimeCooperation } from "./DocumentAssetRuntimeIntegration";
import type { SynCloudOSWebspringFolderConfiguration } from "../WebspringState/webspringStateTypes";

declare const runtimeIdBrand: unique symbol;
export type SynCloudOSRuntimeId = string & { readonly [runtimeIdBrand]: true };

export interface RuntimeMediaQuery {
  readonly media: string;
  readonly matches: boolean;
  subscribe(listener: (matches: boolean) => void): () => void;
  dispose(): void;
}

export interface RuntimeVisualViewportSnapshot {
  readonly width: number;
  readonly height: number;
  readonly offsetLeft: number;
  readonly offsetTop: number;
  readonly scale: number;
}

export interface RuntimeScreenSnapshot {
  readonly width: number;
  readonly height: number;
  readonly availableLeft: number;
  readonly availableTop: number;
  readonly availableWidth: number;
  readonly availableHeight: number;
  readonly colourDepth: number;
  readonly pixelDepth: number;
  readonly orientation: "portrait-primary" | "portrait-secondary" | "landscape-primary" | "landscape-secondary" | "unknown";
}

export interface RuntimeWorkAreaSnapshot {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
  readonly safeArea: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
}

export interface RuntimeSnapshotSource<T> {
  getSnapshot(): T;
  subscribe(listener: (snapshot: T) => void): () => void;
}

export interface BrowserNavigationTarget {
  addEventListener(type: "navigate", listener: (event: Event) => void): void;
  removeEventListener(type: "navigate", listener: (event: Event) => void): void;
}

export interface RuntimeLayoutViewportSnapshot {
  readonly width: number;
  readonly height: number;
}

/** Runtime-owned browser authority. Production services receive this through
 * their environment instead of reading ambient globals. */
export interface RuntimeBrowserLocation {
  readonly href: string;
  readonly origin: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
}

export interface RuntimeBrowserRouteSyncOptions {
  readonly replace?: boolean;
  readonly dispatchPopState?: boolean;
  readonly state?: unknown;
}

export interface RuntimeBrowserRouteSyncResult {
  readonly requestedHref: string;
  readonly browserHref: string;
  readonly pathname: string;
  readonly changed: boolean;
  readonly replaced: boolean;
  readonly dispatchedPopState: boolean;
}

export interface RuntimeBrowserRouteSynchronizationPort {
  isSyncInProgress(): boolean;
  syncRoute(href: string, options?: RuntimeBrowserRouteSyncOptions): RuntimeBrowserRouteSyncResult;
}

export interface RuntimeBrowserPort {
  getLocation(): RuntimeBrowserLocation;
  getWindow(): Window | null;
  getDocument(): Document | null;
  getNavigator(): Navigator | null;
}

/** Runtime-owned element measurement and resize authority for resource-backed
 * media controls. Presentation never needs to reach for an ambient observer. */
export interface RuntimeImageGeometryPort {
  measure(element: HTMLElement): { width: number; height: number };
  observe(element: HTMLElement, listener: () => void): () => void;
  localPoint?(element: HTMLElement, clientX: number, clientY: number): { x: number; y: number };
}

/** Internal test-harness gate injected through a runtime environment. It is
 * intentionally absent from every app-facing SDK type: mounted capability
 * methods call it around their real action, while tests receive only their
 * narrow fake-control projection. */
export interface RuntimeTestCapabilityControl {
  run<T>(operation: string, signal: AbortSignal | undefined, action: () => T | Promise<T>): Promise<T>;
  runSync<T>(operation: string, action: () => T): T;
}

export interface RuntimeTestCapabilityControls {
  readonly browser: RuntimeTestCapabilityControl;
  readonly media: RuntimeTestCapabilityControl;
  readonly viewport: RuntimeTestCapabilityControl;
  readonly navigation: RuntimeTestCapabilityControl;
  readonly storage: RuntimeTestCapabilityControl;
  readonly clipboard: RuntimeTestCapabilityControl;
  readonly drag: RuntimeTestCapabilityControl;
  readonly credentials: RuntimeTestCapabilityControl;
  readonly files: RuntimeTestCapabilityControl;
  readonly documents: RuntimeTestCapabilityControl;
  readonly recovery: RuntimeTestCapabilityControl;
  readonly windows: RuntimeTestCapabilityControl;
  readonly panels: RuntimeTestCapabilityControl;
  readonly overlays: RuntimeTestCapabilityControl;
  readonly workspace: RuntimeTestCapabilityControl;
  readonly services: RuntimeTestCapabilityControl;
  readonly permissions: RuntimeTestCapabilityControl;
  readonly policy: RuntimeTestCapabilityControl;
  readonly image: RuntimeTestCapabilityControl;
  readonly text: RuntimeTestCapabilityControl;
  readonly animation: RuntimeTestCapabilityControl;
  readonly audio: RuntimeTestCapabilityControl;
  readonly webContent: RuntimeTestCapabilityControl;
}

export interface SynCloudOSRuntimeEnvironment {
  readonly navigation: BrowserNavigationTarget | null;
  /** Host-only capability gates used by the deterministic AppSDK testing kit.
   * Browser/production constructors omit this field. */
  readonly testControls?: RuntimeTestCapabilityControls;
  readonly browser: RuntimeBrowserPort;
  readonly routeSynchronization: RuntimeBrowserRouteSynchronizationPort;
  readonly localStorage: Storage | null;
  readonly sessionStorage: Storage | null;
  readonly platform: "mac" | "windows" | "linux" | "unknown";
  /** Logical processors reported by the host, when known. A capability hint
   * for work admission; never a device identity. */
  readonly logicalProcessorCount?: number;
  /** Approximate device memory in GiB, when the host reports it. A
   * capability hint for the performance policy; never a device identity. */
  readonly deviceMemoryGiB?: number;
  /** The user's data-saving preference and link quality, when known. */
  readonly network?: RuntimeSnapshotSource<RuntimeNetworkHints>;
  /** Observes main-thread tasks long enough to delay input, when the host
   * can measure them. */
  observeLongTasks?(listener: (durationMs: number) => void): () => void;
  /** Host memory measurement, when the platform exposes one. */
  readonly memory?: RuntimeMemorySampler;
  readonly layoutViewport: RuntimeSnapshotSource<RuntimeLayoutViewportSnapshot>;
  readonly visualViewport: RuntimeSnapshotSource<RuntimeVisualViewportSnapshot | null>;
  readonly screen: RuntimeSnapshotSource<RuntimeScreenSnapshot>;
  readonly workArea: RuntimeSnapshotSource<RuntimeWorkAreaSnapshot>;
  /** Environment-owned system clipboard authority. Tests inject a recording
   * adapter; the browser environment is the only production constructor. */
  readonly clipboard?: PasteboardAdapter | null;
  /** Environment-owned pointer geometry, observer and cursor authority. */
  readonly pointer?: RuntimePointerAdapter | null;
  /** Environment-owned segmentation and browser measurement authority. */
  readonly textLayout?: TFXTextLayoutAdapterFactory | null;
  /** Environment-owned image decode, object-URL and pixel-export authority. */
  readonly images?: RuntimeImageAdapterFactory | null;
  /** Environment-owned live box geometry for resource-backed image zoom/pan. */
  readonly imageGeometry?: RuntimeImageGeometryPort | null;
  /** Environment-owned file chooser behind every application's Open panel. Mounted apps
   * receive a scoped panel client, never this port. */
  readonly filePicker?: BrowserFilePanelPort | null;
  /** Environment-owned Web Animations and fallback-scheduler authority. */
  readonly animation?: RuntimeAnimationAdapterFactory | null;
  readonly animationFrames?: AFXFrameScheduler;
  readonly animationLayers?: AnimationLayerHost;
  /** Environment-owned decoded sound-resource and independent playback authority. */
  readonly audio?: RuntimeAudioAdapterFactory | null;
  readonly motion?: MFXMotionAdapter;
  readonly location?: LFXLocationAdapter;
  readonly midi?: MIDIAdapter;
  /** Environment-owned camera/display capture authority. Mounted apps never receive this host directly. */
  readonly videoCapture?: VideoCaptureSessionHost;
  readonly videoDecoder?: VideoDecoderBackendHost;
  readonly videoEncoder?: VideoEncoderBackendHost;
  readonly videoProcessing?: VideoFrameProcessorBackendHost;
  /** Host-owned durable search-index backend factory. Browser production uses
   * a worker-backed IndexedDB implementation; deterministic hosts may inject a fake. */
  readonly luminaIndex?: LuminaIndexBackendFactory | null;
  readonly audioCapture?: { createSession(signal?: AbortSignal, capability?: object): AUFXAudioSession };
  readonly audioFiles?: RuntimeAudioFileService;
  readonly hapticFeedback?: HFXFeedbackOptions;
  readonly systemFeedbackAudioContext?: (options?: AudioContextOptions) => AudioContext | null;
  /** Environment-owned frame, message, navigation and object-URL authority. */
  readonly webContent?: RuntimeWebContentAdapterFactory | null;
  /** Host-native brand probe used before command payload inspection touches
   * reflective object traps. Without this capability, mounted AppSDK command
   * ports fail closed for arbitrary objects and accept only their own immutable
   * runtime-created payload values. */
  readonly isNativeProxy?: (value: object) => boolean;
  /** Optional monotonic media progression clock in seconds. This is distinct
   * from now(), whose existing contract remains wall-clock milliseconds. */
  readonly monotonicNowSeconds?: () => number;
  now(): number;
  randomUUID(): string;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  requestAnimationFrame(callback: (timestamp: number) => void): unknown;
  cancelAnimationFrame(handle: unknown): void;
  matchMedia(query: string): RuntimeMediaQuery;
  addWindowListener<K extends keyof WindowEventMap>(
    type: K,
    listener: (event: WindowEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean,
  ): () => void;
}

export interface SynCloudOSRuntimeStore {
  readonly runtimeId: SynCloudOSRuntimeId;
  getSnapshot(): RuntimeSnapshot;
  cloneSnapshot(): RuntimeSnapshot;
  createCheckpoint(): RuntimeSnapshot;
  subscribe(listener: RuntimeListener): () => void;
  listenerCount(): number;
  mutate(mutator: RuntimeMutator): void;
  batch<T>(callback: () => T): T;
  replaceSnapshot(snapshot: RuntimeSnapshot): void;
  dispose(): void;
}

export interface SynCloudOSPersistence extends RuntimeOwnedService {
  getPreference<T>(key: string, fallback: T): T;
  setPreference<T>(key: string, value: T): boolean;
  removePreference(key: string): void;
  /** The stored text of a preference (null when absent or unreadable), for
   * callers that detect another context's write by content. */
  readPreferenceText?(key: string): string | null;
  /** Stores already-serialised preference text. */
  writePreferenceText?(key: string, text: string): boolean;
}

export interface RuntimeOwnedService {
  readonly runtimeId: SynCloudOSRuntimeId;
  dispose(): void | Promise<void>;
}

export interface SynCloudOSEventBus extends RuntimeOwnedService {
  publish(type: string, payload?: unknown, label?: string): SynCloudOSRuntimeEvent;
  subscribe(type: string, listener: (event: SynCloudOSRuntimeEvent) => void): () => void;
  once(type: string, listener: (event: SynCloudOSRuntimeEvent) => void): () => void;
  unsubscribe(type: string, listener: (event: SynCloudOSRuntimeEvent) => void): boolean;
  getHistory(limit?: number): SynCloudOSRuntimeEvent[];
}

export interface SynCloudOSAppRegistry extends RuntimeOwnedService {
  register(input: SynCloudOSAppManifest | TrustedSynWareBundle): SynCloudOSAppInfo | null;
  registerBundle(bundle: TrustedSynWareBundle): SynCloudOSAppInfo | null;
  registerMany(inputs: Array<SynCloudOSAppManifest | TrustedSynWareBundle>): SynCloudOSAppInfo[];
  getApp(appId: string): SynCloudOSAppInfo | null;
  getAllApps(): SynCloudOSAppInfo[];
  getDisplayApps(): SynCloudOSAppInfo[];
  getAppForRoute(pathname: string): SynCloudOSAppInfo | null;
  getRegistrationHistory(limit?: number): SynCloudOSAppRegistrationHistoryRecord[];
}

export interface SynCloudOSBundleLoader extends RuntimeOwnedService {
  readonly runtimeId: SynCloudOSRuntimeId;
  createBundle(input: SynCloudOSAppManifest | TrustedSynWareBundle): TrustedSynWareBundle;
  registerBundle(bundle: TrustedSynWareBundle, options?: { readonly publish?: boolean }): TrustedSynWareBundle;
  registerMany(inputs: Array<SynCloudOSAppManifest | TrustedSynWareBundle>): TrustedSynWareBundle[];
  getBundle(appId: string): TrustedSynWareBundle | null;
  /** Host-only provenance lookup. The record is minted outside application
   * manifests and is re-read for every privileged AppSDK operation. */
  getTrustedBundleProvenance(appId: string): SynWareTrustedBundleProvenance | null;
  getBundles(): TrustedSynWareBundle[];
  loadBundle(appId: string, options?: { readonly signal?: AbortSignal }): Promise<SynCloudOSLoadedBundle>;
  getLoadedBundle(appId: string): SynCloudOSLoadedBundle | null;
  getLifecycleHook(appId: string, hookName: string): unknown;
  invokeLifecycleHook(appId: string, hookName: SynCloudOSBundleLifecycleHookName, context?: { readonly reason?: string; readonly error?: unknown }): Promise<void>;
}

export interface SynCloudOSAppServiceClientContext {
  readonly appId: string;
  readonly permissions: readonly string[];
  readonly signal: AbortSignal;
  readonly terminalOperations?: ServiceTerminalOperations;
}

/** Host service providers expose an explicitly app-scoped projection. A raw
 * runtime service object is never returned to a mounted SynWare. */
export interface SynCloudOSAppServiceDefinition<TClient = object> {
  readonly id: string;
  readonly version?: string;
  readonly contractVersion?: string;
  readonly requiredPermissions?: readonly string[];
  createAppClient?(context: SynCloudOSAppServiceClientContext): TClient | null;
  /** Explicit host projection containing only guard-safe reads. No terminal
   * operations or mounted application capabilities are supplied. */
  createRoutePreparationClient?(context: SynCloudOSAppServiceClientContext): TClient | null;
}

export interface SynCloudOSAppServiceResolution<TClient = object> {
  readonly available: boolean;
  readonly client: TClient | null;
  readonly reason: string | null;
  readonly denied: boolean;
  readonly version: string | null;
}

export interface SynCloudOSServiceRegistry extends RuntimeOwnedService {
  register<TDefinition extends SynCloudOSAppServiceDefinition<object>>(definition: TDefinition): TDefinition | null;
  registerService(service: SynCloudOSServiceDefinition): SynCloudOSServiceDefinition;
  registerMany(services: SynCloudOSServiceDefinition[]): SynCloudOSServiceDefinition[];
  unregisterService(serviceId: string, expected?: SynCloudOSServiceDefinition): void;
  unregister(serviceId: string): boolean;
  get(serviceId: string): unknown;
  getService(serviceId: string): SynCloudOSServiceDefinition | null;
  getServices(): SynCloudOSServiceDefinition[];
  getServiceReport(requiredServices: string[]): SynCloudOSServiceReport;
  getHealthReport(requiredServices?: string[]): SynCloudOSServiceHealthReport;
  getDependencyGraph(serviceIds?: string[]): Record<string, string[]>;
  explainService(serviceId: string): SynCloudOSServiceExplanation;
  getDefaultServiceProviders(): SynCloudOSServiceProvider[];
  ensureDefaults(providers?: SynCloudOSServiceProvider[]): void;
  resolveAppClient<TClient = object>(request: {
    readonly appId: string;
    readonly serviceId: string;
    readonly permissions: readonly string[];
    readonly minimumVersion?: string;
    readonly contractVersion?: string;
    readonly signal: AbortSignal;
    readonly terminalOperations?: ServiceTerminalOperations;
    readonly purpose?: "mounted" | "route-preparation";
  }): SynCloudOSAppServiceResolution<TClient>;
}

export interface SynCloudOSPolicyKit extends RuntimeOwnedService {
  registerPolicy(policyId: string, policy: SynCloudOSPolicy): SynCloudOSPolicy;
  removePolicy(policyId: string): boolean;
  getRoleCapabilities(role: string): readonly string[];
  registerRoleCapabilities(input: SynCloudOSRoleCapabilityRegistrationInput): SynCloudOSRoleCapabilityRegistration;
  getRoleCapabilityReport(): SynCloudOSRoleCapabilityReportItem[];
  getCapabilityMatrix(): SynCloudOSCapabilityMatrix;
  getAccessMode(): SynCloudOSAccessMode;
  getAuditLog(limit?: number): SynCloudOSPolicyDecision[];
  getAuditReport(limit?: number): SynCloudOSPolicyAuditReport;
  evaluate(request: SynCloudOSPolicyRequest, options?: SynCloudOSPolicyEvaluationOptions): SynCloudOSPolicyDecision;
  authorise(request: SynCloudOSPolicyRequest): SynCloudOSPolicyDecision;
  /** Host-resolved identity/capabilities for trusted runtime bridges. */
  getCurrentSubject(): SynCloudOSPolicySubject;
  /** Observes changes to role capabilities, registered policies and access
   * mode, which do not publish the runtime store. */
  subscribe(listener: () => void): () => void;
  /** Host authority to evaluate requests as a specific subject. */
  issueSubject(subject: SynCloudOSPolicySubject, options: Readonly<{ purpose: string }>): SynCloudOSPolicySubjectGrant;
  revokeSubject(grant: SynCloudOSPolicySubjectGrant): boolean;
}

export interface SynCloudOSPermissionManager extends RuntimeOwnedService {
  getRoleCapabilities(role: string): readonly string[];
}

export interface SynCloudOSIdentityService extends RuntimeOwnedService {
  readonly session: IdentitySessionService;
  getCurrentUser(): unknown;
  isAuthenticated(): boolean;
  getRole(): string;
  getSubject(): unknown;
}


export interface SynCloudOSLoginService extends RuntimeOwnedService {
  getSnapshot(): SynCloudOSLoginSessionSnapshot;
  getSessionSnapshot(): SynCloudOSLoginSessionSnapshot;
  hydrateSession(): SynCloudOSLoginSessionSnapshot;
  hasAuthorisedSession(): boolean;
  isLocked(): boolean;
  isUnlocked(): boolean;
  lock(): Promise<void>;
}

export interface SynCloudOSLifecycle extends RuntimeOwnedService, SynCloudOSLifecycleControl {
  getState(appId: string): string;
  transition(appId: string, to: SynCloudOSAppLifecycleState, options?: SynCloudOSLifecycleTransitionOptions): SynCloudOSLifecycleTransitionResult;
  getManager(appId: string): AppManager | { readonly appId: string; getState(): string } | null;
  launch(appId: string, options?: LifecycleRequestOptions): RuntimeOperationHandle<AppLaunchResult>;
  activate(appId: string, options?: LifecycleRequestOptions): RuntimeOperationHandle<AppActivationResult>;
  suspend(appId: string, options?: LifecycleRequestOptions): RuntimeOperationHandle<AppSuspensionResult>;
  close(appId: string, options?: LifecycleRequestOptions): RuntimeOperationHandle<AppCloseResult>;
  dispatch<TPayload>(stage: SynCloudOSLifecycleStage, appId: string, payload: TPayload, options?: LifecycleRequestOptions): RuntimeOperationHandle<LifecycleDispatchResult>;
}

export interface SynCloudOSStatechart extends RuntimeOwnedService {
  getCurrentState(): SynCloudOSStateName;
  getPreviousState(): SynCloudOSStateName | null;
  getHistory(): SynCloudOSStateTransitionRecord[];
  canTransition(from: SynCloudOSStateName, to: SynCloudOSStateName): boolean;
  explainTransition(
    fromOrTo: SynCloudOSStateName,
    maybeTo?: SynCloudOSStateName,
  ): SynCloudOSStateTransitionExplanation;
  inspect(stateName?: SynCloudOSStateName): SynCloudOSStatechartInspection;
  getStateDefinition(stateName: SynCloudOSStateName): SynCloudOSStateDefinition | null;
  getStateDefinitions(): Record<SynCloudOSStateName, SynCloudOSStateDefinition>;
  gotoState(state: SynCloudOSStateName, options?: SynCloudOSStateTransitionOptions): unknown;
}

export interface SynCloudOSRouteManager extends RuntimeOwnedService {
  readonly mountedRoutes: ReturnType<typeof import("../Routing/MountedRouteSettlement").createMountedRouteSettlement>;
  readonly routeGraph: ReturnType<typeof import("../Routing/RuntimeRouteGraphOwner").createRuntimeRouteGraphOwner>;
  getCurrentOperationId(): string | null;
  getRedirectSuccessor(predecessorOperationId: string, successorOperationId: string): SynCloudOSOpenRouteHandle | null;
  inspectTransitions(limit?: number): readonly SynCloudOSRouteTransitionInspectionRecord[];
  subscribeTransitions(listener: () => void): () => void;
  normalizeRoutePath(value: unknown): SynCloudOSRouteNormalization;
  resolveRoute(pathname: string): SynCloudOSRouteResolution;
  explainRoute(pathname: string): SynCloudOSRouteExplanation;
  getAppForRoute(pathname: string): SynCloudOSAppInfo | null;
  getRouteForApp(appId: string): string | null;
  getRouteTable(): Array<{
    readonly appId: string;
    readonly packageName: string;
    readonly route: string;
    readonly normalizedRoute: string;
    readonly canonicalHref: string | null;
    readonly matchMode: "path" | "href";
    readonly routeableInternally: boolean;
    readonly externalRouteCandidate: boolean;
    readonly diagnostics: SynCloudOSRouteNormalization["diagnostics"];
    readonly visible: boolean;
    readonly type: SynCloudOSAppInfo["type"];
  }>;
  getHistory(limit?: number): Array<SynCloudOSRouteHistoryRecord & { readonly runtimeId: SynCloudOSRuntimeId }>;
  clearHistory(): void;
  cancelActiveOperations(reason: string): void;
  openRoute(pathname: string, options?: SynCloudOSOpenRouteOptions): SynCloudOSOpenRouteHandle;
}

export interface SynCloudOSLaunchServices extends RuntimeOwnedService {
  openApp(appId: string, options?: SynCloudOSOpenAppOptions): AppManager | null;
  preloadApp(appId: string, options?: SynCloudOSOpenAppOptions): Promise<unknown>;
  retryLaunch(requestIdOrAppId: string, options?: SynCloudOSOpenAppOptions): AppManager | null;
  closeApp(appId: string): Promise<unknown>;
  queueLaunch(appId: string, options?: SynCloudOSOpenAppOptions): SynCloudOSLaunchQueueItem | null;
  cancelLaunch(requestIdOrAppId: string): boolean;
  openDeferredApp(): SynCloudOSLaunchQueueSnapshot;
  openExternalApp(appId: string, options?: SynCloudOSOpenAppOptions): boolean;
  canLaunch(appId: string, options?: SynCloudOSOpenAppOptions): boolean;
  explainLaunch(appId: string, options?: SynCloudOSOpenAppOptions): SynCloudOSLaunchExplanation;
  explainExternalApp(appId: string, options?: SynCloudOSOpenAppOptions): SynCloudOSExternalAppExplanation;
  inspect(): SynCloudOSLaunchQueueSnapshot & { readonly history: SynCloudOSLaunchHistoryRecord[] };
  getHistory(limit?: number): SynCloudOSLaunchHistoryRecord[];
  clearHistory(): void;
  recordRuntimeTransition(action: SynCloudOSLaunchHistoryAction, details: {
    readonly appId: string;
    readonly source?: SynCloudOSLaunchHistoryRecord["source"];
    readonly requestId?: string;
    readonly notes?: string[];
  }): SynCloudOSLaunchHistoryRecord;
  completeMultiSwitch(switchId: string): boolean;
  completeLaunchStage(launchTransitionId: string, appId?: string | null, completionSource?: "frame" | "fallback"): boolean;
  completeLaunchCover(launchTransitionId: string, appId?: string | null, completionSource?: "animation" | "fallback"): boolean;
}
export interface SynCloudOSNotificationCenter extends RuntimeOwnedService {
  post(request: UserNotificationRequest): Promise<UserNotificationPostResult>;
  post(request: SynCloudOSNotificationPostInput, options?: SynCloudOSNotificationPostOptions): SynCloudOSNotification | null;
  getPresentationHistory(): SynCloudOSNotification[];
  getUserNotificationHistory(): UserNotificationRecord[];
  getHistory(): Array<SynCloudOSNotification | UserNotificationRecord>;
  dismiss(notificationId: string, reason?: string): Promise<UserNotificationRecord | null> | SynCloudOSNotification | null;
  invokeAction(notificationId: string, actionId: string): Promise<UserNotificationActionResult>;
  restore?(signal?: AbortSignal): Promise<void>;
  registerAction?(id: string, handler: UserNotificationActionHandler): () => boolean;
  acknowledge?(notificationId: string): Promise<UserNotificationRecord | null>;
  requestBrowserPermission?(request: { readonly userGesture: true }): Promise<UserNotificationPermission>;
  getDiagnostics?(): UserNotificationDiagnostic[];
}
/** Runtime-owned document graph. Host terminal reservations are excluded from
 * the adapter capability projected to SynWare. */
export interface SynCloudOSDocumentStore extends RuntimeOwnedService, SynCloudOSDocumentStoreAdapter {
  reserveTerminalMutation(documentId: string, identity: string): SynCloudOSDocumentStoreTerminalMutationLease;
}
export interface SynCloudOSLocaleServices extends RuntimeOwnedService {
  getActiveLocale(): string;
  getSnapshot(): SynCloudOSLocaleServicesSnapshot;
  hydrate(): SynCloudOSLocaleServicesSnapshot;
  registerBundleLocaleResources(appId: string, resources: SynCloudOSLocaleBundleResourceInput): { appId: string; registered: number };
  registerBundleLocaleResourceLoader(appId: string, loader: SynCloudOSLocaleBundleResourceLoader): { appId: string; registered: boolean };
  loadBundleLocaleResources(appIds?: string[]): Promise<Array<{ appId: string; registered: number }>>;
  setLocale(locale: string): unknown;
  clearLocale(): unknown;
  getSupportedLocales(): unknown[];
  resolveLocale(input: SynCloudOSLocaleResolutionInput): unknown;
  detectLocale(): unknown;
  isAvailable(): boolean;
  markUnavailable(error?: unknown): SynCloudOSLocaleServicesSnapshot;
  formatDate(value: Date | number | string, options?: Intl.DateTimeFormatOptions): string;
  formatTime(value: Date | number | string, options?: Intl.DateTimeFormatOptions): string;
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
  formatFileSize(bytes: number, options?: SynCloudOSLocaleFormatFileSizeOptions): string;
  formatRelativeTime(value: number, unit?: Intl.RelativeTimeFormatUnit, options?: Intl.RelativeTimeFormatOptions): string;
  formatList(values: string[], options?: Intl.ListFormatOptions): string;
  registerTranslations(namespace: string, locale: string, messages: SynCloudOSTranslationMessages): boolean;
  t(key: string, params?: SynCloudOSTranslationParams | string, namespace?: string): string;
}
export interface SynCloudOSInspector extends SynCloudOSInspectorService {}
export interface SynCloudOSErrorManager extends RuntimeOwnedService {
  capture(payload: SynCloudOSErrorPayload): CapturedSynCloudOSError;
  getLatest(): CapturedSynCloudOSError | null;
  getHistory(): CapturedSynCloudOSError[];
  dismiss(errorId: string): boolean;
  createAppNotFoundError(appId: string, context?: Record<string, unknown>): CapturedSynCloudOSError;
  createRouteNotFoundError(pathname: string, context?: Record<string, unknown>): CapturedSynCloudOSError;
  createAppLaunchFailedError(
    app: { readonly bundleIdentifier: string; readonly packageName: string; readonly displayName: string } | null,
    error: unknown,
    context?: Record<string, unknown>,
  ): CapturedSynCloudOSError;
  createNotRespondingError(
    app: { readonly bundleIdentifier: string; readonly packageName: string; readonly displayName: string } | null,
    context?: Record<string, unknown>,
    retry?: () => void,
  ): CapturedSynCloudOSError;
  createConnectionError(
    app: { readonly bundleIdentifier: string; readonly packageName: string; readonly displayName: string } | null,
    error: unknown,
    context?: Record<string, unknown>,
    retry?: () => void,
  ): CapturedSynCloudOSError;
  createLoginSessionMismatchError(
    app: { readonly bundleIdentifier: string; readonly packageName: string; readonly displayName: string } | null,
    context?: Record<string, unknown>,
  ): CapturedSynCloudOSError;
  createAppContentFailedError(
    app: { readonly bundleIdentifier: string; readonly packageName: string; readonly displayName: string } | null,
    error: unknown,
    context?: Record<string, unknown>,
  ): CapturedSynCloudOSError;
  createRuntimeRenderError(error: unknown, context?: Record<string, unknown>): CapturedSynCloudOSError;
  createGlobalScriptError(error: unknown, context?: Record<string, unknown>): CapturedSynCloudOSError;
  createUnhandledPromiseRejectionError(reason: unknown, context?: Record<string, unknown>): CapturedSynCloudOSError;
  createAssetLoadFailedError(target: unknown, context?: Record<string, unknown>): CapturedSynCloudOSError;
  toTechnicalReport(error: CapturedSynCloudOSError | null): string;
}
export interface SynCloudOSWebspringStateController extends RuntimeOwnedService {
  /** Threads the shell's folder declaration into layout reconciliation. */
  configureFolders(configuration: SynCloudOSWebspringFolderConfiguration): void;
  hydrateLayoutPreference(): unknown;
  /** Seeds the top-level order without persisting it. */
  hydrateLayoutOrder(order: string[]): void;
  hoverApp(appId: string | null): void;
  selectApp(appId: string | null): void;
  enterEditMode(itemId?: string | null): void;
  exitEditMode(commit?: boolean): void;
  /** Starts dragging an app or a folder. */
  beginDrag(itemId: string): void;
  finishDrag(commit?: boolean): void;
  /** Reorders within the container holding the item: the top level, or its folder. */
  moveItem(itemId: string, targetIndex: number, commit?: boolean): boolean;
  moveItemByKeyboard(itemId: string, key: string, columns?: number): boolean;
  /** Replaces the top-level order; it must list every top-level entry exactly once. */
  reorder(order: readonly string[]): boolean;
  setDropTarget(itemId: string | null): void;
  /** Merges an app into a folder, or with another app into a new folder. Editable folders only. */
  dropOnItem(appId: string, targetItemId: string): boolean;
  moveAppOutOfFolder(appId: string, targetIndex: number): boolean;
  /** Opens a folder. A drag may open one only when it sprang it open itself. */
  openFolder(folderId: string, options?: { readonly duringDrag?: boolean }): boolean;
  closeFolder(): void;
  commitLayoutOrder(): void;
  resetLayoutOrder(): void;
  setLoadingApp(appId: string | null, launchTransitionId?: string | null): void;
  setLaunching(appId: string | null, launchTransitionId?: string | null): void;
  coverForApp(appId: string | null, launchTransitionId?: string | null): void;
  beginReturn(appId: string | null, returnTransitionId?: string): string;
  finishReturn(returnTransitionId?: string | null): void;
  refresh(): void;
  returnToWebspring(): void;
  completeLaunchStage(launchTransitionId: string, appId?: string | null): boolean;
  completeLaunchCover(launchTransitionId: string, appId?: string | null): boolean;
  completeReturnRole(returnTransitionId: string, role: string): boolean;
  isLaunchSuppressed(): boolean;
  getSnapshot(): { readonly selectedAppId: string | null; readonly hoveredAppId: string | null };
}

export interface SynCloudOSWorkspaceController extends RuntimeOwnedService {}

export interface SynCloudOSAppManagerController extends RuntimeOwnedService {
  createManagerForApp(appInfo: SynCloudOSAppInfo, options?: { readonly replace?: boolean; readonly reason?: string; readonly publish?: boolean }): AppManager;
  publishManagerReplacement(appInfo: SynCloudOSAppInfo, reason?: string): void;
  restoreManagerForApp(appId: string, manager: AppManager | null): void;
  initializeAppManagers(): AppManager[];
  getManagerForApp(appId: string): AppManager | null;
  removeManagerForApp(appId: string): boolean;
  getAppManagers(): AppManager[];
}

export interface SynCloudOSBootManager extends RuntimeOwnedService {
  boot(options?: SynCloudOSBootOptions): unknown;
  getLastBootReport(): SynCloudOSBootReport | null;
}

export interface SynCloudOSGlobalWatchdog extends RuntimeOwnedService {
  install(): void;
  uninstall(): void;
  isInstalled(): boolean;
  getStatus(): unknown;
}

export interface SynCloudOSPluginRegistry extends RuntimeOwnedService {
  register(plugin: unknown, runtime?: unknown, options?: unknown): Promise<unknown>;
  unregister(pluginId: string): boolean;
  enable(pluginId: string): Promise<unknown>;
  disable(pluginId: string): Promise<unknown>;
  getPlugin(pluginId: string): unknown;
  getPlugins(): unknown[];
}

export interface SynCloudOSResponsiveModeManager extends RuntimeOwnedService {
  sync(): void;
  observe(): void;
  unobserve(): void;
  getSnapshot(): unknown;
}

export interface SynCloudOSWebspringChoreography extends RuntimeOwnedService {
  beginReturn(appId: string | null, requiredRoles?: readonly string[]): string;
  completeReturn(returnTransitionId: string, completionSource: "animation" | "fallback" | "manual"): boolean;
  completeReturnRole(returnTransitionId: string, role: string): boolean;
  getMultiSwitchSettleFallbackMs(): number;
  restoreHotReturnFallback(): boolean;
  inspect(): unknown;
}

export interface OperationCoordinator extends RuntimeOwnedService {
  run<I, T>(definition: OperationDefinition<I, T>): KernelOperationHandle<T>;
  inspectPending(): OperationRecord[];
  inspectHistory(limit?: number): OperationRecord[];
  subscribe(listener: () => void): () => void;
  quiesce(reason: string): OperationQuiesceLease;
}

export interface PresentationSettlementCoordinator extends RuntimeOwnedService {
  begin(request: PresentationSettlementRequest): PresentationSettlementHandle;
  get(id: string): PresentationSettlementHandle | null;
  inspect(id: string): { readonly status: "pending" | "settled"; readonly roles?: readonly string[]; readonly completedRoles?: readonly string[] };
  inspectPending(): PresentationSettlementInspectionRecord[];
  subscribe(listener: () => void): () => void;
}

export interface SynCloudOSBootOptions {
  readonly initialPathname?: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface SynCloudOSBootResult {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly status: "completed" | "reused";
  readonly initialPathname: string;
}

export interface ApplicationDocumentRuntimeConfiguration {
  readonly recoveryStore?: DocumentRecoveryStore;
  readonly initialAdapters?: readonly DocumentStorageAdapter[];
  readonly initialTypes?: readonly DocumentType<unknown, unknown>[];
  /** Supplied stores are host owned; createStore results are runtime owned. */
  readonly assetBacking?: DocumentAssetRuntimeBacking;
}

export interface SynCloudOSRuntimeConfig {
  readonly theme?: NSEThemeDefinition;
  readonly id?: string;
  readonly environment: SynCloudOSRuntimeEnvironment;
  /** Runtime-owned browser adapters may be supplied independently of the environment bundle. */
  readonly adapters?: SynCloudOSRuntimeAdapters;
  readonly initialBundles?: readonly TrustedSynWareBundle[];
  /** Host-provisioned immutable document schemas. Mounted AppSDK code cannot
   * register or migrate kinds. */
  readonly trustedDocumentKinds?: readonly SynCloudOSDocumentKindMetadata[];
  /** Host-owned lock shared by every writer to this backing persistence.
   * Defaults to browser Web Locks; absent locks leave conditional writes unavailable. */
  readonly documentStoreLock?: SynCloudOSDocumentStoreLock;
  readonly initialPathname?: string;
  readonly persistenceNamespace?: string;
  readonly windowPersistenceNamespace?: string;
  readonly operationHistoryLimit?: number;
  /** Heavy-job admission capacity; defaults derive from logical CPU count. */
  readonly jobs?: Partial<HeavyJobCapacity>;
  /** Estimated bytes above which reclaimable runtime resources are trimmed
   * when the budget is enforced; unset means no aggregate soft budget. */
  readonly resourceSoftBudgetBytes?: number | null;
  /** "adaptive" (default) lets the performance policy lower heavy-job
   * concurrency and the resource budget on constrained hosts; "fixed" keeps
   * the configured values. */
  readonly performancePolicy?: "adaptive" | "fixed";
  readonly commandHistoryLimit?: number;
  readonly undoMaxEntries?: number;
  readonly undoMaxEstimatedBytes?: number;
  readonly lifecycleHookTimeoutMs?: number;
  readonly presentationTimeoutMs?: number;
  /** Host-owned presentation roles for a route; omitted hosts use static final presentation. */
  readonly presentationRolesForRoute?: (input: { readonly hasApplication: boolean }) => readonly string[];
  /** Explicit cross-application drag authority. Absence always denies. */
  readonly dragAuthorisation?: DragAuthorisationPort;
  /** Explicit remote-image decode/export authority. Absence denies remote URLs. */
  readonly imageAuthorisation?: RuntimeImageAuthorisationPort;
  /** Explicit embedded-web authority. Absence denies every load and action. */
  readonly webContentAuthorisation?: RuntimeWebContentAuthorisationPort;
  readonly identity?: {
    readonly sessionAdapter: IdentitySessionAdapter;
  };
  readonly authenticationPolicy?: "disabled" | "optional" | "required";
  /** The host's role taxonomy for PolicyKit and Identity. Defaults to
   * Syndromatic's (`defaultPolicyProfile`). */
  readonly policyProfile?: SynCloudOSPolicyProfile;
  readonly userNotifications?: {
    readonly persistence: UserNotificationPersistenceAdapter;
    readonly delivery?: UserNotificationDeliveryAdapter;
    readonly maxRecords?: number;
    readonly maxDeliveryAttempts?: number;
  };
  readonly applicationDocuments?: ApplicationDocumentRuntimeConfiguration;
}

export interface SynCloudOSRuntimeAdapters {
  readonly clipboard?: PasteboardAdapter | null;
}

/** A host memory measurement. Every field is null when the platform does not
 * expose it; values are the browser's, not framework estimates. */
export interface RuntimeMemorySample {
  /** Which API produced the sample. */
  readonly source: string;
  readonly jsHeapUsedBytes: number | null;
  readonly jsHeapTotalBytes: number | null;
  readonly jsHeapLimitBytes: number | null;
  /** performance.measureUserAgentSpecificMemory(), which requires cross-origin isolation. */
  readonly userAgentSpecificBytes: number | null;
  readonly domNodes: number | null;
}

export interface RuntimeMemorySampler {
  sample(): Promise<RuntimeMemorySample>;
}

export interface SynCloudOSRuntimeController {
  readonly runtimeId: SynCloudOSRuntimeId;
  getSnapshot(): RuntimeSnapshot;
  inspect(): RuntimeSnapshot;
  subscribe(listener: RuntimeListener): () => void;
  commit(mutator: RuntimeMutator): void;
  batch<T>(callback: () => T): T;
  transaction<T>(
    callbackOrLabel: string | RuntimeTransactionCallback<T>,
    optionsOrCallback?: RuntimeTransactionOptions | string | RuntimeTransactionCallback<T>,
  ): T | Promise<T | undefined> | undefined;
  afterCommit(effect: RuntimePostCommitEffect, label?: string): unknown;
  getTransactionHistory(): RuntimeTransactionRecord[];
  clearTransactionHistory(): void;
  getHistory(): unknown[];
  getEventHistory(limit?: number): SynCloudOSRuntimeEvent[];
  readonly Lifecycle: SynCloudOSLifecycle;
  readonly lifecycle: SynCloudOSLifecycle;
  assertInvariant(): true;
  markBooted(): void;
}

export interface SynCloudOSRuntime {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly environment: SynCloudOSRuntimeEnvironment;
  readonly signal: AbortSignal;
  readonly disposalState: RuntimeDisposalState;
  readonly store: SynCloudOSRuntimeStore;
  /** Bounded, non-reactive diagnostic histories (events, transactions). */
  readonly diagnostics: SynCloudOSRuntimeDiagnostics;
  readonly persistence: SynCloudOSPersistence;
  readonly documentStore: SynCloudOSDocumentStore;
  readonly events: SynCloudOSEventBus;
  readonly operations: OperationCoordinator;
  /** Shared admission for heavy asynchronous CPU jobs (image, search, PDF).
   * Not for realtime work: audio, MIDI, input or animation frames. */
  readonly jobs: HeavyJobAdmission;
  /** Aggregate resource accounting and pressure relief across runtime
   * owners (caches, image leases, attachments, job reservations). */
  readonly resources: RuntimeResourceLedger;
  /** Adaptive capacity from capability signals and observed pressure. */
  readonly performancePolicy: RuntimePerformancePolicy;
  readonly runtimeController: SynCloudOSRuntimeController;
  readonly commands: CommandSystem;
  readonly responders: ResponderGraph;
  readonly focus: FocusManager;
  readonly keyBindings: KeyBindingManager;
  readonly undo: UndoManagerRegistry;
  readonly colourPanel: ColourPanelService;
  readonly pasteboards: PasteboardRegistry;
  readonly drag: DragSessionManager;
  /** Runtime-issued app scope authority. Raw transfer services are kernel-owned. */
  readonly transfers: RuntimeTransferAuthority;
  readonly tracking: TrackingRegionManager;
  readonly textLayout: TFXTextLayoutService;
  readonly images: RuntimeImageService;
  readonly animations: RuntimeAnimationService;
  readonly audio: RuntimeAudioService;
  readonly mediaClock: MediaClockService;
  readonly video: VideoCaptureService;
  readonly motion: MotionService;
  readonly location: LocationService;
  readonly midi: MIDIService;
  readonly lumina: LuminaIndexService;
  readonly luminaHost: LUFXHostService;
  readonly haptics: HFXHapticEngine;
  readonly hapticHost: HFXHostService;
  readonly audioGraphs: AudioGraphHostService;
  readonly webContent: RuntimeWebContentService;
  readonly presentationSettlements: PresentationSettlementCoordinator;
  readonly caches: RuntimeCacheRegistry;
  readonly apps: SynCloudOSAppRegistry;
  readonly bundles: SynCloudOSBundleLoader;
  readonly services: SynCloudOSServiceRegistry;
  readonly policy: SynCloudOSPolicyKit;
  readonly permissions: SynCloudOSPermissionManager;
  readonly identity: SynCloudOSIdentityService;
  readonly login: SynCloudOSLoginService;
  readonly lifecycle: SynCloudOSLifecycle;
  readonly statechart: SynCloudOSStatechart;
  readonly routes: SynCloudOSRouteManager;
  readonly launchServices: SynCloudOSLaunchServices;
  readonly screen: ScreenService;
  /** Runtime-host traits are the canonical projection for shell consumers.
   * Mounted apps receive their own content-bound AppPresentationClient. */
  readonly presentationTraits: SynCloudOSPresentationTraitsService;
  readonly windows: WindowManager;
  readonly documents: DocumentController;
  readonly documentResources: DocumentResourceService;
  /** Optional host cooperation; never passed wholesale through an SDK facade. */
  readonly documentAssets?: DocumentAssetRuntimeCooperation;
  readonly notifications: SynCloudOSNotificationCenter;
  readonly locale: SynCloudOSLocaleServices;
  readonly inspector: SynCloudOSInspector;
  readonly errors: SynCloudOSErrorManager;
  readonly alerts: SynCloudOSAlertCenter;
  readonly webspring: SynCloudOSWebspringStateController;
  readonly systemUI: SystemUIService;
  readonly preferencePanes: PreferencePaneRegistry;
  readonly settings: SynCloudOSSettingsService;
  readonly theme: NSEThemeDefinition;
  readonly appearance: SynCloudOSAppearanceService;
  readonly workspace: SynCloudOSWorkspaceController;
  readonly appManager: SynCloudOSAppManagerController;
  readonly bootManager: SynCloudOSBootManager;
  readonly globalWatchdog: SynCloudOSGlobalWatchdog;
  readonly pluginRegistry: SynCloudOSPluginRegistry;
  readonly responsiveModeManager: SynCloudOSResponsiveModeManager;
  readonly webspringChoreography: SynCloudOSWebspringChoreography;
  run<I, T>(definition: OperationDefinition<I, T>): KernelOperationHandle<T>;
  logOut(options?: { readonly reason?: string; readonly signal?: AbortSignal }): KernelOperationHandle<{
    readonly runtimeId: SynCloudOSRuntimeId;
    readonly reason: string;
  }>;
  boot(options?: SynCloudOSBootOptions): Promise<SynCloudOSBootResult>;
  registerDisposalParticipant(participant: RuntimeDisposalParticipant): RuntimeDisposalRegistration;
  dispose(request?: string | RuntimeDisposalRequest): Promise<RuntimeDisposalResult>;
}
