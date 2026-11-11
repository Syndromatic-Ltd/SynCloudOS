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

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SynCloudOSAppInfo } from "../../src/SynCloudOS/AppInfo/appInfoTypes";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { ApplicationStageView } from "../../src/Webspring/ApplicationStageView";
import { createTestBundle, createTestRuntime } from "./helpers";



vi.mock("../../src/Webspring/webspringLocale", () => ({
  useWebspringLocale: () => ({
    appName: (app: SynCloudOSAppInfo, variant = "display") =>
      variant === "window" ? app.window.title : app.displayName,
    t: (_key: string, fallback: string, params?: Record<string, unknown>) =>
      fallback.replace(/\{([A-Za-z0-9_.-]+)\}/g, (match, key) =>
        params && key in params ? String(params[key]) : match,
      ),
  }),
}));

function createAppInfo(): SynCloudOSAppInfo {
  return {
    bundleIdentifier: "com.example.test-app",
    displayName: "Test App",
    shortName: "Test",
    packageName: "com.test.app",
    frame: {
      material: "standard",
      rightSlot: "userInfo",
      background: "system",
      smoothSurface: "off",
      sourceList: undefined,
      topBar: "standard",
    },
    icon: { src: "/test.png" },
    version: "1.0.0",
    about: { copyright: "© Test", trademark: "", tagline: "A test app" },
    isDisabled: false,
    notifications: { badgeCount: 0, showsNotifications: false },
    presentation: "appView",
    route: "/test",
    window: {
      chrome: "system",
      defaultHeight: 720,
      defaultWidth: 960,
      minHeight: 400,
      minWidth: 400,
      resizable: true,
      title: "Test App",
    },
  } as SynCloudOSAppInfo;
}

function renderAppMenu(mode: "desktop" | "mobile" = "desktop", strict = false) {
  const runtime = createTestRuntime();
  runtime.apps.registerBundle(createTestBundle({ version: "1.0.0", bundleIdentifier: "com.example.test-app", displayName: "Test App", route: "/test" }));
  runtime.statechart.gotoState("active.application.active");
  runtime.store.mutate((draft) => { draft.responsive.mode = mode; });
  const validation = vi.spyOn(runtime.commands, "validateMany");
  const view = (
    <SynCloudOSProvider runtime={runtime}>
      <ApplicationStageView
        app={createAppInfo()}
        lifecycle="ready"
        stage={{ appId: "com.example.test-app", id: "application-stage:com.example.test-app", title: "Test App", isFocused: true, zIndex: 10 }}
      />
    </SynCloudOSProvider>
  );
  render(strict ? <React.StrictMode>{view}</React.StrictMode> : view);
  return { runtime, validation };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Webspring app menu", () => {
  it("opens one immutable command generation, dispatches through the runtime, and restores trigger focus", async () => {
    const { runtime, validation } = renderAppMenu();
    const trigger = screen.getByRole("button", { name: "User Info" });

    fireEvent.click(trigger);

    await waitFor(() => expect(validation).toHaveBeenCalledTimes(1));

    const about = await screen.findByRole("menuitem", { name: "About Test App" });
    expect(validation).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-nse-overlay-kind="menu"]')).toBeTruthy();
    fireEvent.click(about);

    await waitFor(() => expect(runtime.systemUI.getSnapshot().aboutAppId).toBe("com.example.test-app"));
    await waitFor(() => expect(document.querySelector('[data-nse-overlay-kind="menu"]')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps the application menu attached to its real trigger in a compact viewport", async () => {
    const { validation } = renderAppMenu("mobile");

    const trigger = screen.getByRole("button", { name: "User Info" });
    fireEvent.click(trigger);
    expect(trigger.getAttribute("data-selected")).toBe("true");

    await screen.findByRole("menuitem", { name: "About Test App" });
    expect(validation).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-nse-overlay-kind="menu"]')).toBeTruthy();
    expect(document.querySelector('[data-nse-presentation="viewport-block-start-inline-end"]')).toBeTruthy();
    expect(document.querySelector('[data-nse-application-menu="true"]')).toBeTruthy();
  });

  it("keeps the app-menu controller live through StrictMode effect replay", async () => {
    const { validation } = renderAppMenu("desktop", true);
    const trigger = screen.getByRole("button", { name: "User Info" });

    fireEvent.click(trigger);
    expect(trigger.getAttribute("data-selected")).toBe("true");

    await waitFor(() => expect(validation).toHaveBeenCalledTimes(1));
    await screen.findByRole("menuitem", { name: "About Test App" });
    expect(validation).toHaveBeenCalledTimes(1);
  });
});
