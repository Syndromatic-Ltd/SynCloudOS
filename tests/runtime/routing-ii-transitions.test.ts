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
import {
  createRouteTransitionController,
} from "../../src/SynCloudOS/Routing/RouteTransition";
import type { RouteServiceScope } from "../../src/SynCloudOS/Routing/RouteServiceScope";
import { defineSynWareServiceToken, type SynWareServiceToken } from "../../src/SynCloudOS/AppSDK/serviceToken";
import type { AppServiceResult } from "../../src/SynCloudOS/AppSDK/appClientTypes";

const Root = () => null;
const catalogToken = defineSynWareServiceToken<{ read(): string }>({ id: "catalog" });
const windowsToken = defineSynWareServiceToken<{ open(): void }>({ id: "windows" });

function preparationScope(signal: AbortSignal): RouteServiceScope {
  const catalog = Object.freeze({ read: () => "safe" });
  const resolve = <T,>(token: SynWareServiceToken<T>): T => {
    if (signal.aborted) throw new DOMException("Route preparation authority has been revoked.", "InvalidStateError");
    if (token === catalogToken) return catalog as T;
    throw new DOMException(`Service ${token.id} is not guard-safe.`, "SecurityError");
  };
  return Object.freeze({
    require: resolve,
    optional<T>(token: SynWareServiceToken<T>): AppServiceResult<T> {
      try {
        return Object.freeze({ available: true, client: resolve(token), denial: null });
      } catch (error) {
        return Object.freeze({ available: false, client: null, denial: Object.freeze({
          code: "denied" as const,
          message: error instanceof Error ? error.message : String(error),
        }) });
      }
    },
  });
}

function operations() {
  let id = 0;
  return createOperationCoordinator({
    runtimeId: "runtime:routing-ii-transitions",
    now: () => Date.now(),
    randomUUID: () => `id-${++id}`,
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
}

function graph(
  events: string[],
  controls: {
    block?: () => boolean;
    redirect?: () => string | null;
    guardProbe?: (services: RouteServiceScope) => void;
  } = {},
) {
  return defineSynWareRoutes({
    id: "routing.transitions",
    routes: [{
      name: "app",
      path: "",
      component: Root,
      beforeEnter: ({ services }) => {
        events.push("enter:app");
        const redirect = controls.redirect?.();
        if (redirect) return { outcome: "redirect", target: { name: redirect } } as const;
        return { outcome: "allow" } as const;
      },
      beforeLeave: () => {
        events.push("leave:app");
        return { outcome: "allow" } as const;
      },
      children: [
        {
          name: "app.one",
          path: "one",
          component: Root,
          beforeEnter: () => {
            events.push("enter:one");
            return { outcome: "allow" } as const;
          },
          beforeLeave: () => {
            events.push("leave:one");
            return { outcome: "allow" } as const;
          },
        },
        {
          name: "app.two",
          path: "two",
          component: Root,
          beforeEnter: ({ services }) => {
            events.push("enter:two");
            controls.guardProbe?.(services);
            return controls.block?.()
              ? { outcome: "block", reason: "dirty-document" } as const
              : { outcome: "allow" } as const;
          },
          beforeLeave: () => {
            events.push("leave:two");
            return { outcome: "allow" } as const;
          },
        },
        { name: "app.redirect-a", path: "a", component: Root },
        { name: "app.redirect-b", path: "b", component: Root },
      ],
    }],
  } as const).bind("/app", "app-id");
}

function controller(options: {
  events?: string[];
  block?: () => boolean;
  redirect?: () => string | null;
  commit?: ReturnType<typeof vi.fn>;
  afterCommit?: ReturnType<typeof vi.fn>;
  live?: () => boolean;
  authGeneration?: () => number;
  guardProbe?: (services: RouteServiceScope) => void;
}) {
  const events = options.events ?? [];
  const routeGraph = graph(events, {
    block: options.block,
    redirect: options.redirect,
    guardProbe: options.guardProbe,
  });
  let current = routeGraph.recognize("/app/one");
  if (current.kind !== "match") throw new Error("fixture route missing");
  let revision = 0;
  const op = operations();
  const commit = options.commit ?? vi.fn(async ({ to }) => {
    current = to;
    return { routeRevision: ++revision, sessionId: "session:app" };
  });
  const afterCommit = options.afterCommit ?? vi.fn(async () => undefined);
  const transitions = createRouteTransitionController({
    runtimeId: "runtime:routing-ii-transitions",
    graph: routeGraph,
    operations: op,
    getCurrentRoute: () => current,
    getAuthorizationGeneration: options.authGeneration ?? (() => 1),
    isRuntimeLive: options.live ?? (() => true),
    createPreparationScope: ({ signal }) => preparationScope(signal),
    commit,
    afterCommit,
  });
  return { transitions, routeGraph, events, commit, afterCommit, operations: op };
}

describe("Routing II operation-backed transitions", () => {
  it("runs deepest leave guards before parent-to-child entering guards and commits once", async () => {
    const fixture = controller({});
    const handle = fixture.transitions.transitionTo({ name: "app.two" });
    const result = await handle.result;

    expect(result).toMatchObject({ outcome: "settled", committed: true });
    expect(fixture.events).toEqual(["leave:one", "enter:two"]);
    expect(fixture.commit).toHaveBeenCalledTimes(1);
    expect(handle.signal.aborted).toBe(false);
  });

  it("blocks before commit and retries with a fresh operation and fresh signal while preserving correlation", async () => {
    let blocked = true;
    let authGeneration = 1;
    const fixture = controller({
      block: () => blocked,
      authGeneration: () => authGeneration,
    });
    const first = fixture.transitions.transitionTo({ name: "app.two" });
    const firstResult = await first.result;

    expect(firstResult).toMatchObject({
      outcome: "blocked",
      committed: false,
      reason: "dirty-document",
      authorizationGeneration: 1,
    });
    expect(fixture.commit).not.toHaveBeenCalled();

    blocked = false;
    authGeneration = 2;
    const retry = first.retry();
    expect(retry.operationId).not.toBe(first.operationId);
    expect(retry.correlationId).toBe(first.correlationId);
    expect(retry.signal).not.toBe(first.signal);
    await expect(retry.result).resolves.toMatchObject({
      outcome: "settled",
      committed: true,
      authorizationGeneration: 2,
    });
  });

  it("revokes preparation services after guard completion and rejects non-guard-safe authority", async () => {
    let retained: RouteServiceScope | null = null;
    const fixture = controller({
      guardProbe(services) {
        retained = services;
        expect(services.require(catalogToken).read()).toBe("safe");
        expect(() => services.require(windowsToken)).toThrow(/guard-safe/i);
      },
    });

    await expect(fixture.transitions.transitionTo({ name: "app.two" }).result)
      .resolves.toMatchObject({ outcome: "settled" });
    expect(retained).not.toBeNull();
    expect(() => retained!.require(catalogToken)).toThrow(/revoked/i);
  });

  it("invalidates retry when runtime ownership has ended", async () => {
    let live = true;
    const fixture = controller({ block: () => true, live: () => live });
    const first = fixture.transitions.transitionTo({ name: "app.two" });
    await expect(first.result).resolves.toMatchObject({ outcome: "blocked" });
    live = false;
    await expect(first.retry().result).resolves.toMatchObject({
      outcome: "cancelled",
      committed: false,
      reason: "route-owner-revoked",
    });
  });

  it("distinguishes precommit failure from a postcommit failure", async () => {
    const precommit = controller({
      commit: vi.fn(async () => {
        throw new Error("history-write-failed");
      }),
    });
    await expect(precommit.transitions.transitionTo({ name: "app.two" }).result)
      .resolves.toMatchObject({ outcome: "failed", committed: false });

    const postcommit = controller({
      afterCommit: vi.fn(async () => {
        throw new Error("loader-failed");
      }),
    });
    await expect(postcommit.transitions.transitionTo({ name: "app.two" }).result)
      .resolves.toMatchObject({ outcome: "route-error", committed: true });
  });

  it("bounds redirect chains and never loops forever", async () => {
    let target = "app.redirect-a";
    const events: string[] = [];
    const routeGraph = defineSynWareRoutes({
      id: "redirects",
      routes: [{
        name: "app",
        path: "",
        component: Root,
        children: [
          {
            name: "app.one",
            path: "one",
            component: Root,
            beforeLeave: () => ({ outcome: "redirect", target: { name: target } } as const),
          },
          {
            name: "app.redirect-a",
            path: "a",
            component: Root,
            beforeEnter: () => {
              events.push("a");
              target = "app.redirect-b";
              return { outcome: "redirect", target: { name: target } } as const;
            },
          },
          {
            name: "app.redirect-b",
            path: "b",
            component: Root,
            beforeEnter: () => {
              events.push("b");
              target = "app.redirect-a";
              return { outcome: "redirect", target: { name: target } } as const;
            },
          },
        ],
      }],
    } as const).bind("/app", "app-id");
    const initial = routeGraph.recognize("/app/one");
    if (initial.kind !== "match") throw new Error("fixture route missing");
    const transition = createRouteTransitionController({
      runtimeId: "runtime:redirects",
      graph: routeGraph,
      operations: operations(),
      getCurrentRoute: () => initial,
      getAuthorizationGeneration: () => 1,
      isRuntimeLive: () => true,
      createPreparationScope: ({ signal }) => preparationScope(signal),
      commit: async () => ({ routeRevision: 1, sessionId: "session" }),
      maxRedirectHops: 3,
    });

    await expect(transition.transitionTo({ name: "app.redirect-a" }).result)
      .resolves.toMatchObject({ outcome: "failed", committed: false, code: "route-redirect-cycle" });
    expect(events.length).toBeLessThanOrEqual(3);
  });
});
