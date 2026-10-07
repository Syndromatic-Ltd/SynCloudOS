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

export class CountedSet<T> implements Iterable<T> {
  readonly #counts = new Map<T, number>();
  #totalCount = 0;

  constructor(values?: Iterable<T> | CountedSet<T>) {
    if (values instanceof CountedSet) {
      for (const [value, count] of values.entriesWithCounts()) {
        this.add(value, count);
      }
    } else if (values) {
      for (const value of values) this.add(value);
    }
  }

  get size(): number {
    return this.#counts.size;
  }

  get totalCount(): number {
    return this.#totalCount;
  }

  count(value: T): number {
    return this.#counts.get(value) ?? 0;
  }

  has(value: T): boolean {
    return this.#counts.has(value);
  }

  add(value: T, increment = 1): this {
    if (!Number.isSafeInteger(increment) || increment <= 0) {
      throw new RangeError("Count increment must be a positive safe integer.");
    }
    const count = this.count(value);
    if (!Number.isSafeInteger(count + increment)) {
      throw new RangeError("CountedSet item count exceeds the safe integer range.");
    }
    if (!Number.isSafeInteger(this.#totalCount + increment)) {
      throw new RangeError("CountedSet total count exceeds the safe integer range.");
    }
    this.#counts.set(value, count + increment);
    this.#totalCount += increment;
    return this;
  }

  delete(value: T): boolean {
    const count = this.#counts.get(value);
    if (count === undefined) return false;
    if (count === 1) this.#counts.delete(value);
    else this.#counts.set(value, count - 1);
    this.#totalCount -= 1;
    return true;
  }

  deleteAll(value: T): number {
    const count = this.#counts.get(value) ?? 0;
    if (count === 0) return 0;
    this.#counts.delete(value);
    this.#totalCount -= count;
    return count;
  }

  clear(): void {
    this.#counts.clear();
    this.#totalCount = 0;
  }

  entriesWithCounts(): IterableIterator<readonly [T, number]> {
    return Object.freeze(
      [...this.#counts].map(([value, count]) => Object.freeze([value, count] as const)),
    )[Symbol.iterator]();
  }

  values(): IterableIterator<T> {
    return [...this.#counts.keys()][Symbol.iterator]();
  }

  keys(): IterableIterator<T> {
    return this.values();
  }

  [Symbol.iterator](): IterableIterator<T> {
    return this.values();
  }
}
