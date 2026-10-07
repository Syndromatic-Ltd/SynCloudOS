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

import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";
import { createRuntimeCache } from "./RuntimeCache";
import type { RuntimeResourceLedger } from "../Resources/RuntimeResourceLedger";
import type {
  RuntimeCache,
  RuntimeCacheOptions,
  RuntimeCachePruneRequest,
  RuntimeCachePruneResult,
  RuntimeCacheRegistry,
} from "./cacheTypes";

export function createRuntimeCacheRegistry(options: {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly now: () => number;
  /** Runtime resource accounting; each cache reports its entries as
   * cache-only residency and can be trimmed under pressure. */
  readonly resources?: RuntimeResourceLedger;
}): RuntimeCacheRegistry {
  const caches = new Map<string, RuntimeCache<unknown, unknown>>();
  const accounting = new Map<string, () => void>();
  let disposed = false;
  return {
    runtimeId: options.runtimeId,
    create<K, V>(id: string, cacheOptions: Omit<RuntimeCacheOptions<K, V>, "runtimeId" | "id" | "now">) {
      if (disposed) throw new Error("Runtime cache registry is disposed.");
      if (caches.has(id)) throw new Error(`Runtime cache ${id} already exists.`);
      const cache = createRuntimeCache<K, V>({ ...cacheOptions, runtimeId: options.runtimeId, id, now: options.now });
      caches.set(id, cache as RuntimeCache<unknown, unknown>);
      const unregister = options.resources?.register({
        id: `cache:${id}`,
        kind: cacheOptions.resourceKind ?? "cache",
        owner: "runtime",
        *measure() {
          // An object value is its own backing identity, so an owner that
          // also reports the same value as active work is counted once.
          for (const entry of cache.residency())
            yield { key: typeof entry.value === "object" && entry.value !== null ? entry.value : `${id}:${String(entry.key)}`, bytes: entry.weight, state: "cache" as const };
        },
        reclaim(request) {
          if (request.level !== "cache") return 0;
          return cache.trimTo(Math.max(0, cache.stats().weight - request.targetBytes));
        },
      });
      if (unregister) accounting.set(id, unregister);
      return cache;
    },
    get<K, V>(id: string) {
      return (caches.get(id) as RuntimeCache<K, V> | undefined) ?? null;
    },
    remove(id: string) {
      const cache = caches.get(id);
      if (!cache) return false;
      accounting.get(id)?.();
      accounting.delete(id);
      cache.dispose();
      caches.delete(id);
      return true;
    },
    prune(request: RuntimeCachePruneRequest): RuntimeCachePruneResult {
      let removed = 0;
      for (const cache of caches.values()) removed += cache.prune(request);
      return { runtimeId: options.runtimeId, reason: request.reason, removed, caches: Array.from(caches.values(), (cache) => cache.stats()) };
    },
    inspect() {
      return Array.from(caches.values(), (cache) => cache.stats());
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const unregister of accounting.values()) unregister();
      accounting.clear();
      for (const cache of caches.values()) cache.dispose();
      caches.clear();
    },
  };
}
