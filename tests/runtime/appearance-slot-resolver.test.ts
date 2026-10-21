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

import { describe, expect, it } from "vitest";
import { defineNSETheme, resolveNSEThemeRecipe } from "@syndromatic/syncloudos/nse/theme";
import { atmoTheme } from "@syndromatic/syncloudos/nse/themes/atmo";

const customAppearance = defineNSETheme({ id: "com.test.custom-test", displayName: "Custom test", recipes: [
  { slot: "toolbar.item.normal", recipeId: "custom-test.toolbar.normal" },
  { slot: "toolbar.item.selected", recipeId: "custom-test.toolbar.selected" },
] });

describe("selected appearance recipe resolution", () => {
  it("resolves exclusively from the supplied definition, even when two definitions share an ID", () => {
    const slot = "button.bezel.normal";
    const first = defineNSETheme({ id: "com.test.custom", displayName: "First", recipes: [{ slot, recipeId: "first.button" }] });
    const second = defineNSETheme({ id: "com.test.custom", displayName: "Second", recipes: [{ slot, recipeId: "second.button" }] });
    expect(resolveNSEThemeRecipe(slot, first)).toEqual({ slot, recipeId: "first.button" });
    expect(resolveNSEThemeRecipe(slot, second)).toEqual({ slot, recipeId: "second.button" });
    expect(resolveNSEThemeRecipe(slot, first)).toEqual({ slot, recipeId: "first.button" });
  });

  it("does not infer a built-in theme or register recipes from its name", () => {
    const empty = defineNSETheme({ id: "com.test.atmo", displayName: "Intentionally empty" });
    const slot = "toolbar.item.normal";
    expect(resolveNSEThemeRecipe(slot, atmoTheme).recipeId).not.toBeNull();
    expect(resolveNSEThemeRecipe(slot, empty)).toEqual({ slot, recipeId: null });
  });

  it.each([atmoTheme, customAppearance])(
    "resolves every declared recipe in $id without exposing source authority", (appearance) => {
      expect(appearance.recipes.length).toBeGreaterThan(0);
      for (const recipe of appearance.recipes) {
        const result = resolveNSEThemeRecipe(recipe.slot, appearance);
        expect(result).toEqual(recipe);
        expect(Object.isFrozen(result)).toBe(true);
      }
      expect(resolveNSEThemeRecipe("undeclared.part.normal", appearance)).toEqual({
        slot: "undeclared.part.normal", recipeId: null,
      });
    },
  );

  it("keeps custom appearance independent and leaves its undeclared tab states unresolved", () => {
    const toolbar = "toolbar.item.normal";
    expect(resolveNSEThemeRecipe(toolbar, customAppearance).recipeId).toBe("custom-test.toolbar.normal");
    expect(resolveNSEThemeRecipe(toolbar, atmoTheme).recipeId).toBe("atmo.toolbar.item.menu-button.normal.1x");
    for (const state of ["normal", "selected", "pressed", "hover", "focused", "disabled"]) {
      {
        const slot = `tab-bar.tab.${state}`;
        expect(resolveNSEThemeRecipe(slot, atmoTheme).recipeId).not.toBeNull();
        expect(resolveNSEThemeRecipe(slot, customAppearance)).toEqual({ slot, recipeId: null });
      }
    }
  });

  it("requires an exact semantic state and never falls back between themes", () => {
    const custom = defineNSETheme({ id: "com.test.exact", displayName: "Exact", recipes: [
      { slot: "button.bezel.normal", recipeId: "exact.button" },
    ] });
    for (const slot of ["button.bezel.normal.2x", "button.bezel.disabled", "button.bezel.normal "]) {
      expect(resolveNSEThemeRecipe(slot, custom)).toEqual({ slot, recipeId: null });
    }
  });
});
