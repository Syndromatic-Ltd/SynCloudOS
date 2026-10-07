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

// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React, { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NSEArrayController } from "../../../src/NSE/Controllers";
import type { NSEDataViewAdapter } from "../../../src/NSE/DataViews/Core";
import {
  calculateCollectionLayout,
  collectionColumnCount,
  NSECollectionView,
  createAdaptiveCollectionLayout,
  createListCollectionLayout,
  type NSECollectionViewItemProps,
} from "../../../src/NSE/DataViews/Collection";

interface Card { readonly id: string; readonly label: string }

const cards: readonly Card[] = [
  { id: "one", label: "One" },
  { id: "two", label: "Two" },
  { id: "three", label: "Three" },
  { id: "four", label: "Four" },
  { id: "five", label: "Five" },
];

function source(content: readonly Card[] = cards) {
  const controller = new NSEArrayController<Card, string>({
    id: `cards-${content.length}`,
    content,
    getId: (item) => item.id,
    selection: { mode: "multiple", allowsEmpty: true, preservesSelection: true },
  });
  const adapter: NSEDataViewAdapter<Card, string> = {
    controller,
    idForItem: (item) => item.id,
    labelForItem: (item) => item.label,
  };
  return { controller, adapter };
}

const renderItem = ({ item, selected, focused, editing }: NSECollectionViewItemProps<Card, string>) => (
  <span>{item.label}:{String(selected)}:{String(focused)}:{String(editing)}</span>
);

afterEach(cleanup);

describe("collection layouts", () => {
  it("computes deterministic adaptive grid positions and visual navigation", () => {
    const layout = createAdaptiveCollectionLayout({ itemSize: { inline: 100, block: 80 }, minimumGap: 10 });
    const items = layout.items({ count: 5, viewportInlineSize: 330 });
    expect(items.map(({ index, row, column, inlineStart, blockStart }) => ({ index, row, column, inlineStart, blockStart }))).toEqual([
      { index: 0, row: 0, column: 0, inlineStart: 0, blockStart: 0 },
      { index: 1, row: 0, column: 1, inlineStart: 110, blockStart: 0 },
      { index: 2, row: 0, column: 2, inlineStart: 220, blockStart: 0 },
      { index: 3, row: 1, column: 0, inlineStart: 0, blockStart: 90 },
      { index: 4, row: 1, column: 1, inlineStart: 110, blockStart: 90 },
    ]);
    expect(layout.indexInDirection(1, "down", { count: 5, viewportInlineSize: 330 })).toBe(4);
    expect(layout.indexInDirection(4, "right", { count: 5, viewportInlineSize: 330 })).toBeNull();
  });

  it("keeps navigation derivation isolated between consumers sharing a layout", () => {
    const layout = createAdaptiveCollectionLayout({ itemSize: { inline: 100, block: 80 }, minimumGap: 10 });
    layout.items({ count: 5, viewportInlineSize: 330 });
    layout.items({ count: 2, viewportInlineSize: 100 });
    expect(layout.indexInDirection(1, "down", { count: 5, viewportInlineSize: 330 })).toBe(4);
  });
});

describe("NSECollectionView", () => {
  it("exposes the public viewport and canvas attachment points", () => {
    const { adapter } = source();
    const viewportRef = createRef<HTMLDivElement>();
    const canvasRef = createRef<HTMLDivElement>();
    render(<NSECollectionView aria-label="Cards" adapter={adapter} layout={createListCollectionLayout(40)} viewportRef={viewportRef} canvasRef={canvasRef} renderItem={renderItem} />);
    expect(viewportRef.current).toBe(screen.getByRole("grid", { name: "Cards" }));
    expect(canvasRef.current?.classList.contains("nse-collection-canvas")).toBe(true);
    expect(canvasRef.current?.parentElement?.classList.contains("nse-collection-canvas-sizer")).toBe(true);
  });

  it("renders list/grid semantics and recomputes adaptive columns from injected width", () => {
    const { adapter } = source();
    const layout = createAdaptiveCollectionLayout({ itemSize: { inline: 100, block: 80 }, minimumGap: 10 });
    const { rerender } = render(<NSECollectionView aria-label="Cards" adapter={adapter} layout={layout} viewportInlineSize={330} renderItem={renderItem} />);
    expect(screen.getByRole("grid", { name: "Cards" }).getAttribute("aria-colcount")).toBe("3");
    rerender(<NSECollectionView aria-label="Cards" adapter={adapter} layout={layout} viewportInlineSize={210} renderItem={renderItem} />);
    expect(screen.getByRole("grid", { name: "Cards" }).getAttribute("aria-colcount")).toBe("2");
  });

  it("keeps keyboard focus independent from selection and moves by visual row", () => {
    const { adapter, controller } = source();
    const layout = createAdaptiveCollectionLayout({ itemSize: { inline: 100, block: 80 }, minimumGap: 10 });
    render(<NSECollectionView aria-label="Cards" adapter={adapter} layout={layout} viewportInlineSize={330} renderItem={renderItem} />);
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    expect(screen.getByRole("gridcell", { name: /^Four:/ }).getAttribute("data-focused")).toBe("true");
    expect(controller.getSnapshot().selection.selectedIds.size).toBe(0);
    fireEvent.keyDown(grid, { key: " " });
    expect(controller.getSnapshot().selection.selectedIds).toEqual(new Set(["four"]));
  });

  it("restores the controller's selected focus when the view remounts", () => {
    const { adapter } = source();
    const props = { "aria-label": "Cards", adapter, layout: createListCollectionLayout(40), pointerActivation: "single-click" as const, renderItem };
    const mounted = render(<NSECollectionView {...props} />);
    fireEvent.click(screen.getByRole("gridcell", { name: /^Three:/ }));
    mounted.unmount();
    render(<NSECollectionView {...props} />);
    expect(screen.getByRole("gridcell", { name: /^Three:/ }).getAttribute("data-focused")).toBe("true");
  });

  it("uses logical horizontal navigation in RTL", () => {
    const { adapter } = source();
    render(<NSECollectionView aria-label="Cards" adapter={adapter} layout={createAdaptiveCollectionLayout({ itemSize: { inline: 100, block: 80 }, minimumGap: 10 })} viewportInlineSize={330} dir="rtl" renderItem={renderItem} />);
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "ArrowLeft" });
    expect(screen.getByRole("gridcell", { name: /^Two:/ }).getAttribute("data-focused")).toBe("true");
  });

  it("inherits logical RTL navigation from its containing locale", () => {
    const { adapter } = source();
    render(<div dir="rtl"><NSECollectionView aria-label="Cards" adapter={adapter} layout={createAdaptiveCollectionLayout({ itemSize: { inline: 100, block: 80 }, minimumGap: 10 })} viewportInlineSize={330} renderItem={renderItem} /></div>);
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "ArrowLeft" });
    expect(screen.getByRole("gridcell", { name: /^Two:/ }).getAttribute("data-focused")).toBe("true");
  });

  it("supports pointer toggle/range selection and activation", () => {
    const { adapter, controller } = source();
    const activate = vi.fn();
    render(<NSECollectionView aria-label="Cards" adapter={adapter} layout={createListCollectionLayout(40)} renderItem={renderItem} onActivate={activate} />);
    fireEvent.click(screen.getByRole("gridcell", { name: /^One:/ }));
    fireEvent.click(screen.getByRole("gridcell", { name: /^Three:/ }), { shiftKey: true });
    expect(controller.getSnapshot().selection.selectedIds).toEqual(new Set(["one", "two", "three"]));
    fireEvent.doubleClick(screen.getByRole("gridcell", { name: /^Two:/ }));
    expect(activate).toHaveBeenCalledWith("two", cards[1]);
  });

  it("preserves surviving stable selection and updates represented objects after content replacement", () => {
    const { adapter, controller } = source();
    render(<NSECollectionView aria-label="Cards" adapter={adapter} layout={createListCollectionLayout(40)} renderItem={renderItem} />);
    fireEvent.click(screen.getByRole("gridcell", { name: /^Two:/ }));
    act(() => controller.setContent([{ id: "two", label: "Two updated" }, { id: "six", label: "Six" }]));
    expect(controller.getSnapshot().selection.selectedIds).toEqual(new Set(["two"]));
    expect(screen.getByRole("gridcell", { name: /^Two updated:/ }).getAttribute("data-selected")).toBe("true");
    expect(screen.queryByRole("gridcell", { name: /^One:/ })).toBeNull();
  });

  it("exposes app-owned editing state and cancels it when content changes", () => {
    const { adapter, controller } = source();
    render(<NSECollectionView aria-label="Cards" adapter={adapter} layout={createListCollectionLayout(40)} renderItem={renderItem} editableLabels />);
    fireEvent.keyDown(screen.getByRole("grid"), { key: "F2" });
    expect(screen.getByRole("gridcell", { name: /^One:/ }).textContent).toBe("One:false:true:true");
    act(() => controller.setContent(cards.slice(1)));
    expect(screen.queryByText(/true:true$/)).toBeNull();
  });

  it("requests stable-ID keyboard reordering", () => {
    const { adapter } = source();
    const reorder = vi.fn();
    render(<NSECollectionView aria-label="Cards" adapter={adapter} layout={createListCollectionLayout(40)} renderItem={renderItem} onRequestReorder={reorder} />);
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: " " });
    fireEvent.keyDown(grid, { key: "ArrowDown", altKey: true });
    expect(reorder).toHaveBeenCalledWith(["one"], 2);
  });

  it.each(["read-only", "disabled", "denied", "invalid"] as const)("blocks reordering while %s", (kind) => {
    const { adapter } = source();
    const reorder = vi.fn();
    render(<NSECollectionView aria-label="Cards" adapter={adapter} layout={createListCollectionLayout(40)} renderItem={renderItem} state={{ kind, message: kind }} onRequestReorder={reorder} />);
    fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowDown", altKey: true });
    expect(reorder).not.toHaveBeenCalled();
  });

  it("rejects non-finite layout geometry", () => {
    expect(() => createAdaptiveCollectionLayout({ itemSize: { inline: Number.NaN, block: 40 } })).toThrow(/size/i);
    const layout = createAdaptiveCollectionLayout({ itemSize: { inline: 100, block: 40 } });
    expect(() => layout.items({ count: Number.POSITIVE_INFINITY, viewportInlineSize: 300 })).toThrow(/count/i);
    expect(() => layout.items({ count: 2, viewportInlineSize: Number.NaN })).toThrow(/viewport/i);
    expect(() => collectionColumnCount(300, 100, 10, { blockStart: 0, inlineEnd: Number.POSITIVE_INFINITY, blockEnd: 0, inlineStart: 0 })).toThrow(/inset/i);
    expect(() => calculateCollectionLayout({ count: 2, viewportInlineSize: 300 }, { inline: 100, block: Number.NaN }, 10, { blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 })).toThrow(/size/i);
    expect(() => calculateCollectionLayout({ count: 2, viewportInlineSize: 300 }, { inline: 100, block: 40 }, 10, { blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 }, 0)).toThrow(/column/i);
  });

  it("rejects finite inputs when derived collection geometry is non-finite", () => {
    const zero = { blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 } as const;
    expect(() => collectionColumnCount(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE, zero)).toThrow(/geometry|overflow|finite/i);
    expect(() => calculateCollectionLayout({ count: 2, viewportInlineSize: Number.MAX_VALUE }, { inline: 1, block: Number.MAX_VALUE }, Number.MAX_VALUE, zero, 1)).toThrow(/geometry|overflow|finite/i);
    expect(() => createAdaptiveCollectionLayout({ itemSize: { inline: Number.MAX_VALUE, block: Number.MAX_VALUE }, minimumGap: Number.MAX_VALUE })).toThrow(/geometry|overflow|finite/i);
    expect(() => createListCollectionLayout(Number.MAX_VALUE, Number.MAX_VALUE)).toThrow(/geometry|overflow|finite/i);
    const layout = createAdaptiveCollectionLayout({ itemSize: { inline: Number.MAX_VALUE / 2, block: Number.MAX_VALUE / 2 }, minimumGap: Number.MAX_VALUE / 2 });
    expect(() => layout.itemAt(1, { count: 2, viewportInlineSize: Number.MAX_VALUE })).toThrow(/geometry|overflow|finite/i);
  });

  it("does not navigate or reorder while IME composition owns keyboard input", () => {
    const { adapter } = source();
    const reorder = vi.fn();
    render(<NSECollectionView aria-label="Cards" adapter={adapter} layout={createListCollectionLayout(40)} renderItem={renderItem} onRequestReorder={reorder} />);
    const grid = screen.getByRole("grid");
    const before = grid.getAttribute("aria-activedescendant");
    fireEvent.keyDown(grid, { key: "ArrowDown", altKey: true, isComposing: true, keyCode: 229 });
    expect(grid.getAttribute("aria-activedescendant")).toBe(before);
    expect(reorder).not.toHaveBeenCalled();
  });

  it("renders bounded rows for 5,000 items and retains the active descendant", () => {
    const many = Array.from({ length: 5_000 }, (_, index) => ({ id: `card-${index}`, label: `Card ${index}` }));
    const { adapter } = source(many);
    render(<NSECollectionView aria-label="Cards" adapter={adapter} layout={createAdaptiveCollectionLayout({ itemSize: { inline: 100, block: 80 }, minimumGap: 10 })} viewportInlineSize={440} viewportBlockSize={320} renderItem={renderItem} />);
    expect(screen.getByRole("grid").getAttribute("aria-rowcount")).toBe("1250");
    expect(screen.getAllByRole("gridcell").length).toBeLessThan(80);
    const active = screen.getByRole("grid").getAttribute("aria-activedescendant");
    expect(active).not.toBeNull();
    expect(document.getElementById(active!)).not.toBeNull();
  });

  it("announces empty and loading states without fabricated items", () => {
    const { adapter } = source([]);
    const { rerender } = render(<NSECollectionView aria-label="Cards" adapter={adapter} layout={createListCollectionLayout(40)} renderItem={renderItem} state={{ kind: "empty", message: "No cards" }} />);
    expect(screen.getByText("No cards")).not.toBeNull();
    rerender(<NSECollectionView aria-label="Cards" adapter={adapter} layout={createListCollectionLayout(40)} renderItem={renderItem} state={{ kind: "loading", message: "Loading cards" }} />);
    expect(screen.getByRole("grid").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Loading cards")).not.toBeNull();
  });
});
