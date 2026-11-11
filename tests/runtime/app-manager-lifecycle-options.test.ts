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
import { createTestBundle, createTestRuntime } from "./helpers";

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.dispose({ reason: "manager test", inFlight: "cancel" });
});

function fixture(hooks: Parameters<typeof createTestBundle>[1] = {}) {
  const runtime = createTestRuntime({ initialBundles: [createTestBundle({ bundleIdentifier: "com.example.manager-reader" }, hooks)] });
  runtimes.push(runtime);
  runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
  return { runtime, manager: runtime.appManager.getManagerForApp("com.example.manager-reader")! };
}

describe("AppManager lifecycle option forwarding", () => {
  it("forwards cancellation and preserves the single in-flight promise", async () => {
    let entered = false;
    const { runtime, manager } = fixture({ lifecycleHooks: { launch: { will: ({ signal }) => new Promise<void>((resolve) => {
      entered = true;
      signal.addEventListener("abort", () => resolve(), { once: true });
    }) } } });
    const controller = new AbortController();
    const launch = manager.launch(undefined, { signal: controller.signal, correlationId: "manager-correlation", reason: "manager reason" });
    const rejected = expect(launch).rejects.toThrow();
    expect(manager.launch()).toBe(launch);
    await vi.waitFor(() => expect(entered).toBe(true));
    controller.abort(new Error("manager caller cancelled"));
    await rejected;
    expect(runtime.store.getSnapshot().lifecycle[manager.bundleIdentifier]).toBe("registered");
    expect(runtime.operations.inspectHistory().find((entry) => entry.kind === "lifecycle.launch")).toMatchObject({ correlationId: "manager-correlation", committed: false });
  });

  it("composes the caller guard and commit callback without bypassing application membership", async () => {
    let releaseHook!: () => void;
    const { runtime, manager } = fixture({ lifecycleHooks: { launch: { will: () => new Promise<void>((resolve) => { releaseHook = resolve; }) } } });
    const guard = vi.fn();
    const commit = vi.fn();
    const mutation = runtime.documents.captureApplicationMutation(manager.bundleIdentifier);
    const launch = manager.launch(mutation, { commitGuard: guard, onCommit: commit });
    const rejected = expect(launch).rejects.toThrow();
    await vi.waitFor(() => expect(releaseHook).toBeTypeOf("function"));
    const unregister = runtime.apps.unregister(manager.bundleIdentifier);
    releaseHook();
    await rejected;
    await unregister;
    expect(guard).toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(runtime.store.getSnapshot().application.activeAppId).toBeNull();
  });

  it("runs one commit callback before the active lifecycle state is published", async () => {
    const { runtime, manager } = fixture();
    const commit = vi.fn(() => expect(runtime.store.getSnapshot().lifecycle[manager.bundleIdentifier]).not.toBe("active"));
    await manager.launch(undefined, { onCommit: commit });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(runtime.store.getSnapshot().lifecycle[manager.bundleIdentifier]).toBe("active");
  });
});
