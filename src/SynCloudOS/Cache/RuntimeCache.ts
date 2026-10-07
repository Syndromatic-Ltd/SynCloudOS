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

import type {
  RuntimeCache,
  RuntimeCacheEvictionReason,
  RuntimeCacheOptions,
  RuntimeCacheStats,
} from "./cacheTypes";

interface RuntimeCacheEntry<K, V> {
  readonly key: K;
  readonly value: V;
  readonly weight: number;
  readonly createdAt: number;
  readonly expiresAt: number | null;
  lastAccessAt: number;
}

function validateOptions<K, V>(options: RuntimeCacheOptions<K, V>) {
  if (!Number.isInteger(options.maxEntries) || options.maxEntries <= 0) throw new RangeError("maxEntries must be a positive integer.");
  if (!Number.isFinite(options.maxWeight) || options.maxWeight <= 0) throw new RangeError("maxWeight must be finite and positive.");
  if (options.ttlMs !== undefined && (!Number.isFinite(options.ttlMs) || options.ttlMs < 0)) throw new RangeError("ttlMs must be finite and non-negative.");
}

export function createRuntimeCache<K, V>(options: RuntimeCacheOptions<K, V>): RuntimeCache<K, V> {
  validateOptions(options);
  const entries = new Map<K, RuntimeCacheEntry<K, V>>();
  let totalWeight = 0;
  let hits = 0;
  let misses = 0;
  let evictions = 0;
  let expirations = 0;
  let cleanupErrors = 0;
  let disposed = false;

  const cleanup = (entry: RuntimeCacheEntry<K, V>, reason: RuntimeCacheEvictionReason) => {
    try {
      options.onEvict?.(entry.value, entry.key, reason);
    } catch {
      cleanupErrors += 1;
    }
  };

  const removeEntry = (key: K, reason: RuntimeCacheEvictionReason) => {
    const entry = entries.get(key);
    if (!entry) return false;
    entries.delete(key);
    totalWeight -= entry.weight;
    if (reason === "capacity") evictions += 1;
    if (reason === "expired") expirations += 1;
    cleanup(entry, reason);
    return true;
  };

  const expire = (now: number) => {
    for (const [key, entry] of entries) {
      if (entry.expiresAt !== null && now >= entry.expiresAt) removeEntry(key, "expired");
    }
  };

  const cache: RuntimeCache<K, V> = {
    runtimeId: options.runtimeId,
    id: options.id,
    get(key) {
      if (disposed) return undefined;
      const now = options.now();
      expire(now);
      const entry = entries.get(key);
      if (!entry || (entry.expiresAt !== null && now >= entry.expiresAt)) {
        misses += 1;
        if (entry) removeEntry(key, "expired");
        return undefined;
      }
      hits += 1;
      entry.lastAccessAt = now;
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    has(key) {
      if (disposed) return false;
      const entry = entries.get(key);
      if (!entry) return false;
      if (entry.expiresAt !== null && options.now() >= entry.expiresAt) {
        removeEntry(key, "expired");
        return false;
      }
      return true;
    },
    set(key, value) {
      if (disposed) return false;
      const weight = options.weightOf(value, key);
      if (!Number.isFinite(weight) || weight < 0 || weight > options.maxWeight) return false;
      removeEntry(key, "replaced");
      const now = options.now();
      entries.set(key, {
        key,
        value,
        weight,
        createdAt: now,
        lastAccessAt: now,
        expiresAt: options.ttlMs === undefined ? null : now + options.ttlMs,
      });
      totalWeight += weight;
      while (entries.size > options.maxEntries || totalWeight > options.maxWeight) {
        const oldest = entries.keys().next().value as K | undefined;
        if (oldest === undefined) break;
        removeEntry(oldest, "capacity");
      }
      return entries.has(key);
    },
    delete(key) {
      if (disposed) return false;
      return removeEntry(key, "deleted");
    },
    prune(request) {
      if (disposed) return 0;
      expire(options.now());
      if (request.reason !== "memory-warning") return 0;
      const target = Math.max(0, Math.min(request.targetWeight ?? Math.floor(options.maxWeight / 2), Math.floor(options.maxWeight / 2)));
      let removed = 0;
      while (totalWeight > target && entries.size > 0) {
        const oldest = entries.keys().next().value as K | undefined;
        if (oldest === undefined) break;
        if (removeEntry(oldest, "capacity")) removed += 1;
      }
      return removed;
    },
    trimTo(targetWeight) {
      if (disposed) return 0;
      const target = Math.max(0, targetWeight);
      const before = totalWeight;
      while (totalWeight > target && entries.size > 0) {
        const oldest = entries.keys().next().value as K | undefined;
        if (oldest === undefined) break;
        removeEntry(oldest, "capacity");
      }
      return before - totalWeight;
    },
    *residency() {
      if (disposed) return;
      for (const entry of entries.values()) yield Object.freeze({ key: entry.key, value: entry.value, weight: entry.weight });
    },
    clear() {
      if (disposed) return;
      for (const key of Array.from(entries.keys())) removeEntry(key, "cleared");
    },
    stats() {
      return {
        runtimeId: options.runtimeId,
        id: options.id,
        entries: entries.size,
        weight: totalWeight,
        hits,
        misses,
        evictions,
        expirations,
        cleanupErrors,
        disposed,
      };
    },
    dispose() {
      if (disposed) return;
      for (const key of Array.from(entries.keys())) removeEntry(key, "disposed");
      disposed = true;
    },
  };
  return cache;
}
