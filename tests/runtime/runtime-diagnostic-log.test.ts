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
import { estimateRetainedBytes, RuntimeDiagnosticLog } from "../../src/SynCloudOS/Diagnostics/RuntimeDiagnosticLog";

type Entry = { readonly id: number; readonly payload: unknown };
const project = (entry: Entry, estimatedBytes: number): Entry => ({ id: entry.id, payload: { truncated: true, estimatedBytes } });

describe("RuntimeDiagnosticLog", () => {
  it("retains the newest entries within the entry limit", () => {
    const log = new RuntimeDiagnosticLog<Entry>({ maximumEntries: 3, maximumBytes: 1 << 20, maximumEntryBytes: 1 << 16, project });
    for (let id = 0; id < 5; id++) log.append({ id, payload: null });
    expect(log.entries().map((entry) => entry.id)).toEqual([2, 3, 4]);
    expect(log.entries(2).map((entry) => entry.id)).toEqual([3, 4]);
    expect(log.statistics()).toMatchObject({ entries: 3, evicted: 2 });
  });

  it("honours a stricter per-append entry limit", () => {
    const log = new RuntimeDiagnosticLog<Entry>({ maximumEntries: 10, maximumBytes: 1 << 20, maximumEntryBytes: 1 << 16, project });
    for (let id = 0; id < 6; id++) log.append({ id, payload: null });
    log.append({ id: 6, payload: null }, 2);
    expect(log.entries().map((entry) => entry.id)).toEqual([5, 6]);
  });

  it("evicts oldest entries to stay within the byte budget", () => {
    const log = new RuntimeDiagnosticLog<Entry>({ maximumEntries: 100, maximumBytes: 4096, maximumEntryBytes: 4096, project });
    for (let id = 0; id < 20; id++) log.append({ id, payload: "x".repeat(500) });
    expect(log.statistics().estimatedBytes).toBeLessThanOrEqual(4096);
    expect(log.entries().at(-1)?.id).toBe(19);
    expect(log.size).toBeLessThan(20);
  });

  it("retains a bounded projection of an oversized entry", () => {
    const log = new RuntimeDiagnosticLog<Entry>({ maximumEntries: 10, maximumBytes: 1 << 20, maximumEntryBytes: 1024, project });
    const retained = log.append({ id: 1, payload: { big: "y".repeat(10_000) } });
    expect(retained.payload).toMatchObject({ truncated: true });
    expect(log.entries()[0]).toBe(retained);
    expect(log.statistics().projected).toBe(1);
  });

  it("notifies explicit subscribers of the retained form and stops after unsubscribe", () => {
    const log = new RuntimeDiagnosticLog<Entry>({ maximumEntries: 10, maximumBytes: 1 << 20, maximumEntryBytes: 1 << 16, project });
    const seen: number[] = [];
    const unsubscribe = log.subscribe((entry) => seen.push(entry.id));
    log.append({ id: 1, payload: null });
    unsubscribe();
    log.append({ id: 2, payload: null });
    expect(seen).toEqual([1]);
  });

  it("estimates cyclic graphs without unbounded traversal", () => {
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;
    expect(estimateRetainedBytes(cyclic, 1 << 20)).toBeLessThan(1024);
    const wide = { items: Array.from({ length: 100_000 }, (_, index) => ({ index })) };
    expect(estimateRetainedBytes(wide, 4096)).toBeGreaterThan(4096);
  });
});
