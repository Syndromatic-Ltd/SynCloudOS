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

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WindowPresentation, WindowRecord, WindowRole } from "../../src/SynCloudOS/Windows";
import {
  NSEHUDWindowView,
  NSEModalWindowView,
  NSEPanelView,
  NSEPopoverWindowView,
  NSESheetView,
} from "../../src/NSE/Windows";
import { standardWindow } from "../fixtures/windowTestDependencies";

const windowCSS = readFileSync("src/NSE/Windows/nse-windows.css", "utf8");

afterEach(cleanup);

function accessibleProps(role: WindowRole, overrides: Partial<WindowRecord> = {}) {
  const request = standardWindow(`${role}-accessible`, {
    role,
    title: `${role} accessible`,
    level: role === "panel" || role === "hud" || role === "popover" ? "floating" : "modal",
    parentWindowControllerId: role === "sheet" || role === "popover" ? "parent-window" : null,
    anchor: role === "popover" ? {
      id: "anchor",
      rect: { x: 0, y: 0, width: 44, height: 44 },
      edge: "inline-end",
      alignment: "start",
      offset: 4,
    } : null,
    style: ["titled", "closable", "minimisable", "zoomable"],
  });
  const record = {
    ...request,
    id: `${role}-accessible`,
    runtimeId: "runtime:nse-accessibility-test" as WindowRecord["runtimeId"],
    state: "open",
    isKey: true,
    isMain: false,
    zIndex: 2,
    ...overrides,
  } as WindowRecord;
  const presentation: WindowPresentation = {
    kind: "desktop-window",
    visible: true,
    bounds: record.bounds,
    safeAreaInsets: { blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 },
    movable: true,
    resizable: false,
    titleBarVisible: true,
  };
  return {
    record,
    presentation,
    blocked: false,
    dirty: false,
    dispatchCommand: vi.fn().mockResolvedValue({ handled: true }),
  };
}

describe("NSE window accessibility", () => {
  it.each([
    ["panel", NSEPanelView],
    ["hud", NSEHUDWindowView],
    ["sheet", NSESheetView],
    ["popover", NSEPopoverWindowView],
  ] as const)("routes Escape through the command system for a closable unpinned %s", (role, View) => {
    const props = accessibleProps(role);
    render(<View {...props}><button type="button">Inside</button></View>);
    fireEvent.keyDown(screen.getByRole("dialog", { name: `${role} accessible` }), { key: "Escape" });
    expect(props.dispatchCommand).toHaveBeenCalledWith("window.close", { windowControllerId: `${role}-accessible` });
  });

  it("does not locally dismiss modals, non-closable panels or pinned popovers", () => {
    const modal = accessibleProps("modal");
    const { rerender } = render(<NSEModalWindowView {...modal}><p>Modal</p></NSEModalWindowView>);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "modal accessible" }), { key: "Escape" });
    expect(modal.dispatchCommand).not.toHaveBeenCalled();

    const panel = accessibleProps("panel", { style: ["titled"] });
    rerender(<NSEPanelView {...panel}><p>Panel</p></NSEPanelView>);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "panel accessible" }), { key: "Escape" });
    expect(panel.dispatchCommand).not.toHaveBeenCalled();

    const popover = accessibleProps("popover", { pinned: true });
    rerender(<NSEPopoverWindowView {...popover}><p>Popover</p></NSEPopoverWindowView>);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "popover accessible" }), { key: "Escape" });
    expect(popover.dispatchCommand).not.toHaveBeenCalled();
  });

  it("keeps blocked windows native-inert while retaining modal labelling", () => {
    const props = accessibleProps("sheet");
    render(<NSESheetView {...props} blocked><p>Sheet</p></NSESheetView>);
    const sheet = screen.getByRole("dialog", { name: "sheet accessible", hidden: true });
    expect(sheet.hasAttribute("inert")).toBe(true);
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    expect(sheet.getAttribute("aria-labelledby")).toBe("sheet-accessible-title");
  });

  it("omits hidden and minimised roles from the accessibility tree", () => {
    const hidden = accessibleProps("panel");
    const { rerender } = render(
      <NSEPanelView {...hidden} presentation={{ ...hidden.presentation, kind: "hidden", visible: false }}>
        <p>Hidden panel</p>
      </NSEPanelView>,
    );
    expect(screen.queryByText("Hidden panel")).toBeNull();

    const minimised = accessibleProps("hud", { state: "minimised" });
    rerender(<NSEHUDWindowView {...minimised}><p>Minimised HUD</p></NSEHUDWindowView>);
    expect(screen.queryByText("Minimised HUD")).toBeNull();
  });

  it("retains forced-colours borders, two-pixel focus and reduced-motion fallbacks", () => {
    expect(windowCSS).toContain("@media (forced-colors: active)");
    expect(windowCSS).toMatch(/border(?:-width)?:\s*1px/);
    expect(windowCSS).toMatch(/outline:\s*2px/);
    expect(windowCSS).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
