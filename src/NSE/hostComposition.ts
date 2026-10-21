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

export { NSEAlert } from "./Components/NSEAlert";
export { SourceListFrameProvider } from "./Navigation/SourceList/sourceListFrameContext";
export type { SourceListFrameContextValue } from "./Navigation/SourceList/sourceListFrameContext";

export { NSEThemeProvider, useNSEThemeProjection } from "./Appearance/NSEThemeProvider";
