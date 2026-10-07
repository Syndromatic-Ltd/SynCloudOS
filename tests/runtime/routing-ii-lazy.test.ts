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
import { defineSynWareRoutes } from "../../src/SynCloudOS/AppSDK/defineSynWareRoutes";
import { createOperationCoordinator } from "../../src/SynCloudOS/Operations/OperationCoordinator";
import { createAppRouteSession } from "../../src/SynCloudOS/Routing/AppRouteSession";
import { createRouteModuleLoader } from "../../src/SynCloudOS/Routing/RouteModuleLoader";
import {
  createRouteTransitionController,
} from "../../src/SynCloudOS/Routing/RouteTransition";
import type { RouteServiceScope } from "../../src/SynCloudOS/Routing/RouteServiceScope";

function emptyPreparationScope(signal: AbortSignal): RouteServiceScope {
  return Object.freeze({
    require() {
      if (signal.aborted) throw new DOMException("Route preparation authority has been revoked.", "InvalidStateError");
      throw new DOMException("The route does not declare guard-safe services.", "SecurityError");
    },
    optional() {
      return Object.freeze({ available: false, client: null, denial: Object.freeze({ code: "denied" as const, message: "The route does not declare guard-safe services." }) });
    },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function operations() {
  let id = 0;
  return createOperationCoordinator({
    runtimeId: "runtime:routing-ii-lazy",
    now: () => Date.now(),
    randomUUID: () => `route-lazy-${++id}`,
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
}

describe("Routing II lazy route modules", () => {
  it("accepts a real ESM module namespace without treating Symbol.toStringTag as route topology", async () => {
    const importer = vi.fn(() => import("../fixtures/routing-ii-lazy-module"));
    const graph = defineSynWareRoutes({
      id: "routing.lazy.esm-namespace",
      routes: [{ name: "music", path: "", lazy: importer }],
    } as const);
    const loader = createRouteModuleLoader({ getBundleGeneration: () => 1 });

    await expect(loader.load(graph.getRoute("music")!)).resolves.toMatchObject({
      component: expect.any(Function),
    });
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent imports while caller abort only detaches that caller", async () => {
    const pending = deferred<Readonly<{ component: () => null }>>();
    const importer = vi.fn(() => pending.promise);
    const graph = defineSynWareRoutes({
      id: "routing.lazy.coalesce",
      routes: [{ name: "music", path: "", lazy: importer }],
    } as const);
    const route = graph.getRoute("music")!;
    const loader = createRouteModuleLoader({ getBundleGeneration: () => 1 });
    const first = new AbortController();
    const a = loader.load(route, { signal: first.signal });
    const b = loader.load(route);
    first.abort("caller-left");
    pending.resolve(Object.freeze({ component: () => null }));

    await expect(a).rejects.toMatchObject({ name: "AbortError" });
    await expect(b).resolves.toMatchObject({ component: expect.any(Function) });
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("fences stale bundle generations and imports the replacement generation afresh", async () => {
    let generation = 1;
    const first = deferred<Readonly<{ component: () => null }>>();
    const second = deferred<Readonly<{ component: () => null }>>();
    const importer = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const graph = defineSynWareRoutes({
      id: "routing.lazy.generation",
      routes: [{ name: "music", path: "", lazy: importer }],
    } as const);
    const route = graph.getRoute("music")!;
    const loader = createRouteModuleLoader({ getBundleGeneration: () => generation });
    const old = loader.load(route);
    generation = 2;
    first.resolve(Object.freeze({ component: () => null }));
    await expect(old).rejects.toThrow(/generation/i);

    const current = loader.load(route);
    second.resolve(Object.freeze({ component: () => null }));
    await expect(current).resolves.toMatchObject({ component: expect.any(Function) });
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it("caches an import failure until explicit retry and rejects hidden topology", async () => {
    const importer = vi.fn()
      .mockRejectedValueOnce(new Error("chunk-offline"))
      .mockResolvedValueOnce(Object.freeze({ component: () => null }));
    const graph = defineSynWareRoutes({
      id: "routing.lazy.retry",
      routes: [{ name: "music", path: "", lazy: importer }],
    } as const);
    const route = graph.getRoute("music")!;
    const loader = createRouteModuleLoader({ getBundleGeneration: () => 1 });

    await expect(loader.load(route)).rejects.toThrow("chunk-offline");
    await expect(loader.load(route)).rejects.toThrow("chunk-offline");
    expect(importer).toHaveBeenCalledTimes(1);
    await expect(loader.retry(route)).resolves.toMatchObject({ component: expect.any(Function) });
    expect(importer).toHaveBeenCalledTimes(2);

    const hiddenGraph = defineSynWareRoutes({
      id: "routing.lazy.hidden",
      routes: [{
        name: "music",
        path: "",
        lazy: async () => ({ children: [{ name: "hidden", path: "hidden" }] } as never),
      }],
    } as const);
    await expect(createRouteModuleLoader({ getBundleGeneration: () => 1 }).load(hiddenGraph.getRoute("music")!))
      .rejects.toThrow(/topology|children/i);
  });

  it("preloads code without invoking route data or activation hooks", async () => {
    const data = vi.fn();
    const activate = vi.fn();
    const importer = vi.fn(async () => Object.freeze({ load: data, activate, component: () => null }));
    const graph = defineSynWareRoutes({
      id: "routing.lazy.preload",
      routes: [{ name: "music", path: "", lazy: importer }],
    } as const);
    const loader = createRouteModuleLoader({ getBundleGeneration: () => 1 });

    await expect(loader.preload(graph.getRoute("music")!)).resolves.toMatchObject({ component: expect.any(Function) });
    expect(importer).toHaveBeenCalledTimes(1);
    expect(data).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });

  it("loads a lazy entering guard before commit and honors its block", async () => {
    const guard = vi.fn(() => ({ outcome: "block", reason: "lazy-guard" } as const));
    const load = vi.fn();
    const importer = vi.fn(async () => Object.freeze({ beforeEnter: guard, load }));
    const graph = defineSynWareRoutes({
      id: "routing.lazy.guard",
      routes: [{
        name: "music",
        path: "",
        children: [
          { name: "music.home", path: "home" },
          { name: "music.album", path: "album", lazy: importer },
        ],
      }],
    } as const).bind("/music", "music");
    const initial = graph.recognize("/music/home");
    if (initial.kind !== "match") throw new Error("fixture route missing");
    const moduleLoader = createRouteModuleLoader({ getBundleGeneration: () => 1 });
    const commit = vi.fn(async () => ({ routeRevision: 1, sessionId: "music:1" }));
    const transitions = createRouteTransitionController({
      runtimeId: "runtime:routing-ii-lazy",
      graph,
      operations: operations(),
      getCurrentRoute: () => initial,
      getAuthorizationGeneration: () => 1,
      isRuntimeLive: () => true,
      createPreparationScope: ({ signal }) => emptyPreparationScope(signal),
      resolveRouteDefinition: (definition, signal) => moduleLoader.resolveDefinition(definition, { signal }),
      commit,
    });

    await expect(transitions.transitionTo({ name: "music.album" }).result)
      .resolves.toMatchObject({ outcome: "blocked", committed: false, reason: "lazy-guard" });
    expect(importer).toHaveBeenCalledTimes(1);
    expect(guard).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it("resolves lazy executable code inside the committed route session before running route data", async () => {
    const routeLoad = vi.fn(async () => "lazy-data");
    const importer = vi.fn(async () => Object.freeze({ load: routeLoad, component: () => null }));
    const graph = defineSynWareRoutes({
      id: "routing.lazy.session",
      routes: [{ name: "music", path: "", lazy: importer }],
    } as const).bind("/music", "music");
    const moduleLoader = createRouteModuleLoader({ getBundleGeneration: () => 1 });
    const session = createAppRouteSession({
      graph,
      getBundleGeneration: () => 1,
      getAuthorizationGeneration: () => 1,
      getSessionId: () => "session:music",
      createLoaderServices: () => Object.freeze({ resolve: () => null }),
      resolveRouteDefinition: (definition, signal) => moduleLoader.resolveDefinition(definition, { signal }),
      routeDataTimeoutMs: 100,
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    const route = graph.recognize("/music");
    if (route.kind !== "match") throw new Error("fixture route missing");

    await expect(session.commit(route, { operationId: "lazy:session" }))
      .resolves.toMatchObject({ status: "ready" });
    expect(importer).toHaveBeenCalledTimes(1);
    expect(routeLoad).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().nodes.music).toMatchObject({ state: "ready", data: "lazy-data" });
    expect(session.getDefinition("music")?.component).toEqual(expect.any(Function));
  });
});
