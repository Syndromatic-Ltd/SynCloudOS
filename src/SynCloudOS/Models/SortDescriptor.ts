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

export type SortDirection = "ascending" | "descending";
export type SortNulls = "first" | "last";

export interface SortDescriptorOptions<T, V> {
  readonly id: string;
  readonly select: (item: T) => V;
  readonly direction?: SortDirection;
  readonly nulls?: SortNulls;
  readonly compare?: (left: V, right: V) => number;
  readonly collator?: Intl.Collator;
}

export interface SortComparator<T> {
  compare(left: T, right: T): number;
}

function compareNative(left: unknown, right: unknown): number {
  if (Object.is(left, right)) return 0;
  if (typeof left === "number" && typeof right === "number") {
    if (Number.isNaN(left)) return 1;
    if (Number.isNaN(right)) return -1;
    return left < right ? -1 : left > right ? 1 : 0;
  }
  if (typeof left === "string" && typeof right === "string") {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  if (typeof left === "bigint" && typeof right === "bigint") {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  if (typeof left === "boolean" && typeof right === "boolean") {
    return left === right ? 0 : left ? 1 : -1;
  }
  const rank = (value: unknown): number => {
    switch (typeof value) {
      case "boolean":
        return 0;
      case "number":
        return 1;
      case "bigint":
        return 2;
      case "string":
        return 3;
      case "symbol":
        return 4;
      case "undefined":
        return 5;
      case "function":
        return 6;
      default:
        return 7;
    }
  };
  return rank(left) - rank(right);
}

export class SortDescriptor<T, V> implements SortComparator<T> {
  readonly id: string;
  readonly direction: SortDirection;
  readonly #options: SortDescriptorOptions<T, V>;

  constructor(options: SortDescriptorOptions<T, V>) {
    if (options.id.trim().length === 0) {
      throw new TypeError("Sort descriptor id must not be empty.");
    }
    if (options.compare && options.collator) {
      throw new TypeError(
        "Sort descriptors accept either compare or collator, not both.",
      );
    }

    this.#options = { ...options };
    this.id = options.id;
    this.direction = options.direction ?? "ascending";
    Object.freeze(this);
  }

  compare(leftItem: T, rightItem: T): number {
    const left = this.#options.select(leftItem);
    const right = this.#options.select(rightItem);
    let result: number;

    if (left == null || right == null) {
      const nulls = this.#options.nulls ?? "last";
      result =
        left == null && right == null
          ? 0
          : left == null
            ? nulls === "first"
              ? -1
              : 1
            : nulls === "first"
              ? 1
              : -1;
    } else if (this.#options.compare) {
      result = this.#options.compare(left, right);
    } else if (
      typeof left === "string" &&
      typeof right === "string" &&
      this.#options.collator
    ) {
      result = this.#options.collator.compare(left, right);
    } else {
      result = compareNative(left, right);
    }

    const ordered = result < 0 ? -1 : result > 0 ? 1 : 0;
    return this.direction === "ascending" ? ordered : -ordered;
  }

  reversed(): SortDescriptor<T, V> {
    return new SortDescriptor({
      ...this.#options,
      direction:
        this.direction === "ascending" ? "descending" : "ascending",
    });
  }
}

export function sortWithDescriptors<T>(
  items: readonly T[],
  descriptors: readonly SortComparator<T>[],
): readonly T[] {
  if (descriptors.length === 0) return items;

  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      for (const descriptor of descriptors) {
        const result = descriptor.compare(left.item, right.item);
        if (result !== 0) return result;
      }
      return left.index - right.index;
    })
    .map(({ item }) => item);
}
