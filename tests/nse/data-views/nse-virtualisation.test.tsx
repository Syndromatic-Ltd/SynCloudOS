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
import React, { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NSEVirtualViewport,
  computeNSEVirtualRange,
  useNSEVirtualiser,
} from "../../../src/NSE/DataViews/Virtualisation";
import { NSEVirtualSizeIndex } from "../../../src/NSE/DataViews/Virtualisation/computeVirtualRange";

afterEach(cleanup);

function VirtualGridFixture({ rows, columns, estimate = 23 }: { rows: number; columns: number; estimate?: number | ((index: number) => number) }) {
  const [active, setActive] = useState({ row: 0, column: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const virtualiser = useNSEVirtualiser({
    count: rows,
    axis: "block",
    overscan: 2,
    estimateSize: estimate,
    getKey: (index) => `row-${index}`,
    retainedIndices: new Set([active.row]),
    viewportRef,
    viewportSize: 230,
  });

  return (
    <NSEVirtualViewport
      aria-label="Virtual grid"
      role="grid"
      virtualiser={virtualiser}
      ref={viewportRef}
      viewportSize={230}
      activeDescendantId={`cell-${active.row}-${active.column}`}
      onKeyDown={(event) => {
        if (event.key === "End" && event.ctrlKey) {
          setActive({ row: rows - 1, column: columns - 1 });
          virtualiser.scrollToIndex(rows - 1, "end");
        }
      }}
      renderItem={({ index }) => (
        <div role="row" id={`row-${index}`}>
          {Array.from({ length: columns }, (_, column) => (
            <div
              key={column}
              id={`cell-${index}-${column}`}
              role="gridcell"
              data-active={index === active.row && column === active.column || undefined}
            >
              {index}:{column}
            </div>
          ))}
        </div>
      )}
    />
  );
}

describe("data-view virtualisation", () => {
  it("keeps the active descendant mounted outside the overscan range", () => {
    expect(computeNSEVirtualRange({
      count: 10_000,
      viewportStart: 2_000,
      viewportSize: 230,
      estimateSize: 23,
      overscan: 2,
      retainedIndices: new Set([4]),
    })).toEqual({
      visible: { start: 86, length: 11 },
      rendered: [{ start: 4, length: 1 }, { start: 84, length: 15 }],
      totalSize: 230_000,
    });
  });

  it("coalesces adjacent retained and overscan ranges", () => {
    expect(computeNSEVirtualRange({
      count: 100,
      viewportStart: 230,
      viewportSize: 46,
      estimateSize: 23,
      overscan: 1,
      retainedIndices: new Set([8, 9, 13]),
    }).rendered).toEqual([
      { start: 8, length: 6 },
    ]);
  });

  it("scrolls a grid cell into view without changing selection", () => {
    render(<VirtualGridFixture rows={1_000} columns={20} />);
    const grid = screen.getByRole("grid");

    fireEvent.keyDown(grid, { key: "End", ctrlKey: true });

    expect(grid.getAttribute("aria-activedescendant")).toBe("cell-999-19");
    expect(document.getElementById("cell-999-19")).not.toBeNull();
    expect(grid.querySelectorAll(".nse-virtual-item").length).toBeLessThan(20);
    expect(grid.querySelectorAll("[aria-selected=true]")).toHaveLength(0);
    expect(grid.scrollTop).toBeGreaterThan(22_000);
    expect(document.getElementById("cell-999-19")!.closest(".nse-virtual-item")?.getAttribute("data-index")).toBe("999");
  });

  it("changes the visible records after a native scroll and does not duplicate estimate work", () => {
    render(<VirtualGridFixture rows={1_000} columns={1} estimate={23} />);
    const grid = screen.getByRole("grid");
    Object.defineProperty(grid, "clientHeight", { configurable: true, value: 230 });
    grid.scrollTop = 2_300;
    fireEvent.scroll(grid);
    expect(screen.getByText("100:0")).not.toBeNull();
    expect(screen.getByText("0:0").closest(".nse-virtual-item")?.getAttribute("data-index")).toBe("0");
    expect(grid.querySelectorAll(".nse-virtual-item").length).toBeLessThan(20);
  });

  it("invalidates constant-count sizing when the semantic estimator changes", () => {
    function Fixture({ size }: { size: number }) {
      const virtualiser = useNSEVirtualiser({ count: 100, axis: "block", overscan: 1, estimateSize: size, getKey: String, viewportSize: 100, sizingGeneration: size });
      return <output data-testid="total">{virtualiser.snapshot.range.totalSize}</output>;
    }
    const view = render(<Fixture size={10} />);
    expect(screen.getByTestId("total").textContent).toBe("1000");
    view.rerender(<Fixture size={20} />);
    expect(screen.getByTestId("total").textContent).toBe("2000");
  });

  it("preserves heterogeneous per-index estimates before any item is measured", () => {
    const estimate = vi.fn((index: number) => [10, 100, 10][index]!);
    const range = computeNSEVirtualRange({ count: 3, viewportStart: 50, viewportSize: 10, estimateSize: estimate, overscan: 0 });
    expect(range.totalSize).toBe(120);
    expect(range.visible).toEqual({ start: 1, length: 1 });
    expect(estimate).toHaveBeenCalledWith(1);
    expect(estimate).toHaveBeenCalledWith(2);
  });

  it("remeasures mounted items after intrinsic resize and disconnects observers", () => {
    const callbacks: ResizeObserverCallback[] = [];
    const disconnect = vi.fn();
    const removeListener = vi.spyOn(HTMLElement.prototype, "removeEventListener");
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) { callbacks.push(callback); }
      observe() {}
      disconnect() { disconnect(); }
      unobserve() {}
    });
    const view = render(<VirtualGridFixture rows={20} columns={1} />);
    const first = document.querySelector<HTMLElement>('.nse-virtual-item[data-index="0"]')!;
    const second = document.querySelector<HTMLElement>('.nse-virtual-item[data-index="1"]')!;
    expect(second.style.insetBlockStart).toBe("23px");
    Object.defineProperty(first, "offsetHeight", { configurable: true, value: 46 });
    act(() => { for (const callback of callbacks) callback([], {} as ResizeObserver); });
    expect(document.querySelector<HTMLElement>('.nse-virtual-item[data-index="1"]')!.style.insetBlockStart).toBe("46px");
    view.unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(removeListener.mock.calls.some(([type]) => type === "scroll")).toBe(true);
    removeListener.mockRestore();
    vi.unstubAllGlobals();
  });

  it.each([
    { count: Number.NaN }, { count: Number.POSITIVE_INFINITY }, { count: -1 }, { count: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects an invalid count $count", ({ count }) => {
    expect(() => computeNSEVirtualRange({ count, viewportStart: 0, viewportSize: 10, estimateSize: () => 1, overscan: 0 })).toThrow(/count/i);
  });

  it("rejects invalid viewport, overscan and item sizes", () => {
    expect(() => computeNSEVirtualRange({ count: 1, viewportStart: Number.NaN, viewportSize: 10, estimateSize: () => 1, overscan: 0 })).toThrow(/viewport/i);
    expect(() => computeNSEVirtualRange({ count: 1, viewportStart: 0, viewportSize: -1, estimateSize: () => 1, overscan: 0 })).toThrow(/viewport/i);
    expect(() => computeNSEVirtualRange({ count: 1, viewportStart: 0, viewportSize: 10, estimateSize: () => Number.POSITIVE_INFINITY, overscan: 0 })).toThrow(/size/i);
    expect(() => computeNSEVirtualRange({ count: 1, viewportStart: 0, viewportSize: 10, estimateSize: () => 1, overscan: -1 })).toThrow(/overscan/i);
  });

  it("rejects finite inputs whose derived total geometry overflows", () => {
    expect(() => new NSEVirtualSizeIndex(2, Number.MAX_VALUE)).toThrow(/total|geometry|overflow/i);
    expect(() => new NSEVirtualSizeIndex(2, () => Number.MAX_VALUE)).toThrow(/total|geometry|overflow/i);
    expect(() => computeNSEVirtualRange({ count: 2, viewportStart: 0, viewportSize: 10, estimateSize: Number.MAX_VALUE, overscan: 0 })).toThrow(/total|geometry|overflow/i);
    expect(new NSEVirtualSizeIndex(2, (index) => index === 0 ? Number.MAX_VALUE : 1).totalSize).toBe(Number.MAX_VALUE);
  });

  it("reports busy state and a stable live status", () => {
    render(
      <NSEVirtualViewport
        aria-label="Rows"
        busy
        status="Loading rows"
        virtualiser={{
          snapshot: {
            axis: "block",
            range: {
              visible: { start: 0, length: 1 },
              rendered: [{ start: 0, length: 1 }],
              totalSize: 23,
            },
            items: [{ index: 0, key: "row-0", start: 0, size: 23, end: 23 }],
          },
          measure() {},
          scrollToIndex() {},
        }}
        renderItem={({ index }) => <span>Row {index}</span>}
      />,
    );

    expect(screen.getByRole("list").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("Loading rows");
  });
});
