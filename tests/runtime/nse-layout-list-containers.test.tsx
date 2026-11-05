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
import { rubberBandOffset } from "../../src/NSE/Scroll";
import {
  NSEConfirmPrompt,
  NSEDialog,
  NSESlidingPane,
  NSESlidingPanes,
  NSESlidingView,
  NSEToaster
} from "../../src/NSE/Containers";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NSE scroll primitives", () => {






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

  it("renders dialog and sliding view markup", () => {
    const markup = renderToStaticMarkup(
      <>
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
      </>
    );

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
});
