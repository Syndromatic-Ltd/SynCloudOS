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

// Bounded, non-reactive diagnostic history.
//
// Runtime diagnostics (event history, transaction records, policy traces) are
// for inspection, not application state. Keeping them in the reactive runtime
// snapshot made every diagnostic append a global publication and retained
// arbitrary payload graphs bounded only by entry count. A log is bounded by
// both entries and estimated retained bytes; an entry above the per-entry cap
// is stored as a caller-supplied projection. Inspectors observe appends through
// an explicit subscription instead of the runtime store.

export interface RuntimeDiagnosticLogOptions<T> {
  readonly maximumEntries: number;
  /** Bound on the summed estimate of retained entries. */
  readonly maximumBytes: number;
  /** Entries estimated above this are replaced by `project(entry)`. */
  readonly maximumEntryBytes: number;
  /** Bounded summary retained for an oversized entry. */
  readonly project: (entry: T, estimatedBytes: number) => T;
}

export interface RuntimeDiagnosticLogStatistics {
  readonly entries: number;
  readonly estimatedBytes: number;
  readonly projected: number;
  readonly evicted: number;
}

function positive(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${label} must be a positive safe integer.`);
  return value;
}

/**
 * Estimated retained bytes of a value, visiting at most enough structure to
 * exceed `cap` (it then returns a value above `cap`). Cycle-safe. An estimate
 * for admission and eviction, not a heap measurement.
 */
export function estimateRetainedBytes(value: unknown, cap: number): number {
  let total = 0;
  const seen = new Set<object>();
  const stack: unknown[] = [value];
  while (stack.length > 0 && total <= cap) {
    const current = stack.pop();
    if (current === null || current === undefined) { total += 8; continue; }
    switch (typeof current) {
      case "string": total += 16 + current.length * 2; continue;
      case "number": case "boolean": case "bigint": case "symbol": total += 8; continue;
      case "function": total += 32; continue;
      default: break;
    }
    const object = current as object;
    if (seen.has(object)) { total += 8; continue; }
    seen.add(object);
    if (ArrayBuffer.isView(object)) { total += 64 + object.byteLength; continue; }
    if (object instanceof ArrayBuffer) { total += 32 + object.byteLength; continue; }
    if (Array.isArray(object)) {
      total += 16 + object.length * 8;
      for (let index = object.length - 1; index >= 0; index--) stack.push(object[index]);
      continue;
    }
    if (object instanceof Map || object instanceof Set) {
      total += 32 + object.size * 16;
      for (const entry of object) stack.push(entry);
      continue;
    }
    total += 32;
    for (const key of Object.keys(object)) {
      total += 8 + key.length * 2;
      stack.push((object as Record<string, unknown>)[key]);
    }
  }
  return total;
}

export class RuntimeDiagnosticLog<T> {
  readonly maximumEntries: number;
  readonly maximumBytes: number;
  readonly maximumEntryBytes: number;
  readonly #project: RuntimeDiagnosticLogOptions<T>["project"];
  readonly #entries: T[] = [];
  readonly #sizes: number[] = [];
  readonly #listeners = new Set<(entry: T) => void>();
  #bytes = 0;
  #projected = 0;
  #evicted = 0;

  constructor(options: RuntimeDiagnosticLogOptions<T>) {
    this.maximumEntries = positive(options.maximumEntries, "Diagnostic log entry limit");
    this.maximumBytes = positive(options.maximumBytes, "Diagnostic log byte limit");
    this.maximumEntryBytes = positive(options.maximumEntryBytes, "Diagnostic log entry byte limit");
    if (typeof options.project !== "function") throw new TypeError("Diagnostic log projection is required.");
    this.#project = options.project;
  }

  /** Appends an entry, retaining its projection when oversized, then trims
   * to the entry limit (or a stricter per-append `entryLimit`) and byte
   * budget, oldest first. Returns the retained form. */
  append(entry: T, entryLimit = this.maximumEntries): T {
    let retained = entry;
    let size = estimateRetainedBytes(entry, this.maximumEntryBytes);
    if (size > this.maximumEntryBytes) {
      retained = this.#project(entry, size);
      size = Math.min(this.maximumEntryBytes, estimateRetainedBytes(retained, this.maximumEntryBytes));
      this.#projected += 1;
    }
    this.#entries.push(retained);
    this.#sizes.push(size);
    this.#bytes += size;
    const limit = Math.max(1, Math.min(this.maximumEntries, Math.floor(entryLimit)));
    let evict = 0;
    let bytes = this.#bytes;
    while (this.#entries.length - evict > limit || (bytes > this.maximumBytes && this.#entries.length - evict > 1)) {
      bytes -= this.#sizes[evict]!;
      evict += 1;
    }
    if (evict > 0) {
      this.#entries.splice(0, evict);
      this.#sizes.splice(0, evict);
      this.#bytes = bytes;
      this.#evicted += evict;
    }
    for (const listener of [...this.#listeners]) listener(retained);
    return retained;
  }

  /** Retained entries, oldest first; the most recent `limit` when given. */
  entries(limit?: number): T[] {
    return typeof limit === "number" ? this.#entries.slice(-Math.max(0, Math.floor(limit))) : this.#entries.slice();
  }

  get size(): number { return this.#entries.length; }

  statistics(): RuntimeDiagnosticLogStatistics {
    return Object.freeze({ entries: this.#entries.length, estimatedBytes: this.#bytes, projected: this.#projected, evicted: this.#evicted });
  }

  /** Observes subsequent appends; for inspectors that present live history. */
  subscribe(listener: (entry: T) => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  clear(): void {
    this.#entries.length = 0;
    this.#sizes.length = 0;
    this.#bytes = 0;
  }

  dispose(): void {
    this.clear();
    this.#listeners.clear();
  }
}
