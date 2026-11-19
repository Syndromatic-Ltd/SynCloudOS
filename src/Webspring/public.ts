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

export {
  WSApplication,
  createWebspring,
  isWSApplicationClass,
  isWSDefinition,
  resolveLauncher,
  withDiscoveredWebspringItems,
} from "./WSApplication";
export type {
  WSApplicationClass,
  WSCreateWebspringInput,
  WSDefinition,
} from "./WSApplication";
export { WSLauncherContext, WSLauncherRootView, WSLauncherViewController, useWSLauncher } from "./WSLauncherViewController";
export type { WSLauncherFolders, WSLauncherRootProps, WSLauncherViewControllerClass } from "./WSLauncherViewController";
export { WSIconView } from "./WSIconView";
export type { WSIconHoverEndEvent, WSIconViewProps } from "./WSIconView";
export { WSBoardViewController } from "./Contents/Views/WSBoardViewController/WSBoardViewController";
export { captureWSInfo } from "./WSInfo";
export type { WSBranding, WSCapturedBranding, WSCapturedInfo, WSInfo } from "./WSInfo";
export {
  createIntegrationContribution,
  defineIntegration,
  integrationOwners,
  isIntegrationDefinition,
} from "./webspringIntegration";
export type {
  SynWareIntegrationDefinition,
  SynWareIntegrationDiscovered,
  SynWareIntegrationInput,
} from "./webspringIntegration";
export { NSEPreferencePane, capturePreferencePaneClass, resolvePreferencePanes } from "../SynCloudOS/Preferences";
export type { NSEPreferencePaneClass, PreferencePaneDescriptor, PreferencePaneText, PreferencePaneViewProps } from "../SynCloudOS/Preferences";

// The pieces a site's own launcher view is built from, as the Board is.
export { WSWidgetShelfView } from "./WSWidgetShelfView";
export type { WSWidgetShelfViewProps } from "./WSWidgetShelfView";
export { useWebspringHapticEngine } from "./webspringHaptics";
export { WSSurface, webspringSurfaceStyle } from "./WSSurface";
export { WSWidget, captureWSWidgetClass } from "./WSWidget";
export type { WSWidgetClass, WSWidgetDescriptor, WSWidgetState, WSWidgetTimers } from "./WSWidget";
export { WSDragProxy, getWebspringDragGrabOffset, useWSDragProxyPosition } from "./WSDragProxy";
export type { WebspringDragProxyPoint, WebspringDragProxyRect } from "./WSDragProxy";
export { createWSFolderSplitPresentation } from "./WSFolderSplitView";
export type { WebspringFolderSplitOptions } from "./WSFolderSplitView";
export { WSFolderTileView } from "./WSFolderTileView";
export { useWebspringFolderAppearance } from "./WebspringFolderAppearance";
export type { WSFolderTileViewProps } from "./WSFolderTileView";
export { WSIconArtwork } from "./WSIconArtwork";
export type { WSIconArtworkProps } from "./WSIconArtwork";
export { WSIconEffect } from "./WSIconEffect";
export { WSLaunchDim, resolveWebspringLaunchDimMotion } from "./WSLaunchDim";
export type { WebspringLaunchDimMotion } from "./WSLaunchDim";
export {
  getWebspringRadialExitForIcon,
  getWebspringSelectorTransform,
  resolveWebspringIconPresentation,
  resolveWebspringOrbPresentation,
  useWebspringMotion,
  webspringIconSprings,
} from "./Webspring.transitions";
export type {
  WebspringIconPresentation,
  WebspringIconPresentationOptions,
  WebspringIconState,
  WebspringMotion,
  WSRadialExit,
} from "./Webspring.transitions";
export {
  WEBSPRING_DRAG_FOLDER_CATCH_MARGIN,
  WEBSPRING_DRAG_FOLDER_REST_MS,
  WEBSPRING_DRAG_MERGE_REST_MS,
  WEBSPRING_DRAG_REORDER_REST_MS,
  WEBSPRING_DRAG_SPRING_OPEN_MS,
  createWSDragArbiter,
} from "./webspringDragArbiter";
export type {
  WebspringDragArbiter,
  WebspringDragArbiterOptions,
  WebspringDragEntry,
  WebspringDragHandlers,
  WebspringDragPoint,
  WebspringDragRect,
  WebspringDragResult,
  WebspringDragView,
} from "./webspringDragArbiter";
export { captureWSDragArtworkRects, captureWebspringDragReorderSlots, getWebspringDragReorderTargetFromPoint } from "./webspringDragReorder";
export type { WebspringDragReorderSlots } from "./webspringDragReorder";
export { WEBSPRING_STAGE, getDesktopWebspringLayout, stagePointStyle } from "./stage";
export type {
  WSAccountAction,
  ActionResult,
  WSActionResult,
  AuthenticationPolicy,
  AuthenticationConfiguration,
  AuthenticationInput,
  WebspringBackground,
  WebspringBackgroundInput,
  LocalisedText,
  Presentation,
  ResourceReference,
  ShellMode,
  WebspringActions,
  WSApp,
  WSAppItem,
  WebspringDialPlacement,
  WebspringFolderAppearance,
  WSFolderAppearanceOptions,
  WebspringFolderCornerRadius,
  WebspringFolderFill,
  WSFolderItem,
  WSFolderPresentationComponent,
  WSFolderPresentationProps,
  WebspringFolderShape,
  WebspringFolderSmoothSurface,
  WebspringFolderTexture,
  WSIconEffectComponent,
  WSIconEffectProps,
  WSItem,
  WebspringPreferences,
  WebspringPreferencesOptions,
  WSQuickSwitchOptions,
  WSLaunchZoom,
  WebspringViewModel,
  WSWidgetEntry,
  WSResolvedBranding,
} from "./webspringTypes";
