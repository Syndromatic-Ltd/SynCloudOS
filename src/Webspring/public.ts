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

export { defineWebspring, isDefinedWebspring, withDiscoveredWebspringItems } from "./Webspring";
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
export { definePreferencePane, isPreferencePaneDefinition } from "../SynCloudOS/Preferences";
export type { PreferencePaneDefinition, PreferencePaneInput, PreferencePaneText, PreferencePaneViewProps } from "../SynCloudOS/Preferences";
export { WebspringBoardView, createWebspringBoardView } from "./Contents/Views/WebspringBoardView/WebspringBoardView";
export type { WebspringBoardConfiguration } from "./Contents/Views/WebspringBoardView/WebspringBoardView";

// The pieces a site's own launcher view is built from, as the Board is.
export { WebspringWidgetShelf } from "./WebspringWidgetShelf";
export { WebspringSurface, webspringSurfaceStyle } from "./webspringSurface";
export { defineWidget, isDefinedWebspringWidget } from "./webspringWidget";
export { WebspringDragProxy, getWebspringDragGrabOffset, useWebspringDragProxyPosition } from "./WebspringDragProxy";
export type { WebspringDragProxyPoint, WebspringDragProxyRect } from "./WebspringDragProxy";
export { createWebspringFolderSplitPresentation } from "./WebspringFolderSplitPresentation";
export type { WebspringFolderSplitOptions } from "./WebspringFolderSplitPresentation";
export { WebspringFolderTile } from "./WebspringFolderTile";
export { useWebspringFolderAppearance } from "./WebspringFolderAppearance";
export type { WebspringFolderTileProps } from "./WebspringFolderTile";
export { WebspringIconArtwork } from "./WebspringIconArtwork";
export type { WebspringIconArtworkProps } from "./WebspringIconArtwork";
export { WebspringIconEffect } from "./WebspringIconEffect";
export { WebspringLaunchDim, resolveWebspringLaunchDimMotion } from "./WebspringLaunchDim";
export type { WebspringLaunchDimMotion } from "./WebspringLaunchDim";
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
  WebspringRadialExit,
} from "./Webspring.transitions";
export {
  WEBSPRING_DRAG_FOLDER_CATCH_MARGIN,
  WEBSPRING_DRAG_FOLDER_REST_MS,
  WEBSPRING_DRAG_MERGE_REST_MS,
  WEBSPRING_DRAG_REORDER_REST_MS,
  WEBSPRING_DRAG_SPRING_OPEN_MS,
  createWebspringDragArbiter,
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
export { captureWebspringDragArtworkRects, captureWebspringDragReorderSlots, getWebspringDragReorderTargetFromPoint } from "./webspringDragReorder";
export type { WebspringDragReorderSlots } from "./webspringDragReorder";
export { WEBSPRING_STAGE, getDesktopWebspringLayout, stagePointStyle } from "./stage";
export type {
  AccountAction,
  ActionResult,
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
  WebspringApp,
  WebspringAppItem,
  WebspringDefinition,
  WebspringDefinitionInput,
  WebspringDialPlacement,
  WebspringFolderAppearance,
  WebspringFolderAppearanceOptions,
  WebspringFolderCornerRadius,
  WebspringFolderFill,
  WebspringFolderItem,
  WebspringFolderPresentationComponent,
  WebspringFolderPresentationProps,
  WebspringFolderShape,
  WebspringFolderSmoothSurface,
  WebspringFolderTexture,
  WebspringIconEffectComponent,
  WebspringIconEffectProps,
  WebspringItem,
  WebspringManifest,
  WebspringPreferences,
  WebspringPreferencesOptions,
  WebspringQuickSwitchOptions,
  WebspringViewComponent,
  WebspringLaunchZoom,
  WebspringViewDeclaration,
  WebspringViewModel,
  WebspringWidget,
  WebspringWidgetEntry,
  WebspringWidgetInput,
  WebspringWidgetViewProps,
  WebspringViewProps,
} from "./webspringTypes";
