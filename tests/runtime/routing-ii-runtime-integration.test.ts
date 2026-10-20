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

import { afterEach, describe, expect, it, vi } from "vitest";
import { createSynWare, createSynWareBundle } from "../../src/SynCloudOS/AppSDK/createSynWare";
import { defineSynWareRoutes } from "../../src/SynCloudOS/AppSDK/defineSynWareRoutes";
import { createTestRuntime } from "./helpers";
import { defineSynWareServiceToken } from "../../src/SynCloudOS/AppSDK/serviceToken";
import { routeQuery } from "../../src/SynCloudOS/Routing/routeQuery";

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => { for (const runtime of runtimes.splice(0)) await runtime.dispose(); });

function fixture(block: () => boolean, events: string[]) {
  const routes = defineSynWareRoutes({ id: "host.music", routes: [{ name: "com.example.music", path: "", children: [
    { name: "music.artist", path: "artist/:artistId", beforeEnter: () => {
      events.push("enter");
      return block() ? { outcome: "block", reason: "catalogue-locked" } as const : { outcome: "allow" } as const;
    }, beforeLeave: () => { events.push("leave"); return { outcome: "allow" } as const; } },
    { name: "music.album", path: "album/:albumId" },
  ] }] } as const);
  const definition = createSynWare({ manifest: { schemaVersion: 1, bundleIdentifier: "com.example.music", version: "1.0.0", displayName: "Music",
    routes: [{ path: "/music", primary: true, match: "prefix" }], permissions: ["app.open.public"] },
    root: () => null, routes });
  const runtime = createTestRuntime({ initialBundles: [createSynWareBundle(definition)] });
  runtimes.push(runtime);
  runtime.store.mutate(draft => { draft.loginServices.isAuthorised = true; });
  return runtime;
}

describe("Routing II actual host integration", () => {
  it("preserves canonical invalid-query identity for programmatic route opens", async () => {
    const routes = defineSynWareRoutes({
      id: "query.programmatic",
      routes: [{
        name: "com.example.music",
        path: "",
        query: { page: routeQuery.integer({ defaultValue: 1, min: 1, max: 5 }) },
      }],
    } as const);
    const definition = createSynWare({ manifest: {
      schemaVersion: 1,
      bundleIdentifier: "com.example.music",
      version: "1.0.0",
      displayName: "Music",
      routes: [{ path: "/music", primary: true, match: "prefix" }],
      permissions: ["app.open.public"],
    }, root: () => null, routes });
    const runtime = createTestRuntime({ initialBundles: [createSynWareBundle(definition)] });
    runtimes.push(runtime);
    runtime.store.mutate(draft => { draft.loginServices.isAuthorised = true; });

    await expect(runtime.routes.openRoute("/music?page=2x", { source: "app:caller" }).result)
      .resolves.toMatchObject({
        status: "failed",
        committed: false,
        error: { code: "route-invalid-query" },
      });
  });

  it("preserves canonical not-found identity for an unknown nested app route", async () => {
    const routes = defineSynWareRoutes({
      id: "nested.not-found",
      routes: [{ name: "com.example.music", path: "", children: [{ name: "music.artist", path: "artist/:artistId" }] }],
    } as const);
    const definition = createSynWare({ manifest: {
      schemaVersion: 1,
      bundleIdentifier: "com.example.music",
      version: "1.0.0",
      displayName: "Music",
      routes: [{ path: "/music", primary: true, match: "prefix" }],
      permissions: ["app.open.public"],
    }, root: () => null, routes });
    const runtime = createTestRuntime({ initialBundles: [createSynWareBundle(definition)] });
    runtimes.push(runtime);
    runtime.store.mutate(draft => { draft.loginServices.isAuthorised = true; });

    await expect(runtime.routes.openRoute("/music/unknown", { source: "app:caller" }).result)
      .resolves.toMatchObject({
        status: "failed",
        committed: false,
        error: { code: "route-not-found" },
      });
  });

  it("prefetches explicitly declared read-only route data without activation or history side effects", async () => {
    const token = defineSynWareServiceToken<{ read(): Promise<string> }>({ id: "catalogue", contractVersion: "1" });
    let retained: { read(): Promise<string> } | undefined;
    const routeLoad = vi.fn(async ({ services }: { services: { require<T>(value: typeof token): T } }) => {
      retained = services.require(token);
      return retained.read();
    });
    const routes = defineSynWareRoutes({
      id: "preload.read-only",
      routes: [{
        name: "com.example.music",
        path: "",
        preload: { data: { services: [token] } },
        load: routeLoad,
      }],
    } as const);
    const definition = createSynWare({ manifest: {
      schemaVersion: 1,
      bundleIdentifier: "com.example.music",
      version: "1.0.0",
      displayName: "Music",
      routes: [{ path: "/music", primary: true, match: "prefix" }],
      services: [{ id: "catalogue" }],
      permissions: ["app.open.public"],
    }, root: () => null, routes });
    const runtime = createTestRuntime({ initialBundles: [createSynWareBundle(definition)] });
    runtimes.push(runtime);
    runtime.store.mutate(draft => { draft.loginServices.isAuthorised = true; });
    await runtime.bundles.loadBundle("com.example.music");
    const mountedFactory = vi.fn(() => ({ mutate: () => "forbidden" }));
    const read = vi.fn(async () => "prefetched");
    runtime.services.registerService({ id: "catalogue", displayName: "Catalogue", description: "Test catalogue", availability: "available" });
    runtime.services.register({
      id: "catalogue",
      contractVersion: "1",
      createAppClient: mountedFactory,
      createRoutePreparationClient: () => ({ read }),
    });
    const launch = vi.spyOn(runtime.launchServices, "openApp");
    const sync = vi.spyOn(runtime.environment.routeSynchronization, "syncRoute");

    await expect(runtime.routes.routeGraph.preload("com.example.music", "/music", new AbortController().signal, { data: true }))
      .resolves.toMatchObject({ status: "ready", dataPrefetched: true });

    expect(routeLoad).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
    expect(mountedFactory).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
    expect(() => retained!.read()).toThrow(/revoked|abort|authority/i);
  });

  it("rejects data prefetch before any data request when a loader did not opt in", async () => {
    const load = vi.fn(async () => "should-not-run");
    const routes = defineSynWareRoutes({
      id: "preload.no-data-capability",
      routes: [{ name: "com.example.music", path: "", load }],
    } as const);
    const definition = createSynWare({ manifest: {
      schemaVersion: 1,
      bundleIdentifier: "com.example.music",
      version: "1.0.0",
      displayName: "Music",
      routes: [{ path: "/music", primary: true, match: "prefix" }],
      permissions: ["app.open.public"],
    }, root: () => null, routes });
    const runtime = createTestRuntime({ initialBundles: [createSynWareBundle(definition)] });
    runtimes.push(runtime);
    runtime.store.mutate(draft => { draft.loginServices.isAuthorised = true; });
    await runtime.bundles.loadBundle("com.example.music");

    await expect(runtime.routes.routeGraph.preload("com.example.music", "/music", new AbortController().signal, { data: true }))
      .rejects.toMatchObject({ name: "SecurityError" });
    expect(load).not.toHaveBeenCalled();
  });

  it("denies read services that were not declared by the route preload capability", async () => {
    const allowed = defineSynWareServiceToken<{ read(): Promise<string> }>({ id: "catalogue", contractVersion: "1" });
    const undeclared = defineSynWareServiceToken<{ read(): Promise<string> }>({ id: "private-catalogue", contractVersion: "1" });
    const undeclaredFactory = vi.fn(() => ({ read: async () => "forbidden" }));
    const load = vi.fn(async ({ services }: { services: { require<T>(value: typeof undeclared): T } }) => services.require(undeclared).read());
    const routes = defineSynWareRoutes({
      id: "preload.token-boundary",
      routes: [{ name: "com.example.music", path: "", preload: { data: { services: [allowed] } }, load }],
    } as const);
    const definition = createSynWare({ manifest: {
      schemaVersion: 1,
      bundleIdentifier: "com.example.music",
      version: "1.0.0",
      displayName: "Music",
      routes: [{ path: "/music", primary: true, match: "prefix" }],
      services: [{ id: "catalogue" }, { id: "private-catalogue" }],
      permissions: ["app.open.public"],
    }, root: () => null, routes });
    const runtime = createTestRuntime({ initialBundles: [createSynWareBundle(definition)] });
    runtimes.push(runtime);
    runtime.store.mutate(draft => { draft.loginServices.isAuthorised = true; });
    await runtime.bundles.loadBundle("com.example.music");
    runtime.services.registerService({ id: "catalogue", displayName: "Catalogue", description: "Allowed", availability: "available" });
    runtime.services.registerService({ id: "private-catalogue", displayName: "Private catalogue", description: "Denied", availability: "available" });
    runtime.services.register({ id: "catalogue", contractVersion: "1", createRoutePreparationClient: () => ({ read: async () => "allowed" }) });
    runtime.services.register({ id: "private-catalogue", contractVersion: "1", createRoutePreparationClient: undeclaredFactory });

    await expect(runtime.routes.routeGraph.preload("com.example.music", "/music", new AbortController().signal, { data: true }))
      .rejects.toThrow(/not declared.*read-only route prefetch/i);
    expect(load).toHaveBeenCalledTimes(1);
    expect(undeclaredFactory).not.toHaveBeenCalled();
  });

  it("revokes in-flight data prefetch immediately when authorization changes", async () => {
    const token = defineSynWareServiceToken<{ read(): Promise<string> }>({ id: "catalogue", contractVersion: "1" });
    let releaseRead!: (value: string) => void;
    const pendingRead = new Promise<string>((resolve) => { releaseRead = resolve; });
    let loaderSignal: AbortSignal | undefined;
    const load = vi.fn(async ({ services, signal }: { services: { require<T>(value: typeof token): T }; signal: AbortSignal }) => {
      loaderSignal = signal;
      return services.require(token).read();
    });
    const routes = defineSynWareRoutes({
      id: "preload.revoke",
      routes: [{ name: "com.example.music", path: "", preload: { data: { services: [token] } }, load }],
    } as const);
    const definition = createSynWare({ manifest: {
      schemaVersion: 1,
      bundleIdentifier: "com.example.music",
      version: "1.0.0",
      displayName: "Music",
      routes: [{ path: "/music", primary: true, match: "prefix" }],
      services: [{ id: "catalogue" }],
      permissions: ["app.open.public"],
    }, root: () => null, routes });
    const runtime = createTestRuntime({ initialBundles: [createSynWareBundle(definition)] });
    runtimes.push(runtime);
    runtime.store.mutate(draft => { draft.loginServices.isAuthorised = true; });
    await runtime.bundles.loadBundle("com.example.music");
    runtime.services.registerService({ id: "catalogue", displayName: "Catalogue", description: "Test catalogue", availability: "available" });
    runtime.services.register({ id: "catalogue", contractVersion: "1", createRoutePreparationClient: () => ({ read: () => pendingRead }) });
    let generation = 1;
    vi.spyOn(runtime.identity.session, "getRevision").mockImplementation(() => generation);
    let notify: (() => void) | undefined;
    vi.spyOn(runtime.identity.session, "subscribe").mockImplementation(listener => { notify = listener; return vi.fn(); });

    const prefetch = runtime.routes.routeGraph.preload("com.example.music", "/music", new AbortController().signal, { data: true });
    await vi.waitFor(() => expect(loaderSignal).toBeDefined());
    generation++;
    notify?.();

    await expect(prefetch).rejects.toMatchObject({ name: "SecurityError" });
    expect(loaderSignal!.aborted).toBe(true);
    releaseRead("late");
    await Promise.resolve();
  });

  it("revokes a never-resolving guard immediately when canonical authority changes", async () => {
    let guardSignal: AbortSignal | undefined;
    const routes = defineSynWareRoutes({ id: "guard.pending", routes: [{ name: "com.example.music", path: "", beforeEnter: ({ signal }) => {
      guardSignal = signal;
      return new Promise<never>(() => undefined);
    } }] });
    const definition = createSynWare({ manifest: { schemaVersion: 1, bundleIdentifier: "com.example.music", version: "1.0.0", displayName: "Music", routes: [{ path: "/music", primary: true, match: "prefix" }], permissions: ["app.open.public"] }, root: () => null, routes });
    const runtime = createTestRuntime({ initialBundles: [createSynWareBundle(definition)] });
    runtimes.push(runtime);
    runtime.store.mutate(draft => { draft.loginServices.isAuthorised = true; });
    let generation = 1;
    vi.spyOn(runtime.identity.session, "getRevision").mockImplementation(() => generation);
    let notify: (() => void) | undefined;
    const unsubscribe = vi.fn();
    vi.spyOn(runtime.identity.session, "subscribe").mockImplementation(listener => { notify = listener; return unsubscribe; });
    const handle = runtime.routes.openRoute("/music");
    let result: unknown;
    void handle.result.then(value => { result = value; });
    await vi.waitFor(() => expect(guardSignal).toBeDefined());
    generation++;
    notify?.();
    await vi.waitFor(() => expect(result).toMatchObject({ status: "failed", committed: false }), { timeout: 500 });
    expect(guardSignal!.aborted).toBe(true);
    expect(runtime.store.getSnapshot().application.activeAppId).toBeNull();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("rechecks authority immediately before commit after an awaited host fence", async () => {
    const runtime = fixture(() => false, []);
    const sync = vi.spyOn(runtime.environment.routeSynchronization, "syncRoute");
    let generation = 0;
    vi.spyOn(runtime.identity.session, "getRevision").mockImplementation(() => generation);
    const result = await runtime.routes.openRoute("/music/artist/air", {
      hostBeforeCommit: async () => { generation++; },
    }).result;
    expect(result).toMatchObject({ status: "failed", committed: false });
    expect(runtime.store.getSnapshot().application.activeAppId).toBeNull();
    expect(sync).not.toHaveBeenCalled();
  });

  it("rechecks canonical route policy immediately before commit after an awaited host fence", async () => {
    const runtime = fixture(() => false, []);
    const sync = vi.spyOn(runtime.environment.routeSynchronization, "syncRoute");
    const originalAuthorise = runtime.policy.authorise.bind(runtime.policy);
    let denyRoute = false;
    vi.spyOn(runtime.policy, "authorise").mockImplementation((request) => {
      const decision = originalAuthorise(request);
      if (!denyRoute || request.action !== "route.open") return decision;
      return Object.freeze({ ...decision, allowed: false, reason: "route policy changed before commit" });
    });

    const result = await runtime.routes.openRoute("/music/artist/air", {
      hostBeforeCommit: async () => { denyRoute = true; },
    }).result;

    expect(result).toMatchObject({ status: "failed", committed: false });
    expect(runtime.store.getSnapshot().application.activeAppId).toBeNull();
    expect(sync).not.toHaveBeenCalled();
  });

  it("runs the parameter-owning branch guard again when its parameters change", async () => {
    let blocked = false;
    const events: string[] = [];
    const runtime = fixture(() => blocked, events);
    await runtime.routes.openRoute("/music/artist/air").result;
    blocked = true;
    await expect(runtime.routes.openRoute("/music/artist/justice").result).resolves.toMatchObject({ status: "failed", committed: false });
    expect(runtime.store.getSnapshot().application.routePath).toBe("/music/artist/air");
    expect(events).toEqual(["enter", "leave", "enter"]);
  });

  it("uses only declared guard-safe service projections and revokes retained preparation methods", async () => {
    const token = defineSynWareServiceToken<{ read(): string }>({ id: "catalogue", contractVersion: "1" });
    let retained: { read(): string } | undefined;
    const routes = defineSynWareRoutes({ id: "guard-services", routes: [{ name: "com.example.music", path: "", beforeEnter: ({ services }) => {
      retained = services.require(token);
      expect(retained.read()).toBe("safe-read");
      return { outcome: "allow" };
    } }] });
    const definition = createSynWare({ manifest: { schemaVersion: 1, bundleIdentifier: "com.example.music", version: "1.0.0", displayName: "Music", routes: [{ path: "/music", primary: true, match: "prefix" }], services: [{ id: "catalogue" }], permissions: ["app.open.public"] }, root: () => null, routes });
    const runtime = createTestRuntime({ initialBundles: [createSynWareBundle(definition)] });
    runtimes.push(runtime);
    runtime.store.mutate(draft => { draft.loginServices.isAuthorised = true; });
    const mutationFactory = vi.fn(() => ({ read: () => "unsafe" }));
    runtime.services.registerService({ id: "catalogue", displayName: "Catalogue", description: "Test catalogue", availability: "available" });
    runtime.services.register({ id: "catalogue", contractVersion: "1", createAppClient: mutationFactory });
    await expect(runtime.routes.openRoute("/music").result).resolves.toMatchObject({ status: "failed", committed: false });
    expect(mutationFactory).not.toHaveBeenCalled();
    runtime.services.register({ id: "catalogue", contractVersion: "1", createAppClient: mutationFactory, createRoutePreparationClient: () => ({ read: () => "safe-read" }) });
    const accepted = await runtime.routes.openRoute("/music").result;
    expect(accepted, JSON.stringify(accepted)).toMatchObject({ status: "completed", committed: true });
    expect(() => retained!.read()).toThrow();
    expect(mutationFactory).not.toHaveBeenCalled();
  });

  it("executes cold entering guards before launch or history through the real runtime owner", async () => {
    const events: string[] = [];
    let blocked = true;
    const runtime = fixture(() => blocked, events);
    const sync = vi.spyOn(runtime.environment.routeSynchronization, "syncRoute");
    const blockedHandle = runtime.routes.openRoute("/music/artist/air");
    const result = await blockedHandle.result;
    expect(events).toEqual(["enter"]);
    expect(result).toMatchObject({ status: "failed", committed: false });
    expect(runtime.store.getSnapshot().application.activeAppId).toBeNull();
    expect(sync).not.toHaveBeenCalled();
    blocked = false;
    const retry = blockedHandle.retry();
    expect(retry.operationId).not.toBe(blockedHandle.operationId);
    expect(retry.correlationId).toBe(blockedHandle.correlationId);
    await expect(retry.result).resolves.toMatchObject({ status: "completed", committed: true });
    expect(events).toEqual(["enter", "enter"]);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(() => blockedHandle.retry()).toThrow(/superseded/i);
  });

  it("does not apply the lifecycle-hook deadline to committed mounted-route settlement during boot", async () => {
    const routes = defineSynWareRoutes({
      id: "boot.mounted-settlement",
      routes: [{ name: "com.example.music", path: "" }],
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
    const runtime = createTestRuntime({
      initialBundles: [createSynWareBundle(definition)],
      lifecycleHookTimeoutMs: 100,
    });
    runtimes.push(runtime);
    runtime.store.mutate(draft => { draft.loginServices.isAuthorised = true; });

    const mountController = new AbortController();
    let requestSignal: AbortSignal | undefined;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    let releaseSettlement!: () => void;
    const settlement = new Promise<void>((resolve) => { releaseSettlement = resolve; });
    const releaseMount = runtime.routes.mountedRoutes.attach("com.example.music", {
      signal: mountController.signal,
      async loadAndRender(request) {
        requestSignal = request.signal;
        markStarted();
        await settlement;
      },
    });

    const handle = runtime.routes.openRoute("/music", { source: "boot", syncRoute: false });
    await started;
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(requestSignal?.aborted).toBe(false);
    releaseSettlement();
    await expect(handle.result).resolves.toMatchObject({ status: "completed", committed: true });

    releaseMount();
    mountController.abort();
  });

  it("projects canonical blocked and redirected route outcomes without leaking guard or target data", async () => {
    const secret = "SECRET_INSPECTOR_ROUTE";
    const routes = defineSynWareRoutes({ id: "inspector.transitions", routes: [{ name: "com.example.music", path: "", children: [
      { name: "music.blocked", path: "blocked", beforeEnter: () => ({ outcome: "block", reason: secret }) },
      { name: "music.redirect", path: "redirect", beforeEnter: () => ({ outcome: "redirect", target: { name: "music.blocked" } }) },
    ] }] } as const);
    const definition = createSynWare({ manifest: { schemaVersion: 1, bundleIdentifier: "com.example.music", version: "1.0.0", displayName: "Music",
      routes: [{ path: "/music", primary: true, match: "prefix" }], permissions: ["app.open.public"] },
      root: () => null, routes });
    const runtime = createTestRuntime({ initialBundles: [createSynWareBundle(definition)] });
    runtimes.push(runtime);
    runtime.store.mutate(draft => { draft.loginServices.isAuthorised = true; });

    const changed = vi.fn();
    const remove = runtime.routes.subscribeTransitions(changed);
    const blockedHandle = runtime.routes.openRoute("/music/blocked");
    await expect(blockedHandle.result).resolves.toMatchObject({ status: "failed", committed: false, error: { code: "route-guard-blocked" } });
    const predecessor = runtime.routes.openRoute("/music/redirect");
    const redirected = await predecessor.result;
    expect(redirected).toMatchObject({ status: "failed", committed: false, error: { code: "route-redirect" } });
    if (redirected.status !== "failed" || redirected.error.code !== "route-redirect") throw Error("redirect fixture mismatch");
    const successorId = (redirected.error.cause as { successorId: string }).successorId;
    const successor = runtime.routes.getRedirectSuccessor(predecessor.operationId, successorId);
    if (!successor) throw Error("canonical redirect successor was not retained");
    await successor.result;

    const transitions = runtime.routes.inspectTransitions();
    expect(transitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ operationId: blockedHandle.operationId, correlationId: blockedHandle.correlationId,
        appId: "com.example.music", outcome: "blocked", committed: false }),
      expect.objectContaining({ operationId: predecessor.operationId, correlationId: predecessor.correlationId,
        appId: "com.example.music", outcome: "redirected", successorId, committed: false }),
    ]));
    expect(runtime.routes.inspectTransitions(1)).toHaveLength(1);
    expect(changed).toHaveBeenCalled();
    expect(JSON.stringify(transitions)).not.toContain(secret);
    expect(Object.isFrozen(transitions)).toBe(true);
    expect(transitions.every(record => Object.isFrozen(record))).toBe(true);
    remove();
  });

  it("runs leaving guards and preserves the active app across nested path navigation", async () => {
    const events: string[] = [];
    const runtime = fixture(() => false, events);
    await runtime.routes.openRoute("/music/artist/air").result;
    const launch = vi.spyOn(runtime.launchServices, "openApp");
    await expect(runtime.routes.openRoute("/music/album/moon-safari").result).resolves.toMatchObject({ status: "completed" });
    expect(events).toEqual(["enter", "leave"]);
    expect(launch).not.toHaveBeenCalled();
    expect(runtime.store.getSnapshot().application.routePath).toBe("/music/album/moon-safari");
  });
});
