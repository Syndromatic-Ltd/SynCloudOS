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
import { webspringPresentationRoles } from "../../src/SynCloudOS/SynCloudOS";
import { createTestBundle, createTestRuntime } from "./helpers";
describe("semantic and presentation runtime separation", () => {
  it("keeps same-active-app query navigation inside the mounted application stage", async () => {
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ id: "journal", route: "/journal" })],
    });
    await runtime.boot({ initialPathname: "/" });
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    const initialOpen = await runtime.routes.openRoute("/journal", {
      source: "test",
      syncRoute: false,
    }).result;
    if (initialOpen.status !== "completed") throw new Error("initial route operation did not complete");
    const initialLaunchId = runtime.store.getSnapshot().webspring.launchTransitionId!;
    expect(runtime.webspring.completeLaunchStage(initialLaunchId, "journal")).toBe(true);
    expect(runtime.webspring.completeLaunchCover(initialLaunchId, "journal")).toBe(true);

    const before = runtime.store.getSnapshot();
    const transitionCount = before.statechart.history.length;
    const pendingSettlements = runtime.presentationSettlements.inspectPending().length;
    const routeEvents: Array<Record<string, unknown>> = [];
    const unsubscribe = runtime.events.subscribe("route.open", (event) => {
      routeEvents.push(event.payload as Record<string, unknown>);
    });

    const result = await runtime.routes.openRoute("/journal?view=notes", {
      source: "app:journal",
      syncRoute: true,
    }).result;
    unsubscribe();

    expect(result).toMatchObject({ status: "completed", committed: true });
    if (result.status !== "completed") throw new Error("same-app route operation did not complete");
    expect(result.value.presentationSettlementId).toBeUndefined();
    expect(runtime.presentationSettlements.inspectPending()).toHaveLength(pendingSettlements);
    expect(runtime.store.getSnapshot()).toMatchObject({
      application: {
        activeAppId: "journal",
        routePath: "/journal",
        lastLifecycleEvent: before.application.lastLifecycleEvent,
      },
      lifecycle: { "journal": "active" },
      statechart: {
        currentState: "active.application.active",
        history: before.statechart.history,
      },
      webspring: {
        launchPhase: before.webspring.launchPhase,
        launchingAppId: before.webspring.launchingAppId,
        launchTransitionId: before.webspring.launchTransitionId,
        presentationSettlementId: before.webspring.presentationSettlementId,
      },
    });
    expect(runtime.store.getSnapshot().statechart.history).toHaveLength(transitionCount);
    expect(routeEvents).toEqual([expect.objectContaining({
      requestedPath: "/journal?view=notes",
      pathname: "/journal",
      appId: "journal",
      browserHref: "/journal?view=notes",
      syncRoute: true,
    })]);
  });

  it("commits launch semantics while presentation remains unsettled", async () => {
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ id: "studio", route: "/studio" })],
      presentationRolesForRoute: webspringPresentationRoles,
    });
    await runtime.boot({ initialPathname: "/" });
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });

    const mountController = new AbortController();
    const loadAndRender = vi.fn(async () => undefined);
    const releaseMount = runtime.routes.mountedRoutes.attach("studio", {
      signal: mountController.signal,
      loadAndRender,
    });
    const handle = runtime.routes.openRoute("/studio", {
      source: "test",
      syncRoute: false,
    });
    const result = await handle.result;

    expect(result).toMatchObject({ status: "completed", committed: true });
    expect(loadAndRender).toHaveBeenCalledTimes(1);
    if (result.status !== "completed") throw new Error("route operation did not complete");
    expect(runtime.store.getSnapshot()).toMatchObject({
      application: { activeAppId: "studio", routePath: "/studio" },
      statechart: { currentState: "active.application.active" },
      webspring: {
        launchingAppId: "studio",
        launchTransitionId: expect.any(String),
        launchPhase: "staging",
      },
    });
    expect(runtime.presentationSettlements.inspect(result.value.presentationSettlementId!)).toMatchObject({ status: "pending" });

    const staged = runtime.store.getSnapshot();
    expect(runtime.webspring.completeLaunchStage(staged.webspring.launchTransitionId!, "studio")).toBe(true);
    expect(runtime.store.getSnapshot()).toMatchObject({
      application: { activeAppId: "studio", routePath: "/studio" },
      lifecycle: { studio: "active" },
      statechart: { currentState: "active.application.active" },
      webspring: { launchingAppId: "studio", launchPhase: "launching" },
    });
    releaseMount();
    mountController.abort();
  });

  it("keeps semantic state stable when presentation roles are cancelled or never completed", async () => {
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ id: "reduced-motion", route: "/reduced-motion" })],
      presentationRolesForRoute: webspringPresentationRoles,
    });
    await runtime.boot({ initialPathname: "/" });
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    const mountController = new AbortController();
    const loadAndRender = vi.fn(async () => undefined);
    const releaseMount = runtime.routes.mountedRoutes.attach("reduced-motion", {
      signal: mountController.signal,
      loadAndRender,
    });
    const result = await runtime.routes.openRoute("/reduced-motion", { source: "test", syncRoute: false }).result;
    expect(loadAndRender).toHaveBeenCalledTimes(1);
    if (result.status !== "completed") throw new Error("route operation did not complete");

    const settlementId = result.value.presentationSettlementId!;
    const pending = runtime.presentationSettlements.inspect(settlementId);
    expect(pending.status).toBe("pending");
    const settlement = runtime.presentationSettlements.inspectPending(settlementId)[0] as { id: string };
    expect(settlement.id).toBe(settlementId);
    expect(runtime.store.getSnapshot().lifecycle["reduced-motion"]).toBe("active");
    expect(runtime.store.getSnapshot().application.routePath).toBe("/reduced-motion");
    releaseMount();
    mountController.abort();
  });
});
