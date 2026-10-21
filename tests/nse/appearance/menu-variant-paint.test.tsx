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
import { NSEThemeProvider, NSEMenu } from "@syndromatic/syncloudos/nse";
import { NSEStandaloneControlHost } from "@syndromatic/syncloudos/nse/controls";
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
  render(<NSEThemeProvider theme={atmoTheme} contrast={contrast}>
    <NSEStandaloneControlHost document={document} window={window} presentation={presentation}>
      <NSEMenu label="Actions" defaultOpen items={[{ value: "save", label: "Save" }]} />
    </NSEStandaloneControlHost>
  </NSEThemeProvider>);
  return screen.findByRole("menu");
}

describe("popup variants retain their selected appearance", () => {
  it("keeps the selected theme ID and popup variant on the actual menu", async () => {
    const menu = await mountPopup();
    expect(menu.getAttribute("data-nse-theme")).toBe("com.syndromatic.atmo");
    expect(menu.getAttribute("data-nse-menu-variant")).toBe("popup");
  });

  it("matches neutral forced-colour replacement rules on the projected popup root", async () => {
    const menu = await mountPopup("forced");
    expect(menu.getAttribute("data-nse-contrast")).toBe("forced");
    const selectors = selectorsFor("src/NSE/Appearance/nse-appearance.css", "background-color", "Canvas");
    expect(selectors.some((selector) => menu.matches(selector))).toBe(true);
  });
});
