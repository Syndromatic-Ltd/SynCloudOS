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
  NSEAppearanceProvider,
  useNSEAppearance,
  useNSEAppearanceProjection,
  type NSEAppearanceProviderProps,
} from "./NSEAppearanceProvider";
export { projectNSEAppearance } from "./appearanceProjection";
export type {
  NSEAppearanceDataAttributes,
  NSEAppearanceSelection,
  NSEAppearanceServicePort,
  NSEChromeAppearance,
  NSEColourScheme,
  NSEContrast,
  NSEResolvedAppearance,
  NSEResolvedColourScheme,
  NSETransparency,
} from "./nseAppearanceTypes";
export {
  NSEChromePrimitive,
  NSEChromeSurface,
  NSEChromeBevel,
  NSEChromeCap,
  NSEChromeSplice,
  NSEChromeSeparator,
  NSEChromeGloss,
  NSEChromeInnerShadow,
  type NSEChromePrimitiveKind,
  type NSEChromePrimitiveProps,
  type NSEChromeVisualState,
} from "./NSEChromePrimitives";

export type { NSETheme, NSEThemeNavigation, NSEThemePresentation, NSEThemeImage } from "../Theme/NSETheme";
