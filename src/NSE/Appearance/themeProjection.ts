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

import type { CSSProperties } from "react";
import { resolveNSEThemeRecipe } from "./themeRecipeResolver";
import type { NSEAppearanceDataAttributes, NSEVisualEnvironment } from "./nseAppearanceTypes";
export interface NSEThemeRecipeDescriptor { readonly component: string; readonly part: string; readonly state?: string; }
export interface NSEThemeRecipeProjection {
  readonly slot: string; readonly recipeId: string | null;
  readonly attributes: Readonly<{ "data-nse-theme-slot": string; "data-nse-theme-recipe-id": string | null; "data-nse-theme-state": string }>;
}
export function nseThemeSlot(component: string, part: string, state = "normal"): string { return `${component}.${part}.${state}`; }
export function projectNSEThemeTokens(environment: NSEVisualEnvironment): CSSProperties {
  const ownCSS = new Set(environment.theme.styleTokenNames);
  // @scope does not stop inheritance. Reset foreign-only keys, but never mask
  // current package CSS. Shared conditional keys require authored root defaults.
  const resets = Object.fromEntries((environment.inheritedThemeTokenNames ?? []).filter(name => !ownCSS.has(name)).map(name => [name, "initial"]));
  return Object.freeze({ ...resets, ...environment.theme.tokens.common, ...environment.theme.tokens[environment.resolvedAppearance] }) as CSSProperties;
}
export function projectNSETheme(environment: NSEVisualEnvironment): NSEAppearanceDataAttributes & { readonly style: CSSProperties } {
  return Object.freeze({
    "data-nse-theme": environment.theme.id, "data-nse-appearance": environment.resolvedAppearance,
    "data-nse-appearance-requested": environment.requestedAppearance, "data-nse-chrome": environment.chrome,
    "data-nse-contrast": environment.contrast, "data-nse-transparency": environment.transparency,
    "data-mode": environment.resolvedAppearance, style: projectNSEThemeTokens(environment),
  });
}
export function projectNSEThemeRecipe(slot: string, environment: NSEVisualEnvironment): NSEThemeRecipeProjection {
  const resolution = resolveNSEThemeRecipe(slot, environment.theme);
  return Object.freeze({ ...resolution, attributes: Object.freeze({ "data-nse-theme-slot": slot, "data-nse-theme-recipe-id": resolution.recipeId, "data-nse-theme-state": slot.split(".")[2] ?? "normal" }) });
}
export type { NSEThemeDefinition } from "./NSEThemeDefinition";
