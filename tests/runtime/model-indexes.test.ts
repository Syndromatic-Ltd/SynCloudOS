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

import { IndexPath, IndexSet } from "../../src/SynCloudOS/Models";

describe("model indexes", () => {
  it("compares and derives immutable index paths", () => {
    const path = IndexPath.from(2, 4);

    expect(path.append(1).indexes).toEqual([2, 4, 1]);
    expect(path.parent()?.indexes).toEqual([2]);
    expect(path.compare(IndexPath.from(2, 5))).toBe(-1);
    expect(() => IndexPath.from(1, -1)).toThrow("non-negative safe integer");
    expect(Object.isFrozen(path.indexes)).toBe(true);
  });

  it("normalises overlapping ranges without expanding them", () => {
    const set = IndexSet.fromRanges([
      { start: 5, length: 3 },
      { start: 1, length: 5 },
      { start: 20, length: 2 },
    ]);

    expect(set.ranges).toEqual([
      { start: 1, length: 7 },
      { start: 20, length: 2 },
    ]);
    expect(set.count).toBe(9);
    expect(set.contains(7)).toBe(true);
    expect(
      set.subtract(IndexSet.fromRange({ start: 3, length: 3 })).ranges,
    ).toEqual([
      { start: 1, length: 2 },
      { start: 6, length: 2 },
      { start: 20, length: 2 },
    ]);
    expect([...set.shift(6, 2)]).toEqual([1, 2, 3, 4, 5, 8, 9, 22, 23]);
  });

  it("shifts and intersects ranges without materialising their indexes", () => {
    const set = IndexSet.fromRanges([
      { start: 3, length: 5 },
      { start: 1_000_000_000, length: 1_000_000_000 },
    ]);
    const iterator = vi
      .spyOn(IndexSet.prototype, Symbol.iterator)
      .mockImplementation(function* blockedIteration() {
        throw new Error("shift must remain range-backed");
      });

    try {
      expect(set.shift(5, 2).ranges).toEqual([
        { start: 3, length: 2 },
        { start: 7, length: 3 },
        { start: 1_000_000_002, length: 1_000_000_000 },
      ]);
    } finally {
      iterator.mockRestore();
    }

    const left = IndexSet.fromRanges(
      Array.from({ length: 512 }, (_, index) => ({
        start: index * 20,
        length: 7,
      })),
    );
    const right = IndexSet.fromRanges(
      Array.from({ length: 512 }, (_, index) => ({
        start: index * 20 + 5,
        length: 7,
      })),
    );
    expect(left.intersect(right).ranges).toHaveLength(512);
    expect(left.intersect(right).ranges[0]).toEqual({ start: 5, length: 2 });
    expect(left.intersect(right).ranges.at(-1)).toEqual({
      start: 10_225,
      length: 2,
    });
    expect(() =>
      IndexSet.fromRange({ start: 0, length: 1 }).shift(0, -1),
    ).toThrow(/safe integer/i);
    expect(() =>
      IndexSet.fromRange({ start: Number.MAX_SAFE_INTEGER - 1, length: 1 }).shift(
        0,
        1,
      ),
    ).toThrow(/safe integer/i);
  });
});
