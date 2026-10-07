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

export interface NSEAppearanceRecipeDefinition {
  readonly slot: string;
  readonly recipeId: string;
}

export interface NSEAppearanceDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly recipes: readonly NSEAppearanceRecipeDefinition[];
}

export interface NSEAppearanceDefinitionInput {
  readonly id: string;
  readonly displayName: string;
  readonly recipes?: readonly NSEAppearanceRecipeDefinition[];
}

const NSE_APPEARANCE_ID = /^[a-z0-9][a-z0-9-]*$/;

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    throw new TypeError(`${label} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain data object.`);
  }
  return value as Record<string, unknown>;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string.`);
  const text = value.trim();
  if (!text) throw new TypeError(`${label} must not be blank.`);
  return text;
}

/**
 * Defines an appearance from local semantic recipes.
 *
 * The returned value is deliberately data-only: callers cannot mutate the
 * source object after registration, and unrecognised input properties never
 * become part of the runtime definition.
 */
export function defineNSEAppearance(definition: NSEAppearanceDefinitionInput): NSEAppearanceDefinition {
  const input = requireRecord(definition, "Appearance definition");
  const id = requireText(input.id, "Appearance id");
  if (input.id !== id || !NSE_APPEARANCE_ID.test(id)) {
    throw new TypeError(`Appearance id "${id}" must match ${NSE_APPEARANCE_ID}.`);
  }
  const displayName = requireText(input.displayName, "Appearance displayName");
  const rawRecipes = input.recipes === undefined ? [] : input.recipes;
  if (!Array.isArray(rawRecipes)) throw new TypeError("Appearance recipes must be an array.");

  const slots = new Set<string>();
  const recipeIds = new Set<string>();
  // Array.from visits holes too, so a sparse array cannot bypass validation.
  const recipes = Array.from(rawRecipes, (rawRecipe, index) => {
    const recipe = requireRecord(rawRecipe, `Appearance recipe ${index}`);
    const slot = requireText(recipe.slot, `Appearance recipe ${index} slot`);
    const recipeId = requireText(recipe.recipeId, `Appearance recipe ${index} recipeId`);
    if (slots.has(slot)) throw new TypeError(`Appearance recipe slot "${slot}" is duplicated.`);
    if (recipeIds.has(recipeId)) throw new TypeError(`Appearance recipe id "${recipeId}" is duplicated.`);
    slots.add(slot);
    recipeIds.add(recipeId);
    return Object.freeze({ slot, recipeId });
  });

  return Object.freeze({
    id,
    displayName,
    recipes: Object.freeze(recipes),
  });
}
