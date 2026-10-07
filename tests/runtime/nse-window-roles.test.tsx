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

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WindowPresentation, WindowRecord, WindowRole } from "../../src/SynCloudOS/Windows";
import {
  NSEBorderlessWindowView,
  NSEHUDWindowView,
  NSEModalWindowView,
  NSEPanelView,
  NSEPopoverWindowView,
  NSESheetView,
  NSEStandardWindowView,
} from "../../src/NSE/Windows";
import { standardWindow } from "../fixtures/windowTestDependencies";

afterEach(cleanup);

function roleProps(role: WindowRole, title: string, overrides: Partial<WindowRecord> = {}) {
  const request = standardWindow(`${role}-window`, {
    role,
    title,
    level: role === "panel" || role === "hud" || role === "popover" ? "floating" : role === "modal" || role === "sheet" ? "modal" : "normal",
    parentWindowControllerId: role === "sheet" || role === "popover" ? "parent-window" : null,
    anchor: role === "popover" ? {
      id: "share-button",
      rect: { x: 200, y: 30, width: 44, height: 44 },
      edge: "block-end",
      alignment: "center",
      offset: 8,
    } : null,
    style: role === "borderless" ? [] : role === "popover" ? ["closable"] : ["titled", "closable", "minimisable", "zoomable", "resizable"],
    mobilePolicy: role === "popover" ? "popover-to-sheet" : role === "panel" || role === "hud" || role === "sheet" ? "sheet" : "fullscreen",
  });
  const record = {
    ...request,
    id: `${role}-window`,
    runtimeId: "runtime:nse-role-test" as WindowRecord["runtimeId"],
    state: "open",
    isKey: true,
    isMain: role === "standard",
    zIndex: 3,
    ...overrides,
  } as WindowRecord;
  const presentation: WindowPresentation = {
    kind: "desktop-window",
    visible: true,
    bounds: record.bounds,
    safeAreaInsets: { blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 },
    movable: true,
    resizable: record.style.includes("resizable"),
    titleBarVisible: record.style.includes("titled"),
  };
  return {
    record,
    presentation,
    blocked: false,
    dirty: false,
    dispatchCommand: vi.fn().mockResolvedValue({ handled: true }),
  };
}

describe("NSE dedicated window roles", () => {
  it("mounts a dedicated pointer-inert shadow behind the standard window surface", () => {
    render(<NSEStandardWindowView {...roleProps("standard", "Documents")}><p>Documents</p></NSEStandardWindowView>);
    const window = screen.getByRole("dialog", { name: "Documents" });
    const shadow = window.querySelector<HTMLElement>("[data-window-shadow-layer]");
    const surface = window.querySelector<HTMLElement>("[data-window-surface]");
    expect(shadow).not.toBeNull();
    expect(shadow?.getAttribute("data-window-shadow-layer")).toBe("window.standard.shadow");
    expect(shadow?.getAttribute("aria-hidden")).toBe("true");
    expect(shadow?.getAttribute("data-nse-nine-slice")).toBe("window-shadow");
    expect(shadow?.querySelectorAll("[data-nse-nine-slice-part]")).toHaveLength(9);
    expect(surface).not.toBeNull();
    expect(window.firstElementChild).toBe(shadow);
    expect(shadow?.nextElementSibling).toBe(surface);
  });

  it("renders HUD and panel as distinct structures with role-limited controls", () => {
    const { rerender } = render(
      <NSEHUDWindowView {...roleProps("hud", "Levels")}><p>Levels</p></NSEHUDWindowView>,
    );
    const hud = screen.getByRole("dialog", { name: "Levels" });
    expect(hud.getAttribute("data-window-appearance-recipe")).toBe("window.hud.frame");
    expect(hud.querySelector("[data-window-hud-titlebar]")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Minimise/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Zoom/ })).toBeNull();

    rerender(<NSEPanelView {...roleProps("panel", "Inspector")}><p>Inspector</p></NSEPanelView>);
    const panel = screen.getByRole("dialog", { name: "Inspector" });
    expect(panel.getAttribute("data-window-role")).toBe("panel");
    expect(panel.querySelector("[data-window-panel-titlebar]")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Minimise/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Zoom/ })).toBeNull();
  });

  it("marks modal and sheets with focus-scope and relationship semantics", () => {
    const { rerender } = render(
      <NSEModalWindowView {...roleProps("modal", "Authentication")}><p>Authentication</p></NSEModalWindowView>,
    );
    const modal = screen.getByRole("dialog", { name: "Authentication" });
    expect(modal.getAttribute("aria-modal")).toBe("true");
    expect(modal.getAttribute("data-window-focus-scope")).toBe("modal");
    expect(modal.hasAttribute("data-window-outside-dismiss")).toBe(false);

    rerender(<NSESheetView {...roleProps("sheet", "Save changes?")}><p>Save changes?</p></NSESheetView>);
    const sheet = screen.getByRole("dialog", { name: "Save changes?" });
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    expect(sheet.getAttribute("data-window-parent-id")).toBe("parent-window");
    expect(sheet.getAttribute("data-window-shadow-recipe")).toBe("window.sheet.shadow");
  });

  it("retains popover anchor, arrow and outside-dismiss provenance", () => {
    render(
      <NSEPopoverWindowView {...roleProps("popover", "Share")}><p>Share options</p></NSEPopoverWindowView>,
    );
    const popover = screen.getByRole("dialog", { name: "Share" });
    expect(popover.getAttribute("data-window-anchor-id")).toBe("share-button");
    expect(popover.getAttribute("data-window-anchor-edge")).toBe("block-end");
    expect(popover.getAttribute("data-window-arrow-edge")).toBe("block-end");
    expect(popover.getAttribute("data-window-arrow-alignment")).toBe("center");
    expect(popover.getAttribute("data-window-outside-dismiss")).toBe("true");
    expect(popover.getAttribute("data-window-appearance-recipe")).toBe("window.popover.frame");
    expect(popover.querySelector("[data-window-titlebar]")).toBeNull();
  });

  it("keeps passive borderless content out of the dialog tree and requires a name when interactive", () => {
    const passive = roleProps("borderless", "Drag preview");
    const { rerender } = render(
      <NSEBorderlessWindowView {...passive}><div>Drag preview</div></NSEBorderlessWindowView>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Drag preview").closest("section")?.getAttribute("role")).toBe("presentation");
    expect(screen.getByText("Drag preview").closest("section")?.hasAttribute("data-window-appearance-recipe")).toBe(false);

    rerender(
      <NSEBorderlessWindowView {...passive} interactive accessibleName="Canvas tools">
        <div>Tools</div>
      </NSEBorderlessWindowView>,
    );
    expect(screen.getByRole("dialog", { name: "Canvas tools" })).not.toBeNull();
  });

  it("rejects records mounted through the wrong dedicated view", () => {
    const wrong = roleProps("panel", "Inspector");
    expect(() => render(<NSESheetView {...wrong}><p>Wrong</p></NSESheetView>)).toThrow(/NSESheetView.*sheet/i);
  });
});
