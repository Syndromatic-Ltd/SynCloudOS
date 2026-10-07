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
import { installNSEScrollIntoViewFixture } from "../nse/fixtures/browser";
installNSEScrollIntoViewFixture();

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NSEGrabHandle,
  NSEListSelector,
  NSEMenu,
  NSEScrollingImage,
  NSEToolbar,
  NSEViewImage,
} from "../../src/NSE/public/controls";
import { NSEStandaloneControlHost } from "../../src/NSE/Overlays";
import { createStaticPresentationPort } from "../fixtures/presentationTraits";
import { NSEDividerDrawer, NSERowGroup, type NSERowGroupHandle } from "../../src/NSE/Containers";

const presentation = createStaticPresentationPort({ width: 1024, height: 768 });
function Host({ children }: React.PropsWithChildren) {
  return <NSEStandaloneControlHost document={document} window={window} presentation={presentation}>{children}</NSEStandaloneControlHost>;
}

afterEach(() => {
  cleanup();
});

describe("NSEMenu sub-item disclosure", () => {
  it("renders a semantic submenu indicator without literal chevron text", async () => {
    render(
      <Host><NSEMenu
        label="File"
        defaultOpen
        items={[{ value: "recent", label: "Open recent", children: [{ value: "a", label: "A.txt" }] }]}
      /></Host>
    );
    // The menu items render through a portal into document.body, not the render container.
    const row = await screen.findByRole("menuitem", { name: "Open recent" });
    const indicator = row.querySelector('[data-nse-part="submenu-arrow"]');
    expect(indicator).not.toBeNull();
    // The old implementation injected a literal "›" text node; the sprite version has no text content.
    expect(indicator?.textContent).toBe("");
  });
});

describe("NSEGrabHandle drag behaviour", () => {
  it("is a presentational span with no drag handlers", () => {
    const { container } = render(<NSEGrabHandle />);
    const handle = container.querySelector(".nse-control-grab-handle");
    expect(handle?.tagName).toBe("SPAN");
    expect(handle?.getAttribute("role")).toBe("img");
  });

  it("becomes a draggable button and reports the drag delta", () => {
    const onDragStart = vi.fn();
    const onDragMove = vi.fn();
    const onDragEnd = vi.fn();
    const { container } = render(
      <NSEGrabHandle onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} />
    );
    const handle = container.querySelector(".nse-control-grab-handle") as HTMLButtonElement;
    expect(handle.tagName).toBe("BUTTON");
    expect(handle.classList.contains("nse-control-grab-handle-draggable")).toBe(true);

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 25, clientY: 18 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 25, clientY: 18 });

    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onDragMove).toHaveBeenCalledWith({ dx: 15, dy: 8 }, expect.anything());
    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });
});

describe("NSEListSelector knobs are wired to the chrome", () => {
  it("emits hideItem / hideArrow / contentPack onto the picker root", () => {
    const { container } = render(
      <Host><NSEListSelector
        items={[{ value: "a", label: "A" }, { value: "b", label: "B" }]}
        hideItem
        hideArrow
        contentPack="center"
      /></Host>
    );
    const root = container.querySelector(".nse-extended-list-selector");
    expect(root?.getAttribute("data-hide-item")).toBe("true");
    expect(root?.getAttribute("data-hide-arrow")).toBe("true");
    expect(root?.getAttribute("data-content-pack")).toBe("center");
    // popupAlign is now a typed prop forwarded to the popup, not a dead data-attr on the root.
    expect(root?.getAttribute("data-popup-align")).toBe("right");
  });
});

describe("NSERowGroup auto-wrap + showRow/hideRow", () => {
  it("renders children directly when wrapRows is off (default)", () => {
    const { container } = render(
      <NSERowGroup>
        <div className="row-a">A</div>
        <div className="row-b">B</div>
      </NSERowGroup>
    );
    expect(container.querySelector(".nse-container-row-group-row")).toBeNull();
  });

  it("wraps each child in a row and toggles visibility via the ref handle", () => {
    const ref = React.createRef<NSERowGroupHandle>();
    const { container } = render(
      <NSERowGroup ref={ref} wrapRows>
        <div>A</div>
        <div>B</div>
      </NSERowGroup>
    );
    const rows = container.querySelectorAll(".nse-container-row-group-row");
    expect(rows).toHaveLength(2);
    expect((rows[0] as HTMLElement).hidden).toBe(false);

    act(() => ref.current!.hideRow(1));
    expect(ref.current!.isRowHidden(1)).toBe(true);
    expect((container.querySelectorAll(".nse-container-row-group-row")[1] as HTMLElement).hidden).toBe(true);

    act(() => ref.current!.showRow(1));
    expect((container.querySelectorAll(".nse-container-row-group-row")[1] as HTMLElement).hidden).toBe(false);
  });
});

describe("Image family: ScrollingImage + ViewImage", () => {
  it("NSEScrollingImage renders a sizeable image that does not auto-fit", () => {
    const { container } = render(<NSEScrollingImage src="/x.png" alt="x" />);
    const box = container.querySelector(".nse-control-scrolling-image");
    expect(box).not.toBeNull();
    expect(box?.classList.contains("nse-control-sizeable-image")).toBe(true);
  });

  it("NSEViewImage hands a horizontal swipe off to the carousel when not zoomed in", () => {
    const onSwipeNext = vi.fn();
    const onSwipePrev = vi.fn();
    const { container } = render(
      <NSEViewImage src="/x.png" alt="x" onSwipeNext={onSwipeNext} onSwipePrev={onSwipePrev} />
    );
    const wrapper = container.querySelector(".nse-control-view-image") as HTMLElement;
    expect(wrapper).not.toBeNull();

    // Swipe left (dx < -threshold) → next image.
    fireEvent.pointerDown(wrapper, { pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerUp(wrapper, { pointerId: 1, clientX: 110, clientY: 104 });
    expect(onSwipeNext).toHaveBeenCalledTimes(1);
    expect(onSwipePrev).not.toHaveBeenCalled();

    // Swipe right → previous image.
    fireEvent.pointerDown(wrapper, { pointerId: 2, clientX: 110, clientY: 100 });
    fireEvent.pointerUp(wrapper, { pointerId: 2, clientX: 205, clientY: 103 });
    expect(onSwipePrev).toHaveBeenCalledTimes(1);
  });

  it("NSEViewImage ignores a multi-finger gesture (no accidental swipe)", () => {
    const onSwipeNext = vi.fn();
    const { container } = render(<NSEViewImage src="/x.png" alt="x" onSwipeNext={onSwipeNext} />);
    const wrapper = container.querySelector(".nse-control-view-image") as HTMLElement;
    fireEvent.pointerDown(wrapper, { pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerDown(wrapper, { pointerId: 2, clientX: 180, clientY: 100 });
    fireEvent.pointerUp(wrapper, { pointerId: 1, clientX: 100, clientY: 100 });
    expect(onSwipeNext).not.toHaveBeenCalled();
  });
});

describe("NSEDividerDrawer open/close animation", () => {
  it("keeps the panel mounted and flips data-open + aria-hidden when toggled", () => {
    const { container } = render(
      <NSEDividerDrawer title="Details" defaultOpen={false}>
        <p>Body</p>
      </NSEDividerDrawer>
    );
    const root = container.querySelector(".nse-container-divider-drawer") as HTMLElement;
    const panel = container.querySelector(".nse-container-divider-drawer-panel") as HTMLElement;
    // keepMounted defaults true → the panel exists even while collapsed (so the grid-rows
    // transition has something to animate, instead of popping in/out).
    expect(panel).not.toBeNull();
    expect(root.getAttribute("data-open")).toBe("false");
    expect(panel.getAttribute("aria-hidden")).toBe("true");

    // Toggle via the disclosure arrow.
    const arrow = container.querySelector(".nse-container-divider-drawer-arrow") as HTMLElement;
    fireEvent.click(arrow);

    expect(root.getAttribute("data-open")).toBe("true");
    expect(panel.getAttribute("aria-hidden")).toBe("false");
  });
});

describe("NSEToolbar fadeOnKeyboard", () => {
  it("does not add the fade class for a non-text focus when enabled", () => {
    const { container } = render(
      <NSEToolbar composition="children" fadeOnKeyboard>
        <button type="button">Action</button>
      </NSEToolbar>
    );
    const toolbar = container.querySelector(".nse-control-toolbar") as HTMLElement;
    expect(toolbar.getAttribute("data-fade-on-keyboard")).toBe("true");

    const button = container.querySelector("button") as HTMLButtonElement;
    act(() => {
      button.focus();
      fireEvent.focusIn(button);
    });
    expect(toolbar.classList.contains("nse-control-toolbar-fade-in")).toBe(false);
  });

  it("re-fades while a text field is focused, then clears when focus leaves", () => {
    const { container } = render(
      <div>
        <NSEToolbar composition="children" fadeOnKeyboard>
          <button type="button">Action</button>
        </NSEToolbar>
        <input type="text" aria-label="entry" />
      </div>
    );
    const toolbar = container.querySelector(".nse-control-toolbar") as HTMLElement;
    const field = container.querySelector("input") as HTMLInputElement;

    act(() => {
      field.focus();
      fireEvent.focusIn(field, { target: field });
    });
    expect(toolbar.classList.contains("nse-control-toolbar-fade-in")).toBe(true);
  });

  it("stays inert when fadeOnKeyboard is off", () => {
    const { container } = render(
      <NSEToolbar composition="children">
        <input type="text" aria-label="entry" />
      </NSEToolbar>
    );
    const toolbar = container.querySelector(".nse-control-toolbar") as HTMLElement;
    expect(toolbar.getAttribute("data-fade-on-keyboard")).toBeNull();
    const field = container.querySelector("input") as HTMLInputElement;
    act(() => {
      field.focus();
      fireEvent.focusIn(field, { target: field });
    });
    expect(toolbar.classList.contains("nse-control-toolbar-fade-in")).toBe(false);
  });
});
