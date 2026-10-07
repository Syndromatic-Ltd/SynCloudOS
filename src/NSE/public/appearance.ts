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

/** Supported SynWare SDK NSE appearance surface. Concrete themes are explicit subpaths. */
export {
  NSEAppearanceProvider,
  useNSEAppearance,
  useNSEAppearanceProjection,
  useNSEAppearanceSlot,
  resolveNSEAppearanceSlot,
} from "../Appearance";
export type { NSEAppearanceProviderProps } from "../Appearance";
export {
  defineNSEAppearance,
} from "../Appearance";
export type {
  NSEAppearanceDataAttributes,
  NSEAppearanceDefinition,
  NSEAppearanceDefinitionInput,
  NSEAppearanceRecipeDefinition,
  NSEAppearanceSelection,
  NSEAppearanceServicePort,
  NSEChromeAppearance,
  NSEColourScheme,
  NSEContrast,
  NSEResolvedAppearance,
  NSEResolvedColourScheme,
  NSEAppearanceSlotResolution,
  NSETransparency,
} from "../Appearance";

export { NSEMaterialLightingProvider } from "../Appearance/NSEMetalThumb";
export { NSEMaterialLighting, staticNSEMaterialLight } from "../Appearance/NSEMaterialLighting";
export type { NSEMaterialLight, NSEMaterialLightingPort } from "../Appearance/NSEMaterialLighting";
