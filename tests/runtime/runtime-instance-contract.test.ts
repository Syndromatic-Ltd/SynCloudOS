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
import { createSynCloudOS } from "../../src/SynCloudOS/Runtime/createSynCloudOS";
import { createSynWare, createSynWareBundle } from "../../src/SynCloudOS/AppSDK/createSynWare";
import { defineSynWareRoutes } from "../../src/SynCloudOS/AppSDK/defineSynWareRoutes";
import {
  clearDefaultSynCloudOSRuntime,
  getDefaultApplicationDocuments,
  getDefaultDocumentStore,
  getDefaultSynCloudOSRuntime,
  setDefaultSynCloudOSRuntime,
} from "../../src/SynCloudOS/Runtime/defaultRuntime";
import { createTestBundle, createRuntimeHarness, createTestRuntime, createTestRuntimeEnvironment, flushLaunchTimers, flushMultiSwitchLaunch, unlockRuntime } from "./helpers";

describe("createSynCloudOS", () => {
  it("creates two explicit identities without installing listeners", () => {
    const firstEnvironment = createTestRuntimeEnvironment();
    const secondEnvironment = createTestRuntimeEnvironment();
    const first = createSynCloudOS({ id: "runtime:first", environment: firstEnvironment });
    const second = createSynCloudOS({ id: "runtime:second", environment: secondEnvironment });

    expect(first.runtimeId).toBe("runtime:first");
    expect(second.runtimeId).toBe("runtime:second");
    expect(first).not.toBe(second);
    expect(firstEnvironment.addWindowListener).not.toHaveBeenCalled();
    expect(secondEnvironment.addWindowListener).not.toHaveBeenCalled();
    expect(first.store.getSnapshot().runtimeId).toBe("runtime:first");
    expect(second.store.getSnapshot().runtimeId).toBe("runtime:second");
  });

  it("makes boot and disposal idempotent", async () => {
    const runtime = createSynCloudOS({
      id: "runtime:idempotent",
      environment: createTestRuntimeEnvironment(),
    });

    await expect(Promise.all([runtime.boot(), runtime.boot()])).resolves.toHaveLength(2);
    await expect(Promise.all([runtime.dispose("test"), runtime.dispose("test")]))
      .resolves.toEqual([
        expect.objectContaining({ status: "disposed", runtimeId: "runtime:idempotent" }),
        expect.objectContaining({ status: "disposed", runtimeId: "runtime:idempotent" }),
      ]);
  });

  it("keeps injected visualViewport geometry canonical when ambient browser dimensions disagree", async () => {
    const width = Object.getOwnPropertyDescriptor(window, "innerWidth");
    const height = Object.getOwnPropertyDescriptor(window, "innerHeight");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
    const runtime = createSynCloudOS({
      id: "runtime:compact-responsive-boot",
      environment: createTestRuntimeEnvironment(),
    });

    try {
      await runtime.boot({ initialPathname: "/" });
      expect(runtime.store.getSnapshot().responsive).toMatchObject({
        mode: "desktop",
        width: 1440,
        height: 900,
      });
      expect(runtime.presentationTraits.getSnapshot()).toMatchObject({
        contentBounds: { x: 0, y: 0, width: 1440, height: 900 },
        hostViewportBounds: { x: 0, y: 0, width: 1440, height: 900 },
        horizontalSizeClass: "wide",
      });
      expect(Object.isFrozen(runtime.presentationTraits.getSnapshot())).toBe(true);
    } finally {
      await runtime.dispose("test");
      if (width) Object.defineProperty(window, "innerWidth", width);
      if (height) Object.defineProperty(window, "innerHeight", height);
    }
  });

  it("keeps diagnostic exposure explicit and exclusive", () => {
    clearDefaultSynCloudOSRuntime();
    const first = createSynCloudOS({ id: "runtime:diagnostic-one", environment: createTestRuntimeEnvironment() });
    const second = createSynCloudOS({ id: "runtime:diagnostic-two", environment: createTestRuntimeEnvironment() });

    setDefaultSynCloudOSRuntime(first);
    expect(getDefaultSynCloudOSRuntime()).toBe(first);
    expect(getDefaultApplicationDocuments()).toBe(first.documents);
    expect(getDefaultDocumentStore()).toBe(first.documentStore);
    expect(() => setDefaultSynCloudOSRuntime(second)).toThrow(/already set/);
    clearDefaultSynCloudOSRuntime(second);
    expect(getDefaultSynCloudOSRuntime()).toBe(first);
    clearDefaultSynCloudOSRuntime(first);
    expect(getDefaultSynCloudOSRuntime()).toBeNull();
    expect(getDefaultApplicationDocuments()).toBeNull();
    expect(getDefaultDocumentStore()).toBeNull();
  });

  it("exposes only typed runtime ports to platform globals", () => {
    const environment = createTestRuntimeEnvironment();
    const runtime = createSynCloudOS({ id: "runtime:ports", environment });

    expect(runtime.runtimeId).toBe("runtime:ports");
    expect(runtime.signal).toBeInstanceOf(AbortSignal);
    expect(runtime.services.runtimeId).toBe(runtime.runtimeId);
    expect(runtime.policy.runtimeId).toBe(runtime.runtimeId);
    expect(runtime.bundles.runtimeId).toBe(runtime.runtimeId);
    expect(runtime.events.runtimeId).toBe(runtime.runtimeId);
    expect(vi.isMockFunction(environment.addWindowListener)).toBe(true);
  });



  it("boots a registered query-and-hash URL through the canonical runtime boot path", async () => {
    vi.useFakeTimers();
    const requestedPath = "/studio?folder=nse#selected";
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ bundleIdentifier: "com.example.studio", route: "/studio" })],
    });
    unlockRuntime(runtime);

    try {
      const bootPromise = runtime.boot({ initialPathname: requestedPath });
      await Promise.resolve();
      await flushLaunchTimers();
      await expect(bootPromise).resolves.toMatchObject({
        runtimeId: runtime.runtimeId,
        status: "completed",
        initialPathname: requestedPath,
      });
      expect(runtime.routes.resolveRoute(requestedPath)).toMatchObject({
        kind: "app",
        pathname: "/studio",
      });
      expect(runtime.store.getSnapshot().application).toMatchObject({
        activeAppId: "com.example.studio",
        routePath: "/studio",
      });
    } finally {
      await runtime.dispose("query boot test");
      vi.useRealTimers();
    }
  });

  it("follows the canonical retained redirect successor during initial route boot", async () => {
    vi.useFakeTimers();
    const routes = defineSynWareRoutes({
      id: "boot.redirect",
      routes: [{
        name: "com.example.music",
        path: "",
        children: [
          { name: "music.index", index: true, redirect: { name: "music.home" } },
          { name: "music.home", path: "home" },
        ],
      }],
    } as const);
    const definition = createSynWare({
      manifest: {
        schemaVersion: 1,
        bundleIdentifier: "com.example.music",
        version: "1.0.0",
        displayName: "Music",
        routes: [{ path: "/music", primary: true, match: "prefix" }],
        permissions: ["app.open.public"],
      },
      root: () => null,
      routes,
    });
    const runtime = createTestRuntime({ initialBundles: [createSynWareBundle(definition)] });
    unlockRuntime(runtime);

    try {
      const bootPromise = runtime.boot({ initialPathname: "/music" });
      await Promise.resolve();
      await flushLaunchTimers();

      await expect(bootPromise).resolves.toMatchObject({
        runtimeId: runtime.runtimeId,
        status: "completed",
        initialPathname: "/music",
      });
      expect(runtime.store.getSnapshot().application).toMatchObject({
        activeAppId: "com.example.music",
        routePath: "/music/home",
      });
      expect(runtime.routes.inspectTransitions()).toEqual(expect.arrayContaining([
        expect.objectContaining({ appId: "com.example.music", outcome: "redirected", committed: false }),
        expect.objectContaining({ appId: "com.example.music", outcome: "settled", committed: true }),
      ]));
    } finally {
      await runtime.dispose("redirect boot test");
      vi.useRealTimers();
    }
  });

  it("keeps a guard-blocked initial application route as a nonfatal boot outcome", async () => {
    const guard = vi.fn(() => ({ outcome: "block", reason: "fixture denied artist" } as const));
    const routes = defineSynWareRoutes({
      id: "boot.guard-block",
      routes: [{
        name: "com.example.music",
        path: "",
        children: [{
          name: "music.artist",
          path: "artist/:artistId",
          beforeEnter: guard,
          children: [{ name: "music.artist.album", path: "album/:albumId" }],
        }],
      }],
    } as const);
    const definition = createSynWare({
      manifest: {
        schemaVersion: 1,
        bundleIdentifier: "com.example.music",
        version: "1.0.0",
        displayName: "Music",
        routes: [{ path: "/music", primary: true, match: "prefix" }],
        permissions: ["app.open.public"],
      },
      root: () => null,
      routes,
    });
    const runtime = createTestRuntime({ initialBundles: [createSynWareBundle(definition)] });
    unlockRuntime(runtime);
    const launch = vi.spyOn(runtime.launchServices, "openApp");

    try {
      await expect(runtime.boot({ initialPathname: "/music/artist/justice/album/cross" }))
        .resolves.toMatchObject({
          runtimeId: runtime.runtimeId,
          status: "completed",
          initialPathname: "/music/artist/justice/album/cross",
        });
      expect(guard).toHaveBeenCalledTimes(1);
      expect(launch).not.toHaveBeenCalled();
      expect(runtime.store.getSnapshot()).toMatchObject({
        booted: true,
        application: { activeAppId: null, routePath: "/" },
        statechart: { currentState: "active.webspring" },
      });
      expect(runtime.routes.inspectTransitions()).toEqual(expect.arrayContaining([
        expect.objectContaining({ appId: "com.example.music", outcome: "blocked", committed: false }),
      ]));
    } finally {
      await runtime.dispose("guard-blocked boot test");
    }
  });

  it("owns MultiSwitch state and completion within the runtime instance", async () => {
    vi.useFakeTimers();
    const runtime = createTestRuntime({ id: "runtime:multiswitch" });
    const { AppRegistry, LaunchServices, LoginServices, Statechart } = createRuntimeHarness(runtime);

    try {
      AppRegistry.registerMany([
        createTestBundle({ bundleIdentifier: "com.example.journal", route: "/journal" }),
        createTestBundle({ bundleIdentifier: "com.example.studio", route: "/studio" }),
      ]);
      unlockRuntime(LoginServices);
      Statechart.gotoState("active.webspring", { source: "runtime-characterisation" });

      const sourceManager = LaunchServices.openApp("com.example.journal", { source: "runtime-characterisation" });
      expect(sourceManager).not.toBeNull();
      await flushLaunchTimers();
      expect(runtime.store.getSnapshot().application.activeAppId).toBe("com.example.journal");

      const targetManager = LaunchServices.openApp("com.example.studio", { source: "runtime-characterisation" });
      expect(targetManager).not.toBeNull();
      await flushMultiSwitchLaunch();

      const switching = runtime.store.getSnapshot().application.multiSwitch;
      expect(switching).toMatchObject({
        status: "switching",
        fromAppId: "com.example.journal",
        toAppId: "com.example.studio",
        fromRoute: "/journal",
        toRoute: "/studio",
      });
      expect(runtime.windows.list()).toEqual([]);

      expect(runtime.launchServices.runtimeId).toBe(runtime.runtimeId);
      expect(runtime.launchServices.completeMultiSwitch(switching.id ?? "")).toBe(true);
      expect(runtime.store.getSnapshot().application.multiSwitch).toMatchObject({
        id: switching.id,
        status: "idle",
      });
      expect(runtime.windows.list()).toEqual([]);
    } finally {
      await runtime.dispose("MultiSwitch test");
      vi.useRealTimers();
    }
  });

  it("owns Webspring return role settlement and fallback within the runtime instance", async () => {
    vi.useFakeTimers();
    const runtime = createTestRuntime({ id: "runtime:return" });
    const { AppRegistry, LoginServices, Statechart } = createRuntimeHarness(runtime);

    try {
      AppRegistry.registerBundle(createTestBundle({ bundleIdentifier: "com.example.journal", route: "/journal" }));
      unlockRuntime(LoginServices);
      Statechart.gotoState("active.webspring", { source: "runtime-characterisation" });

      const launch = runtime.routes.openRoute("/journal", { source: "runtime-characterisation", syncRoute: false });
      await expect(launch.result).resolves.toMatchObject({ status: "completed", committed: true });
      await flushLaunchTimers();
      expect(runtime.store.getSnapshot().application.activeAppId).toBe("com.example.journal");

      const returnOperation = runtime.routes.openRoute("/", { source: "runtime-characterisation-return", syncRoute: false });
      await expect(returnOperation.result).resolves.toMatchObject({ status: "completed", committed: true });

      const returning = runtime.store.getSnapshot().webspring;
      expect(returning).toMatchObject({
        launchPhase: "returning",
        returningAppId: "com.example.journal",
        returnTransitionId: expect.any(String),
        isAnimating: true,
      });
      expect(runtime.windows.list()).toEqual([]);
      const returnTransitionId = returning.returnTransitionId ?? "";
      expect(runtime.webspring.completeReturnRole(returnTransitionId, "applicationExit")).toBe(true);
      expect(runtime.webspring.completeReturnRole(returnTransitionId, "shellReturn")).toBe(true);
      expect(runtime.store.getSnapshot().webspring).toMatchObject({
        launchPhase: "idle",
        returningAppId: null,
        returnTransitionId: null,
        isAnimating: false,
      });
      expect(runtime.events.getHistory().find((event) => event.type === "webspring.return.complete")?.payload)
        .toMatchObject({ completionSource: "animation", completedRoles: ["applicationExit", "shellReturn"] });
    } finally {
      await runtime.dispose("Webspring return test");
      vi.useRealTimers();
    }
  });

  it("cancels and awaits delayed identity boot before disposing runtime services", async () => {
    let releaseRead!: () => void;
    const heldRead = new Promise<void>((resolve) => { releaseRead = resolve; });
    const runtime = createSynCloudOS({
      id: "runtime:boot-dispose",
      environment: createTestRuntimeEnvironment(),
      identity: {
        sessionAdapter: {
          id: "delayed-identity",
          async read() {
            await heldRead;
            return { id: "session", subjectId: "person", state: "active", claims: {} };
          },
          subscribe: () => () => undefined,
          end: async () => undefined,
          dispose: async () => undefined,
        },
      },
    });
    const boot = runtime.boot({ initialPathname: "/" });
    await Promise.resolve();
    const disposal = runtime.dispose({ reason: "boot-race", inFlight: "cancel" });
    let disposalSettled = false;
    void disposal.then(() => { disposalSettled = true; });
    await Promise.resolve();
    expect(disposalSettled).toBe(false);

    releaseRead();
    await expect(boot).rejects.toThrow(/disposed|cancel/i);
    await expect(disposal).resolves.toMatchObject({ status: "disposed" });
    expect(runtime.store.getSnapshot().booted).toBe(false);
    expect(runtime.identity.session.getSnapshot()).toBeNull();
  });

  it("does not publish a delayed bundle or lifecycle mutation after disposal", async () => {
    let releaseBundle!: () => void;
    const heldBundle = new Promise<void>((resolve) => { releaseBundle = resolve; });
    const bundle = createTestBundle({
      bundleIdentifier: "com.example.studio",
      route: "/studio",
      loadModule: async () => {
        await heldBundle;
        return { default: () => null, lifecycleHooks: { launch: { did: () => undefined } } };
      },
    });
    const runtime = createTestRuntime({
      id: "runtime:bundle-dispose",
      initialBundles: [bundle],
    });
    runtime.apps.registerMany([bundle]);
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    const route = runtime.routes.openRoute("/studio");
    await Promise.resolve();
    const disposal = runtime.dispose({ reason: "bundle-race", inFlight: "cancel" });
    releaseBundle();

    await expect(route.result).resolves.toMatchObject({ status: "cancelled", committed: false });
    await expect(disposal).resolves.toMatchObject({ status: "disposed" });
    expect(runtime.bundles.getLoadedBundle("com.example.studio")).toBeNull();
    expect(runtime.errors.getHistory().filter((error) => error.code === "APP_LAUNCH_FAILED")).toEqual([]);
    expect(runtime.store.getSnapshot()).toMatchObject({
      application: { activeAppId: null, routePath: "/" },
      lifecycle: { "com.example.studio": "registered" },
    });
    expect(runtime.windows.list()).toEqual([]);
  });
  it("keeps effective errors, services, permissions, and app registry runtime-owned", async () => {
    const runtime = createTestRuntime({ id: "runtime:service-contract" });
    const { AppRegistry, PermissionManager, ServiceRegistry, SynCloudOS } = createRuntimeHarness(runtime);
    const ErrorManager = SynCloudOS.ErrorManager;

    try {
      expect(runtime.disposalState).toBe("running");
      expect(runtime.errors.runtimeId).toBe(runtime.runtimeId);
      expect(runtime.services.runtimeId).toBe(runtime.runtimeId);
      expect(runtime.permissions.runtimeId).toBe(runtime.runtimeId);
      expect(runtime.apps.runtimeId).toBe(runtime.runtimeId);
      expect(ErrorManager).toBe(runtime.errors);
      expect(ServiceRegistry).toBe(runtime.services);
      expect(PermissionManager).toBe(runtime.permissions);
      expect(AppRegistry).toBe(runtime.apps);
      const publicCapabilities = PermissionManager.getRoleCapabilities("public");
      const employeeCapabilities = PermissionManager.getRoleCapabilities("employee");
      expect(publicCapabilities).toContain("app.open.public");
      expect(employeeCapabilities).toContain("diagnostics.view");
      expect(runtime.policy.getCurrentSubject().capabilities).toEqual(expect.arrayContaining(publicCapabilities));
      expect(runtime.policy.authorise({
        action: "runtime.inspect",
        origin: "runtime",
        requiredCapabilities: ["app.open.public"],
      })).toMatchObject({
        allowed: true,
        matchedCapabilities: expect.arrayContaining(["app.open.public"]),
      });

      runtime.store.mutate((draft) => {
        draft.loginServices.isAuthorised = true;
        draft.loginServices.status = "unlocked";
        draft.loginServices.accessClass = "team";
      });
      expect(runtime.policy.getCurrentSubject()).toMatchObject({
        role: "employee",
        capabilities: expect.arrayContaining(employeeCapabilities),
      });
      expect(runtime.policy.authorise({
        action: "diagnostics.view",
        origin: "runtime",
        requiredCapabilities: ["diagnostics.view"],
      })).toMatchObject({
        allowed: true,
        matchedCapabilities: expect.arrayContaining(["diagnostics.view"]),
      });


      const captured = ErrorManager.capture({
        code: "UNKNOWN_RUNTIME_ERROR",
        title: "Runtime contract error",
        message: "The runtime contract fixture captured an error.",
        source: "runtime-contract.test",
      });
      expect(captured).toMatchObject({
        runtimeId: runtime.runtimeId,
        code: "UNKNOWN_RUNTIME_ERROR",
      });
      expect(ErrorManager.getLatest()).toMatchObject({ id: captured.id, runtimeId: runtime.runtimeId });
      expect(ErrorManager.getHistory()).toEqual([
        expect.objectContaining({ id: captured.id, runtimeId: runtime.runtimeId }),
      ]);
      ErrorManager.dismiss(captured.id);
      expect(ErrorManager.getHistory()).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: captured.id }),
      ]));

      const clientService = runtime.services.register({
        id: "runtime-contract.client",
        version: "1.2.0",
        requiredPermissions: ["runtime.contract.read"],
        createAppClient: ({ appId, signal }) => ({
          appId,
          live: !signal.aborted,
        }),
      });
      expect(clientService).toMatchObject({
        id: "runtime-contract.client",
        version: "1.2.0",
      });
      expect(runtime.services.get("runtime-contract.client")).toBe(clientService);

      expect(runtime.services.resolveAppClient({
        appId: "com.example.runtime-contract-consumer",
        serviceId: "runtime-contract.client",
        permissions: ["runtime.contract.read"],
        signal: runtime.signal,
      })).toMatchObject({
        available: true,
        denied: false,
        version: "1.2.0",
        client: { appId: "com.example.runtime-contract-consumer", live: true },
      });
      expect(runtime.services.resolveAppClient({
        appId: "com.example.runtime-contract-consumer",
        serviceId: "runtime-contract.client",
        permissions: [],
        signal: runtime.signal,
      })).toMatchObject({
        available: false,
        denied: true,
        version: "1.2.0",
      });

      ServiceRegistry.ensureDefaults([{
        id: "runtime-contract.provider",
        services: [
          {
            id: "runtime-contract.base",
            displayName: "Runtime Contract Base",
            description: "Base service for runtime contract coverage.",
            availability: "available",
          },
          {
            id: "runtime-contract.dependent",
            displayName: "Runtime Contract Dependent",
            description: "Dependent service for runtime contract coverage.",
            availability: "available",
            dependencies: ["runtime-contract.base"],
          },
        ],
      }]);
      const serviceHealth = ServiceRegistry.getHealthReport(["runtime-contract.dependent"]);
      expect(serviceHealth).toMatchObject({
        ok: true,
        requiredServices: ["runtime-contract.dependent"],
      });
      expect(serviceHealth.services).toEqual(expect.arrayContaining([
        expect.objectContaining({
          serviceId: "runtime-contract.base",
          available: true,
          health: "healthy",
        }),
        expect.objectContaining({
          serviceId: "runtime-contract.dependent",
          available: true,
          health: "healthy",
        }),
      ]));
      expect(ServiceRegistry.getDependencyGraph(["runtime-contract.dependent"])).toEqual({
        "runtime-contract.dependent": ["runtime-contract.base"],
      });
      expect(ServiceRegistry.explainService("runtime-contract.dependent")).toMatchObject({
        serviceId: "runtime-contract.dependent",
        exists: true,
        health: "healthy",
        transitiveDependencies: expect.arrayContaining(["runtime-contract.base"]),
      });

      const app = AppRegistry.registerBundle(createTestBundle({
        bundleIdentifier: "com.example.runtime-contract-app",
        route: "/runtime-contract-app",
        requiredServices: [],
      }));
      if (!app) throw new Error("The runtime contract app did not register.");
      expect(app).toMatchObject({ bundleIdentifier: "com.example.runtime-contract-app", route: "/runtime-contract-app" });
      expect(runtime.apps.getApp("com.example.runtime-contract-app")).toMatchObject({
        bundleIdentifier: "com.example.runtime-contract-app",
        route: "/runtime-contract-app",
      });
      expect(AppRegistry.getAppForRoute("/runtime-contract-app")).toMatchObject({ bundleIdentifier: "com.example.runtime-contract-app" });
      expect(AppRegistry.getRegistrationHistory(1)).toEqual([
        expect.objectContaining({
          appId: "com.example.runtime-contract-app",
          action: "register",
          result: "accepted",
        }),
      ]);
    } finally {
      await runtime.dispose("runtime contract test");
    }
  });

  it("exposes the inspector compatibility surface through the runtime-owned inspector", async () => {
    const runtime = createTestRuntime({ id: "runtime:inspector-contract" });
    const { Inspector, ServiceRegistry } = createRuntimeHarness(runtime);

    try {
      ServiceRegistry.ensureDefaults([{
        id: "runtime-inspector.provider",
        services: [{
          id: "runtime-inspector.service",
          displayName: "Runtime Inspector Service",
          description: "Service used to exercise inspector service reports.",
          availability: "available",
        }],
      }]);

      expect(Inspector.getSnapshot()).toEqual(runtime.store.cloneSnapshot());
      expect(Inspector.getBootReport()).toBeNull();
      expect(Inspector.explainRoute("/")).toMatchObject({
        pathname: "/",
        kind: "webspring",
        matchMode: "path",
        warnings: [],
      });
      expect(Inspector.getRouteHistory()).toEqual([]);
      expect(Inspector.getServiceHealth(["runtime-inspector.service"])).toMatchObject({
        ok: true,
        requiredServices: ["runtime-inspector.service"],
      });
      expect(Inspector.explainService("runtime-inspector.service")).toMatchObject({
        serviceId: "runtime-inspector.service",
        exists: true,
        health: "healthy",
      });
      expect(Inspector.inspectWindowStack()).toMatchObject({
        openWindowCount: 0,
        focusedWindowId: null,
        frontWindowId: null,
        ok: true,
        issues: [],
      });
      expect(Inspector.getStatechartReport()).toMatchObject({
        currentState: "booting",
        history: expect.any(Array),
        definitions: expect.objectContaining({
          "active.webspring": expect.anything(),
        }),
      });
      expect(Inspector.getRuntimeReport()).toMatchObject({
        runtimeId: runtime.runtimeId,
        services: expect.objectContaining({
          serviceCount: expect.any(Number),
        }),
      });

      const conformance = Inspector.getConformanceSnapshot();
      expect(conformance).toMatchObject({
        runtimeId: expect.any(String),
        runtime: {
          state: "running",
          booted: false,
          disposed: false,
        },
      });
      expect(Object.isFrozen(conformance)).toBe(true);
      const refreshed = await Inspector.refreshConformanceSnapshot();
      expect(refreshed.sequence).toBeGreaterThan(conformance.sequence);
      expect(Inspector.exportConformanceSnapshot(refreshed)).toMatchObject({
        fileName: "syncloudos-conformance-snapshot.json",
        content: expect.stringContaining("\"runtimeId\""),
        bytes: expect.any(Number),
      });
    } finally {
      await runtime.dispose("runtime inspector contract test");
    }
  });
});
