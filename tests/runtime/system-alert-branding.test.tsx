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
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SystemAlert } from "../../src/SynCloudOSReact/SystemAlert";
import { projectRuntimeManifest } from "../../src/SynCloudOS/AppSDK/projectRuntimeManifest";
import { HostSiteBrandingProvider } from "../../src/SynCloudOSReact/siteBrandingContext";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact/SynCloudOSProvider";
import { resolveSiteBranding } from "../../src/SynCloudOS/Branding/siteBranding";
import { WebspringStatusLayer } from "../../src/Webspring/WebspringStatusLayer";
import { createTestBundle, createTestRuntime } from "./helpers";
import { createErrorManager } from "../../src/SynCloudOS/ErrorManager/ErrorManager";

afterEach(cleanup);

const branding = resolveSiteBranding({
  name: { key: "site.name", fallback: "Example Site" },
  logo: { resource: "./Resources/site.svg", alternativeText: { key: "site.logo", fallback: "Example Site" } },
  lightLogo: { resource: "./Resources/site-light.svg", alternativeText: { key: "site.logo", fallback: "Example Site" } },
  darkLogo: { resource: "./Resources/site-dark.svg", alternativeText: { key: "site.logo", fallback: "Example Site" } },
}, {
  "./Resources/site.svg": "/configured-site.svg",
  "./Resources/site-light.svg": "/configured-site-light.svg",
  "./Resources/site-dark.svg": "/configured-site-dark.svg",
}, { t: (key) => key }, "example.webspring");

const appError = { code: "APP_CONTENT_FAILED", title: "Stopped", message: "Try again", appId: "journal", packageName: "Journal.app" };
const applicationIcon = "/resolved-app-resources/AppIcon.png";
const callbacks = { onDismiss() {}, onReturn() {}, onReload() {} };
const artwork = () => screen.getByRole("alertdialog").querySelector<HTMLElement>("[data-alert-icon]")!;
const logo = () => artwork().querySelector<HTMLImageElement>("[data-alert-logo]");
const badge = () => artwork().querySelector<HTMLImageElement>("[data-alert-caution]");

describe("private host recovery artwork", () => {
  it("uses the current system artwork and its sizing for an app without a declared icon", () => {
    const manifest = projectRuntimeManifest({ schemaVersion: 1, id: "chronosphere", title: "Chronosphere", version: "1.0.0" }, {
      appRoot: "./Chronosphere.app", packageName: "Chronosphere.app", path: "Chronosphere.app/", componentKey: "Chronosphere",
    });
    render(<SystemAlert error={{ ...appError, appId: manifest.id }} applicationIcon={manifest.icon.src} {...callbacks} />);
    expect(artwork().dataset.alertIcon).toBe("app");
    expect(logo()?.getAttribute("src")).toContain("SynCloudOSLogo.png");
    expect(logo()?.getAttribute("data-alert-logo")).toBe("syncloudos");
  });

  it("uses the registered app icon, with a separate framework caution layer", () => {
    render(<HostSiteBrandingProvider value={branding}><SystemAlert error={appError} applicationIcon={applicationIcon} {...callbacks} /></HostSiteBrandingProvider>);
    expect(artwork().dataset.alertIcon).toBe("app");
    expect(logo()?.getAttribute("src")).toBe(applicationIcon);
    expect(badge()?.getAttribute("src")).toContain("AlertCautionIcon.png");
    expect(logo()).not.toBe(badge());
    expect(artwork().querySelectorAll("img")).toHaveLength(2);
    expect(artwork().innerHTML).not.toMatch(/WebspringError|SynCloudOSError|configured-site/i);
  });

  it("uses supplied SynCloudOS branding for captured system scope despite app code and actions", () => {
    const error = { ...appError, context: { scope: "kernel" }, suggestedActions: ["returnToWebspring"] };
    render(<HostSiteBrandingProvider value={branding}><SystemAlert error={error} {...callbacks} /></HostSiteBrandingProvider>);
    expect(artwork().dataset.alertIcon).toBe("syncloudos");
    expect(logo()?.getAttribute("src")).toContain("SynCloudOSLogo.png");
    expect(badge()?.getAttribute("src")).toContain("AlertCautionIcon.png");
  });

  it("honours captured site scope even for an unknown synthetic error code", () => {
    const error = { code: "UNKNOWN_RUNTIME_ERROR", title: "Stopped", message: "Try again", scope: "site" };
    render(<HostSiteBrandingProvider value={branding}><SystemAlert error={error} {...callbacks} /></HostSiteBrandingProvider>);
    expect(artwork().dataset.alertIcon).toBe("site");
    expect(logo()?.getAttribute("src")).toBe("/configured-site-dark.svg");
  });

  it("shows plain caution when a site has no logo", () => {
    render(<SystemAlert error={{ ...appError, context: { scope: "site" } }} {...callbacks} />);
    expect(artwork().dataset.alertIcon).toBe("site");
    expect(logo()).toBeNull();
    expect(badge()?.getAttribute("src")).toContain("AlertCautionIcon.png");
    expect(artwork().querySelectorAll("img")).toHaveLength(1);
  });

  it("keeps root watchdog failures on system branding", () => {
    const error = { ...appError, context: { watchdog: "root", source: "SynCloudOS.RootWatchdog" } };
    render(<HostSiteBrandingProvider value={branding}><SystemAlert error={error} {...callbacks} /></HostSiteBrandingProvider>);
    expect(artwork().dataset.alertIcon).toBe("syncloudos");
    expect(logo()?.getAttribute("src")).toContain("SynCloudOSLogo.png");
  });

  it("uses genuine runtime category before APP code and return-action inference", () => {
    const runtime = createTestRuntime();
    const error = runtime.errors.capture({ ...appError, category: "runtime", suggestedActions: ["returnToWebspring"] });
    render(<HostSiteBrandingProvider value={branding}><SystemAlert error={error} {...callbacks} /></HostSiteBrandingProvider>);
    expect(artwork().dataset.alertIcon).toBe("syncloudos");
    expect(logo()?.getAttribute("src")).toContain("SynCloudOSLogo.png");
  });

  it("brands the existing runtime session-authority failure as site recovery", () => {
      const runtime = createTestRuntime();
      const manager = createErrorManager(runtime, { loginServices: { getSnapshot: () => ({ isAuthorised: false }) } });
      const error = manager.createLoginSessionMismatchError({ id: "journal", displayName: "Journal", packageName: "Journal.app" }, { siteName: branding.name });
      const rendered = render(<HostSiteBrandingProvider value={branding}><SystemAlert error={error} applicationIcon={applicationIcon} {...callbacks} /></HostSiteBrandingProvider>);
      expect(error.category).toBe("runtime");
      expect(error.title).toBe("Example Site has unexpectedly stopped.");
      expect(artwork().dataset.alertIcon).toBe("site");
      expect(logo()?.getAttribute("src")).toBe("/configured-site-dark.svg");
      rendered.rerender(<HostSiteBrandingProvider value={null}><SystemAlert error={error} applicationIcon={applicationIcon} {...callbacks} /></HostSiteBrandingProvider>);
      expect(artwork().dataset.alertIcon).toBe("site");
      expect(logo()).toBeNull();
      expect(badge()?.getAttribute("src")).toContain("AlertCautionIcon.png");
  });

  it.each(["payload", "context"] as const)("uses app branding for an app resource failure identified in %s", (location) => {
    const runtime = createTestRuntime();
    const error = location === "context"
      ? runtime.errors.createAssetLoadFailedError({ tagName: "IMG", src: "/app-asset.svg" }, { appId: "journal" })
      : runtime.errors.capture({ code: "ASSET_LOAD_FAILED", title: "Resource failed", message: "Try again", category: "resource", appId: "journal", suggestedActions: ["dismiss"] });
    render(<HostSiteBrandingProvider value={branding}><SystemAlert error={error} applicationIcon={applicationIcon} {...callbacks} /></HostSiteBrandingProvider>);
    expect(artwork().dataset.alertIcon).toBe("app");
    expect(logo()?.getAttribute("src")).toBe(applicationIcon);
  });

  it("keeps an unowned resource failure on supplied system artwork", () => {
    const runtime = createTestRuntime();
    const error = runtime.errors.createAssetLoadFailedError({ tagName: "SCRIPT", src: "/runtime.js" });
    render(<HostSiteBrandingProvider value={branding}><SystemAlert error={error} {...callbacks} /></HostSiteBrandingProvider>);
    expect(artwork().dataset.alertIcon).toBe("syncloudos");
    expect(logo()?.getAttribute("src")).toContain("SynCloudOSLogo.png");
  });

  it("reacts to real host appearance and selected-site branding changes", () => {
    const runtime = createTestRuntime();
    runtime.appearance.set("light");
    const captured = runtime.errors.capture({ ...appError, context: { scope: "site" } });
    const view = (value: typeof branding) => <SynCloudOSProvider runtime={runtime}>
      <HostSiteBrandingProvider value={value}><WebspringStatusLayer errors={[captured]} /></HostSiteBrandingProvider>
    </SynCloudOSProvider>;
    const rendered = render(view(branding));
    expect(logo()?.getAttribute("src")).toBe("/configured-site-light.svg");
    act(() => runtime.appearance.set("dark"));
    expect(logo()?.getAttribute("src")).toBe("/configured-site-dark.svg");
    rendered.rerender(view({ ...branding, name: "Next Site", darkLogoUrl: "/next-site-dark.svg" }));
    expect(logo()?.getAttribute("src")).toBe("/next-site-dark.svg");
    rendered.unmount();
  });

  it("does not substitute the site logo when an app icon is unavailable", () => {
    render(<HostSiteBrandingProvider value={branding}><SystemAlert error={appError} {...callbacks} /></HostSiteBrandingProvider>);
    expect(artwork().dataset.alertIcon).toBe("app");
    expect(logo()).toBeNull();
    expect(badge()).not.toBeNull();
  });

  it.each(["payload", "context"] as const)("resolves the AppIcon through the host registry for an app id in %s", (location) => {
    const runtime = createTestRuntime();
    runtime.apps.registerBundle(createTestBundle({ id: "journal", icon: { src: applicationIcon } }));
    const captured = runtime.errors.capture(location === "payload"
      ? { ...appError, category: "app" }
      : { code: "ASSET_LOAD_FAILED", title: "Resource failed", message: "Try again", category: "resource", context: { appId: "journal" } });
    render(<SynCloudOSProvider runtime={runtime}><HostSiteBrandingProvider value={branding}><WebspringStatusLayer errors={[captured]} /></HostSiteBrandingProvider></SynCloudOSProvider>);
    expect(artwork().dataset.alertIcon).toBe("app");
    expect(logo()?.getAttribute("src")).toBe(applicationIcon);
  });
});
