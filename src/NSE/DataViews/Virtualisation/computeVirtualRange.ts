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

import type { IndexRange } from "../../../SynCloudOS/Models";
import type { NSEVirtualRange, NSEVirtualRangeOptions, NSEVirtualSizeEstimate } from "./virtualisationTypes";

const MAX_VIRTUAL_COUNT = 10_000_000;

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be finite and non-negative.`);
  return value;
}

function finiteDerived(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} exceeds supported finite geometry.`);
  return value;
}

function finiteDifference(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} exceeds supported finite geometry.`);
  return value;
}

export function validateNSEVirtualCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_VIRTUAL_COUNT) throw new RangeError("Virtual count must be a supported non-negative safe integer.");
  return value;
}

export function validateNSEVirtualSize(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError("Virtual item size must be finite and positive.");
  return value;
}

export class NSEVirtualSizeIndex {
  readonly count: number;
  readonly #defaultSize: number;
  readonly #sizes = new Map<number, number>();
  readonly #tree = new Map<number, number>();

  constructor(count: number, estimateSize: NSEVirtualSizeEstimate) {
    this.count = validateNSEVirtualCount(count);
    this.#defaultSize = this.count === 0 || typeof estimateSize === "function" ? 0 : validateNSEVirtualSize(estimateSize);
    if (typeof estimateSize === "function") {
      for (let index = 0; index < this.count; index += 1) {
        const size = validateNSEVirtualSize(estimateSize(index));
        this.#sizes.set(index, size);
        this.#addDifference(index, size);
      }
    }
    finiteDerived(this.startAt(this.count), "Virtual total geometry");
  }

  sizeAt(index: number): number {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.count) throw new RangeError("Virtual item index is outside the collection.");
    const cached = this.#sizes.get(index);
    if (cached !== undefined) return cached;
    return this.#defaultSize;
  }

  startAt(index: number): number {
    if (!Number.isSafeInteger(index) || index < 0 || index > this.count) throw new RangeError("Virtual prefix index is outside the collection.");
    let difference = 0;
    for (let cursor = index; cursor > 0; cursor -= cursor & -cursor) difference = finiteDifference(difference + (this.#tree.get(cursor) ?? 0), "Virtual prefix geometry");
    return finiteDerived(this.#defaultSize * index + difference, "Virtual prefix geometry");
  }

  get totalSize(): number { return this.startAt(this.count); }

  update(index: number, size: number): boolean {
    const next = validateNSEVirtualSize(size);
    const previous = this.sizeAt(index);
    if (previous === next) return false;
    finiteDerived(this.totalSize + next - previous, "Virtual total geometry");
    this.#sizes.set(index, next);
    const difference = next - previous;
    this.#addDifference(index, difference);
    return true;
  }

  #addDifference(index: number, difference: number): void {
    for (let cursor = index + 1; cursor <= this.count; cursor += cursor & -cursor) {
      const next = finiteDifference((this.#tree.get(cursor) ?? 0) + difference, "Virtual measured geometry");
      if (next === 0) this.#tree.delete(cursor); else this.#tree.set(cursor, next);
    }
  }

  indexAtOffset(offset: number): number {
    if (this.count === 0) return 0;
    const target = Math.min(Math.max(0, offset), this.totalSize);
    let low = 0;
    let high = this.count;
    while (low < high) {
      const middle = Math.floor((low + high + 1) / 2);
      if (this.startAt(middle) <= target) low = middle; else high = middle - 1;
    }
    return Math.min(this.count - 1, low);
  }

  lowerBound(offset: number): number {
    let low = 0;
    let high = this.count;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (this.startAt(middle) < offset) low = middle + 1; else high = middle;
    }
    return low;
  }
}

export function coalesceNSEVirtualRanges(ranges: readonly IndexRange[]): readonly IndexRange[] {
  const ordered = ranges.filter(({ length }) => length > 0).map(({ start, length }) => ({ start, length })).sort((left, right) => left.start - right.start);
  const coalesced: IndexRange[] = [];
  for (const range of ordered) {
    const previous = coalesced.at(-1);
    if (!previous || range.start > previous.start + previous.length) { coalesced.push(range); continue; }
    const end = Math.max(previous.start + previous.length, range.start + range.length);
    coalesced[coalesced.length - 1] = { start: previous.start, length: end - previous.start };
  }
  return coalesced;
}

export function computeNSEVirtualRangeFromIndex(options: Omit<NSEVirtualRangeOptions, "count" | "estimateSize">, index: NSEVirtualSizeIndex): NSEVirtualRange {
  const viewportStartInput = finiteNonNegative(options.viewportStart, "Virtual viewport start");
  const viewportSize = finiteNonNegative(options.viewportSize, "Virtual viewport size");
  if (!Number.isSafeInteger(options.overscan) || options.overscan < 0) throw new RangeError("Virtual overscan must be a non-negative safe integer.");
  const totalSize = index.totalSize;
  if (index.count === 0) return { visible: { start: 0, length: 0 }, rendered: [], totalSize };
  const viewportStart = Math.min(viewportStartInput, totalSize);
  const viewportEnd = Math.min(finiteDerived(viewportStart + viewportSize, "Virtual viewport geometry"), totalSize);
  const visibleStart = index.indexAtOffset(viewportStart);
  const visibleEnd = Math.min(index.count, Math.max(visibleStart + 1, index.lowerBound(viewportEnd)));
  const renderedStart = Math.max(0, visibleStart - options.overscan);
  const renderedEnd = Math.min(index.count, visibleEnd + options.overscan);
  const ranges: IndexRange[] = [{ start: renderedStart, length: renderedEnd - renderedStart }];
  for (const retained of options.retainedIndices ?? []) if (Number.isSafeInteger(retained) && retained >= 0 && retained < index.count) ranges.push({ start: retained, length: 1 });
  return { visible: { start: visibleStart, length: visibleEnd - visibleStart }, rendered: coalesceNSEVirtualRanges(ranges), totalSize };
}

export function computeNSEVirtualRange(options: NSEVirtualRangeOptions): NSEVirtualRange {
  return computeNSEVirtualRangeFromIndex(options, new NSEVirtualSizeIndex(options.count, options.estimateSize));
}
