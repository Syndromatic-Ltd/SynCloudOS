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

import type {
  NSEStackDistribution,
  NSEStackGravity,
  NSEStackItemLayout,
  NSEStackLayoutInput,
  NSEStackLayoutResult,
  NSEStackResolvedItem,
} from "./stackViewTypes";

const defaultItemSize = 60;
const defaultOverflowTriggerSize = 28;

interface NormalisedStackItem extends Required<Pick<NSEStackItemLayout,
  "id" | "minimumSize" | "preferredSize" | "maximumSize" | "weight" | "visibilityPriority" | "detachedWhenHidden" | "gravity" | "hidden"
>> {
  readonly sourceIndex: number;
  readonly spacingAfter: number | undefined;
}

function nonNegative(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function normaliseItem(item: NSEStackItemLayout, sourceIndex: number): NormalisedStackItem {
  const preferredSize = nonNegative(item.preferredSize, nonNegative(item.minimumSize, defaultItemSize));
  const minimumSize = Math.min(preferredSize, nonNegative(item.minimumSize, Math.min(preferredSize, defaultItemSize)));
  const maximumSize = Math.max(minimumSize, nonNegative(item.maximumSize, Number.POSITIVE_INFINITY));
  return {
    id: item.id,
    sourceIndex,
    minimumSize,
    preferredSize: Math.min(preferredSize, maximumSize),
    maximumSize,
    weight: nonNegative(item.weight, 1),
    visibilityPriority: nonNegative(item.visibilityPriority, 0),
    detachedWhenHidden: item.detachedWhenHidden === true,
    gravity: item.gravity ?? "leading",
    hidden: item.hidden === true,
    spacingAfter: typeof item.spacingAfter === "number" && Number.isFinite(item.spacingAfter)
      ? Math.max(0, item.spacingAfter)
      : undefined,
  };
}

function gapAfter(item: NormalisedStackItem, isLast: boolean, defaultSpacing: number) {
  return isLast ? 0 : item.spacingAfter ?? defaultSpacing;
}

function gapsFor(items: readonly NormalisedStackItem[], defaultSpacing: number) {
  return items.reduce((total, item, index) => total + gapAfter(item, index === items.length - 1, defaultSpacing), 0);
}

function requiredMinimum(items: readonly NormalisedStackItem[], defaultSpacing: number) {
  return items.reduce((total, item) => total + item.minimumSize, 0) + gapsFor(items, defaultSpacing);
}

function fitPreferredSizes(items: readonly NormalisedStackItem[], available: number): number[] {
  const sizes = items.map((item) => Math.min(item.maximumSize, Math.max(item.minimumSize, item.preferredSize)));
  let total = sizes.reduce((sum, size) => sum + size, 0);
  if (total <= available) return sizes;
  let remainingShrink = total - available;
  for (let pass = 0; pass < items.length && remainingShrink > 0.0001; pass += 1) {
    const shrinkable = sizes.map((size, index) => Math.max(0, size - items[index].minimumSize));
    const capacity = shrinkable.reduce((sum, value) => sum + value, 0);
    if (capacity <= 0) break;
    for (let index = 0; index < sizes.length; index += 1) {
      const share = remainingShrink * (shrinkable[index] / capacity);
      const next = Math.max(items[index].minimumSize, sizes[index] - share);
      remainingShrink -= sizes[index] - next;
      sizes[index] = next;
    }
    total = sizes.reduce((sum, size) => sum + size, 0);
    remainingShrink = Math.max(0, total - available);
  }
  return sizes;
}

function allocateWeighted(items: readonly NormalisedStackItem[], available: number, basis: (item: NormalisedStackItem) => number): number[] {
  if (items.length === 0) return [];
  const sizes = Array.from({ length: items.length }, () => 0);
  const unresolved = new Set(items.map((_, index) => index));
  let remaining = Math.max(0, available);

  while (unresolved.size > 0) {
    const indexes = [...unresolved];
    const totalWeight = indexes.reduce((sum, index) => sum + Math.max(0.0001, basis(items[index])), 0);
    let constrained = false;
    for (const index of indexes) {
      const candidate = remaining * (Math.max(0.0001, basis(items[index])) / totalWeight);
      if (candidate < items[index].minimumSize) {
        sizes[index] = items[index].minimumSize;
        remaining -= sizes[index];
        unresolved.delete(index);
        constrained = true;
      } else if (candidate > items[index].maximumSize) {
        sizes[index] = items[index].maximumSize;
        remaining -= sizes[index];
        unresolved.delete(index);
        constrained = true;
      }
    }
    if (constrained) continue;
    for (const index of indexes) {
      sizes[index] = Math.max(0, remaining) * (Math.max(0.0001, basis(items[index])) / totalWeight);
    }
    break;
  }

  return sizes.map((size, index) => Math.max(items[index].minimumSize, Math.min(items[index].maximumSize, size)));
}

function sequentialPositions(items: readonly NormalisedStackItem[], sizes: readonly number[], start: number, spacing: number): number[] {
  const positions: number[] = [];
  let cursor = start;
  for (let index = 0; index < items.length; index += 1) {
    positions.push(cursor);
    cursor += sizes[index] + gapAfter(items[index], index === items.length - 1, spacing);
  }
  return positions;
}

function equalCentredPositions(sizes: readonly number[], start: number, available: number): number[] {
  if (sizes.length <= 1) return sizes.length === 1 ? [start + Math.max(0, (available - sizes[0]) / 2)] : [];
  return sizes.map((size, index) => {
    if (index === 0) return start;
    if (index === sizes.length - 1) return start + Math.max(0, available - size);
    const centre = start + (available * index) / (sizes.length - 1);
    return Math.max(start, Math.min(start + Math.max(0, available - size), centre - size / 2));
  });
}

function gravityPositions(items: readonly NormalisedStackItem[], sizes: readonly number[], start: number, available: number, spacing: number): number[] {
  const positions = Array.from({ length: items.length }, () => start);
  const groups: Record<NSEStackGravity, number[]> = { leading: [], centre: [], trailing: [] };
  for (let index = 0; index < items.length; index += 1) groups[items[index].gravity].push(index);

  let leadingCursor = start;
  for (const index of groups.leading) {
    positions[index] = leadingCursor;
    leadingCursor += sizes[index] + gapAfter(items[index], index === groups.leading.at(-1), spacing);
  }

  let trailingCursor = start + available;
  for (const index of [...groups.trailing].reverse()) {
    trailingCursor -= sizes[index];
    positions[index] = Math.max(start, trailingCursor);
    trailingCursor -= index === groups.trailing[0] ? 0 : spacing;
  }

  const centreSize = groups.centre.reduce((total, index, groupIndex) => total + sizes[index] + (groupIndex === groups.centre.length - 1 ? 0 : spacing), 0);
  let centreCursor = start + Math.max(0, (available - centreSize) / 2);
  for (const index of groups.centre) {
    positions[index] = centreCursor;
    centreCursor += sizes[index] + (index === groups.centre.at(-1) ? 0 : spacing);
  }

  const overlaps = leadingCursor > trailingCursor || groups.centre.some((index) => (
    positions[index] < leadingCursor || positions[index] + sizes[index] > trailingCursor
  ));
  return overlaps ? sequentialPositions(items, sizes, start, spacing) : positions;
}

function sizesAndPositions(
  distribution: NSEStackDistribution,
  items: readonly NormalisedStackItem[],
  available: number,
  start: number,
  spacing: number,
) {
  if (!Number.isFinite(available)) {
    const sizes = items.map((item) => item.preferredSize);
    return { sizes, positions: sequentialPositions(items, sizes, start, spacing) };
  }
  const gaps = gapsFor(items, spacing);
  const itemAvailable = Math.max(0, available - gaps);
  if (items.length === 0) return { sizes: [] as number[], positions: [] as number[] };

  if (distribution === "equal-spacing") {
    const sizes = fitPreferredSizes(items, itemAvailable);
    const used = sizes.reduce((total, size) => total + size, 0);
    const adaptiveSpacing = items.length > 1 ? Math.max(0, (available - used) / (items.length - 1)) : 0;
    return { sizes, positions: sequentialPositions(items, sizes, start, adaptiveSpacing) };
  }

  if (distribution === "equal-centring") {
    const sizes = fitPreferredSizes(items, itemAvailable);
    return { sizes, positions: equalCentredPositions(sizes, start, available) };
  }

  if (distribution === "gravity-areas") {
    const sizes = fitPreferredSizes(items, itemAvailable);
    return { sizes, positions: gravityPositions(items, sizes, start, available, spacing) };
  }

  const sizes = distribution === "fill-proportionally"
    ? allocateWeighted(items, itemAvailable, (item) => item.weight || item.preferredSize)
    : allocateWeighted(items, itemAvailable, distribution === "fill" ? (item) => item.weight : () => 1);
  return { sizes, positions: sequentialPositions(items, sizes, start, spacing) };
}

/**
 * Pure layout decision maker. Source order is preserved in the result even in
 * RTL; the browser's logical flex direction performs visual placement without
 * changing keyboard or screen-reader order.
 */
export function resolveStackLayout(input: NSEStackLayoutInput): NSEStackLayoutResult {
  const orientation = input.orientation;
  const distribution = input.distribution;
  const alignment = input.alignment ?? "fill";
  const direction = input.direction ?? "ltr";
  const spacing = nonNegative(input.spacing, 0);
  const edgeInsets = input.edgeInsets ?? {};
  const startInset = orientation === "horizontal"
    ? nonNegative(edgeInsets.inlineStart, 0)
    : nonNegative(edgeInsets.blockStart, 0);
  const endInset = orientation === "horizontal"
    ? nonNegative(edgeInsets.inlineEnd, 0)
    : nonNegative(edgeInsets.blockEnd, 0);
  const availableSize = Math.max(0, input.availableSize);
  const contentAvailableSize = Math.max(0, availableSize - startInset - endInset);
  const identifiers = new Set<string>();
  const allItems = input.items.map((item, index) => {
    if (!item.id.trim()) throw new TypeError("NSE stack items require a non-empty id.");
    if (identifiers.has(item.id)) throw new TypeError(`NSE stack item ids must be unique: ${item.id}`);
    identifiers.add(item.id);
    return normaliseItem(item, index);
  });
  const visible = allItems.filter((item) => !item.hidden);
  const hiddenIds = new Set(allItems.filter((item) => item.hidden).map(({ id }) => id));
  const overflowPolicy = input.overflowPolicy ?? "menu";

  let active = visible.filter((item) => !hiddenIds.has(item.id));
  const triggerSizeFor = () => hiddenIds.size > 0 && overflowPolicy === "menu"
    ? Math.min(defaultOverflowTriggerSize, contentAvailableSize)
    : 0;
  const triggerSpacingFor = () => triggerSizeFor() > 0 && active.length > 0 ? spacing : 0;

  if (overflowPolicy === "menu" && Number.isFinite(contentAvailableSize)) {
    const candidates = [...visible].sort((left, right) => (
      left.visibilityPriority - right.visibilityPriority || left.sourceIndex - right.sourceIndex
    ));
    while (active.length > 0 && requiredMinimum(active, spacing) + triggerSizeFor() + triggerSpacingFor() > contentAvailableSize) {
      const next = candidates.find((item) => !hiddenIds.has(item.id));
      if (!next) break;
      hiddenIds.add(next.id);
      active = active.filter((item) => item.id !== next.id);
    }
  }

  const laidOut = allItems.filter((item) => !hiddenIds.has(item.id));
  const overflowTriggerSize = triggerSizeFor();
  const overflowTriggerSpacing = overflowTriggerSize > 0 && laidOut.length > 0 ? spacing : 0;
  const overflowTriggerFootprint = overflowTriggerSize + overflowTriggerSpacing;
  const itemAvailableSize = Math.max(0, contentAvailableSize - overflowTriggerFootprint);
  const requiredSize = requiredMinimum(laidOut, spacing) + overflowTriggerFootprint + startInset + endInset;
  const { sizes, positions } = sizesAndPositions(distribution, laidOut, itemAvailableSize, startInset, spacing);
  const resolved = new Map<string, NSEStackResolvedItem>();
  for (let index = 0; index < laidOut.length; index += 1) {
    const item = laidOut[index];
    resolved.set(item.id, {
      id: item.id,
      sourceIndex: item.sourceIndex,
      position: positions[index],
      size: sizes[index],
      hidden: false,
      detached: false,
      gravity: item.gravity,
    });
  }
  for (const item of allItems) {
    if (resolved.has(item.id)) continue;
    resolved.set(item.id, {
      id: item.id,
      sourceIndex: item.sourceIndex,
      position: startInset,
      size: 0,
      hidden: true,
      detached: item.detachedWhenHidden,
      gravity: item.gravity,
    });
  }

  const overflowIds = allItems.filter((item) => hiddenIds.has(item.id)).map(({ id }) => id);
  return Object.freeze({
    orientation,
    distribution,
    alignment,
    direction,
    availableSize,
    contentAvailableSize,
    requiredSize,
    overflowed: overflowIds.length > 0 || requiredSize > availableSize,
    overflowTriggerSize,
    overflowTriggerSpacing,
    overflowTriggerPosition: overflowTriggerSize > 0
      ? startInset + Math.max(0, contentAvailableSize - overflowTriggerSize)
      : null,
    visibleIds: Object.freeze(laidOut.map(({ id }) => id)),
    overflowIds: Object.freeze(overflowIds),
    items: Object.freeze(allItems.map(({ id }) => resolved.get(id)!)),
  });
}
