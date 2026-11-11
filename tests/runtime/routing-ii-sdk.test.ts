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
import { createMountedSynWareRouter } from "../../src/SynCloudOS/AppSDK/hooks/mountedSynWareRouter";
import type {
  AppNavigationClient,
  AppNavigationTransitionHandle,
  AppNavigationTransitionResult,
} from "../../src/SynCloudOS/AppSDK/appClientTypes";
import type { AppRouteSession, AppRouteSessionSnapshot } from "../../src/SynCloudOS/Routing/AppRouteSession";

function fixture() {
  const graph = defineSynWareRoutes({
    id: "routing.sdk",
    routes: [{
      name: "music",
      path: "",
      children: [{
        name: "music.artist",
        path: "artist/:artistId",
        children: [{ name: "music.artist.album", path: "album/:albumId" }],
      }],
    }],
  } as const).bind("/music", "com.example.music");
  const active = graph.recognize("/music/artist/justice/album/cross");
  if (active.kind !== "match") throw new Error("fixture route missing");
  let snapshot: AppRouteSessionSnapshot = Object.freeze({
    revision: 1,
    status: "ready",
    route: active,
    nodes: Object.freeze({}),
  });
  const listeners = new Set<() => void>();
  const session: AppRouteSession = {
    commit: vi.fn(),
    retry: vi.fn(),
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: vi.fn(),
  } as unknown as AppRouteSession;
  return {
    graph,
    session,
    publish(next: AppRouteSessionSnapshot) {
      snapshot = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

function navigationHandle(
  result: AppNavigationTransitionResult,
  controller: AbortController,
  operationId = "route:typed-outcome",
  correlationId = "correlation:typed-outcome",
  retry?: () => AppNavigationTransitionHandle,
): AppNavigationTransitionHandle {
  const handle: AppNavigationTransitionHandle = {
    operationId,
    correlationId,
    signal: controller.signal,
    cancel() {},
    result: Promise.resolve(result),
    retry: retry ?? (() => handle),
    replace: () => handle,
  };
  return Object.freeze(handle);
}

function routerForNavigationResult(result: AppNavigationTransitionResult) {
  const { graph, session } = fixture();
  const controller = new AbortController();
  const openRoute = (() => navigationHandle(result, controller)) as AppNavigationClient["openRoute"];
  return createMountedSynWareRouter({
    graph,
    mountedGraph: graph,
    appId: "com.example.music",
    sessionId: "session:music",
    signal: controller.signal,
    session,
    getAuthoritySnapshot: () => ({ operationId: "route:typed-outcome", authorizationGeneration: 13 }),
    openRoute,
    preloadRoute: vi.fn(),
  });
}

describe("Routing II scoped AppSDK router", () => {
  it("reports invalid query as its own typed precommit outcome", async () => {
    const router = routerForNavigationResult({
      outcome: "invalid-query",
      operationId: "route:typed-outcome",
      correlationId: "correlation:typed-outcome",
      committed: false,
      code: "route-invalid-query",
      reason: "page is invalid",
    });
    await expect(router.transitionTo({ name: "music" }).result).resolves.toMatchObject({
      outcome: "invalid-query",
      committed: false,
      code: "route-invalid-query",
      reason: "page is invalid",
    });
  });

  it("reports route-not-found as its own typed precommit outcome", async () => {
    const router = routerForNavigationResult({
      outcome: "not-found",
      operationId: "route:typed-outcome",
      correlationId: "correlation:typed-outcome",
      committed: false,
      code: "route-not-found",
      reason: "missing",
    });
    await expect(router.transitionTo({ name: "music" }).result).resolves.toMatchObject({
      outcome: "not-found",
      committed: false,
      code: "route-not-found",
    });
  });

  it("preserves the committed route when postcommit work is cancelled", async () => {
    const router = routerForNavigationResult({
      outcome: "cancelled",
      operationId: "route:typed-outcome",
      correlationId: "correlation:typed-outcome",
      committed: true,
      postCommit: "cancelled",
      route: { pathname: "/music", kind: "app", appId: "com.example.music" },
      reason: "post-commit-cancelled",
    });
    await expect(router.transitionTo({ name: "music" }).result).resolves.toMatchObject({
      outcome: "cancelled",
      committed: true,
      postCommit: "cancelled",
      route: { name: "music" },
    });
  });

  it("reports a presentation deadline as a committed typed timeout", async () => {
    const router = routerForNavigationResult({
      outcome: "presentation-timeout",
      operationId: "route:typed-outcome",
      correlationId: "correlation:typed-outcome",
      committed: true,
      postCommit: "failed",
      route: { pathname: "/music", kind: "app", appId: "com.example.music" },
      pendingRoles: ["route-outlet"],
      reason: "presentation timed out",
    });
    await expect(router.transitionTo({ name: "music" }).result).resolves.toMatchObject({
      outcome: "presentation-timeout",
      committed: true,
      postCommit: "failed",
      route: { name: "music" },
      pendingRoles: ["route-outlet"],
    });
  });

  it("maps canonical policy refusal to the typed denied outcome", async () => {
    const { graph, session } = fixture();
    const controller = new AbortController();
    const router = createMountedSynWareRouter({
      graph,
      mountedGraph: graph,
      appId: "com.example.music",
      sessionId: "session:music",
      signal: controller.signal,
      session,
      getAuthoritySnapshot: () => ({ operationId: "route:denied", authorizationGeneration: 11 }),
      openRoute: () => navigationHandle(Object.freeze({
        outcome: "denied",
        operationId: "route:denied",
        correlationId: "correlation:denied",
        committed: false,
        code: "route-denied",
        reason: "Route policy changed.",
      }), controller, "route:denied", "correlation:denied"),
      preloadRoute: vi.fn(),
    });

    await expect(router.transitionTo({ name: "music" }).result).resolves.toMatchObject({
      outcome: "denied",
      committed: false,
      code: "route-denied",
      reason: "Route policy changed.",
      operationId: "route:denied",
      correlationId: "correlation:denied",
      authorizationGeneration: 11,
    });
  });

  it("marks a retry for full guard preparation while preserving its correlation", () => {
    const { graph, session } = fixture();
    const controller = new AbortController();
    let currentOperation = "";
    let sequence = 0;
    const makeHandle = (): AppNavigationTransitionHandle => {
      currentOperation = `retry-${++sequence}`;
      const operationId = currentOperation;
      return navigationHandle(Object.freeze({
        outcome: "cancelled",
        operationId,
        correlationId: "original-correlation",
        committed: false,
        reason: "blocked",
      }), controller, operationId, "original-correlation", makeHandle);
    };
    const openRoute = vi.fn<AppNavigationClient["openRoute"]>(() => makeHandle());
    const router = createMountedSynWareRouter({ graph, mountedGraph: graph, appId: "com.example.music", sessionId: "session:music",
      signal: controller.signal, session, openRoute, preloadRoute: vi.fn(),
      getAuthoritySnapshot: () => ({ operationId: currentOperation, authorizationGeneration: 7 }),
    });
    const original = router.transitionTo({ name: "music" });
    const retry = original.retry();
    expect(retry.operationId).not.toBe(original.operationId);
    expect(retry.correlationId).toBe(original.correlationId);
    expect(openRoute).toHaveBeenCalledTimes(1);
  });

  it("accepts the authentic author graph after host binding and reports authoritative settlement", async () => {
    const { graph: mountedGraph, session } = fixture();
    const authorGraph = mountedGraph.bind("", null);
    const controller = new AbortController();
    let currentOperation = "route-op";
    const router = createMountedSynWareRouter({ graph: authorGraph, mountedGraph, appId: "com.example.music", sessionId: "session:music", signal: controller.signal, session,
      getAuthoritySnapshot: () => ({ operationId: currentOperation, authorizationGeneration: 9 }),
      openRoute: () => navigationHandle(Object.freeze({ outcome: "settled", operationId: "route-op", correlationId: "correlation", committed: true, route: { pathname: "/music", kind: "app", appId: "com.example.music" }, postCommit: "completed" }), controller, "route-op", "correlation"),
      preloadRoute: async () => ({ status: "ready" }),
    });
    expect(router.getSnapshot()).toBe(router.getSnapshot());
    expect(router.urlFor({ name: "music" })).toBe("/music");
    const handle = router.transitionTo({ name: "music" });
    await expect(handle.result).resolves.toMatchObject({ outcome: "settled", postCommit: "completed", sessionId: "session:music", authorizationGeneration: 9 });
    currentOperation = "browser:newer-intent";
    expect(() => handle.retry()).toThrow(/superseded/i);
  });

  it("binds named transitions to the mounted graph and never needs route code to recognize or generate", () => {
    const { graph, session } = fixture();
    const controller = new AbortController();
    const openRoute = vi.fn<AppNavigationClient["openRoute"]>((href) => navigationHandle(Object.freeze({
      outcome: "settled",
      operationId: "route-op",
      correlationId: "correlation",
      committed: true,
      route: { pathname: href, kind: "app", appId: "com.example.music" },
      postCommit: "completed",
    }), controller, "route-op", "correlation"));
    const router = createMountedSynWareRouter({
      graph,
      mountedGraph: graph,
      appId: "com.example.music",
      sessionId: "session:music",
      getAuthoritySnapshot: () => ({ operationId: "route-op", authorizationGeneration: 7 }),
      signal: controller.signal,
      session,
      openRoute,
      preloadRoute: vi.fn(),
    });

    expect(router.urlFor({ name: "music.artist", params: { artistId: "air" } })).toBe("/music/artist/air");
    expect(router.recognize("/music/artist/air").kind).toBe("match");
    expect(router.transitionTo({ name: "music.artist", params: { artistId: "air" } })).toMatchObject({ operationId: "route-op", correlationId: "correlation", retry: expect.any(Function) });
    expect(openRoute).toHaveBeenCalledWith("/music/artist/air", expect.objectContaining({ historyMode: "push" }));
    router.replaceWith({ name: "music.artist", params: { artistId: "daft-punk" } });
    expect(openRoute).toHaveBeenLastCalledWith("/music/artist/daft-punk", expect.objectContaining({ historyMode: "replace" }));
  });

  it("rejects a foreign graph token before it can acquire mounted navigation authority", () => {
    const { graph, session } = fixture();
    const foreign = defineSynWareRoutes({
      id: "routing.foreign",
      routes: [{ name: "journal", path: "" }],
    } as const).bind("/journal", "journal");
    expect(() => createMountedSynWareRouter({
      graph: foreign,
      mountedGraph: graph,
      appId: "com.example.music",
      sessionId: "session:music",
      getAuthoritySnapshot: () => ({ operationId: "route-op", authorizationGeneration: 7 }),
      signal: new AbortController().signal,
      session,
      openRoute: vi.fn(),
      preloadRoute: vi.fn(),
    })).toThrow(/mounted route graph/i);
  });

  it("implements ancestor and exact active checks from the immutable mounted snapshot", () => {
    const { graph, session } = fixture();
    const router = createMountedSynWareRouter({
      graph,
      mountedGraph: graph,
      appId: "com.example.music",
      sessionId: "session:music",
      getAuthoritySnapshot: () => ({ operationId: "route-op", authorizationGeneration: 7 }),
      signal: new AbortController().signal,
      session,
      openRoute: vi.fn(),
      preloadRoute: vi.fn(),
    });

    expect(router.isActive({ name: "music" })).toBe(true);
    expect(router.isActive({ name: "music.artist", params: { artistId: "justice" } })).toBe(true);
    expect(router.isActive({ name: "music.artist", params: { artistId: "air" } })).toBe(false);
    expect(router.isActive({ name: "music.artist", params: { artistId: "justice" } }, { exact: true })).toBe(false);
    expect(router.isActive({ name: "music.artist.album", params: { artistId: "justice", albumId: "cross" } }, { exact: true })).toBe(true);
  });

  it("allows departing renders to read their last snapshot while revoked mutations fail closed", async () => {
    const { graph, session } = fixture();
    const controller = new AbortController();
    const preloadRoute = vi.fn(async () => Object.freeze({ status: "ready" as const }));
    const router = createMountedSynWareRouter({
      graph,
      mountedGraph: graph,
      appId: "com.example.music",
      sessionId: "session:music",
      getAuthoritySnapshot: () => ({ operationId: "route-op", authorizationGeneration: 7 }),
      signal: controller.signal,
      session,
      openRoute: vi.fn(),
      preloadRoute,
    });
    const before = router.getSnapshot();
    controller.abort("unmounted");

    expect(router.getSnapshot()).toBe(before);
    expect(() => router.transitionTo({ name: "music" })).toThrow(/revoked/i);
    expect(() => router.replaceWith({ name: "music" })).toThrow(/revoked/i);
    await expect(router.preload({ name: "music" })).rejects.toThrow(/revoked/i);
    expect(preloadRoute).not.toHaveBeenCalled();
  });

  it("cuts subscriptions when the mount is revoked", () => {
    const { graph, session, publish } = fixture();
    const controller = new AbortController();
    const router = createMountedSynWareRouter({
      graph,
      mountedGraph: graph,
      appId: "com.example.music",
      sessionId: "session:music",
      getAuthoritySnapshot: () => ({ operationId: "route-op", authorizationGeneration: 7 }),
      signal: controller.signal,
      session,
      openRoute: vi.fn(),
      preloadRoute: vi.fn(),
    });
    const listener = vi.fn();
    const unsubscribe = router.subscribe(listener);
    publish(Object.freeze({ ...session.getSnapshot(), revision: 2 }));
    expect(listener).toHaveBeenCalledTimes(1);
    controller.abort("unmounted");
    publish(Object.freeze({ ...session.getSnapshot(), revision: 3 }));
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
