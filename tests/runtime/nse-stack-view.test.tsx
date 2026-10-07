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

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React, { StrictMode, useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NSEStackItem,
  NSEStackView,
  resolveStackLayout,
  type NSEStackObserverFactory,
} from "../../src/NSE/Layout";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NSEStackView", () => {
  it("allocates fill proportionally and hides the lowest priority items first", () => {
    const { rerender } = render(
      <NSEStackView
        aria-label="Inspector actions"
        orientation="horizontal"
        distribution="fill-proportionally"
        availableSize={240}
      >
        <NSEStackItem id="save" weight={2} visibilityPriority={100}>Save</NSEStackItem>
        <NSEStackItem id="share" weight={1} visibilityPriority={50}>Share</NSEStackItem>
        <NSEStackItem id="help" weight={1} visibilityPriority={10}>Help</NSEStackItem>
      </NSEStackView>,
    );

    expect(screen.getByText("Save").closest("[data-stack-size]")?.getAttribute("data-stack-size")).toBe("120");

    rerender(
      <NSEStackView
        aria-label="Inspector actions"
        orientation="horizontal"
        distribution="fill-proportionally"
        availableSize={150}
      >
        <NSEStackItem id="save" weight={2} visibilityPriority={100}>Save</NSEStackItem>
        <NSEStackItem id="share" weight={1} visibilityPriority={50}>Share</NSEStackItem>
        <NSEStackItem id="help" weight={1} visibilityPriority={10}>Help</NSEStackItem>
      </NSEStackView>,
    );

    expect(screen.getByText("Help").closest("[data-stack-hidden]")?.getAttribute("data-stack-hidden")).toBe("true");
    expect(screen.getByText("Save")).not.toBeNull();
  });

  it("reserves the overflow trigger and its gap inside a finite content budget", () => {
    const layout = resolveStackLayout({
      orientation: "horizontal",
      distribution: "fill",
      availableSize: 100,
      spacing: 8,
      overflowPolicy: "menu",
      items: [
        { id: "save", minimumSize: 60, visibilityPriority: 100 },
        { id: "help", minimumSize: 60, visibilityPriority: 0 },
      ],
    });

    const visibleSize = layout.items
      .filter((item) => !item.hidden)
      .reduce((total, item) => total + item.size, 0);
    expect(layout.overflowIds).toEqual(["help"]);
    expect(layout.overflowTriggerSize).toBeGreaterThan(0);
    expect(visibleSize + layout.overflowTriggerSize + layout.overflowTriggerSpacing).toBeLessThanOrEqual(layout.contentAvailableSize);
  });

  it("resolves every distribution, alignment and logical direction deterministically", () => {
    for (const distribution of [
      "fill",
      "fill-equally",
      "fill-proportionally",
      "equal-spacing",
      "equal-centring",
      "gravity-areas",
    ] as const) {
      for (const alignment of ["fill", "leading", "centre", "trailing", "first-baseline", "last-baseline"] as const) {
        const layout = resolveStackLayout({
          orientation: "vertical",
          distribution,
          alignment,
          availableSize: 300,
          spacing: 12,
          direction: "rtl",
          items: [
            { id: "leading", preferredSize: 60, gravity: "leading", spacingAfter: 18 },
            { id: "centre", preferredSize: 60, gravity: "centre" },
            { id: "trailing", preferredSize: 60, gravity: "trailing" },
          ],
        });
        expect(layout.items.map(({ id }) => id)).toEqual(["leading", "centre", "trailing"]);
        expect(layout.items.every(({ size, position }) => size >= 0 && position >= 0)).toBe(true);
        expect(layout.direction).toBe("rtl");
        expect(layout.alignment).toBe(alignment);
      }
    }
  });

  it("detaches opted-in hidden items and moves a focused item to its overflow control", () => {
    const { rerender } = render(
      <NSEStackView aria-label="Responsive actions" availableSize={180}>
        <NSEStackItem id="save" visibilityPriority={100}><button type="button">Save</button></NSEStackItem>
        <NSEStackItem id="help" visibilityPriority={10} detachedWhenHidden><button type="button">Help</button></NSEStackItem>
      </NSEStackView>,
    );
    screen.getByRole("button", { name: "Help" }).focus();

    rerender(
      <NSEStackView aria-label="Responsive actions" availableSize={100} overflowLabel="Responsive overflow">
        <NSEStackItem id="save" visibilityPriority={100}><button type="button">Save</button></NSEStackItem>
        <NSEStackItem id="help" visibilityPriority={10} detachedWhenHidden overflowLabel="Help" onOverflowActivate={() => undefined}>
          <button type="button">Help</button>
        </NSEStackItem>
      </NSEStackView>,
    );

    expect(document.querySelector("[data-stack-item-id='help']")?.closest('[data-stack-items-host="retained"]')).not.toBeNull();
    expect(screen.queryByRole("dialog", { name: "Responsive overflow overflow" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Responsive overflow" }));
  });

  it("keeps overflow actions keyboard reachable and returns focus after dismissal", () => {
    const onHelp = vi.fn();
    render(
      <NSEStackView aria-label="Actions" availableSize={100} overflowLabel="More actions">
        <NSEStackItem id="save" visibilityPriority={100}>Save</NSEStackItem>
        <NSEStackItem id="help" visibilityPriority={0} overflowLabel="Help" onOverflowActivate={onHelp}>Help</NSEStackItem>
      </NSEStackView>,
    );

    const overflow = screen.getByRole("button", { name: "More actions" });
    overflow.focus();
    fireEvent.click(overflow);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(document.activeElement).toBe(overflow);
    fireEvent.click(overflow);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(onHelp).toHaveBeenCalledTimes(1);
  });

  it("leaves Escape with a closed overflow presentation to the visible child", () => {
    let childSawPreventedEscape = false;
    render(
      <NSEStackView aria-label="Closed escape actions" availableSize={100} overflowLabel="More closed escape actions">
        <NSEStackItem id="save" visibilityPriority={100}>
          <button
            type="button"
            onKeyDown={(event) => {
              if (event.key === "Escape") childSawPreventedEscape = event.defaultPrevented;
            }}
          >
            Save
          </button>
        </NSEStackItem>
        <NSEStackItem id="help" visibilityPriority={0}><button type="button">Help</button></NSEStackItem>
      </NSEStackView>,
    );

    const save = screen.getByRole("button", { name: "Save" });
    const trigger = screen.getByRole("button", { name: "More closed escape actions" });
    save.focus();
    fireEvent.keyDown(save, { key: "Escape" });

    expect(childSawPreventedEscape).toBe(false);
    expect(document.activeElement).toBe(save);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps a normal hidden child button invokable through the overflow menu without a duplicate callback", () => {
    const onHelp = vi.fn();
    render(
      <NSEStackView aria-label="Actionable child overflow" availableSize={100} overflowLabel="More child actions">
        <NSEStackItem id="save" visibilityPriority={100}><button type="button">Save</button></NSEStackItem>
        <NSEStackItem id="help" visibilityPriority={0}><button type="button" onClick={onHelp}>Help</button></NSEStackItem>
      </NSEStackView>,
    );

    fireEvent.click(screen.getByRole("button", { name: "More child actions" }));
    const help = screen.getByRole("button", { name: "Help" });
    expect(help.tagName).toBe("BUTTON");
    fireEvent.click(help);
    expect(onHelp).toHaveBeenCalledTimes(1);
  });

  it("renders detached nested and component-owned actions in the overflow presentation exactly once", async () => {
    const onNested = vi.fn();
    const onComponent = vi.fn();
    function ComponentOwnedAction() {
      return (
        <span>
          <button
            type="button"
            onClick={onComponent}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              onComponent();
            }}
          >
            Component help
          </button>
        </span>
      );
    }
    render(
      <NSEStackView aria-label="Composed action overflow" availableSize={100} overflowLabel="More composed actions">
        <NSEStackItem id="save" visibilityPriority={100}><button type="button">Save</button></NSEStackItem>
        <NSEStackItem id="nested" visibilityPriority={0} detachedWhenHidden><span><button type="button" onClick={onNested}>Nested help</button></span></NSEStackItem>
        <NSEStackItem id="component" visibilityPriority={0} detachedWhenHidden><ComponentOwnedAction /></NSEStackItem>
      </NSEStackView>,
    );

    const trigger = screen.getByRole("button", { name: "More composed actions" });
    fireEvent.click(trigger);
    const overflow = screen.getByRole("dialog", { name: "More composed actions overflow" });
    const nested = within(overflow).getByRole("button", { name: "Nested help" });
    expect(overflow.querySelector("[data-stack-overflow-action] button")).toBe(nested);
    fireEvent.click(nested);
    expect(onNested).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.activeElement).toBe(trigger));

    fireEvent.click(trigger);
    const component = screen.getByRole("button", { name: "Component help" });
    component.focus();
    fireEvent.keyDown(component, { key: "Enter" });
    expect(onComponent).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("retains a detached component action's local state while its overflow presentation closes and reopens", async () => {
    function StatefulAction() {
      const [count, setCount] = useState(0);
      return <button type="button" onClick={() => setCount((value) => value + 1)}>Stateful help {count}</button>;
    }
    render(
      <NSEStackView aria-label="Stateful action overflow" availableSize={100} overflowLabel="More stateful actions">
        <NSEStackItem id="save" visibilityPriority={100}><button type="button">Save</button></NSEStackItem>
        <NSEStackItem id="stateful" visibilityPriority={0} detachedWhenHidden><StatefulAction /></NSEStackItem>
      </NSEStackView>,
    );

    const trigger = screen.getByRole("button", { name: "More stateful actions" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Stateful help 0" }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));

    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Stateful help 1" })).not.toBeNull();
  });

  it("preserves a detached function action's state and effect identity across responsive relocation", async () => {
    const lifecycle = vi.fn();
    const onAction = vi.fn();
    function StatefulAction() {
      const [count, setCount] = useState(0);
      useEffect(() => {
        lifecycle("mount");
        return () => lifecycle("unmount");
      }, []);
      return (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onAction();
            setCount((value) => value + 1);
          }}
        >
          Relocating help {count}
        </button>
      );
    }
    const renderStack = (availableSize: number) => (
      <NSEStackView aria-label="Relocating action overflow" availableSize={availableSize} overflowLabel="More relocating actions">
        <NSEStackItem id="save" visibilityPriority={100}><button type="button">Save</button></NSEStackItem>
        <NSEStackItem id="stateful" visibilityPriority={0} detachedWhenHidden><StatefulAction /></NSEStackItem>
      </NSEStackView>
    );
    const { rerender } = render(renderStack(180));
    expect(document.querySelectorAll('[data-stack-source-index="1"]')).toHaveLength(1);

    const visibleAction = screen.getByRole("button", { name: "Relocating help 0" });
    fireEvent.click(visibleAction);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Relocating help 1" })).toBe(visibleAction);
    expect(lifecycle).toHaveBeenCalledTimes(1);
    visibleAction.focus();

    rerender(renderStack(100));
    const trigger = screen.getByRole("button", { name: "More relocating actions" });
    expect(document.activeElement).toBe(trigger);
    expect(lifecycle).toHaveBeenCalledTimes(1);
    fireEvent.click(trigger);
    const relocatedAction = screen.getByRole("button", { name: "Relocating help 1" });
    expect(lifecycle).toHaveBeenCalledTimes(1);
    fireEvent.click(relocatedAction);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "More relocating actions overflow" })).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
    expect(onAction).toHaveBeenCalledTimes(2);

    rerender(renderStack(180));
    expect(screen.getByRole("button", { name: "Relocating help 2" })).not.toBeNull();
    expect(lifecycle).toHaveBeenCalledTimes(1);
    expect(lifecycle).not.toHaveBeenCalledWith("unmount");
  });

  it("keeps a detached item's logical identity across sibling prepend, removal, and reorder", async () => {
    const lifecycle = vi.fn();
    function StatefulAction() {
      const [count, setCount] = useState(0);
      useEffect(() => {
        lifecycle("mount");
        return () => lifecycle("unmount");
      }, []);
      return <button type="button" onClick={() => setCount((value) => value + 1)}>Composition help {count}</button>;
    }
    const renderStack = (
      composition: "base" | "prepended" | "reordered",
      availableSize = 600,
    ) => (
      <NSEStackView aria-label="Composition action overflow" availableSize={availableSize} overflowLabel="More composition actions">
        {composition === "prepended" ? <NSEStackItem id="before">Before</NSEStackItem> : null}
        <NSEStackItem id="save" visibilityPriority={100}><button type="button">Save</button></NSEStackItem>
        {composition === "reordered" ? <NSEStackItem id="after">After</NSEStackItem> : null}
        <NSEStackItem id="stateful" visibilityPriority={0} detachedWhenHidden><StatefulAction /></NSEStackItem>
        {composition !== "reordered" ? <NSEStackItem id="after">After</NSEStackItem> : null}
      </NSEStackView>
    );

    const { rerender } = render(renderStack("base"));
    fireEvent.click(screen.getByRole("button", { name: "Composition help 0" }));
    expect(screen.getByRole("button", { name: "Composition help 1" })).not.toBeNull();
    expect(lifecycle).toHaveBeenCalledTimes(1);

    rerender(renderStack("prepended"));
    expect(screen.getByRole("button", { name: "Composition help 1" })).not.toBeNull();
    expect(lifecycle).toHaveBeenCalledTimes(1);

    rerender(renderStack("base"));
    expect(screen.getByRole("button", { name: "Composition help 1" })).not.toBeNull();
    expect(lifecycle).toHaveBeenCalledTimes(1);

    rerender(renderStack("reordered"));
    expect(screen.getByRole("button", { name: "Composition help 1" })).not.toBeNull();
    expect(lifecycle).toHaveBeenCalledTimes(1);

    rerender(renderStack("reordered", 100));
    const trigger = screen.getByRole("button", { name: "More composition actions" });
    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Composition help 1" })).not.toBeNull();
    expect(lifecycle).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "More composition actions overflow" }), { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(trigger));

    rerender(renderStack("reordered"));
    expect(screen.getByRole("button", { name: "Composition help 1" })).not.toBeNull();
    expect(lifecycle).toHaveBeenCalledTimes(1);
    expect(lifecycle).not.toHaveBeenCalledWith("unmount");
  });

  it("closes and restores focus after stopped-propagation pointer and keyboard overflow actions", async () => {
    const onPointer = vi.fn();
    const onKeyboard = vi.fn();
    function PointerAction() {
      return <span><button type="button" onClick={(event) => { event.stopPropagation(); onPointer(); }}>Pointer help</button></span>;
    }
    function KeyboardAction() {
      return (
        <button
          type="button"
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            event.stopPropagation();
            onKeyboard();
          }}
        >
          Keyboard help
        </button>
      );
    }
    render(
      <NSEStackView aria-label="Stopped action overflow" availableSize={100} overflowLabel="More stopped actions">
        <NSEStackItem id="save" visibilityPriority={100}><button type="button">Save</button></NSEStackItem>
        <NSEStackItem id="pointer" visibilityPriority={0} detachedWhenHidden><PointerAction /></NSEStackItem>
        <NSEStackItem id="keyboard" visibilityPriority={0} detachedWhenHidden><KeyboardAction /></NSEStackItem>
      </NSEStackView>,
    );

    const trigger = screen.getByRole("button", { name: "More stopped actions" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Pointer help" }));
    expect(onPointer).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "More stopped actions overflow" })).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });

    fireEvent.click(trigger);
    const keyboard = screen.getByRole("button", { name: "Keyboard help" });
    keyboard.focus();
    fireEvent.keyDown(keyboard, { key: "Enter" });
    expect(onKeyboard).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "More stopped actions overflow" })).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("closes and restores focus after stop-propagation-only custom role-button keyboard actions", async () => {
    const onDirect = vi.fn();
    const onNested = vi.fn();
    const onNative = vi.fn();
    function NestedAction() {
      return (
        <span
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key !== " ") return;
            event.stopPropagation();
            onNested();
          }}
        >
          Nested custom action
        </span>
      );
    }
    function NativeAction() {
      return (
        <button
          type="button"
          onClick={onNative}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.stopPropagation();
          }}
        >
          Native stop action
        </button>
      );
    }
    render(
      <NSEStackView aria-label="Custom role action overflow" availableSize={100} overflowLabel="More custom role actions">
        <NSEStackItem id="save" visibilityPriority={100}><button type="button">Save</button></NSEStackItem>
        <NSEStackItem
          id="direct"
          visibilityPriority={0}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.stopPropagation();
            onDirect();
          }}
        >
          Direct custom action
        </NSEStackItem>
        <NSEStackItem id="nested" visibilityPriority={0}><NestedAction /></NSEStackItem>
        <NSEStackItem id="native" visibilityPriority={0}><NativeAction /></NSEStackItem>
      </NSEStackView>,
    );

    const trigger = screen.getByRole("button", { name: "More custom role actions" });
    const dialogName = "More custom role actions overflow";
    fireEvent.click(trigger);
    const direct = screen.getByRole("button", { name: "Direct custom action" });
    direct.focus();
    fireEvent.keyDown(direct, { key: "Enter" });
    expect(onDirect).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: dialogName })).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });

    fireEvent.click(trigger);
    const nested = screen.getByRole("button", { name: "Nested custom action" });
    nested.focus();
    fireEvent.keyDown(nested, { key: " " });
    expect(onNested).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: dialogName })).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });

    fireEvent.click(trigger);
    const native = screen.getByRole("button", { name: "Native stop action" });
    native.focus();
    fireEvent.keyDown(native, { key: "Enter" });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(onNative).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: dialogName })).not.toBeNull();
    expect(document.activeElement).toBe(native);

    fireEvent.click(native);
    expect(onNative).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: dialogName })).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("keeps disabled and non-action overflow content open until an enabled authoritative action accepts activation", async () => {
    const onActive = vi.fn();
    render(
      <NSEStackView aria-label="Guarded action overflow" availableSize={100} overflowLabel="More guarded actions">
        <NSEStackItem id="save" visibilityPriority={100}><button type="button">Save</button></NSEStackItem>
        <NSEStackItem id="disabled" visibilityPriority={0}><button type="button" disabled>Disabled help</button></NSEStackItem>
        <NSEStackItem id="context" visibilityPriority={0}><span>Static overflow context</span></NSEStackItem>
        <NSEStackItem id="active" visibilityPriority={0}><button type="button" onClick={onActive}>Active help</button></NSEStackItem>
      </NSEStackView>,
    );

    const trigger = screen.getByRole("button", { name: "More guarded actions" });
    fireEvent.click(trigger);
    const dialogName = "More guarded actions overflow";
    expect(screen.getByRole("dialog", { name: dialogName })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Disabled help" }));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole("dialog", { name: dialogName })).not.toBeNull();

    fireEvent.click(screen.getByText("Static overflow context"));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole("dialog", { name: dialogName })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Active help" }));
    expect(onActive).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: dialogName })).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("keeps direct and nested ARIA-disabled overflow actions open for pointer and keyboard activation", async () => {
    render(
      <NSEStackView aria-label="ARIA guarded overflow" availableSize={100} overflowLabel="More ARIA guarded actions">
        <NSEStackItem id="save" visibilityPriority={100}><button type="button">Save</button></NSEStackItem>
        <NSEStackItem
          id="direct"
          visibilityPriority={0}
          role="button"
          tabIndex={0}
          aria-disabled="true"
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
        >
          Disabled direct action
        </NSEStackItem>
        <NSEStackItem id="nested" visibilityPriority={0}>
          <span aria-disabled="true">
            <button
              type="button"
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
            >
              Disabled nested action
            </button>
          </span>
        </NSEStackItem>
      </NSEStackView>,
    );

    const trigger = screen.getByRole("button", { name: "More ARIA guarded actions" });
    const dialogName = "More ARIA guarded actions overflow";
    fireEvent.click(trigger);
    const direct = screen.getByRole("button", { name: "Disabled direct action" });
    const nested = screen.getByRole("button", { name: "Disabled nested action" });

    direct.focus();
    fireEvent.click(direct);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole("dialog", { name: dialogName })).not.toBeNull();
    expect(document.activeElement).toBe(direct);

    fireEvent.keyDown(direct, { key: "Enter" });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole("dialog", { name: dialogName })).not.toBeNull();
    expect(document.activeElement).toBe(direct);

    nested.focus();
    fireEvent.click(nested);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole("dialog", { name: dialogName })).not.toBeNull();
    expect(document.activeElement).toBe(nested);

    fireEvent.keyDown(nested, { key: "Enter" });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole("dialog", { name: dialogName })).not.toBeNull();
    expect(document.activeElement).toBe(nested);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("realises interleaved gravity areas by logical position while preserving source order", () => {
    render(
      <NSEStackView aria-label="Interleaved gravity" distribution="gravity-areas" availableSize={300} spacing={0} dir="rtl">
        <NSEStackItem id="trailing" gravity="trailing">Trailing</NSEStackItem>
        <NSEStackItem id="leading" gravity="leading">Leading</NSEStackItem>
        <NSEStackItem id="centre" gravity="centre">Centre</NSEStackItem>
      </NSEStackView>,
    );

    const entries = Array.from(document.querySelectorAll<HTMLElement>("[data-stack-item-id]"));
    expect(entries.map((entry) => entry.dataset.stackItemId)).toEqual(["trailing", "leading", "centre"]);
    expect(entries.map((entry) => entry.dataset.stackPosition)).toEqual(["240", "0", "120"]);
    expect(entries.every((entry) => entry.style.position === "absolute")).toBe(true);
    expect(entries.map((entry) => entry.style.insetInlineStart)).toEqual(["240px", "0px", "120px"]);
  });

  it("uses the injected observer and scheduler, including StrictMode cleanup", () => {
    let listener: (() => void) | null = null;
    const disconnect = vi.fn();
    const observerFactory: NSEStackObserverFactory = (nextListener) => {
      listener = nextListener;
      return { observe: vi.fn(), disconnect };
    };
    const requestFrame = vi.fn((callback: () => void) => {
      callback();
      return "frame";
    });
    const cancelFrame = vi.fn();
    const { unmount } = render(
      <StrictMode>
        <NSEStackView
          aria-label="Measured stack"
          resizeObserverFactory={observerFactory}
          frameScheduler={{ requestFrame, cancelFrame }}
        >
          <NSEStackItem id="one">One</NSEStackItem>
        </NSEStackView>
      </StrictMode>,
    );

    listener?.();
    expect(requestFrame).toHaveBeenCalled();
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
