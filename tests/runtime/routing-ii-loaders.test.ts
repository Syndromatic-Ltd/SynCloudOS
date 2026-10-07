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
import { createAppRouteSession } from "../../src/SynCloudOS/Routing/AppRouteSession";
import type { AppRouteSessionOptions } from "../../src/SynCloudOS/Routing/AppRouteSession";
import type { SynWareRouteLoadContext } from "../../src/SynCloudOS/Routing/appRouteTypes";

const Root = () => null;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function graph(loaders: {
  artist?: (artistId: string, signal: AbortSignal, services: unknown) => unknown | Promise<unknown>;
  album?: (artistId: string, albumId: string, signal: AbortSignal, parentData: unknown, services: unknown) => unknown | Promise<unknown>;
}) {
  return defineSynWareRoutes({
    id: "routing.loaders",
    routes: [{
      name: "music",
      path: "",
      component: Root,
      children: [{
        name: "music.artist",
        path: "artist/:artistId",
        component: Root,
        load: ({ params, signal, services }) => loaders.artist?.(params.artistId as string, signal, services),
        children: [{
          name: "music.artist.album",
          path: "album/:albumId",
          component: Root,
          load: ({ params, signal, parentData, services }) => loaders.album?.(
            params.artistId as string,
            params.albumId as string,
            signal,
            parentData,
            services,
          ),
        }],
      }],
    }],
  } as const).bind("/music", "music");
}

function createSession(
  routeGraph: ReturnType<typeof graph>,
  controls: {
    bundleGeneration?: () => number;
    authorizationGeneration?: () => number;
    sessionId?: () => string;
    timeoutMs?: number;
    services?: SynWareRouteLoadContext["services"];
    resolveRouteDefinition?: AppRouteSessionOptions["resolveRouteDefinition"];
  } = {},
) {
  const services = controls.services ?? Object.freeze({
    require<T>(token: { id: string }): T {
      return Object.freeze({ id: token.id }) as T;
    },
    optional: () => ({ available: false, client: null, denial: { code: "unavailable" as const, message: "Fixture service unavailable." } }),
  });
  return createAppRouteSession({
    graph: routeGraph,
    getBundleGeneration: controls.bundleGeneration ?? (() => 1),
    getAuthorizationGeneration: controls.authorizationGeneration ?? (() => 1),
    getSessionId: controls.sessionId ?? (() => "session:music"),
    createLoaderServices: () => services,
    resolveRouteDefinition: controls.resolveRouteDefinition,
    routeDataTimeoutMs: controls.timeoutMs ?? 500,
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
}

describe("Routing II route loaders", () => {
  it("seeds authorized cached ancestors before awaiting the next lazy module", async () => {
    const parent = { player: "retained" };
    const artist = vi.fn(() => parent);
    const routeGraph = graph({ artist, album: (_artist, album) => album });
    const gate = deferred<void>();
    let delay = false;
    const session = createSession(routeGraph, { resolveRouteDefinition: async definition => {
      if (delay) await gate.promise;
      return definition;
    } });
    const first = routeGraph.recognize("/music/artist/air/album/moon");
    const next = routeGraph.recognize("/music/artist/air/album/talkie");
    if (first.kind !== "match" || next.kind !== "match") throw new Error("fixture route missing");
    await session.commit(first, { operationId: "first" });
    delay = true;
    const loading = session.commit(next, { operationId: "next" });
    expect(session.getSnapshot().nodes["music.artist"]).toMatchObject({ state: "ready", data: parent });
    expect(session.getSnapshot().nodes["music.artist.album"]).toBeUndefined();
    gate.resolve(); await loading;
    expect(artist).toHaveBeenCalledOnce(); session.dispose();
  });

  it("partitions cached data by numeric authorization revision even when the route and params are unchanged", async () => {
    let authorization = 1;
    const artist = vi.fn(() => ({ revision: authorization }));
    const routeGraph = graph({ artist });
    const session = createSession(routeGraph, { authorizationGeneration: () => authorization });
    const target = routeGraph.recognize("/music/artist/air");
    if (target.kind !== "match") throw new Error("fixture route missing");
    await session.commit(target, { operationId: "first" });
    authorization++;
    await session.commit(target, { operationId: "second" });
    expect(artist).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot().nodes["music.artist"]).toMatchObject({ state: "ready", data: { revision: 2 } });
    session.dispose();
  });
  it("loads parent before dependent child and passes resolved parent data", async () => {
    const parent = deferred<string>();
    const child = vi.fn(async (_artist: string, _album: string, _signal: AbortSignal, parentData: unknown) => {
      return `album:${String(parentData)}`;
    });
    const artist = vi.fn(() => parent.promise);
    const routeGraph = graph({ artist, album: child });
    const session = createSession(routeGraph);
    const target = routeGraph.recognize("/music/artist/justice/album/cross");
    if (target.kind !== "match") throw new Error("fixture route missing");

    const load = session.commit(target, { operationId: "op:1" });
    await Promise.resolve();
    expect(artist).toHaveBeenCalledTimes(1);
    expect(child).not.toHaveBeenCalled();

    parent.resolve("artist:justice");
    await expect(load).resolves.toMatchObject({ status: "ready" });
    expect(child).toHaveBeenCalledWith(
      "justice",
      "cross",
      expect.any(AbortSignal),
      "artist:justice",
      expect.anything(),
    );
    expect(session.getSnapshot().nodes["music.artist.album"]).toMatchObject({
      state: "ready",
      data: "album:artist:justice",
    });
  });

  it("reuses unchanged parent data while child params change, then invalidates descendants when parent params change", async () => {
    const artist = vi.fn(async (artistId: string) => `artist:${artistId}`);
    const album = vi.fn(async (_artistId: string, albumId: string) => `album:${albumId}`);
    const routeGraph = graph({ artist, album });
    const session = createSession(routeGraph);
    const cross = routeGraph.recognize("/music/artist/justice/album/cross");
    const discovery = routeGraph.recognize("/music/artist/justice/album/discovery");
    const moon = routeGraph.recognize("/music/artist/air/album/moon-safari");
    if (cross.kind !== "match" || discovery.kind !== "match" || moon.kind !== "match") throw new Error("fixture route missing");

    await session.commit(cross, { operationId: "op:cross" });
    await session.commit(discovery, { operationId: "op:discovery" });
    expect(artist).toHaveBeenCalledTimes(1);
    expect(album).toHaveBeenCalledTimes(2);

    await session.commit(moon, { operationId: "op:moon" });
    expect(artist).toHaveBeenCalledTimes(2);
    expect(album).toHaveBeenCalledTimes(3);
  });

  it("suppresses reverse-order stale results even when an old loader ignores abort", async () => {
    const justice = deferred<string>();
    const air = deferred<string>();
    const artist = vi.fn((artistId: string) => artistId === "justice" ? justice.promise : air.promise);
    const routeGraph = graph({ artist });
    const session = createSession(routeGraph);
    const justiceRoute = routeGraph.recognize("/music/artist/justice");
    const airRoute = routeGraph.recognize("/music/artist/air");
    if (justiceRoute.kind !== "match" || airRoute.kind !== "match") throw new Error("fixture route missing");

    const first = session.commit(justiceRoute, { operationId: "op:justice" });
    await Promise.resolve();
    const latest = session.commit(airRoute, { operationId: "op:air" });
    air.resolve("artist:air");
    await expect(latest).resolves.toMatchObject({ status: "ready" });
    justice.resolve("artist:justice");
    await expect(first).resolves.toMatchObject({ status: "stale" });

    expect(session.getSnapshot().route?.params).toMatchObject({ artistId: "air" });
    expect(session.getSnapshot().nodes["music.artist"]).toMatchObject({
      state: "ready",
      data: "artist:air",
    });
  });

  it("disposes a stale releasable result exactly once after bundle or authorization generation changes", async () => {
    let bundleGeneration = 1;
    let authorizationGeneration = 1;
    const pending = deferred<{ dispose(): void }>();
    const dispose = vi.fn();
    const routeGraph = graph({ artist: () => pending.promise });
    const session = createSession(routeGraph, {
      bundleGeneration: () => bundleGeneration,
      authorizationGeneration: () => authorizationGeneration,
    });
    const target = routeGraph.recognize("/music/artist/justice");
    if (target.kind !== "match") throw new Error("fixture route missing");

    const load = session.commit(target, { operationId: "op:generation" });
    await Promise.resolve();
    bundleGeneration += 1;
    authorizationGeneration += 1;
    pending.resolve({ dispose });

    await expect(load).resolves.toMatchObject({ status: "stale" });
    expect(dispose).toHaveBeenCalledTimes(1);
    session.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("uses the destination loader scope and never a retained preparation scope", async () => {
    const mountedScope = Object.freeze({
      require<T>(token: { id: string }): T {
        return Object.freeze({ id: token.id, source: "mounted" }) as T;
      },
      optional: () => ({ available: false, client: null, denial: { code: "unavailable" as const, message: "Fixture service unavailable." } }),
    });
    const artist = vi.fn(async (_artistId: string, _signal: AbortSignal, services: unknown) => services);
    const routeGraph = graph({ artist });
    const session = createSession(routeGraph, { services: mountedScope });
    const target = routeGraph.recognize("/music/artist/justice");
    if (target.kind !== "match") throw new Error("fixture route missing");

    await session.commit(target, { operationId: "op:scope" });
    expect(artist).toHaveBeenCalledWith("justice", expect.any(AbortSignal), mountedScope);
  });

  it("terminates a route-data deadline as a typed local error without undoing the committed route", async () => {
    vi.useFakeTimers();
    try {
      const never = new Promise<never>(() => undefined);
      const routeGraph = graph({ artist: () => never });
      const session = createSession(routeGraph, { timeoutMs: 25 });
      const target = routeGraph.recognize("/music/artist/justice");
      if (target.kind !== "match") throw new Error("fixture route missing");

      const load = session.commit(target, { operationId: "op:timeout" });
      await vi.advanceTimersByTimeAsync(30);
      await expect(load).resolves.toMatchObject({
        status: "error",
        code: "route-data-timeout",
        committed: true,
      });
      expect(session.getSnapshot().route?.name).toBe("music.artist");
      expect(session.getSnapshot().nodes["music.artist"]).toMatchObject({
        state: "error",
        code: "route-data-timeout",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
