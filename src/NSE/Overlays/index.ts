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
export { NSEStandaloneControlHost } from "./NSEStandaloneControlHost";
export type { NSEStandaloneControlHostProps } from "./NSEStandaloneControlHost";
export { createStandaloneNSEControlRuntime } from "./createStandaloneNSEControlRuntime";
export type {
  NSEStandaloneControlRuntime,
  NSEStandaloneControlRuntimeOptions,
} from "./createStandaloneNSEControlRuntime";
export { computeOverlayPosition, computeNSEViewportCornerPosition, logicalPlacementToFloatingPlacement } from "./computeOverlayPosition";
export type { OverlayDirection, OverlayPositionOptions, OverlayPositionScheduler, NSEViewportCornerPositionOptions } from "./computeOverlayPosition";
export { useNSEOverlay } from "./useNSEOverlay";
export type { UseNSEOverlayOptions, UseNSEOverlayResult } from "./useNSEOverlay";
export { NSEPopup, useNSEPopupOpenState } from "./NSEPopup";
export type { NSEPopupPresentation, NSEPopupProps } from "./NSEPopup";
export { NSEPopover } from "./NSEPopover";
export type { NSEPopoverProps } from "./NSEPopover";
export { NSEUtilityPanel } from "./NSEUtilityPanel";
export type { NSEUtilityPanelProps } from "./NSEUtilityPanel";
export { NSEListboxPopup } from "./NSEListboxPopup";
export type { NSEListboxOption, NSEListboxPopupProps } from "./NSEListboxPopup";
export { NSEActionSheet } from "./NSEActionSheet";
export type { NSEActionSheetProps, NSEModalWindowBridge, NSEModalWindowRequest } from "./NSEActionSheet";
export { NSEWindowSurfaceBridgeProvider, useOptionalNSEWindowSurfaceBridge } from "./NSEWindowSurfaceBridge";
export type { NSEWindowSurfaceBridge, NSEWindowSurfaceRequest, NSEWindowSurfaceDismissResult, NSEWindowSurfaceErrorContext } from "./NSEWindowSurfaceBridge";
export { reportNSEWindowSurfaceError, useNSEWindowSurfaceLifecycle } from "./useNSEWindowSurfaceLifecycle";
export type {
  NSELogicalPlacement,
  OverlayDismissReason,
  OverlayId,
  OverlayKind,
  OverlayManager,
  OverlayRegistration,
  OverlayRuntimePort,
  OverlaySnapshot,
  OverlayFocusScopeOptions,
} from "./overlayTypes";
export { NSEDialogSurface } from "./NSEDialogSurface";
export type { NSEDialogSurfaceProps } from "./NSEDialogSurface";
