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
import { describe, expect, it, vi } from "vitest";
import { NSEAppearance } from "../../src/NSE/Appearance/NSEAppearance";
import { NSEApplication, type NSEApplicationContext } from "../../src/NSE/Application/NSEApplication";
import { instantiateInOwnerScope, nseDisposeFor, OwnershipScope } from "../../src/NSE/Controllers/ownership";
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

function renderWindowDocument(controller: NSEWindowController, id: string) {
  const record = {
    ...standardWindow(id),
    id,
    runtimeId: "test",
    state: "open",
    isKey: true,
    isMain: true,
    zIndex: 1,
  } as WindowRecord;
  return render(createElement(StandardWindowView, {
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
}

function applicationForTest() {
  const context: NSEApplicationContext = {
    appId: "com.example.appearance",
    windows: () => [],
    async openWindow() { throw new Error("This fixture constructs only its own window."); },
  };
  return instantiateInOwnerScope(new OwnershipScope("NSEApplication", context.appId), () => new NSEApplication(), context);
}

function appAppearance(id: string) {
  return new NSEAppearance({ theme: { kind: "app", bundleIdentifier: id, displayName: id, version: "1.0.0" } });
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

  it("observes application appearance changes and restores the null default", () => {
    const application = applicationForTest();
    const observer = vi.fn();
    const stop = application.subscribe(observer);
    const appearance = appAppearance("com.example.chrome");

    try {
      expect(application.appearance).toBeNull();
      application.appearance = appearance;
      expect(application.appearance).toBe(appearance);
      application.appearance = appearance;
      expect(observer).toHaveBeenCalledOnce();

      application.appearance = null;
      expect(application.appearance).toBeNull();
      expect(observer).toHaveBeenCalledTimes(2);
    } finally {
      stop();
      application[nseDisposeFor]("application-closed");
    }
  });

  it("projects application appearance on the window root and observes window overrides", () => {
    const application = applicationForTest();
    const controller = instantiateInOwnerScope(
      new OwnershipScope("NSEWindowController", "appearance-projection"),
      () => new NSEWindowController(),
      { app: application },
    );
    const inherited = appAppearance("com.example.chrome");
    const override = appAppearance("com.example.window-chrome");
    const view = renderWindowDocument(controller, "appearance-projection");
    const observer = vi.fn();
    const stop = controller.subscribe(observer);
    const appThemeId = () => view.container.querySelector('[data-nse-control="window"][data-nse-part="background"]')
      ?.getAttribute("data-nse-app-theme");

    try {
      expect(appThemeId()).toBeNull();
      act(() => { application.appearance = inherited; });
      expect(appThemeId()).toBe("com.example.chrome");
      expect(controller.window.appearance).toBeNull();

      act(() => { controller.window.appearance = override; });
      expect(controller.window.appearance).toBe(override);
      expect(appThemeId()).toBe("com.example.window-chrome");
      act(() => { controller.window.appearance = override; });
      expect(observer).toHaveBeenCalledOnce();

      act(() => { controller.window.appearance = null; });
      expect(controller.window.appearance).toBeNull();
      expect(appThemeId()).toBe("com.example.chrome");
      expect(observer).toHaveBeenCalledTimes(2);

      act(() => { application.appearance = null; });
      expect(appThemeId()).toBeNull();
    } finally {
      stop();
      view.unmount();
      controller.dispose();
      application[nseDisposeFor]("application-closed");
    }
  });

  it("window background is backgroundColour only", () => {
    const controller = new NSEWindowController();
    const { window } = controller;
    const view = renderWindowDocument(controller, "appearance-window");

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
