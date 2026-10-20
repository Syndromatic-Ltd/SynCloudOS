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

/**
 * Reviewed runtime graph for the portable package. Keep this narrower than the
 * in-repository compatibility barrel: external SynWare receive authoring and
 * session capabilities, never a runtime/store/manager escape hatch.
 */
export { SCOS, useSCOS, createAppSCOS, SCOSError } from "./scos";
export type { SCOSFacade, SCOSApplicationInfo, SCOSPreferences, SCOSStrings, SCOSErrorCode, SynCloudOSAlertRequest, SynCloudOSAlertButton, SynCloudOSAlertButtonRole } from "./scos";
export { useFonts } from "./fontAccess";
export type { SynWareFontAccess } from "./fontAccess";
export { createSynWareNSETextOwner, bindSynWareNSETextEditingSession } from "./SynWareTextAdapter";
export type { SynWareNSETextOwnerOptions } from "./SynWareTextAdapter";
export { createSynWareDocumentOutputPreparation } from "./SynWareDocumentOutputAdapter";
export type {
  DocumentEditSelection,
  DocumentEditSelectionReceipt,
  DocumentEditResourceRetention,
  DocumentEditOptions,
  DocumentEditReceipt,
  DocumentEditRejectionReason,
  DocumentEditRejection,
  DocumentEditResult,
} from "../Documents";
export type {
  DocumentEditingReason,
  DocumentEditingIssue,
  DocumentEditingParticipantResult,
  DocumentEditingContext,
  DocumentEditingParticipant,
  DocumentEditingLifetimeOptions,
  DocumentEditingParticipantRegistration,
  DocumentEditingSettlementResult,
} from "../Documents";
export type { DocumentAssetReference, DocumentAssetScope, DocumentAssetStoreCapabilities } from "../Documents";
export type { FilePanelAcceptType } from "../FilePanels";
export { createDocumentOutputPreparation } from "../Documents";
export type {
  DocumentOutputPurpose,
  DocumentOutputSnapshot,
  DocumentOutputSettlement,
  DocumentOutputDependencies,
  DocumentOutputLease,
  DocumentOutputFallback,
  DocumentOutputRetainResult,
  DocumentOutputDependency,
  DocumentOutputDrawing,
  DocumentOutputDrawingContext,
  DocumentOutputPage,
  DocumentOutputPlan,
  DocumentOutputEngine,
  DocumentOutputRequest,
  DocumentOutputReadiness,
  DocumentOutputDependencyReceipt,
  DocumentOutputReceipt,
  DocumentOutputPDFResult,
  PreparedDocumentOutput,
  DocumentOutputPreparationResult,
  DocumentOutputPreparation,
  DocumentOutputPDFArtifact,
  DocumentOutputPrintHost,
  DocumentOutputPrintResult,
} from "../Documents";
export { requestDocumentOutputPrint, createBrowserDocumentOutputPrintHost } from "../Documents";
export type { MEFXClockLease, MEFXMediaClient } from "../../FX/MediaFX/MEFXMediaClient";
export { defineSynWareServiceToken, SynWareServiceAcquisitionError } from "./serviceToken";
export type { SynWareServiceToken, SynWareServiceTokenDefinition } from "./serviceToken";
export { SynCloudOSLifecycleError } from "../ErrorManager/lifecycleError";
export type {
  SynCloudOSLifecycleDisposal,
  SynCloudOSLifecycleDisposalReason,
  SynCloudOSLifecycleErrorOptions,
  SynCloudOSLifecycleResource,
} from "../ErrorManager/lifecycleError";
export type { ServiceTerminalClient, ServiceTerminalReceipt, ServiceTerminalRequest } from "../Documents";
export { SynWareColourPanelProvider, type SynWareColourPanelProviderProps } from "./SynWareColourPanelProvider";
export { createSynWareNSEDataViewDragBinding, type SynWareNSEDataViewDragOptions, type SynWareNSEDataViewDropProposal } from "./SynWareNSEDragAdapter";
export { createSynWareNSEDragCommandPort, createSynWareNSEFontPanelCommandPort } from "./SynWareNSECommandAdapter";
export { createSynWareNSETextLayoutPort, useNSEViewAnimator } from "./SynWareNSEMediaAdapters";
export type { TFXTextGeometryCapabilities, TFXTextLayoutResult } from "../../FX/TextFX/textLayoutTypes";
export { useNSEMenuPort } from "./SynWareNSEMenuPort";
export { ResponderScope, type ResponderScopeProps } from "../../SynCloudOSReact/ResponderScope";
export { useApplicationMenuTrigger } from "../../SynCloudOSReact/ApplicationMenuTrigger";
export type { ApplicationMenuTriggerPort as SynWareApplicationMenuTriggerPort } from "../../SynCloudOSReact/ApplicationMenuTrigger";
export { useQuickSwitchTrigger } from "../../SynCloudOSReact/QuickSwitchTrigger";
export type { QuickSwitchTriggerPort as SynWareQuickSwitchTriggerPort } from "../../SynCloudOSReact/QuickSwitchTrigger";
export { SynWareManifestValidationError } from "./createSynWare";
export { defineSynWareRoutes } from "./defineSynWareRoutes";
export type {
  SynCloudOSRouteInfo,
  SynWareNamedRouteTarget,
  SynWareRouteAfterLoad,
  SynWareRouteComponentProps,
  SynWareRouteDefinition,
  SynWareRouteErrorProps,
  SynWareRouteGraph,
  SynWareRouteGraphDefinition,
  SynWareRouteGuard,
  SynWareRouteGuardResult,
  SynWareRouteLazyModule,
  SynWareRouteLoadContext,
  SynWareRouteLoader,
  SynWareRouteLoadingProps,
  SynWareRouteNames,
  SynWareRouteQueryCodec,
  SynWareRouteQueryForName,
  SynWareRouteQueryIssue,
  SynWareRouteQueryRefresh,
  SynWareRouteQuerySchema,
  SynWareRouteRecognition,
} from "./defineSynWareRoutes";
export { RouteOutlet } from "./RouteOutlet";
export type { SynCloudOSRouteTransitionHandle, SynCloudOSRouteTransitionResult } from "../Routing/appSdkRoutePort";
export { QueryValidationError, routeQuery } from "../Routing/appSdkRoutePort";
export { captureSynWareManifest, validateSynWareManifest } from "./manifest";
export { projectRuntimeManifest } from "./projectRuntimeManifest";
export type {
  SynWareBackgroundHandler,
  SynWareBundleLoadContext,
  SynWareDefinition,
  SynWareMigration,
} from "./appDefinitionTypes";
export type {
  SynWareAppearanceManifest,
  SynWareBackgroundManifest,
  SynWareCommandManifest,
  SynWareDocumentTypeManifest,
  SynWareLifecycleManifest,
  SynWareApplicationAvailability,
  SynWareManifestOverrides,
  SynWareLocalisedText,
  SynWareManifestIssue,
  SynWareManifestValidation,
  SynWareManifestValidationFailure,
  SynWareManifestValidationSuccess,
  SynWareManifestV1,
  SynWareMenuManifest,
  SynWareMinimumViewportManifest,
  SynWarePresentation,
  SynWareRouteManifest,
  SynWareRuntimeManifestContext,
  SynWareWindowDefaultsManifest,
  SynWareWebspringFolderManifest,
  SynWareWebspringFoldersManifest,
  SynWareWebspringManifest,
  SynWareWebspringShellManifest,
  SynWareWebspringViewManifest,
  SynWareResourceReference,
} from "./manifest";
export type { SynWareContextValue, SynWareRuntimeInfo, SynWareSiteBranding } from "./appContextTypes";
/** Application document declarations describe app-owned content only. They
 * intentionally omit raw stores, adapters, and host registration paths. */
export type { ApplicationDocument, ApplicationDocumentSnapshot } from "../Documents";
export type {
  DocumentCloseReason,
  DocumentCloseResult,
  DocumentConflict,
  DocumentConflictResolution,
  DocumentLocation,
  DocumentType,
  DocumentVersion,
  OpenDocumentRequest,
  SaveDocumentOptions,
} from "../Documents";
export { DocumentError, DocumentNotFoundError, DocumentUnavailableError } from "../Documents";
export type { SynCloudOSTranslationParams, SynCloudOSTranslationPrimitive } from "../LocaleServices/localeTypes";
export type {
  AppAppearanceClient,
  AppClientHandle,
  AppColourPanelClient,
  AppColourPanelSnapshot,
  AppCommandClient,
  AppDocumentClient,
  AppDocumentConflict,
  AppDocumentConflictInput,
  AppDocumentConflictResolution,
  AppDocumentLocation,
  AppDocumentNewRequest,
  AppDocumentOpenRequest,
  AppDocumentRecord,
  AppDocumentSaveOptions,
  AppDocumentSnapshot,
  AppDocumentVersion,
  AppDocumentResourcesClient,
  AppDocumentAssetPreparedEdit,
  AppDragClient,
  AppDragDestinationRequest,
  AppDragEndpoint,
  AppDragOperation,
  AppDragRepresentation,
  AppDragSession,
  AppLifecycleClient,
  AppLifecycleEvent,
  AppLocaleClient,
  AppNavigationClient,
  AppNavigationOptions,
  AppNavigationRoute,
  AppNavigationTransitionHandle,
  AppNavigationTransitionResult,
  AppPasteboardClient,
  AppResponderClient,
  AppServiceClient,
  AppServiceDenial,
  AppServiceResult,
  AUFXAudioClient,
  AUFXAudioHandle,
  AppUndoClient,
  AppUndoAction,
  AppUndoHistory,
  AppUndoReservation,
  AppWorkspaceDocumentsClient,
  AppWindowClient,
  AppWindowSnapshot,
} from "./appClientTypes";
export type {
  AppWindowChromeActions,
  AppWindowChromePointerDownEvent,
  AppWindowChromeProps,
  AppWindowChromeSnapshot,
  SynWareOwnedDocumentRematerialiseContext,
  SynWareOwnedDocumentRematerialiser,
  SynWareOwnedProjectionRequest,
  SynWareOwnedProjectionResult,
} from "./appDefinitionTypes";
export { useWindowChrome } from "./windowChromeContexts";
export { TFXFontDescriptor, type TFXFontDescriptorOptions } from "../../FX/TextFX/TFXFontDescriptor";
export type { TFXFontReadinessChange, TFXFontRegistration, TFXFontResourceMimeType } from "../../FX/TextFX/textLayoutTypes";
export type {
  AppAnimationClient,
  AppAnimationHandle,
  AppAnimationOwner,
  AppAnimationSettlement,
  AppConnectivityClient,
  AppErrorClient,
  AppEventClient,
  AppEventType,
  AppExternalActionClient,
  AppGraphicsIdentifierIssuer,
  AppImageGeometryClient,
  AppIdentityClient,
  AppIdentitySnapshot,
  AppFilePanelClient,
  AppImageClient,
  AppMediaQueryClient,
  AppNotificationAction,
  AppNotificationClient,
  AppNotificationRequest,
  AppPersistenceClient,
  AppSchedulerClient,
  AppSettingsAvailabilityClient,
  AppSettingsAvailabilitySnapshot,
  AppShareClient,
  AppShareRequest,
  AppTextLayoutClient,
  AppTrackingClient,
  AppWebContentClient,
  AppWebContentNavigationAuthority,
  AppWebContentSession,
  AppWebContentSessionSnapshot,
  AppWorkAreaClient,
  AppWorkAreaSnapshot,
} from "./appEnvironmentClientTypes";
export type {
  AppTrustedClient,
  AppTrustedConformanceAccessibilityFinding,
  AppTrustedConformanceAppearanceFact,
  AppTrustedConformanceClient,
  AppTrustedConformanceLocaleEvidence,
  AppTrustedConformanceRuntimeEvidence,
  AppTrustedDiagnosticsClient,
} from "./appTrustedClientTypes";
export {
  useAnimations,
  useAppearance,
  useConnectivity,
  useColourPanel,
  useCommands,
  useDocument,
  useDrag,
  useErrors,
  useEvents,
  useExternalActions,
  useIdentity,
  useIdentitySnapshot,
  useFilePanels,
  useImages,
  useLifecycle,
  useMediaQueries,
  useMediaQuery,
  useNotifications,
  usePasteboard,
  usePersistence,
  useRouteData,
  useRouter,
  useRouteState,
  useScheduler,
  useService,
  useSettingsAvailability,
  useSettingsAvailabilitySnapshot,
  useShare,
  useAudio,
  useMotion,
  useMedia,
  useVideo,
  useLocation,
  useMIDI,
  useLumina,
  useHaptics,
  useTextLayout,
  useTracking,
  useTrustedClient,
  useWebContent,
  useWindow,
  useWorkArea,
  useWorkAreaSnapshot,
} from "./hooks";
export type {
  SynWareAppearanceState,
  SynWareColourPanelState,
  SynWareCommandDefinition,
  SynWareRouter,
  SynWareRouterPreloadOptions,
  SynWareRouterSnapshot,
  SynWareRouteStateClient,
  SynWareWindowState,
} from "./hooks";

export { useStrings, translateSynWareText, getSynWareNamespace } from "./useStrings";
export { action } from "./actions";
export type { NSEActionMethod, NSEActionOptions } from "./actions";
export { NSEViewControllerView } from "./applicationHosting";
export type { NSEViewControllerViewProps } from "./applicationHosting";
// Called by the code the dev server appends to application modules, and by the host that runs them.
export { acceptApplicationHotUpdate, currentClass, registerApplicationHotModule, trackLiveApplicationObject } from "./applicationHotReload";
export type { ApplicationHotContext, ApplicationHotModuleRecord, LiveApplicationObject } from "./applicationHotReload";
