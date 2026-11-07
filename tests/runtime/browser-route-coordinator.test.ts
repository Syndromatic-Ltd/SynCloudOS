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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBrowserRouteCoordinator,
  type BrowserRouteCoordinatorDependencies
} from "../../src/SynCloudOS/Routing/BrowserRouteCoordinator";
import { readManagedRouteEntry } from "../../src/SynCloudOS/Routing/BrowserRouteHistory";
import type { RuntimeOperationHandle } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import type { SynCloudOSOpenRouteResult } from "../../src/SynCloudOS/RouteManager/routeTypes";
import { createSynWare, createSynWareBundle } from "../../src/SynCloudOS/AppSDK/createSynWare";
import { defineSynWareRoutes } from "../../src/SynCloudOS/AppSDK/defineSynWareRoutes";
import { createBrowserRoutePlatform } from "../../src/SynCloudOS/PlatformAdapters/BrowserRoutePlatform";
import { createBrowserRuntimeEnvironment } from "../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import { createTestRuntime, createTestBundle, flushLaunchTimers, flushMultiSwitchLaunch, createRuntimeHarness, unlockRuntime } from "./helpers";

type NavigateInterceptOptions = {
  handler: () => void | Promise<void>;
  focusReset: "after-transition" | "manual";
  scroll: "after-transition" | "manual";
};

class FakeNavigation extends EventTarget {}

class FakeNavigateEvent extends Event {
  readonly canIntercept: boolean;
  readonly destination: { url: string };
  readonly downloadRequest: string | null;
  readonly hashChange: boolean;
  readonly navigationType: "push" | "replace" | "reload" | "traverse";
  interceptOptions: NavigateInterceptOptions | null = null;

  constructor(options: {
    url: string;
    navigationType?: FakeNavigateEvent["navigationType"];
    canIntercept?: boolean;
    downloadRequest?: string | null;
    hashChange?: boolean;
  }) {
    super("navigate");
    this.canIntercept = options.canIntercept ?? true;
    this.destination = { url: options.url };
    this.downloadRequest = options.downloadRequest ?? null;
    this.hashChange = options.hashChange ?? false;
    this.navigationType = options.navigationType ?? "push";
  }

  intercept(options: NavigateInterceptOptions) {
    this.interceptOptions = options;
  }
}

function createDependencies() {
  type RuntimeSnapshotStub = {
    booted: boolean;
    statechart: { currentState: string };
    loginServices: { isAuthorised: boolean };
    lifecycle: Readonly<Record<string, string>>;
    application: {
      activeAppId: string | null;
      routePath: string;
      multiSwitch: { status: "idle" | "switching" };
    };
  };
  let snapshot: RuntimeSnapshotStub = {
    booted: true,
    statechart: { currentState: "active.application.active" },
    loginServices: { isAuthorised: true },
    lifecycle: {},
    application: {
      activeAppId: "com.example.software",
      routePath: "/software",
      multiSwitch: { status: "idle" }
    }
  };
  const listeners = new Set<() => void>();
  const routeOpenListeners = new Set<(payload: {
    browserHref: string;
    syncRoute: boolean;
  }) => void>();
  const openRoute = vi.fn();
  const waitForPresentationSettlement = vi.fn<BrowserRouteCoordinatorDependencies["waitForPresentationSettlement"]>(async () => ({ status: "completed" as const }));
  const cancelPresentationSettlement = vi.fn();
  const platform = createBrowserRoutePlatform(createBrowserRuntimeEnvironment());
  const dependencies: BrowserRouteCoordinatorDependencies = {
    platform,
    getRuntimeSnapshot: () => snapshot,
    subscribeRuntime: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeRouteOpen: (listener) => {
      routeOpenListeners.add(listener);
      return () => routeOpenListeners.delete(listener);
    },
    resolveRoute: (pathname) => {
      if (pathname === "/") return { kind: "webspring", pathname };
      if (pathname === "/software") return { kind: "app", pathname, app: { bundleIdentifier: "com.example.software" } };
      if (pathname === "/studio") return { kind: "app", pathname, app: { bundleIdentifier: "com.example.studio" } };
      if (pathname === "/public") return { kind: "app", pathname, app: { bundleIdentifier: "com.example.public", policy: { public: true, requiresLogin: false } } };
      return { kind: "notFound", pathname };
    },
    openRoute,
    waitForPresentationSettlement,
    cancelPresentationSettlement,
    run: (operation) => operation()
  };
  return {
    dependencies,
    platform,
    openRoute,
    waitForPresentationSettlement,
    cancelPresentationSettlement,
    publishRouteOpen(payload: { browserHref: string; syncRoute: boolean; historyMode?: "push" | "replace" }) {
      routeOpenListeners.forEach((listener) => listener(payload));
    },
    setSnapshot(next: Omit<RuntimeSnapshotStub, "lifecycle"> & Partial<Pick<RuntimeSnapshotStub, "lifecycle">>) {
      snapshot = { lifecycle: snapshot.lifecycle, ...next };
      listeners.forEach((listener) => listener());
    }
  };
}

function installNavigation(navigation: FakeNavigation | undefined) {
  Object.defineProperty(window, "navigation", {
    configurable: true,
    value: navigation
  });
}

type RouteResult = Awaited<RuntimeOperationHandle<SynCloudOSOpenRouteResult>["result"]>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, deny) => { resolve = accept; reject = deny; });
  return { promise, resolve, reject };
}
function routeOperation(operationId: string, correlationId = "browser-redirect") {
  const pending = deferred<RouteResult>(); const controller = new AbortController();
  const cancel = vi.fn((reason?: string) => controller.abort(reason));
  const handle: RuntimeOperationHandle<SynCloudOSOpenRouteResult> = {
    operationId, correlationId, signal: controller.signal, result: pending.promise, cancel,
  };
  return { ...pending, handle, cancel };
}
function redirected(successorId: string, href: string): RouteResult {
  return { status: "failed", committed: false, phase: "validating", error: {
    code: "route-redirect", name: "RouteRedirect", message: "Canonical successor started",
    cause: { code: "route-redirect", successorId, href },
  } };
}
function completed(href: string): Extract<RouteResult, { status: "completed" }> {
  return { status: "completed", committed: true, postCommit: "completed", issues: [], skipped: [],
    value: { runtimeId: "test", requestedPath: href, pathname: new URL(href, window.location.origin).pathname, kind: "app" } };
}

describe("BrowserRouteCoordinator", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/software");
    window.sessionStorage.clear();
  });

  afterEach(() => {
    installNavigation(undefined);
    vi.useRealTimers();
  });

  it.each([false, true])("only retires a closed app's browser route when the host home is Webspring (application home: %s)", async applicationHome => {
    installNavigation(undefined);
    const { dependencies, openRoute, setSnapshot } = createDependencies();
    if (applicationHome) {
      const resolveRoute = dependencies.resolveRoute;
      dependencies.resolveRoute = pathname => pathname === "/"
        ? { kind: "app", pathname: "/software", app: { bundleIdentifier: "com.example.software" } }
        : resolveRoute(pathname);
    }
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();
    const length = window.history.length;
    try {
      setSnapshot({
        booted: true, statechart: { currentState: "active.webspring" }, loginServices: { isAuthorised: true },
        lifecycle: { "com.example.software": "closed" },
        application: { activeAppId: null, routePath: "/", multiSwitch: { status: "idle" } },
      });
      await Promise.resolve();
      expect(window.location.pathname).toBe(applicationHome ? "/software" : "/");
      expect(window.history.length).toBe(length);
      expect(openRoute).not.toHaveBeenCalled();
    } finally { coordinator.stop(); }
  });

  it("follows wrapped redirect chains and replaces the browser-selected push entry once", async () => {
    const navigation = new FakeNavigation(); installNavigation(navigation);
    const { dependencies, openRoute, platform } = createDependencies();
    const first = routeOperation("first"); const middle = routeOperation("middle"); const last = routeOperation("last");
    const successors = new Map([["middle", middle.handle], ["last", last.handle]]);
    const getRedirectSuccessor = vi.fn((_predecessor: string, successor: string) => successors.get(successor) ?? null);
    openRoute.mockReturnValue(first.handle);
    const sync = vi.spyOn(platform, "syncRoute");
    const coordinator = createBrowserRouteCoordinator({ ...dependencies, getRedirectSuccessor }); coordinator.start();
    window.history.pushState({ host: "new-entry" }, "", "/studio?old=1");
    const length = window.history.length; sync.mockClear();
    const event = new FakeNavigateEvent({ url: window.location.href }); navigation.dispatchEvent(event);
    const handled = event.interceptOptions!.handler();
    first.resolve(redirected("middle", "/public?middle=1"));
    await vi.waitFor(() => expect(getRedirectSuccessor).toHaveBeenCalledWith("first", "middle"));
    middle.resolve(redirected("last", "/software?final=air#player"));
    await vi.waitFor(() => expect(getRedirectSuccessor).toHaveBeenCalledWith("middle", "last"));
    expect(sync).not.toHaveBeenCalled();
    last.resolve(completed("/software?final=air#player")); await handled;
    expect(openRoute).toHaveBeenCalledOnce(); expect(sync).toHaveBeenCalledOnce();
    expect(sync).toHaveBeenCalledWith("/software?final=air#player", expect.objectContaining({ replace: true, dispatchPopState: false }));
    expect(window.history.length).toBe(length); expect(window.history.state.host).toBe("new-entry");
    expect(readManagedRouteEntry(window.history.state)?.position).toBe(1);
    coordinator.stop();
  });

  it.each(["failed", "cancelled"] as const)("compensates only after the canonical redirect successor is %s before commit", async status => {
    const navigation = new FakeNavigation(); installNavigation(navigation);
    const { dependencies, openRoute, publishRouteOpen, platform } = createDependencies();
    const first = routeOperation("first"); const last = routeOperation("last");
    const getRedirectSuccessor = vi.fn(() => last.handle); const go = vi.fn();
    openRoute.mockReturnValue(first.handle);
    const coordinator = createBrowserRouteCoordinator({ ...dependencies, platform: { ...platform, go }, getRedirectSuccessor }); coordinator.start();
    publishRouteOpen({ browserHref: "/studio", syncRoute: true }); const target = window.history.state;
    publishRouteOpen({ browserHref: "/software", syncRoute: true });
    window.history.replaceState(target, "", "/studio");
    const event = new FakeNavigateEvent({ url: window.location.href, navigationType: "traverse" });
    Object.assign(event.destination, { getState: () => target }); navigation.dispatchEvent(event);
    const handled = event.interceptOptions!.handler(); first.resolve(redirected("last", "/public"));
    await vi.waitFor(() => expect(getRedirectSuccessor).toHaveBeenCalledOnce());
    expect(go).not.toHaveBeenCalled();
    last.resolve(status === "cancelled" ? { status, committed: false, reason: "revoked" }
      : { status, committed: false, phase: "validating", error: { code: "denied", name: "Denied", message: "successor denied" } });
    await handled; expect(go).toHaveBeenCalledExactlyOnceWith(1);
    expect(window.location.pathname).toBe("/studio");
    expect(readManagedRouteEntry(window.history.state)?.entryKey).toBe(readManagedRouteEntry(target)?.entryKey);
    coordinator.stop();
  });

  it.each(["stop", "supersede"] as const)("cancels the adopted successor and releases the interceptor on %s even when its result ignores abort", async action => {
    const navigation = new FakeNavigation(); installNavigation(navigation);
    const { dependencies, openRoute, platform } = createDependencies();
    const first = routeOperation("first"); const last = routeOperation("last");
    const getRedirectSuccessor = vi.fn(() => last.handle); const sync = vi.spyOn(platform, "syncRoute");
    openRoute.mockReturnValue(first.handle);
    const coordinator = createBrowserRouteCoordinator({ ...dependencies, getRedirectSuccessor }); coordinator.start(); sync.mockClear();
    const event = new FakeNavigateEvent({ url: `${window.location.origin}/studio` }); navigation.dispatchEvent(event);
    const handled = event.interceptOptions!.handler(); first.resolve(redirected("last", "/public"));
    await vi.waitFor(() => expect(getRedirectSuccessor).toHaveBeenCalledOnce());
    const signal = openRoute.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    if (action === "stop") coordinator.stop();
    else {
      const next = new FakeNavigateEvent({ url: `${window.location.origin}/software`, navigationType: "traverse" });
      navigation.dispatchEvent(next); await next.interceptOptions!.handler();
    }
    expect(signal.aborted).toBe(true);
    expect(last.cancel).toHaveBeenCalledWith(action === "stop" ? "browser-route-coordinator-stopped" : "browser-route-superseded");
    // No resolution of last.result is needed to release the obsolete interceptor.
    await expect(handled).resolves.toBeUndefined();
    const writes = sync.mock.calls.length;
    last.resolve(completed("/public"));
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    expect(sync).toHaveBeenCalledTimes(writes); expect(window.location.pathname).toBe("/software");
    coordinator.stop();
  });

  it.each(["failed", "cancelled"] as const)("preserves the redirect commit when successor post-commit work is %s", async postCommit => {
    const navigation = new FakeNavigation(); installNavigation(navigation);
    const { dependencies, openRoute, platform } = createDependencies();
    const first = routeOperation("first"); const last = routeOperation("last"); const go = vi.fn();
    openRoute.mockReturnValue(first.handle);
    const coordinator = createBrowserRouteCoordinator({ ...dependencies, platform: { ...platform, go }, getRedirectSuccessor: () => last.handle }); coordinator.start();
    window.history.pushState({ host: "preserve" }, "", "/studio");
    const event = new FakeNavigateEvent({ url: window.location.href }); navigation.dispatchEvent(event);
    const handled = event.interceptOptions!.handler(); first.resolve(redirected("last", "/public#committed"));
    last.resolve({ ...completed("/public#committed"), postCommit }); await handled;
    expect(window.location.pathname + window.location.hash).toBe("/public#committed");
    expect(go).not.toHaveBeenCalled(); expect(window.history.state.host).toBe("preserve"); coordinator.stop();
  });

  it("reports a missing successor hookup without fabricating completion or compensating its URL", async () => {
    const navigation = new FakeNavigation(); installNavigation(navigation);
    const { dependencies, openRoute, platform } = createDependencies();
    const first = routeOperation("first"); const sync = vi.spyOn(platform, "syncRoute");
    openRoute.mockReturnValue(first.handle);
    const coordinator = createBrowserRouteCoordinator(dependencies); coordinator.start(); sync.mockClear();
    window.history.pushState({ host: "selected" }, "", "/studio");
    const event = new FakeNavigateEvent({ url: window.location.href }); navigation.dispatchEvent(event);
    const handled = event.interceptOptions!.handler(); first.resolve(redirected("missing", "/public"));
    await expect(handled).rejects.toThrow("redirect successor is unavailable");
    expect(sync).not.toHaveBeenCalled(); expect(window.location.pathname).toBe("/studio"); coordinator.stop();
  });

  it("revokes the redirect successor when the Navigation API aborts the intercepted event", async () => {
    const navigation = new FakeNavigation(); installNavigation(navigation);
    const { dependencies, openRoute, platform } = createDependencies();
    const first = routeOperation("first"); const last = routeOperation("last");
    const getRedirectSuccessor = vi.fn(() => last.handle); const sync = vi.spyOn(platform, "syncRoute");
    openRoute.mockReturnValue(first.handle);
    const coordinator = createBrowserRouteCoordinator({ ...dependencies, getRedirectSuccessor }); coordinator.start(); sync.mockClear();
    const browser = new AbortController();
    const event = new FakeNavigateEvent({ url: `${window.location.origin}/studio` });
    Object.assign(event, { signal: browser.signal }); navigation.dispatchEvent(event);
    const handled = event.interceptOptions!.handler(); first.resolve(redirected("last", "/public"));
    await vi.waitFor(() => expect(getRedirectSuccessor).toHaveBeenCalledOnce());
    let done = false; void Promise.resolve(handled).then(() => { done = true; });
    browser.abort();
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    expect(done).toBe(true);
    expect(last.cancel).toHaveBeenCalledWith("browser-navigation-aborted");
    expect(openRoute.mock.calls[0][1].signal.aborted).toBe(true);
    expect(sync).not.toHaveBeenCalled();
    last.resolve(completed("/public")); await handled; coordinator.stop();
  });

  it("ignores an already-aborted Navigation API event without revoking the live successor", async () => {
    const navigation = new FakeNavigation(); installNavigation(navigation);
    const { dependencies, openRoute } = createDependencies();
    const first = routeOperation("first"); const last = routeOperation("last");
    const getRedirectSuccessor = vi.fn(() => last.handle); openRoute.mockReturnValue(first.handle);
    const coordinator = createBrowserRouteCoordinator({ ...dependencies, getRedirectSuccessor }); coordinator.start();
    const current = new FakeNavigateEvent({ url: `${window.location.origin}/studio` }); navigation.dispatchEvent(current);
    const handled = current.interceptOptions!.handler(); first.resolve(redirected("last", "/public"));
    await vi.waitFor(() => expect(getRedirectSuccessor).toHaveBeenCalledOnce());
    const aborted = new AbortController(); aborted.abort();
    const stale = new FakeNavigateEvent({ url: `${window.location.origin}/software` });
    Object.assign(stale, { signal: aborted.signal }); navigation.dispatchEvent(stale);
    await stale.interceptOptions!.handler();
    expect(last.cancel).not.toHaveBeenCalled(); expect(openRoute.mock.calls[0][1].signal.aborted).toBe(false);
    expect(openRoute).toHaveBeenCalledOnce();
    last.resolve(completed("/public")); await handled; coordinator.stop();
  });

  it("joins the real RouteManager guard redirect and its pending canonical successor without reopening", async () => {
    const navigation = new FakeNavigation(); installNavigation(navigation);
    const entered = deferred<void>(); const allow = deferred<{ outcome: "allow" }>();
    const routes = defineSynWareRoutes({ id: "browser.redirects", routes: [{ name: "com.example.studio", path: "", children: [
      { name: "studio.old", path: "old", beforeEnter: () => ({ outcome: "redirect", target: { name: "studio.current" } }) },
      { name: "studio.current", path: "current", beforeEnter: () => { entered.resolve(); return allow.promise; } },
    ] }] });
    const definition = createSynWare({ manifest: { schemaVersion: 1, bundleIdentifier: "com.example.studio", displayName: "Studio", version: "1.0.0",
      routes: [{ path: "/studio", primary: true, match: "prefix" }], permissions: ["app.open.public"] }, root: () => null, routes });
    const runtime = createTestRuntime({ initialBundles: [createSynWareBundle(definition)] });
    const { RuntimeController, Statechart } = createRuntimeHarness(runtime);
    unlockRuntime(runtime); RuntimeController.markBooted(); Statechart.gotoState("active.webspring", { source: "test" });
    const platform = createBrowserRoutePlatform(runtime.environment);
    const sync = vi.spyOn(platform, "syncRoute");
    const openRoute = vi.fn(runtime.routes.openRoute);
    const getRedirectSuccessor = vi.fn(runtime.routes.getRedirectSuccessor);
    const coordinator = createBrowserRouteCoordinator({ platform, getRuntimeSnapshot: runtime.store.getSnapshot,
      subscribeRuntime: runtime.store.subscribe, subscribeRouteOpen: listener => runtime.events.subscribe("route.open", event => {
        const payload = event.payload as { browserHref: string; syncRoute: boolean; historyMode?: "push" | "replace" };
        listener(payload);
      }), resolveRoute: runtime.routes.resolveRoute, openRoute, getRedirectSuccessor,
      waitForPresentationSettlement: async () => undefined, run: operation => operation(),
    });
    try {
      coordinator.start(); window.history.pushState({ host: "canonical" }, "", "/studio/old"); sync.mockClear();
      const length = window.history.length;
      const event = new FakeNavigateEvent({ url: window.location.href }); navigation.dispatchEvent(event);
      const handled = event.interceptOptions!.handler();
      await entered.promise;
      let done = false; void Promise.resolve(handled).then(() => { done = true; });
      for (let turn = 0; turn < 20; turn++) await Promise.resolve();
      expect(done).toBe(false); expect(sync).not.toHaveBeenCalled();
      expect(getRedirectSuccessor).toHaveBeenCalledOnce();
      const successor = getRedirectSuccessor.mock.results[0].value!;
      expect(runtime.operations.inspectPending()).toEqual(expect.arrayContaining([expect.objectContaining({ operationId: successor.operationId })]));
      allow.resolve({ outcome: "allow" }); await handled;
      expect(openRoute).toHaveBeenCalledOnce();
      expect(runtime.store.getSnapshot().application.routePath).toBe("/studio/current");
      expect(window.location.pathname).toBe("/studio/current"); expect(window.history.length).toBe(length);
      expect(window.history.state.host).toBe("canonical");
      expect(sync).toHaveBeenCalledOnce();
    } finally { coordinator.stop(); await runtime.dispose(); }
  });

  it("intercepts a supported same-origin address-bar navigation and opens the runtime route once", async () => {
    const navigation = new FakeNavigation();
    installNavigation(navigation);
    const { dependencies, openRoute, setSnapshot } = createDependencies();
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();

    const event = new FakeNavigateEvent({
      url: "http://localhost:3000/studio?folder=nse#selected",
      navigationType: "push"
    });
    navigation.dispatchEvent(event);

    expect(event.interceptOptions).toMatchObject({
      focusReset: "after-transition",
      scroll: "after-transition"
    });
    const handled = event.interceptOptions?.handler();
    await Promise.resolve();
    await Promise.resolve();
    expect(openRoute).toHaveBeenCalledTimes(1);
    expect(openRoute).toHaveBeenCalledWith("/studio?folder=nse#selected", {
      source: "route",
      syncRoute: false,
      signal: expect.any(AbortSignal),
      context: {
        browserHref: "/studio?folder=nse#selected",
        browserNavigationType: "push"
      }
    });
    setSnapshot({
      booted: true,
      statechart: { currentState: "active.application.active" },
      loginServices: { isAuthorised: true },
      application: {
        activeAppId: "com.example.studio",
        routePath: "/studio",
        multiSwitch: { status: "idle" }
      }
    });
    await handled;

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(openRoute).toHaveBeenCalledTimes(1);
    coordinator.stop();
  });

  it("pushes runtime-owned routes into browser history unless synchronization is disabled", () => {
    installNavigation(undefined);
    const { dependencies, publishRouteOpen } = createDependencies();
    const coordinator = createBrowserRouteCoordinator(dependencies);
    const popstate = vi.fn();
    window.addEventListener("popstate", popstate);
    coordinator.start();

    publishRouteOpen({ browserHref: "/studio?folder=nse#selected", syncRoute: true });

    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(
      "/studio?folder=nse#selected",
    );
    expect(popstate).toHaveBeenCalledTimes(1);

    publishRouteOpen({ browserHref: "/software", syncRoute: false });
    expect(window.location.pathname).toBe("/studio");
    expect(popstate).toHaveBeenCalledTimes(1);

    coordinator.stop();
    window.removeEventListener("popstate", popstate);
  });

  it("releases the route queue after a typed failure", async () => {
    const navigation = new FakeNavigation();
    installNavigation(navigation);
    const { dependencies, openRoute, setSnapshot } = createDependencies();
    openRoute
      .mockReturnValueOnce({
        result: Promise.resolve({
          status: "failed",
          committed: false,
          phase: "validating",
          error: { code: "route-denied", name: "RouteDenied", message: "denied", phase: "validating" },
        }),
      })
      .mockReturnValueOnce({
        result: Promise.resolve({
          status: "completed",
          committed: true,
          value: { pathname: "/" },
          postCommit: "completed",
          issues: [],
          skipped: [],
        }),
      });
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();

    const denied = new FakeNavigateEvent({ url: `${window.location.origin}/studio`, navigationType: "push" });
    navigation.dispatchEvent(denied);
    await expect(denied.interceptOptions?.handler()).resolves.toBeUndefined();

    const next = new FakeNavigateEvent({ url: `${window.location.origin}/`, navigationType: "push" });
    navigation.dispatchEvent(next);
    const handled = next.interceptOptions?.handler();
    await Promise.resolve();
    await Promise.resolve();
    expect(openRoute).toHaveBeenCalledTimes(2);
    setSnapshot({
      booted: true,
      statechart: { currentState: "active.webspring" },
      loginServices: { isAuthorised: true },
      application: { activeAppId: null, routePath: "/", multiSwitch: { status: "idle" } },
    });
    await expect(handled).resolves.toBeUndefined();
    coordinator.stop();
  });

  it("passes malformed browser route input to the canonical operation without synchronous coercion", async () => {
    const navigation = new FakeNavigation();
    installNavigation(navigation);
    const { dependencies, openRoute } = createDependencies();
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();

    const event = new FakeNavigateEvent({ url: "http://[malformed", navigationType: "push" });
    expect(() => navigation.dispatchEvent(event)).not.toThrow();
    expect(event.interceptOptions).toMatchObject({
      focusReset: "after-transition",
      scroll: "after-transition",
    });

    await expect(event.interceptOptions?.handler()).resolves.toBeUndefined();
    expect(openRoute).toHaveBeenCalledWith("http://[malformed", {
      source: "route",
      syncRoute: false,
      signal: expect.any(AbortSignal),
      context: {
        browserHref: "http://[malformed",
        browserNavigationType: "push",
      },
    });
    coordinator.stop();
  });

  it("keeps an intercepted navigation pending until the requested route presentation settles", async () => {
    const navigation = new FakeNavigation();
    installNavigation(navigation);
    const { dependencies, openRoute, setSnapshot } = createDependencies();
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();

    const event = new FakeNavigateEvent({ url: `${window.location.origin}/studio`, navigationType: "traverse" });
    navigation.dispatchEvent(event);
    const handled = event.interceptOptions?.handler();
    let settled = false;
    void Promise.resolve(handled).then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(openRoute).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    setSnapshot({
      booted: true,
      statechart: { currentState: "active.application.active" },
      loginServices: { isAuthorised: true },
      application: {
        activeAppId: "com.example.studio",
        routePath: "/studio",
        multiSwitch: { status: "switching" }
      }
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    setSnapshot({
      booted: true,
      statechart: { currentState: "active.application.active" },
      loginServices: { isAuthorised: true },
      application: {
        activeAppId: "com.example.studio",
        routePath: "/studio",
        multiSwitch: { status: "idle" }
      }
    });
    await handled;

    expect(settled).toBe(true);
    coordinator.stop();
  });

  it("awaits the operation's explicit presentation settlement after semantic state settles", async () => {
    const navigation = new FakeNavigation();
    installNavigation(navigation);
    const { dependencies, openRoute, setSnapshot, waitForPresentationSettlement } = createDependencies();
    let releasePresentation!: () => void;
    waitForPresentationSettlement.mockImplementation(() => new Promise((resolve) => {
      releasePresentation = () => resolve({ status: "completed" as const });
    }));
    openRoute.mockReturnValue({
      result: Promise.resolve({
        status: "completed",
        committed: true,
        value: { pathname: "/studio", presentationSettlementId: "presentation:studio" },
        postCommit: "completed",
        issues: [],
        skipped: [],
      }),
    });
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();

    const event = new FakeNavigateEvent({ url: `${window.location.origin}/studio`, navigationType: "push" });
    navigation.dispatchEvent(event);
    const handled = event.interceptOptions?.handler();
    await vi.waitFor(() => expect(openRoute).toHaveBeenCalledTimes(1));
    setSnapshot({
      booted: true,
      statechart: { currentState: "active.application.active" },
      loginServices: { isAuthorised: true },
      application: { activeAppId: "com.example.studio", routePath: "/studio", multiSwitch: { status: "idle" } },
    });
    let settled = false;
    void Promise.resolve(handled).then(() => { settled = true; });
    await vi.waitFor(() => expect(waitForPresentationSettlement).toHaveBeenCalledWith("presentation:studio"));

    expect(settled).toBe(false);
    releasePresentation();
    await expect(handled).resolves.toBeUndefined();
    coordinator.stop();
  });

  it("cancels the active route operation on stop and ignores its late completion after restart", async () => {
    const navigation = new FakeNavigation();
    installNavigation(navigation);
    const { dependencies, openRoute, platform } = createDependencies();
    let resolveRoute!: (value: any) => void;
    const cancel = vi.fn();
    openRoute.mockReturnValue({
      result: new Promise((resolve) => { resolveRoute = resolve; }),
      cancel,
    });
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();

    const event = new FakeNavigateEvent({ url: `${window.location.origin}/studio`, navigationType: "traverse" });
    navigation.dispatchEvent(event);
    const handled = event.interceptOptions?.handler();
    await vi.waitFor(() => expect(openRoute).toHaveBeenCalledTimes(1));

    coordinator.stop();
    expect(cancel).toHaveBeenCalledWith("browser-route-coordinator-stopped");
    coordinator.start();
    resolveRoute({
      status: "completed",
      committed: true,
      value: { pathname: "/studio", presentationSettlementId: "late" },
      postCommit: "completed",
      issues: [],
      skipped: [],
    });
    await expect(handled).resolves.toBeUndefined();

    expect(dependencies.waitForPresentationSettlement).not.toHaveBeenCalledWith("late");
    coordinator.stop();
  });

  it("cancels an active presentation wait when stopped", async () => {
    const navigation = new FakeNavigation();
    installNavigation(navigation);
    const { dependencies, openRoute, waitForPresentationSettlement, cancelPresentationSettlement } = createDependencies();
    let releasePresentation!: () => void;
    waitForPresentationSettlement.mockImplementation(() => new Promise<void>((resolve) => { releasePresentation = resolve; }));
    openRoute.mockReturnValue({
      result: Promise.resolve({
        status: "completed",
        committed: true,
        value: { pathname: "/studio", presentationSettlementId: "presentation:stop" },
        postCommit: "completed",
        issues: [],
        skipped: [],
      }),
      cancel: vi.fn(),
    });
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();
    const event = new FakeNavigateEvent({ url: `${window.location.origin}/studio`, navigationType: "push" });
    navigation.dispatchEvent(event);
    const handled = event.interceptOptions?.handler();
    await vi.waitFor(() => expect(waitForPresentationSettlement).toHaveBeenCalledWith("presentation:stop"));

    coordinator.stop();
    expect(cancelPresentationSettlement).toHaveBeenCalledWith("presentation:stop", "browser-route-coordinator-stopped");
    releasePresentation();
    await expect(handled).resolves.toBeUndefined();
  });

  it.each(["failed", "cancelled"] as const)("restores the committed runtime href after a typed %s navigation", async (status) => {
    const navigation = new FakeNavigation();
    installNavigation(navigation);
    const { dependencies, openRoute } = createDependencies();
    openRoute.mockReturnValue({
      result: Promise.resolve(status === "failed"
        ? { status, committed: false, phase: "validating", error: { code: "denied", name: "Denied", message: "denied" } }
        : { status, committed: false, reason: "superseded" }),
    });
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();
    const event = new FakeNavigateEvent({ url: `${window.location.origin}/studio`, navigationType: "push" });
    navigation.dispatchEvent(event);
    window.history.replaceState({}, "", "/studio?attempt=1#denied");

    await expect(event.interceptOptions?.handler()).resolves.toBeUndefined();

    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe("/software");
    coordinator.stop();
  });

  it("supersedes stale traversal work when a newer browser intent returns to the committed route", async () => {
    const navigation = new FakeNavigation();
    installNavigation(navigation);
    const { dependencies, openRoute } = createDependencies();
    let settleFirst!: (value: any) => void;
    const cancelFirst = vi.fn(() => settleFirst({
      status: "cancelled",
      committed: false,
      reason: "superseded",
    }));
    openRoute.mockReturnValueOnce({
      result: new Promise((resolve) => { settleFirst = resolve; }),
      cancel: cancelFirst,
    });
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();

    const toStudio = new FakeNavigateEvent({ url: `${window.location.origin}/studio`, navigationType: "traverse" });
    navigation.dispatchEvent(toStudio);
    const studioHandled = toStudio.interceptOptions?.handler();
    await Promise.resolve();
    await Promise.resolve();
    expect(openRoute).toHaveBeenCalledTimes(1);
    expect(openRoute).toHaveBeenLastCalledWith("/studio", {
      source: "route",
      syncRoute: false,
      signal: expect.any(AbortSignal),
      context: { browserHref: "/studio", browserNavigationType: "traverse" }
    });

    const backToSoftware = new FakeNavigateEvent({ url: `${window.location.origin}/software`, navigationType: "traverse" });
    navigation.dispatchEvent(backToSoftware);
    const softwareHandled = backToSoftware.interceptOptions?.handler();
    await Promise.resolve();
    await Promise.resolve();
    expect(cancelFirst).toHaveBeenCalledWith("browser-route-superseded");
    expect(openRoute).toHaveBeenCalledTimes(1);
    await expect(studioHandled).resolves.toBeUndefined();
    await expect(softwareHandled).resolves.toBeUndefined();
    coordinator.stop();
  });

  it("turns an intercepted active-app navigation into a genuine route-aware MultiSwitch", async () => {
    vi.useFakeTimers();
    const navigation = new FakeNavigation();
    installNavigation(navigation);
    const runtime = createTestRuntime();
    const { AppRegistry, RouteManager, RuntimeController, RuntimeStore, Statechart, run } = createRuntimeHarness(runtime);
    AppRegistry.registerMany([
      createTestBundle({ bundleIdentifier: "com.example.software", route: "/software" }),
      createTestBundle({ bundleIdentifier: "com.example.studio", route: "/studio" })
    ]);
    unlockRuntime(runtime);
    RuntimeController.markBooted();
    Statechart.gotoState("active.webspring", { source: "test" });
    RouteManager.openRoute("/software");
    await flushLaunchTimers();

    const routeOpen = vi.spyOn(RouteManager, "openRoute");
    const coordinator = createBrowserRouteCoordinator({
      platform: createBrowserRoutePlatform(runtime.environment),
      getRuntimeSnapshot: RuntimeStore.getSnapshot,
      subscribeRuntime: RuntimeStore.subscribe,
      subscribeRouteOpen: () => () => undefined,
      resolveRoute: (pathname) => RouteManager.resolveRoute(pathname),
      openRoute: (pathname) => RouteManager.openRoute(pathname),
      waitForPresentationSettlement: async () => undefined,
      run
    });
    coordinator.start();

    const event = new FakeNavigateEvent({ url: `${window.location.origin}/studio`, navigationType: "push" });
    navigation.dispatchEvent(event);
    const handled = event.interceptOptions?.handler();
    await Promise.resolve();
    await Promise.resolve();

    expect(routeOpen).toHaveBeenCalledTimes(1);
    expect(routeOpen).toHaveBeenCalledWith("/studio");
    await flushMultiSwitchLaunch();
    expect(RuntimeController.getSnapshot().application.multiSwitch).toMatchObject({
      status: "switching",
      fromAppId: "com.example.software",
      toAppId: "com.example.studio",
      fromRoute: "/software",
      toRoute: "/studio",
      source: "route"
    });
    await vi.advanceTimersByTimeAsync(900);
    await handled;
    coordinator.stop();
  });

  it("uses genuine MultiSwitch transitions for Back and Forward traversal between apps", async () => {
    vi.useFakeTimers();
    const navigation = new FakeNavigation();
    installNavigation(navigation);
    const runtime = createTestRuntime();
    const { AppRegistry, LaunchServices, RouteManager, RuntimeController, RuntimeStore, Statechart, run } = createRuntimeHarness(runtime);
    AppRegistry.registerMany([
      createTestBundle({ bundleIdentifier: "com.example.software", route: "/software" }),
      createTestBundle({ bundleIdentifier: "com.example.studio", route: "/studio" })
    ]);
    unlockRuntime(runtime);
    RuntimeController.markBooted();
    Statechart.gotoState("active.webspring", { source: "test" });
    RouteManager.openRoute("/software");
    await flushLaunchTimers();

    const coordinator = createBrowserRouteCoordinator({
      platform: createBrowserRoutePlatform(runtime.environment),
      getRuntimeSnapshot: RuntimeStore.getSnapshot,
      subscribeRuntime: RuntimeStore.subscribe,
      subscribeRouteOpen: () => () => undefined,
      resolveRoute: (pathname) => RouteManager.resolveRoute(pathname),
      openRoute: (pathname) => RouteManager.openRoute(pathname),
      waitForPresentationSettlement: async () => undefined,
      run
    });
    coordinator.start();

    const forward = new FakeNavigateEvent({ url: `${window.location.origin}/studio`, navigationType: "traverse" });
    navigation.dispatchEvent(forward);
    window.history.replaceState({}, "", "/studio");
    const forwardHandled = forward.interceptOptions?.handler();
    await Promise.resolve();
    await Promise.resolve();
    await flushMultiSwitchLaunch();

    expect(RuntimeController.getSnapshot().application.multiSwitch).toMatchObject({
      status: "switching",
      fromAppId: "com.example.software",
      toAppId: "com.example.studio",
      source: "route"
    });
    await vi.advanceTimersByTimeAsync(900);
    await forwardHandled;

    const back = new FakeNavigateEvent({ url: `${window.location.origin}/software`, navigationType: "traverse" });
    navigation.dispatchEvent(back);
    window.history.replaceState({}, "", "/software");
    const backHandled = back.interceptOptions?.handler();
    await Promise.resolve();
    await Promise.resolve();
    await flushMultiSwitchLaunch();

    expect(RuntimeController.getSnapshot().application.multiSwitch).toMatchObject({
      status: "switching",
      fromAppId: "com.example.studio",
      toAppId: "com.example.software",
      source: "route"
    });
    expect(LaunchServices.getHistory().filter((record: { action: string }) => record.action === "multiswitch.begin")).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(900);
    await backHandled;
    coordinator.stop();
  });

  it("lets reload proceed as a real document navigation", () => {
    const navigation = new FakeNavigation();
    installNavigation(navigation);
    const { dependencies, openRoute, platform } = createDependencies();
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();

    const event = new FakeNavigateEvent({ url: "http://localhost:3000/studio", navigationType: "reload" });
    navigation.dispatchEvent(event);

    expect(event.interceptOptions).toBeNull();
    expect(openRoute).not.toHaveBeenCalled();
    coordinator.stop();
  });

  it.each([
    ["cross-origin", { url: "https://example.com/studio" }],
    ["download", { url: "http://localhost:3000/studio", downloadRequest: "Studio.synapp" }],
    ["hash-only", { url: "http://localhost:3000/software#details", hashChange: true }],
    ["unknown same-origin route", { url: "http://localhost:3000/not-a-syncloudos-route" }]
  ])("keeps browser-default behavior for %s navigation", (_label, options) => {
    const navigation = new FakeNavigation();
    installNavigation(navigation);
    const { dependencies, openRoute } = createDependencies();
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();

    const event = new FakeNavigateEvent(options);
    navigation.dispatchEvent(event);

    expect(event.interceptOptions).toBeNull();
    expect(openRoute).not.toHaveBeenCalled();
    coordinator.stop();
  });

  it("uses popstate traversal when the Navigation API is unavailable", async () => {
    installNavigation(undefined);
    const { dependencies, openRoute } = createDependencies();
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();

    window.history.replaceState({}, "", "/studio");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await Promise.resolve();
    await Promise.resolve();

    expect(openRoute).toHaveBeenCalledTimes(1);
    expect(openRoute).toHaveBeenCalledWith("/studio", {
      source: "route",
      syncRoute: false,
      signal: expect.any(AbortSignal),
      context: { browserHref: "/studio", browserNavigationType: "traverse" }
    });
    coordinator.stop();
  });

  it.each(["navigation", "popstate"] as const)("joins a canonical redirect successor without compensating its %s traversal", async transport => {
    const navigation = transport === "navigation" ? new FakeNavigation() : undefined;
    installNavigation(navigation);
    const { dependencies, openRoute, publishRouteOpen, platform } = createDependencies();
    const predecessor = routeOperation("predecessor"); const successor = routeOperation("successor");
    const getRedirectSuccessor = vi.fn(() => successor.handle);
    openRoute.mockReturnValue(predecessor.handle);
    const go = vi.fn(); const sync = vi.spyOn(platform, "syncRoute");
    const coordinator = createBrowserRouteCoordinator({ ...dependencies, platform: { ...platform, go }, getRedirectSuccessor });
    coordinator.start();
    publishRouteOpen({ browserHref: "/studio", syncRoute: true });
    const target = { ...window.history.state, host: { selected: "keep" } };
    publishRouteOpen({ browserHref: "/software", syncRoute: true });
    const length = window.history.length;
    sync.mockClear();
    window.history.replaceState(target, "", "/studio?redirect=1#requested");
    let handled: void | Promise<void> = undefined;
    if (navigation) {
      const event = new FakeNavigateEvent({ url: window.location.href, navigationType: "traverse" });
      Object.assign(event.destination, { getState: () => target });
      navigation.dispatchEvent(event); handled = event.interceptOptions?.handler();
    } else window.dispatchEvent(new PopStateEvent("popstate", { state: target }));
    await vi.waitFor(() => expect(openRoute).toHaveBeenCalledOnce());
    predecessor.resolve(redirected(successor.handle.operationId, "/public?from=studio#ready"));
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    expect(getRedirectSuccessor).toHaveBeenCalledWith("predecessor", "successor");
    expect(go).not.toHaveBeenCalled(); expect(sync).not.toHaveBeenCalled();
    let finished = false;
    if (handled) void handled.then(() => { finished = true; });
    await Promise.resolve(); expect(finished).toBe(false);
    successor.resolve(completed("/public?from=studio#ready"));
    if (handled) await handled;
    await vi.waitFor(() => expect(window.location.pathname + window.location.search + window.location.hash).toBe("/public?from=studio#ready"));
    expect(openRoute).toHaveBeenCalledOnce(); expect(go).not.toHaveBeenCalled();
    expect(window.history.length).toBe(length);
    expect(window.history.state.host).toEqual({ selected: "keep" });
    expect(readManagedRouteEntry(window.history.state)).toMatchObject({ entryKey: readManagedRouteEntry(target)!.entryKey, position: 1 });
    coordinator.stop();
  });

  it("preserves focus and scroll for query-only Navigation API transitions", () => {
    const navigation = new FakeNavigation();
    installNavigation(navigation);
    const { dependencies } = createDependencies();
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();

    const event = new FakeNavigateEvent({
      url: `${window.location.origin}/software?q=air`,
      navigationType: "push",
    });
    navigation.dispatchEvent(event);

    expect(event.interceptOptions).toMatchObject({
      focusReset: "manual",
      scroll: "manual",
    });
    coordinator.stop();
  });

  it("stamps the current history entry on start without discarding host-owned state", () => {
    installNavigation(undefined);
    window.history.replaceState({ host: { selection: 7 } }, "", "/software");
    const { dependencies } = createDependencies();
    const coordinator = createBrowserRouteCoordinator(dependencies);

    coordinator.start();

    expect(window.history.state.host).toEqual({ selection: 7 });
    expect(readManagedRouteEntry(window.history.state)).toMatchObject({
      position: 0,
      routeRevision: 0,
    });
    coordinator.stop();
  });

  it("assigns monotonically positioned managed entries to runtime-owned pushes", () => {
    installNavigation(undefined);
    const { dependencies, publishRouteOpen } = createDependencies();
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();
    const initial = readManagedRouteEntry(window.history.state);

    publishRouteOpen({ browserHref: "/studio", syncRoute: true });

    const pushed = readManagedRouteEntry(window.history.state);
    expect(initial).not.toBeNull();
    expect(pushed).toMatchObject({
      runtimeSession: initial?.runtimeSession,
      position: 1,
      routeRevision: 1,
    });
    expect(pushed?.entryKey).not.toBe(initial?.entryKey);
    coordinator.stop();
  });

  it("annotates an already-pushed changed href with a new managed entry instead of reusing the prior identity", () => {
    installNavigation(undefined);
    const { dependencies, publishRouteOpen, platform } = createDependencies();
    const coordinator = createBrowserRouteCoordinator(dependencies);
    const push = vi.spyOn(window.history, "pushState");
    coordinator.start();
    const initial = readManagedRouteEntry(window.history.state);

    platform.syncRoute("/studio", { dispatchPopState: false });
    publishRouteOpen({ browserHref: "/studio", syncRoute: true });

    const studio = readManagedRouteEntry(window.history.state);
    expect(push).toHaveBeenCalledTimes(1);
    expect(studio).toMatchObject({
      runtimeSession: initial?.runtimeSession,
      position: 1,
      routeRevision: 1,
    });
    expect(studio?.entryKey).not.toBe(initial?.entryKey);
    push.mockRestore();
    coordinator.stop();
  });

  it("creates a distinct managed entry when an explicit push targets the same href", () => {
    installNavigation(undefined);
    const { dependencies, publishRouteOpen } = createDependencies();
    const coordinator = createBrowserRouteCoordinator(dependencies);
    const push = vi.spyOn(window.history, "pushState");
    coordinator.start();
    const initial = readManagedRouteEntry(window.history.state);

    publishRouteOpen({ browserHref: "/software", syncRoute: true, historyMode: "push" });

    const pushed = readManagedRouteEntry(window.history.state);
    expect(push).toHaveBeenCalledTimes(1);
    expect(pushed).toMatchObject({
      runtimeSession: initial?.runtimeSession,
      position: 1,
      routeRevision: 1,
    });
    expect(pushed?.entryKey).not.toBe(initial?.entryKey);
    push.mockRestore();
    coordinator.stop();
  });

  it("reuses the current managed entry identity for runtime-owned replace navigation", () => {
    installNavigation(undefined);
    const { dependencies, publishRouteOpen } = createDependencies();
    const coordinator = createBrowserRouteCoordinator(dependencies);
    const push = vi.spyOn(window.history, "pushState");
    coordinator.start();
    const initial = readManagedRouteEntry(window.history.state);

    publishRouteOpen({ browserHref: "/software?q=air", syncRoute: true, historyMode: "replace" });

    const replaced = readManagedRouteEntry(window.history.state);
    expect(push).not.toHaveBeenCalled();
    expect(replaced).toMatchObject({
      runtimeSession: initial?.runtimeSession,
      entryKey: initial?.entryKey,
      position: initial?.position,
      routeRevision: 1,
    });
    expect(`${window.location.pathname}${window.location.search}`).toBe("/software?q=air");
    push.mockRestore();
    coordinator.stop();
  });

  it("claims a browser-owned Navigation API push after the route commits", async () => {
    const navigation = new FakeNavigation();
    installNavigation(navigation);
    const { dependencies, openRoute, setSnapshot } = createDependencies();
    openRoute.mockReturnValue({
      result: Promise.resolve({
        status: "completed",
        committed: true,
        value: { pathname: "/studio" },
        postCommit: "completed",
        issues: [],
        skipped: [],
      }),
    });
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();
    const initial = readManagedRouteEntry(window.history.state);
    const event = new FakeNavigateEvent({ url: `${window.location.origin}/studio`, navigationType: "push" });
    navigation.dispatchEvent(event);
    window.history.pushState({ host: "browser-owned" }, "", "/studio");
    setSnapshot({
      booted: true,
      statechart: { currentState: "active.application.active" },
      loginServices: { isAuthorised: true },
      application: { activeAppId: "com.example.studio", routePath: "/studio", multiSwitch: { status: "idle" } },
    });

    await expect(event.interceptOptions?.handler()).resolves.toBeUndefined();

    expect(window.history.state.host).toBe("browser-owned");
    expect(readManagedRouteEntry(window.history.state)).toMatchObject({
      runtimeSession: initial?.runtimeSession,
      position: 1,
      routeRevision: 1,
    });
    coordinator.stop();
  });

  it("compensates a failed owned traversal by history delta instead of rewriting the target entry", async () => {
    installNavigation(undefined);
    const { dependencies, openRoute, publishRouteOpen, platform } = createDependencies();
    const go = vi.fn();
    const coordinator = createBrowserRouteCoordinator({ ...dependencies, platform: { ...platform, go } });
    coordinator.start();
    publishRouteOpen({ browserHref: "/studio", syncRoute: true });
    const studio = window.history.state;
    publishRouteOpen({ browserHref: "/software", syncRoute: true });
    const software = window.history.state;
    openRoute.mockReturnValue({
      result: Promise.resolve({
        status: "failed",
        committed: false,
        phase: "validating",
        error: { code: "denied", name: "Denied", message: "denied" },
      }),
    });

    window.history.replaceState(studio, "", "/studio");
    window.dispatchEvent(new PopStateEvent("popstate", { state: studio }));
    await vi.waitFor(() => expect(openRoute).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(go).toHaveBeenCalledWith(1));

    expect(readManagedRouteEntry(software)?.position).toBe(2);
    coordinator.stop();
  });

  it("reconciles a failed traversal from an unknown entry with replace and no speculative history delta", async () => {
    installNavigation(undefined);
    const { dependencies, openRoute, platform } = createDependencies();
    const go = vi.fn();
    const coordinator = createBrowserRouteCoordinator({ ...dependencies, platform: { ...platform, go } });
    coordinator.start();
    openRoute.mockReturnValue({
      result: Promise.resolve({
        status: "failed",
        committed: false,
        phase: "validating",
        error: { code: "denied", name: "Denied", message: "denied" },
      }),
    });

    window.history.replaceState({ host: "unknown-entry" }, "", "/studio");
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    await vi.waitFor(() => expect(openRoute).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe("/software"));

    expect(go).not.toHaveBeenCalled();
    expect(window.history.state.host).toBe("unknown-entry");
    coordinator.stop();
  });

  it("does not let obsolete traversal compensation undo a newer committed browser intent", async () => {
    installNavigation(undefined);
    const { dependencies, openRoute, publishRouteOpen, platform } = createDependencies();
    const go = vi.fn();
    let settleOld!: (value: any) => void;
    const cancelOld = vi.fn();
    openRoute.mockReturnValueOnce({
      result: new Promise((resolve) => { settleOld = resolve; }),
      cancel: cancelOld,
    });
    const coordinator = createBrowserRouteCoordinator({ ...dependencies, platform: { ...platform, go } });
    coordinator.start();
    publishRouteOpen({ browserHref: "/studio", syncRoute: true });
    const studio = window.history.state;
    publishRouteOpen({ browserHref: "/software", syncRoute: true });
    const software = window.history.state;

    window.history.replaceState(studio, "", "/studio");
    window.dispatchEvent(new PopStateEvent("popstate", { state: studio }));
    await vi.waitFor(() => expect(openRoute).toHaveBeenCalledTimes(1));

    window.history.replaceState(software, "", "/software");
    window.dispatchEvent(new PopStateEvent("popstate", { state: software }));
    await vi.waitFor(() => expect(cancelOld).toHaveBeenCalledWith("browser-route-superseded"));

    settleOld({
      status: "failed",
      committed: false,
      phase: "validating",
      error: { code: "denied", name: "Denied", message: "denied" },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(go).not.toHaveBeenCalled();
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe("/software");
    coordinator.stop();
  });

  it("routes query-only popstate changes through the canonical route operation without relaunching the app", async () => {
    installNavigation(undefined);
    const { dependencies, openRoute } = createDependencies();
    openRoute.mockReturnValue({
      result: Promise.resolve({
        status: "completed",
        committed: true,
        value: { pathname: "/software" },
        postCommit: "completed",
        issues: [],
        skipped: [],
      }),
    });
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();

    window.history.replaceState({ host: "preserve" }, "", "/software?q=air");
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    await vi.waitFor(() => expect(openRoute).toHaveBeenCalledTimes(1));

    expect(openRoute).toHaveBeenCalledWith("/software?q=air", {
      source: "route",
      syncRoute: false,
      signal: expect.any(AbortSignal),
      context: { browserHref: "/software?q=air", browserNavigationType: "traverse" },
    });
    coordinator.stop();
  });

  it("does not reopen routes for runtime-owned history and router synchronization", () => {
    installNavigation(undefined);
    const { dependencies, openRoute, platform } = createDependencies();
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();

    platform.syncRoute("/studio");

    expect(openRoute).not.toHaveBeenCalled();
    coordinator.stop();
  });

  it("shares route synchronization ownership across platform views of one runtime environment", () => {
    installNavigation(undefined);
    const environment = createBrowserRuntimeEnvironment();
    const writer = createBrowserRoutePlatform(environment);
    const observer = createBrowserRoutePlatform(environment);
    let observedOwnedSync = false;
    const unsubscribe = observer.addPopStateListener(() => {
      observedOwnedSync = observer.isRouteSyncInProgress();
    });

    writer.syncRoute("/studio?view=notes", { replace: true, dispatchPopState: true });

    expect(observedOwnedSync).toBe(true);
    unsubscribe();
  });

  it("persists the last active app route for prefetch without using it as navigation input", () => {
    const navigation = new FakeNavigation();
    installNavigation(navigation);
    const { dependencies, openRoute, setSnapshot } = createDependencies();
    window.sessionStorage.setItem("syncloudos:last-active-app-route", "/software");
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();

    setSnapshot({
      booted: true,
      statechart: { currentState: "active.application.active" },
      loginServices: { isAuthorised: true },
      application: {
        activeAppId: "com.example.studio",
        routePath: "/studio",
        multiSwitch: { status: "idle" }
      }
    });

    expect(window.sessionStorage.getItem("syncloudos:last-active-app-route")).toBe("/studio");
    expect(openRoute).not.toHaveBeenCalled();
    coordinator.stop();
  });

  it("opens the direct initial app route after a locked cold boot becomes authorised", async () => {
    installNavigation(undefined);
    window.history.replaceState({}, "", "/studio");
    const { dependencies, openRoute, setSnapshot } = createDependencies();
    setSnapshot({
      booted: false,
      statechart: { currentState: "booting" },
      loginServices: { isAuthorised: false },
      application: { activeAppId: null, routePath: "/", multiSwitch: { status: "idle" } }
    });
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();

    setSnapshot({
      booted: true,
      statechart: { currentState: "locked.loginWindow" },
      loginServices: { isAuthorised: false },
      application: { activeAppId: null, routePath: "/", multiSwitch: { status: "idle" } }
    });
    expect(openRoute).not.toHaveBeenCalled();

    setSnapshot({
      booted: true,
      statechart: { currentState: "active.webspring" },
      loginServices: { isAuthorised: true },
      application: { activeAppId: null, routePath: "/", multiSwitch: { status: "idle" } }
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(openRoute).toHaveBeenCalledTimes(1);
    expect(openRoute).toHaveBeenCalledWith("/studio", {
      source: "route",
      syncRoute: false,
      signal: expect.any(AbortSignal),
      context: { browserHref: "/studio", browserNavigationType: "push" }
    });
    coordinator.stop();
  });

  it("does not replay an authorised initial app route that boot already attempted and guard-blocked", async () => {
    installNavigation(undefined);
    window.history.replaceState({}, "", "/studio");
    const { dependencies, openRoute, setSnapshot } = createDependencies();
    setSnapshot({
      booted: false,
      statechart: { currentState: "booting" },
      loginServices: { isAuthorised: true },
      application: { activeAppId: null, routePath: "/", multiSwitch: { status: "idle" } },
    });
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();

    setSnapshot({
      booted: true,
      statechart: { currentState: "active.webspring" },
      loginServices: { isAuthorised: true },
      application: { activeAppId: null, routePath: "/", multiSwitch: { status: "idle" } },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(openRoute).not.toHaveBeenCalled();
    coordinator.stop();
  });

  it("does not replay a public initial app route that an authentication-disabled boot already guard-blocked", async () => {
    installNavigation(undefined);
    window.history.replaceState({}, "", "/public");
    const { dependencies, openRoute, setSnapshot } = createDependencies();
    setSnapshot({
      booted: false,
      statechart: { currentState: "booting" },
      loginServices: { isAuthorised: false },
      application: { activeAppId: null, routePath: "/", multiSwitch: { status: "idle" } },
    });
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();

    setSnapshot({
      booted: true,
      statechart: { currentState: "active.webspring" },
      loginServices: { isAuthorised: false },
      application: { activeAppId: null, routePath: "/", multiSwitch: { status: "idle" } },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(openRoute).not.toHaveBeenCalled();
    coordinator.stop();
  });

  it("opens an explicitly public direct app route after boot without waiting for login authorisation", async () => {
    installNavigation(undefined);
    window.history.replaceState({}, "", "/public");
    const { dependencies, openRoute, setSnapshot } = createDependencies();
    setSnapshot({
      booted: false,
      statechart: { currentState: "booting" },
      loginServices: { isAuthorised: false },
      application: { activeAppId: null, routePath: "/", multiSwitch: { status: "idle" } },
    });
    const coordinator = createBrowserRouteCoordinator(dependencies);
    coordinator.start();

    setSnapshot({
      booted: true,
      statechart: { currentState: "locked.loginWindow" },
      loginServices: { isAuthorised: false },
      application: { activeAppId: null, routePath: "/", multiSwitch: { status: "idle" } },
    });
    await vi.waitFor(() => expect(openRoute).toHaveBeenCalledTimes(1));
    expect(openRoute).toHaveBeenCalledWith("/public", {
      source: "route",
      syncRoute: false,
      signal: expect.any(AbortSignal),
      context: { browserHref: "/public", browserNavigationType: "push" },
    });
    coordinator.stop();
  });
});
