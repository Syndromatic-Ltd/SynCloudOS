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
import { createRuntimeResourceLedger, type RuntimeResourceBacking } from "../../src/SynCloudOS/Resources/RuntimeResourceLedger";

function participant(id: string, backings: () => RuntimeResourceBacking[], reclaim?: (request: { level: string; targetBytes: number }) => number, owner = "runtime") {
  return { id, kind: "decoded-image" as const, owner, measure: () => backings(), reclaim: reclaim as never };
}

describe("runtime resource ledger", () => {
  it("counts a shared backing once, as active when any holder has it pinned", () => {
    const ledger = createRuntimeResourceLedger();
    const shared = {};
    ledger.register(participant("cache", () => [{ key: shared, bytes: 100, state: "cache" }, { key: {}, bytes: 40, state: "cache" }]));
    ledger.register(participant("leases", () => [{ key: shared, bytes: 100, state: "active" }]));
    const snapshot = ledger.snapshot();
    expect(snapshot.totals).toMatchObject({ activeBytes: 100, cacheBytes: 40, idleBytes: 0, reclaimableBytes: 40, estimatedBytes: 140, sharedBackings: 1 });
    expect(snapshot.participants.map((entry) => entry.id)).toEqual(["cache", "leases"]);
  });

  it("reclaims cache-only content before idle pools and never asks participants to drop active work", () => {
    const ledger = createRuntimeResourceLedger();
    const calls: string[] = [];
    let cacheBytes = 300, idleBytes = 200;
    ledger.register({ ...participant("images", () => [{ key: "i", bytes: cacheBytes, state: "cache" }], (request) => {
      calls.push(`images:${request.level}`);
      const freed = Math.min(cacheBytes, request.targetBytes); cacheBytes -= freed; return freed;
    }) });
    ledger.register({ ...participant("pool", () => [{ key: "p", bytes: idleBytes, state: "idle" }], (request) => {
      calls.push(`pool:${request.level}`);
      if (request.level !== "idle") return 0;
      const freed = Math.min(idleBytes, request.targetBytes); idleBytes -= freed; return freed;
    }) });
    ledger.register(participant("active", () => [{ key: "a", bytes: 1000, state: "active" }], () => { throw new Error("active work must not be reclaimed"); }));

    expect(ledger.relieve({ reason: "memory-warning", targetBytes: 250 })).toMatchObject({ reclaimedBytes: 250 });
    expect(calls).toEqual(["images:cache"]);
    const second = ledger.relieve({ reason: "memory-warning", targetBytes: 200 });
    expect(second.reclaimedBytes).toBe(200);
    expect(calls).toEqual(["images:cache", "images:cache", "pool:idle"]);
  });

  it("scopes pressure relief to one owner", () => {
    const ledger = createRuntimeResourceLedger();
    const appReclaim = vi.fn(() => 10);
    const otherReclaim = vi.fn(() => 10);
    ledger.register(participant("app", () => [{ key: "x", bytes: 10, state: "cache" }], appReclaim, "app.one"));
    ledger.register(participant("other", () => [{ key: "y", bytes: 10, state: "cache" }], otherReclaim, "app.two"));
    ledger.relieve({ reason: "suspend", owner: "app.one" });
    expect(appReclaim).toHaveBeenCalled();
    expect(otherReclaim).not.toHaveBeenCalled();
  });

  it("relieves the reclaimable excess above a soft budget", () => {
    const ledger = createRuntimeResourceLedger({ softBudgetBytes: 100 });
    let bytes = 250;
    ledger.register(participant("cache", () => [{ key: "c", bytes, state: "cache" }], (request) => { const freed = Math.min(bytes, request.targetBytes); bytes -= freed; return freed; }));
    expect(ledger.enforceBudget()).toMatchObject({ reclaimedBytes: 150 });
    expect(ledger.snapshot().totals.estimatedBytes).toBe(100);
    expect(ledger.enforceBudget()).toMatchObject({ reclaimedBytes: 0 });
  });

  it("isolates a failing participant and stops measuring an unregistered one", () => {
    const ledger = createRuntimeResourceLedger();
    const unregister = ledger.register(participant("gone", () => [{ key: "g", bytes: 5, state: "cache" }]));
    ledger.register(participant("broken", () => { throw new Error("measure failed"); }));
    unregister();
    const snapshot = ledger.snapshot();
    expect(snapshot.totals.estimatedBytes).toBe(0);
    expect(snapshot.participants).toEqual([expect.objectContaining({ id: "broken", error: "measure failed" })]);
  });
});
