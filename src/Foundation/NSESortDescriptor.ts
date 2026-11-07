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

export type NSESortDirection = "ascending" | "descending";
export type NSESortNulls = "first" | "last";

export interface NSESortDescriptorOptions<T, V> {
  readonly id: string;
  readonly select: (item: T) => V;
  readonly direction?: NSESortDirection;
  readonly nulls?: NSESortNulls;
  readonly compare?: (left: V, right: V) => number;
  readonly collator?: Intl.Collator;
}

export interface NSESortComparator<T> {
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

export class NSESortDescriptor<T, V> implements NSESortComparator<T> {
  readonly id: string;
  readonly direction: NSESortDirection;
  readonly #options: NSESortDescriptorOptions<T, V>;

  constructor(options: NSESortDescriptorOptions<T, V>) {
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

  reversedSortDescriptor(): NSESortDescriptor<T, V> {
    return new NSESortDescriptor({
      ...this.#options,
      direction:
        this.direction === "ascending" ? "descending" : "ascending",
    });
  }
}
