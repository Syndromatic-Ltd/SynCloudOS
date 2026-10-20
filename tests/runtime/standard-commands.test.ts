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
import type { OperationHandle } from "../../src/SynCloudOS/Operations/operationTypes";
import { defineSyncUndoAction } from "../../src/SynCloudOS/Undo";
import { createTestBundle, createTestRuntime } from "./helpers";

describe("standard runtime commands", () => {
  it("registers the complete standard command set", () => {
    const runtime = createTestRuntime();
    expect(runtime.commands.inspect().registrations.map(({ commandId }) => commandId)).toEqual(expect.arrayContaining([
      "edit.undo", "edit.redo", "workspace.openApp", "workspace.returnToWebspring",
      "webspring.quickSwitch.toggle", "application.showAbout", "system.showPreferences", "session.requestLogOut", "session.logOut",
    ]));
  });

  it("separates a user log-out request from the authoritative confirmed operation", async () => {
    const runtime = createTestRuntime();
    await expect(runtime.commands.dispatch("session.requestLogOut")).resolves.toMatchObject({ status: "executed" });
    expect(runtime.systemUI.getSnapshot().logOutOpen).toBe(true);
    expect(runtime.statechart.getCurrentState()).not.toBe("locked.loginWindow");
    runtime.systemUI.session.dismissLogOut();
    expect(runtime.statechart.getCurrentState()).not.toBe("locked.loginWindow");
    await expect(runtime.commands.dispatch("session.logOut")).resolves.toMatchObject({ status: "executed" });
    expect(runtime.statechart.getCurrentState()).toBe("locked.loginWindow");
  });

  it("validates and dispatches undo from the active responder owner", async () => {
    const runtime = createTestRuntime();
    const owner = { kind: "document" as const, id: "doc" };
    let value = 1;
    runtime.undo.create(owner).register(defineSyncUndoAction({ name: "Typing", asyncPolicy: "forbid", undo: () => { value = 0; }, redo: () => { value = 1; } }));
    runtime.responders.register({ id: "doc", kind: "document", parentId: "workspace", scopeId: "doc", undoOwner: owner });
    runtime.focus.requestFocus("doc");
    await expect(runtime.commands.validate("edit.undo")).resolves.toMatchObject({ enabled: true, title: "Undo Typing" });
    await expect(runtime.commands.dispatch("edit.undo")).resolves.toMatchObject({ status: "executed" });
    expect(value).toBe(0);
    await expect(runtime.commands.validate("edit.redo")).resolves.toMatchObject({ enabled: true, title: "Redo Typing" });
  });

  it("opens apps and keeps system Preferences independent from app capabilities", async () => {
    const runtime = createTestRuntime();
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: "com.example.command-app", route: "/command-app" }));
    await expect(runtime.commands.dispatch("workspace.openApp", { appId: "com.example.command-app" })).resolves.toMatchObject({ status: "executed" });
    await expect(runtime.commands.dispatch("application.showAbout", { appId: "com.example.command-app" })).resolves.toMatchObject({ status: "executed" });
    expect(runtime.systemUI.getSnapshot().aboutAppId).toBe("com.example.command-app");
    await expect(runtime.commands.validate("system.showPreferences")).resolves.toMatchObject({ enabled: true });
    await expect(runtime.commands.dispatch("system.showPreferences")).resolves.toMatchObject({ status: "executed" });
    expect(runtime.systemUI.getSnapshot().preferencesPane).toBe("");
    expect(runtime.commands.inspect().registrations.some(({ commandId }) => commandId === "application.showPreferences")).toBe(false);
  });

  it("propagates rejected nested route results from workspace commands", async () => {
    const runtime = createTestRuntime();
    runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: "com.example.nested-route", route: "/nested-route" }));
    const failedRoute: OperationHandle<never> = {
      operationId: "route:failed",
      correlationId: "route:failed",
      signal: new AbortController().signal,
      cancel: () => undefined,
      result: Promise.resolve({
        status: "failed",
        committed: false,
        phase: "validating",
        error: { code: "route-denied", name: "RouteDenied", message: "Route denied", phase: "validating" },
      }),
    };
    vi.spyOn(runtime.routes, "openRoute").mockReturnValue(failedRoute);

    await expect(runtime.commands.dispatch("workspace.openApp", { appId: "com.example.nested-route" })).resolves.toMatchObject({
      status: "failed",
      error: { code: "route-denied" },
    });
    await expect(runtime.commands.dispatch("workspace.returnToWebspring")).resolves.toMatchObject({
      status: "failed",
      error: { code: "route-denied" },
    });
  });

  it("propagates command cancellation into composed route operations", async () => {
    const runtime = createTestRuntime();
    runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: "com.example.cancelled-route", route: "/cancelled-route" }));
    let nestedSignal: AbortSignal | undefined;
    vi.spyOn(runtime.routes, "openRoute").mockImplementation((_pathname, options = {}) => {
      nestedSignal = options.signal;
      return {
        operationId: "route:pending",
        correlationId: options.correlationId ?? "route:pending",
        signal: options.signal ?? new AbortController().signal,
        cancel: () => undefined,
        result: new Promise((resolve) => {
          options.signal?.addEventListener("abort", () => resolve({
            status: "cancelled",
            committed: false,
            reason: "Nested route cancelled.",
          }), { once: true });
        }),
      };
    });
    const controller = new AbortController();
    const dispatch = runtime.commands.dispatch("workspace.openApp", { appId: "com.example.cancelled-route" }, { signal: controller.signal });
    await vi.waitFor(() => expect(nestedSignal).toBeDefined());

    controller.abort(new Error("Outer command cancelled."));

    await expect(dispatch).resolves.toMatchObject({ status: "cancelled" });
    expect(nestedSignal?.aborted).toBe(true);
    expect(runtime.store.getSnapshot().application.activeAppId).not.toBe("com.example.cancelled-route");
  });

  it("propagates confirmed log-out cancellation and prevents a late session lock", async () => {
    const runtime = createTestRuntime();
    let nestedSignal: AbortSignal | undefined;
    vi.spyOn(runtime, "logOut").mockImplementation((options = {}) => {
      nestedSignal = options.signal;
      return {
        operationId: "logout:pending",
        correlationId: "logout:pending",
        signal: options.signal ?? new AbortController().signal,
        cancel: () => undefined,
        result: new Promise((resolve) => {
          options.signal?.addEventListener("abort", () => resolve({
            status: "cancelled",
            committed: false,
            reason: "Nested log-out cancelled.",
          }), { once: true });
        }),
      };
    });
    const controller = new AbortController();
    const dispatch = runtime.commands.dispatch("session.logOut", undefined, { signal: controller.signal });
    await vi.waitFor(() => expect(nestedSignal).toBeDefined());

    controller.abort(new Error("Confirmation was dismissed."));

    await expect(dispatch).resolves.toMatchObject({ status: "cancelled" });
    expect(nestedSignal?.aborted).toBe(true);
    expect(runtime.statechart.getCurrentState()).not.toBe("locked.loginWindow");
  });
});
