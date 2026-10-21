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
import { defineNSETheme } from "@syndromatic/syncloudos/nse/theme";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  NSEThemeProvider, NSEChromeBevel, NSEChromeCap, NSEChromeGloss,
  NSEChromeInnerShadow, NSEChromeSeparator, NSEChromeSplice, NSEChromeSurface,
  useNSEThemeRecipe, type NSEThemeDefinition,
} from "../../src/NSE/Appearance";
import { atmoTheme } from "@syndromatic/syncloudos/nse/themes/atmo";

const customAppearance = defineNSETheme({ id: "com.test.custom-test", displayName: "Custom test", recipes: [
  { slot: "toolbar.item.normal", recipeId: "custom-test.toolbar.normal" },
  { slot: "toolbar.item.selected", recipeId: "custom-test.toolbar.selected" },
] });

afterEach(cleanup);
function Layers({ slotName = "toolbar.item.selected" }: { slotName?: string }) {
  const slot = useNSEThemeRecipe(slotName);
  return <>
    <NSEChromeSurface data-testid="surface" slot={slot} state="selected" />
    <NSEChromeBevel data-testid="bevel" slot={slot} state="focused" />
    <NSEChromeCap data-testid="cap" slot={slot} state="normal" />
    <NSEChromeSplice data-testid="splice" slot={slot} state="normal" />
    <NSEChromeSeparator data-testid="separator" slot={slot} state="disabled" />
    <NSEChromeGloss data-testid="gloss" slot={slot} state="pressed" />
    <NSEChromeInnerShadow data-testid="inner-shadow" slot={slot} state="selected" />
  </>;
}

describe("appearance-neutral chrome primitives", () => {
  it("projects inert semantic paint layers and keeps interaction state with the owner", () => {
    render(<NSEThemeProvider theme={atmoTheme}><Layers /></NSEThemeProvider>);
    for (const id of ["surface", "bevel", "cap", "splice", "separator", "gloss", "inner-shadow"]) {
      const layer = screen.getByTestId(id);
      expect(layer.tagName).toBe("SPAN");
      expect(layer.getAttribute("aria-hidden")).toBe("true");
      expect(layer.getAttribute("data-nse-theme-slot")).toBe("toolbar.item.selected");
      expect(layer.getAttribute("data-nse-chrome-primitive")).toBe(id);
      expect(layer.getAttribute("data-nse-chrome-active")).toBe("true");
      expect(layer.getAttribute("tabindex")).toBeNull();
      expect(layer.getAttribute("data-nse-appearance-authority")).toBeNull();
      expect(layer.getAttributeNames().some((name) => /source|lineage|provenance/.test(name))).toBe(false);
    }
    expect(screen.getByTestId("surface").getAttribute("data-nse-chrome-state")).toBe("selected");
    expect(screen.getByTestId("gloss").getAttribute("data-nse-chrome-state")).toBe("pressed");
  });

  it("updates the selected recipe in place and disables paint for an unresolved slot", () => {
    const fixture = (appearance: NSEThemeDefinition, slotName?: string) =>
      <NSEThemeProvider theme={appearance}><Layers slotName={slotName} /></NSEThemeProvider>;
    const view = render(fixture(atmoTheme));
    const layer = screen.getByTestId("surface");
    view.rerender(fixture(customAppearance));
    expect(screen.getByTestId("surface")).toBe(layer);
    expect(layer.getAttribute("data-nse-theme")).toBe("com.test.custom-test");
    expect(layer.getAttribute("data-nse-theme-recipe-id")).toBe("custom-test.toolbar.selected");
    view.rerender(fixture(customAppearance, "tab-bar.tab.selected"));
    expect(layer.getAttribute("data-nse-chrome-active")).toBe("false");
    expect(layer.getAttribute("data-nse-theme-recipe-id")).toBeNull();
  });
});
