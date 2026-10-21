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

export { SynCloudOSNSEFontPanel, type SynCloudOSNSEFontPanelProps } from "../../SynCloudOSReact/SynCloudOSNSEFontPanel";
export { SynWareProvider, type SynWareProviderProps } from "./SynWareContext";
export { SCOS, useSCOS, createAppSCOS } from "./scos";
export type { SCOSFacade, SCOSApplicationInfo, SCOSPreferences, SCOSStrings, SCOSErrorCode } from "./scos";
export { useFonts } from "./fontAccess";
export type { SynWareFontAccess } from "./fontAccess";
export * from "./hooks";
export { createSynWare, createSynWareBundle, SynWareManifestValidationError } from "./createSynWare";
export { defineSynWareServiceToken, SynWareServiceAcquisitionError } from "./serviceToken";
export type { SynWareServiceToken, SynWareServiceTokenDefinition } from "./serviceToken";
export { defineSynWareRoutes } from "./defineSynWareRoutes";
export type * from "./defineSynWareRoutes";
export { RouteOutlet } from "./RouteOutlet";
export { QueryValidationError, routeQuery } from "../Routing/appSdkRoutePort";
export { useWindowChrome } from "./windowChromeContexts";
export { TFXFontDescriptor, type TFXFontDescriptorOptions } from "../../FX/TextFX/TFXFontDescriptor";
export type { TFXFontReadinessChange, TFXFontRegistration, TFXFontResourceMimeType } from "../../FX/TextFX/textLayoutTypes";
export type {
  AppWindowChromeActions,
  AppWindowChromePointerDownEvent,
  AppWindowChromeProps,
  AppWindowChromeSnapshot,
  AppWindowCloseResult,
} from "./appClientTypes";
export { captureSynWareManifest, validateSynWareManifest } from "./manifest";
export { projectRuntimeManifest } from "./projectRuntimeManifest";
export type {
  SynWareBackgroundHandler,
  SynWareBundleLoadContext,
  SynWareDefinition,
  SynWareMigration,
  SynWareOwnedDocumentRematerialiseContext,
  SynWareOwnedDocumentRematerialiser,
  SynWareOwnedProjectionRequest,
  SynWareOwnedProjectionResult,
} from "./appDefinitionTypes";
export type {
  SynWareAppearanceManifest,
  SynWareBackgroundManifest,
  SynWareCommandManifest,
  SynWareDocumentTypeManifest,
  SynWareLifecycleManifest,
  SynWareApplicationAvailability,
  SynWareInfo,
  SynWareLocalisedText,
  SynWareManifestIssue,
  SynWareManifestValidation,
  SynWareManifestV1,
  SynWareMenuManifest,
  SynWareMinimumViewportManifest,
  SynWarePresentation,
  SynWareRouteManifest,
  SynWareServiceManifest,
  SynWareRuntimeManifestContext,
  SynWareWebspringFolderManifest,
  SynWareWebspringFoldersManifest,
  SynWareWebspringManifest,
  SynWareWebspringShellManifest,
  SynWareWebspringViewManifest,
  SynWareResourceReference,
  SynWareWindowDefaultsManifest,
} from "./manifest";
export type { SynWareContextValue, SynWareRuntimeInfo, SynWareSiteBranding } from "./appContextTypes";
export type {
  SynCloudOSAppModule,
  SynCloudOSBundleModuleLoader,
  TrustedSynWareBundle,
} from "../SynCloudOS";
export type {
  SynCloudOSLocaleBundleResourceInput,
  SynCloudOSLocaleBundleResourceLoader,
} from "../SynCloudOS";
export type {
  AppAppearanceClient,
  AppClientHandle,
  AppColourPanelClient,
  AppCommandClient,
  AppDocumentClient,
  AppDocumentAssetPreparedEdit,
  AppDocumentSnapshot,
  AppDocumentVersion,
  AppDocumentSaveOptions,
  AppDocumentCloseResult,
  AppDragClient,
  AppLifecycleClient,
  AppLocaleClient,
  AppNavigationClient,
  AppNavigationOptions,
  AppNavigationRoute,
  AppNavigationTransitionHandle,
  AppNavigationTransitionResult,
  AppPasteboardClient,
  AppPresentationClient,
  AppResponderClient,
  AppServiceClient,
  AppServiceDenial,
  AppServiceResult,
  AUFXAudioClient,
  AppUndoClient,
  AppWindowClient,
  AppWindowSnapshot,
} from "./appClientTypes";
export type * from "./appEnvironmentClientTypes";
export type {
  AppTrustedClient,
  AppTrustedConformanceAccessibilityFinding,
  AppTrustedConformanceAppearanceFact,
  AppTrustedConformanceClient,
  AppTrustedDiagnosticsClient,
  AppTrustedConformanceLocaleEvidence,
} from "./appTrustedClientTypes";
/** Public app-authoring bridge for live command menu presentation. */
export { useCommandMenuItems } from "../../SynCloudOSReact";
export type { CommandMenuItem as SynWareCommandMenuItem } from "../../SynCloudOSReact";
/** Public app-authoring bridge for command-menu presentation. */
export { useRuntimeNSEMenuPort as useNSEMenuPort } from "../../SynCloudOSReact";
/** Public app-authoring boundary for locally focused control responders. */
export { ResponderScope, type ResponderScopeProps } from "../../SynCloudOSReact";
export { useApplicationMenuTrigger } from "../../SynCloudOSReact";
export type { ApplicationMenuTriggerPort as SynWareApplicationMenuTriggerPort } from "../../SynCloudOSReact";
export { useQuickSwitchTrigger } from "../../SynCloudOSReact";
export type { QuickSwitchTriggerPort as SynWareQuickSwitchTriggerPort } from "../../SynCloudOSReact";
export { useCommandRegistration } from "../../SynCloudOSReact";
/** Public app-authoring services retain the canonical runtime panel contracts. */
export { createFilePanelService, createMediaPanelService } from "../SynCloudOS";
export type {
  FilePanelAdapter,
  FilePanelCapability,
  FilePanelReference,
  FilePanelResult,
  FilePanelSaveTarget,
  MediaPanelItem,
  OpenPanelRequest,
  SavePanelRequest,
} from "../SynCloudOS";
export type { ApplicationDocumentSnapshot, DocumentType } from "../SynCloudOS";
export type { SynCloudOSRuntime } from "../SynCloudOS";
export type * from "../SynCloudOS";
export { DocumentError, DocumentNotFoundError, DocumentUnavailableError, DocumentWriteOutcomeUnknownError } from "../SynCloudOS";
export type { SynCloudOSDocumentStoreAdapter, SynCloudOSDocumentStoreContext, SynCloudOSDocumentKindMetadata } from "../SynCloudOS";
export type { SynCloudOSPolicySubject } from "../SynCloudOS";
export type { SynCloudOSRole } from "../SynCloudOS";
export { createLocaleServicesFacade } from "../SynCloudOS";
export type { SynCloudOSTranslationParams, SynCloudOSTranslationPrimitive } from "../SynCloudOS";
export { useResolvedAppearance } from "../SynCloudOS";
export type {
  SynWareCommandAcceptance,
  SynWareCommandDeclaration as CommandDeclaration,
  SynWareCommandDispatchOptions,
  SynWareCommandDispatchResult,
  SynWareCommandExecutionContext,
  SynWareCommandPresentation,
  SynWareCommandQueryContext,
  SynWareCommandValidation,
  SynWareCommandValidationOptions,
} from "../../SynCloudOSReact";
export type { SynWareRuntime } from "./appRuntimeTypes";
export type {
  SynWareAnimationDiagnostics,
  SynWareAnimationPort,
  SynWareColourPanelPort,
  SynWareCommandPort,
  SynWareDocumentResourcesPort,
  SynWareDocumentStorePort,
  SynWareImagePort,
  SynWareImageDiagnostics,
  SynWarePlatformPort,
  SynWareAudioPort,
  SynWareAudioDiagnostics,
  SynWareStatePort,
  SynWareTextLayoutPort,
  SynWareTextLayoutDiagnostics,
  SynWareTrackingDiagnostics,
  SynWareTrackingPort,
  SynWareWorkspaceDocumentPort,
  SynWareWebContentDiagnostics,
  SynWareWebContentPort,
} from "./appRuntimeTypes";
export type {
  SynWareCommandPayloadSchema,
  SynWareCommandScope,
  SynWareCommandTitle,
  SynWareCommandUndoPolicy,
} from "./appRuntimeTypes";

export { useStrings, translateSynWareText, getSynWareNamespace } from "./useStrings";
export { action, useAction, bindActionResponder, hasActions, actionNames, refreshActionBindings } from "./actions";
export type { NSEActionBinding, NSEActionHost, NSEActionMethod, NSEActionOptions, NSEActionState } from "./actions";
export { NSEViewControllerView } from "./applicationHosting";
export type { NSEViewControllerViewProps } from "./applicationHosting";
export type { SynCloudOSPresentationTraits } from "./appClientTypes";
export type { SCOSRoutes } from "./controllerServices";
