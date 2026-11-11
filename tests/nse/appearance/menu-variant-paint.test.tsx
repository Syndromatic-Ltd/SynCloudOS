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
import { readFileSync } from "node:fs";
import * as cssTree from "css-tree";
import { afterEach, describe, expect, it } from "vitest";
import { NSEAppearanceProvider } from "../../../src/NSE/Appearance";
import { NSEListboxPopup } from "../../../src/NSE/Overlays/NSEListboxPopup";
import { NSEMenuView } from "../../../src/NSE/Menus/NSEMenuView";
import { NSEStandaloneControlHost } from "../../../src/NSE/Overlays";
import { atmoTheme } from "@syndromatic/syncloudos/nse/themes/atmo";
import { createStaticPresentationPort } from "../../fixtures/presentationTraits";

afterEach(cleanup);
const presentation = createStaticPresentationPort({ width: 1024, height: 768 });

function selectorsFor(file: string, property: string, value: string): string[] {
  const selectors: string[] = [];
  cssTree.walk(cssTree.parse(readFileSync(file, "utf8")), (node) => {
    if (node.type !== "Rule" || node.prelude?.type !== "SelectorList") return;
    if (!node.block.children.some((declaration) => declaration.type === "Declaration"
      && declaration.property === property && cssTree.generate(declaration.value) === value)) return;
    node.prelude.children.forEach((selector) => {
      const text = cssTree.generate(selector);
      if (text.includes(".nse-menu")) selectors.push(text);
    });
  });
  return selectors;
}

async function mountPopup(contrast: "normal" | "forced" = "normal") {
  render(<NSEAppearanceProvider theme={atmoTheme} contrast={contrast}>
    <NSEStandaloneControlHost document={document} window={window} presentation={presentation}>
      <NSEMenuView label="Actions" defaultOpen items={[{ value: "save", label: "Save" }]} />
    </NSEStandaloneControlHost>
  </NSEAppearanceProvider>);
  return screen.findByRole("menu");
}

describe("popup variants retain their selected appearance", () => {
  it("keeps the selected theme ID and popup variant on the actual menu", async () => {
    const menu = await mountPopup();
    // The popup shares its host's theme boundary rather than starting its own.
    expect(menu.hasAttribute("data-nse-theme")).toBe(false);
    expect(menu.parentElement?.closest("[data-nse-theme]")?.getAttribute("data-nse-theme")).toBe("com.syndromatic.atmo");
    expect(menu.getAttribute("data-nse-menu-variant")).toBe("popup");
  });

  it("matches neutral forced-colour replacement rules on the projected popup root", async () => {
    const menu = await mountPopup("forced");
    expect(menu.getAttribute("data-nse-contrast")).toBe("forced");
    const selectors = selectorsFor("src/NSE/Appearance/nse-appearance.css", "background-color", "Canvas");
    expect(selectors.some((selector) => menu.matches(selector))).toBe(true);
  });
});

describe("adaptive menu family paint", () => {
  it.each([390, 1024])("retains the desktop command-menu material at %ipx without changing modality", async (width) => {
    render(<NSEAppearanceProvider theme={atmoTheme}>
      <NSEStandaloneControlHost document={document} window={window} presentation={createStaticPresentationPort({ width, height: 768 })}>
        <NSEMenuView label="File" defaultOpen items={[{ value: "save", label: "Save" }]} />
      </NSEStandaloneControlHost>
    </NSEAppearanceProvider>);
    const menu = await screen.findByRole("menu");
    const surface = menu.closest(".nse-overlay-popup")!;
    expect(surface.classList.contains("nse-overlay-popup--menu")).toBe(true);
    expect(surface.classList.contains("nse-overlay-popup--action-sheet")).toBe(false);
    expect(surface.getAttribute("data-nse-overlay-kind")).toBe(width === 390 ? "action-sheet" : "menu");
    expect(surface.getAttribute("aria-modal")).toBe(width === 390 ? "true" : null);
  });
  it.each([390, 1024])("retains the desktop picker surface and selected-row recipe at %ipx", async (width) => {
    render(<NSEAppearanceProvider theme={atmoTheme}>
      <NSEStandaloneControlHost document={document} window={window} presentation={createStaticPresentationPort({ width, height: 768 })}>
        <NSEListboxPopup defaultOpen options={[{ id: "body", label: "Body", value: "body" }]} selectedId="body" />
      </NSEStandaloneControlHost>
    </NSEAppearanceProvider>);
    const list = await screen.findByRole("listbox");
    const surface = list.closest(".nse-overlay-popup")!;
    expect(surface.classList.contains("nse-overlay-popup--listbox")).toBe(true);
    expect(surface.classList.contains("nse-overlay-popup--action-sheet")).toBe(false);
    expect(surface.getAttribute("data-nse-overlay-kind")).toBe(width === 390 ? "action-sheet" : "listbox");
    expect(surface.getAttribute("aria-modal")).toBe(width === 390 ? "true" : null);
    expect(screen.getByRole("option", { name: "Body" }).getAttribute("aria-selected")).toBe("true");
  });
});
