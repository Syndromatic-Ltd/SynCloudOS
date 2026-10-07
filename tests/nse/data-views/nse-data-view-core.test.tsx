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

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NSEArrayController } from "../../../src/NSE/Controllers";
import { SortDescriptor } from "../../../src/SynCloudOS/Models";
import {
  decodeNSEDataViewKey,
  encodeNSEDataViewKey,
  NSEDataViewCoordinator,
  useNSEDataView,
  type NSEDataViewAdapter,
  type NSEDataViewSelectionEvent,
  type NSEDataViewState,
} from "../../../src/NSE/DataViews/Core";
import { NSEDataViewCellContent } from "../../../src/NSE/DataViews/Core/NSEDataViewCellContent";

interface Person {
  readonly id: string;
  readonly name: string;
  readonly detail?: string;
  readonly archived?: boolean;
}

const people: readonly Person[] = [
  { id: "ada", name: "Ada", detail: "Compiler" },
  { id: "grace", name: "Grace", detail: "COBOL" },
  { id: "linus", name: "Linus", archived: true },
];

function createAdapter() {
  const controller = new NSEArrayController<Person, string>({
    id: "people",
    content: people,
    getId: (person) => person.id,
    selection: { mode: "multiple", allowsEmpty: true },
  });
  const adapter: NSEDataViewAdapter<Person, string> = {
    controller,
    idForItem: (person) => person.id,
    labelForItem: (person) => person.name,
    isItemDisabled: (person) => person.archived === true,
  };
  return { adapter, controller };
}

function CoreHarness({
  adapter,
  onSelectionChange,
  onActivate,
  state = { kind: "ready" },
  selectionMode = "multiple",
}: {
  adapter: NSEDataViewAdapter<Person, string>;
  onSelectionChange?: (event: NSEDataViewSelectionEvent<string>) => void;
  onActivate?: (id: string) => void;
  state?: NSEDataViewState;
  selectionMode?: "none" | "single" | "multiple";
}) {
  const view = useNSEDataView(adapter, {
    selectionMode,
    state,
    onSelectionChange,
    delegate: { didActivate: (id) => onActivate?.(id) },
  });

  return (
    <div {...view.rootProps} role="grid" aria-label="People">
      {view.snapshot.items.map(({ id, item }) => (
        <div
          {...view.itemProps(id)}
          key={id}
          role="row"
          aria-label={item.name}
        >
          {item.name}
        </div>
      ))}
      <span role="status">{view.announcement}</span>
    </div>
  );
}

afterEach(cleanup);

describe("structured data-view coordination", () => {
  it("projects controller content and publishes pointer and keyboard-range selection", () => {
    const { adapter } = createAdapter();
    const changes = vi.fn();
    render(<CoreHarness adapter={adapter} onSelectionChange={changes} />);

    fireEvent.click(screen.getByText("Ada"));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowDown", shiftKey: true });

    const event = changes.mock.calls.at(-1)?.[0] as NSEDataViewSelectionEvent<string>;
    expect(event.reason).toBe("keyboard-range");
    expect(event.snapshot.selectedIds).toEqual(new Set(["ada", "grace"]));
    expect(event.snapshot.anchorId).toBe("ada");
    expect(event.snapshot.focusId).toBe("grace");
  });

  it("keeps roving focus independent from selection and stable across sorting", () => {
    const { adapter, controller } = createAdapter();
    render(<CoreHarness adapter={adapter} />);

    fireEvent.click(screen.getByText("Ada"));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowDown" });
    expect(document.getElementById(screen.getByRole("grid").getAttribute("aria-activedescendant")!)?.textContent).toBe("Grace");
    expect(controller.getSnapshot().selection.selectedIds).toEqual(new Set(["ada"]));

    controller.setSortDescriptors([new SortDescriptor<Person, string>({
      id: "name",
      select: (person) => person.name,
      direction: "descending",
    })]);

    expect(document.getElementById(screen.getByRole("grid").getAttribute("aria-activedescendant")!)?.textContent).toBe("Grace");
    expect(controller.getSnapshot().selection.selectedIds).toEqual(new Set(["ada"]));
  });

  it("retains controller publication subscriptions through StrictMode effect replay", () => {
    const { adapter, controller } = createAdapter();
    render(<React.StrictMode><CoreHarness adapter={adapter} /></React.StrictMode>);
    fireEvent.click(screen.getByText("Ada"));
    expect(controller.getSnapshot().selection.selectedIds).toEqual(new Set(["ada"]));
    expect(screen.getByRole("row", { name: "Ada" }).getAttribute("aria-selected")).toBe("true");
  });

  it("updates callbacks and selection mode without replacing the adapter", () => {
    const { adapter, controller } = createAdapter();
    const first = vi.fn();
    const second = vi.fn();
    const view = render(<CoreHarness adapter={adapter} onSelectionChange={first} onActivate={first} />);
    view.rerender(<CoreHarness adapter={adapter} onSelectionChange={second} onActivate={second} selectionMode="none" />);
    fireEvent.click(screen.getByText("Ada"));
    fireEvent.doubleClick(screen.getByText("Ada"));
    expect(controller.getSnapshot().selection.selectedIds).toEqual(new Set());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it.each(["disabled", "denied", "invalid"] as const)("blocks pointer and keyboard selection and activation while %s", (kind) => {
    const { adapter, controller } = createAdapter();
    const activate = vi.fn();
    render(<CoreHarness adapter={adapter} onActivate={activate} state={{ kind, message: kind }} />);
    fireEvent.click(screen.getByText("Ada"));
    fireEvent.keyDown(screen.getByRole("grid"), { key: " ", code: "Space" });
    fireEvent.doubleClick(screen.getByText("Ada"));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Enter" });
    expect(controller.getSnapshot().selection.selectedIds).toEqual(new Set());
    expect(activate).not.toHaveBeenCalled();
  });

  it("publishes a coherent cancelled state exactly once when cancellation throws", () => {
    const { adapter } = createAdapter();
    const coordinator = new NSEDataViewCoordinator(adapter, { selectionMode: "multiple" });
    const listener = vi.fn();
    coordinator.subscribe(listener);
    const failure = new Error("cancel failed");
    const cancel = vi.fn(() => { throw failure; });
    coordinator.beginEditing("ada", cancel);
    expect(() => coordinator.cancelEditing()).toThrow(failure);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(coordinator.getSnapshot().editingId).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    coordinator.dispose();
  });

  it("runs cancellation even when a subscriber throws and reports both failures deterministically", () => {
    const { adapter } = createAdapter();
    const coordinator = new NSEDataViewCoordinator(adapter, { selectionMode: "multiple" });
    const cancel = vi.fn(() => { throw new Error("cancel failure"); });
    coordinator.subscribe(() => { throw new Error("listener failure"); });
    expect(() => coordinator.beginEditing("ada", cancel)).toThrow("listener failure");
    expect(() => coordinator.dispose()).toThrow(AggregateError);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(coordinator.getSnapshot().editingId).toBeNull();
  });

  it("reconciles a deleted active edit before reporting cancellation and subscriber failures", () => {
    const { adapter, controller } = createAdapter();
    const coordinator = new NSEDataViewCoordinator(adapter, { selectionMode: "multiple" });
    const cancel = vi.fn(() => { throw new Error("cancel failure"); });
    coordinator.setActive("grace");
    coordinator.beginEditing("grace", cancel);
    coordinator.subscribe(() => { throw new Error("listener failure"); });
    expect(() => controller.setContent([people[0]!])).toThrow(AggregateError);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(coordinator.getSnapshot()).toMatchObject({ activeId: "ada", editingId: null });
    expect(coordinator.getSnapshot().items.map(({ id }) => id)).toEqual(["ada"]);
  });

  it("encodes every supported identity without URI conversion collisions", () => {
    const identities = ["\ud800", "a/b:%🙂", 0, 42] as const;
    const tokens = identities.map(encodeNSEDataViewKey);
    expect(new Set(tokens).size).toBe(identities.length);
    expect(tokens.map(decodeNSEDataViewKey)).toEqual(identities);
    expect(() => encodeNSEDataViewKey(-0)).toThrow(/identity/i);
    expect(() => encodeNSEDataViewKey(Number.NaN)).toThrow(/identity/i);
    expect(() => encodeNSEDataViewKey(Number.POSITIVE_INFINITY)).toThrow(/identity/i);
    for (const unsupported of [true, {}, () => "id", null, undefined]) {
      expect(() => encodeNSEDataViewKey(unsupported as never)).toThrow(/identity/i);
    }
    const hostile = Object.create(null) as Record<PropertyKey, unknown>;
    const coercion = vi.fn(() => "id");
    Object.defineProperty(hostile, Symbol.toPrimitive, { value: coercion });
    expect(() => encodeNSEDataViewKey(hostile as never)).toThrow(/identity/i);
    expect(coercion).not.toHaveBeenCalled();
  });

  it("rejects duplicate adapter identities before publishing a projection", () => {
    const controller = new NSEArrayController({ id: "duplicate-adapter-ids", content: [{ id: "one" }, { id: "two" }], getId: (item) => item.id, selection: { mode: "single", allowsEmpty: true } });
    expect(() => new NSEDataViewCoordinator({ controller, idForItem: () => "duplicate", labelForItem: (item) => item.id }, { selectionMode: "single" })).toThrow(/duplicate.*identity/i);
  });

  it("reuses projected entries for active-only movement", () => {
    const disabled = vi.fn(() => false);
    const content = Array.from({ length: 50_000 }, (_, index) => ({ id: `id-${index}`, name: `Name ${index}` }));
    const controller = new NSEArrayController({ id: "projection-work", content, getId: (item) => item.id, selection: { mode: "multiple", allowsEmpty: true } });
    const coordinator = new NSEDataViewCoordinator({ controller, idForItem: (item) => item.id, labelForItem: (item) => item.name, isItemDisabled: disabled }, { selectionMode: "multiple" });
    const before = coordinator.getSnapshot().items[25_000];
    const initialCalls = disabled.mock.calls.length;
    coordinator.moveActiveTo("end");
    expect(disabled.mock.calls.length - initialCalls).toBeLessThan(10);
    expect(coordinator.getSnapshot().items[25_000]).toBe(before);
  });

  it("suppresses navigation while an IME composition owns keyboard input", () => {
    const { adapter } = createAdapter();
    render(<CoreHarness adapter={adapter} />);
    const grid = screen.getByRole("grid");
    const before = grid.getAttribute("aria-activedescendant");
    fireEvent.keyDown(grid, { key: "ArrowDown", isComposing: true, keyCode: 229 });
    expect(grid.getAttribute("aria-activedescendant")).toBe(before);
  });

  it("uses type-tagged DOM identities for numeric and string IDs", () => {
    const controller = new NSEArrayController<{ id: string | number; label: string }, string | number>({ id: "mixed-ids", content: [{ id: 1, label: "Number" }, { id: "1", label: "String" }, { id: "a/b %🙂", label: "Unicode" }], getId: (item) => item.id, selection: { mode: "multiple", allowsEmpty: true } });
    const adapter = { controller, idForItem: (item: { id: string | number }) => item.id, labelForItem: (item: { label: string }) => item.label };
    function Mixed() { const view = useNSEDataView(adapter, { selectionMode: "multiple" }); return <div {...view.rootProps}>{view.snapshot.items.map(({ id, item }) => <div {...view.itemProps(id)} key={`${typeof id}:${id}`}>{item.label}</div>)}</div>; }
    render(<Mixed />);
    const ids = [screen.getByText("Number").id, screen.getByText("String").id, screen.getByText("Unicode").id];
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => document.querySelectorAll(`[id="${id}"]`).length === 1)).toBe(true);
  });

  it("normalises deleted selection, skips disabled items, and activates by Enter or double click", () => {
    const { adapter, controller } = createAdapter();
    const activate = vi.fn();
    const changes = vi.fn();
    render(<CoreHarness adapter={adapter} onActivate={activate} onSelectionChange={changes} />);

    fireEvent.click(screen.getByText("Ada"));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "End" });
    expect(document.getElementById(screen.getByRole("grid").getAttribute("aria-activedescendant")!)?.textContent).toBe("Grace");
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Enter" });
    fireEvent.doubleClick(screen.getByText("Ada"));
    expect(activate.mock.calls.map(([id]) => id)).toEqual(["grace", "ada"]);

    controller.setContent(people.slice(1));
    expect(controller.getSnapshot().selection.selectedIds).toEqual(new Set());
    expect(changes.mock.calls.at(-1)?.[0]).toMatchObject({ reason: "controller-change" });
    expect(document.getElementById(screen.getByRole("grid").getAttribute("aria-activedescendant")!)).not.toBeNull();
  });

  it("cancels an active edit before applying a conflicting controller arrangement", () => {
    const { adapter, controller } = createAdapter();
    const coordinator = new NSEDataViewCoordinator(adapter, { selectionMode: "multiple" });
    const cancel = vi.fn();
    coordinator.beginEditing("ada", cancel);

    controller.setSortDescriptors([new SortDescriptor<Person, string>({
      id: "name",
      select: (person) => person.name,
      direction: "descending",
    })]);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(coordinator.getSnapshot().editingId).toBeNull();
    coordinator.dispose();
  });

  it("announces loading and recoverable error states without dropping content", () => {
    const { adapter } = createAdapter();
    const view = render(<CoreHarness adapter={adapter} state={{ kind: "loading", message: "Loading people" }} />);
    expect(screen.getByRole("grid").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("Loading people");
    expect(screen.getByText("Ada")).not.toBeNull();

    view.rerender(<CoreHarness adapter={adapter} state={{ kind: "error", message: "People unavailable", retry() {} }} />);
    expect(screen.getByRole("status").textContent).toBe("People unavailable");
    expect(screen.getByText("Ada")).not.toBeNull();
  });

  it("composes image, primary text, detail, badge, and accessory semantics internally", () => {
    render(
      <NSEDataViewCellContent
        image={{ src: "/ada.png", alt: "Portrait of Ada" }}
        primary="Ada"
        secondary="Compiler"
        badge="New"
        accessory={<button type="button">More</button>}
      />,
    );

    expect(screen.getByRole("img", { name: "Portrait of Ada" })).not.toBeNull();
    expect(screen.getByText("Ada").getAttribute("data-nse-part")).toBe("primary-text");
    expect(screen.getByText("Compiler").getAttribute("data-nse-part")).toBe("secondary-text");
    expect(screen.getByText("New").getAttribute("data-nse-part")).toBe("badge");
    expect(screen.getByRole("button", { name: "More" })).not.toBeNull();
  });
});
