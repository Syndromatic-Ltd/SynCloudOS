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

import type { NSECollectionLayout, NSECollectionLayoutInput, NSECollectionLayoutItem } from "./collectionTypes";

type Insets = NSECollectionLayout["sectionInset"];

const ZERO_INSETS: Insets = Object.freeze({ blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 });
const MAX_COLLECTION_COUNT = 10_000_000;

function finite(value: number, label: string, positive = false): number {
  if (!Number.isFinite(value) || value < (positive ? Number.EPSILON : 0)) throw new RangeError(`Collection ${label} must be ${positive ? "positive" : "non-negative"} and finite.`);
  return value;
}

function derived(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`Collection ${label} exceeds supported finite geometry.`);
  return value;
}

function sum(left: number, right: number, label: string): number { return derived(left + right, label); }
function product(left: number, right: number, label: string): number { return derived(left * right, label); }

function validateInput(input: NSECollectionLayoutInput): NSECollectionLayoutInput {
  if (!Number.isSafeInteger(input.count) || input.count < 0 || input.count > MAX_COLLECTION_COUNT) throw new RangeError("Collection count must be a supported non-negative safe integer.");
  finite(input.viewportInlineSize, "viewport size");
  return input;
}

function validateInsets(insets: Insets): Insets {
  finite(insets.blockStart, "section inset"); finite(insets.inlineEnd, "section inset");
  finite(insets.blockEnd, "section inset"); finite(insets.inlineStart, "section inset");
  return insets;
}

export function collectionColumnCount(
  viewportInlineSize: number,
  itemInlineSize: number,
  gap: number,
  insets: Insets = ZERO_INSETS,
): number {
  finite(viewportInlineSize, "viewport size"); finite(itemInlineSize, "item size", true); finite(gap, "gap"); validateInsets(insets);
  const inlineInsets = sum(insets.inlineStart, insets.inlineEnd, "inline inset geometry");
  const available = derived(Math.max(0, viewportInlineSize - inlineInsets), "available inline geometry");
  const numerator = sum(available, gap, "column numerator geometry");
  const denominator = sum(Math.max(1, itemInlineSize), gap, "column stride geometry");
  const result = Math.max(1, Math.floor(numerator / denominator));
  if (!Number.isSafeInteger(result)) throw new RangeError("Collection column count exceeds the supported safe geometry.");
  return Math.min(MAX_COLLECTION_COUNT, result);
}

export function calculateCollectionLayout(
  input: NSECollectionLayoutInput,
  itemSize: NSECollectionLayout["itemSize"],
  gap: number,
  insets: Insets,
  fixedColumns?: number,
): readonly NSECollectionLayoutItem[] {
  validateInput(input);
  finite(itemSize.inline, "item size", true); finite(itemSize.block, "item size", true); finite(gap, "gap"); validateInsets(insets);
  if (fixedColumns !== undefined && (!Number.isSafeInteger(fixedColumns) || fixedColumns <= 0)) throw new RangeError("Collection column count must be a positive safe integer.");
  const columns = fixedColumns ?? collectionColumnCount(input.viewportInlineSize, itemSize.inline, gap, insets);
  const inlineStride = sum(itemSize.inline, gap, "inline stride geometry");
  const blockStride = sum(itemSize.block, gap, "block stride geometry");
  if (input.count > 0) {
    const lastIndex = input.count - 1;
    const lastRow = Math.floor(lastIndex / columns); const lastColumn = lastIndex % columns;
    sum(insets.inlineStart, product(lastColumn, inlineStride, "inline offset geometry"), "inline offset geometry");
    sum(insets.blockStart, product(lastRow, blockStride, "block offset geometry"), "block offset geometry");
  }
  return Object.freeze(Array.from({ length: Math.max(0, input.count) }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    return Object.freeze({
      index,
      row,
      column,
      inlineStart: sum(insets.inlineStart, product(column, inlineStride, "inline offset geometry"), "inline offset geometry"),
      blockStart: sum(insets.blockStart, product(row, blockStride, "block offset geometry"), "block offset geometry"),
      inlineSize: itemSize.inline,
      blockSize: itemSize.block,
    });
  }));
}

export function createAdaptiveCollectionLayout(options: {
  readonly itemSize: { readonly inline: number; readonly block: number };
  readonly minimumGap?: number;
  readonly sectionInset?: Partial<Insets>;
}): NSECollectionLayout {
  const gap = finite(options.minimumGap ?? 0, "gap");
  const itemSize = Object.freeze({ inline: finite(options.itemSize.inline, "item size", true), block: finite(options.itemSize.block, "item size", true) });
  const sectionInset = Object.freeze({ ...ZERO_INSETS, ...options.sectionInset });
  validateInsets(sectionInset);
  const inlineStride = sum(itemSize.inline, gap, "inline stride geometry");
  const blockStride = sum(itemSize.block, gap, "block stride geometry");
  const columnsFor = (input: NSECollectionLayoutInput) => collectionColumnCount(validateInput(input).viewportInlineSize, itemSize.inline, gap, sectionInset);
  const itemAt = (index: number, input: NSECollectionLayoutInput): NSECollectionLayoutItem | null => {
    validateInput(input);
    if (!Number.isSafeInteger(index) || index < 0 || index >= input.count) return null;
    const columns = columnsFor(input);
    const row = Math.floor(index / columns); const column = index % columns;
    return Object.freeze({ index, row, column, inlineStart: sum(sectionInset.inlineStart, product(column, inlineStride, "inline offset geometry"), "inline offset geometry"), blockStart: sum(sectionInset.blockStart, product(row, blockStride, "block offset geometry"), "block offset geometry"), inlineSize: itemSize.inline, blockSize: itemSize.block });
  };
  return Object.freeze({
    direction: "vertical" as const,
    itemSize,
    minimumGap: gap,
    sectionInset,
    items(input: NSECollectionLayoutInput) {
      return calculateCollectionLayout(validateInput(input), itemSize, gap, sectionInset, columnsFor(input));
    },
    itemAt,
    columnCount: columnsFor,
    rowCount(input: NSECollectionLayoutInput) { return Math.ceil(validateInput(input).count / columnsFor(input)); },
    indexInDirection(fromIndex: number, direction: "up" | "down" | "left" | "right", input: NSECollectionLayoutInput) {
      validateInput(input);
      const derivedColumns = columnsFor(input);
      const derivedCount = input.count;
      const candidate = direction === "up" ? fromIndex - derivedColumns
        : direction === "down" ? fromIndex + derivedColumns
          : direction === "left" ? fromIndex - 1
            : fromIndex + 1;
      if (candidate < 0 || candidate >= derivedCount) return null;
      if (direction === "left" && fromIndex % derivedColumns === 0) return null;
      if (direction === "right" && fromIndex % derivedColumns === derivedColumns - 1) return null;
      return candidate;
    },
  });
}

export function createListCollectionLayout(blockSize = 44, gap = 0): NSECollectionLayout {
  const layout = createAdaptiveCollectionLayout({ itemSize: { inline: 1, block: blockSize }, minimumGap: gap });
  const blockStride = sum(blockSize, gap, "block stride geometry");
  return Object.freeze({
    ...layout,
    items(input: NSECollectionLayoutInput) {
      return calculateCollectionLayout(input, { inline: Math.max(1, input.viewportInlineSize), block: blockSize }, gap, ZERO_INSETS, 1);
    },
    itemAt(index: number, input: NSECollectionLayoutInput) {
      validateInput(input); if (!Number.isSafeInteger(index) || index < 0 || index >= input.count) return null;
      return Object.freeze({ index, row: index, column: 0, inlineStart: 0, blockStart: product(index, blockStride, "block offset geometry"), inlineSize: input.viewportInlineSize, blockSize });
    },
    columnCount(input: NSECollectionLayoutInput) { validateInput(input); return 1; },
    rowCount(input: NSECollectionLayoutInput) { return validateInput(input).count; },
    indexInDirection(fromIndex: number, direction: "up" | "down" | "left" | "right", input: NSECollectionLayoutInput) {
      if (direction === "left" || direction === "right") return null;
      const candidate = fromIndex + (direction === "up" ? -1 : 1);
      return candidate >= 0 && candidate < validateInput(input).count ? candidate : null;
    },
  });
}
