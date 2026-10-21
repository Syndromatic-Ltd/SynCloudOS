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
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SynCloudOSAppInfo } from "../../src/SynCloudOS/AppInfo/appInfoTypes";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import { HostSiteBrandingProvider, SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { ApplicationStageView } from "../../src/Webspring/ApplicationStageView";
import { createTestBundle, createTestRuntime } from "./helpers";

vi.mock("../../src/Webspring/webspringLocale", () => ({
  useWebspringLocale: () => ({
    appName: (app: SynCloudOSAppInfo, variant = "display") =>
      variant === "window" ? app.window.title : app.displayName,
    appText: (_app: SynCloudOSAppInfo, key: string, fallback: string) => fallback ?? key,
    t: (_key: string, fallback: string, params?: Record<string, unknown>) =>
      fallback.replace(/\{([A-Za-z0-9_.-]+)\}/g, (match, key) =>
        params && key in params ? String(params[key]) : match
      )
  })
}));

const branding = Object.freeze({
  name: "Stage fixture", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null,
  compactLogoUrl: null, logoAlt: "Stage fixture",
});

function createAppInfo(frame: Record<string, unknown>): SynCloudOSAppInfo {
  return {
    bundleIdentifier: "com.example.test-app",
    displayName: "Test App",
    shortName: "Test",
    packageName: "com.test.app",
    frame: { material: "standard", topBar: "standard", rightSlot: "auto", background: "system", smoothSurface: "off", ...frame },
    icon: { src: "/test.png" },
    version: "1.0.0",
    about: { copyright: "", trademark: "" },
    isDisabled: false,
    notifications: { badgeCount: 0, showsNotifications: false },
    presentation: "appView",
    route: "/test",
    window: { chrome: "system", defaultHeight: 720, defaultWidth: 960, minHeight: 400, minWidth: 400, resizable: true, title: "Test App" },
  } as unknown as SynCloudOSAppInfo;
}

function renderStage(frame: Record<string, unknown>) {
  const runtime: SynCloudOSRuntime = createTestRuntime();
  runtime.apps.registerBundle(createTestBundle({ version: "1.0.0", bundleIdentifier: "com.example.test-app", displayName: "Test App", route: "/test" }));
  runtime.statechart.gotoState("active.application.active");
  render(
    <SynCloudOSProvider runtime={runtime}>
      <HostSiteBrandingProvider value={branding}>
        <ApplicationStageView
          app={createAppInfo(frame)}
          lifecycle="ready"
          stage={{ appId: "com.example.test-app", id: "application-stage:com.example.test-app", title: "Test App", isFocused: true, zIndex: 10 }}
        />
      </HostSiteBrandingProvider>
    </SynCloudOSProvider>
  );
}

/** The stage's own elements: the app view root, the bar, and the app's content inside its background. */
function stageElements() {
  const root = document.querySelector<HTMLElement>("[data-frame-top-bar]");
  const bar = document.querySelector<HTMLElement>(".nse-app-topbar");
  const content = document.querySelector<HTMLElement>('[aria-label="Test App"]');
  const background = content?.closest<HTMLElement>("[data-frame-background]") ?? null;
  return { root, bar, content, background };
}

afterEach(cleanup);

describe("the standard top bar's band above app content", () => {
  it("reserves the cumulus bar height and keeps the content out of the bar", () => {
    renderStage({ topBar: "standard", material: "standard" });
    const { bar, content, background } = stageElements();

    expect(stageElements().root?.style.getPropertyValue("--webspring-app-top-bar-height")).toBe("var(--nse-app-topbar-height, var(--nse-topbar-height-continuous, 56px))");
    expect(bar).not.toBeNull();
    expect(content).not.toBeNull();
    // The content sits in the body, which still fills the whole frame behind the floating bar.
    expect(background).not.toBeNull();
    expect(background!.contains(content!)).toBe(true);
    expect(bar!.contains(content!)).toBe(false);
  });

  it("uses the theme bar height independently of app material", () => {
    renderStage({ topBar: "standard", material: "metal" });

    expect(stageElements().root?.style.getPropertyValue("--webspring-app-top-bar-height")).toBe("var(--nse-app-topbar-height, var(--nse-topbar-height-continuous, 56px))");
    expect(stageElements().bar).not.toBeNull();
  });

  it.each(["custom", "none"] as const)("leaves the whole frame to the content with a %s bar", (topBar) => {
    renderStage({ topBar });
    const { bar, content, background } = stageElements();

    expect(stageElements().root?.style.getPropertyValue("--webspring-app-top-bar-height")).toBe("0px");
    expect(bar).toBeNull();
    expect(background!.contains(content!)).toBe(true);
  });

  it("keeps the bar in the body's own flow for a source list, as before", () => {
    renderStage({ topBar: "standard", material: "metal", sourceList: { railLabel: "Test" } });
    const { bar, content, background } = stageElements();

    expect(background).not.toBeNull();
    // The source list draws the bar as the body's header, so both share the same clipped surface.
    expect(bar!.closest("[data-frame-background]")).toBe(background);
    expect(background!.contains(content!)).toBe(true);
  });
});
