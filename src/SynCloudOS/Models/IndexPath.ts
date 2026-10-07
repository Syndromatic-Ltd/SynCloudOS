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

export class IndexPath {
  readonly indexes: readonly number[];

  private constructor(indexes: readonly number[]) {
    if (
      indexes.some(
        (index) => !Number.isSafeInteger(index) || index < 0,
      )
    ) {
      throw new RangeError(
        "IndexPath indexes must be non-negative safe integers.",
      );
    }

    this.indexes = Object.freeze([...indexes]);
    Object.freeze(this);
  }

  static from(...indexes: number[]): IndexPath {
    return new IndexPath(indexes);
  }

  static fromJSON(indexes: readonly number[]): IndexPath {
    return new IndexPath(indexes);
  }

  get length(): number {
    return this.indexes.length;
  }

  at(position: number): number | undefined {
    return this.indexes.at(position);
  }

  append(index: number): IndexPath {
    return new IndexPath([...this.indexes, index]);
  }

  parent(): IndexPath | null {
    return this.length === 0
      ? null
      : new IndexPath(this.indexes.slice(0, -1));
  }

  equals(other: IndexPath): boolean {
    return this.compare(other) === 0;
  }

  compare(other: IndexPath): -1 | 0 | 1 {
    return compareIndexPaths(this, other);
  }

  toJSON(): number[] {
    return [...this.indexes];
  }

  toString(): string {
    return this.indexes.join(".");
  }
}

export function compareIndexPaths(left: IndexPath, right: IndexPath): -1 | 0 | 1 {
  const length = Math.min(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const delta = left.indexes[index]! - right.indexes[index]!;
    if (delta !== 0) return delta < 0 ? -1 : 1;
  }

  if (left.length === right.length) return 0;
  return left.length < right.length ? -1 : 1;
}
