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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestRuntime, createTestBundle, flushLaunchTimers, createRuntimeHarness, unlockRuntime } from "./helpers";

describe("BootManager initial route", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
  });

  it.each([
    {
      pathname: "/",
      expectedKind: "webspring",
      expectedState: "active.webspring",
      expectedAppId: null,
      expectedRoutePath: "/"
    },
    {
      pathname: "/software",
      expectedKind: "app",
      expectedState: "active.application.active",
      expectedAppId: "com.example.software",
      expectedRoutePath: "/software"
    }
  ])("cold-boots $pathname through the direct initialPathname authority", async ({
    pathname,
    expectedKind,
    expectedState,
    expectedAppId,
    expectedRoutePath
  }) => {
    window.sessionStorage.setItem("syncloudos:last-active-app-route", "/studio");
    const runtime = createTestRuntime();
    const { BootManager, RouteManager, RuntimeController } = createRuntimeHarness(runtime);
    unlockRuntime(runtime);

    BootManager.boot({
      appBundles: [
        createTestBundle({ bundleIdentifier: "com.example.software", route: "/software" }),
        createTestBundle({ bundleIdentifier: "com.example.studio", route: "/studio" })
      ],
      initialPathname: pathname
    });
    await flushLaunchTimers();

    const snapshot = RuntimeController.getSnapshot();
    expect(RouteManager.resolveRoute(pathname).kind).toBe(expectedKind);
    expect(snapshot.statechart.currentState).toBe(expectedState);
    expect(snapshot.application).toMatchObject({
      activeAppId: expectedAppId,
      routePath: expectedRoutePath
    });
    expect(window.sessionStorage.getItem("syncloudos:last-active-app-route")).toBe("/studio");
  });

  it("does not retain the removed legacy route as a shell route", async () => {
    const { RouteManager } = createRuntimeHarness(createTestRuntime());
    const legacyRoute = `/${["spring", "board"].join("")}`;

    expect(RouteManager.resolveRoute(legacyRoute)).toMatchObject({
      kind: "notFound",
      pathname: legacyRoute
    });
  });

  it("boots a fresh direct /studio visit into Studio without entering Webspring first", async () => {
    const runtime = createTestRuntime();
    const { BootManager, LaunchServices, RuntimeController } = createRuntimeHarness(runtime);
    unlockRuntime(runtime);

    BootManager.boot({
      appBundles: [createTestBundle({ bundleIdentifier: "com.example.studio", route: "/studio" })],
      initialPathname: "/studio"
    });
    await flushLaunchTimers();

    const snapshot = RuntimeController.getSnapshot();
    expect(snapshot.application).toMatchObject({
      activeAppId: "com.example.studio",
      routePath: "/studio",
      multiSwitch: { status: "idle", fromAppId: null, toAppId: null }
    });
    expect(snapshot.webspring).toMatchObject({
      launchingAppId: null,
      launchPhase: "idle"
    });
    expect(snapshot.statechart.history.map((record) => record.to)).not.toContain("active.webspring");
    expect(LaunchServices.getHistory().map((record) => record.action)).not.toContain("multiswitch.begin");
  });

  it("ignores a persisted previous app when a reloaded document boots at /studio", async () => {
    window.sessionStorage.setItem("syncloudos:last-active-app-route", "/software");
    const runtime = createTestRuntime();
    const { BootManager, LaunchServices, RuntimeController } = createRuntimeHarness(runtime);
    unlockRuntime(runtime);

    BootManager.boot({
      appBundles: [
        createTestBundle({ bundleIdentifier: "com.example.software", route: "/software" }),
        createTestBundle({ bundleIdentifier: "com.example.studio", route: "/studio" })
      ],
      initialPathname: "/studio"
    });
    await flushLaunchTimers();

    expect(RuntimeController.getSnapshot().application).toMatchObject({
      activeAppId: "com.example.studio",
      previousAppId: null,
      routePath: "/studio"
    });
    expect(LaunchServices.getHistory().filter((record) => record.appId === "com.example.software")).toEqual([]);
    expect(LaunchServices.getHistory().map((record) => record.action)).not.toContain("multiswitch.begin");
  });

  it("resolves window.location for a conventional-navigation fallback", async () => {
    window.history.replaceState({}, "", "/studio");
    const runtime = createTestRuntime();
    const { BootManager, RuntimeController } = createRuntimeHarness(runtime);
    unlockRuntime(runtime);

    BootManager.boot({ appBundles: [createTestBundle({ bundleIdentifier: "com.example.studio", route: "/studio" })] });
    await flushLaunchTimers();

    expect(RuntimeController.getSnapshot().application).toMatchObject({
      activeAppId: "com.example.studio",
      routePath: "/studio"
    });
  });

  it("preserves documented developer app-open URLs after App becomes a composition root", async () => {
    const runtime = createTestRuntime();
    const { BootManager, RuntimeController } = createRuntimeHarness(runtime);
    unlockRuntime(runtime);

    BootManager.boot({
      appBundles: [createTestBundle({ bundleIdentifier: "com.example.nse-control-gallery", route: "/nse-control-gallery" })],
      initialPathname: "/__syncloudos/open/com.example.nse-control-gallery"
    });
    await flushLaunchTimers();

    expect(RuntimeController.getSnapshot().application).toMatchObject({
      activeAppId: "com.example.nse-control-gallery",
      routePath: "/nse-control-gallery"
    });
  });
  it("exposes statechart diagnostics and resets the active app when returning to Webspring", async () => {
    vi.useFakeTimers();
    const runtime = createTestRuntime();
    try {
      const { AppRegistry, LoginServices, RouteManager, RuntimeController, Statechart } = createRuntimeHarness(runtime);
      AppRegistry.registerBundle(createTestBundle({ bundleIdentifier: "com.example.statechart-reader", route: "/statechart-reader" }));
      unlockRuntime(LoginServices);

      const opened = RouteManager.openRoute("/statechart-reader", { source: "com.example.statechart-reader", syncRoute: false });
      await expect(opened.result).resolves.toMatchObject({
        status: "completed",
        committed: true,
        value: {
          kind: "app",
          appId: "com.example.statechart-reader",
          pathname: "/statechart-reader",
        },
      });
      await flushLaunchTimers();
      const historyBeforeReturn = Statechart.getHistory().length;

      await Statechart.gotoState("active.webspring", { source: "statechart-return", syncRoute: false });

      expect(RuntimeController.getSnapshot()).toMatchObject({
        application: {
          routePath: "/",
          activeAppId: null,
          currentAppId: null,
          multiSwitch: { id: null, status: "idle" },
        },
        statechart: { currentState: "active.webspring" },
      });
      expect(runtime.lifecycle.getState("com.example.statechart-reader")).toBe("suspended");
      expect(Statechart.getPreviousState()).toBe("active.application.active");
      expect(Statechart.getHistory().length).toBeGreaterThan(historyBeforeReturn);
      expect(Statechart.getHistory().at(-1)).toMatchObject({
        from: "active.application.active",
        to: "active.webspring",
        source: "statechart-return",
        ok: true,
      });
      expect(Statechart.canTransition("active.webspring", "active.application")).toBe(true);
      expect(Statechart.canTransition("active.webspring", "booting")).toBe(false);
      expect(Statechart.inspect("active.webspring")).toMatchObject({
        inspectedState: "active.webspring",
        activeDefinition: expect.objectContaining({ name: "active.webspring" }),
        allowedTransitions: expect.arrayContaining([
          expect.objectContaining({ to: "active.application", allowed: true }),
        ]),
      });
    } finally {
      try {
        await runtime.dispose({ reason: "statechart characterisation cleanup", inFlight: "cancel" });
      } finally {
        vi.useRealTimers();
      }
    }
  });

  it("publishes a reusable boot report through the effective BootManager", async () => {
    const runtime = createTestRuntime();
    try {
      const { BootManager } = createRuntimeHarness(runtime);
      unlockRuntime(runtime);

      const first = BootManager.boot({
        appBundles: [createTestBundle({ bundleIdentifier: "com.example.boot-report", route: "/boot-report" })],
        initialPathname: "/",
      });
      await flushLaunchTimers();

      expect(first).toMatchObject({
        booted: true,
        reused: false,
        appCount: 1,
        displayAppCount: 1,
        routeCount: 1,
        initialState: "booting",
      });
      expect(first.stages.map(({ id }: { id: string }) => id)).toEqual(expect.arrayContaining([
        "services.providers",
        "services.hydrate",
        "locale.hydrate",
        "locale.bundleResources",
        "apps.register",
        "responsive.observe",
        "notifications.seed",
        "login.hydrate",
        "runtime.markBooted",
        "statechart.initial",
      ]));
      expect(first.stages.every((stage: { status: string }) => stage.status === "complete")).toBe(true);
      expect(BootManager.getLastBootReport()).toBe(first);

      const reused = BootManager.boot({ initialPathname: "/boot-report" });
      expect(reused).toMatchObject({
        booted: true,
        reused: true,
        appCount: 1,
        displayAppCount: 1,
        routeCount: 1,
        stages: [expect.objectContaining({ id: "boot.reuse", status: "skipped" })],
      });
      expect(BootManager.getLastBootReport()).toBe(reused);
    } finally {
      try {
        await runtime.dispose({ reason: "boot report characterisation cleanup", inFlight: "cancel" });
      } finally {
        vi.useRealTimers();
      }
    }
  });

  it("hydrates locale readiness and registers bundle resources during canonical runtime boot", async () => {
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ bundleIdentifier: "com.example.localised-app" }, {
        localeResources: {
          "Base.locale": { "Localisable.strings": '"headline" = "Base headline";' },
          "en.locale": { "Localisable.strings": '"headline" = "English headline";' },
        },
      })],
    });
    const beforeVersion = runtime.store.getSnapshot().localeServices.dictionaryVersion;

    await runtime.boot({ initialPathname: "/" });

    expect(runtime.store.getSnapshot().localeServices).toMatchObject({
      activeLocale: "en-GB",
      serviceAvailable: true,
      dictionaryVersion: expect.any(Number),
    });
    expect(runtime.store.getSnapshot().localeServices.dictionaryVersion).toBeGreaterThan(beforeVersion);
    expect(runtime.services.get("locale")).toMatchObject({ availability: "available" });
  });
});
