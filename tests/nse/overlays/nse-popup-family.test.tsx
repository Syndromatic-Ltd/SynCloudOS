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
import { installNSEScrollIntoViewFixture } from "../fixtures/browser";
installNSEScrollIntoViewFixture();
import React, { useMemo, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEOverlayProvider, NSEActionSheet, NSEListboxPopup, NSEPopover, NSEPopup } from "../../../src/NSE/Overlays";
import { createStaticPresentationPort } from "../../fixtures/presentationTraits";
import { NSEUtilityPanel } from "../../../src/NSE/Overlays/NSEUtilityPanel";

const workAreaSnapshot = Object.freeze({
  width: 1280,
  height: 720,
  safeArea: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }),
});
const desktopPresentation = createStaticPresentationPort({ width: 1280, height: 720 });
const mobilePresentation = createStaticPresentationPort({ width: 390, height: 640 });

afterEach(() => cleanup());

function OverlayHarness({ children, mode = "desktop", onWrapFocusScope }: { readonly children: React.ReactNode; readonly mode?: "desktop" | "mobile"; readonly onWrapFocusScope?: (options: unknown) => void }) {
  const runtimePort = useMemo(() => ({
    runtimeId: "runtime:popup-family",
    signal: new AbortController().signal,
    environment: {
      browser: { getDocument: () => document, getWindow: () => window },
      workArea: {
        getSnapshot: () => workAreaSnapshot,
        subscribe: () => () => undefined,
      },
      visualViewport: { getSnapshot: () => null, subscribe: () => () => undefined },
      presentation: mode === "mobile" ? mobilePresentation : desktopPresentation,
      setTimeout: (callback: () => void) => { callback(); return 0; },
      clearTimeout: () => undefined,
    },
    restoreFocus: (_responderId: string, anchor: HTMLElement | null) => anchor?.focus(),
    reportPlacementFailure: vi.fn(),
    wrapFocusScope: (options: unknown, node: React.ReactNode) => { onWrapFocusScope?.(options); return node; },
  }), [mode, onWrapFocusScope]);
  return <NSEOverlayProvider runtimePort={runtimePort}>{children}</NSEOverlayProvider>;
}

function PopupFixture({ defaultOpen = false }: { readonly defaultOpen?: boolean }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  return (
    <OverlayHarness>
      <button ref={setAnchor} type="button">Open filters</button>
      <NSEPopup id="filters" defaultOpen={defaultOpen} anchor={anchor} parentResponderId="workspace">
        <button type="button">Apply filters</button>
      </NSEPopup>
    </OverlayHarness>
  );
}

describe("NSE popup family", () => {
  it("lets content own the paint without losing popup semantics", async () => {
    render(<OverlayHarness><NSEPopup open modal chrome="content" parentResponderId="workspace" aria-label="Paper editor">Paper</NSEPopup></OverlayHarness>);
    const popup = await screen.findByRole("dialog", { name: "Paper editor" });
    expect(popup.getAttribute("aria-modal")).toBe("true");
    expect(popup.getAttribute("data-nse-overlay-kind")).toBe("action-sheet");
    expect(popup.classList.contains("nse-overlay-popup--content")).toBe(true);
    expect(popup.classList.contains("nse-overlay-popup--action-sheet")).toBe(false);
  });

  it("keeps an editor open while its utility panel is focused or clicked, but still dismisses outside", async () => {
    function Fixture() {
      const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
      const [open, setOpen] = useState(true);
      const [panel, setPanel] = useState(false);
      return <OverlayHarness>
        <button>Unrelated content</button>
        <NSEPopup open={open} modal parentResponderId="workspace" aria-label="Editor" onOpenChange={setOpen}>
          <button ref={setAnchor} onClick={() => setPanel(true)}>Cover colour</button>
        </NSEPopup>
        <NSEUtilityPanel id="colours" title="Colours" open={panel} anchor={anchor} onClose={() => setPanel(false)}>
          <input aria-label="Inspector hex" />
        </NSEUtilityPanel>
      </OverlayHarness>;
    }
    render(<Fixture />);
    fireEvent.click(await screen.findByRole("button", { name: "Cover colour" }));
    const hex = await screen.findByRole("textbox", { name: "Inspector hex" });
    fireEvent.focusIn(hex);
    expect(screen.queryByRole("dialog", { name: "Editor" })).not.toBeNull();
    fireEvent.pointerDown(hex, { button: 0 });
    expect(screen.queryByRole("dialog", { name: "Editor" })).not.toBeNull();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Unrelated content" }), { button: 0 });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Editor" })).toBeNull());
  });

  it("forwards safe generic DOM and accessibility props through the canonical popup", async () => {
    render(
      <OverlayHarness>
        <NSEPopup
          id="popup"
          open
          anchor={null}
          parentResponderId="workspace"
          role="alertdialog"
          aria-label="Popup"
          data-testid="popup"
          data-caller-token="preserved"
          tabIndex={3}
        >Content</NSEPopup>
      </OverlayHarness>,
    );

    const popup = await screen.findByTestId("popup");
    expect(popup.getAttribute("role")).toBe("alertdialog");
    expect(popup.getAttribute("aria-label")).toBe("Popup");
    expect(popup.getAttribute("data-caller-token")).toBe("preserved");
    expect(popup.tabIndex).toBe(3);
  });

  it("keeps controlled/uncontrolled popup state in the overlay stack and restores the anchor on Escape", async () => {
    render(<PopupFixture defaultOpen />);
    const trigger = screen.getByRole("button", { name: "Open filters" });
    const popup = await screen.findByRole("dialog");
    expect(popup.getAttribute("data-nse-overlay-kind")).toBe("popover");
    expect(popup.hasAttribute("aria-modal")).toBe(false);
    expect(document.querySelector('[data-nse-part="backdrop"]')).toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("keeps an explicitly modal popover anchored while applying modal focus ownership", async () => {
    const wrapped = vi.fn();
    function ModalPopoverFixture() {
      const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
      return (
        <OverlayHarness onWrapFocusScope={wrapped}>
          <button ref={setAnchor} type="button">Collections</button>
          <NSEPopup id="modal-popover" open anchor={anchor} parentResponderId="workspace" overlayKind="popover" modal presentation={{ mode: "anchored" }}>
            <button type="button">Choose collection</button>
          </NSEPopup>
        </OverlayHarness>
      );
    }
    render(<ModalPopoverFixture />);
    const popup = await screen.findByRole("dialog");
    expect(popup.getAttribute("data-nse-overlay-kind")).toBe("popover");
    expect(popup.getAttribute("data-nse-presentation")).toBe("anchored");
    expect(popup.getAttribute("aria-modal")).toBe("true");
    expect(document.querySelector('[data-nse-part="backdrop"]')).not.toBeNull();
    expect(wrapped).toHaveBeenCalledWith(expect.objectContaining({ kind: "popover", modal: true, trapFocus: true }));
  });

  it("keeps a controlled popup registered when its owner refuses a close request", async () => {
    const onOpenChange = vi.fn();
    render(
      <OverlayHarness>
        <NSEPopup id="controlled-refusal" open anchor={null} parentResponderId="workspace" onOpenChange={onOpenChange}>
          Controlled content
        </NSEPopup>
      </OverlayHarness>,
    );
    expect(await screen.findByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledTimes(2));
  });

  it("dismisses only the listbox branch on selection and keeps listbox options native", async () => {
    function ListboxFixture() {
      const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
      const [open, setOpen] = useState(true);
      const selected = vi.fn();
      return (
        <OverlayHarness>
          <button ref={setAnchor} type="button">Choose density</button>
          <NSEListboxPopup
            id="density"
            open={open}
            anchor={anchor}
            parentResponderId="workspace"
            options={[{ id: "compact", label: "Compact" }, { id: "comfortable", label: "Comfortable" }]}
            onSelect={(option) => { selected(option); setOpen(false); }}
            onOpenChange={setOpen}
          />
          <output data-testid="selected">{selected.mock.calls.at(-1)?.[0]?.id ?? "none"}</output>
        </OverlayHarness>
      );
    }
    render(<ListboxFixture />);
    fireEvent.click(await screen.findByRole("option", { name: "Comfortable" }));
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });

  it("adapts an automatic compact popover to the sheet interaction boundary", async () => {
    const bridge = { open: vi.fn(), close: vi.fn() };
    function PopoverFixture() {
      const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
      return (
        <OverlayHarness mode="mobile">
          <button ref={setAnchor} type="button">Share</button>
          <NSEPopover
            id="share"
            open
            anchor={anchor}
            parentWindowControllerId="journal-window"
            parentResponderId="window:journal-window"
            windowBridge={bridge}
            onOpenChange={vi.fn()}
          >
            <button type="button">Copy link</button>
          </NSEPopover>
        </OverlayHarness>
      );
    }
    render(<PopoverFixture />);
    const sheet = await screen.findByRole("dialog");
    expect(sheet.getAttribute("data-nse-overlay-kind")).toBe("action-sheet");
    expect(bridge.open).toHaveBeenCalledWith(expect.objectContaining({ parentWindowControllerId: "journal-window", role: "sheet" }));
  });

  it("keeps action sheets modal without creating a second window registry", async () => {
    const onOpenChange = vi.fn();
    render(
      <OverlayHarness>
        <NSEActionSheet id="rename-sheet" open parentResponderId="workspace" onOpenChange={onOpenChange}>
          <button type="button">Rename</button>
        </NSEActionSheet>
      </OverlayHarness>,
    );
    const sheet = await screen.findByRole("dialog");
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    const backdrop = document.querySelector('[data-nse-part="backdrop"]');
    expect(backdrop?.getAttribute("aria-hidden")).toBe("true");
    fireEvent.pointerDown(backdrop!);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false, "outside-pointer"));
  });

  it("requests the canonical window sheet role when an action sheet has a window host", () => {
    const bridge = { open: vi.fn(), close: vi.fn() };
    render(
      <OverlayHarness>
        <NSEActionSheet
          id="hosted-action-sheet"
          open
          parentResponderId="workspace"
          parentWindowControllerId="window:document"
          windowBridge={bridge}
          onOpenChange={() => undefined}
        >Hosted sheet</NSEActionSheet>
      </OverlayHarness>,
    );

    expect(bridge.open).toHaveBeenCalledWith(expect.objectContaining({
      id: "hosted-action-sheet",
      role: "sheet",
      parentWindowControllerId: "window:document",
    }));
  });

  it("parents an overlay opened inside another overlay to it, in the stack and the focus-scope tree", async () => {
    const scopes: Array<{ readonly scopeId?: string; readonly parentScopeId?: string }> = [];
    function Nested() {
      const [sheetAnchor, setSheetAnchor] = useState<HTMLButtonElement | null>(null);
      const [wellAnchor, setWellAnchor] = useState<HTMLButtonElement | null>(null);
      const [panelOpen, setPanelOpen] = useState(true);
      return (
        <>
          <button ref={setSheetAnchor} type="button">New</button>
          <NSEPopup id="editor-sheet" open anchor={sheetAnchor} modal parentResponderId="workspace" aria-label="Editor">
            <button ref={setWellAnchor} type="button">Cover colour</button>
            <NSEPopover id="colour-panel" open={panelOpen} anchor={wellAnchor} parentResponderId="workspace" aria-label="Colours" onOpenChange={setPanelOpen}>
              <button type="button">Wheel</button>
            </NSEPopover>
          </NSEPopup>
        </>
      );
    }
    render(<OverlayHarness onWrapFocusScope={(options) => scopes.push(options as { scopeId?: string; parentScopeId?: string })}><Nested /></OverlayHarness>);

    await screen.findByRole("button", { name: "Wheel" });
    expect(scopes.find(({ scopeId }) => scopeId === "nse-overlay:colour-panel")?.parentScopeId).toBe("nse-overlay:editor-sheet");
    expect(scopes.find(({ scopeId }) => scopeId === "nse-overlay:editor-sheet")?.parentScopeId).toBeUndefined();

    // Focus moving into the child is not focus leaving the parent; Escape
    // closes the child first and leaves the sheet up.
    screen.getByRole("button", { name: "Wheel" }).focus();
    expect(screen.getByLabelText("Editor")).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Wheel" })).toBeNull());
    expect(screen.getByLabelText("Editor")).toBeTruthy();
  });
});
