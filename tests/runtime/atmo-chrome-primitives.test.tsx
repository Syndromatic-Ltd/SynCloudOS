import { createTestTheme } from "../fixtures/themes";
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

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NSEAppearanceProvider, NSEChromeBevel, NSEChromeCap, NSEChromeGloss, NSEChromeInnerShadow, NSEChromeSeparator, NSEChromeSplice, NSEChromeSurface, type NSETheme } from "../../src/NSE/Appearance";
import { atmoTheme } from "@syndromatic/syncloudos/nse/themes/atmo";

const customAppearance = createTestTheme("com.example.custom-test", "Custom test");

afterEach(cleanup);
function Layers() {
  return <>
    <NSEChromeSurface data-testid="surface" state="selected" />
    <NSEChromeBevel data-testid="bevel" state="focused" />
    <NSEChromeCap data-testid="cap" state="normal" />
    <NSEChromeSplice data-testid="splice" state="normal" />
    <NSEChromeSeparator data-testid="separator" state="disabled" />
    <NSEChromeGloss data-testid="gloss" state="pressed" />
    <NSEChromeInnerShadow data-testid="inner-shadow" state="selected" />
  </>;
}

describe("appearance-neutral chrome primitives", () => {
  it("projects inert semantic paint layers and keeps interaction state with the owner", () => {
    render(<NSEAppearanceProvider theme={atmoTheme}><Layers /></NSEAppearanceProvider>);
    for (const id of ["surface", "bevel", "cap", "splice", "separator", "gloss", "inner-shadow"]) {
      const layer = screen.getByTestId(id);
      expect(layer.tagName).toBe("SPAN");
      expect(layer.getAttribute("aria-hidden")).toBe("true");

      expect(layer.getAttribute("data-nse-chrome-primitive")).toBe(id);
      expect(layer.hasAttribute("data-nse-part")).toBe(true);
      expect(layer.getAttribute("data-nse-chrome-active")).toBe("true");
      expect(layer.getAttribute("tabindex")).toBeNull();
      expect(layer.getAttribute("data-nse-theme-authority")).toBeNull();
      expect(layer.getAttributeNames().some((name) => /source|lineage|provenance/.test(name))).toBe(false);
    }
    expect(screen.getByTestId("surface").getAttribute("data-nse-chrome-state")).toBe("selected");
    expect(screen.getByTestId("gloss").getAttribute("data-nse-chrome-state")).toBe("pressed");
  });

  it("retains inert paint layers when a different theme uses Atmo fallback", () => {
    const fixture = (theme: NSETheme) => <NSEAppearanceProvider theme={theme}><Layers /></NSEAppearanceProvider>;
    const view = render(fixture(atmoTheme));
    const layer = screen.getByTestId("surface");
    view.rerender(fixture(customAppearance));
    expect(screen.getByTestId("surface")).toBe(layer);
    expect(layer.closest("[data-nse-theme]")?.getAttribute("data-nse-theme")).toBe("com.example.custom-test");
    expect(layer.getAttribute("data-nse-chrome-active")).toBe("true");
    expect(layer.getAttribute("data-nse-part")).toBe("background");
  });
});
