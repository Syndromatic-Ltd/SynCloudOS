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
import React, { useState, useSyncExternalStore } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SynCloudOSAppInfo } from "../../src/SynCloudOS/AppInfo/appInfoTypes";
import { NSEAlertBackdrop } from "../../src/NSE/Components/NSEAlertBackdrop";
import { NSEMenu } from "../../src/NSE/Menus";
import { NSEStandaloneControlHost } from "../../src/NSE/Overlays";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { WebspringQuickSwitchView } from "../../src/Webspring/WebspringQuickSwitchView";
import { createTestRuntime } from "./helpers";
import { NSETextView } from "../../src/NSE/TextEditing/NSETextView";
import { currentTextDocumentFixture } from "./fixtures/currentTextDocument";
import { createStaticPresentationPort } from "../fixtures/presentationTraits";


afterEach(cleanup);

function app(id: string, displayName: string, disabled = false) {
  return {
    id,
    displayName,
    shortName: displayName,
    packageName: `com.test.${id}`,
    route: `/${id}`,
    icon: { src: `/icons/${id}.png` },
    notifications: { badgeCount: 0 },
    isDisabled: disabled,
  } as unknown as SynCloudOSAppInfo;
}

describe("command, focus, undo, and overlay accessibility", () => {
  it("navigates a menu, skips disabled items, enters a submenu, dispatches, and restores its trigger", async () => {
    const onSelect = vi.fn();
    render(
      <NSEStandaloneControlHost document={document} window={window} presentation={createStaticPresentationPort({ width: 1024, height: 768 })}>
        <NSEMenu
          label="Actions"
          items={[
            { value: "disabled", label: "Disabled", disabled: true },
            { value: "share", label: "Share", children: [{ value: "mail", label: "Mail" }] },
          ]}
          onSelect={onSelect}
        />
      </NSEStandaloneControlHost>,
    );
    const trigger = screen.getByRole("button", { name: "Actions" });
    fireEvent.click(trigger);
    const menu = await screen.findByRole("menu");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: /Share/ })));
    fireEvent.keyDown(menu, { key: "ArrowRight" });
    const mail = await screen.findByRole("menuitem", { name: "Mail" });
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(mail));
    fireEvent.keyDown(menu, { key: "Enter" });
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("mail"));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("contains modal keyboard focus, handles cancel locally, and restores the opener", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <>
        <button onClick={() => setOpen(true)}>Open alert</button>
        {open ? <NSEAlertBackdrop onSafeDismiss={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Confirm action">
            <button>Cancel</button><button>Continue</button>
          </div>
        </NSEAlertBackdrop> : null}
      </>;
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open alert" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Confirm action" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const proceed = screen.getByRole("button", { name: "Continue" });
    proceed.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it("navigates and cancels QuickSwitch inside its popover scope, restoring the prior responder", async () => {
    const runtime = createTestRuntime();
    runtime.responders.register({ id: "quickswitch:trigger", kind: "control", parentId: "webspring", scopeId: "root" });
    runtime.focus.requestFocus("quickswitch:trigger");
    const onClose = vi.fn();
    const apps = [app("about", "About"), app("archive", "Archive", true), app("studio", "Studio")];
    const view = render(<SynCloudOSProvider runtime={runtime}>
      <WebspringQuickSwitchView open apps={apps} lifecycle={{ about: "registered", archive: "disabled", studio: "registered" }} openAppIds={[]} onClose={onClose} />
    </SynCloudOSProvider>);
    const dialog = screen.getByRole("dialog", { name: "QuickSwitch" });
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByRole("option", { name: /Studio/ }).getAttribute("aria-selected")).toBe("true"));
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    view.rerender(<SynCloudOSProvider runtime={runtime}>
      <WebspringQuickSwitchView open={false} apps={apps} lifecycle={{ about: "registered", archive: "disabled", studio: "registered" }} openAppIds={[]} onClose={onClose} />
    </SynCloudOSProvider>);
    await waitFor(() => expect(runtime.focus.getFocusedResponderId()).toBe("quickswitch:trigger"));
  });

  it("exposes current dynamic document history names and preserves the text control focus", async () => {
    const f = await currentTextDocumentFixture("One");
    try {
      // Application test controls use semantic commands; NSETextView owns no toolbar.
      function Controls() {
        const undoTitle = useSyncExternalStore(f.history.subscribe, () => f.history.undoTitle ?? "Undo");
        const redoTitle = useSyncExternalStore(f.history.subscribe, () => f.history.redoTitle ?? "Redo");
        const canUndo = useSyncExternalStore(f.history.subscribe, () => f.history.canUndo);
        const canRedo = useSyncExternalStore(f.history.subscribe, () => f.history.canRedo);
        return <>
          <button disabled={!canUndo} onMouseDown={event => event.preventDefault()}
            onClick={() => { void f.runtime.commands.dispatch("text.undo"); }}>{undoTitle}</button>
          <button disabled={!canRedo} onMouseDown={event => event.preventDefault()}
            onClick={() => { void f.runtime.commands.dispatch("text.redo"); }}>{redoTitle}</button>
        </>;
      }
      const view = render(<>
        <div onFocus={() => f.runtime.focus.requestFocus(f.responderId)}><NSETextView session={f.session} label="Note" /></div>
        <Controls />
      </>);
      const textbox = screen.getByRole("textbox");
      textbox.focus();
      f.session.select(3); f.session.insertText(" two");
      const undo = await screen.findByRole("button", { name: "Undo Typing" });
      fireEvent.mouseDown(undo); fireEvent.click(undo);
      await waitFor(() => expect(textbox.textContent).toBe("One"));
      expect((screen.getByRole("button", { name: "Redo Typing" }) as HTMLButtonElement).disabled).toBe(false);
      expect(f.runtime.focus.getFocusedResponderId()).toBe(f.responderId);
      expect(document.activeElement).toBe(textbox);
      const redo = screen.getByRole("button", { name: "Redo Typing" });
      fireEvent.mouseDown(redo); fireEvent.click(redo);
      await waitFor(() => expect(textbox.textContent).toBe("One two"));
      expect(document.activeElement).toBe(textbox);
      view.unmount();
    } finally { await f.dispose(); }
  });
});
