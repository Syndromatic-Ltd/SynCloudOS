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
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WindowTitlebarView } from "../../src/NSE/Windows/WindowTitlebarView";
import { ApplicationMenuToolbarButton, WindowApplicationMenuContext } from "../../src/NSE/Toolbars/ApplicationMenuToolbarButton";
import { nseTopBarGlyphs } from "../../src/NSE/Windows/Chrome/topBarAssets";

afterEach(cleanup);

describe("Window titlebar document and controls", () => {
  it("places the document title between the leading controls and trailing menu", () => {
    const toggle = vi.fn();
    const open = vi.fn();
    const { container } = render(<WindowApplicationMenuContext.Provider value={{ open: false, activate: open }}>
      <WindowTitlebarView material="metal" mode="dark" isKeyWindow
        document={{ title: "My post", subtitle: "Publisher", documentEdited: false, toolbarStyle: "unified" }}
        controls={<button type="button">Return to Webspring</button>}
        titleAction={<button type="button" aria-label="Switch apps" onClick={toggle}>My post</button>}
        toolbar={<ApplicationMenuToolbarButton glyph="gear" />} />
    </WindowApplicationMenuContext.Provider>);
    const row = container.querySelector("[data-window-titlebar-row]");
    const title = screen.getByRole("heading", { name: "My post Publisher" });
    const menu = screen.getByRole("button", { name: "Application Menu" });
    expect(row?.contains(title)).toBe(true);
    expect(screen.getByRole("button", { name: "Return to Webspring" }).compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(title.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Switch apps" }));
    expect(toggle).toHaveBeenCalledOnce();
    fireEvent.click(menu);
    expect(open).toHaveBeenCalledWith(menu);
  });

  it("renders a plain window title without adding a menu trigger", () => {
    render(<WindowTitlebarView material="metal" isKeyWindow document={{ title: "Software", subtitle: "", documentEdited: false }} />);
    expect(screen.getByRole("heading", { name: "Software" })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it.each([["gear", nseTopBarGlyphs.settings], ["person", nseTopBarGlyphs.userInfo]] as const)("draws the chosen %s glyph on Cumulus", (choice, mask) => {
    const { container } = render(<WindowTitlebarView material="cumulus" isKeyWindow
      document={{ title: "App", subtitle: "", documentEdited: false }} toolbar={<ApplicationMenuToolbarButton glyph={choice} />} />);
    const glyph = container.querySelector<HTMLElement>(".nse-app-topbar-button-icon")!;
    expect(glyph.style.getPropertyValue("--nse-topbar-glyph")).toBe(`url(${JSON.stringify(mask)})`);
  });
});
