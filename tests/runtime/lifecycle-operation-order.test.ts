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

describe("runtime lifecycle operation ordering", () => {
  it("runs launch and activate hooks around their semantic commits", async () => {
    const trace: string[] = [];
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ id: "ordered-app" }, {
        lifecycleHooks: {
          launch: {
            will: ({ signal }: { signal: AbortSignal }) => { expect(signal.aborted).toBe(false); trace.push("launch:will"); },
            did: () => { trace.push("launch:did"); },
          },
          activate: {
            will: () => { trace.push("activate:will"); },
            did: () => { trace.push("activate:did"); },
          },
        } as never,
      })],
    });

    authoriseRuntime(runtime);
    const result = await runtime.lifecycle.launch("ordered-app", { reason: "test" }).result;

    expect(result).toMatchObject({ status: "completed", committed: true });
    expect(trace).toEqual(["launch:will", "activate:will", "launch:did", "activate:did"]);
    expect(runtime.store.getSnapshot().lifecycle["ordered-app"]).toBe("active");
    expect(runtime.operations.inspectHistory().at(-1)).toMatchObject({
      runtimeId: runtime.runtimeId,
      kind: "lifecycle.launch",
      phase: "completed",
      committed: true,
    });
  });

  it("records bounded lifecycle operation diagnostics", async () => {
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ id: "diagnostic-app" }, {
        lifecycleHooks: { launch: { will: vi.fn(), did: vi.fn() } } as never,
      })],
      operationHistoryLimit: 2,
    });

    authoriseRuntime(runtime);
    await runtime.lifecycle.launch("diagnostic-app", { reason: "first" }).result;
    await runtime.lifecycle.suspend("diagnostic-app", { reason: "second" }).result;
    await runtime.lifecycle.close("diagnostic-app", { reason: "third" }).result;

    expect(runtime.operations.inspectHistory()).toHaveLength(2);
    expect(runtime.inspector.getRuntimeReport()).toMatchObject({ runtimeId: runtime.runtimeId });
  });

  it("runs did hooks only after the semantic state commit", async () => {
    let observedState: string | undefined;
    let runtime!: ReturnType<typeof createTestRuntime>;
    runtime = createTestRuntime({
      initialBundles: [createTestBundle({ id: "post-commit-app" }, {
        lifecycleHooks: {
          launch: { did: () => { observedState = runtime.store.getSnapshot().lifecycle["post-commit-app"]; } },
        } as never,
      })],
    });

    authoriseRuntime(runtime);
    await expect(runtime.lifecycle.launch("post-commit-app", { reason: "test" }).result).resolves.toMatchObject({
      status: "completed",
      committed: true,
    });
    expect(observedState).toBe("active");
  });

  it("reports a did-hook failure without reversing the committed lifecycle", async () => {
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ id: "did-failure" }, {
        lifecycleHooks: { launch: { did: () => { throw new Error("did failed"); } } } as never,
      })],
    });

    authoriseRuntime(runtime);
    await expect(runtime.lifecycle.launch("did-failure", { reason: "test" }).result).resolves.toMatchObject({
      status: "completed",
      committed: true,
      postCommit: "failed",
      issues: [expect.objectContaining({ phase: "did", message: "did failed" })],
    });
    expect(runtime.store.getSnapshot().lifecycle["did-failure"]).toBe("active");
  });

  it("rejects reopening a closed lifecycle", async () => {
    const runtime = createTestRuntime({ initialBundles: [createTestBundle({ id: "closed-app" })] });
    authoriseRuntime(runtime);
    await runtime.lifecycle.launch("closed-app", { reason: "test" }).result;
    await runtime.lifecycle.close("closed-app", { reason: "test" }).result;

    await expect(runtime.lifecycle.launch("closed-app", { reason: "reopen" }).result).resolves.toMatchObject({
      status: "failed",
      committed: false,
      error: expect.objectContaining({ code: "illegal-lifecycle-state" }),
    });
    expect(runtime.store.getSnapshot().lifecycle["closed-app"]).toBe("closed");
  });

  it("suspends the previous active application through its protocol before activating another", async () => {
    const trace: string[] = [];
    const runtime = createTestRuntime({
      initialBundles: [
        createTestBundle({ id: "first-app", route: "/first" }, {
          lifecycleHooks: {
            suspend: {
              will: () => { trace.push("first:suspend:will"); },
              did: () => { trace.push("first:suspend:did"); },
            },
          } as never,
        }),
        createTestBundle({ id: "second-app", route: "/second" }, {
          lifecycleHooks: {
            launch: {
              will: () => { trace.push("second:launch:will"); },
              did: () => { trace.push("second:launch:did"); },
            },
            activate: {
              will: () => { trace.push("second:activate:will"); },
              did: () => { trace.push("second:activate:did"); },
            },
          } as never,
        }),
      ],
    });

    authoriseRuntime(runtime);
    await runtime.lifecycle.launch("first-app", { reason: "setup" }).result;
    trace.length = 0;
    const result = await runtime.lifecycle.launch("second-app", { reason: "switch" }).result;

    expect(result).toMatchObject({ status: "completed", committed: true, postCommit: "completed" });
    expect(trace).toEqual([
      "first:suspend:will",
      "second:launch:will",
      "second:activate:will",
      "first:suspend:did",
      "second:launch:did",
      "second:activate:did",
    ]);
    expect(runtime.store.getSnapshot()).toMatchObject({
      lifecycle: { "first-app": "suspended", "second-app": "active" },
      application: { activeAppId: "second-app", currentAppId: "second-app" },
    });
  });

  it("keeps the current app active when its required suspension protocol fails", async () => {
    const runtime = createTestRuntime({
      initialBundles: [
        createTestBundle({ id: "veto-app", route: "/veto" }, {
          lifecycleHooks: { suspend: { will: () => { throw new Error("suspend veto"); } } } as never,
        }),
        createTestBundle({ id: "blocked-app", route: "/blocked" }),
      ],
    });
    authoriseRuntime(runtime);
    await runtime.lifecycle.launch("veto-app", { reason: "setup" }).result;

    const result = await runtime.lifecycle.launch("blocked-app", { reason: "switch" }).result;

    expect(result).toMatchObject({
      status: "failed",
      committed: false,
      phase: "will",
      error: expect.objectContaining({ message: "suspend veto" }),
    });
    expect(runtime.store.getSnapshot()).toMatchObject({
      lifecycle: { "veto-app": "active", "blocked-app": "registered" },
      application: { activeAppId: "veto-app", currentAppId: "veto-app" },
    });
  });

  it.each(["suspend", "close"] as const)("reconciles route, statechart, and windows for direct %s", async (stage) => {
    const runtime = createTestRuntime({ initialBundles: [createTestBundle({ id: "direct-app", route: "/direct" })] });
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    await runtime.routes.openRoute("/direct", { source: "test", syncRoute: false }).result;

    const result = await runtime.lifecycle[stage]("direct-app", { reason: "direct-test" }).result;

    expect(result).toMatchObject({ status: "completed", committed: true });
    expect(runtime.store.getSnapshot()).toMatchObject({
      lifecycle: { "direct-app": stage === "close" ? "closed" : "suspended" },
      application: { activeAppId: null, currentAppId: null, routePath: "/" },
      statechart: { currentState: "active.webspring" },
    });
    expect(runtime.windows.list()).toEqual([]);
  });

  it("runs memory-warning effects before did hooks and reports did failures post-commit", async () => {
    let pruneObservedByDid = false;
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ id: "memory-app" }, {
        lifecycleHooks: {
          memoryWarning: {
            did: () => {
              pruneObservedByDid = prune.mock.calls.some(([request]) => request.reason === "memory-warning");
              throw new Error("memory did failed");
            },
          },
        } as never,
      })],
    });
    const prune = vi.spyOn(runtime.caches, "prune");

    const result = await runtime.lifecycle.dispatch("memoryWarning", "memory-app", { pressure: "high" }).result;

    expect(pruneObservedByDid).toBe(true);
    expect(result).toMatchObject({
      status: "completed",
      committed: true,
      postCommit: "failed",
      issues: [expect.objectContaining({ phase: "did", message: "memory did failed" })],
    });
  });
});
