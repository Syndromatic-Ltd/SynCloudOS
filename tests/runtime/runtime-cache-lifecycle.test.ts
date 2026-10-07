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
import { createTestBundle, createTestRuntime } from "./helpers";

describe("runtime cache lifecycle ownership", () => {
  it("keeps same-ID caches isolated and prunes on memory warning", async () => {
    const first = createTestRuntime({ id: "runtime:cache:first" });
    const second = createTestRuntime({ id: "runtime:cache:second" });
    const options = { maxEntries: 4, maxWeight: 10, weightOf: (value: string) => value.length };
    const firstCache = first.caches.create("shared-name", options);
    const secondCache = second.caches.create("shared-name", options);
    firstCache.set("first", "1234");
    firstCache.set("extra", "abcd");
    secondCache.set("second", "5678");

    expect(first.caches.get("shared-name")?.get("first")).toBe("1234");
    expect(first.caches.get("shared-name")?.get("second")).toBeUndefined();
    expect(second.caches.get("shared-name")?.get("second")).toBe("5678");

    const removed = first.caches.prune({ reason: "memory-warning" });
    expect(removed.removed).toBeGreaterThanOrEqual(1);
    expect(firstCache.stats().weight).toBeLessThanOrEqual(5);
    expect(secondCache.stats().weight).toBe(4);
    await first.dispose("cache-test");
    expect(firstCache.stats().disposed).toBe(true);
    expect(firstCache.set("after-dispose", "x")).toBe(false);
    expect(secondCache.get("second")).toBe("5678");
  });

  it("prunes expired entries when an app suspends and disposes the registry", async () => {
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ id: "cache-app", route: "/cache-app" })],
    });
    await runtime.boot({ initialPathname: "/" });
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    const cache = runtime.caches.create("app-data", {
      maxEntries: 2,
      maxWeight: 10,
      ttlMs: 0,
      weightOf: (value: string) => value.length,
    });
    cache.set("value", "entry");
    await runtime.routes.openRoute("/cache-app", { source: "test", syncRoute: false }).result;
    await runtime.lifecycle.suspend("cache-app", { reason: "memory-pressure" }).result;
    expect(cache.stats().entries).toBe(0);
    await runtime.dispose("cache-test");
    expect(runtime.caches.get("app-data")).toBeNull();
  });
});
