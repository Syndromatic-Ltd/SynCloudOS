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

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { defineNSEAppearance, type NSEAppearanceDefinitionInput } from "@syndromatic/syncloudos/nse";

const base = { id: "custom-theme", displayName: "Custom theme" };
const recipe = { slot: "button.bezel.normal.1x", recipeId: "custom.button" };
const defineUnchecked = (input: unknown) => defineNSEAppearance(input as NSEAppearanceDefinitionInput);

describe("appearance definitions at the public package boundary", () => {
  it("clones data deeply, ignores extra fields without invoking them and resists subsequent mutation", () => {
    const input = { ...base, recipes: [{ ...recipe }] };
    Object.defineProperty(input, "loader", { get() { throw new Error("must not execute"); } });
    const result = defineNSEAppearance(input);
    input.id = "changed";
    input.displayName = "Changed";
    input.recipes[0].slot = "changed";
    input.recipes.push({ slot: "extra", recipeId: "extra" });
    expect(result).toEqual({ ...base, recipes: [recipe] });
    expect(result).not.toBe(input);
    expect(result.recipes).not.toBe(input.recipes);
    expect(result.recipes[0]).not.toBe(input.recipes[0]);
    for (const value of [result, result.recipes, result.recipes[0]]) expect(Object.isFrozen(value)).toBe(true);
    expect(Reflect.set(result, "id", "changed-again")).toBe(false);
    expect(Reflect.set(result.recipes[0], "recipeId", "changed-again")).toBe(false);
    expect(() => (result.recipes as unknown[]).push(recipe)).toThrow(TypeError);
  });

  it("accepts omitted recipes and plain records with no prototype", () => {
    const result = defineUnchecked(Object.assign(Object.create(null), base));
    expect(result).toEqual({ ...base, recipes: [] });
    expect(Object.isFrozen(result.recipes)).toBe(true);
    expect(defineNSEAppearance({ ...base, displayName: "  Custom theme\n" }).displayName).toBe("Custom theme");
  });

  it.each([" leading", "trailing ", "theme\n", "Theme", "-theme", "theme_name", "theme/name", "", "two themes"])(
    "rejects an identity outside the literal ID grammar: %j", (id) => {
      expect(() => defineNSEAppearance({ ...base, id })).toThrow(TypeError);
    },
  );

  it.each([
    ["null definition", null],
    ["array definition", Object.assign([], base)],
    ["date definition", Object.assign(new Date(0), base)],
    ["DOM definition", Object.assign(document.createElement("div"), base)],
    ["numeric identity", { ...base, id: 42 }],
    ["blank display name", { ...base, displayName: " \t\n" }],
    ["non-string display name", { ...base, displayName: {} }],
    ["null recipes", { ...base, recipes: null }],
    ["object recipes", { ...base, recipes: {} }],
    ["sparse recipes", { ...base, recipes: new Array(1) }],
    ["null recipe", { ...base, recipes: [null] }],
    ["array recipe", { ...base, recipes: [Object.assign([], recipe)] }],
    ["date recipe", { ...base, recipes: [Object.assign(new Date(0), recipe)] }],
    ["blank slot", { ...base, recipes: [{ ...recipe, slot: "  " }] }],
    ["numeric recipe ID", { ...base, recipes: [{ ...recipe, recipeId: 7 }] }],
    ["duplicate normalised slot", { ...base, recipes: [recipe, { slot: ` ${recipe.slot} `, recipeId: "other" }] }],
    ["duplicate normalised recipe ID", { ...base, recipes: [recipe, { slot: "other", recipeId: ` ${recipe.recipeId} ` }] }],
  ])("rejects invalid data: %s", (_label, value) => {
    expect(() => defineUnchecked(value)).toThrow(TypeError);
  });
});
