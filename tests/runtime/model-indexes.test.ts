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

import { NSEIndexPath, NSEIndexSet } from "../../src/Foundation/public";

describe("model indexes", () => {
  it("compares and derives immutable index paths", () => {
    const path = NSEIndexPath.from(2, 4);

    expect(path.indexPathByAddingIndex(1).indexes).toEqual([2, 4, 1]);
    expect(path.indexPathByRemovingLastIndex()?.indexes).toEqual([2]);
    expect(path.compare(NSEIndexPath.from(2, 5))).toBe(-1);
    expect(() => NSEIndexPath.from(1, -1)).toThrow("non-negative safe integer");
    expect(Object.isFrozen(path.indexes)).toBe(true);
  });

  it("rejects invalid index positions without applying Array.at coercion", () => {
    const path = NSEIndexPath.from(2, 4);
    expect(path.indexAtPosition(0)).toBe(2);
    expect(path.indexAtPosition(1)).toBe(4);
    for (const position of [-1, -2, 0.5, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(path.indexAtPosition(position)).toBeUndefined();
    }
    expect(path.indexAtPosition(2)).toBeUndefined();
    expect(path.indexAtPosition(Number.MAX_SAFE_INTEGER)).toBeUndefined();
  });

  it("removes the last index of an empty or single-index path to an empty path", () => {
    for (const path of [NSEIndexPath.from(), NSEIndexPath.from(3)]) {
      const removed = path.indexPathByRemovingLastIndex();
      expect(removed).toBeInstanceOf(NSEIndexPath);
      expect(removed.indexes).toEqual([]);
      expect(path.indexes).toEqual(path.length === 0 ? [] : [3]);
    }
  });

  it("normalises overlapping ranges without expanding them", () => {
    const set = NSEIndexSet.fromRanges([
      { location: 5, length: 3 },
      { location: 1, length: 5 },
      { location: 20, length: 2 },
    ]);

    expect(set.ranges).toEqual([
      { location: 1, length: 7 },
      { location: 20, length: 2 },
    ]);
    expect(set.count).toBe(9);
    expect(set.contains(7)).toBe(true);
    expect(
      set.subtract(NSEIndexSet.fromRange({ location: 3, length: 3 })).ranges,
    ).toEqual([
      { location: 1, length: 2 },
      { location: 6, length: 2 },
      { location: 20, length: 2 },
    ]);
    expect([...set.shift(6, 2)]).toEqual([1, 2, 3, 4, 5, 8, 9, 22, 23]);
  });

  it("shifts and intersects ranges without materialising their indexes", () => {
    const set = NSEIndexSet.fromRanges([
      { location: 3, length: 5 },
      { location: 1_000_000_000, length: 1_000_000_000 },
    ]);
    const iterator = vi
      .spyOn(NSEIndexSet.prototype, Symbol.iterator)
      .mockImplementation(function* blockedIteration() {
        throw new Error("shift must remain range-backed");
      });

    try {
      expect(set.shift(5, 2).ranges).toEqual([
        { location: 3, length: 2 },
        { location: 7, length: 3 },
        { location: 1_000_000_002, length: 1_000_000_000 },
      ]);
    } finally {
      iterator.mockRestore();
    }

    const left = NSEIndexSet.fromRanges(
      Array.from({ length: 512 }, (_, index) => ({
        location: index * 20,
        length: 7,
      })),
    );
    const right = NSEIndexSet.fromRanges(
      Array.from({ length: 512 }, (_, index) => ({
        location: index * 20 + 5,
        length: 7,
      })),
    );
    expect(left.intersect(right).ranges).toHaveLength(512);
    expect(left.intersect(right).ranges[0]).toEqual({ location: 5, length: 2 });
    expect(left.intersect(right).ranges.at(-1)).toEqual({
      location: 10_225,
      length: 2,
    });
    expect(() =>
      NSEIndexSet.fromRange({ location: 0, length: 1 }).shift(0, -1),
    ).toThrow(/safe integer/i);
    expect(() =>
      NSEIndexSet.fromRange({ location: Number.MAX_SAFE_INTEGER - 1, length: 1 }).shift(
        0,
        1,
      ),
    ).toThrow(/safe integer/i);
  });
});
