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

export interface IndexRange {
  readonly start: number;
  readonly length: number;
}

function validateRange({ start, length }: IndexRange): void {
  if (
    !Number.isSafeInteger(start) ||
    start < 0 ||
    !Number.isSafeInteger(length) ||
    length < 0 ||
    !Number.isSafeInteger(start + length)
  ) {
    throw new RangeError(
      "Index ranges require non-negative safe integer start and length.",
    );
  }
}

function validateIndex(index: number): void {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new RangeError("Indexes must be non-negative safe integers.");
  }
}

export class IndexSet implements Iterable<number> {
  readonly ranges: readonly Readonly<IndexRange>[];
  readonly count: number;

  private constructor(ranges: readonly IndexRange[]) {
    for (const range of ranges) validateRange(range);

    const ordered = ranges
      .filter(({ length }) => length > 0)
      .map((range) => ({ ...range }))
      .sort((left, right) => left.start - right.start);
    const normalised: Array<{ start: number; length: number }> = [];

    for (const range of ordered) {
      const previous = normalised.at(-1);
      const end = range.start + range.length;

      if (previous && range.start <= previous.start + previous.length) {
        previous.length =
          Math.max(previous.start + previous.length, end) - previous.start;
      } else {
        normalised.push(range);
      }
    }

    const count = normalised.reduce((total, range) => {
      const next = total + range.length;
      if (!Number.isSafeInteger(next)) {
        throw new RangeError("IndexSet count must be a non-negative safe integer.");
      }
      return next;
    }, 0);

    this.ranges = Object.freeze(
      normalised.map((range) => Object.freeze({ ...range })),
    );
    this.count = count;
    Object.freeze(this);
  }

  static empty(): IndexSet {
    return new IndexSet([]);
  }

  static fromIndex(index: number): IndexSet {
    return new IndexSet([{ start: index, length: 1 }]);
  }

  static fromRange(range: IndexRange): IndexSet {
    return new IndexSet([range]);
  }

  static fromRanges(ranges: readonly IndexRange[]): IndexSet {
    return new IndexSet(ranges);
  }

  static fromIndexes(indexes: Iterable<number>): IndexSet {
    return new IndexSet(
      [...indexes].map((start) => ({ start, length: 1 })),
    );
  }

  contains(index: number): boolean {
    validateIndex(index);
    return this.ranges.some(
      (range) =>
        index >= range.start && index < range.start + range.length,
    );
  }

  union(other: IndexSet): IndexSet {
    return new IndexSet([...this.ranges, ...other.ranges]);
  }

  intersect(other: IndexSet): IndexSet {
    const ranges: IndexRange[] = [];
    let leftIndex = 0;
    let rightIndex = 0;

    while (
      leftIndex < this.ranges.length &&
      rightIndex < other.ranges.length
    ) {
      const left = this.ranges[leftIndex]!;
      const right = other.ranges[rightIndex]!;
      const leftEnd = left.start + left.length;
      const rightEnd = right.start + right.length;
      const start = Math.max(left.start, right.start);
      const end = Math.min(leftEnd, rightEnd);
      if (end > start) ranges.push({ start, length: end - start });
      if (leftEnd < rightEnd) leftIndex += 1;
      else if (rightEnd < leftEnd) rightIndex += 1;
      else {
        leftIndex += 1;
        rightIndex += 1;
      }
    }

    return new IndexSet(ranges);
  }

  subtract(other: IndexSet): IndexSet {
    let ranges = this.ranges.map((range) => ({ ...range }));

    for (const removed of other.ranges) {
      ranges = ranges.flatMap((range) => {
        const start = range.start;
        const end = start + range.length;
        const removedEnd = removed.start + removed.length;

        if (removedEnd <= start || removed.start >= end) return [range];

        return [
          { start, length: Math.max(0, removed.start - start) },
          {
            start: Math.max(start, removedEnd),
            length: Math.max(0, end - removedEnd),
          },
        ].filter(({ length }) => length > 0);
      });
    }

    return new IndexSet(ranges);
  }

  shift(startingAt: number, delta: number): IndexSet {
    validateIndex(startingAt);
    if (!Number.isSafeInteger(delta)) {
      throw new RangeError("IndexSet shift must be a safe integer.");
    }

    const shifted: IndexRange[] = [];
    const moveRange = (start: number, length: number): void => {
      if (length === 0) return;
      const movedStart = start + delta;
      const movedEnd = movedStart + length;
      if (
        !Number.isSafeInteger(movedStart) ||
        !Number.isSafeInteger(movedEnd) ||
        movedStart < 0 ||
        movedEnd < 0
      ) {
        throw new RangeError(
          "IndexSet shift must keep indexes within non-negative safe integer bounds.",
        );
      }
      shifted.push({ start: movedStart, length });
    };

    for (const range of this.ranges) {
      const end = range.start + range.length;
      if (end <= startingAt) {
        shifted.push({ ...range });
      } else if (range.start >= startingAt) {
        moveRange(range.start, range.length);
      } else {
        shifted.push({ start: range.start, length: startingAt - range.start });
        moveRange(startingAt, end - startingAt);
      }
    }
    return new IndexSet(shifted);
  }

  *[Symbol.iterator](): Iterator<number> {
    for (const range of this.ranges) {
      const end = range.start + range.length;
      for (let index = range.start; index < end; index += 1) yield index;
    }
  }
}
