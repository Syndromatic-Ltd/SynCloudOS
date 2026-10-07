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

import { describe, expect, it } from "vitest";
import { createRuntimeCacheRegistry } from "../../src/SynCloudOS/Cache/RuntimeCacheRegistry";
import { createRuntimeResourceLedger } from "../../src/SynCloudOS/Resources/RuntimeResourceLedger";
import { createTestRuntime } from "./helpers";

describe("runtime resource accounting integration", () => {
  it("reports cache entries as cache residency and trims them under pressure", () => {
    const resources = createRuntimeResourceLedger();
    const caches = createRuntimeCacheRegistry({ runtimeId: "runtime:accounting" as never, now: () => 0, resources });
    const cache = caches.create<string, { id: string; bytes: number }>("test.decoded", {
      resourceKind: "decoded-image", maxEntries: 10, maxWeight: 10_000, weightOf: (value) => value.bytes,
    });
    const pinned = { id: "pinned", bytes: 1_000 };
    cache.set("a", { id: "a", bytes: 2_000 });
    cache.set("pinned", pinned);
    cache.set("b", { id: "b", bytes: 3_000 });
    resources.register({ id: "leases", kind: "decoded-image", owner: "runtime", measure: () => [{ key: pinned, bytes: 1_000, state: "active" }] });

    expect(resources.snapshot().totals).toMatchObject({ activeBytes: 1_000, cacheBytes: 5_000, estimatedBytes: 6_000, sharedBackings: 1 });
    expect(resources.snapshot().byKind["decoded-image"]).toMatchObject({ estimatedBytes: 6_000 });

    const relief = resources.relieve({ reason: "memory-warning", targetBytes: 2_500 });
    expect(relief.reclaimedBytes).toBeGreaterThanOrEqual(2_500);
    expect(cache.has("a")).toBe(false);
    caches.remove("test.decoded");
    expect(resources.snapshot().participants.map((participant) => participant.id)).toEqual(["leases"]);
  });

  it("exposes runtime resources with job and diagnostic participants", () => {
    const runtime = createTestRuntime();
    runtime.events.publish("accounting.probe", { value: "x".repeat(200) }, "test");
    const snapshot = runtime.resources.snapshot();
    const ids = snapshot.participants.map((participant) => participant.id);
    expect(ids).toEqual(expect.arrayContaining(["runtime.jobs", "runtime.diagnostics", "runtime.images.active"]));
    expect(snapshot.byKind.diagnostics?.activeBytes).toBeGreaterThan(0);
  });
});
