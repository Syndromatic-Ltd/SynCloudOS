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

function authoriseRuntime(runtime: ReturnType<typeof createTestRuntime>) {
  runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
}

describe("runtime lifecycle cancellation", () => {
  it("cancels a will hook without committing state, did hooks, or a window", async () => {
    let entered!: () => void;
    const did = vi.fn();
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ bundleIdentifier: "com.example.cancelled-app" }, {
        lifecycleHooks: {
          launch: {
            will: ({ signal }: { signal: AbortSignal }) => new Promise<void>((resolve) => {
              entered = resolve;
              signal.addEventListener("abort", () => resolve(), { once: true });
            }),
            did,
          },
          activate: { did },
        } as never,
      })],
    });

    authoriseRuntime(runtime);
    const handle = runtime.lifecycle.launch("com.example.cancelled-app", { reason: "user" });
    await vi.waitFor(() => expect(entered).toBeTypeOf("function"));
    handle.cancel("user-cancelled");
    entered();

    await expect(handle.result).resolves.toMatchObject({ status: "cancelled", committed: false });
    expect(did).not.toHaveBeenCalled();
    expect(runtime.store.getSnapshot().lifecycle["com.example.cancelled-app"]).toBe("registered");
    expect(runtime.windows.list()).toEqual([]);
    expect(runtime.operations.inspectPending()).toEqual([]);
  });

  it("times out a lifecycle hook with a typed operation failure", async () => {
    const runtime = createTestRuntime({
      lifecycleHookTimeoutMs: 5,
      initialBundles: [createTestBundle({ bundleIdentifier: "com.example.timeout-app" }, {
        lifecycleHooks: {
          launch: { will: () => new Promise<void>(() => undefined) },
        } as never,
      })],
    });

    authoriseRuntime(runtime);
    const result = await runtime.lifecycle.launch("com.example.timeout-app", { reason: "timeout" }).result;

    expect(result).toMatchObject({ status: "failed", committed: false, error: { code: "operation-timeout" } });
    expect(runtime.store.getSnapshot().lifecycle["com.example.timeout-app"]).toBe("registered");
    expect(runtime.operations.inspectPending()).toEqual([]);
  });

  it("cancels a root route during suspension without crossing the semantic commit", async () => {
    let entered!: () => void;
    const did = vi.fn();
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ bundleIdentifier: "com.example.route-app", route: "/route-app" }, {
        lifecycleHooks: {
          suspend: {
            will: ({ signal }: { signal: AbortSignal }) => new Promise<void>((resolve) => {
              entered = resolve;
              signal.addEventListener("abort", resolve, { once: true });
            }),
            did,
          },
        } as never,
      })],
    });
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    await runtime.routes.openRoute("/route-app", { source: "setup", syncRoute: false }).result;
    const before = runtime.store.getSnapshot();

    const handle = runtime.routes.openRoute("/", { source: "test", syncRoute: false });
    await vi.waitFor(() => expect(entered).toBeTypeOf("function"));
    handle.cancel("route-cancelled");
    entered();

    await expect(handle.result).resolves.toMatchObject({ status: "cancelled", committed: false });
    expect(did).not.toHaveBeenCalled();
    expect(runtime.store.getSnapshot()).toMatchObject({
      lifecycle: { "com.example.route-app": "active" },
      application: {
        activeAppId: "com.example.route-app",
        currentAppId: "com.example.route-app",
        routePath: "/route-app",
      },
      statechart: { currentState: before.statechart.currentState },
    });
    expect(runtime.windows.list()).toEqual([]);
  });

  it("does not capture expected bundle-load cancellation as an app launch failure", async () => {
    let releaseLoad!: () => void;
    let loadEntered = false;
    const heldLoad = new Promise<void>((resolve) => { releaseLoad = resolve; });
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ bundleIdentifier: "com.example.load-cancel-app" }, {
        loadModule: async () => {
          loadEntered = true;
          await heldLoad;
          return { default: () => null };
        },
      })],
    });

    authoriseRuntime(runtime);
    const handle = runtime.lifecycle.launch("com.example.load-cancel-app", { reason: "cancel-load" });
    await vi.waitFor(() => expect(loadEntered).toBe(true));
    handle.cancel("expected-user-cancellation");
    releaseLoad();

    await expect(handle.result).resolves.toMatchObject({ status: "cancelled", committed: false });
    expect(runtime.errors.getHistory().filter((error) => error.code === "APP_LAUNCH_FAILED")).toEqual([]);
  });

  it("establishes the irreversible checkpoint before lifecycle state becomes observable", async () => {
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ bundleIdentifier: "com.example.checkpoint-app" })],
    });
    const observedCommitStates: boolean[] = [];
    const unsubscribe = runtime.store.subscribe(() => {
      if (runtime.store.getSnapshot().lifecycle["com.example.checkpoint-app"] !== "active") return;
      const operation = runtime.operations.inspectPending().find((record) => (
        record.kind === "lifecycle.launch" && record.phase === "committing"
      ));
      if (operation) observedCommitStates.push(operation.committed);
    });

    authoriseRuntime(runtime);
    await runtime.lifecycle.launch("com.example.checkpoint-app", { reason: "checkpoint-order" }).result;
    unsubscribe();

    expect(observedCommitStates.length).toBeGreaterThan(0);
    expect(observedCommitStates).not.toContain(false);
  });

  it("establishes the irreversible checkpoint before route state becomes observable", async () => {
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ bundleIdentifier: "com.example.route-checkpoint-app", route: "/route-checkpoint" })],
    });
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    const observedCommitStates: boolean[] = [];
    const unsubscribe = runtime.store.subscribe(() => {
      if (runtime.store.getSnapshot().application.routePath !== "/route-checkpoint") return;
      const operation = runtime.operations.inspectPending().find((record) => (
        record.kind === "route.open" && record.phase === "committing"
      ));
      if (operation) observedCommitStates.push(operation.committed);
    });

    await runtime.routes.openRoute("/route-checkpoint", { source: "checkpoint-order", syncRoute: false }).result;
    unsubscribe();

    expect(observedCommitStates.length).toBeGreaterThan(0);
    expect(observedCommitStates).not.toContain(false);
  });
});
