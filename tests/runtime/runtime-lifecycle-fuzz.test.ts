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
import { createTestBundle, createTestRuntime } from "./helpers";

describe("runtime lifecycle invariants", () => {
  it("preserves route, app, window, operation, and runtime ownership invariants across a seeded sequence", async () => {
    const first = createTestRuntime({
      initialBundles: [createTestBundle({ bundleIdentifier: "com.example.fuzz-one", route: "/fuzz-one" })],
    });
    const second = createTestRuntime({
      initialBundles: [createTestBundle({ bundleIdentifier: "com.example.fuzz-two", route: "/fuzz-two" })],
    });
    await Promise.all([first.boot({ initialPathname: "/" }), second.boot({ initialPathname: "/" })]);

    const sequence = [
      () => first.routes.openRoute("/fuzz-one", { source: "test", syncRoute: false }).result,
      () => first.lifecycle.suspend("com.example.fuzz-one", { reason: "seed" }).result,
      () => first.lifecycle.activate("com.example.fuzz-one", { reason: "seed" }).result,
      () => first.lifecycle.close("com.example.fuzz-one", { reason: "seed" }).result,
    ];
    for (const operation of sequence) await operation();

    const firstSnapshot = first.store.getSnapshot();
    const secondSnapshot = second.store.getSnapshot();
    expect(firstSnapshot.runtimeId).toBe(first.runtimeId);
    expect(secondSnapshot.runtimeId).toBe(second.runtimeId);
    expect(first.events.getHistory().every((event) => event.runtimeId === first.runtimeId)).toBe(true);
    expect(second.events.getHistory().every((event) => event.runtimeId === second.runtimeId)).toBe(true);
    expect(first.operations.inspectPending()).toEqual([]);
    expect(second.operations.inspectPending()).toEqual([]);
    expect(firstSnapshot.application.activeAppId).toBeNull();
    expect(first.windows.list()).toEqual([]);
    expect(firstSnapshot.lifecycle["com.example.fuzz-one"]).toBe("closed");
    expect(secondSnapshot.lifecycle["com.example.fuzz-two"]).toBe("registered");
  });

  it("keeps exactly one active application across route transitions", async () => {
    const runtime = createTestRuntime({
      initialBundles: [
        createTestBundle({ bundleIdentifier: "com.example.alpha", route: "/alpha" }),
        createTestBundle({ bundleIdentifier: "com.example.beta", route: "/beta" }),
      ],
    });
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });

    await runtime.routes.openRoute("/alpha", { source: "test", syncRoute: false }).result;
    await runtime.routes.openRoute("/beta", { source: "test", syncRoute: false }).result;

    const snapshot = runtime.store.getSnapshot();
    expect(snapshot.application.activeAppId).toBe("com.example.beta");
    expect(Object.entries(snapshot.lifecycle).filter(([, state]) => state === "active")).toEqual([["com.example.beta", "active"]]);
    expect(snapshot.lifecycle["com.example.alpha"]).toBe("suspended");
    expect(runtime.windows.list()).toEqual([]);
    expect(snapshot.application.routePath).toBe("/beta");
  });

  it("denies a route before loading its bundle or mutating runtime state", async () => {
    const loadModule = vi.fn(async () => ({ default: () => null }));
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ bundleIdentifier: "com.example.denied", route: "/denied" }, { loadModule })],
    });
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    runtime.policy.registerPolicy("deny-route", (request, decision) =>
      request.app?.bundleIdentifier === "com.example.denied" ? { ...decision, allowed: false, decision: "deny" } : decision,
    );

    await expect(runtime.routes.openRoute("/denied", { source: "test", syncRoute: false }).result).resolves.toMatchObject({
      status: "failed",
      committed: false,
      error: expect.objectContaining({ code: "route-denied" }),
    });
    expect(loadModule).not.toHaveBeenCalled();
    expect(runtime.store.getSnapshot()).toMatchObject({
      application: { activeAppId: null, routePath: "/" },
      lifecycle: { "com.example.denied": "registered" },
    });
    expect(runtime.windows.list()).toEqual([]);
  });
});
