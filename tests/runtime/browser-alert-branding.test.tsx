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
import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSynCloudOS } from "../../src/SynCloudOS/Runtime/createSynCloudOS";
import { mountSynCloudOS, type MountedSynCloudOSHost } from "../../src/SynCloudOSReact/browserRuntime";
import { useHostSiteBranding } from "../../src/SynCloudOSReact/siteBrandingContext";
import { useResolvedMode } from "../../src/SynCloudOSReact/serviceHooks";
import { defineWebspring } from "../../src/Webspring/public";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";

const scenario = vi.hoisted(() => ({ throwAtRoot: false }));
vi.mock("../../src/SynCloudOS/Runtime/createSynCloudOS", { spy: true });
vi.mock("../../src/App", () => ({ App: () => {
  const branding = useHostSiteBranding();
  const mode = useResolvedMode();
  if (scenario.throwAtRoot) throw new Error("Root recovery specimen");
  return <output data-testid="root-site-logo">{mode === "light" ? branding?.lightLogoUrl : branding?.darkLogoUrl}</output>;
} }));

const shell = defineWebspring({ manifest: {
  schemaVersion: 1, bundleIdentifier: "com.example.recovery-shell", version: "1.0.0", displayName: "Recovery shell",
  webspringShell: {
    views: [{ id: "site", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" }],
    defaults: { desktop: "site", tablet: "site", mobile: "site" }, homeRoute: "/",
    branding: {
      name: { key: "site.name", fallback: "Example Site" },
      lightLogo: { resource: "./Resources/light.svg", alternativeText: { key: "site.logo", fallback: "Example Site" } },
      darkLogo: { resource: "./Resources/dark.svg", alternativeText: { key: "site.logo", fallback: "Example Site" } },
    },
  },
}, components: { site: () => null } });

const mounts: Array<{ host: MountedSynCloudOSHost; runtime: SynCloudOSRuntime; element: HTMLElement }> = [];
async function mount() {
  const element = document.createElement("div");
  document.body.append(element);
  let host!: MountedSynCloudOSHost;
  await act(async () => { host = await mountSynCloudOS({ element, shell, shellResources: { resourceUrls: {
    "./Resources/light.svg": "/boot-site-light.svg", "./Resources/dark.svg": "/boot-site-dark.svg",
  } } }); });
  const result = vi.mocked(createSynCloudOS).mock.results.at(-1);
  if (result?.type !== "return") throw new Error("The browser runtime was not created.");
  const mounted = { host, runtime: result.value, element };
  mounts.push(mounted);
  return mounted;
}

afterEach(async () => {
  for (const { host, element } of mounts.splice(0)) {
    await act(async () => { await host.dispose("test-cleanup"); });
    element.remove();
  }
  scenario.throwAtRoot = false;
  vi.restoreAllMocks();
});

describe("browser recovery branding plumbing", () => {
  it("resolves shell resources before the root watchdog and tracks appearance", async () => {
    const { element, runtime } = await mount();
    act(() => runtime.appearance.set("light"));
    expect(element.querySelector("output")?.textContent).toBe("/boot-site-light.svg");
    act(() => runtime.appearance.set("dark"));
    expect(element.querySelector("output")?.textContent).toBe("/boot-site-dark.svg");
  });

  it("composes supplied system artwork in the real root fallback and tracks appearance", async () => {
    scenario.throwAtRoot = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { element, runtime } = await mount();
    expect(element.querySelector<HTMLImageElement>("[data-alert-logo]")?.getAttribute("src")).toContain("SynCloudOSLogo.png");
    expect(element.querySelector<HTMLImageElement>("[data-alert-caution]")?.getAttribute("src")).toContain("AlertCautionIcon.png");
    act(() => runtime.appearance.set("light"));
    expect(element.querySelector('[role="alertdialog"]')?.classList.contains("is-light")).toBe(true);
    expect(runtime.store.getSnapshot().errors.at(-1)?.source).toBe("SynCloudOS.RootWatchdog");
  });
});
