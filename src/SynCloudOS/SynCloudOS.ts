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

import { AppInfo } from "./AppInfo/AppInfo";
import { Config } from "./Config/Config";
import { createRuntimeRunner } from "./Runtime/run";
import { createAppLifecycleRules } from "./AppManager/AppLifecycle";
import type { RuntimeSnapshot } from "./Runtime/runtimeTypes";
import type { SynCloudOSRuntime } from "./Runtime/runtimeInstanceTypes";

export { createSynCloudOS } from "./Runtime/createSynCloudOS";
export { createContentBoundPresentationTraitsService } from "./ResponsiveModeManager/ResponsiveModeManager";
export { Config } from "./Config/Config";
export { openSynCloudOSRuntimeRoute } from "./Routing/runtimeRouteClient";
export { normalizeRoutePath } from "./Routing/routeNormalization";
export { compareServiceVersions, serviceVersionAtLeast, strongerServiceVersion } from "./serviceVersion";
export type { SynCloudOSOpenRouteOptions, SynCloudOSRouteResolution } from "./RouteManager/routeTypes";
export type {
  SynCloudOSAppModule,
  SynCloudOSBundleModuleLoader,
  TrustedSynWareBundle,
} from "./BundleLoader/bundleTypes";
export type {
  SynCloudOSAppAboutManifest,
  SynCloudOSAppFrameManifest,
  SynCloudOSAppIconManifest,
  SynCloudOSAppLifecycleManifest,
  SynCloudOSAppManifest,
  SynCloudOSAppMenuManifest,
  SynCloudOSAppNotificationManifest,
  SynCloudOSAppPresentation,
  SynCloudOSAppSeoManifest,
  SynCloudOSAppType,
  SynCloudOSAppWebspringManifest,
  SynCloudOSAppWindowManifest,
  SynCloudOSStagePoint,
} from "./AppRegistry/appRegistryTypes";
export type { SynCloudOSAppFrameSmoothSurfaceManifest } from "./AppRegistry/appRegistryTypes";
export type { SynCloudOSAppAccessPolicy } from "./PolicyKit/policyTypes";
export type { SynCloudOSPolicySubject } from "./PolicyKit/policyTypes";
export type { SynCloudOSPolicyProfile, SynCloudOSPolicyProfileSession, SynCloudOSPolicySubjectGrant } from "./PolicyKit/policyTypes";
/** Runtime-owned, presentation-safe inspector wire contracts. The producer
 * remains private; consumers receive only immutable snapshot values. */
export type {
  ConformanceInspectorExport,
  ConformanceInspectorSnapshot,
  ConformanceInspectorSnapshotOptions,
  ConformanceInspectorSnapshotPort,
} from "./Inspector/conformanceInspectorTypes";
export type { SynCloudOSResponsiveMode, SynCloudOSResponsiveState } from "./ResponsiveModeManager/responsiveTypes";
export type {
  PresentationTraitsObserverSources,
  SynCloudOSHorizontalSizeClass,
  SynCloudOSPresentationTraits,
  SynCloudOSPresentationTraitsService,
} from "./ResponsiveModeManager/presentationTypes";
export type {
  RuntimeLayoutViewportSnapshot,
  RuntimeMediaQuery,
  RuntimeScreenSnapshot,
  RuntimeSnapshotSource,
  RuntimeVisualViewportSnapshot,
  RuntimeWorkAreaSnapshot,
  SynCloudOSRuntime,
  SynCloudOSRuntimeConfig,
  SynCloudOSRuntimeEnvironment,
  SynCloudOSRuntimeId,
  RuntimeTestCapabilityControl,
  RuntimeTestCapabilityControls,
} from "./Runtime/runtimeInstanceTypes";
export type { RuntimeSnapshot };
export * from "./Commands";
export * from "./Responders";
export * from "./Focus";
export * from "./Undo";
export * from "./KeyBindings";
export * from "./Documents";
export type {
  DocumentStoreWriteOptions,
  SynCloudOSDocumentStoreAdapter,
  SynCloudOSDocumentStoreContext,
  SynCloudOSDocumentKindMetadata,
  SynCloudOSDocumentDraftInput,
  SynCloudOSDocumentPublishOptions,
  SynCloudOSDocumentUnpublishOptions,
} from "./DocumentStore/documentStoreTypes";
export type { SynCloudOSDocument, SynCloudOSDocumentOwnership } from "./DocumentStore/documentStoreTypes";
export type { SynCloudOSDocumentStoreTerminalMutationLease } from "./DocumentStore/PersistenceDocumentStore";
export * from "./FilePanels";
export * from "./MediaPanels";
export * from "./Windows";
export * from "./ColourPanel";
export * from "./Pasteboard";
export * from "./Drag";
export * from "./Transfer";
export {
  registerMountedAppResponder,
  setMountedAppResponderRegistrar,
  clearMountedAppResponderRegistrar,
} from "./Responders/MountedAppResponderBridge";
export {
  getMountedAppOverlayAuthority,
  setMountedAppOverlayAuthority,
  clearMountedAppOverlayAuthority,
} from "./Runtime/MountedAppOverlayBridge";
export type { MountedAppOverlayAuthority } from "./Runtime/MountedAppOverlayBridge";
export * from "./Pointer";
export * from "./TextFX";
export * from "./Images";
export * from "./AnimationFX";
export * from "./AudioFX";
export * from "./WebContent";
export * from "./Models/GeometryValues";
export type { SynCloudOSAppInfo } from "./AppInfo/appInfoTypes";
export { AppInfo };
export { prepareRenderedCanvasCapture } from "./AnimationFX/renderedCanvasCapture";
export type { SynCloudOSAppLifecycleState } from "./AppManager/appManagerTypes";
export type * from "./NotificationCenter/notificationTypes";
export type {
  UserNotificationActionDeclaration,
  UserNotificationActionResult,
  UserNotificationDeliveryAttempt,
  UserNotificationDeliveryResult,
  UserNotificationDiagnostic,
  UserNotificationPermission,
  UserNotificationPolicySummary,
  UserNotificationPostResult,
  UserNotificationPostStatus,
  UserNotificationRecord,
  UserNotificationRequest,
  UserNotificationState,
} from "./NotificationCenter/notificationDeliveryTypes";
export type { CapturedSynCloudOSError } from "./ErrorManager/errorTypes";
export {
  DESKTOP_DIAL_ITEM_LIMIT,
  EMPTY_WEBSPRING_FOLDER_CONFIGURATION,
  WEBSPRING_LAYOUT_PREFERENCE_KEY,
  WEBSPRING_STAGE,
  getDesktopDialAngles,
  getDesktopWebspringSlots,
  getDialPoint,
  getKeyboardReorderIndex,
  getOrderedVisibleWebspringApps,
  reconcileWebspringLayout,
} from "./WebspringState/webspringStateProjection";
export type {
  WebspringDesktopLayout,
  WebspringDesktopSlot,
  WebspringDesktopSlotRegion,
  WebspringLayoutInput,
  WebspringLayoutProjection,
} from "./WebspringState/webspringStateProjection";
export {
  WEBSPRING_MULTI_SWITCH_ROLES,
  WEBSPRING_PRESENTATION_ROLES,
  WEBSPRING_RETURN_ROLES,
  webspringPresentationRoles,
} from "./WebspringState/webspringPresentation";
export type { WebspringMultiSwitchRole, WebspringReturnRole } from "./WebspringState/webspringPresentation";
export type {
  WebspringContentItem,
  WebspringContentReadRequest,
  WebspringContentSource,
  WebspringContentSources,
} from "./WebspringState/webspringContentTypes";
export type { SynCloudOSMultiSwitchState } from "./ApplicationState/applicationStateTypes";
export { AppPresentationErrorFallback, SynCloudOSWatchdog } from "./ErrorManager/SynCloudOSWatchdog";
export { toTechnicalReport } from "./ErrorManager/errorReport";
export { SynCloudOSLifecycleError } from "./ErrorManager/lifecycleError";
export type {
  SynCloudOSLifecycleDisposal,
  SynCloudOSLifecycleDisposalReason,
  SynCloudOSLifecycleErrorOptions,
  SynCloudOSLifecycleResource,
} from "./ErrorManager/lifecycleError";
export type { SynCloudOSAppearance, SynCloudOSResolvedMode } from "./Appearance/appearanceService";
export type { SynCloudOSSettings } from "./Settings/settingsService";
export type { SynCloudOSRole } from "./PermissionManager/permissionTypes";
export { resolveSiteBranding } from "./Branding/siteBranding";
export type { ResolvedSiteBranding } from "./Branding/siteBranding";
export type {
  SynCloudOSLocaleBundleResourceInput,
  SynCloudOSLocaleBundleResourceLoader,
  SynCloudOSLocaleServicesSnapshot,
  SynCloudOSTranslationParams,
  SynCloudOSTranslationPrimitive,
} from "./LocaleServices/localeTypes";
export { DocumentError, DocumentNotFoundError } from "./Documents/DocumentErrors";
export { useResolvedMode } from "./Appearance/useAppearance";
export type { PreferencePaneDescriptor, PreferencePaneRegistry } from "./Preferences";
export { WEBSPRING_LAYOUT_PREFERENCE_VERSION } from "./WebspringState/webspringStateTypes";
export type {
  SynCloudOSWebspringFolderConfiguration,
  SynCloudOSWebspringFolderDefinition,
  SynCloudOSWebspringLayoutPreference,
  SynCloudOSWebspringLayoutPreferenceSource,
  SynCloudOSWebspringLayoutState,
  SynCloudOSWebspringState,
} from "./WebspringState/webspringStateTypes";
export { createLocaleServicesFacade } from "./LocaleServices/LocaleServices";
export type {
  IdentitySessionAdapter,
  IdentitySessionAdapterSnapshot,
  IdentitySessionService,
  IdentitySessionSnapshot,
} from "./Identity/identitySessionTypes";
export type { NetworkAdapter, NetworkAdapterRequest, NetworkFetch } from "./PlatformAdapters/networkAdapterTypes";
export type {
  AuthenticationConfiguration,
  AuthenticationInput,
  AuthenticationMethod,
  AuthenticationPolicy,
  AuthenticationService,
  AuthenticationSnapshot,
  AuthenticationStatus,
  AuthenticationViewComponent,
  AuthenticationViewProps,
} from "./Authentication/authenticationTypes";

const facadeCache = new WeakMap<SynCloudOSRuntime, Record<string, any>>();

export function createSynCloudOSFacade(runtime: SynCloudOSRuntime) {
  const cached = facadeCache.get(runtime);
  if (cached) return cached;
  const controller = runtime.runtimeController;
  const run = createRuntimeRunner(runtime);
  const facade = {
    version: Config.version,
    Config,
    Runtime: controller,
    run,
    Commands: runtime.commands,
    Responders: runtime.responders,
    Focus: runtime.focus,
    KeyBindings: runtime.keyBindings,
    Undo: runtime.undo,
    Pasteboards: runtime.pasteboards,
    Drag: runtime.drag,
    Tracking: runtime.tracking,
    TextLayout: runtime.textLayout,
    Images: runtime.images,
    Animations: runtime.animations,
    Audio: runtime.audio,
    WebContent: runtime.webContent,
    EventBus: runtime.events,
    Statechart: runtime.statechart,
    statechart: runtime.statechart,
    ServiceRegistry: runtime.services,
    RouteManager: runtime.routes,
    AppInfo,
    AppRegistry: runtime.apps,
    AppManager: runtime.appManager,
    AppLifecycle: createAppLifecycleRules(),
    LaunchServices: runtime.launchServices,
    WindowManager: runtime.windows,
    ErrorManager: runtime.errors,
    GlobalWatchdog: runtime.globalWatchdog,
    NotificationCenter: runtime.notifications,
    WebspringState: runtime.webspring,
    WebspringChoreography: runtime.webspringChoreography,
    LoginServices: runtime.login,
    LocaleServices: runtime.locale,
    Settings: runtime.settings,
    Appearance: runtime.appearance,
    BootManager: runtime.bootManager,
    BundleLoader: runtime.bundles,
    Inspector: runtime.inspector,
    Lifecycle: runtime.lifecycle,
    PermissionManager: runtime.permissions,
    PolicyKit: runtime.policy,
    PluginRegistry: runtime.pluginRegistry,
    ResponsiveModeManager: runtime.responsiveModeManager,
    Persistence: runtime.persistence,
    Documents: runtime.documents,
    DocumentStore: runtime.documentStore,
    get apps() { return runtime.apps.getAllApps(); },
    get displayApps() { return runtime.apps.getDisplayApps(); },
  };
  facadeCache.set(runtime, facade);
  return facade;
}
