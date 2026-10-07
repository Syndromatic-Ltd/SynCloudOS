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

import type { NSEAppearanceDefinition } from "./NSEAppearanceDefinition";

export type NSEChromeAppearance = "standard" | "metal" | "hud";
export type NSEColourScheme = "auto" | "light" | "dark";
export type NSEResolvedColourScheme = Exclude<NSEColourScheme, "auto">;
export type NSEContrast = "normal" | "high" | "forced";
export type NSETransparency = "normal" | "reduced";

export interface NSEAppearanceServicePort {
  readonly runtimeId: string;
  get(): NSEColourScheme;
  resolved(): NSEResolvedColourScheme;
  subscribe(listener: () => void): () => void;
}

export interface NSEAppearanceSelection {
  readonly appearance: NSEAppearanceDefinition;
  readonly chrome: NSEChromeAppearance;
  readonly requestedColourScheme: NSEColourScheme;
  readonly resolvedColourScheme: NSEResolvedColourScheme;
  readonly contrast: NSEContrast;
  readonly transparency: NSETransparency;
}

export type NSEResolvedAppearance = NSEAppearanceSelection;

export interface NSEAppearanceDataAttributes {
  readonly "data-nse-appearance": string;
  readonly "data-nse-chrome": NSEChromeAppearance;
  readonly "data-nse-colour-scheme-requested": NSEColourScheme;
  readonly "data-nse-colour-scheme-resolved": NSEResolvedColourScheme;
  readonly "data-nse-contrast": NSEContrast;
  readonly "data-nse-transparency": NSETransparency;
  readonly "data-mode": NSEResolvedColourScheme;
}
