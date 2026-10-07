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
import {
  createTestBundle,
  createTestRuntime,
  registerTestSynWare,
} from "./helpers";
import { createSynWare } from "../../src/SynCloudOS/AppSDK/createSynWare";
import { defineSynWareRoutes } from "../../src/SynCloudOS/AppSDK/defineSynWareRoutes";
import {
  WEBSPRING_MULTI_SWITCH_ROLES,
  WEBSPRING_PRESENTATION_ROLES,
  WEBSPRING_RETURN_ROLES,
  webspringPresentationRoles,
} from "../../src/SynCloudOS/SynCloudOS";

describe("Webspring presentation role ownership", () => {
  it("publishes frozen role constants and resolves the route role set", () => {
    expect(WEBSPRING_RETURN_ROLES).toEqual(["applicationExit", "shellReturn"]);
    expect(WEBSPRING_MULTI_SWITCH_ROLES).toEqual(["incoming", "outgoing"]);
    expect(WEBSPRING_PRESENTATION_ROLES).toEqual({
      applicationEnter: "application-enter",
      shell: "webspring-shell",
      shellReturn: "webspring-shell-return",
    });
    expect(Object.isFrozen(WEBSPRING_RETURN_ROLES)).toBe(true);
    expect(Object.isFrozen(WEBSPRING_MULTI_SWITCH_ROLES)).toBe(true);
    expect(Object.isFrozen(WEBSPRING_PRESENTATION_ROLES)).toBe(true);

    const withApplication = webspringPresentationRoles({ hasApplication: true });
    const withoutApplication = webspringPresentationRoles({ hasApplication: false });
    expect(withApplication).toEqual(["webspring-shell-return", "application-enter"]);
    expect(withoutApplication).toEqual(["webspring-shell"]);
    expect(Object.isFrozen(withApplication)).toBe(true);
    expect(Object.isFrozen(withoutApplication)).toBe(true);
  });
});

describe("PresentationSettlementCoordinator", () => {
  it("does not require a React route mount when the host declares no presentation roles", async () => {
    const runtime = createTestRuntime({ presentationRolesForRoute: () => [] });
    const routes = defineSynWareRoutes({
      id: "headless.routes",
      routes: [{ name: "headless.root", path: "", component: () => null }],
    });
    registerTestSynWare(runtime, createSynWare({
      manifest: {
        schemaVersion: 1,
        id: "headless-route-app",
        version: "1.0.0",
        title: "Headless route app",
        routes: [{ path: "/headless", primary: true }],
        permissions: ["app.open.public"],
      },
      root: () => null,
      routes,
    }));
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });

    const result = await runtime.routes.openRoute("/headless", { source: "test", syncRoute: false }).result;

    expect(result).toMatchObject({ status: "completed", committed: true, postCommit: "completed" });
    expect(runtime.presentationSettlements.inspectPending()).toEqual([]);
    await runtime.dispose({ reason: "headless-route-test", inFlight: "cancel" });
  });

  it("injects opaque owner strings and leaves the no-resolver route static", async () => {
    const roles = Object.freeze(["host-shell-return", "host-application-enter"]);
    const calls: Array<{ readonly hasApplication: boolean }> = [];
    const configured = createTestRuntime({
      presentationRolesForRoute: (input) => {
        calls.push(input);
        return roles;
      },
    });
    configured.apps.registerBundle(createTestBundle({ id: "configured-app", route: "/configured-app" }));
    configured.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    const mountController = new AbortController();
    const loadAndRender = vi.fn(async () => undefined);
    const releaseMount = configured.routes.mountedRoutes.attach("configured-app", {
      signal: mountController.signal,
      loadAndRender,
    });

    const configuredRoute = configured.routes.openRoute("/configured-app", { source: "test", syncRoute: false });
    await vi.waitFor(() => expect(configured.presentationSettlements.inspectPending()).toEqual([
      expect.objectContaining({ roles }),
    ]));
    const pending = configured.presentationSettlements.inspectPending() as Array<{ id: string; roles: readonly string[] }>;
    const configuredSettlementId = pending[0]?.id;
    if (!configuredSettlementId) throw new Error("Configured route did not create its presentation settlement.");
    const configuredSettlement = configured.presentationSettlements.get(configuredSettlementId);
    if (!configuredSettlement) throw new Error("Configured route presentation settlement is unavailable.");
    for (const role of roles) expect(configuredSettlement.completeRole(role)).toBe(true);
    await expect(configuredSettlement.result).resolves.toMatchObject({ status: "completed", roles });
    const configuredResult = await configuredRoute.result;
    const configuredValue = configuredResult.value;
    const returnedSettlementId = configuredValue && typeof configuredValue === "object" && "presentationSettlementId" in configuredValue
      && typeof configuredValue.presentationSettlementId === "string"
      ? configuredValue.presentationSettlementId
      : undefined;
    expect(calls).toEqual([{ hasApplication: true }]);
    expect(loadAndRender).toHaveBeenCalledTimes(1);
    expect(returnedSettlementId).toBe(configuredSettlementId);
    expect(configured.presentationSettlements.inspect(configuredSettlementId)).toEqual({ status: "settled" });
    releaseMount();
    mountController.abort();
    await configured.dispose({ reason: "test", inFlight: "cancel" });

    const staticRuntime = createTestRuntime();
    staticRuntime.apps.registerBundle(createTestBundle({ id: "static-app", route: "/static-app" }));
    staticRuntime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    const staticResult = await staticRuntime.routes.openRoute("/static-app", { source: "test", syncRoute: false }).result;
    expect(staticResult.value).not.toHaveProperty("presentationSettlementId");
    expect(staticRuntime.presentationSettlements.inspectPending()).toEqual([]);
    await staticRuntime.dispose({ reason: "test", inFlight: "cancel" });
  });

  it("deduplicates caller-owned strings and settles only after each known role completes", async () => {
    const runtime = createTestRuntime();
    const handle = runtime.presentationSettlements.begin({
      operationId: "operation:one",
      roles: ["owner-role-a", "owner-role-a", "owner-role-b"],
      timeoutMs: 1_000,
    });
    expect(runtime.presentationSettlements.get(handle.id)).toBe(handle);
    expect(handle.completeRole("unknown")).toBe(false);
    expect(handle.completeRole("owner-role-a")).toBe(true);
    expect(handle.completeRole("owner-role-a")).toBe(false);
    expect(runtime.presentationSettlements.inspectPending()).toEqual([
      expect.objectContaining({ id: handle.id, operationId: "operation:one", roles: ["owner-role-a", "owner-role-b"], completedRoles: ["owner-role-a"] }),
    ]);
    expect(runtime.presentationSettlements.inspectPending(handle.id)).toEqual([
      expect.objectContaining({ id: handle.id, operationId: "operation:one" }),
    ]);
    expect(handle.completeRole("owner-role-b")).toBe(true);
    await expect(handle.result).resolves.toMatchObject({ status: "completed", roles: ["owner-role-a", "owner-role-b"] });
    expect(runtime.presentationSettlements.inspectPending()).toEqual([]);
    expect(runtime.presentationSettlements.get(handle.id)).toBeNull();
    await runtime.dispose({ reason: "test", inFlight: "cancel" });
  });

  it("reports cancellation and timeout without changing semantic store state", async () => {
    const runtime = createTestRuntime();
    const cancelled = runtime.presentationSettlements.begin({ operationId: "operation:cancel", roles: ["owner-cover"], timeoutMs: 1_000 });
    cancelled.cancel("presentation-cancelled");
    await expect(cancelled.result).resolves.toMatchObject({ status: "cancelled", reason: "presentation-cancelled" });

    const timed = runtime.presentationSettlements.begin({ operationId: "operation:timeout", roles: ["owner-cover"], timeoutMs: 1 });
    await expect(timed.result).resolves.toMatchObject({ status: "timed-out", pendingRoles: ["owner-cover"] });
    expect(runtime.store.getSnapshot().application.activeAppId).toBeNull();
    await runtime.dispose({ reason: "test", inFlight: "cancel" });
  });
});
