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
import { createOperationCoordinator } from "../../src/SynCloudOS/Operations/OperationCoordinator";
import { createPresentationSettlementCoordinator } from "../../src/SynCloudOS/Operations/PresentationSettlementCoordinator";
import { createSettlementRegistry } from "../../src/SynCloudOS/Testing/SettlementRegistry";
import * as projection from "../../src/SynCloudOS/Inspector/inspectorProjection";
import { createInspectorOwnerSources } from "../../src/SynCloudOS/Inspector/inspectorOwnerSources";
import { defineSynWareRoutes } from "../../src/SynCloudOS/AppSDK/defineSynWareRoutes";
import { createAppRouteSession } from "../../src/SynCloudOS/Routing/AppRouteSession";

export function inspectorOwners(historyLimit = 4) {
  let serial = 0;
  let tick = 0;
  const runtimeId = "runtime:heritage";
  const clock = { runtimeId, now: () => ++tick, randomUUID: () => String(++serial),
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>) };
  return { ...clock, signal: new AbortController(), operations: createOperationCoordinator({ ...clock, historyLimit }),
    presentation: createPresentationSettlementCoordinator(clock), settlement: createSettlementRegistry({ ...clock, historyLimit }) };
}

describe("heritage owner projections", () => {
  it("provides a read-only projection factory", () => {
    expect(projection.createInspectorProjection).toBeTypeOf("function");
  });

  it("joins operation, route, redirect and presentation identities without publishing owner values", async () => {
    const owners = inspectorOwners();
    const first = owners.operations.run({ kind: "route.transition", input: {}, correlationId: "navigation-one", commit: () => 1 });
    await first.result;
    const next = owners.operations.run({ kind: "route.transition", input: {}, correlationId: first.correlationId,
      parentCorrelationId: first.correlationId, commit: () => new Promise(() => {}) });
    const role = owners.presentation.begin({ operationId: next.operationId, roles: ["application", "route-outlet"], timeoutMs: 60000 });
    const route = {
      runtimeId: owners.runtimeId,
      read: () => ({ transitions: [{ operationId: first.operationId, correlationId: first.correlationId, outcome: "redirected", successorId: next.operationId }],
        sessions: [{ appId: "com.example.music", operationId: next.operationId, snapshot: { revision: 2, status: "loading", route: { name: "artist", params: { artist: "PRIVATE" }, query: { token: "PRIVATE" }, branch: ["artist"] }, nodes: { artist: { routeName: "artist", state: "loading", revision: 2 } } } }],
        modules: [{ id: "artist", status: "loading", operationId: next.operationId }], graphs: [] }),
      subscribe: (_listener: () => void) => () => {},
    };
    const inspector = projection.createInspectorProjection({ runtimeId: owners.runtimeId, signal: owners.signal.signal, now: owners.now,
      sources: createInspectorOwnerSources({ ...owners, routes: route }) });
    const snap = inspector.getSnapshot();
    const operations = snap.panels.find(p => p.id === "Operations")!.rows;
    const pending = operations.find(row => row.phase === "committing" || row.status === "pending")!;
    const transition = snap.panels.find(p => p.id === "Transitions")!.rows[0];
    const presentation = snap.panels.find(p => p.id === "NSE")!.rows[0];
    expect(transition.links).toContainEqual({ relation: "successor", panel: "Operations", id: pending.id });
    expect(presentation.links).toContainEqual({ relation: "operation", panel: "Operations", id: pending.id });
    expect(snap.panels.find(p => p.id === "Routes")!.rows).toEqual(expect.arrayContaining([expect.objectContaining({ status: "loading" })]));
    expect(snap.panels.find(p => p.id === "FX")!.rows).toHaveLength(12);
    expect(snap.panels.find(p => p.id === "FX")!.rows.every(row => row.status === "unsupported")).toBe(true);
    expect(JSON.stringify(snap)).not.toContain("PRIVATE");
    expect(Object.isFrozen(snap.panels[0].rows)).toBe(true);
    role.cancel(); next.cancel(); await next.result; inspector.dispose(); owners.operations.dispose(); owners.presentation.dispose(); owners.settlement.dispose();
  });

  it("caps 10,000 capture notices, retains pending owner work and paginates without reading per event", () => {
    let listener = () => {};
    const read = vi.fn(() => [{ id: "pending", status: "pending" }, ...Array.from({ length: 9 }, (_, i) => ({ id: `done-${i}`, status: "completed" }))]);
    const remove = vi.fn();
    const inspector = projection.createInspectorProjection({ runtimeId: "com.example.one", now: () => 1, historyLimit: 8,
      sources: [{ panel: "Operations", read, subscribe: fn => { listener = fn; return remove; } }] });
    for (let i = 0; i < 10000; i++) listener();
    expect(read).not.toHaveBeenCalled();
    const snapshot = inspector.getSnapshot();
    expect(snapshot.capture).toMatchObject({ recorded: 10000, retained: 8, dropped: 9992 });
    expect(snapshot.panels.find(p => p.id === "Operations")!.rows[0].status).toBe("pending");
    const first = inspector.getPage("Operations", { limit: 3 });
    const second = inspector.getPage("Operations", { limit: 3, cursor: first.nextCursor! });
    expect(new Set([...first.rows, ...second.rows].map(row => row.id)).size).toBe(6);
    expect(read).toHaveBeenCalledTimes(1);
    expect(inspector.getEvents({ limit: 3 }).rows.map(row => row.sequence)).toEqual([9993, 9994, 9995]);
    listener();
    expect(() => inspector.getPage("Operations", { cursor: first.nextCursor! })).toThrow(/stale/i);
    inspector.pause(); const calls = read.mock.calls.length; listener();
    expect(inspector.getSnapshot().capture.status).toBe("paused");
    expect(inspector.getSnapshot().capture.skipped).toBe(1);
    expect(read).toHaveBeenCalledTimes(calls);
    inspector.resume(); inspector.getSnapshot(); expect(read).toHaveBeenCalledTimes(calls + 1);
    inspector.dispose(); listener(); expect(remove).toHaveBeenCalledTimes(1);
    expect(() => inspector.getSnapshot()).toThrow(/disposed/i);
  });

  it("keeps pending operations after the operation owner's history truncates", async () => {
    const owners = inspectorOwners(2);
    const pending = owners.operations.run({ kind: "route.transition", input: null, will: [() => new Promise(() => {})], commit: () => 1 });
    for (let i = 0; i < 5; i++) await owners.operations.run({ kind: "route.open", input: null, commit: () => i }).result;
    expect(owners.operations.inspectHistory().some(row => row.operationId === pending.operationId)).toBe(false);
    const inspector = projection.createInspectorProjection({ runtimeId: owners.runtimeId, now: owners.now, sources: createInspectorOwnerSources(owners) });
    expect(inspector.getPage("Operations").rows.filter(row => row.status === "pending")).toHaveLength(1);
    pending.cancel(); await pending.result;
    expect(inspector.getPage("Operations").rows.some(row => row.status === "cancelled")).toBe(true);
    inspector.dispose(); owners.operations.dispose(); owners.presentation.dispose(); owners.settlement.dispose();
  });

  it("reuses clean owner projections when a different owner changes", () => {
    let changed = () => {};
    const operations = vi.fn(() => [{ id: "op", kind: "operation", status: "pending" }]);
    const routes = vi.fn(() => [{ id: "route", kind: "route", status: "ready", operationId: "op" }]);
    const inspector = projection.createInspectorProjection({ runtimeId: "runtime", now: () => 1, sources: [
      { panel: "Operations", read: operations, subscribe: listener => { changed = listener; return () => {}; } },
      { panel: "Routes", read: routes, subscribe: () => () => {} },
    ] });
    const first = inspector.getSnapshot();
    changed(); const next = inspector.getSnapshot();
    expect(operations).toHaveBeenCalledTimes(2);
    expect(routes).toHaveBeenCalledTimes(1);
    expect(next.panels.find(p => p.id === "Routes")!.rows[0]).toBe(first.panels.find(p => p.id === "Routes")!.rows[0]);
    expect(next.panels.find(p => p.id === "Routes")!.rows[0].links[0].id).toBe(next.panels.find(p => p.id === "Operations")!.rows[0].id);
    inspector.dispose();
  });

  it("projects a real slow loader and local error without leaking loaded values or errors", async () => {
    const owners = inspectorOwners();
    let reject!: (error: unknown) => void;
    const loading = new Promise((_resolve, fail) => { reject = fail; });
    const graph = defineSynWareRoutes({ id: "music", routes: [{ name: "artist", path: ":artist", component: () => null, load: () => loading }] }).bind("/music", "com.example.music");
    const session = createAppRouteSession({ graph, getBundleGeneration: () => 1, getAuthorizationGeneration: () => 1,
      getSessionId: () => "mount", createLoaderServices: () => ({ resolve: () => { throw Error("unused"); } }), routeDataTimeoutMs: 10000,
      setTimeout: owners.setTimeout, clearTimeout: owners.clearTimeout });
    const inspector = projection.createInspectorProjection({ runtimeId: owners.runtimeId, now: owners.now,
      sources: createInspectorOwnerSources({ ...owners, routes: { runtimeId: owners.runtimeId,
        read: () => ({ sessions: [{ appId: "com.example.music", operationId: "op", snapshot: session.getSnapshot() }] }),
        subscribe: listener => session.subscribe(listener) } }) });
    const route = graph.recognize("/music/SECRET_ARTIST");
    if (route.kind !== "match") throw Error("route fixture mismatch");
    const result = session.commit(route, { operationId: "op" });
    expect(inspector.getPage("Routes").rows.some(row => row.kind === "loader" && row.status === "loading")).toBe(true);
    reject(new Error("SECRET_LOADER_BODY")); await result;
    expect(inspector.getPage("Routes").rows.some(row => row.kind === "loader" && row.status === "error")).toBe(true);
    const exported = inspector.exportSnapshot(inspector.getSnapshot()).content;
    expect(exported).not.toMatch(/SECRET_ARTIST|SECRET_LOADER_BODY/);
    expect(inspector.getPage("Routes").rows).toContainEqual(expect.objectContaining({ kind: "module", status: "unsupported" }));
    session.dispose(); inspector.dispose(); owners.operations.dispose(); owners.presentation.dispose(); owners.settlement.dispose();
  });

  it("detaches aborted runtimes and keeps replacement references and exports separate", () => {
    const controller = new AbortController(); const unsubscribe = vi.fn();
    const sources = [{ panel: "Operations" as const, read: () => [{ id: "same", status: "pending" }], subscribe: () => unsubscribe }];
    const first = projection.createInspectorProjection({ runtimeId: "same-runtime-label", now: () => 1, sources, signal: controller.signal });
    const old = first.getSnapshot(); controller.abort(); expect(unsubscribe).toHaveBeenCalledOnce();
    const second = projection.createInspectorProjection({ runtimeId: "same-runtime-label", now: () => 1, sources });
    expect(second.getSnapshot().runtimeId).not.toBe(old.runtimeId);
    expect(() => second.exportSnapshot(old)).toThrow(/producer/i);
    expect(() => first.getSnapshot()).toThrow(/disposed/i);
    second.dispose();
  });
  it("separates identical route names in different applications and keeps parent graph links", () => {
    const owners = inspectorOwners();
    const snapshot = { revision: 1, status: "ready", route: { name: "root.child", branch: ["root", "root.child"] }, nodes: {} };
    const inspector = projection.createInspectorProjection({ runtimeId: owners.runtimeId, now: owners.now,
      sources: createInspectorOwnerSources({ ...owners, routes: { runtimeId: owners.runtimeId, subscribe: () => () => {},
        read: () => ({ sessions: [{ appId: "com.example.one", snapshot }, { appId: "com.example.two", snapshot }], graphs: [{ id: "g", appId: "com.example.one", routes: [{ name: "root", path: "PRIVATE_PATH", children: [{ name: "root.child" }] }] }] }) } }) });
    const routes = inspector.getPage("Routes").rows.filter(row => row.kind === "route" && row.status === "ready");
    expect(routes).toHaveLength(2);
    expect(routes[0].id).not.toBe(routes[1].id);
    const graph = inspector.getPage("Routes").rows.find(row => row.kind === "graph")!;
    const declarations = inspector.getPage("Routes").rows.filter(row => row.status === "registered");
    expect(declarations).toHaveLength(2);
    expect(declarations[0].links).toContainEqual({ relation: "graph", panel: "Routes", id: graph.id });
    expect(declarations[1].links).toContainEqual({ relation: "route", panel: "Routes", id: declarations[0].id });
    expect(inspector.exportSnapshot(inspector.getSnapshot()).content).not.toContain("PRIVATE_PATH");
    inspector.dispose(); owners.operations.dispose(); owners.presentation.dispose(); owners.settlement.dispose();
  });
});
