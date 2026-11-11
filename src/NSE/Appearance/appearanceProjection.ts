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

import { nseThemeColourStyle } from "../Theme/themeColourStyle";
import type { NSEAppearanceDataAttributes, NSEResolvedAppearance } from "./nseAppearanceTypes";

/** Projects the appearance environment onto views and relocated portal boundaries. */
export function projectNSEAppearance(appearance: NSEResolvedAppearance): NSEAppearanceDataAttributes {
  return Object.freeze({
    "data-nse-theme": appearance.theme.bundleIdentifier,
    style: nseThemeColourStyle(appearance.theme, appearance.resolvedColourScheme, appearance.contrast),
    "data-nse-chrome": appearance.chrome,
    "data-nse-colour-scheme-requested": appearance.requestedColourScheme,
    "data-nse-colour-scheme-resolved": appearance.resolvedColourScheme,
    "data-nse-contrast": appearance.contrast,
    "data-nse-transparency": appearance.transparency,
    "data-mode": appearance.resolvedColourScheme,
  });
}
