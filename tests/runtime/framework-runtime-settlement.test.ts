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
import {
  createRuntimeHarness,
  createTestBundle,
  createTestRuntime,
  flushLaunchTimers,
  flushMultiSwitchLaunch,
  unlockRuntime,
} from "./helpers";
import { getRuntimeSettlement, trackRuntimeSettlement } from "../../src/SynCloudOS/Testing/runtimeSettlement";
import { createAppRouteSession } from "../../src/SynCloudOS/Routing/AppRouteSession";
import { defineSynWareRoutes } from "../../src/SynCloudOS/AppSDK/defineSynWareRoutes";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, deny) => { resolve = accept; reject = deny; });
  return { promise, resolve, reject };
}
const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => { for (const runtime of runtimes.splice(0)) await runtime.dispose("settlement test cleanup"); });
function runtime() { const owner = createTestRuntime(); runtimes.push(owner); return owner; }

describe("host-private runtime settlement association", () => {
  it("reuses one registry and registers canonical operation and presentation producers once", async () => {
    const owner = runtime();
    const operations = vi.spyOn(owner.operations, "subscribe");
    const presentation = vi.spyOn(owner.presentationSettlements, "subscribe");
    const registry = getRuntimeSettlement(owner);
    expect(getRuntimeSettlement(owner)).toBe(registry);
    expect(operations).toHaveBeenCalledOnce(); expect(presentation).toHaveBeenCalledOnce();
    const entered = deferred<void>(); const gate = deferred<void>();
    const work = owner.operations.run({ kind: "test.owned-operation", input: null, commit: () => { entered.resolve(); return gate.promise; } });
    await entered.promise;
    expect(registry.getState().pending.filter(item => item.id === work.operationId)).toEqual([
      expect.objectContaining({ id: work.operationId, correlationId: work.correlationId, owner: "operations" }),
    ]);
    gate.resolve(); await work.result;
    expect(registry.getState().pending).toEqual([]);
  });

  it("observes the canonical MultiSwitch lifetime without creating a parallel operation", async () => {
    vi.useFakeTimers();
    const owner = runtime();
    const { AppRegistry, LaunchServices, LoginServices, Statechart } = createRuntimeHarness(owner);
    const registry = getRuntimeSettlement(owner);
    AppRegistry.registerMany([
      createTestBundle({ bundleIdentifier: "com.example.journal", route: "/journal" }),
      createTestBundle({ bundleIdentifier: "com.example.studio", route: "/studio" }),
    ]);
    unlockRuntime(LoginServices);
    Statechart.gotoState("active.webspring", { source: "settlement-multiswitch" });

    LaunchServices.openApp("com.example.journal", { source: "settlement-multiswitch" });
    await flushLaunchTimers();
    LaunchServices.openApp("com.example.studio", { source: "settlement-multiswitch" });
    await flushMultiSwitchLaunch();

    const switching = owner.store.getSnapshot().application.multiSwitch;
    expect(switching).toMatchObject({ status: "switching", fromAppId: "com.example.journal", toAppId: "com.example.studio" });
    expect(registry.getState().pending).toContainEqual(expect.objectContaining({
      id: switching.id,
      owner: "application",
      kind: "multiswitch",
      label: "com.example.journal -> com.example.studio",
    }));
    expect(owner.operations.inspectPending()).toEqual([]);

    let settled = false;
    const waiting = registry.settled({ timeoutMs: 1_000 }).then(result => { settled = true; return result; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(LaunchServices.completeMultiSwitch(switching.id ?? "")).toBe(true);
    await expect(waiting).resolves.toMatchObject({ status: "settled", pending: [] });
  });

  it("tracks a real session's asynchronous disposal receipt after its canonical operation has completed", async () => {
    const owner = runtime(); const registry = getRuntimeSettlement(owner);
    const cleaning = deferred<void>(); const cleanup = deferred<void>(); const dispose = vi.fn(() => { cleaning.resolve(); return cleanup.promise; });
    const graph = defineSynWareRoutes({ id: "cleanup", routes: [{ name: "app", path: "", load: () => ({ dispose }) }] }).bind("/app", "app");
    const session = createAppRouteSession({ graph, getAuthorizationGeneration: () => 1, getBundleGeneration: () => 1, getSessionId: () => "mount",
      createLoaderServices: () => ({ require: () => { throw new Error("unused"); }, optional: () => { throw new Error("unused"); } }),
      routeDataTimeoutMs: 1000, setTimeout: (callback, delay) => setTimeout(callback, delay), clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    const route = graph.recognize("/app"); if (route.kind !== "match") throw new Error("route fixture missing");
    const operation = owner.operations.run({ kind: "test.mounted-route", input: null,
      commit: context => session.commit(route, { operationId: context.operationId, signal: context.signal }) });
    await operation.result;
    const receipt = session.disposeAsync();
    const descriptor = { owner: "route-session", kind: "cleanup", label: "app mounted disposal", correlationId: operation.correlationId };
    expect(trackRuntimeSettlement(owner, receipt, descriptor)).toBe(receipt);
    expect(trackRuntimeSettlement(owner, receipt, descriptor)).toBe(receipt);
    await cleaning.promise;
    expect(owner.operations.inspectPending()).toEqual([]);
    expect(registry.getState().pending).toEqual([expect.objectContaining(descriptor)]);
    expect(registry.getState().pending[0].id).not.toBe(operation.operationId);
    let done = false; const waiting = registry.settled({ timeoutMs: 1000 }).then(result => { done = true; return result; });
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    expect(done).toBe(false);
    cleanup.resolve(); await receipt; await expect(waiting).resolves.toMatchObject({ status: "settled" });
    expect(dispose).toHaveBeenCalledOnce();
    trackRuntimeSettlement(owner, receipt, descriptor);
    expect(registry.getState().pending).toEqual([]);
    expect(registry.getState().recent.filter(item => item.owner === "route-session")).toHaveLength(1);
  });

  it("retains settlement through cancelled disposal preparation and disposes only on runtime commit", async () => {
    const owner = runtime(); const registry = getRuntimeSettlement(owner);
    const blocker = owner.registerDisposalParticipant({ id: "test.refuse-disposal", prepare: () => ({ status: "cancelled", reason: "keep runtime" }) });
    await expect(owner.dispose("first attempt")).resolves.toMatchObject({ status: "cancelled" });
    expect(registry.getState().disposed).not.toBe(true); expect(getRuntimeSettlement(owner)).toBe(registry);
    blocker.unregister(); await expect(owner.dispose("second attempt")).resolves.toMatchObject({ status: "disposed" });
    expect(registry.getState()).toMatchObject({ disposed: true, pending: [] });
    expect(getRuntimeSettlement(owner)).toBe(registry);
  });

  it("deduplicates reentrant observation and detaches late failure when the runtime is disposed", async () => {
    const owner = runtime(); const registry = getRuntimeSettlement(owner); const gate = deferred<void>();
    const descriptor = { owner: "test-adapter", kind: "request", label: "explicit finite receipt" };
    const remove = registry.subscribe(() => { if (!registry.getState().disposed) trackRuntimeSettlement(owner, gate.promise, descriptor); });
    trackRuntimeSettlement(owner, gate.promise, descriptor);
    expect(registry.getState().pending).toHaveLength(1);
    await owner.dispose("cancel observation");
    const state = registry.getState();
    expect(state).toMatchObject({ disposed: true, pending: [] });
    expect(state.recent).toContainEqual(expect.objectContaining({ ...descriptor, status: "cancelled" }));
    gate.reject(new Error("late adapter rejection"));
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    expect(registry.getState()).toEqual(state); remove();
  });

  it("keeps associations and identical receipt observations independent across runtime owners", async () => {
    const first = runtime(); const second = runtime();
    const a = getRuntimeSettlement(first); const b = getRuntimeSettlement(second); const gate = deferred<void>();
    expect(a).not.toBe(b);
    const descriptor = { owner: "test-adapter", kind: "request", label: "shared external receipt" };
    trackRuntimeSettlement(first, gate.promise, descriptor); trackRuntimeSettlement(second, gate.promise, descriptor);
    await first.dispose();
    expect(a.getState().disposed).toBe(true); expect(b.getState().pending).toHaveLength(1);
    gate.resolve(); await gate.promise; await Promise.resolve();
    expect(b.getState().pending).toEqual([]);
  });
});
