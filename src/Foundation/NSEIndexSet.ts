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

import type { NSERange } from "./NSERange";

function validateRange({ location, length }: NSERange): void {
  if (
    !Number.isSafeInteger(location) ||
    location < 0 ||
    !Number.isSafeInteger(length) ||
    length < 0 ||
    !Number.isSafeInteger(location + length)
  ) {
    throw new RangeError(
      "Index ranges require non-negative safe integer location and length.",
    );
  }
}

function validateIndex(index: number): void {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new RangeError("Indexes must be non-negative safe integers.");
  }
}

export class NSEIndexSet implements Iterable<number> {
  readonly ranges: readonly Readonly<NSERange>[];
  readonly count: number;

  private constructor(ranges: readonly NSERange[]) {
    for (const range of ranges) validateRange(range);

    const ordered = ranges
      .filter(({ length }) => length > 0)
      .map((range) => ({ ...range }))
      .sort((left, right) => left.location - right.location);
    const normalised: Array<{ location: number; length: number }> = [];

    for (const range of ordered) {
      const previous = normalised.at(-1);
      const end = range.location + range.length;

      if (previous && range.location <= previous.location + previous.length) {
        previous.length =
          Math.max(previous.location + previous.length, end) - previous.location;
      } else {
        normalised.push(range);
      }
    }

    const count = normalised.reduce((total, range) => {
      const next = total + range.length;
      if (!Number.isSafeInteger(next)) {
        throw new RangeError("NSEIndexSet count must be a non-negative safe integer.");
      }
      return next;
    }, 0);

    this.ranges = Object.freeze(
      normalised.map((range) => Object.freeze({ ...range })),
    );
    this.count = count;
    Object.freeze(this);
  }

  static empty(): NSEIndexSet {
    return new NSEIndexSet([]);
  }

  static fromIndex(index: number): NSEIndexSet {
    return new NSEIndexSet([{ location: index, length: 1 }]);
  }

  static fromRange(range: NSERange): NSEIndexSet {
    return new NSEIndexSet([range]);
  }

  static fromRanges(ranges: readonly NSERange[]): NSEIndexSet {
    return new NSEIndexSet(ranges);
  }

  static fromIndexes(indexes: Iterable<number>): NSEIndexSet {
    return new NSEIndexSet(
      [...indexes].map((location) => ({ location, length: 1 })),
    );
  }

  contains(index: number): boolean {
    validateIndex(index);
    return this.ranges.some(
      (range) =>
        index >= range.location && index < range.location + range.length,
    );
  }

  union(other: NSEIndexSet): NSEIndexSet {
    return new NSEIndexSet([...this.ranges, ...other.ranges]);
  }

  intersect(other: NSEIndexSet): NSEIndexSet {
    const ranges: NSERange[] = [];
    let leftIndex = 0;
    let rightIndex = 0;

    while (
      leftIndex < this.ranges.length &&
      rightIndex < other.ranges.length
    ) {
      const left = this.ranges[leftIndex]!;
      const right = other.ranges[rightIndex]!;
      const leftEnd = left.location + left.length;
      const rightEnd = right.location + right.length;
      const location = Math.max(left.location, right.location);
      const end = Math.min(leftEnd, rightEnd);
      if (end > location) ranges.push({ location, length: end - location });
      if (leftEnd < rightEnd) leftIndex += 1;
      else if (rightEnd < leftEnd) rightIndex += 1;
      else {
        leftIndex += 1;
        rightIndex += 1;
      }
    }

    return new NSEIndexSet(ranges);
  }

  subtract(other: NSEIndexSet): NSEIndexSet {
    let ranges = this.ranges.map((range) => ({ ...range }));

    for (const removed of other.ranges) {
      ranges = ranges.flatMap((range) => {
        const location = range.location;
        const end = location + range.length;
        const removedEnd = removed.location + removed.length;

        if (removedEnd <= location || removed.location >= end) return [range];

        return [
          { location, length: Math.max(0, removed.location - location) },
          {
            location: Math.max(location, removedEnd),
            length: Math.max(0, end - removedEnd),
          },
        ].filter(({ length }) => length > 0);
      });
    }

    return new NSEIndexSet(ranges);
  }

  shift(startingAt: number, delta: number): NSEIndexSet {
    validateIndex(startingAt);
    if (!Number.isSafeInteger(delta)) {
      throw new RangeError("NSEIndexSet shift must be a safe integer.");
    }

    const shifted: NSERange[] = [];
    const moveRange = (location: number, length: number): void => {
      if (length === 0) return;
      const movedStart = location + delta;
      const movedEnd = movedStart + length;
      if (
        !Number.isSafeInteger(movedStart) ||
        !Number.isSafeInteger(movedEnd) ||
        movedStart < 0 ||
        movedEnd < 0
      ) {
        throw new RangeError(
          "NSEIndexSet shift must keep indexes within non-negative safe integer bounds.",
        );
      }
      shifted.push({ location: movedStart, length });
    };

    for (const range of this.ranges) {
      const end = range.location + range.length;
      if (end <= startingAt) {
        shifted.push({ ...range });
      } else if (range.location >= startingAt) {
        moveRange(range.location, range.length);
      } else {
        shifted.push({ location: range.location, length: startingAt - range.location });
        moveRange(startingAt, end - startingAt);
      }
    }
    return new NSEIndexSet(shifted);
  }

  *[Symbol.iterator](): Iterator<number> {
    for (const range of this.ranges) {
      const end = range.location + range.length;
      for (let index = range.location; index < end; index += 1) yield index;
    }
  }
}
