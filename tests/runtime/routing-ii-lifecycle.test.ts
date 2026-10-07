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
import { defineSynWareRoutes } from "../../src/SynCloudOS/AppSDK/defineSynWareRoutes";
import { defineSynWareServiceToken } from "../../src/SynCloudOS/AppSDK/serviceToken";
import { createAppRouteSession, type AppRouteSessionOptions } from "../../src/SynCloudOS/Routing/AppRouteSession";
import { createOperationCoordinator } from "../../src/SynCloudOS/Operations/OperationCoordinator";
import type { SynWareRouteDefinition, SynWareRouteGraph } from "../../src/SynCloudOS/Routing/appRouteTypes";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, deny) => { resolve = accept; reject = deny; });
  return { promise, resolve, reject };
}
const scopeToken = defineSynWareServiceToken<{ operationId: string; signal: AbortSignal }>({ id: "test.route-scope" });
const clock = {
  setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
  clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
function fixture(routes: readonly SynWareRouteDefinition[], overrides: Partial<AppRouteSessionOptions> = {}) {
  const graph = defineSynWareRoutes({ id: "route.lifecycle", routes }).bind("/music", "music");
  const session = createAppRouteSession({ graph, getBundleGeneration: () => 1,
    getAuthorizationGeneration: () => 1, getSessionId: () => "mounted:music",
    createLoaderServices: ({ operationId, signal }) => ({
      require: <T,>() => ({ operationId, signal }) as T,
      optional: () => { throw new Error("fixture has no optional service"); },
    }), routeDataTimeoutMs: 100, ...clock, ...overrides });
  return { session, graph, route: (url: string) => recognize(graph, url) };
}
function recognize(graph: SynWareRouteGraph, url: string) {
  const route = graph.recognize(url);
  if (route.kind !== "match") throw new Error("Fixture route did not match: " + url);
  return route;
}
afterEach(() => vi.useRealTimers());

describe("Routing II operation-owned node lifecycle", () => {
  it("awaits activation within the real operation and uses its mounted service scope", async () => {
    const entered = deferred<void>();
    const activation = deferred<void>();
    const observed: unknown[] = [];
    const { session, route } = fixture([{ name: "music", path: "",
      load: () => "root-data",
      activate: async context => {
        observed.push(context.services.require(scopeToken));
        entered.resolve(); await activation.promise;
      },
    }]);
    const operations = createOperationCoordinator({ runtimeId: "lifecycle" as never, now: () => 0, randomUUID: () => "navigation", ...clock });
    const operation = operations.run({ kind: "route.open", input: null,
      commit: context => session.commit(route("/music"), { operationId: context.operationId, signal: context.signal }) });
    const first = await Promise.race([entered.promise.then(() => "activated"), operation.result.then(() => "finished")]);
    expect(first).toBe("activated");
    expect(operations.inspectPending()).toEqual([expect.objectContaining({ operationId: operation.operationId })]);
    expect(session.getSnapshot().status).toBe("loading");
    expect(observed).toEqual([expect.objectContaining({ operationId: operation.operationId, signal: expect.any(AbortSignal) })]);
    activation.resolve();
    await expect(operation.result).resolves.toMatchObject({ status: "completed", value: { status: "ready" } });
    session.dispose(); operations.dispose();
  });

  it("retains unchanged ancestors, exits children before parents and enters parents before children", async () => {
    const events: string[] = [];
    const hook = (phase: string) => (context: Parameters<NonNullable<SynWareRouteDefinition["activate"]>>[0]) => {
      events.push(phase + ":" + String(context.params.artistId ?? "root") + ":" + String(context.params.albumId ?? "none")
        + ":" + context.services.require(scopeToken).operationId);
    };
    const parentDispose = vi.fn(); const oldChildDispose = vi.fn();
    const { session, route } = fixture([{ name: "music", path: "", activate: hook("root+"), deactivate: hook("root-"), children: [{
      name: "artist", path: "artist/:artistId", activate: hook("artist+"), deactivate: hook("artist-"),
      load: () => ({ dispose: parentDispose }), children: [{ name: "album", path: "album/:albumId",
        activate: hook("album+"), deactivate: hook("album-"), load: () => ({ dispose: oldChildDispose }),
      }],
    }, { name: "other", path: "other", activate: hook("other+") }] }]);
    await session.commit(route("/music/artist/air/album/moon"), { operationId: "op:one" });
    expect(events.map(value => value.split(":")[0])).toEqual(["root+", "artist+", "album+"]);
    events.length = 0;
    await session.commit(route("/music/artist/air/album/talkie"), { operationId: "op:two" });
    expect(events).toEqual(["album-:air:moon:op:two", "album+:air:talkie:op:two"]);
    expect(parentDispose).not.toHaveBeenCalled();
    expect(oldChildDispose).toHaveBeenCalledOnce();
    events.length = 0;
    await session.commit(route("/music/other"), { operationId: "op:three" });
    expect(events.map(value => value.split(":")[0])).toEqual(["album-", "artist-", "other+"]);
    expect(parentDispose).toHaveBeenCalledOnce();
    expect(oldChildDispose).toHaveBeenCalledTimes(2);
    session.dispose();
  });

  it("keeps the operation pending throughout asynchronous deactivation before admitting its successor", async () => {
    const entered = deferred<void>(); const exit = deferred<void>();
    const dispose = vi.fn(); const activateNext = vi.fn();
    const { session, route } = fixture([{ name: "old", path: "old", load: () => ({ dispose }),
      deactivate: async context => { expect(context.services.require(scopeToken).operationId).toBe("op:next"); entered.resolve(); await exit.promise; },
    }, { name: "next", path: "next", activate: activateNext }]);
    await session.commit(route("/music/old"), { operationId: "op:old" });
    const next = session.commit(route("/music/next"), { operationId: "op:next" });
    expect(await Promise.race([entered.promise.then(() => "exiting"), next.then(() => "finished")])).toBe("exiting");
    expect(activateNext).not.toHaveBeenCalled();
    expect(dispose).not.toHaveBeenCalled();
    exit.resolve();
    await expect(next).resolves.toMatchObject({ status: "ready" });
    expect(dispose).toHaveBeenCalledOnce();
    expect(activateNext).toHaveBeenCalledOnce();
    session.dispose();
  });

  it.each(["reject", "abort", "timeout"] as const)("disposes acquired data exactly once when afterLoad ends by %s", async failure => {
    vi.useFakeTimers();
    const afterStarted = deferred<void>(); const after = deferred<void>();
    const dispose = vi.fn(); const activate = vi.fn(); const controller = new AbortController();
    const original = new Error("afterLoad failed");
    let signal!: AbortSignal;
    const { session, route } = fixture([{ name: "music", path: "", load: () => ({ dispose }), activate,
      afterLoad: context => { signal = context.signal; afterStarted.resolve(); return after.promise; },
    }]);
    const pending = session.commit(route("/music"), { operationId: "op:after", signal: controller.signal });
    await afterStarted.promise;
    if (failure === "reject") after.reject(original);
    if (failure === "abort") controller.abort();
    if (failure === "timeout") await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toMatchObject(failure === "abort" ? { status: "stale" }
      : { status: "error", code: failure === "timeout" ? "route-data-timeout" : "route-load-failed" });
    expect(dispose).toHaveBeenCalledOnce();
    expect(activate).not.toHaveBeenCalled();
    expect(signal.aborted).toBe(true);
    after.resolve(); await Promise.resolve(); session.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("revokes a timed-out loader and disposes its late result without publishing it", async () => {
    vi.useFakeTimers();
    const source = deferred<{ dispose(): void }>(); const dispose = vi.fn(); let signal!: AbortSignal;
    const { session, route } = fixture([{ name: "music", path: "", load: context => { signal = context.signal; return source.promise; } }]);
    const pending = session.commit(route("/music"), { operationId: "op:timeout" });
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toMatchObject({ status: "error", code: "route-data-timeout" });
    expect(signal.aborted).toBe(true);
    source.resolve({ dispose });
    await source.promise; await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
    expect(session.getSnapshot().status).toBe("error");
    session.dispose(); expect(dispose).toHaveBeenCalledOnce();
  });

  it.each(["authorization", "bundle", "session"] as const)("revokes pending afterLoad and cached data immediately when %s authority changes", async kind => {
    let authorization = 1; let bundle = 1; let sessionId = "session:one";
    const observers = new Set<() => void>();
    const afterStarted = deferred<void>(); const after = deferred<void>();
    const rootDispose = vi.fn(); const childDispose = vi.fn(); const activate = vi.fn();
    const { session, route } = fixture([{ name: "root", path: "", load: () => ({ dispose: rootDispose }), children: [
      { name: "child", path: "child", load: () => ({ dispose: childDispose }), activate,
        afterLoad: () => { afterStarted.resolve(); return after.promise; } },
    ] }], {
      getAuthorizationGeneration: () => authorization, getBundleGeneration: () => bundle, getSessionId: () => sessionId,
      subscribeAuthorityChanges(listener) { observers.add(listener); return () => { observers.delete(listener); }; },
    });
    const pending = session.commit(route("/music/child"), { operationId: "op:authority" });
    await afterStarted.promise;
    if (kind === "authorization") authorization++;
    if (kind === "bundle") bundle++;
    if (kind === "session") sessionId = "session:two";
    for (const observer of observers) observer();
    await expect(pending).resolves.toMatchObject({ status: "stale" });
    expect(rootDispose).toHaveBeenCalledOnce(); expect(childDispose).toHaveBeenCalledOnce();
    expect(session.getSnapshot()).toMatchObject({ status: "idle", route: null, nodes: {} });
    expect(activate).not.toHaveBeenCalled();
    after.resolve(); await Promise.resolve(); session.dispose(); session.dispose();
    expect(rootDispose).toHaveBeenCalledOnce(); expect(childDispose).toHaveBeenCalledOnce();
    expect(observers.size).toBe(0);
  });

  it("cleans partial activation once on cancellation and never publishes its late completion over a successor", async () => {
    const activation = deferred<void>(); const entered = deferred<void>();
    const dispose = vi.fn(); const deactivate = vi.fn();
    let first = true;
    const { session, route } = fixture([{ name: "music", path: "", load: () => ({ dispose }),
      activate: () => { if (first) { first = false; entered.resolve(); return activation.promise; } }, deactivate,
    }]);
    const controller = new AbortController();
    const old = session.commit(route("/music"), { operationId: "op:old", signal: controller.signal });
    expect(await Promise.race([entered.promise.then(() => "entered"), old.then(() => "finished")])).toBe("entered");
    controller.abort();
    await expect(old).resolves.toMatchObject({ status: "stale" });
    expect(deactivate).toHaveBeenCalledOnce(); expect(dispose).toHaveBeenCalledOnce();
    const next = await session.commit(route("/music"), { operationId: "op:new" });
    expect(next.status).toBe("ready");
    const published = session.getSnapshot();
    activation.resolve(); await Promise.resolve();
    expect(session.getSnapshot()).toBe(published);
    expect(deactivate).toHaveBeenCalledOnce(); expect(dispose).toHaveBeenCalledOnce();
    session.dispose();
  });

  it("keeps the successor pending until asynchronous exited data cleanup actually resolves", async () => {
    const cleanup = deferred<void>(); const started = deferred<void>(); const nextActivate = vi.fn();
    const { session, route } = fixture([{ name: "old", path: "old", load: () => ({ dispose() { started.resolve(); return cleanup.promise; } }) },
      { name: "next", path: "next", activate: nextActivate }]);
    await session.commit(route("/music/old"), { operationId: "old" });
    const next = session.commit(route("/music/next"), { operationId: "new" });
    expect(await Promise.race([started.promise.then(() => "cleanup"), next.then(() => "finished")])).toBe("cleanup");
    expect(nextActivate).not.toHaveBeenCalled();
    cleanup.resolve(); await expect(next).resolves.toMatchObject({ status: "ready" });
    expect(nextActivate).toHaveBeenCalledOnce(); session.dispose();
  });

  it("reports failed exited cleanup, still releases all exited data, and does not activate the successor", async () => {
    const disposeParent = vi.fn(); const disposeChild = vi.fn(() => { throw new Error("cleanup rejected"); });
    const parentExit = vi.fn(); const nextActivate = vi.fn();
    const { session, route } = fixture([{ name: "old", path: "old", load: () => ({ dispose: disposeParent }), deactivate: parentExit,
      children: [{ name: "child", path: "child", load: () => ({ dispose: disposeChild }) }] },
      { name: "next", path: "next", activate: nextActivate }]);
    await session.commit(route("/music/old/child"), { operationId: "old" });
    await expect(session.commit(route("/music/next"), { operationId: "new" })).resolves.toMatchObject({ status: "error", code: "route-deactivate-failed" });
    expect(disposeChild).toHaveBeenCalledOnce(); expect(disposeParent).toHaveBeenCalledOnce(); expect(parentExit).toHaveBeenCalledOnce();
    expect(nextActivate).not.toHaveBeenCalled(); session.dispose();
  });

  it("does not dispose a child's shared data while a retained ancestor still owns it", async () => {
    const released = deferred<void>();
    const dispose = vi.fn(() => released.resolve()); const data = { dispose };
    const { session, route } = fixture([{ name: "root", path: "", load: () => data, children: [
      { name: "child", path: "child", load: context => context.parentData }, { name: "other", path: "other" },
    ] }]);
    await session.commit(route("/music/child"), { operationId: "one" });
    await session.commit(route("/music/other"), { operationId: "two" });
    expect(dispose).not.toHaveBeenCalled();
    session.dispose(); await released.promise;
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("cleans exited resources even when the destination query is invalid", async () => {
    const dispose = vi.fn(); const deactivate = vi.fn();
    const { session, route } = fixture([{ name: "old", path: "old", load: () => ({ dispose }), deactivate }, { name: "next", path: "next" }]);
    await session.commit(route("/music/old"), { operationId: "old" });
    const target = { ...route("/music/next"), queryStatus: "invalid" as const, queryIssues: [] };
    await expect(session.commit(target, { operationId: "invalid" })).resolves.toMatchObject({ status: "error", code: "route-invalid-query" });
    expect(dispose).toHaveBeenCalledOnce(); expect(deactivate).toHaveBeenCalledOnce(); session.dispose();
  });

  it("returns a local error and releases exited data when the mounted service scope cannot be minted", async () => {
    const dispose = vi.fn(); let deny = false;
    const { session, route } = fixture([{ name: "old", path: "old", load: () => ({ dispose }) }, { name: "new", path: "new" }], {
      createLoaderServices: () => { if (deny) throw new Error("scope revoked"); return { require: () => { throw new Error("unused"); }, optional: () => { throw new Error("unused"); } }; },
    });
    await session.commit(route("/music/old"), { operationId: "old" });
    deny = true;
    await expect(session.commit(route("/music/new"), { operationId: "new" })).resolves.toMatchObject({ status: "error", code: "route-load-failed" });
    expect(dispose).toHaveBeenCalledOnce(); session.dispose();
  });

  it("never installs a revoked lazy definition after its uncancellable module import resolves", async () => {
    let revision = 1;
    const observers = new Set<() => void>();
    const loading = deferred<void>(); const module = deferred<SynWareRouteDefinition>();
    const staleLoad = vi.fn(); const staleActivate = vi.fn();
    const { session, route } = fixture([{ name: "music", path: "" }], {
      getAuthorizationGeneration: () => revision,
      subscribeAuthorityChanges(listener) { observers.add(listener); return () => { observers.delete(listener); }; },
      resolveRouteDefinition: () => { loading.resolve(); return module.promise; },
    });
    const pending = session.commit(route("/music"), { operationId: "module:old" });
    await loading.promise;
    revision++;
    for (const observer of observers) observer();
    await expect(pending).resolves.toMatchObject({ status: "stale" });
    module.resolve({ name: "music", path: "", load: staleLoad, activate: staleActivate });
    await module.promise; await Promise.resolve();
    expect(staleLoad).not.toHaveBeenCalled(); expect(staleActivate).not.toHaveBeenCalled();
    expect(session.getDefinition("music")?.load).toBeUndefined();
    expect(session.getSnapshot().status).toBe("idle"); session.dispose();
  });

  it("preserves the activation error while deactivating and releasing partially entered data exactly once", async () => {
    const error = new Error("activate rejected"); const dispose = vi.fn(); const deactivate = vi.fn();
    const { session, route } = fixture([{ name: "music", path: "", load: () => ({ dispose }),
      activate: async () => { throw error; }, deactivate,
    }]);
    await expect(session.commit(route("/music"), { operationId: "activate" })).resolves.toMatchObject({ status: "error", code: "route-activate-failed", error });
    expect(deactivate).toHaveBeenCalledOnce(); expect(dispose).toHaveBeenCalledOnce();
    expect(deactivate.mock.calls[0][0].signal.aborted).toBe(true);
    session.dispose(); expect(dispose).toHaveBeenCalledOnce();
  });

  it("revokes a timed-out exit before cleaning ancestors and does not admit the next branch", async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    const entered = deferred<void>(); const late = deferred<void>(); const disposed = vi.fn();
    let revokedAtParentExit = false;
    const parentExit = vi.fn((context: { signal: AbortSignal }) => { revokedAtParentExit = context.signal.aborted; }); const nextActivate = vi.fn();
    const { session, route } = fixture([{ name: "old", path: "old", deactivate: parentExit, children: [{ name: "child", path: "child",
      load: () => ({ dispose: disposed }), deactivate: context => { signal = context.signal; entered.resolve(); return late.promise; },
    }] }, { name: "next", path: "next", activate: nextActivate }]);
    await session.commit(route("/music/old/child"), { operationId: "old" });
    const pending = session.commit(route("/music/next"), { operationId: "next" });
    await entered.promise; await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toMatchObject({ status: "error", code: "route-data-timeout" });
    expect(signal.aborted).toBe(true);
    expect(parentExit).toHaveBeenCalledOnce();
    expect(revokedAtParentExit).toBe(true);
    expect(nextActivate).not.toHaveBeenCalled(); expect(disposed).toHaveBeenCalledOnce();
    late.resolve(); await Promise.resolve(); session.dispose();
    expect(disposed).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it("does not disturb live work when handed an already-aborted navigation", async () => {
    const started = deferred<void>(); const gate = deferred<void>();
    const { session, route } = fixture([{ name: "music", path: "", load: () => { started.resolve(); return gate.promise; } }]);
    const target = route("/music");
    const first = session.commit(target, { operationId: "live" }); await started.promise;
    const snapshot = session.getSnapshot();
    const caller = new AbortController(); caller.abort();
    await expect(session.commit(target, { operationId: "cancelled-before-entry", signal: caller.signal })).resolves.toMatchObject({ status: "stale" });
    expect(session.getSnapshot()).toBe(snapshot);
    gate.resolve(); await expect(first).resolves.toMatchObject({ status: "ready" }); session.dispose();
  });

  it("keeps a revoked commit pending until already-owned cached data finishes its asynchronous cleanup", async () => {
    let authorization = 1;
    const listeners = new Set<() => void>();
    const afterStarted = deferred<void>(); const after = deferred<void>();
    const cleanupStarted = deferred<void>(); const cleanup = deferred<void>();
    const { session, route } = fixture([{ name: "root", path: "", load: () => ({ dispose() { cleanupStarted.resolve(); return cleanup.promise; } }),
      children: [{ name: "child", path: "child", afterLoad: () => { afterStarted.resolve(); return after.promise; } }],
    }], { getAuthorizationGeneration: () => authorization,
      subscribeAuthorityChanges(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    });
    const loaded = session.commit(route("/music/child"), { operationId: "owned-cleanup" });
    await afterStarted.promise;
    authorization++; for (const listener of listeners) listener();
    await cleanupStarted.promise;
    let done = false;
    void loaded.then(() => { done = true; });
    // Drain finite internal promise propagation while the real cleanup gate stays unresolved.
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    expect(done).toBe(false);
    cleanup.resolve(); await expect(loaded).resolves.toMatchObject({ status: "stale" });
    after.resolve(); session.dispose();
  });

  it("joins superseded partial activation cleanup before entering the next route", async () => {
    const activating = deferred<void>(); const activation = deferred<void>();
    const cleaning = deferred<void>(); const cleanup = deferred<void>();
    const nextActivate = vi.fn(); const deactivate = vi.fn();
    const dispose = vi.fn(() => { cleaning.resolve(); return cleanup.promise; });
    const { session, route } = fixture([{ name: "old", path: "old", load: () => ({ dispose }),
      activate: () => { activating.resolve(); return activation.promise; }, deactivate,
    }, { name: "next", path: "next", activate: nextActivate }]);
    const old = session.commit(route("/music/old"), { operationId: "old" });
    await activating.promise;
    const next = session.commit(route("/music/next"), { operationId: "next" });
    await cleaning.promise;
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    expect(nextActivate).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce(); expect(deactivate).toHaveBeenCalledOnce();
    cleanup.resolve();
    await expect(old).resolves.toMatchObject({ status: "stale" });
    await expect(next).resolves.toMatchObject({ status: "ready" });
    expect(nextActivate).toHaveBeenCalledOnce();
    activation.resolve(); await Promise.resolve(); session.dispose();
    expect(dispose).toHaveBeenCalledOnce(); expect(deactivate).toHaveBeenCalledOnce();
  });

  it("revokes timed-out deactivation authority before awaiting asynchronous data disposal", async () => {
    vi.useFakeTimers();
    const exiting = deferred<void>(); const exit = deferred<void>();
    const cleaning = deferred<void>(); const cleanup = deferred<void>();
    let signal!: AbortSignal;
    const { session, route } = fixture([{ name: "old", path: "old",
      load: () => ({ dispose() { cleaning.resolve(); return cleanup.promise; } }),
      deactivate: context => { signal = context.signal; exiting.resolve(); return exit.promise; },
    }, { name: "next", path: "next" }]);
    await session.commit(route("/music/old"), { operationId: "old" });
    const next = session.commit(route("/music/next"), { operationId: "next" });
    await exiting.promise; await vi.advanceTimersByTimeAsync(100); await cleaning.promise;
    expect(signal.aborted).toBe(true);
    cleanup.resolve();
    await expect(next).resolves.toMatchObject({ status: "error", code: "route-data-timeout" });
    exit.resolve(); session.dispose(); expect(vi.getTimerCount()).toBe(0);
  });

  it("exposes a bounded disposal receipt for idle mounted ownership and cleans children before parents once", async () => {
    const exiting = deferred<void>(); const exit = deferred<void>();
    const cleaning = deferred<void>(); const cleanup = deferred<void>();
    const events: string[] = [];
    const parentDispose = vi.fn(() => { events.push("parent.dispose"); });
    const childDispose = vi.fn(() => { events.push("child.dispose"); cleaning.resolve(); return cleanup.promise; });
    const { session, route } = fixture([{ name: "parent", path: "", load: () => ({ dispose: parentDispose }),
      deactivate: () => { events.push("parent.deactivate"); }, children: [{ name: "child", path: "child", load: () => ({ dispose: childDispose }),
        deactivate: context => { expect(context.signal.aborted).toBe(true); events.push("child.deactivate"); exiting.resolve(); return exit.promise; },
      }],
    }]);
    await session.commit(route("/music/child"), { operationId: "mounted" });
    const receipt = session.disposeAsync(); session.dispose();
    const repeated = session.disposeAsync();
    await exiting.promise;
    expect(events).toEqual(["child.deactivate"]);
    exit.resolve(); await cleaning.promise;
    let done = false; void receipt.then(() => { done = true; });
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    expect(done).toBe(false);
    expect(events).toEqual(["child.deactivate", "child.dispose"]);
    cleanup.resolve(); await receipt; await repeated;
    expect(events).toEqual(["child.deactivate", "child.dispose", "parent.deactivate", "parent.dispose"]);
    expect(parentDispose).toHaveBeenCalledOnce(); expect(childDispose).toHaveBeenCalledOnce();
    expect(session.getSnapshot().status).toBe("disposed");
  });

  it("exposes idle authorization revocation cleanup without waiting for another navigation", async () => {
    let authorization = 1;
    const listeners = new Set<() => void>();
    const cleaning = deferred<void>(); const cleanup = deferred<void>();
    const dispose = vi.fn(() => { cleaning.resolve(); return cleanup.promise; });
    const { session, route } = fixture([{ name: "music", path: "", load: () => ({ dispose }) }], {
      getAuthorizationGeneration: () => authorization,
      subscribeAuthorityChanges(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    });
    await session.commit(route("/music"), { operationId: "cached" });
    expect(session.getCleanupReceipt()).toBeNull();
    authorization++; for (const listener of listeners) listener();
    const receipt = session.getCleanupReceipt();
    expect(receipt).not.toBeNull();
    expect(session.getCleanupReceipt()).toBe(receipt);
    await cleaning.promise;
    let done = false; void receipt!.then(() => { done = true; });
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    expect(done).toBe(false);
    expect(session.getSnapshot()).toMatchObject({ status: "idle", route: null, nodes: {} });
    cleanup.resolve(); await receipt;
    expect(dispose).toHaveBeenCalledOnce();
    await session.disposeAsync(); expect(dispose).toHaveBeenCalledOnce();
  });

  it("bounds an abort-ignoring disposer receipt and reports its deadline once per owner cleanup", async () => {
    vi.useFakeTimers();
    const errors: unknown[] = []; const dispose = vi.fn(() => new Promise<void>(() => undefined));
    const { session, route } = fixture([{ name: "music", path: "", load: () => ({ dispose }) }], { onCleanupError: error => errors.push(error) });
    await session.commit(route("/music"), { operationId: "mounted" });
    const receipt = session.disposeAsync(); const repeated = session.disposeAsync();
    await vi.advanceTimersByTimeAsync(100); await receipt; await repeated;
    expect(dispose).toHaveBeenCalledOnce();
    expect(errors).toEqual([expect.objectContaining({ code: "route-data-timeout" })]);
    expect(session.getCleanupReceipt()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });

  it("invalidates retained cached ancestors at a failed exit boundary even without an authority subscription", async () => {
    let authorization = 1;
    const exiting = deferred<void>(); const exit = deferred<void>(); const rootDispose = vi.fn();
    const { session, route } = fixture([{ name: "root", path: "", load: () => ({ dispose: rootDispose }), children: [
      { name: "old", path: "old", deactivate: () => { exiting.resolve(); return exit.promise; } }, { name: "next", path: "next" },
    ] }], { getAuthorizationGeneration: () => authorization });
    await session.commit(route("/music/old"), { operationId: "old" });
    const next = session.commit(route("/music/next"), { operationId: "next" });
    await exiting.promise; authorization++; exit.reject(new Error("old scope failed"));
    await expect(next).resolves.toMatchObject({ status: "stale" });
    expect(session.getSnapshot()).toMatchObject({ status: "idle", route: null, nodes: {} });
    expect(rootDispose).toHaveBeenCalledOnce(); await session.disposeAsync();
  });
});
