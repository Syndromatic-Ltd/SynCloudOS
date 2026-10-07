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
import * as routeNormalization from "../../src/SynCloudOS/Routing/routeNormalization";
import { createTestBundle, createTestRuntime, mountTestSynWareRuntime } from "./helpers";

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.dispose({ reason: "route commit test", inFlight: "cancel" });
});

function fixture(bundles: NonNullable<Parameters<typeof createTestRuntime>[0]>["initialBundles"]) {
  const runtime = createTestRuntime({ initialBundles: bundles });
  runtimes.push(runtime);
  runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
  return runtime;
}

describe("canonical route commit authority", () => {
  it("exposes only the canonical route normalisation spelling", () => {
    const runtime = fixture([]);
    expect(routeNormalization).not.toHaveProperty("normaliseRoutePath");
    expect(runtime.routes).not.toHaveProperty("normaliseRoutePath");
    expect(runtime.routes.normalizeRoutePath("/READER/?tab=notes#selection")).toMatchObject({
      pathname: "/reader", search: "?tab=notes", hash: "#selection", matchMode: "path",
    });
  });

  it("does not publish a route or create a window while the launch hook can still cancel", async () => {
    let entered = false;
    let hookSignal: AbortSignal | undefined;
    const did = vi.fn();
    const runtime = fixture([createTestBundle({ id: "held-window", presentation: "windowedView" }, {
      lifecycleHooks: { launch: {
        will: ({ signal }) => new Promise<void>((resolve) => {
          entered = true;
          hookSignal = signal;
          signal.addEventListener("abort", () => resolve(), { once: true });
        }), did,
      } },
    })]);
    const route = runtime.routes.openRoute("/held-window", { syncRoute: false });
    await vi.waitFor(() => expect(entered).toBe(true));
    expect(runtime.store.getSnapshot().application.routePath).toBe("/");
    expect(runtime.windows.list()).toEqual([]);
    route.cancel("cancel held launch");
    await expect(route.result).resolves.toMatchObject({ status: "cancelled", committed: false });
    await vi.waitFor(() => expect(hookSignal?.aborted).toBe(true));
    await vi.waitFor(() => expect(runtime.launchServices.inspect().active).toBeNull());
    expect(did).not.toHaveBeenCalled();
    expect(runtime.store.getSnapshot().application.activeAppId).toBeNull();
    expect(runtime.store.getSnapshot().application.routePath).toBe("/");
    expect(runtime.windows.list()).toEqual([]);
    expect(runtime.errors.getHistory().filter((entry) => entry.code === "APP_LAUNCH_FAILED")).toEqual([]);
  });

  it("commits one full browser href at the route boundary without an intermediate app-base entry", async () => {
    const runtime = fixture([createTestBundle({ id: "history-owner" })]);
    const syncRoute = vi.spyOn(runtime.environment.routeSynchronization, "syncRoute");
    const published: Array<{ browserHref?: unknown; syncRoute?: unknown; historyMode?: unknown }> = [];
    const unsubscribe = runtime.events.subscribe("route.open", (event) => {
      published.push(event.payload as { browserHref?: unknown; syncRoute?: unknown; historyMode?: unknown });
    });

    await expect(runtime.routes.openRoute("/history-owner?view=notes#row-7", { historyMode: "push" }).result).resolves.toMatchObject({
      status: "completed",
      committed: true,
    });

    expect(syncRoute).toHaveBeenCalledTimes(1);
    expect(syncRoute).toHaveBeenCalledWith("/history-owner?view=notes#row-7", { replace: false });
    expect(published.at(-1)).toMatchObject({
      browserHref: "/history-owner?view=notes#row-7",
      syncRoute: true,
      historyMode: "push",
    });
    unsubscribe();
  });

  it("runs a host precommit guard before a route can publish application state", async () => {
    const runtime = fixture([createTestBundle({ id: "guarded-route" })]);
    const hostBeforeCommit = vi.fn(() => {
      throw new DOMException("revoked before commit", "AbortError");
    });

    const route = runtime.routes.openRoute("/guarded-route", {
      syncRoute: false,
      hostBeforeCommit,
    } as Parameters<typeof runtime.routes.openRoute>[1] & { hostBeforeCommit: typeof hostBeforeCommit });

    await expect(route.result).resolves.toMatchObject({ committed: false });
    expect(hostBeforeCommit).toHaveBeenCalledTimes(1);
    expect(runtime.store.getSnapshot().application).toMatchObject({ activeAppId: null, routePath: "/" });
  });

  it("does not let mounted application navigation inject the host precommit guard", () => {
    const runtime = fixture([createTestBundle({ id: "mounted-route-owner" })]);
    const mounted = mountTestSynWareRuntime(runtime, "mounted-route-owner");
    const openRoute = vi.spyOn(runtime.routes, "openRoute");
    const injected = vi.fn();

    mounted.runtime.navigation.openRoute("/mounted-route-owner", { hostBeforeCommit: injected, syncRoute: false });

    expect(openRoute).toHaveBeenCalledWith(
      "/mounted-route-owner",
      expect.not.objectContaining({ hostBeforeCommit: expect.anything() }),
    );
    mounted.dispose("route commit test complete");
  });

  it("retains a committed route when cancelled during its did hook", async () => {
    let entered = false;
    const runtime = fixture([createTestBundle({ id: "committed-reader" }, {
      lifecycleHooks: { launch: { did: ({ signal }) => new Promise<void>((resolve) => {
        entered = true;
        signal.addEventListener("abort", () => resolve(), { once: true });
      }) } },
    })]);
    const route = runtime.routes.openRoute("/committed-reader", { syncRoute: false });
    await vi.waitFor(() => expect(entered).toBe(true));
    expect(runtime.store.getSnapshot().application.routePath).toBe("/committed-reader");
    route.cancel("cancel post-commit work");
    await expect(route.result).resolves.toMatchObject({ status: "completed", committed: true, postCommit: "cancelled" });
    expect(runtime.store.getSnapshot().lifecycle["committed-reader"]).toBe("active");
    expect(runtime.store.getSnapshot().application.routePath).toBe("/committed-reader");
  });

  it("marks a root route committed before suspension or root state becomes observable", async () => {
    const runtime = fixture([createTestBundle({ id: "root-reader" })]);
    await runtime.routes.openRoute("/root-reader", { syncRoute: false }).result;
    const observations: boolean[] = [];
    const release = runtime.store.subscribe(() => {
      if (runtime.store.getSnapshot().application.routePath !== "/") return;
      const record = runtime.operations.inspectPending().find((entry) => entry.kind === "route.open" && entry.phase === "committing");
      if (record) observations.push(record.committed);
    });
    await expect(runtime.routes.openRoute("/", { syncRoute: false }).result).resolves.toMatchObject({ status: "completed" });
    release();
    expect(observations.length).toBeGreaterThan(0);
    expect(observations).not.toContain(false);
    expect(runtime.store.getSnapshot().webspring).toMatchObject({ launchPhase: "returning", returningAppId: "root-reader" });
  });

  it("settles the root statechart when cancelled during a committed suspension's did hook", async () => {
    let entered = false;
    const runtime = fixture([createTestBundle({ id: "root-did" }, {
      lifecycleHooks: { suspend: { did: ({ signal }) => new Promise<void>((resolve) => {
        entered = true;
        signal.addEventListener("abort", () => resolve(), { once: true });
      }) } },
    })]);
    await runtime.routes.openRoute("/root-did", { syncRoute: false }).result;
    const route = runtime.routes.openRoute("/", { syncRoute: false });
    await vi.waitFor(() => expect(entered).toBe(true));
    route.cancel("cancel return effects");
    await expect(route.result).resolves.toMatchObject({ status: "completed", committed: true, postCommit: "cancelled" });
    expect(runtime.store.getSnapshot()).toMatchObject({
      application: { activeAppId: null, routePath: "/" },
      statechart: { currentState: "active.webspring", isTransitioning: false },
      lifecycle: { "root-did": "suspended" },
    });
  });

  it("does not let a superseded direct return commit over a newer statechart transition", async () => {
    let releaseHook!: () => void;
    const runtime = fixture([createTestBundle({ id: "stale-return" }, {
      lifecycleHooks: { suspend: { will: () => new Promise<void>((resolve) => { releaseHook = resolve; }) } },
    })]);
    await runtime.routes.openRoute("/stale-return", { syncRoute: false }).result;
    const returning = runtime.statechart.gotoState("active.webspring", { syncRoute: false });
    await vi.waitFor(() => expect(releaseHook).toBeTypeOf("function"));
    runtime.statechart.gotoState("active.error", { source: "newer-state" });
    releaseHook();
    await returning;
    expect(runtime.store.getSnapshot()).toMatchObject({
      application: { activeAppId: "stale-return", routePath: "/stale-return" },
      statechart: { currentState: "active.error", isTransitioning: false },
      lifecycle: { "stale-return": "active" },
    });
  });

  it("allows a replacement route to the same app without accepting the cancelled launch's terminal event", async () => {
    let entries = 0;
    const runtime = fixture([createTestBundle({ id: "replacement" }, {
      lifecycleHooks: { launch: { will: ({ signal }) => {
        entries += 1;
        if (entries > 1) return;
        return new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
      } } },
    })]);
    const first = runtime.routes.openRoute("/replacement?request=first", { syncRoute: false });
    await vi.waitFor(() => expect(entries).toBe(1));
    const second = runtime.routes.openRoute("/replacement?request=second", { syncRoute: false });
    await expect(first.result).resolves.toMatchObject({ status: "cancelled", committed: false });
    await expect(second.result).resolves.toMatchObject({ status: "completed", committed: true });
    expect(runtime.store.getSnapshot().application.activeAppId).toBe("replacement");
    expect(runtime.errors.getHistory().filter((entry) => entry.code === "APP_LAUNCH_FAILED")).toEqual([]);
  });
});
