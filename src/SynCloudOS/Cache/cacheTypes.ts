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
import type { RuntimeResourceKind } from "../Resources/RuntimeResourceLedger";

export type RuntimeCacheEvictionReason = "expired" | "capacity" | "replaced" | "deleted" | "cleared" | "disposed";

export interface RuntimeCacheOptions<K, V> {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly id: string;
  readonly maxEntries: number;
  readonly maxWeight: number;
  readonly ttlMs?: number;
  readonly now: () => number;
  readonly weightOf: (value: V, key: K) => number;
  readonly onEvict?: (value: V, key: K, reason: RuntimeCacheEvictionReason) => void;
  /** How entries are attributed in runtime resource accounting; weights are
   * treated as estimated bytes. Defaults to "cache". */
  readonly resourceKind?: RuntimeResourceKind;
}

export interface RuntimeCacheStats {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly id: string;
  readonly entries: number;
  readonly weight: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly expirations: number;
  readonly cleanupErrors: number;
  readonly disposed: boolean;
}

export interface RuntimeCache<K, V> {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly id: string;
  get(key: K): V | undefined;
  has(key: K): boolean;
  set(key: K, value: V): boolean;
  delete(key: K): boolean;
  prune(request: { readonly reason: "expiry" | "suspend" | "memory-warning"; readonly targetWeight?: number }): number;
  /** Evicts least recently used entries until total weight is at most
   * `targetWeight`; returns the weight evicted. */
  trimTo(targetWeight: number): number;
  /** Retained values and weights, for resource accounting. */
  residency(): Iterable<Readonly<{ key: K; value: V; weight: number }>>;
  clear(): void;
  stats(): RuntimeCacheStats;
  dispose(): void;
}

export interface RuntimeCachePruneRequest {
  readonly reason: "expiry" | "suspend" | "memory-warning";
  readonly targetWeight?: number;
}

export interface RuntimeCachePruneResult {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly reason: RuntimeCachePruneRequest["reason"];
  readonly removed: number;
  readonly caches: readonly RuntimeCacheStats[];
}

export interface RuntimeCacheRegistry {
  readonly runtimeId: SynCloudOSRuntimeId;
  create<K, V>(id: string, options: Omit<RuntimeCacheOptions<K, V>, "runtimeId" | "id" | "now">): RuntimeCache<K, V>;
  get<K, V>(id: string): RuntimeCache<K, V> | null;
  remove(id: string): boolean;
  prune(request: RuntimeCachePruneRequest): RuntimeCachePruneResult;
  inspect(): RuntimeCacheStats[];
  dispose(): void;
}
