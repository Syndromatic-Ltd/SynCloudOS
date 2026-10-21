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

import type { NSEThemeDefinition } from "./NSEThemeDefinition";
export type NSEChromeAppearance = "standard" | "metal" | "hud";
export type NSEAppearance = "auto" | "light" | "dark";
export type NSEResolvedAppearance = Exclude<NSEAppearance, "auto">;
export interface NSEAppearanceState { readonly requested: NSEAppearance; readonly resolved: NSEResolvedAppearance; }
export type NSEContrast = "normal" | "high" | "forced";
export type NSETransparency = "normal" | "reduced";
export interface NSEAppearanceServicePort {
  readonly runtimeId: string; get(): NSEAppearance; resolved(): NSEResolvedAppearance; subscribe(listener: () => void): () => void;
}
export interface NSEAppearanceSelection {
  readonly theme: NSEThemeDefinition;
  readonly requestedAppearance: NSEAppearance; readonly resolvedAppearance: NSEResolvedAppearance;
  readonly chrome: NSEChromeAppearance; readonly contrast: NSEContrast; readonly transparency: NSETransparency;
  /** Ancestor token inventory used only to isolate nested boundaries and portals. */
  readonly inheritedThemeTokenNames?: readonly string[];
}
export type NSEVisualEnvironment = NSEAppearanceSelection;
export interface NSEAppearanceDataAttributes {
  readonly "data-nse-theme": string;
  readonly "data-nse-appearance": NSEResolvedAppearance;
  readonly "data-nse-appearance-requested": NSEAppearance;
  readonly "data-nse-chrome": NSEChromeAppearance;
  readonly "data-nse-contrast": NSEContrast;
  readonly "data-nse-transparency": NSETransparency;
  readonly "data-mode": NSEResolvedAppearance;
}
