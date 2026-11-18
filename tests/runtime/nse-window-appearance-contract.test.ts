// @vitest-environment jsdom
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

import { createElement, useContext } from "react";
import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { NSE_WINDOW_GEOMETRY } from "../../src/NSE/Windows";
import { StandardWindowView } from "../../src/NSE/Windows/StandardWindowView";
import { WindowTitlebarHostContext } from "../../src/NSE/Windows/windowTitlebarContext";
import { useNSEWindowTitlebarDocument } from "../../src/SynCloudOS/AppHosting/windowAccessories";
import type { WindowRecord } from "../../src/SynCloudOS/Windows";
import { standardWindow } from "../fixtures/windowTestDependencies";

function WindowDocument({ controller }: { controller: NSEWindowController }) {
  useNSEWindowTitlebarDocument(controller, useContext(WindowTitlebarHostContext));
  return null;
}

describe("NSE window appearance contract", () => {


  it("publishes measured CSS-pixel geometry without device-pixel scaling", () => {
    expect(NSE_WINDOW_GEOMETRY).toEqual({
      titleBarHeight: 31,
      controlHitTarget: 44,
      controlPaintSize: 16,
      controlPaintInlineOrigin: 8,
      controlPaintBlockOrigin: 10,
      resizeGlyphSize: 12,
      shadow: {
        sourceInsets: { top: 10, right: 19, bottom: 10, left: 20 },
        distance: 5,
        paintExtents: { top: 5, right: 19, bottom: 20, left: 20 },
      },
    });
    expect(Object.isFrozen(NSE_WINDOW_GEOMETRY)).toBe(true);
  });

  it("window background is backgroundColour only", () => {
    const controller = new NSEWindowController();
    const { window } = controller;
    const record = {
      ...standardWindow("appearance-window"),
      id: "appearance-window",
      runtimeId: "test",
      state: "open",
      isKey: true,
      isMain: true,
      zIndex: 1,
    } as WindowRecord;
    const view = render(createElement(StandardWindowView, {
      record,
      dirty: false,
      blocked: false,
      dispatchCommand: async () => ({ handled: true }),
      presentation: {
        kind: "desktop-window",
        visible: true,
        bounds: record.bounds,
        safeAreaInsets: { blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 },
        movable: false,
        resizable: false,
        titleBarVisible: true,
      },
    }, createElement(WindowDocument, { controller })));

    try {
      expect(window.backgroundColour).toBeNull();
      act(() => { window.backgroundColour = "#c8102e"; });
      const surface = view.container.querySelector<HTMLElement>('[data-nse-control="window"] > [data-nse-part="bezel"]');
      expect(surface?.style.backgroundColor).toBe("rgb(200, 16, 46)");
      expect("backgroundColor" in window).toBe(false);
    } finally {
      view.unmount();
      controller.dispose();
    }
  });
});
