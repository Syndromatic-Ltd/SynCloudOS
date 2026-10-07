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

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPortal } from "react-dom";
import React, { StrictMode } from "react";
import { FocusScope, ResponderScope, RuntimeInputBoundary, SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { createTestRuntime } from "./helpers";
import { registerNSEFocusOrigin } from "../../src/NSE/Focus";
import { registerNSEInspectorOrigin } from "../../src/NSE/Focus/focusOrigin";

afterEach(cleanup);

describe("focus scopes", () => {
  it("returns a dismissed inspector menu to its picker instead of jumping to the owning app", async () => {
    const runtime = createTestRuntime();
    runtime.responders.register({ id: "app", kind: "application", parentId: "runtime", scopeId: "root" });
    const ui = (open: boolean) => <SynCloudOSProvider runtime={runtime}>
      <ResponderScope responderId="editor" kind="control" parentResponderId="app" scopeId="root">
        <button>Cover well</button>
      </ResponderScope>
      {createPortal(<div data-syncloudos-runtime-owner={runtime.runtimeId} data-testid="inspector">
        <button>Model picker</button>
        {open && <FocusScope scopeId="model-menu" kind="popover" parentResponderId="editor"><button>HSB model</button></FocusScope>}
      </div>, document.body)}
    </SynCloudOSProvider>;
    const view = render(ui(false));
    const well = screen.getByRole("button", { name: "Cover well" });
    const picker = screen.getByRole("button", { name: "Model picker" });
    const release = registerNSEInspectorOrigin(screen.getByTestId("inspector"), well);
    runtime.focus.requestFocus("editor");
    picker.focus();
    view.rerender(ui(true));
    screen.getByRole("button", { name: "HSB model" }).focus();
    view.rerender(ui(false));
    await waitFor(() => expect(document.activeElement).toBe(picker));
    release();
  });

  it("can compose responder ownership into a single host without adding a layout box", () => {
    const runtime = createTestRuntime();
    runtime.responders.register({ id: "app", kind: "application", parentId: "runtime", scopeId: "root" });
    const focused = { calls: 0 };

    render(
      <SynCloudOSProvider runtime={runtime}>
        <RuntimeInputBoundary>
          <ResponderScope asChild responderId="host" kind="control" parentResponderId="app" scopeId="root">
            <section data-testid="host" onFocusCapture={() => { focused.calls += 1; }}><button>Child</button></section>
          </ResponderScope>
        </RuntimeInputBoundary>
      </SynCloudOSProvider>,
    );

    const host = screen.getByTestId("host");
    expect(host.dataset.syncloudosResponderId).toBe("host");
    expect(host.dataset.syncloudosRuntimeOwner).toBe(runtime.runtimeId);
    expect(host.parentElement?.dataset.syncloudosResponderId).toBeUndefined();
    fireEvent.focus(screen.getByRole("button", { name: "Child" }));
    expect(runtime.focus.getFocusedResponderId()).toBe("host");
    expect(focused.calls).toBe(1);
  });

  it("maps DOM focus to logical responders through a portal and restores on close", () => {
    const runtime = createTestRuntime();
    runtime.responders.register({ id: "app", kind: "application", parentId: "runtime", scopeId: "root" });
    const portal = document.createElement("div");
    document.body.append(portal);
    const view = render(
      <SynCloudOSProvider runtime={runtime}>
        <RuntimeInputBoundary>
          <ResponderScope responderId="trigger" kind="control" parentResponderId="app" scopeId="root">
            <button>Trigger</button>
          </ResponderScope>
        </RuntimeInputBoundary>
      </SynCloudOSProvider>,
    );
    screen.getByRole("button", { name: "Trigger" }).focus();
    view.rerender(
      <SynCloudOSProvider runtime={runtime}>
        <RuntimeInputBoundary>
          <ResponderScope responderId="trigger" kind="control" parentResponderId="app" scopeId="root">
            <button>Trigger</button>
          </ResponderScope>
          <FocusScope scopeId="menu:one" kind="menu" parentResponderId="trigger">
            {createPortal(
              <ResponderScope responderId="menu:item" kind="control" parentResponderId="trigger" scopeId="menu:one">
                <button>Portal item</button>
              </ResponderScope>,
              portal,
            )}
          </FocusScope>
        </RuntimeInputBoundary>
      </SynCloudOSProvider>,
    );
    screen.getByRole("button", { name: "Portal item" }).focus();
    expect(runtime.focus.getFocusedResponderId()).toBe("menu:item");
    view.rerender(
      <SynCloudOSProvider runtime={runtime}>
        <RuntimeInputBoundary>
          <ResponderScope responderId="trigger" kind="control" parentResponderId="app" scopeId="root"><button>Trigger</button></ResponderScope>
        </RuntimeInputBoundary>
      </SynCloudOSProvider>,
    );
    expect(runtime.focus.getFocusedResponderId()).toBe("trigger");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Trigger" }));
    portal.remove();
  });

  it("contains logical focus inside a modal and climbs to a live parent on restoration", () => {
    const runtime = createTestRuntime();
    runtime.responders.register({ id: "app", kind: "application", parentId: "runtime", scopeId: "root" });
    runtime.responders.register({ id: "outside", kind: "control", parentId: "app", scopeId: "root" });
    runtime.responders.register({ id: "modal:item", kind: "control", parentId: "app", scopeId: "modal:one" });
    runtime.focus.requestFocus("outside");
    const scope = runtime.focus.openScope({ id: "modal:one", kind: "modal", parentResponderId: "app", modal: true, trapFocus: true });
    expect(runtime.focus.requestFocus("outside")).toMatchObject({ status: "blocked" });
    expect(runtime.focus.requestFocus("modal:item")).toMatchObject({ status: "focused" });
    runtime.responders.remove("outside");
    expect(scope.close()).toMatchObject({ status: "closed", restoredResponderId: "app" });
  });

  it("allows nested modal descendants and closes only real descendants, not later siblings", () => {
    const runtime = createTestRuntime();
    runtime.responders.register({ id: "app", kind: "application", parentId: "runtime", scopeId: "root" });
    runtime.responders.register({ id: "modal:item", kind: "control", parentId: "app", scopeId: "modal:one" });
    runtime.responders.register({ id: "child:item", kind: "control", parentId: "modal:item", scopeId: "modal:child" });
    runtime.responders.register({ id: "sibling:item", kind: "control", parentId: "app", scopeId: "sibling" });
    runtime.focus.openScope({ id: "modal:one", kind: "modal", parentResponderId: "app", modal: true, trapFocus: true });
    const child = runtime.focus.openScope({ id: "modal:child", kind: "popover", parentScopeId: "modal:one", parentResponderId: "modal:item", modal: false, trapFocus: false });
    runtime.focus.openScope({ id: "sibling", kind: "popover", parentResponderId: "app", modal: false, trapFocus: false });

    expect(runtime.focus.requestFocus("child:item")).toMatchObject({ status: "focused" });
    expect(child.close({ restore: false })).toMatchObject({ status: "closed" });
    expect(runtime.focus.inspect().scopes.map(({ id }) => id)).toEqual(["modal:one", "sibling"]);
    expect(runtime.focus.requestFocus("sibling:item")).toMatchObject({ status: "blocked" });
  });

  it("moves DOM focus into a trapped modal and restores it after a rejected outside focus move", async () => {
    const runtime = createTestRuntime();
    runtime.responders.register({ id: "app", kind: "application", parentId: "runtime", scopeId: "root" });
    render(
      <SynCloudOSProvider runtime={runtime}>
        <RuntimeInputBoundary>
          <ResponderScope responderId="outside" kind="control" parentResponderId="app" scopeId="root"><button>Outside</button></ResponderScope>
          <FocusScope scopeId="modal:one" kind="modal" parentResponderId="app">
            <ResponderScope responderId="modal:item" kind="control" parentResponderId="app" scopeId="modal:one"><button>Inside</button></ResponderScope>
          </FocusScope>
        </RuntimeInputBoundary>
      </SynCloudOSProvider>,
    );
    const inside = screen.getByRole("button", { name: "Inside" });
    const outside = screen.getByRole("button", { name: "Outside", hidden: true });
    await waitFor(() => expect(document.activeElement).toBe(inside));
    outside.focus();
    expect(runtime.focus.getFocusedResponderId()).toBe("modal:item");
    expect(document.activeElement).toBe(inside);
  });

  it("returns focus from a modal opened by a menu command to the control that opened the menu", async () => {
    const runtime = createTestRuntime();
    runtime.responders.register({ id: "app", kind: "application", parentId: "runtime", scopeId: "root" });
    const tree = (menu: boolean, modal: boolean) => (
      <SynCloudOSProvider runtime={runtime}>
        <RuntimeInputBoundary>
          <ResponderScope responderId="app:content" kind="control" parentResponderId="app" scopeId="root">
            <button>First</button>
            <button>Opener</button>
          </ResponderScope>
          {menu ? <div data-testid="menu"><button>Row</button></div> : null}
          {modal ? (
            <FocusScope scopeId="modal:prefs" kind="modal" parentResponderId="app" modal trapFocus>
              <ResponderScope responderId="modal:item" kind="control" parentResponderId="app" scopeId="modal:prefs"><button>Inside</button></ResponderScope>
            </FocusScope>
          ) : null}
        </RuntimeInputBoundary>
      </SynCloudOSProvider>
    );
    const view = render(tree(true, false));
    const opener = screen.getByRole("button", { name: "Opener" });
    const release = registerNSEFocusOrigin(screen.getByTestId("menu"), opener);
    screen.getByRole("button", { name: "Row" }).focus();
    // The command opens its modal while the menu is still up; the menu closes after.
    view.rerender(tree(true, true));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Inside" })));
    release();
    view.rerender(tree(false, true));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Inside" }));
    view.rerender(tree(false, false));
    expect(document.activeElement).toBe(opener);
  });

  it("does not pull focus back when something outside the closing scope already holds it", async () => {
    const runtime = createTestRuntime();
    runtime.responders.register({ id: "app", kind: "application", parentId: "runtime", scopeId: "root" });
    const tree = (modal: boolean) => (
      <SynCloudOSProvider runtime={runtime}>
        <RuntimeInputBoundary>
          <ResponderScope responderId="app:content" kind="control" parentResponderId="app" scopeId="root">
            <button>First</button>
          </ResponderScope>
          <button>Elsewhere</button>
          {modal ? (
            <FocusScope scopeId="menu:one" kind="menu" parentResponderId="app">
              <ResponderScope responderId="menu:item" kind="control" parentResponderId="app" scopeId="menu:one"><button>Row</button></ResponderScope>
            </FocusScope>
          ) : null}
        </RuntimeInputBoundary>
      </SynCloudOSProvider>
    );
    const view = render(tree(true));
    screen.getByRole("button", { name: "Row" }).focus();
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    elsewhere.focus();
    view.rerender(tree(false));
    expect(document.activeElement).toBe(elsewhere);
  });

  it("does not recursively redirect a re-entrant outside focus event while trapping a modal", async () => {
    const runtime = createTestRuntime();
    runtime.responders.register({ id: "app", kind: "application", parentId: "runtime", scopeId: "root" });
    render(
      <SynCloudOSProvider runtime={runtime}>
        <RuntimeInputBoundary>
          <ResponderScope responderId="outside" kind="control" parentResponderId="app" scopeId="root"><button>Outside reentrant</button></ResponderScope>
          <FocusScope scopeId="modal:reentrant" kind="modal" parentResponderId="app">
            <ResponderScope responderId="modal:item" kind="control" parentResponderId="app" scopeId="modal:reentrant"><button>Inside reentrant</button></ResponderScope>
          </FocusScope>
        </RuntimeInputBoundary>
      </SynCloudOSProvider>,
    );
    const inside = screen.getByRole("button", { name: "Inside reentrant" });
    const outside = screen.getByRole("button", { name: "Outside reentrant", hidden: true });
    await waitFor(() => expect(document.activeElement).toBe(inside));
    const redirect = vi.fn(() => fireEvent.focusIn(outside));
    Object.defineProperty(inside, "focus", { configurable: true, value: redirect });

    expect(() => fireEvent.focusIn(outside)).not.toThrow();
    expect(redirect).toHaveBeenCalledOnce();
  });

  it("loops Tab in both directions and restores inert background state", async () => {
    const runtime = createTestRuntime();
    runtime.responders.register({ id: "app", kind: "application", parentId: "runtime", scopeId: "root" });
    const view = render(
      <SynCloudOSProvider runtime={runtime}>
        <div data-testid="background"><button>Outside loop</button></div>
        <FocusScope scopeId="modal:loop" kind="modal" parentResponderId="app">
          <button>First action</button><button>Last action</button>
        </FocusScope>
      </SynCloudOSProvider>,
    );
    const first = screen.getByRole("button", { name: "First action" });
    const last = screen.getByRole("button", { name: "Last action" });
    await waitFor(() => expect(document.activeElement).toBe(first));
    expect(screen.getByTestId("background").inert).toBe(true);
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    const background = screen.getByTestId("background");
    view.unmount();
    expect(background.inert).not.toBe(true);
    expect(background.hasAttribute("aria-hidden")).toBe(false);
  });

  it("releases modal-owned undo state without deleting a pre-existing owner", async () => {
    const runtime = createTestRuntime();
    runtime.responders.register({ id: "app", kind: "application", parentId: "runtime", scopeId: "root" });
    const owner = { kind: "modal" as const, id: "shared" };
    const existing = runtime.undo.create(owner);
    const view = render(
      <SynCloudOSProvider runtime={runtime}>
        <FocusScope scopeId="modal:shared" kind="modal" parentResponderId="app" undoOwner={owner}><button>Modal action</button></FocusScope>
      </SynCloudOSProvider>,
    );
    view.unmount();
    await waitFor(() => expect(runtime.undo.get(owner)).toBe(existing));

    const temporaryOwner = { kind: "modal" as const, id: "temporary" };
    const temporary = render(
      <SynCloudOSProvider runtime={runtime}>
        <FocusScope scopeId="modal:temporary" kind="modal" parentResponderId="app" undoOwner={temporaryOwner}><button>Temporary action</button></FocusScope>
      </SynCloudOSProvider>,
    );
    expect(runtime.undo.get(temporaryOwner)).not.toBeNull();
    temporary.unmount();
    await waitFor(() => expect(runtime.undo.get(temporaryOwner)).toBeNull());
  });

  it("can attach modal authority to an existing physical trap without inserting a competing wrapper", () => {
    const runtime = createTestRuntime();
    const view = render(
      <SynCloudOSProvider runtime={runtime}>
        <FocusScope asChild scopeId="modal:owned-trap" kind="modal" parentResponderId="runtime">
          <div role="dialog" aria-label="Owned trap"><button>Dismiss</button></div>
        </FocusScope>
      </SynCloudOSProvider>,
    );
    const dialog = screen.getByRole("dialog", { name: "Owned trap" });
    expect(dialog.getAttribute("data-syncloudos-focus-scope")).toBe("modal:owned-trap");
    expect(dialog.getAttribute("data-syncloudos-runtime-owner")).toBe(runtime.runtimeId);
    expect(view.container.firstElementChild).toBe(dialog);
  });

  it("commits modal authority in the layout phase and leaves no StrictMode replacement scope behind", () => {
    const runtime = createTestRuntime();
    runtime.responders.register({ id: "app", kind: "application", parentId: "runtime", scopeId: "root" });
    runtime.responders.register({ id: "outside", kind: "control", parentId: "app", scopeId: "root" });
    const view = render(
      <StrictMode>
        <SynCloudOSProvider runtime={runtime}>
          <FocusScope scopeId="modal:layout" kind="modal" parentResponderId="app"><button>Immediate modal</button></FocusScope>
        </SynCloudOSProvider>
      </StrictMode>,
    );
    expect(runtime.focus.inspect().scopes.map((scope) => scope.id)).toEqual(["modal:layout"]);
    expect(runtime.focus.requestFocus("outside")).toMatchObject({ status: "blocked" });
    view.unmount();
    expect(runtime.focus.inspect().scopes).toEqual([]);
  });

  it("opens a modal after its concurrently mounted parent responder is available", () => {
    const runtime = createTestRuntime();
    render(
      <SynCloudOSProvider runtime={runtime}>
        <ResponderScope responderId="mounted:app" kind="application" parentResponderId="runtime" scopeId="root">
          <FocusScope scopeId="modal:mounted-parent" kind="modal" parentResponderId="mounted:app"><button>Mounted modal</button></FocusScope>
        </ResponderScope>
      </SynCloudOSProvider>,
    );
    expect(runtime.focus.inspect().scopes.map((scope) => scope.id)).toEqual(["modal:mounted-parent"]);
  });

  it("keeps autofocus and containment inside the nearest nested runtime with duplicate scope IDs", async () => {
    const outer = createTestRuntime({ id: "focus-owner-outer" });
    const nested = createTestRuntime({ id: "focus-owner-nested" });
    outer.responders.register({ id: "outer-app", kind: "application", parentId: "runtime", scopeId: "root" });
    nested.responders.register({ id: "nested-app", kind: "application", parentId: "runtime", scopeId: "root" });
    const view = render(
      <SynCloudOSProvider runtime={outer}>
        <FocusScope scopeId="modal:duplicate" kind="menu" parentResponderId="outer-app" trapFocus={false}>
          <button>Outer same-ID action</button>
          <div data-syncloudos-runtime-owner={nested.runtimeId}>
            <SynCloudOSProvider runtime={nested}>
              <button>Nested outside action</button>
              <FocusScope scopeId="modal:duplicate" kind="modal" parentResponderId="nested-app">
                <button>Nested modal action</button>
              </FocusScope>
            </SynCloudOSProvider>
          </div>
        </FocusScope>
      </SynCloudOSProvider>,
    );

    const nestedAction = screen.getByText("Nested modal action").closest("button")!;
    await waitFor(() => expect(document.activeElement).toBe(nestedAction));
    expect(screen.getByText("Outer same-ID action").closest("button")!.hasAttribute("inert")).toBe(false);
    expect(screen.getByText("Outer same-ID action").closest("button")!.getAttribute("aria-hidden")).toBeNull();
    screen.getByText("Nested outside action").closest("button")!.focus();
    expect(document.activeElement).toBe(nestedAction);
    view.unmount();
    await Promise.all([outer.dispose("focus-scope-test"), nested.dispose("focus-scope-test")]);
  });

  it("lets sibling runtimes retain focus inside their independent trapped scopes", async () => {
    const first = createTestRuntime({ id: "focus-sibling-first" });
    const second = createTestRuntime({ id: "focus-sibling-second" });
    first.responders.register({ id: "first-app", kind: "application", parentId: "runtime", scopeId: "root" });
    second.responders.register({ id: "second-app", kind: "application", parentId: "runtime", scopeId: "root" });
    render(
      <>
        <div data-syncloudos-runtime-owner={first.runtimeId}>
          <SynCloudOSProvider runtime={first}>
            <FocusScope
              scopeId="modal:sibling"
              kind="modal"
              parentResponderId="first-app"
              externallyManagedInert
            >
              <button>First trapped action</button>
            </FocusScope>
          </SynCloudOSProvider>
        </div>
        <div data-syncloudos-runtime-owner={second.runtimeId}>
          <SynCloudOSProvider runtime={second}>
            <FocusScope
              scopeId="modal:sibling"
              kind="modal"
              parentResponderId="second-app"
              externallyManagedInert
            >
              <button>Second trapped action</button>
            </FocusScope>
          </SynCloudOSProvider>
        </div>
      </>,
    );
    const firstAction = screen.getByRole("button", { name: "First trapped action" });
    const secondAction = screen.getByRole("button", { name: "Second trapped action" });
    await waitFor(() => expect([firstAction, secondAction]).toContain(document.activeElement));

    firstAction.focus();
    expect(document.activeElement).toBe(firstAction);
    secondAction.focus();
    expect(document.activeElement).toBe(secondAction);
    await Promise.all([first.dispose("focus-scope-test"), second.dispose("focus-scope-test")]);
  });

  it("registers a concurrently mounted application/window ancestry before a portal modal commits", () => {
    const runtime = createTestRuntime();
    render(
      <SynCloudOSProvider runtime={runtime}>
        <ResponderScope responderId="mounted:application" kind="application" parentResponderId="runtime" scopeId="root">
          <ResponderScope responderId="mounted:window" kind="window" parentResponderId="mounted:application" scopeId="root">
            <FocusScope scopeId="modal:mounted-window" kind="modal" parentResponderId="mounted:window"><button>Window modal</button></FocusScope>
          </ResponderScope>
        </ResponderScope>
      </SynCloudOSProvider>,
    );
    expect(runtime.focus.inspect().scopes.map((scope) => scope.id)).toEqual(["modal:mounted-window"]);
  });
});
