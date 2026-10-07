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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NSEArrayController } from "../../../src/NSE/Controllers";
import type { Formatter } from "../../../src/SynCloudOS/Models";
import {
  NSETable,
  columnAtNSETablePoint,
  rowAtNSETablePoint,
  type NSETableColumn,
  type NSETableProps,
} from "../../../src/NSE/DataViews/Table";
import { NSEAppearanceProvider, type NSEAppearanceDefinition } from "../../../src/NSE/Appearance";
import type { NSEDataViewAdapter } from "../../../src/NSE/DataViews/Core";

interface Person {
  readonly id: string;
  readonly name: string;
  readonly age: number;
}

const people: readonly Person[] = [
  { id: "ada", name: "Ada", age: 36 },
  { id: "grace", name: "Grace", age: 85 },
  { id: "alan", name: "Alan", age: 41 },
];

const nameFormatter: Formatter<unknown> = {
  format: (value) => String(value),
  editingText: (value) => String(value),
  parse: (text) => text.trim()
    ? { ok: true, value: text.trim() }
    : { ok: false, error: { code: "required", message: "Name is required", input: text } },
  validatePartial: (text) => text.trim()
    ? { valid: true }
    : { valid: false, error: { code: "required", message: "Name is required", input: text } },
};

const columns: readonly NSETableColumn<Person, string, unknown>[] = [
  {
    id: "name",
    title: "Name",
    value: (person) => person.name,
    width: { min: 120, ideal: 220, max: 480 },
    editable: true,
    format: nameFormatter,
    sort: { compare: (left, right) => String(left).localeCompare(String(right)) },
  },
  {
    id: "age",
    title: "Age",
    value: (person) => person.age,
    width: { min: 64, ideal: 80, max: 120 },
    sort: { compare: (left, right) => Number(left) - Number(right) },
  },
];

function createAdapter(content: readonly Person[] = people) {
  const controller = new NSEArrayController<Person, string>({
    id: `people-${content.length}`,
    content,
    getId: (person) => person.id,
    selection: { mode: "multiple", allowsEmpty: true },
  });
  const adapter: NSEDataViewAdapter<Person, string> = {
    controller,
    idForItem: (person) => person.id,
    labelForItem: (person) => person.name,
  };
  return { adapter, controller };
}

function renderTable(overrides: Partial<NSETableProps<Person, string>> = {}, appearance?: NSEAppearanceDefinition) {
  const source = createAdapter();
  const result = render(
    <NSETable<Person, string>
      aria-label="People"
      adapter={source.adapter}
      columns={columns}
      viewportBlockSize={230}
      {...overrides}
    />,
    { wrapper: appearance ? ({ children }) => <NSEAppearanceProvider appearance={appearance}>{children}</NSEAppearanceProvider> : undefined },
  );
  return { ...source, ...result };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NSETable", () => {
  it("keeps canonical appearance loading outside NSETable's public caller contract", () => {
    const typesSource = readFileSync(resolve(process.cwd(), "src/NSE/DataViews/Table/tableTypes.ts"), "utf8");
    const barrelSource = readFileSync(resolve(process.cwd(), "src/NSE/DataViews/Table/index.ts"), "utf8");
    const tableSource = readFileSync(resolve(process.cwd(), "src/NSE/DataViews/Table/NSETable.tsx"), "utf8");

    expect(typesSource).not.toMatch(/\bNSETableAppearanceLoader\b/);
    expect(typesSource).not.toMatch(/\bappearanceLoader\s*\??:/);
    expect(barrelSource).not.toMatch(/\bNSETableAppearanceLoader\b/);
    expect(tableSource).toContain('useNSEAppearanceSlot("table.header.normal.1x")');
    expect(tableSource).toContain('useNSEAppearanceSlot("table.header.hover.1x")');
    expect(tableSource).toContain('useNSEAppearanceSlot("table.header.pressed.1x")');
    expect(tableSource).toContain('useNSEAppearanceSlot("table.header.hover-pressed.1x")');
    expect(tableSource).toContain('useNSEAppearanceSlot("table.sort-glyph.ascending.1x")');
    expect(tableSource).toContain('useNSEAppearanceSlot("table.sort-glyph.descending.1x")');
    expect(tableSource).not.toContain("Promise.resolve().then(appearanceLoader)");
  });

  it("leaves unselected theme recipes unresolved while preserving the usable grid", async () => {
    renderTable();
    const grid = screen.getByRole("grid", { name: "People" });
    expect(grid.getAttribute("data-nse-appearance-slot")).toBe("table.header.normal.1x");
    expect(grid.getAttribute("data-nse-appearance-recipe-id")).toBeNull();
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Sort by Name" }));
    await waitFor(() => expect(screen.getByRole("columnheader", { name: /Name/ }).getAttribute("aria-sort")).toBe("ascending"));
  });

  it("does not move the active cell while IME composition owns wrapper shortcuts", () => {
    const { adapter } = createAdapter();
    render(<NSETable aria-label="People" adapter={adapter} columns={columns} />);
    const grid = screen.getByRole("grid");
    const before = grid.getAttribute("aria-activedescendant");
    fireEvent.keyDown(grid, { key: "End", ctrlKey: true, isComposing: true, keyCode: 229 });
    expect(grid.getAttribute("aria-activedescendant")).toBe(before);
  });
  it("renders stable semantic columns and bounds a 10,000-row data set", () => {
    const content = Array.from({ length: 10_000 }, (_, index) => ({ id: `person-${index}`, name: `Person ${index}`, age: index }));
    const { adapter } = createAdapter(content);
    render(<NSETable aria-label="People" adapter={adapter} columns={columns} viewportBlockSize={230} />);

    const grid = screen.getByRole("grid", { name: "People" });
    expect(grid.getAttribute("aria-rowcount")).toBe("10001");
    expect(grid.getAttribute("aria-colcount")).toBe("2");
    expect(screen.getAllByRole("row").length).toBeLessThan(80);
    expect(screen.getAllByRole("gridcell").length).toBeLessThan(120);
  });

  it("supports pointer, toggle, range and independent active-cell navigation", () => {
    const changes = vi.fn();
    const { controller } = renderTable({ onSelectionChange: changes });
    fireEvent.click(screen.getByRole("gridcell", { name: "Ada" }));
    fireEvent.click(screen.getByRole("gridcell", { name: "Grace" }), { ctrlKey: true });
    expect(controller.getSnapshot().selection.selectedIds).toEqual(new Set(["ada", "grace"]));

    fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowDown" });
    expect(controller.getSnapshot().selection.selectedIds).toEqual(new Set(["ada", "grace"]));
    expect(document.getElementById(screen.getByRole("grid").getAttribute("aria-activedescendant")!)?.textContent).toContain("Alan");

    fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowDown", shiftKey: true });
    expect(changes.mock.calls.at(-1)?.[0]).toMatchObject({ reason: "keyboard-range" });
  });

  it("honours hidden, reordered and resized column configuration", () => {
    const configurations = vi.fn();
    const view = renderTable({
      columnVisibility: { name: true, age: false },
      columnOrder: ["age", "name"],
      columnWidths: { name: 180 },
      onColumnConfigurationChange: configurations,
    });
    expect(screen.queryByRole("columnheader", { name: /Age/ })).toBeNull();
    expect(screen.getByRole("columnheader", { name: /Name/ }).getAttribute("style")).toContain("180px");

    view.rerender(
      <NSETable
        aria-label="People"
        adapter={view.adapter}
        columns={columns}
        columnVisibility={{ name: true, age: true }}
        columnOrder={["age", "name"]}
        viewportBlockSize={230}
        onColumnConfigurationChange={configurations}
      />,
    );
    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);
    expect(headers[0]).toContain("Age");
    fireEvent.keyDown(screen.getByRole("separator", { name: "Resize Age" }), { key: "ArrowRight" });
    expect(configurations).toHaveBeenLastCalledWith(expect.objectContaining({ widths: expect.objectContaining({ age: 96 }) }));
  });

  it("sorts ascending then descending through controller authority", () => {
    const { controller } = renderTable();
    const sort = screen.getByRole("button", { name: "Sort by Name" });
    fireEvent.click(sort);
    expect(controller.getSnapshot().arranged.map(({ name }) => name)).toEqual(["Ada", "Alan", "Grace"]);
    expect(sort.closest('[role="columnheader"]')?.getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(sort);
    expect(controller.getSnapshot().arranged.map(({ name }) => name)).toEqual(["Grace", "Alan", "Ada"]);
    expect(sort.closest('[role="columnheader"]')?.getAttribute("aria-sort")).toBe("descending");
  });

  it("dispatches double action only on a double click", () => {
    const action = vi.fn();
    renderTable({ onDoubleAction: action });
    const ada = screen.getByRole("gridcell", { name: "Ada" });
    fireEvent.click(ada);
    expect(action).not.toHaveBeenCalled();
    fireEvent.doubleClick(ada);
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith("ada", expect.objectContaining({ name: "Ada" }));
  });

  it("validates and commits inline edits, returning focus authority to the grid", async () => {
    const commit = vi.fn(async () => undefined);
    renderTable({ onEditCommit: commit });
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "Enter" });
    const input = screen.getByRole("textbox", { name: "Edit Name" });
    fireEvent.change(input, { target: { value: "" } });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(commit).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "Augusta Ada" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(commit).toHaveBeenCalledWith(expect.objectContaining({ id: "ada", columnId: "name", value: "Augusta Ada" })));
    expect(screen.queryByRole("textbox", { name: "Edit Name" })).toBeNull();
    expect(document.getElementById(grid.getAttribute("aria-activedescendant")!)?.textContent).toContain("Ada");
  });

  it("renders and operates a typed custom column editor", () => {
    const editor = vi.fn((context: { value: unknown; commit(value: unknown): void; cancel(): void }) => <button type="button" onClick={() => context.commit("Custom Ada")}>Custom editor</button>);
    renderTable({ columns: [{ ...columns[0]!, editor }, columns[1]!] });
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Enter" });
    expect(editor).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Custom editor" }));
    expect(screen.queryByRole("button", { name: "Custom editor" })).toBeNull();
  });

  it("cancels editing on selection and aborts an async edit before sorting", async () => {
    let editSignal: AbortSignal | undefined;
    const commit = vi.fn(({ signal }: { signal: AbortSignal }) => {
      editSignal = signal;
      return new Promise<void>(() => undefined);
    });
    renderTable({ onEditCommit: commit });
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "Enter" });
    fireEvent.click(screen.getByRole("gridcell", { name: "Grace" }));
    expect(screen.queryByRole("textbox", { name: "Edit Name" })).toBeNull();

    fireEvent.keyDown(grid, { key: "Home", ctrlKey: true });
    fireEvent.keyDown(grid, { key: "Enter" });
    const input = screen.getByRole("textbox", { name: "Edit Name" });
    fireEvent.change(input, { target: { value: "Ada pending" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Sort by Name" }));
    expect(editSignal?.aborted).toBe(true);
    expect(screen.queryByRole("textbox", { name: "Edit Name" })).toBeNull();
  });

  it("keeps the final active cell mounted without selecting it", () => {
    const content = Array.from({ length: 10_000 }, (_, index) => ({ id: `person-${index}`, name: `Person ${index}`, age: index }));
    const { adapter, controller } = createAdapter(content);
    render(<NSETable aria-label="People" adapter={adapter} columns={columns} viewportBlockSize={230} />);
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "End", ctrlKey: true });
    expect(document.getElementById(grid.getAttribute("aria-activedescendant")!)?.textContent).toBe("9999");
    expect(document.getElementById(grid.getAttribute("aria-activedescendant")!)).not.toBeNull();
    expect(controller.getSnapshot().selection.selectedIds.size).toBe(0);
    expect(screen.getAllByRole("gridcell").length).toBeLessThan(120);
    const activeCell = document.getElementById(grid.getAttribute("aria-activedescendant")!)!;
    const row = activeCell.closest<HTMLElement>('[data-nse-part="row"]')!;
    const rowBottom = Number.parseFloat(row.style.insetBlockStart) + Number.parseFloat(row.style.blockSize);
    expect(rowBottom).toBeLessThanOrEqual(grid.scrollTop + 230);
  });

  it.each(["read-only", "disabled", "denied", "invalid"] as const)("blocks table mutations while %s", (kind) => {
    const sort = vi.fn();
    const resize = vi.fn();
    const activate = vi.fn();
    renderTable({ state: { kind, message: kind }, columns: [{ ...columns[0]!, sort: { compare: () => 0 } }, columns[1]!], onSortDescriptorsChange: sort, onColumnConfigurationChange: resize, onDoubleAction: activate });
    const sortButton = screen.getByRole("button", { name: "Sort by Name" });
    const separator = screen.getByRole("separator", { name: "Resize Name" });
    fireEvent.click(sortButton);
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    fireEvent.doubleClick(screen.getByRole("gridcell", { name: "Ada" }));
    expect(sort).not.toHaveBeenCalled(); expect(resize).not.toHaveBeenCalled(); expect(activate).not.toHaveBeenCalled();
    expect((sortButton as HTMLButtonElement).disabled).toBe(true);
    expect(separator.getAttribute("tabindex")).toBe("-1");
  });

  it("supports formatter-free custom editors with one stable abortable lifetime", () => {
    let context!: { signal: AbortSignal; cancel(): void };
    const editor = vi.fn((next: typeof context) => { context = next; return <button onClick={next.cancel}>Cancel custom</button>; });
    renderTable({ columns: [{ ...columns[0]!, editable: true, format: undefined, editor }, columns[1]!] });
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Enter" });
    const firstSignal = context.signal;
    fireEvent.click(screen.getByRole("button", { name: "Cancel custom" }));
    expect(firstSignal.aborted).toBe(true);
    expect(editor).toHaveBeenCalled();
  });

  it("provides coordinate lookup and preserves labels through empty/loading states", () => {
    expect(rowAtNSETablePoint({ block: 47, rowHeight: 23, rowCount: 10 })).toBe(2);
    expect(rowAtNSETablePoint({ block: -1, rowHeight: 23, rowCount: 10 })).toBe(-1);
    expect(columnAtNSETablePoint({ inline: 221, widths: [220, 80] })).toBe(1);
    expect(columnAtNSETablePoint({ inline: 400, widths: [220, 80] })).toBe(-1);

    const empty = createAdapter([]);
    const view = render(<NSETable aria-label="People" adapter={empty.adapter} columns={columns} state={{ kind: "empty", message: "No people" }} />);
    expect(screen.getByRole("grid", { name: "People" })).not.toBeNull();
    expect(screen.getByRole("status").textContent).toContain("No people");
    view.rerender(<NSETable aria-label="People" adapter={empty.adapter} columns={columns} state={{ kind: "loading", message: "Loading people" }} />);
    expect(screen.getByRole("grid").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("Loading people");
  });

  it("keeps hostile stable IDs unique and exposes recovery without replacing the labelled grid", () => {
    const retry = vi.fn();
    const source = createAdapter([
      { id: "%", name: "Percent", age: 1 },
      { id: "-25", name: "Dash", age: 2 },
    ]);
    render(
      <NSETable
        aria-label="People"
        adapter={source.adapter}
        columns={columns}
        state={{ kind: "error", message: "People unavailable", retry }}
      />,
    );

    const cellIds = screen.getAllByRole("gridcell").map(({ id }) => id);
    expect(new Set(cellIds).size).toBe(cellIds.length);
    expect(screen.getByRole("grid", { name: "People" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
