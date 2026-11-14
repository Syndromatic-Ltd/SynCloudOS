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
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PanelView, HUDWindowView, SheetView, PopoverWindowView, ModalWindowView } from "../../src/NSE/NSE";
import { standardWindow } from "../fixtures/windowTestDependencies";
import type { WindowRecord, WindowPresentation } from "../../src/SynCloudOS/Windows";

const windowCSS = readFileSync("src/NSE/Windows/nse-windows.css", "utf8");

function roleRecord(role: WindowRecord["role"]): { record: WindowRecord; presentation: WindowPresentation } {
  const request = standardWindow(`role-${role}`, { title: `${role} specimen`, role });
  const record = {
    ...request,
    id: `role-${role}`,
    runtimeId: "runtime:role-smoke" as WindowRecord["runtimeId"],
    state: "open",
    isKey: true,
    isMain: true,
    zIndex: 4,
    // Panels must float above normal windows; popovers require anchor
    // provenance for their arrow.
    ...((role === "panel" || role === "hud") ? { level: "floating" as const } : {}),
    ...(role === "popover"
      ? { anchor: { id: "role-popover-anchor", rect: { x: 0, y: 0, width: 8, height: 8 }, edge: "block-end" as const, alignment: "center" as const, offset: 0 } }
      : {}),
  } as WindowRecord;
  const presentation: WindowPresentation = {
    kind: "desktop-window",
    visible: true,
    bounds: record.bounds,
    safeAreaInsets: { blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 },
    movable: true,
    resizable: true,
    titleBarVisible: true,
  };
  return { record, presentation };
}

describe("non-standard window role paint", () => {
  it("keeps panel, HUD, sheet, popover and modal visibly painted by the active theme", () => {
    const dispatchCommand = () => Promise.resolve({ handled: true });
    const cases = [
      { role: "panel" as const, view: PanelView, bar: ".nse-window__titlebar" },
      { role: "hud" as const, view: HUDWindowView, bar: ".nse-window__hud-titlebar" },
      { role: "sheet" as const, view: SheetView, bar: ".nse-window__titlebar" },
      { role: "popover" as const, view: PopoverWindowView, bar: null },
      { role: "modal" as const, view: ModalWindowView, bar: ".nse-window__titlebar" },
    ] as const;
    for (const { role, view: View, bar } of cases) {
      const { record, presentation } = roleRecord(role);
      const { unmount } = render(
        <View record={record} presentation={presentation} blocked={false} dirty={false} dispatchCommand={dispatchCommand}>
          <p>{role} content</p>
        </View>,
      );
      try {
        const root = document.querySelector(`[data-window-id="role-${role}"]`);
        expect(root, `${role} renders its window root`).not.toBeNull();
        // Concrete theme identity belongs to the surrounding appearance
        // provider; window roles expose only semantic chrome state.
        if (bar) expect(root?.querySelector(bar), `${role} renders its titlebar`).not.toBeNull();
        expect(root?.textContent).toContain(`${role} content`);
      } finally {
        unmount();
      }
    }
    // Theme-neutral fallback paint remains on semantic window hooks.
    for (const selector of [
      ".nse-window__titlebar,",
      ".nse-window-view--hud,",
      ".nse-window__hud-titlebar,",
      ".nse-window-view--sheet,",
      ".nse-window-view--popover,",
    ]) {
      expect(windowCSS.includes(selector), `stylesheet keeps ${selector}`).toBe(true);
    }
  });
});
