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
  NSEToolbarItem,
  NSEToolbarLayout,
  NSEToolbarLayoutEntry,
  NSEToolbarLayoutOptions,
  NSEToolbarPresentedItem,
} from "./toolbarTypes";

// Reserve the 10x15 glyph inside a 20px toolbar
// overflow slot. The host theme owns the artwork; this layer owns only the geometry.
const overflowWidth = 20;
const separatorWidth = 2;

function finiteWidth(width: number): number {
  return Number.isFinite(width) && width >= 0 ? width : 0;
}

function commandWidth(
  item: Extract<NSEToolbarItem | NSEToolbarPresentedItem, { readonly kind: "command" }>,
  options: NSEToolbarLayoutOptions,
): number {
  const minimum = finiteWidth(item.minimumWidth ?? 32);
  const ideal = finiteWidth(item.idealWidth ?? minimum);
  if (options.displayMode === "icon-only") return Math.max(28, Math.min(ideal, Math.max(minimum, 32)));
  if (options.displayMode === "label-only") return Math.max(minimum, ideal);
  return Math.max(minimum, ideal);
}

function entryWidth(item: NSEToolbarPresentedItem, options: NSEToolbarLayoutOptions): number {
  if (item.kind === "command") return commandWidth(item, options);
  if (item.kind === "custom") return Math.max(item.minimumWidth, item.idealWidth);
  if (item.kind === "space") return item.width;
  if (item.kind === "flexible-space") return item.minimumWidth;
  return separatorWidth;
}

function isOverflowable(item: NSEToolbarPresentedItem): boolean {
  return item.kind === "command" || item.kind === "custom";
}

function isTrailingStructure(item: NSEToolbarPresentedItem): boolean {
  return item.kind === "space" || item.kind === "flexible-space" || item.kind === "separator";
}

function sum(entries: readonly NSEToolbarLayoutEntry[]): number {
  return entries.reduce((total, entry) => total + entry.allocatedWidth, 0);
}

function freezeEntries(entries: readonly NSEToolbarLayoutEntry[]): readonly NSEToolbarLayoutEntry[] {
  return Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));
}

function makeEntries(items: readonly NSEToolbarPresentedItem[], options: NSEToolbarLayoutOptions): NSEToolbarLayoutEntry[] {
  return items.map((item) => ({
    id: item.id,
    instanceId: item.instanceId,
    kind: item.kind,
    allocatedWidth: entryWidth(item, options),
    item,
  }));
}

function removeTrailingStructure(entries: NSEToolbarLayoutEntry[]): void {
  while (entries.length > 0 && isTrailingStructure(entries[entries.length - 1]!.item)) entries.pop();
}

/**
 * Pure toolbar allocation. The current row is always a prefix of the model;
 * overflow therefore has a stable trailing order in both LTR and RTL. The
 * renderer mirrors the visual flex direction for RTL rather than mutating the
 * command/persistence ordering.
 */
export function allocateNSEToolbarItems(
  items: readonly (NSEToolbarPresentedItem | NSEToolbarItem)[],
  availableWidth: number,
  options: NSEToolbarLayoutOptions,
): NSEToolbarLayout {
  const width = finiteWidth(availableWidth);
  const presented: NSEToolbarPresentedItem[] = items.map((item, index) => toPresented(item, index));
  const candidates = makeEntries(presented, options);
  const idealWidth = sum(candidates);
  let visible = [...candidates];
  const overflow: NSEToolbarLayoutEntry[] = [];
  let clipped = false;

  if (idealWidth > width) {
    let hasOverflowable = false;
    while (visible.length > 0 && sum(visible) + overflowWidth > width) {
      const trailing = visible.pop()!;
      if (isOverflowable(trailing.item)) {
        overflow.unshift(trailing);
        hasOverflowable = true;
      }
      removeTrailingStructure(visible);
    }
    if (!hasOverflowable) {
      // Fixed structural items are not sent to a menu. A truly too-narrow
      // host clips the inert geometry deterministically rather than inventing
      // a replacement interaction layer.
      visible = [];
      clipped = true;
    }
  }

  const overflowRequired = overflow.length > 0;
  if (!overflowRequired && sum(visible) > width) {
    visible = [];
    clipped = true;
  }
  const flexible = visible.filter((entry) => entry.kind === "flexible-space");
  const fixedWidth = sum(visible);
  if (flexible.length > 0 && fixedWidth < width && !overflowRequired) {
    const extra = (width - fixedWidth) / flexible.length;
    visible = visible.map((entry) => entry.kind === "flexible-space"
      ? { ...entry, allocatedWidth: entry.allocatedWidth + extra }
      : entry);
  }

  return Object.freeze({
    direction: options.direction,
    availableWidth: width,
    visibleItemIds: Object.freeze(visible.map((entry) => entry.id)),
    overflowItemIds: Object.freeze(overflow.map((entry) => entry.id)),
    entries: freezeEntries(visible),
    overflowEntries: freezeEntries(overflow),
    overflowRequired,
    clipped: clipped || sum(visible) + (overflowRequired ? overflowWidth : 0) > width,
  });
}

function toPresented(item: NSEToolbarPresentedItem | NSEToolbarItem, index: number): NSEToolbarPresentedItem {
  if ("instanceId" in item) return item;
  const instanceId = `${item.id}:${index}`;
  if (item.kind === "command") return {
    kind: "command",
    id: item.id,
    instanceId,
    commandId: item.commandId,
    payload: item.payload,
    label: item.label,
    bordered: item.bordered !== false,
    paletteLabel: item.paletteLabel,
    icon: item.icon,
    enabled: true,
    hidden: false,
    checked: "off",
    presentation: null,
    minimumWidth: item.minimumWidth,
    idealWidth: item.idealWidth,
  };
  if (item.kind === "custom") return { ...item, instanceId, showsLabel: item.showsLabel === true };
  return { ...item, instanceId };
}
