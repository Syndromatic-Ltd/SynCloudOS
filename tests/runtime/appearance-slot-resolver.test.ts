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
import { defineNSEAppearance, resolveNSEAppearanceSlot } from "@syndromatic/syncloudos/nse/appearance";
import { atmoAppearance } from "@syndromatic/syncloudos/nse/themes/atmo";

const customAppearance = defineNSEAppearance({ id: "custom-test", displayName: "Custom test", recipes: [
  { slot: "toolbar.item.normal.1x", recipeId: "custom-test.toolbar.normal" },
  { slot: "toolbar.item.selected.1x", recipeId: "custom-test.toolbar.selected" },
] });

describe("selected appearance recipe resolution", () => {
  it("resolves exclusively from the supplied definition, even when two definitions share an ID", () => {
    const slot = "button.bezel.normal.1x";
    const first = defineNSEAppearance({ id: "custom", displayName: "First", recipes: [{ slot, recipeId: "first.button" }] });
    const second = defineNSEAppearance({ id: "custom", displayName: "Second", recipes: [{ slot, recipeId: "second.button" }] });
    expect(resolveNSEAppearanceSlot(slot, first)).toEqual({ slot, recipeId: "first.button" });
    expect(resolveNSEAppearanceSlot(slot, second)).toEqual({ slot, recipeId: "second.button" });
    expect(resolveNSEAppearanceSlot(slot, first)).toEqual({ slot, recipeId: "first.button" });
  });

  it("does not infer a built-in theme or register recipes from its name", () => {
    const empty = defineNSEAppearance({ id: "atmo", displayName: "Intentionally empty" });
    const slot = "toolbar.item.normal.1x";
    expect(resolveNSEAppearanceSlot(slot, atmoAppearance).recipeId).not.toBeNull();
    expect(resolveNSEAppearanceSlot(slot, empty)).toEqual({ slot, recipeId: null });
  });

  it.each([atmoAppearance, customAppearance])(
    "resolves every declared recipe in $id without exposing source authority", (appearance) => {
      expect(appearance.recipes.length).toBeGreaterThan(0);
      for (const recipe of appearance.recipes) {
        const result = resolveNSEAppearanceSlot(recipe.slot, appearance);
        expect(result).toEqual(recipe);
        expect(Object.isFrozen(result)).toBe(true);
      }
      expect(resolveNSEAppearanceSlot("undeclared.part.normal.1x", appearance)).toEqual({
        slot: "undeclared.part.normal.1x", recipeId: null,
      });
    },
  );

  it("keeps custom appearance independent and leaves its undeclared tab states unresolved", () => {
    const toolbar = "toolbar.item.normal.1x";
    expect(resolveNSEAppearanceSlot(toolbar, customAppearance).recipeId).toBe("custom-test.toolbar.normal");
    expect(resolveNSEAppearanceSlot(toolbar, atmoAppearance).recipeId).toBe("atmo.toolbar.item.menu-button.normal.1x");
    for (const state of ["normal", "selected", "pressed", "hover", "focused", "disabled"]) {
      for (const density of [1, 2]) {
        const slot = `tab-bar.tab.${state}.${density}x`;
        expect(resolveNSEAppearanceSlot(slot, atmoAppearance).recipeId).not.toBeNull();
        expect(resolveNSEAppearanceSlot(slot, customAppearance)).toEqual({ slot, recipeId: null });
      }
    }
  });

  it("requires an exact state and density and never falls back between themes", () => {
    const custom = defineNSEAppearance({ id: "exact", displayName: "Exact", recipes: [
      { slot: "button.bezel.normal.1x", recipeId: "exact.button" },
    ] });
    for (const slot of ["button.bezel.normal.2x", "button.bezel.disabled.1x", "button.bezel.normal.1x "]) {
      expect(resolveNSEAppearanceSlot(slot, custom)).toEqual({ slot, recipeId: null });
    }
  });
});
