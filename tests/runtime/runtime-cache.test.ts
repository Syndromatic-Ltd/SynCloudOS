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
import { createRuntimeCache } from "../../src/SynCloudOS/Cache";

function clock() {
  let value = 0;
  return {
    now: () => value,
    advance: (amount: number) => { value += amount; },
  };
}

describe("runtime bounded caches", () => {
  it("evicts expired and least-recently-used entries within both hard bounds", () => {
    const time = clock();
    const cache = createRuntimeCache<string, Uint8Array>({
      runtimeId: "runtime:cache" as never,
      id: "thumbnails",
      maxEntries: 2,
      maxWeight: 6,
      ttlMs: 1_000,
      now: time.now,
      weightOf: (value) => value.byteLength,
    });

    cache.set("a", new Uint8Array(3));
    cache.set("b", new Uint8Array(3));
    cache.get("a");
    cache.set("c", new Uint8Array(3));
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.stats()).toMatchObject({ entries: 2, weight: 6, evictions: 1 });

    time.advance(1_001);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.stats().entries).toBe(0);
  });

  it("rejects invalid bounds, oversize values, and cleans replaced/deleted values once", () => {
    const time = clock();
    expect(() => createRuntimeCache({ runtimeId: "runtime:cache" as never, id: "invalid", maxEntries: 0, maxWeight: 1, now: time.now, weightOf: () => 1 })).toThrow();
    const evictions: string[] = [];
    const cache = createRuntimeCache<string, string>({
      runtimeId: "runtime:cache" as never,
      id: "cleanup",
      maxEntries: 2,
      maxWeight: 4,
      now: time.now,
      weightOf: (value) => value.length,
      onEvict: (_value, key, reason) => evictions.push(`${key}:${reason}`),
    });

    expect(cache.set("too-heavy", "12345")).toBe(false);
    expect(cache.set("a", "12")).toBe(true);
    expect(cache.set("a", "1")).toBe(true);
    expect(cache.delete("a")).toBe(true);
    expect(cache.delete("a")).toBe(false);
    expect(evictions).toEqual(["a:replaced", "a:deleted"]);
  });
});
