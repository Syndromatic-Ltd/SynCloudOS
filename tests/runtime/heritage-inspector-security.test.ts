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
import * as projection from "../../src/SynCloudOS/Inspector/inspectorProjection";

describe("heritage producer redaction", () => {
  it("rejects pagination cursors minted by another producer even at the same revision", () => {
    const options = { runtimeId: "same-runtime", now: () => 1, sources: [{ panel: "Operations" as const,
      read: () => [{ id: "a", status: "completed" }, { id: "b", status: "completed" }], subscribe: () => () => {} }] };
    const first = projection.createInspectorProjection(options); const replacement = projection.createInspectorProjection(options);
    try {
      const page = first.getPage("Operations", { limit: 1 });
      expect(() => replacement.getPage("Operations", { cursor: page.nextCursor! })).toThrow(/stale|invalid/i);
    } finally { first.dispose(); replacement.dispose(); }
  });
  it("drops secrets before snapshots, events, exports and timeout projections; never evaluates accessors", () => {
    const secret = "SENTINEL_QUERY_AUTH_COOKIE_DOC_SERVICE_RESOURCE_LOCATION";
    const getter = vi.fn(() => { throw new Error(secret); });
    const inherited = Object.create({ id: secret, status: "ready" });
    const malicious = { id: secret, status: "loading", kind: secret, label: secret, query: { token: secret }, params: { id: secret },
      headers: { Authorization: secret }, cookies: secret, title: secret, body: secret, service: { instance: secret },
      resource: { payload: secret }, coordinates: secret, url: secret, operationId: "op-one", startedAt: 12 };
    Object.defineProperty(malicious, "phase", { enumerable: true, get: getter });
    Object.defineProperty(malicious, "toJSON", { enumerable: true, get: getter });
    const inspector = projection.createInspectorProjection({ runtimeId: secret, now: () => 21,
      sources: [{ panel: "Routes", read: () => [malicious, inherited], subscribe: listener => { listener(); return () => {}; } }] });
    const snapshot = inspector.getSnapshot();
    expect(getter).not.toHaveBeenCalled();
    expect(snapshot.panels.find(p => p.id === "Routes")!.rows[0]).toMatchObject({ status: "loading", startedAt: 12 });
    for (const value of [snapshot, inspector.getEvents(), inspector.exportSnapshot(snapshot), inspector.redactTimeout({ status: "timed-out", reason: secret,
      pending: [{ id: secret, owner: secret, label: secret, kind: "route-loader", startedAt: 12 }], excluded: [] })]) {
      expect(JSON.stringify(value)).not.toContain(secret);
    }
    expect(() => inspector.exportSnapshot({ ...snapshot } as typeof snapshot)).toThrow(/producer/i);
    expect(() => inspector.getPage("Operations", { limit: Infinity })).toThrow(RangeError);
    inspector.dispose();
    expect(() => inspector.exportSnapshot(snapshot)).toThrow(/disposed/i);
  });

  it("fails closed for throwing owners, subscription failures and already disposed runtimes", () => {
    const remove = vi.fn();
    const sources = [{ panel: "Operations" as const, read: () => { throw new Error("SENTINEL"); }, subscribe: () => remove }];
    const inspector = projection.createInspectorProjection({ runtimeId: "one", now: () => 1, sources });
    expect(inspector.getSnapshot().panels.find(p => p.id === "Operations")!.status).toBe("unavailable");
    expect(JSON.stringify(inspector.getSnapshot())).not.toContain("SENTINEL");
    inspector.dispose();
    expect(() => projection.createInspectorProjection({ runtimeId: "two", now: () => 1,
      sources: [...sources, { panel: "Routes", read: () => [], subscribe: () => { throw Error("SENTINEL"); } }] })).toThrow(/subscription/i);
    expect(remove).toHaveBeenCalledTimes(2);
    const controller = new AbortController(); controller.abort();
    expect(() => projection.createInspectorProjection({ runtimeId: "three", now: () => 1, signal: controller.signal, sources })).toThrow(/disposed/i);
  });
  it("never joins unrelated owner types that happen to use the same raw identifier", () => {
    const inspector = projection.createInspectorProjection({ runtimeId: "same", now: () => 1, sources: [
      { panel: "Operations", read: () => [{ id: "same", kind: "operation", status: "pending" }], subscribe: () => () => {} },
      { panel: "Applications", read: () => [{ id: "same", kind: "application", status: "available" }], subscribe: () => () => {} },
    ] });
    const operation = inspector.getPage("Operations").rows[0];
    const app = inspector.getPage("Applications").rows[0];
    expect(operation.id).not.toBe(app.id);
    expect(operation.id).not.toBe(inspector.getSnapshot().runtimeId);
    inspector.dispose();
  });
  it("rejects oversized sparse owner arrays with a fixed safe diagnostic", () => {
    const inspector = projection.createInspectorProjection({ runtimeId: "runtime", now: () => 1, sources: [
      { panel: "Operations", read: () => new Array(100001), subscribe: () => () => {} },
    ] });
    expect(inspector.getSnapshot().panels.find(panel => panel.id === "Operations")!.status).toBe("unavailable");
    inspector.dispose();
  });
});
