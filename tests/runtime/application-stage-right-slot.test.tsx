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
import { HostSiteBrandingProvider, SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { ApplicationStageView } from "../../src/Webspring/ApplicationStageView";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import { useSynWareApplicationMenuTrigger } from "../../src/SynCloudOS/AppSDK";
import { authoriseTestRuntime, createTestBundle, createTestRuntime } from "./helpers";

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

interface AppOptions {
  readonly frame?: Record<string, unknown>;
  readonly about?: boolean;
  readonly appPreferences?: boolean;
  readonly trigger?: "content";
  readonly loadModule?: () => Promise<{ default: React.ComponentType }>;
}

function createAppInfo({ frame = {}, about = false, appPreferences = false, trigger }: AppOptions = {}): SynCloudOSAppInfo {
  return {
    id: "test-app",
    displayName: "Test App",
    shortName: "Test",
    packageName: "com.test.app",
    frame: { material: "standard", topBar: "standard", rightSlot: "auto", background: "system", smoothSurface: "off", ...frame },
    icon: { src: "/test.png" },
    about: { version: "1.0.0", copyright: about ? "© Test" : "", trademark: "", ...(about ? { tagline: "A test app" } : {}) },
    ...(appPreferences || trigger ? { applicationMenu: { ...(trigger ? { trigger } : {}), ...(appPreferences ? { preferences: { commandId: "test-app.preferences" } } : {}) } } : {}),
    isDisabled: false,
    notifications: { badgeCount: 0, showsNotifications: false },
    presentation: "appView",
    route: "/test",
    window: { chrome: "system", defaultHeight: 720, defaultWidth: 960, minHeight: 400, minWidth: 400, resizable: true, title: "Test App" },
  } as unknown as SynCloudOSAppInfo;
}

function prepareRuntime(options: AppOptions & { readonly signedIn?: boolean }) {
  const runtime = options.signedIn ? authoriseTestRuntime(createTestRuntime()) : createTestRuntime();
  runtime.apps.registerBundle(createTestBundle(
    { id: "test-app", displayName: "Test App", route: "/test" },
    options.loadModule ? { loadModule: options.loadModule } : {},
  ));
  runtime.statechart.gotoState("active.application.active");
  return runtime;
}

function mountStage(runtime: SynCloudOSRuntime, options: AppOptions, lifecycle: "ready" | "active") {
  return render(
    <SynCloudOSProvider runtime={runtime}>
      <HostSiteBrandingProvider value={branding}>
        <ApplicationStageView
          app={createAppInfo(options)}
          lifecycle={lifecycle}
          stage={{ appId: "test-app", id: "application-stage:test-app", title: "Test App", isFocused: true, zIndex: 10 }}
        />
      </HostSiteBrandingProvider>
    </SynCloudOSProvider>
  );
}

function renderStage(options: AppOptions & { readonly signedIn?: boolean } = {}) {
  const runtime = prepareRuntime(options);
  return { runtime, ...mountStage(runtime, options, "ready") };
}

/** Renders with the app's module loaded, so its content (and any control it draws) is mounted. */
async function renderLoadedStage(options: AppOptions & { readonly signedIn?: boolean }) {
  const runtime = prepareRuntime(options);
  await runtime.bundles.loadBundle("test-app");
  return { runtime, ...mountStage(runtime, options, "active") };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const menuItemNames = () => screen.queryAllByRole("menuitem").map((item) => item.textContent?.trim());

describe("the right-slot control", () => {
  const combinations = [true, false].flatMap((about) => [true, false].flatMap((appPreferences) => [true, false].map((signedIn) => ({ about, appPreferences, signedIn }))));

  it.each(combinations.filter(({ about, appPreferences, signedIn }) => about || appPreferences || signedIn))(
    "opens a menu with only the applicable items (about $about, app preferences $appPreferences, signed in $signedIn)",
    async ({ about, appPreferences, signedIn }) => {
      renderStage({ about, appPreferences, signedIn });

      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      await screen.findByRole("menu");

      const expected = [
        ...(about ? ["About Test App"] : []),
        ...(appPreferences ? ["Test App Preferences…"] : []),
        "System Preferences…",
        ...(signedIn ? ["Log Out"] : []),
      ];
      await waitFor(() => expect(menuItemNames()).toEqual(expected));
    },
  );

  it("opens System Preferences directly, with no menu, when nothing else applies", async () => {
    const { runtime } = renderStage();
    const control = screen.getByRole("button", { name: "Settings" });
    expect(control.getAttribute("aria-haspopup")).toBeNull();

    fireEvent.click(control);

    await waitFor(() => expect(runtime.systemUI.getSnapshot().preferencesPane).toBe(""));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("draws a gear for auto, a person for userInfo and the label for a custom control", () => {
    renderStage({ frame: { rightSlot: "auto" } });
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
    cleanup();

    renderStage({ frame: { rightSlot: "userInfo" } });
    expect(screen.getByRole("button", { name: "User Info" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
    cleanup();

    renderStage({ frame: { rightSlot: { icon: "/help.svg", label: { key: "help.label", fallback: "Help" } } } });
    const custom = screen.getByRole("button", { name: "Help" });
    expect(custom.querySelector<HTMLElement>(".nse-app-topbar-button-icon")?.style.getPropertyValue("--nse-app-topbar-glyph")).toBe('url("/help.svg")');
  });

  it("follows the same menu rule for userInfo", async () => {
    renderStage({ frame: { rightSlot: "userInfo" }, about: true, signedIn: true });

    fireEvent.click(screen.getByRole("button", { name: "User Info" }));
    await screen.findByRole("menu");

    await waitFor(() => expect(menuItemNames()).toEqual(["About Test App", "System Preferences…", "Log Out"]));
  });

  it("renders no control for none", () => {
    renderStage({ frame: { rightSlot: "none" }, about: true, signedIn: true });

    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
    expect(screen.queryByRole("button", { name: "User Info" })).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("renders no control without the standard top bar", () => {
    renderStage({ frame: { topBar: "custom" }, about: true });

    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
  });
});

describe("the default app look", () => {
  it("paints the system background and never renders a content card", () => {
    const { container } = renderStage();
    const body = container.querySelector<HTMLElement>(".webspring-app-view-body-surface")!;

    expect(body.getAttribute("data-frame-background")).toBe("system");
    expect(container.querySelector("[class*='content-card']")).toBeNull();
    expect(container.querySelector("[data-frame-layout]")).toBeNull();
  });

  it("leaves the body to the app for none", () => {
    const { container } = renderStage({ frame: { background: "none" } });

    expect(container.querySelector(".webspring-app-view-body-surface")?.getAttribute("data-frame-background")).toBe("none");
  });

  it("paints a developer surface through custom properties on the body", () => {
    const { container } = renderStage({ frame: { background: { colour: "#223344", texture: { image: "/grain.png", size: "128px" } } } });
    const body = container.querySelector<HTMLElement>(".webspring-app-view-body-surface")!;

    expect(body.getAttribute("data-frame-background")).toBe("surface");
    expect(body.style.getPropertyValue("--nse-app-surface-colour")).toBe("#223344");
    expect(body.style.getPropertyValue("--nse-app-surface-image")).toContain("/grain.png");
    expect(body.style.getPropertyValue("--nse-app-surface-size")).toContain("128px");
  });

  it("uses the same background rule for an app that draws its own top bar", () => {
    const { container } = renderStage({ frame: { topBar: "custom" } });

    expect(container.querySelector(".webspring-app-view-body-surface")?.getAttribute("data-frame-background")).toBe("system");
  });
});

describe("applicationMenu.trigger content", () => {
  function ContentTrigger() {
    const menu = useSynWareApplicationMenuTrigger();
    return <button type="button" ref={(element) => menu?.setAnchor(element)} onClick={() => menu?.toggle()}>Open the app menu</button>;
  }
  const loadModule = async () => ({ default: ContentTrigger });

  it("opens the menu from the app's own control when the right slot is none", async () => {
    await renderLoadedStage({ frame: { rightSlot: "none" }, trigger: "content", about: true, signedIn: true, loadModule });

    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Open the app menu" }));
    await screen.findByRole("menu");

    await waitFor(() => expect(menuItemNames()).toEqual(["About Test App", "System Preferences…", "Log Out"]));
  });

  it("opens System Preferences directly from the app's own control when nothing else applies", async () => {
    const { runtime } = await renderLoadedStage({ frame: { rightSlot: "none" }, trigger: "content", loadModule });

    fireEvent.click(await screen.findByRole("button", { name: "Open the app menu" }));

    await waitFor(() => expect(runtime.systemUI.getSnapshot().preferencesPane).toBe(""));
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
