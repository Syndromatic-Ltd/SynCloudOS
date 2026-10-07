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
import { resolveNSEAppearanceSlot } from "./appearanceSlotResolver";
import type { NSEAppearanceDataAttributes, NSEResolvedAppearance } from "./nseAppearanceTypes";

export interface NSEAppearanceSlotDescriptor {
  readonly component: string;
  readonly part: string;
  readonly state?: string;
  readonly density?: 1 | 2;
}

export interface NSEAppearanceSlotProjection {
  readonly slot: string;
  readonly recipeId: string | null;
  readonly attributes: Readonly<{
    "data-nse-appearance-slot": string;
    "data-nse-appearance-recipe-id": string | null;
    "data-nse-appearance-state": string;
  }>;
}

export function nseAppearanceSlot(
  component: string,
  part: string,
  state = "normal",
  density: 1 | 2 = 1,
): string {
  return `${component}.${part}.${state}.${density}x`;
}

/** Projects one complete environment boundary for controls and portals. */
export function projectNSEAppearance(appearance: NSEResolvedAppearance): NSEAppearanceDataAttributes {
  return Object.freeze({
    "data-nse-appearance": appearance.appearance.id,
    "data-nse-chrome": appearance.chrome,
    "data-nse-colour-scheme-requested": appearance.requestedColourScheme,
    "data-nse-colour-scheme-resolved": appearance.resolvedColourScheme,
    "data-nse-contrast": appearance.contrast,
    "data-nse-transparency": appearance.transparency,
    "data-mode": appearance.resolvedColourScheme,
  });
}

/** Resolves one semantic control part solely from the selected definition. */
export function projectNSEAppearanceSlot(
  slot: string,
  appearance: NSEResolvedAppearance,
): NSEAppearanceSlotProjection {
  const resolution = resolveNSEAppearanceSlot(slot, appearance.appearance);
  return Object.freeze({
    slot,
    recipeId: resolution.recipeId,
    attributes: Object.freeze({
      "data-nse-appearance-slot": slot,
      "data-nse-appearance-recipe-id": resolution.recipeId,
      "data-nse-appearance-state": slot.split(".")[2] ?? "normal",
    }),
  });
}

export type { NSEAppearanceDefinition };
