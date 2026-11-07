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

/** SynCloudOS shell composition surface. This is not a SynWare package entry. */
export {
  NSEMaterialLighting,
  staticNSEMaterialLight,
} from "./Appearance/NSEMaterialLighting";
export type {
  NSEMaterialLight,
  NSEMaterialLightingPort,
} from "./Appearance/NSEMaterialLighting";
export { NSEMaterialLightingProvider } from "./Appearance/NSEMetalThumb";
export {
  NSEFeedbackProvider,
  useNSEFeedback,
} from "./Feedback";
export { resolveNSEFocusReturnTarget, isWithinNSEFocusOrigin } from "./Focus/focusOrigin";

export { NSEAlertSurface } from "./Components/NSEAlertSurface";
export { SourceListFrameProvider } from "./Navigation/SourceList/sourceListFrameContext";
export type { SourceListFrameContextValue } from "./Navigation/SourceList/sourceListFrameContext";

export { NSEAlertBackdrop } from "./SystemUI";
export { nseTopBarHeightCssValue } from "./Windows/Chrome/nseTopBarStyles";
export { NSEFocusScope } from "./Focus";
export { NSEPopover } from "./Overlays/NSEPopover";
export { NSEPopup } from "./Overlays/NSEPopup";

// Window chrome and transient surfaces are drawn by NSE for framework hosts.
export { NSETopBar } from "./Windows/Chrome/NSETopBar";
export { NSEWindowTitlebarHostContext } from "./Windows/windowTitlebarContext";
export type { NSEWindowTitlebarDocument, NSEWindowTitlebarHost } from "./Windows/windowTitlebarContext";
export { NSEPopoverFrame } from "./Overlays/NSEPopoverFrame";
export { applyNSEPopoverPosition, computeNSEPopoverPosition, nsePopoverEdgePlacement, nsePopoverReference } from "./Overlays/popoverPosition";
export type { NSEPopoverPosition } from "./Overlays/popoverPosition";
export { nsePopoverSpringEasing, useNSEPopoverSurface } from "./Overlays/useNSEPopoverSurface";
export { NSEWindowSurfaceBridgeProvider } from "./Overlays/NSEWindowSurfaceBridge";
export type { NSEWindowSurfaceRequest } from "./Overlays/NSEWindowSurfaceBridge";
export { logicalPlacementToFloatingPlacement } from "./Overlays/computeNSEOverlayPosition";
export { registerNSEHapticFeedbackEngine } from "./Feedback/NSEHapticFeedbackManager";
export { NSEViewDrawingEnvironmentContext } from "./Views/NSEViewDrawingEnvironment";
export type { NSEViewDrawingEnvironment } from "./Views/NSEViewDrawingEnvironment";
