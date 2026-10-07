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
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NSEFit,
  NSEFlex,
  NSEInline,
  NSEOrdered,
  NSESpacer,
  NSEStack
} from "../../src/NSE/Layout";
import {
  computeNSEVirtualWindow,
  NSEList,
  NSEListRow,
  NSESwipeableItem,
  NSEVirtualList,
  useNSEPageWindow,
  type NSEListSelectionChange
} from "../../src/NSE/List";
import { rubberBandOffset } from "../../src/NSE/Scroll";
import {
  NSEConfirmPrompt,
  NSEDialog,
  NSEDividerDrawer,
  NSEPane,
  NSERowGroup,
  NSESlidingPane,
  NSESlidingPanes,
  NSESlidingView,
  NSEToaster
} from "../../src/NSE/Containers";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NSE layout primitives", () => {
  it("renders flex, stack, inline, fit, spacer, and ordered children with stable data contracts", () => {
    const orderedMarkup = renderToStaticMarkup(
      <NSEOrdered gap={4}>
        <span data-nse-order={20}>Second</span>
        <span data-nse-order={10}>First</span>
        <span hidden data-nse-order={0}>Hidden</span>
      </NSEOrdered>
    );

    expect(orderedMarkup.indexOf("First")).toBeLessThan(orderedMarkup.indexOf("Second"));
    expect(orderedMarkup).not.toContain("Hidden");
    expect(orderedMarkup).toContain("data-nse-layout=\"ordered\"");
    expect(orderedMarkup).toContain("data-nse-order=\"first\"");
    expect(orderedMarkup).toContain("data-nse-order=\"last\"");
    expect(orderedMarkup).toContain("data-nse-sort-order=\"10\"");
    expect(orderedMarkup).toContain("data-source-index=\"1\"");

    const layoutMarkup = renderToStaticMarkup(
      <NSEFlex direction="column" align="stretch" gap={12} fill>
        <NSEStack dividers>
          <span>Top</span>
          <span>Bottom</span>
        </NSEStack>
        <NSEInline scroll>
          <span>Chip</span>
          <NSESpacer axis="inline" min={16} />
        </NSEInline>
        <NSEFit mode="contain" aspectRatio="16 / 9">
          Preview
        </NSEFit>
      </NSEFlex>
    );

    expect(layoutMarkup).toContain("nse-layout-flex");
    expect(layoutMarkup).toContain("data-nse-layout=\"flex\"");
    expect(layoutMarkup).toContain("data-nse-layout=\"stack\"");
    expect(layoutMarkup).toContain("data-nse-layout=\"inline\"");
    expect(layoutMarkup).toContain("data-nse-layout=\"fit\"");
    expect(layoutMarkup).toContain("data-nse-layout=\"spacer\"");
    expect(layoutMarkup).toContain("data-direction=\"column\"");
    expect(layoutMarkup).toContain("nse-layout-stack-divider");
    expect(layoutMarkup).toContain("data-scroll=\"true\"");
    expect(layoutMarkup).toContain("data-axis=\"inline\"");
    expect(layoutMarkup).toContain("data-mode=\"contain\"");
  });
});

describe("NSE list primitives", () => {
  it("keeps row selection state in list context", () => {
    const changes: NSEListSelectionChange[] = [];

    render(
      <NSEList mode="multiple" defaultSelectedKeys={["notes"]} onSelectionChange={(change) => changes.push(change)}>
        <NSEListRow itemKey="mail" title="Mail" />
        <NSEListRow itemKey="notes" title="Notes" />
      </NSEList>
    );

    const mail = screen.getByRole("option", { name: "Mail" });
    const notes = screen.getByRole("option", { name: "Notes" });

    expect(mail.getAttribute("aria-selected")).toBe("false");
    expect(notes.getAttribute("aria-selected")).toBe("true");

    fireEvent.click(mail);
    expect(changes.at(-1)?.selectedKeys).toEqual(new Set(["notes", "mail"]));

    fireEvent.keyDown(notes, { key: " " });
    expect(changes.at(-1)?.selectedKeys).toEqual(new Set(["mail"]));
  });

  it("exposes a stable non-virtual page window hook", () => {
    const pageChanges = vi.fn();

    function Harness() {
      const windowState = useNSEPageWindow(["alpha", "beta", "gamma", "delta", "epsilon"], {
        pageSize: 2,
        defaultPageIndex: 1,
        onPageChange: pageChanges
      });

      return (
        <div>
          <output data-testid="window" data-start={windowState.startIndex} data-end={windowState.endIndex}>
            {windowState.windowItems.map(({ item }) => item).join(",")}
          </output>
          <button type="button" onClick={windowState.nextPage}>Next</button>
          <button type="button" onClick={windowState.firstPage}>First</button>
        </div>
      );
    }

    render(<Harness />);

    const output = screen.getByTestId("window");
    expect(output.textContent).toBe("gamma,delta");
    expect(output.getAttribute("data-start")).toBe("2");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(output.textContent).toBe("epsilon");
    expect(pageChanges).toHaveBeenLastCalledWith(expect.objectContaining({
      pageIndex: 2,
      startIndex: 4,
      endIndex: 5
    }));

    fireEvent.click(screen.getByRole("button", { name: "First" }));
    expect(output.textContent).toBe("alpha,beta");
  });

  it("keeps NSEList item rendering paged without virtualization offsets", () => {
    render(
      <NSEList
        items={["one", "two", "three"]}
        pageWindow={{ pageSize: 2, defaultPageIndex: 1 }}
        getKey={(item) => item}
        renderItem={(item) => <NSEListRow itemKey={item} title={item} />}
      />
    );

    expect(screen.queryByText("one")).toBeNull();
    expect(screen.getByText("three").textContent).toBe("three");
    expect(screen.getByRole("list").getAttribute("data-window-start")).toBe("2");
  });

  it("renders swipeable rows with action rails", () => {
    const archive = vi.fn();

    render(
      <NSESwipeableItem trailingActions={[{ id: "archive", label: "Archive", onPress: archive }]} open="trailing">
        <NSEListRow title="Message" />
      </NSESwipeableItem>
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(archive).toHaveBeenCalledTimes(1);
  });

  it("windows the rendered rows around the viewport", () => {
    // At the top: only the visible page plus lookAhead pages of overbuffer are rendered.
    const top = computeNSEVirtualWindow({ rowCount: 1000, rowHeight: 40, viewportHeight: 400, scrollTop: 0, pageSize: 10, lookAhead: 2 });
    expect(top.startIndex).toBe(0);
    expect(top.endIndex).toBe(30); // 1 visible page (rows 0–9) + 2 lookAhead pages
    expect(top.offsetY).toBe(0);
    expect(top.totalHeight).toBe(40000);
    expect(top.pageCount).toBe(100);

    // Scrolled into the middle: the window follows and the strip offset snaps to a page boundary.
    const mid = computeNSEVirtualWindow({ rowCount: 1000, rowHeight: 40, viewportHeight: 400, scrollTop: 4000, pageSize: 10, lookAhead: 2 });
    expect(mid.startIndex).toBe(80);
    expect(mid.endIndex).toBe(130);
    expect(mid.offsetY).toBe(3200);

    // Empty list and over-scroll are clamped, not thrown.
    expect(computeNSEVirtualWindow({ rowCount: 0, rowHeight: 40, viewportHeight: 400, scrollTop: 0 })).toMatchObject({ startIndex: 0, endIndex: 0, totalHeight: 0 });
    expect(computeNSEVirtualWindow({ rowCount: 50, rowHeight: 40, viewportHeight: 400, scrollTop: 999999, pageSize: 10, lookAhead: 0 }).endIndex).toBe(50);
  });

  it("renders only a small window of NSEVirtualList rows, not every row", () => {
    render(
      <NSEVirtualList
        rowCount={5000}
        rowHeight={32}
        pageSize={10}
        lookAhead={2}
        getKey={(_, index) => `row-${index}`}
        renderRow={({ index }) => <span>Row {index}</span>}
      />
    );

    const list = screen.getByRole("list");
    // The full scroll height is present for the scrollbar...
    expect(list.querySelector(".nse-virtual-list-sizer")?.getAttribute("style")).toContain("160000px");
    // ...but only a windowed handful of rows is actually in the DOM (not 5000).
    const rendered = list.querySelectorAll(".nse-virtual-list-row");
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(60);
    expect(screen.getByText("Row 0")).not.toBeNull();
    expect(screen.queryByText("Row 4999")).toBeNull();
  });

  it("damps rubber-band overscroll logarithmically (sign-preserving, sub-linear)", () => {
    expect(rubberBandOffset(0, 300)).toBe(0);
    expect(rubberBandOffset(300, 0)).toBe(0); // no dimension → no offset

    const pull = rubberBandOffset(300, 300);
    // 300 * 0.55 * log10(2) ≈ 49.67
    expect(pull).toBeCloseTo(49.67, 1);

    // Sign-preserving and symmetric.
    expect(rubberBandOffset(-300, 300)).toBeCloseTo(-pull, 5);

    // Pulling twice as far yields more offset, but less than double (logarithmic resistance).
    const farther = rubberBandOffset(600, 300);
    expect(farther).toBeGreaterThan(pull);
    expect(farther).toBeLessThan(pull * 2);
  });
});

describe("NSE containers", () => {
  function installPointerCaptureMocks() {
    const prototype = HTMLElement.prototype as HTMLElement & {
      setPointerCapture?: (pointerId: number) => void;
      releasePointerCapture?: (pointerId: number) => void;
      hasPointerCapture?: (pointerId: number) => boolean;
    };
    const originals = {
      setPointerCapture: prototype.setPointerCapture,
      releasePointerCapture: prototype.releasePointerCapture,
      hasPointerCapture: prototype.hasPointerCapture
    };

    prototype.setPointerCapture = vi.fn();
    prototype.releasePointerCapture = vi.fn();
    prototype.hasPointerCapture = vi.fn(() => true);

    return () => {
      if (originals.setPointerCapture) prototype.setPointerCapture = originals.setPointerCapture;
      else delete prototype.setPointerCapture;
      if (originals.releasePointerCapture) prototype.releasePointerCapture = originals.releasePointerCapture;
      else delete prototype.releasePointerCapture;
      if (originals.hasPointerCapture) prototype.hasPointerCapture = originals.hasPointerCapture;
      else delete prototype.hasPointerCapture;
    };
  }

  it("renders pane, row group, dialog, divider drawer, and sliding view markup", () => {
    const markup = renderToStaticMarkup(
      <NSEPane title="Inspector" subtitle="Details">
        <NSERowGroup title="Rows" caption="Grouped controls">
          <NSEDividerDrawer title="Sources" defaultOpen>
            <span>Source panel</span>
          </NSEDividerDrawer>
        </NSERowGroup>
        <NSESlidingView
          controls
          views={[
            { key: "summary", label: "Summary", content: <span>Summary pane</span> },
            { key: "details", label: "Details", content: <span>Details pane</span> }
          ]}
        />
        <NSEDialog title="Ready" description="Dialog description">
          Dialog body
        </NSEDialog>
      </NSEPane>
    );

    expect(markup).toContain("nse-container-pane");
    expect(markup).toContain("nse-container-row-group");
    expect(markup).toContain("nse-container-divider-drawer");
    expect(markup).toContain("role=\"tablist\"");
    expect(markup).toContain("role=\"dialog\"");
  });

  it("confirms prompts and dismisses toasts through NSE controls", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const onDismiss = vi.fn();

    render(
      <>
        <NSEConfirmPrompt
          open
          portal={false}
          title="Delete item?"
          message="This action cannot be undone."
          confirmLabel="Delete"
          onConfirm={onConfirm}
          onOpenChange={onOpenChange}
        />
        <NSEToaster
          toasts={[{ id: "saved", title: "Saved", message: "Changes stored.", tone: "success" }]}
          onDismiss={onDismiss}
        />
      </>
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(onDismiss).toHaveBeenCalledWith("saved");
  });

  it("supports SlidingPane peek, multi-view data, and drag dismissal", () => {
    const restorePointerCapture = installPointerCaptureMocks();
    const onOpenChange = vi.fn();

    try {
      const { container } = render(
        <NSESlidingPane
          title="Details"
          open
          onOpenChange={onOpenChange}
          placement="trailing"
          peekWidth={48}
          dismissDistance={60}
          multiView
          multiViewMinWidth={720}
        >
          Sliding content
        </NSESlidingPane>
      );

      const pane = container.querySelector(".nse-container-sliding-pane") as HTMLElement;
      expect(pane.getAttribute("data-open")).toBe("true");
      expect(pane.getAttribute("data-multi-view")).toBe("true");
      expect(pane.getAttribute("data-multi-view-min-width")).toBe("720");
      expect(pane.style.getPropertyValue("--nse-sliding-pane-peek")).toBe("48px");

      fireEvent.pointerDown(pane, { pointerId: 1, clientX: 100 });
      expect(pane.getAttribute("data-dragging")).toBe("true");
      fireEvent.pointerMove(pane, { pointerId: 1, clientX: 150 });
      expect(pane.style.getPropertyValue("--nse-sliding-pane-drag")).toBe("50px");
      fireEvent.pointerUp(pane, { pointerId: 1, clientX: 170 });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    } finally {
      restorePointerCapture();
    }
  });

  it("connects NSESlidingPanes: prior panes collapse to peek strips and selecting one expands it", () => {
    const onSelect = vi.fn();
    render(
      <NSESlidingPanes
        defaultSelectedKey="list"
        onSelectedKeyChange={onSelect}
        views={[
          { key: "folders", label: "Folders", content: <div>Folders body</div> },
          { key: "list", label: "List", content: <div>List body</div> },
          { key: "message", label: "Message", flex: true, content: <div>Message body</div> }
        ]}
      />
    );

    // jsdom width is 0 → multi-view: the pane before the selected "list" collapses to a peek button.
    const folders = screen.getByRole("button", { name: "Folders" });
    expect(folders.getAttribute("data-collapsed")).toBe("true");
    // The flexed last pane is visible and not collapsed.
    expect(screen.getByText("Message body")).not.toBeNull();

    // Selecting the collapsed pane slides it open (it is no longer a collapsed peek button).
    fireEvent.click(folders);
    expect(onSelect).toHaveBeenCalledWith("folders");
    expect(screen.queryByRole("button", { name: "Folders" })).toBeNull();
  });

  it("supports an inline ConfirmPrompt and fly-in animated dialogs/toasts (NSE container classes)", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    // Inline (unscrimmed) ConfirmPrompt — no modal layer.
    const inlineRender = render(
      <NSEConfirmPrompt inline title="Discard draft?" message="This cannot be undone." onConfirm={onConfirm} onCancel={onCancel} />
    );
    expect(inlineRender.container.querySelector(".nse-container-modal-layer")).toBeNull();
    expect(inlineRender.container.querySelector(".nse-container-confirm-inline")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    inlineRender.unmount();

    // Modal ConfirmPrompt flies in: rise-in shell over a fading scrim (local NSE container classes).
    const modalRender = render(<NSEConfirmPrompt open title="Delete?" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(document.querySelector(".nse-container-modal-layer.nse-container-fade-in")).not.toBeNull();
    expect(document.querySelector(".nse-container-modal-shell.nse-container-rise-in")).not.toBeNull();
    modalRender.unmount();

    // Toasts fly in from their screen edge.
    render(<NSEToaster position="bottom-center" toasts={[{ id: "t1", message: "Saved" }]} />);
    expect(document.querySelector(".nse-container-toast.nse-container-fly-in-bottom")).not.toBeNull();
  });

  it("frames NSERowGroup with guide-line rails by default, opt-out via rails={false}", () => {
    const railed = render(
      <NSERowGroup title="A/V Options">
        <div>Sound</div>
        <div>Video</div>
      </NSERowGroup>
    );
    expect(railed.container.querySelector(".nse-container-row-group")?.getAttribute("data-rails")).toBe("true");
    railed.unmount();

    const plain = render(<NSERowGroup title="A/V Options" rails={false}><div>Sound</div></NSERowGroup>);
    expect(plain.container.querySelector(".nse-container-row-group")?.getAttribute("data-rails")).toBe("false");
  });
});
