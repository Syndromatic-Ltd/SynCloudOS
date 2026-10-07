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

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NSEBrowser, type NSEBrowserDataSource } from "../../../src/NSE/DataViews/Browser";

interface Entry { readonly id: string; readonly label: string; readonly leaf?: boolean }

const root: readonly Entry[] = [
  { id: "src", label: "src" },
  { id: "docs", label: "docs" },
  { id: "readme", label: "README.md", leaf: true },
];
const children: Record<string, readonly Entry[]> = {
  src: [{ id: "src/index.ts", label: "index.ts", leaf: true }, { id: "src/nse", label: "nse" }],
  "src/nse": [{ id: "src/nse/view.ts", label: "view.ts", leaf: true }],
  docs: [{ id: "docs/guide.md", label: "guide.md", leaf: true }],
};

function dataSource(overrides: Partial<NSEBrowserDataSource<Entry, string>> = {}): NSEBrowserDataSource<Entry, string> {
  return {
    rootItems: async () => root,
    children: async (item) => children[item.id] ?? [],
    idForItem: (item) => item.id,
    labelForItem: (item) => item.label,
    isLeaf: (item) => item.leaf === true,
    ...overrides,
  };
}

afterEach(cleanup);

describe("NSEBrowser", () => {
  it("loads roots, opens/removes columns by stable path, and activates leaves", async () => {
    const onActivateLeaf = vi.fn();
    const onPathChange = vi.fn();
    render(<NSEBrowser aria-label="Repository" dataSource={dataSource()} presentation="columns" onActivateLeaf={onActivateLeaf} onPathChange={onPathChange} />);
    await screen.findByRole("option", { name: "src" });
    fireEvent.click(screen.getByRole("option", { name: "src" }));
    expect(await screen.findByRole("option", { name: "index.ts" })).not.toBeNull();
    expect(screen.getAllByRole("listbox")).toHaveLength(2);
    expect(screen.getByRole("option", { name: "src" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("option", { name: "index.ts" }));
    expect(onActivateLeaf).toHaveBeenCalledWith(expect.objectContaining({ id: "src/index.ts" }));
    fireEvent.click(screen.getByRole("option", { name: "docs" }));
    expect(await screen.findByRole("option", { name: "guide.md" })).not.toBeNull();
    expect(screen.queryByRole("option", { name: "index.ts" })).toBeNull();
    expect(onPathChange).toHaveBeenLastCalledWith([expect.objectContaining({ id: "docs" })]);
  });

  it("hydrates and reconciles externally controlled paths", async () => {
    const view = render(<NSEBrowser aria-label="Repository" dataSource={dataSource()} presentation="columns" path={[{ id: "src", item: root[0]! }]} />);
    expect(await screen.findByRole("option", { name: "index.ts" })).not.toBeNull();
    expect(screen.getAllByRole("listbox")).toHaveLength(2);
    view.rerender(<NSEBrowser aria-label="Repository" dataSource={dataSource()} presentation="columns" path={[]} />);
    await waitFor(() => expect(screen.getAllByRole("listbox")).toHaveLength(1));
  });

  it("supports column traversal, row navigation, Home/End and Enter", async () => {
    const activate = vi.fn();
    render(<NSEBrowser aria-label="Repository" dataSource={dataSource()} presentation="columns" onActivateLeaf={activate} />);
    const rootList = await screen.findByRole("listbox", { name: "Repository column 1" });
    await screen.findByRole("option", { name: "src" });
    fireEvent.keyDown(rootList, { key: "ArrowRight" });
    const childList = await screen.findByRole("listbox", { name: "Repository column 2" });
    expect(document.activeElement).toBe(childList);
    fireEvent.keyDown(childList, { key: "End" });
    fireEvent.keyDown(childList, { key: "Home" });
    fireEvent.keyDown(childList, { key: "Enter" });
    expect(activate).toHaveBeenCalledWith(expect.objectContaining({ id: "src/index.ts" }));
  });

  it("physically reveals a far keyboard target and ignores IME composition", async () => {
    const many = Array.from({ length: 1_000 }, (_, index) => ({ id: `item-${index}`, label: `Item ${index}`, leaf: true }));
    render(<NSEBrowser aria-label="Large" presentation="columns" dataSource={dataSource({ rootItems: async () => many })} />);
    const list = await screen.findByRole("listbox", { name: "Large column 1" });
    await screen.findByRole("option", { name: "Item 0" });
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 230 });
    fireEvent.keyDown(list, { key: "End" });
    expect(list.scrollTop).toBeGreaterThan(22_000);
    const target = screen.getByRole("option", { name: "Item 999" });
    expect(Number.parseFloat(target.style.insetBlockStart) + Number.parseFloat(target.style.blockSize)).toBeLessThanOrEqual(list.scrollTop + 230);
    const activeAfterEnd = list.getAttribute("aria-activedescendant");
    fireEvent.keyDown(list, { key: "Home", isComposing: true, keyCode: 229 });
    expect(list.getAttribute("aria-activedescendant")).toBe(activeAfterEnd);
  });

  it("uses injected compact presentation and restores branch focus on back", async () => {
    render(<NSEBrowser aria-label="Repository" dataSource={dataSource()} presentation="compact" />);
    fireEvent.click(await screen.findByRole("option", { name: "src" }));
    expect(await screen.findByRole("option", { name: "index.ts" })).not.toBeNull();
    expect(screen.getAllByRole("listbox")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Back to Repository" }));
    const src = screen.getByRole("option", { name: "src" });
    expect(src.getAttribute("data-focused")).toBe("true");
    expect(screen.queryByRole("option", { name: "index.ts" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("listbox", { name: "Repository column 1" }));
  });

  it("keeps logical column order in RTL", async () => {
    render(<NSEBrowser aria-label="Repository" dataSource={dataSource()} presentation="columns" dir="rtl" />);
    fireEvent.click(await screen.findByRole("option", { name: "src" }));
    await screen.findByRole("option", { name: "index.ts" });
    expect(screen.getByTestId("browser-columns").getAttribute("dir")).toBe("rtl");
    expect(screen.getAllByRole("listbox")[0]!.getAttribute("data-column-index")).toBe("0");
  });

  it("resizes logical column widths and reports controlled values", async () => {
    const onColumnWidthsChange = vi.fn();
    render(<NSEBrowser aria-label="Repository" dataSource={dataSource()} presentation="columns" columnWidths={[180]} onColumnWidthsChange={onColumnWidthsChange} />);
    await screen.findByRole("option", { name: "src" });
    fireEvent.keyDown(screen.getByRole("separator", { name: "Resize Repository column 1" }), { key: "ArrowRight" });
    expect(onColumnWidthsChange).toHaveBeenCalledWith([188]);
  });

  it("aborts superseded A to B to A loads and rejects reverse settlement", async () => {
    const pending = new Map<string, { resolve: (items: readonly Entry[]) => void; signal: AbortSignal }[]>();
    const label = vi.fn((item: Entry) => item.label);
    const source = dataSource({
      labelForItem: label,
      children: (item, signal) => new Promise((resolve) => {
        const entries = pending.get(item.id) ?? [];
        entries.push({ resolve, signal });
        pending.set(item.id, entries);
      }),
    });
    render(<NSEBrowser aria-label="Repository" dataSource={source} presentation="columns" />);
    fireEvent.click(await screen.findByRole("option", { name: "src" }));
    fireEvent.click(screen.getByRole("option", { name: "docs" }));
    fireEvent.click(screen.getByRole("option", { name: "src" }));
    expect(pending.get("src")![0]!.signal.aborted).toBe(true);
    expect(pending.get("docs")![0]!.signal.aborted).toBe(true);
    await act(async () => {
      pending.get("docs")![0]!.resolve([{ id: "stale", label: "stale", leaf: true }]);
      pending.get("src")![0]!.resolve([{ id: "older", label: "older", leaf: true }]);
      pending.get("src")![1]!.resolve(children.src!);
    });
    expect(await screen.findByRole("option", { name: "index.ts" })).not.toBeNull();
    expect(screen.queryByRole("option", { name: "stale" })).toBeNull();
    expect(screen.queryByRole("option", { name: "older" })).toBeNull();
    expect(label.mock.calls.flatMap(([item]) => item.id)).not.toContain("stale");
    expect(label.mock.calls.flatMap(([item]) => item.id)).not.toContain("older");
  });

  it("aborts pending work on unmount", async () => {
    let observed: AbortSignal | undefined;
    const source = dataSource({ rootItems: (signal) => new Promise(() => { observed = signal; }) });
    const view = render(<NSEBrowser aria-label="Repository" dataSource={source} presentation="columns" />);
    await waitFor(() => expect(observed).not.toBeUndefined());
    view.unmount();
    expect(observed!.aborted).toBe(true);
  });

  it("announces empty, denied and retryable error columns", async () => {
    const retry = vi.fn();
    const source = dataSource({ rootItems: async () => { throw Object.assign(new Error("Unavailable"), { retry }); } });
    render(<NSEBrowser aria-label="Repository" dataSource={source} presentation="columns" />);
    expect(await screen.findByText("Unavailable")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate and unsupported loaded identities before publishing a column", async () => {
    render(<NSEBrowser aria-label="Duplicate" dataSource={dataSource({ rootItems: async () => [{ id: "same", label: "one" }, { id: "same", label: "two" }] })} presentation="columns" />);
    expect(await screen.findByText(/unique|duplicate/i)).not.toBeNull();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    cleanup();
    const unsupported = dataSource({ rootItems: async () => [{ id: Number.POSITIVE_INFINITY as unknown as string, label: "bad" }] });
    render(<NSEBrowser aria-label="Unsupported" dataSource={unsupported} presentation="columns" />);
    expect(await screen.findByText(/identity|finite|supported/i)).not.toBeNull();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("does not invoke hostile error coercion or retry accessors", async () => {
    const retryGetter = vi.fn();
    const hostile = Object.create(null) as Record<string | symbol, unknown>;
    Object.defineProperty(hostile, "retry", { get: retryGetter });
    Object.defineProperty(hostile, Symbol.toPrimitive, { value: () => { throw new Error("coercion escaped"); } });
    Object.defineProperty(hostile, "toString", { value: () => { throw new Error("string escaped"); } });
    render(<NSEBrowser aria-label="Hostile" dataSource={dataSource({ rootItems: async () => { throw hostile; } })} presentation="columns" />);
    expect(await screen.findByText("Browser data could not be loaded.")).not.toBeNull();
    expect(retryGetter).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("rejects accessor-backed loaded item shapes without invoking them", async () => {
    const getter = vi.fn(() => "hidden");
    const item = { label: "unsafe" } as Record<string, unknown>;
    Object.defineProperty(item, "id", { enumerable: true, get: getter });
    render(<NSEBrowser aria-label="Accessor" dataSource={dataSource({ rootItems: async () => [item as unknown as Entry] })} presentation="columns" />);
    expect(await screen.findByText(/own data properties/i)).not.toBeNull();
    expect(getter).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("rejects inherited item identities without invoking their getters", async () => {
    const getter = vi.fn(() => "inherited");
    const prototype = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(prototype, "id", { get: getter });
    const item = Object.assign(Object.create(prototype), { label: "unsafe", leaf: true }) as Entry;
    render(<NSEBrowser aria-label="Inherited" dataSource={dataSource({ rootItems: async () => [item] })} presentation="columns" />);
    expect(await screen.findByText(/own data|prototype|shape/i)).not.toBeNull();
    expect(getter).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it.each([
    ["idForItem", "Identity projection failed"],
    ["labelForItem", "Label projection failed"],
    ["isLeaf", "Leaf projection failed"],
    ["iconForItem", "Icon projection failed"],
  ] as const)("contains a hostile %s callback in a Browser error column", async (name, message) => {
    const callback = vi.fn(() => { throw new Error(message); });
    const source = dataSource({ [name]: callback });
    render(<NSEBrowser aria-label={`Hostile ${name}`} dataSource={source} presentation="columns" />);
    expect(await screen.findByText(message)).not.toBeNull();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("uses owned presentation snapshots during render and typeahead", async () => {
    const id = vi.fn((item: Entry) => item.id);
    const label = vi.fn((item: Entry) => item.label);
    const leaf = vi.fn((item: Entry) => item.leaf === true);
    const icon = vi.fn(() => null);
    render(<NSEBrowser aria-label="Snapshot" dataSource={dataSource({ idForItem: id, labelForItem: label, isLeaf: leaf, iconForItem: icon })} presentation="columns" />);
    const list = await screen.findByRole("listbox", { name: "Snapshot column 1" });
    await screen.findByRole("option", { name: "src" });
    const calls = [id.mock.calls.length, label.mock.calls.length, leaf.mock.calls.length, icon.mock.calls.length];
    fireEvent.keyDown(list, { key: "d" });
    expect([id.mock.calls.length, label.mock.calls.length, leaf.mock.calls.length, icon.mock.calls.length]).toEqual(calls);
  });

  it("allows read-only branch navigation but disables width mutation", async () => {
    const resize = vi.fn();
    render(<NSEBrowser aria-label="Read only" dataSource={dataSource()} presentation="columns" state={{ kind: "read-only", message: "Read only" }} onColumnWidthsChange={resize} />);
    fireEvent.click(await screen.findByRole("option", { name: "src" }));
    expect(await screen.findByRole("option", { name: "index.ts" })).not.toBeNull();
    const separator = screen.getAllByRole("separator")[0]!;
    expect(separator.tabIndex).toBe(-1);
    expect(separator.getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(resize).not.toHaveBeenCalled();
  });

  it.each(["disabled", "denied", "invalid"] as const)("blocks navigation, activation and resizing while %s", async (kind) => {
    const activate = vi.fn();
    const resize = vi.fn();
    render(<NSEBrowser aria-label="Repository" dataSource={dataSource()} presentation="columns" state={{ kind, message: kind }} onActivateLeaf={activate} onColumnWidthsChange={resize} />);
    const option = await screen.findByRole("option", { name: "src" });
    fireEvent.click(option);
    fireEvent.keyDown(screen.getByRole("listbox", { name: "Repository column 1" }), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByRole("separator", { name: "Resize Repository column 1" }), { key: "ArrowRight" });
    expect(screen.getAllByRole("listbox")).toHaveLength(1);
    expect(activate).not.toHaveBeenCalled();
    expect(resize).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox").getAttribute("aria-disabled")).toBe("true");
  });
});
