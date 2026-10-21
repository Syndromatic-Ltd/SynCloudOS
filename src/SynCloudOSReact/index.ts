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

export { RuntimeInputBoundary } from "./RuntimeInputBoundary";
export { ResponderScope } from "./ResponderScope";
export type { ResponderScopeProps } from "./ResponderScope";
export { FocusScope } from "./FocusScope";
export type { FocusScopeProps } from "./FocusScope";
export { useRuntimeNSEFocusPort, useRuntimeNSEOverlayPort } from "./nseFocusPort";
export { useRuntimeNSEMenuPort, useRuntimeNSEControlPort } from "./nseMenuPort";
export type { RuntimeNSEFocusPort, RuntimeNSEFocusScopeOptions } from "./nseFocusPort";
export { activateResponderHierarchy, clearOwnedResponderAnchor, useResponderHierarchy } from "./responderHierarchy";
export { SynCloudOSProvider, SynWareRuntimeContext, SynCloudOSRuntimeContext, useKernelSynCloudOS } from "./SynCloudOSProvider";
export { HostSiteBrandingProvider, useHostSiteBranding } from "./siteBrandingContext";
export type {
  SynWareAnimationOwnerLease,
  SynWareAnimationPort,
  SynWareCatalogPort,
  SynWareColourPanelPort,
  SynWareCommandAcceptance,
  SynWareCommandDeclaration,
  SynWareCommandDispatchOptions,
  SynWareCommandDispatchResult,
  SynWareCommandExecutionContext,
  SynWareCommandPayloadSchema,
  SynWareCommandPort,
  SynWareCommandPresentation,
  SynWareCommandQueryContext,
  SynWareCommandScope,
  SynWareCommandTitle,
  SynWareCommandUndoPolicy,
  SynWareCommandValidation,
  SynWareCommandValidationOptions,
  SynWareDocumentResourcesPort,
  SynWareDocumentStorePort,
  SynWareDragManager,
  SynWareErrorsPort,
  SynWareEventsPort,
  SynWareFocusPort,
  SynWareImageLoadRequest,
  SynWareImagePort,
  SynWareLifecyclePort,
  SynWareOpenDocumentWindowRequest,
  SynWareOwnedWindowSnapshot,
  SynWareWindowBounds,
  SynWareWindowCloseResult,
  SynWareWindowPort,
  SynWareWindowSnapshot,
  SynWareLocalePort,
  SynWareNavigationPort,
  SynWareNotificationsPort,
  SynWarePersistencePort,
  SynWarePlatformPort,
  SynWareRuntime,
  SynWareRuntimeSnapshot,
  SynWareLocaleServicesSnapshot,
  SynWareSettingsPort,
  SynWareAudioActivation,
  SynWareAudioLoadRequest,
  SynWareAudioPort,
  SynWareStatePort,
  SynWareServiceDenial,
  SynWareServicePort,
  SynWareServiceResult,
  SynWareAnimationDiagnostics,
  SynWareImageDiagnostics,
  SynWareAudioDiagnostics,
  SynWareTextLayoutDiagnostics,
  SynWareTrackingDiagnostics,
  SynWareTextLayoutPort,
  SynWareTrackingOptions,
  SynWareTrackingPort,
  SynWareTrackingRegistration,
  SynWareUndoManager,
  SynWareUndoOwner,
  SynWareUndoPort,
  SynWareWebContentDiagnostics,
  SynWareWebContentPort,
  SynWareWorkspaceDocumentPort,
} from "./appRuntimeTypes";
export { useRuntimeSelector, useRuntimeSnapshot } from "./runtimeHooks";
export { useActiveLocale, useAppearance, useLocaleFormatter, useLocaleServicesSnapshot, useResolvedAppearance, useSettings } from "./serviceHooks";
export { useCommandDispatch, useCommandMenuItems, useCommandPresentation, useCommandRegistration } from "./commandHooks";
export type { CommandMenuItem } from "./commandHooks";
export { ApplicationMenuTriggerProvider, useApplicationMenuTrigger } from "./ApplicationMenuTrigger";
export type { ApplicationMenuTriggerPort } from "./ApplicationMenuTrigger";
export { QuickSwitchTriggerProvider, useQuickSwitchTrigger } from "./QuickSwitchTrigger";
export { useHostFontManager } from "./hostFontsContext";
export { SystemAlert, SystemAlertAssetCache } from "./SystemAlert";
export type { QuickSwitchTriggerPort } from "./QuickSwitchTrigger";
