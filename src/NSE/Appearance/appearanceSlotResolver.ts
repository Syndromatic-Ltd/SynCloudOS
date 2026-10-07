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

export interface NSEAppearanceSlotResolution {
  readonly slot: string;
  readonly recipeId: string | null;
}

/**
 * Resolves a semantic slot from the selected appearance only. A missing recipe
 * remains unresolved; no other theme or source catalogue is consulted.
 */
export function resolveNSEAppearanceSlot(
  slot: string,
  appearance: NSEAppearanceDefinition,
): NSEAppearanceSlotResolution {
  const recipe = appearance.recipes.find((candidate) => candidate.slot === slot);
  return Object.freeze({
    slot,
    recipeId: recipe?.recipeId ?? null,
  });
}
