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

/** AppSDK republishes the React-owned mounted-context contract through its
 * sanctioned public entrypoint. This prevents React from depending back on
 * AppSDK while leaving SynWare on their stable AppSDK import. */
export type {
  SynWareAnimationDiagnostics,
  SynWareAnimationOwnerLease,
  SynWareAnimationPort,
  SynWareCatalogPort,
  SynWareColourPanelPort,
  SynWareCommandAcceptance,
  SynWareCommandDeclaration,
  SynWareCommandDispatchOptions,
  SynWareCommandDispatchResult,
  SynWareCommandExecutionContext,
  SynWareCommandPort,
  SynWareCommandPresentation,
  SynWareCommandQueryContext,
  SynWareCommandValidation,
  SynWareCommandValidationOptions,
  SynWareDocumentResourcesPort,
  SynWareDocumentStorePort,
  SynWareDragManager,
  SynWareErrorsPort,
  SynWareEventsPort,
  SynWareFocusPort,
  SynWareImageLoadRequest,
  SynWareImageDiagnostics,
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
  SynWareServiceDenial,
  SynWareServicePort,
  SynWareServiceResult,
  SynWareSettingsPort,
  SynWareAudioActivation,
  SynWareAudioDiagnostics,
  SynWareAudioLoadRequest,
  SynWareAudioPort,
  SynWareStatePort,
  SynWareTextLayoutDiagnostics,
  SynWareTextLayoutPort,
  SynWareTrackingDiagnostics,
  SynWareTrackingOptions,
  SynWareTrackingPort,
  SynWareTrackingRegistration,
  SynWareUndoManager,
  SynWareUndoOwner,
  SynWareUndoPort,
  SynWareWebContentDiagnostics,
  SynWareWebContentPort,
  SynWareWorkspaceDocumentPort,
} from "../../SynCloudOSReact";

export type { TFXRunDelegateReadinessChange, TFXRunDelegateRequest } from "../../FX/TextFX/textLayoutTypes";

/** These declaration-only command helpers are intentionally sourced from the
 * mounted-contract module until SynCloudOSReact's public barrel adopts them. */
export type {
  SynWareCommandPayloadSchema,
  SynWareCommandScope,
  SynWareCommandTitle,
  SynWareCommandUndoPolicy,
} from "../../SynCloudOSReact";
