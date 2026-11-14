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

export { createOverlayManager } from "./overlayManager";
export { OverlayProvider, useNSEOverlayProvider, useOptionalOverlayProvider } from "./OverlayProvider";
export type { OverlayProviderProps } from "./OverlayProvider";
export { StandaloneControlHost } from "./NSEStandaloneControlHost";
export type { StandaloneControlHostProps } from "./NSEStandaloneControlHost";
export { createStandaloneNSEControlRuntime } from "./createStandaloneNSEControlRuntime";
export type {
  StandaloneControlRuntime,
  StandaloneControlRuntimeOptions,
} from "./createStandaloneNSEControlRuntime";
export { computeOverlayPosition, computeNSEViewportCornerPosition, logicalPlacementToFloatingPlacement } from "./computeOverlayPosition";
export type { OverlayDirection, OverlayPositionOptions, OverlayPositionScheduler, ViewportCornerPositionOptions } from "./computeOverlayPosition";
export { useNSEOverlay } from "./useNSEOverlay";
export type { UseNSEOverlayOptions, UseNSEOverlayResult } from "./useNSEOverlay";
export { NSEPopup, useNSEPopupOpenState } from "./NSEPopup";
export type { PopupPresentation, NSEPopupProps } from "./NSEPopup";
export { NSEPopover } from "./NSEPopover";
export type { NSEPopoverProps } from "./NSEPopover";
export { UtilityPanel } from "./NSEUtilityPanel";
export type { UtilityPanelProps } from "./NSEUtilityPanel";
export { ListboxPopup } from "./NSEListboxPopup";
export type { ListboxOption, ListboxPopupProps } from "./NSEListboxPopup";
export { ActionSheet } from "./NSEActionSheet";
export type { ActionSheetProps, ModalWindowBridge, ModalWindowRequest } from "./NSEActionSheet";
export { WindowSurfaceBridgeProvider, useOptionalNSEWindowSurfaceBridge } from "./NSEWindowSurfaceBridge";
export type { WindowSurfaceBridge, WindowSurfaceRequest, WindowSurfaceDismissResult, WindowSurfaceErrorContext } from "./NSEWindowSurfaceBridge";
export { reportNSEWindowSurfaceError, useNSEWindowSurfaceLifecycle } from "./useNSEWindowSurfaceLifecycle";
export type {
  LogicalPlacement,
  OverlayDismissReason,
  OverlayId,
  OverlayKind,
  OverlayManager,
  OverlayRegistration,
  OverlayRuntimePort,
  OverlaySnapshot,
  OverlayFocusScopeOptions,
} from "./overlayTypes";
export { DialogSurface } from "./NSEDialogSurface";
export type { DialogSurfaceProps } from "./NSEDialogSurface";
