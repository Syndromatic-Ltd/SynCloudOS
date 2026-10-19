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

import { describe, expect, it, vi } from "vitest";
import { createTestRuntime, createTestRuntimeEnvironment, createTestBundle, createTestManifest, flushLaunchTimers, flushMultiSwitchLaunch, createRuntimeHarness, unlockRuntime } from "./helpers";
import { createBrowserRoutePlatform } from "../../src/SynCloudOS/PlatformAdapters/BrowserRoutePlatform";
import { choreographyTimings } from "../../src/FX/AnimationFX/choreographyTimings";


describe("RouteManager and LaunchServices route/launch contracts", () => {
  it("returns the public route-not-found failure for unregistered deep links", async () => {
    const { AppRegistry, RouteManager } = createRuntimeHarness(createTestRuntime());
    AppRegistry.register(createTestManifest({ id: "current-app", route: "/current-app" }));
    const retiredRoutes = [
      "/about-classic",
      "/__syncloudos/atmo-refresh",
      "/contact",
      "/products",
      "/software-classic",
    ];

    for (const route of retiredRoutes) {
      expect(RouteManager.resolveRoute(route), route).toMatchObject({ kind: "notFound", pathname: route });
      await expect(RouteManager.openRoute(route, { source: "retired-app-regression", syncRoute: false }).result, route)
        .resolves.toMatchObject({
          status: "failed",
          committed: false,
          error: { code: "route-not-found" },
        });
    }
  });

  it("keeps the Webspring return watchdog beyond healthy shell motion", () => {
    expect(choreographyTimings.webspringReturnFallbackMs).toBe(2200);
    expect(choreographyTimings.webspringReturnFallbackMs).toBeGreaterThan(
      0.1 * 1000 + 8 * 0.075 * 1000 + 1000,
    );
  });

  it("syncs browser routes by full href and supports replace without duplicate popstate", () => {
    const platform = createBrowserRoutePlatform(createTestRuntimeEnvironment());
    const first = platform.syncRoute("/journal?draft=1#top");

    expect(first).toMatchObject({
      changed: true,
      replaced: false,
      dispatchedPopState: true,
      browserHref: "/journal?draft=1#top",
      pathname: "/journal"
    });
    expect(window.location.pathname).toBe("/journal");
    expect(window.location.search).toBe("?draft=1");
    expect(window.location.hash).toBe("#top");
    expect(window.history.pushState).toHaveBeenCalledTimes(1);
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1);

    const duplicate = platform.syncRoute("/journal?draft=1#top");

    expect(duplicate).toMatchObject({
      changed: false,
      dispatchedPopState: false
    });
    expect(window.history.pushState).toHaveBeenCalledTimes(1);
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1);

    const replaced = platform.syncRoute("/journal?draft=2#top", { replace: true, dispatchPopState: false });

    expect(replaced).toMatchObject({
      changed: true,
      replaced: true,
      dispatchedPopState: false,
      browserHref: "/journal?draft=2#top"
    });
    expect(window.history.replaceState).toHaveBeenCalledTimes(1);
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it("normalizes same-origin browser sync input while preserving its query and fragment", () => {
    window.history.replaceState({}, "", "/");
    const platform = createBrowserRoutePlatform(createTestRuntimeEnvironment());

    const result = platform.syncRoute(`${window.location.origin}/Studio/?folder=nse#selected`);

    expect(result).toMatchObject({
      changed: true,
      browserHref: "/studio?folder=nse#selected",
      pathname: "/studio",
    });
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe("/studio?folder=nse#selected");
  });

  it("keeps internal routes path-based and cross-origin URLs href-based", async () => {
    const { AppRegistry, RouteManager } = createRuntimeHarness(createTestRuntime());
    AppRegistry.registerMany([
      createTestManifest({ id: "portfolio", route: "/portfolio" }),
      createTestManifest({
        id: "external-portfolio",
        route: "https://docs.example.com/portfolio",
        type: "external"
      })
    ]);

    expect(RouteManager.resolveRoute("/portfolio")).toMatchObject({
      kind: "app",
      pathname: "/portfolio",
      matchMode: "path",
      app: expect.objectContaining({ id: "portfolio" })
    });

    expect(RouteManager.resolveRoute("http://127.0.0.1:5173/portfolio?from=test#intro")).toMatchObject({
      kind: "app",
      pathname: "/portfolio",
      matchMode: "path",
      app: expect.objectContaining({ id: "portfolio" }),
      diagnostics: expect.objectContaining({ routeableInternally: true })
    });

    expect(RouteManager.resolveRoute("https://docs.example.com/portfolio/")).toMatchObject({
      kind: "external",
      pathname: "/portfolio",
      matchMode: "href",
      canonicalHref: "https://docs.example.com/portfolio",
      app: expect.objectContaining({ id: "external-portfolio" }),
      diagnostics: expect.objectContaining({
        isCrossOrigin: true,
        routeableInternally: false,
        externalRouteCandidate: true
      })
    });

    expect(RouteManager.resolveRoute("https://unregistered.example.com/portfolio")).toMatchObject({
      kind: "notFound",
      pathname: "/portfolio",
      matchMode: "href",
      diagnostics: expect.objectContaining({
        isCrossOrigin: true,
        routeableInternally: false
      })
    });
  });

  it("does not normalize unsafe schemes into internal routes", async () => {
    const { AppRegistry, RouteManager } = createRuntimeHarness(createTestRuntime());
    AppRegistry.register(createTestManifest({ id: "portfolio", route: "/portfolio" }));

    const resolution = RouteManager.resolveRoute("javascript:/portfolio");

    expect(resolution).toMatchObject({
      kind: "notFound",
      matchMode: "none",
      diagnostics: expect.objectContaining({
        isUnsafeScheme: true,
        routeableInternally: false
      })
    });
    expect(RouteManager.explainRoute("javascript:/portfolio")).toMatchObject({
      diagnostics: expect.objectContaining({ isUnsafeScheme: true }),
      warnings: expect.arrayContaining([expect.stringContaining("Unsafe")])
    });
  });

  it("adds route diagnostics without dropping existing route-table fields", async () => {
    const { AppRegistry, RouteManager } = createRuntimeHarness(createTestRuntime());
    AppRegistry.registerMany([
      createTestManifest({ id: "studio", route: "/studio" }),
      createTestManifest({ id: "github", route: "https://github.com/syndromatic", type: "external" })
    ]);

    expect(RouteManager.getRouteTable()).toEqual([
      expect.objectContaining({
        appId: "studio",
        packageName: "Studio.app",
        route: "/studio",
        normalizedRoute: "/studio",
        visible: true,
        type: "internal",
        matchMode: "path",
        routeableInternally: true,
        diagnostics: expect.objectContaining({ matchMode: "path" })
      }),
      expect.objectContaining({
        appId: "github",
        packageName: "Github.app",
        route: "https://github.com/syndromatic",
        normalizedRoute: "/syndromatic",
        visible: true,
        type: "external",
        matchMode: "href",
        canonicalHref: "https://github.com/syndromatic",
        diagnostics: expect.objectContaining({ matchMode: "href" })
      })
    ]);
  });
  it("keeps registration history and route lookups coherent on the effective runtime", async () => {
    const runtime = createTestRuntime();
    try {
      const { AppRegistry, RouteManager } = createRuntimeHarness(runtime);
      const historyBefore = AppRegistry.getRegistrationHistory().length;
      const registered = AppRegistry.register(createTestManifest({ id: "route-reader", route: "/route-reader" }));

      expect(registered).toMatchObject({ id: "route-reader", route: "/route-reader" });
      expect(AppRegistry.getRegistrationHistory()).toHaveLength(historyBefore + 1);
      expect(AppRegistry.getRegistrationHistory().at(-1)).toMatchObject({
        appId: "route-reader",
        action: "register",
        result: "accepted",
        route: "/route-reader",
      });
      expect(RouteManager.getAppForRoute("/route-reader")).toMatchObject({ id: "route-reader" });
      expect(RouteManager.getRouteForApp("route-reader")).toBe("/route-reader");
    } finally {
      try {
        await runtime.dispose({ reason: "route registration characterisation cleanup", inFlight: "cancel" });
      } finally {
        vi.useRealTimers();
      }
    }
  });

  it("keeps canonical route normalisation and history readers coherent after an open operation", async () => {
    vi.useFakeTimers();
    const runtime = createTestRuntime();
    try {
      const { AppRegistry, LoginServices, RouteManager } = createRuntimeHarness(runtime);
      AppRegistry.registerBundle(createTestBundle({ id: "route-readers", route: "/route-readers" }));
      const requestedPath = "/ROUTE-READERS/?tab=overview#notes";
      const normalized = RouteManager.normalizeRoutePath(requestedPath);

      expect(normalized).toMatchObject({
        pathname: "/route-readers",
        search: "?tab=overview",
        hash: "#notes",
        matchMode: "path",
      });
      expect(RouteManager.getRouteForApp("route-readers")).toBe("/route-readers");

      unlockRuntime(LoginServices);
      const operation = RouteManager.openRoute(requestedPath, { source: "route-reader", syncRoute: false });
      await expect(operation.result).resolves.toMatchObject({
        status: "completed",
        committed: true,
        value: {
          kind: "app",
          appId: "route-readers",
          pathname: "/route-readers",
        },
      });
      await flushLaunchTimers();

      expect(RouteManager.getHistory()).toEqual([
        expect.objectContaining({
          action: "open",
          requestedPath,
          pathname: "/route-readers",
          kind: "app",
          appId: "route-readers",
        }),
      ]);
      expect(RouteManager.getHistory(1)).toHaveLength(1);
      RouteManager.clearHistory();
      expect(RouteManager.getHistory()).toEqual([]);
    } finally {
      try {
        await runtime.dispose({ reason: "route operation characterisation cleanup", inFlight: "cancel" });
      } finally {
        vi.useRealTimers();
      }
    }
  });

  it("captures a canonical app launch error when route preloading fails before lifecycle launch", async () => {
    const runtime = createTestRuntime();
    try {
      const { AppRegistry, LoginServices, RouteManager } = createRuntimeHarness(runtime);
      AppRegistry.registerBundle(createTestBundle(
        { id: "broken-route", route: "/broken-route", policy: { public: true } },
        { loadModule: async () => { throw new Error("fixture module unavailable"); } },
      ));
      unlockRuntime(LoginServices);

      await expect(RouteManager.openRoute("/broken-route", { source: "route-preload-failure", syncRoute: false }).result)
        .resolves.toMatchObject({ status: "failed", committed: false });

      expect(runtime.errors.getHistory().filter((error) => error.code === "APP_LAUNCH_FAILED"))
        .toEqual([
          expect.objectContaining({
            code: "APP_LAUNCH_FAILED",
            appId: "broken-route",
            packageName: "BrokenRoute.app",
            title: "Webspring could not open Broken Route.",
            message: "SynCloudOS could not load the requested content.",
          }),
        ]);
    } finally {
      await runtime.dispose({ reason: "route preload failure cleanup", inFlight: "cancel" });
    }
  });

  it("keeps launch queue inspection and runtime launch reporting coherent", async () => {
    const runtime = createTestRuntime();
    try {
      const { AppRegistry, LaunchServices } = createRuntimeHarness(runtime);
      AppRegistry.register(createTestManifest({ id: "queued-report", route: "/queued-report" }));

      const queued = LaunchServices.queueLaunch("queued-report", { hold: true, source: "developer" });
      expect(queued).toMatchObject({ appId: "queued-report" });

      const inspection = LaunchServices.inspect();
      expect(inspection).toMatchObject({
        active: null,
        queued: [expect.objectContaining({ appId: "queued-report" })],
        deferred: [],
        history: expect.arrayContaining([
          expect.objectContaining({ action: "queued", appId: "queued-report" }),
        ]),
      });

      const report = runtime.inspector.getRuntimeReport();
      expect(report.launch).toMatchObject({
        queue: expect.objectContaining({
          active: null,
          queued: [expect.objectContaining({ appId: "queued-report" })],
          deferred: [],
        }),
        active: null,
        queued: [expect.objectContaining({ appId: "queued-report" })],
        deferred: [],
        history: expect.arrayContaining([
          expect.objectContaining({ action: "queued", appId: "queued-report" }),
        ]),
        report: expect.objectContaining({
          active: null,
          queuedCount: 1,
          deferredCount: 0,
          historyCount: expect.any(Number),
        }),
      });
    } finally {
      try {
        await runtime.dispose({ reason: "launch inspection characterisation cleanup", inFlight: "cancel" });
      } finally {
        vi.useRealTimers();
      }
    }
  });
  it("processes idle queued launches immediately unless held and records queue history", async () => {
    vi.useFakeTimers();
    const runtime = createTestRuntime();
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    const { AppRegistry, LaunchServices, PolicyKit, WindowManager } = createRuntimeHarness(runtime);
    PolicyKit.setAccessMode("public");
    AppRegistry.registerBundle(createTestBundle({ id: "queue-now", route: "/queue-now", policy: { public: true } }));

    const queued = LaunchServices.queueLaunch("queue-now", { source: "developer" });

    expect(queued).toMatchObject({ appId: "queue-now", attempt: 1 });
    expect(LaunchServices.inspect()).toMatchObject({
      active: expect.objectContaining({ appId: "queue-now" }),
      queued: []
    });

    await flushLaunchTimers();

    expect(WindowManager.list()).toEqual([]);
    expect(LaunchServices.getHistory().map((record) => record.action)).toEqual(
      expect.arrayContaining(["queued", "started", "complete"])
    );
  });

  it("holds queued launches when requested", async () => {
    const { AppRegistry, LaunchServices } = createRuntimeHarness(createTestRuntime());
    AppRegistry.register(createTestManifest({ id: "held-app", route: "/held-app", policy: { public: true } }));

    const queued = LaunchServices.queueLaunch("held-app", { hold: true, source: "developer" });

    expect(queued).toMatchObject({ appId: "held-app", attempt: 1 });
    expect(LaunchServices.inspect()).toMatchObject({
      active: null,
      queued: [expect.objectContaining({ appId: "held-app" })]
    });
  });

  it("explains external apps and records external launch history", async () => {
    const { AppRegistry, LaunchServices } = createRuntimeHarness(createTestRuntime());
    AppRegistry.register(createTestManifest({ id: "github", route: "https://github.com/syndromatic", type: "external" }));

    expect(LaunchServices.explainExternalApp("github")).toMatchObject({
      canOpen: true,
      code: "READY",
      canonicalHref: "https://github.com/syndromatic"
    });

    expect(LaunchServices.openExternalApp("github", { source: "route" })).toBe(true);
    expect(window.open).toHaveBeenCalledWith("https://github.com/syndromatic", "_blank", "noopener,noreferrer");
    expect(LaunchServices.getHistory().at(-1)).toMatchObject({
      action: "external.opened",
      appId: "github",
      href: "https://github.com/syndromatic"
    });
  });

  it("preloads apps without opening windows", async () => {
    vi.useFakeTimers();
    const { AppRegistry, LaunchServices, LoginServices, PolicyKit, WindowManager } = createRuntimeHarness(createTestRuntime());
    PolicyKit.setAccessMode("public");
    unlockRuntime(LoginServices);
    AppRegistry.registerBundle(createTestBundle({ id: "preload-me", route: "/preload-me", policy: { public: true } }));

    const preload = LaunchServices.preloadApp("preload-me", { source: "developer" });
    await vi.advanceTimersByTimeAsync(80);
    const manager = await preload;

    expect(manager?.getState()).toBe("ready");
    expect(WindowManager.list()).toEqual([]);
    expect(LaunchServices.getHistory().map((record) => record.action)).toEqual(
      expect.arrayContaining(["preload.requested", "preload.complete"])
    );
  });

  it("retries a failed launch request from launch history", async () => {
    vi.useFakeTimers();
    const { AppRegistry, LaunchServices, LoginServices, PolicyKit, WindowManager } = createRuntimeHarness(createTestRuntime());
    PolicyKit.setAccessMode("webspringVisibleAppProtected");
    AppRegistry.registerBundle(createTestBundle({ id: "retry-me", route: "/retry-me" }));

    expect(LaunchServices.openApp("retry-me", { source: "developer" })).toBeNull();
    expect(LaunchServices.getHistory().map((record) => record.action)).toContain("failed");

    unlockRuntime(LoginServices);
    const manager = LaunchServices.retryLaunch("retry-me", { source: "developer" });
    await flushLaunchTimers();

    expect(manager?.getState()).toBe("active");
    expect(WindowManager.list()).toEqual([]);
    expect(LaunchServices.getHistory().map((record) => record.action)).toEqual(
      expect.arrayContaining(["retry.requested", "complete"])
    );
  });

  it("records route-aware MultiSwitch transitions without returning through Webspring", async () => {
    vi.useFakeTimers();
    const { AppRegistry, LaunchServices, LoginServices, RouteManager, RuntimeController, Statechart, WindowManager } = createRuntimeHarness(createTestRuntime());
    AppRegistry.registerMany([
      createTestBundle({ id: "journal", route: "/journal" }),
      createTestBundle({ id: "studio", route: "/studio" })
    ]);
    unlockRuntime(LoginServices);
    Statechart.gotoState("active.webspring", { source: "test" });

    RouteManager.openRoute("/journal");
    await flushLaunchTimers();
    const historyBeforeSwitch = RuntimeController.getSnapshot().statechart.history.length;

    RouteManager.openRoute("/studio");
    await flushMultiSwitchLaunch();

    const switchingSnapshot = RuntimeController.getSnapshot();
    expect(switchingSnapshot.application.multiSwitch).toMatchObject({
      status: "switching",
      fromAppId: "journal",
      toAppId: "studio",
      fromRoute: "/journal",
      toRoute: "/studio",
      source: "route"
    });
    expect(switchingSnapshot.application.activeAppId).toBe("studio");
    expect(WindowManager.list()).toEqual([]);
    expect(LaunchServices.getHistory().map((record) => record.action)).toContain("multiswitch.begin");
    expect(
      switchingSnapshot.statechart.history
        .slice(historyBeforeSwitch)
        .map((record) => record.to)
    ).not.toContain("active.webspring");

    await vi.advanceTimersByTimeAsync(900);
    expect(RuntimeController.getSnapshot().application.multiSwitch).toMatchObject({
      status: "idle",
      fromAppId: "journal",
      toAppId: "studio"
    });
    expect(WindowManager.list()).toEqual([]);
    expect(AppRegistry.getApp("journal")).toBeTruthy();
    expect(LaunchServices.getHistory().map((record) => record.action)).toContain("multiswitch.complete");
  });

  it("publishes MultiSwitch ownership before the lifecycle commit replaces the active app", async () => {
    vi.useFakeTimers();
    const { AppRegistry, LoginServices, RouteManager, RuntimeController, Statechart } = createRuntimeHarness(createTestRuntime());
    AppRegistry.registerMany([
      createTestBundle({ id: "journal", route: "/journal" }),
      createTestBundle({ id: "studio", route: "/studio" }),
    ]);
    unlockRuntime(LoginServices);
    Statechart.gotoState("active.webspring", { source: "test" });
    RouteManager.openRoute("/journal");
    await flushLaunchTimers();

    const observed: Array<{ activeAppId: string | null; status: string; fromAppId: string | null; toAppId: string | null }> = [];
    const unsubscribe = RuntimeController.subscribe(() => {
      const snapshot = RuntimeController.getSnapshot();
      observed.push({
        activeAppId: snapshot.application.activeAppId,
        status: snapshot.application.multiSwitch.status,
        fromAppId: snapshot.application.multiSwitch.fromAppId,
        toAppId: snapshot.application.multiSwitch.toAppId,
      });
    });
    try {
      RouteManager.openRoute("/studio");
      await flushMultiSwitchLaunch();
    } finally {
      unsubscribe();
    }

    const firstStudio = observed.find((snapshot) => snapshot.activeAppId === "studio");
    expect(firstStudio).toMatchObject({
      activeAppId: "studio",
      status: "switching",
      fromAppId: "journal",
      toAppId: "studio",
    });
    expect(observed.some((snapshot) => snapshot.activeAppId === "studio" && snapshot.status === "idle")).toBe(false);
  });

  it("does not let the MultiSwitch watchdog settle before the first presentation frame", async () => {
    vi.useFakeTimers();
    const environment = createTestRuntimeEnvironment();
    const heldPresentationFrames: Array<(timestamp: number) => void> = [];
    environment.requestAnimationFrame.mockImplementation((callback) => {
      heldPresentationFrames.push(callback);
      return heldPresentationFrames.length;
    });
    const { AppRegistry, LoginServices, RouteManager, RuntimeController, Statechart } = createRuntimeHarness(createTestRuntime({ environment }));
    AppRegistry.registerMany([
      createTestBundle({ id: "journal", route: "/journal" }),
      createTestBundle({ id: "studio", route: "/studio" }),
    ]);
    unlockRuntime(LoginServices);
    Statechart.gotoState("active.webspring", { source: "test" });

    RouteManager.openRoute("/journal");
    await flushLaunchTimers();
    RouteManager.openRoute("/studio");
    await flushMultiSwitchLaunch();

    expect(RuntimeController.getSnapshot().application.multiSwitch).toMatchObject({
      status: "switching",
      fromAppId: "journal",
      toAppId: "studio",
    });
    await vi.advanceTimersByTimeAsync(choreographyTimings.multiSwitchSettleFallbackMs);
    expect(RuntimeController.getSnapshot().application.multiSwitch.status).toBe("switching");
    expect(heldPresentationFrames).toHaveLength(1);

    heldPresentationFrames[0](Date.now());
    expect(heldPresentationFrames).toHaveLength(2);
    heldPresentationFrames[1](Date.now());
    await vi.advanceTimersByTimeAsync(choreographyTimings.multiSwitchSettleFallbackMs - 1);
    expect(RuntimeController.getSnapshot().application.multiSwitch.status).toBe("switching");
    await vi.advanceTimersByTimeAsync(1);
    expect(RuntimeController.getSnapshot().application.multiSwitch.status).toBe("idle");
  });

  it("keeps a direct LaunchServices MultiSwitch live until presentation can begin", async () => {
    vi.useFakeTimers();
    const environment = createTestRuntimeEnvironment();
    const heldPresentationFrames: Array<(timestamp: number) => void> = [];
    environment.requestAnimationFrame.mockImplementation((callback) => {
      heldPresentationFrames.push(callback);
      return heldPresentationFrames.length;
    });
    const { AppRegistry, LaunchServices, LoginServices, RuntimeController, Statechart } = createRuntimeHarness(createTestRuntime({ environment }));
    AppRegistry.registerMany([
      createTestBundle({ id: "journal", route: "/journal" }),
      createTestBundle({ id: "studio", route: "/studio" }),
    ]);
    unlockRuntime(LoginServices);
    Statechart.gotoState("active.webspring", { source: "test" });

    LaunchServices.openApp("journal", { source: "developer" });
    await flushLaunchTimers();
    LaunchServices.openApp("studio", { source: "developer" });
    await flushMultiSwitchLaunch();

    expect(RuntimeController.getSnapshot().application.multiSwitch).toMatchObject({
      status: "switching",
      fromAppId: "journal",
      toAppId: "studio",
    });
    await vi.advanceTimersByTimeAsync(choreographyTimings.multiSwitchSettleFallbackMs);
    expect(RuntimeController.getSnapshot().application.multiSwitch.status).toBe("switching");
    expect(heldPresentationFrames.length).toBeGreaterThan(0);
  });

  it("accepts current MultiSwitch animation completion and ignores stale switch completions", async () => {
    vi.useFakeTimers();
    const { AppRegistry, LaunchServices, LoginServices, RouteManager, RuntimeController, Statechart, WindowManager } = createRuntimeHarness(createTestRuntime());
    AppRegistry.registerMany([
      createTestBundle({ id: "journal", route: "/journal" }),
      createTestBundle({ id: "studio", route: "/studio" })
    ]);
    unlockRuntime(LoginServices);
    Statechart.gotoState("active.webspring", { source: "test" });

    RouteManager.openRoute("/journal");
    await flushLaunchTimers();
    RouteManager.openRoute("/studio");
    await flushMultiSwitchLaunch();

    const switchId = RuntimeController.getSnapshot().application.multiSwitch.id;
    expect(switchId).toEqual(expect.any(String));
    expect(LaunchServices.completeMultiSwitch("stale-switch")).toBe(false);
    expect(RuntimeController.getSnapshot().application.multiSwitch).toMatchObject({
      id: switchId,
      status: "switching"
    });

    expect(LaunchServices.completeMultiSwitch(switchId ?? "")).toBe(true);
    expect(RuntimeController.getSnapshot().application.multiSwitch).toMatchObject({
      id: switchId,
      status: "idle",
      fromAppId: "journal",
      toAppId: "studio"
    });
    expect(WindowManager.list()).toEqual([]);
  });

  it("settles return only after every required role and ignores stale or duplicate callbacks", async () => {
    vi.useFakeTimers();
    const { RuntimeController, SynCloudOS } = createRuntimeHarness(createTestRuntime());

    const firstReturnId = SynCloudOS.WebspringChoreography.beginReturn("journal");
    await vi.advanceTimersByTimeAsync(100);
    const secondReturnId = SynCloudOS.WebspringChoreography.beginReturn("studio");

    expect(firstReturnId).not.toBe(secondReturnId);
    expect(SynCloudOS.WebspringChoreography.completeReturnRole(firstReturnId, "applicationExit")).toBe(false);
    expect(SynCloudOS.WebspringChoreography.completeReturnRole(secondReturnId, "applicationExit")).toBe(true);
    expect(SynCloudOS.WebspringChoreography.completeReturnRole(secondReturnId, "applicationExit")).toBe(false);

    expect(RuntimeController.getSnapshot().webspring).toMatchObject({
      launchPhase: "returning",
      returningAppId: "studio",
      returnTransitionId: secondReturnId
    });

    expect(SynCloudOS.WebspringChoreography.completeReturnRole(secondReturnId, "shellReturn")).toBe(true);
    expect(RuntimeController.getSnapshot().webspring).toMatchObject({
      launchPhase: "idle",
      returningAppId: null,
      returnTransitionId: null
    });
  });

  it("returns to Webspring through the guarded fallback when no animation completion arrives", async () => {
    vi.useFakeTimers();
    const { AppRegistry, LoginServices, RouteManager, RuntimeController, Statechart, SynCloudOS, WindowManager } = createRuntimeHarness(createTestRuntime());
    AppRegistry.register(createTestBundle({ id: "journal", route: "/journal" }));
    unlockRuntime(LoginServices);
    Statechart.gotoState("active.webspring", { source: "test" });

    RouteManager.openRoute("/journal");
    await flushLaunchTimers();
    expect(WindowManager.list()).toEqual([]);

    await Statechart.gotoState("active.webspring", { source: "test.return" });
    const returnTransitionId = RuntimeController.getSnapshot().webspring.returnTransitionId;

    expect(returnTransitionId).toEqual(expect.any(String));
    expect(RuntimeController.getSnapshot().webspring.launchPhase).toBe("returning");

    await vi.advanceTimersByTimeAsync(choreographyTimings.webspringReturnFallbackMs - 1);
    expect(RuntimeController.getSnapshot().webspring.launchPhase).toBe("returning");

    await vi.advanceTimersByTimeAsync(1);
    expect(RuntimeController.getSnapshot().webspring).toMatchObject({
      launchPhase: "idle",
      returningAppId: null,
      returnTransitionId: null
    });
    expect(
      SynCloudOS.EventBus.getHistory().find((event) =>
        event.type === "webspring.return.complete" &&
        event.payload.returnTransitionId === returnTransitionId
      )?.payload
    ).toMatchObject({
      completionSource: "fallback",
      completedRoles: [],
      outstandingRoles: ["applicationExit", "shellReturn"]
    });
  });

  it("rearms a stranded Webspring return fallback after module reload", async () => {
    vi.useFakeTimers();
    const { RuntimeController, WebspringChoreography, SynCloudOS } = createRuntimeHarness(createTestRuntime());
    const returnTransitionId = SynCloudOS.WebspringState.beginReturn("studio");

    expect(RuntimeController.getSnapshot().webspring).toMatchObject({
      launchPhase: "returning",
      returnTransitionId
    });
    expect(WebspringChoreography.restoreHotReturnFallback()).toBe(true);

    await vi.advanceTimersByTimeAsync(choreographyTimings.webspringReturnFallbackMs);

    expect(RuntimeController.getSnapshot().webspring).toMatchObject({
      launchPhase: "idle",
      returningAppId: null,
      returnTransitionId: null
    });
  });

  it("guards launch cover completion by launch request id", async () => {
    vi.useFakeTimers();
    const { AppRegistry, LaunchServices, LoginServices, RouteManager, RuntimeController, Statechart } = createRuntimeHarness(createTestRuntime());
    AppRegistry.register(createTestBundle({ id: "studio", route: "/studio" }));
    unlockRuntime(LoginServices);
    Statechart.gotoState("active.webspring", { source: "test" });

    RouteManager.openRoute("/studio");
    await flushLaunchTimers();

    const launchTransitionId = RuntimeController.getSnapshot().webspring.launchTransitionId;
    expect(launchTransitionId).toEqual(expect.any(String));
    expect(RuntimeController.getSnapshot().webspring.launchPhase).toBe("launching");
    expect(LaunchServices.completeLaunchCover("stale-launch", "studio")).toBe(false);
    expect(RuntimeController.getSnapshot().webspring.launchPhase).toBe("launching");

    expect(LaunchServices.completeLaunchCover(launchTransitionId ?? "", "studio")).toBe(true);
    expect(RuntimeController.getSnapshot().webspring.launchPhase).toBe("covered");
  });

  it("covers launch through the fallback ceiling when no animation completion arrives", async () => {
    vi.useFakeTimers();
    const { AppRegistry, LoginServices, RouteManager, RuntimeController, Statechart } = createRuntimeHarness(createTestRuntime());
    AppRegistry.register(createTestBundle({ id: "portfolio", route: "/portfolio" }));
    unlockRuntime(LoginServices);
    Statechart.gotoState("active.webspring", { source: "test" });

    RouteManager.openRoute("/portfolio");
    await flushLaunchTimers();

    await vi.advanceTimersByTimeAsync(choreographyTimings.webspringLaunchCoverFallbackMs + 20);
    expect(RuntimeController.getSnapshot().webspring.launchPhase).toBe("covered");
  });

  it("returns Webspring to idle when the covering app closes itself through lifecycle", async () => {
    vi.useFakeTimers();
    const { AppRegistry, Lifecycle, LoginServices, RouteManager, RuntimeController, Statechart, SynCloudOS, LaunchServices } = createRuntimeHarness(createTestRuntime());
    AppRegistry.register(createTestBundle({ id: "studio", route: "/studio" }));
    unlockRuntime(LoginServices);
    Statechart.gotoState("active.webspring", { source: "test" });

    RouteManager.openRoute("/studio");
    await flushLaunchTimers();
    expect(LaunchServices.completeLaunchCover(RuntimeController.getSnapshot().webspring.launchTransitionId ?? "", "studio")).toBe(true);
    expect(RuntimeController.getSnapshot().webspring.launchPhase).toBe("covered");

    await Lifecycle.close("studio").result;

    const returning = RuntimeController.getSnapshot().webspring;
    expect(returning).toMatchObject({ launchPhase: "returning", returningAppId: "studio", returnTransitionId: expect.any(String) });
    expect(SynCloudOS.WebspringChoreography.completeReturnRole(returning.returnTransitionId!, "applicationExit")).toBe(true);
    expect(SynCloudOS.WebspringChoreography.completeReturnRole(returning.returnTransitionId!, "shellReturn")).toBe(true);
    expect(RuntimeController.getSnapshot().webspring).toMatchObject({ launchPhase: "idle", returningAppId: null, returnTransitionId: null, isAnimating: false });
  });

  it("returns a deep-linked app to an idle Webspring when closed by route back", async () => {
    vi.useFakeTimers();
    const runtime = createTestRuntime();
    const { BootManager, RouteManager, RuntimeController } = createRuntimeHarness(runtime);
    unlockRuntime(runtime);
    BootManager.boot({ appBundles: [createTestBundle({ id: "studio", route: "/studio" })], initialPathname: "/studio" });
    await flushLaunchTimers();
    expect(RuntimeController.getSnapshot().application.activeAppId).toBe("studio");

    RouteManager.openRoute("/");
    await flushLaunchTimers();
    await vi.advanceTimersByTimeAsync(choreographyTimings.webspringReturnFallbackMs);

    expect(RuntimeController.getSnapshot().application.activeAppId).toBeNull();
    expect(RuntimeController.getSnapshot().webspring).toMatchObject({ launchPhase: "idle", returningAppId: null, returnTransitionId: null, isAnimating: false });
  });

  it("cancels an in-flight MultiSwitch transition before returning to Webspring", async () => {
    vi.useFakeTimers();
    const { AppRegistry, LoginServices, RouteManager, RuntimeController, Statechart, WindowManager } = createRuntimeHarness(createTestRuntime());
    AppRegistry.registerMany([
      createTestBundle({ id: "journal", route: "/journal" }),
      createTestBundle({ id: "publisher", route: "/publisher" })
    ]);
    unlockRuntime(LoginServices);
    Statechart.gotoState("active.webspring", { source: "test" });

    RouteManager.openRoute("/journal");
    await flushLaunchTimers();

    RouteManager.openRoute("/publisher");
    await flushMultiSwitchLaunch();

    expect(RuntimeController.getSnapshot().application.multiSwitch).toMatchObject({
      status: "switching",
      fromAppId: "journal",
      toAppId: "publisher"
    });

    await Statechart.gotoState("active.webspring", { source: "test.return" });

    expect(RuntimeController.getSnapshot().application.multiSwitch).toMatchObject({
      id: null,
      status: "idle",
      fromAppId: null,
      toAppId: null
    });
    expect(RuntimeController.getSnapshot().application.activeAppId).toBeNull();
    expect(RuntimeController.getSnapshot().application.routePath).toBe("/");
    expect(RuntimeController.getSnapshot().lifecycle).toMatchObject({
      journal: "suspended",
      publisher: "suspended"
    });
    expect(WindowManager.list()).toEqual([]);

    await vi.advanceTimersByTimeAsync(900);

    expect(RuntimeController.getSnapshot().application.multiSwitch).toMatchObject({
      id: null,
      status: "idle",
      fromAppId: null,
      toAppId: null
    });
    expect(WindowManager.list()).toEqual([]);
  });

  it("switches from About to hidden MemoJournal routes without replaying the Webspring launch", async () => {
    vi.useFakeTimers();
    const { AppRegistry, LoginServices, RouteManager, RuntimeController, Statechart, WindowManager } = createRuntimeHarness(createTestRuntime());
    AppRegistry.registerMany([
      createTestBundle({ id: "about", route: "/about" }),
      createTestBundle({ id: "memo-journal", route: "/memo-journal", webspring: { visible: false } })
    ]);
    unlockRuntime(LoginServices);
    Statechart.gotoState("active.webspring", { source: "test" });

    RouteManager.openRoute("/about");
    await flushLaunchTimers();
    const historyBeforeSwitch = RuntimeController.getSnapshot().statechart.history.length;

    RouteManager.openRoute("/memo-journal");
    await flushMultiSwitchLaunch();

    const switchingSnapshot = RuntimeController.getSnapshot();
    expect(switchingSnapshot.application.multiSwitch).toMatchObject({
      status: "switching",
      fromAppId: "about",
      toAppId: "memo-journal",
      fromRoute: "/about",
      toRoute: "/memo-journal",
      source: "route"
    });
    expect(switchingSnapshot.application.activeAppId).toBe("memo-journal");
    expect(switchingSnapshot.webspring.launchPhase).toBe("covered");
    expect(switchingSnapshot.webspring.launchingAppId).toBeNull();
    expect(WindowManager.list()).toEqual([]);
    expect(
      switchingSnapshot.statechart.history
        .slice(historyBeforeSwitch)
        .map((record) => record.to)
    ).not.toContain("active.webspring");

    await vi.advanceTimersByTimeAsync(900);
    expect(RuntimeController.getSnapshot().application.multiSwitch).toMatchObject({
      status: "idle",
      fromAppId: "about",
      toAppId: "memo-journal"
    });
    expect(WindowManager.list()).toEqual([]);
  });
});
