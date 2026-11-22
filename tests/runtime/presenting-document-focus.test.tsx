// @vitest-environment jsdom
import React, { type PropsWithChildren } from "react";
import { createPortal } from "react-dom";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FocusScope, SynCloudOSProvider, useRuntimeNSEOverlayPort } from "../../src/SynCloudOSReact";
import { OverlayProvider, useNSEOverlayProvider } from "../../src/NSE/Overlays/OverlayProvider";
import { createOverlayManager } from "../../src/NSE/Overlays/overlayManager";
import { useNSEOverlay } from "../../src/NSE/Overlays/useNSEOverlay";
import { PresentingDocumentContext } from "../../src/NSE/Overlays/presentingDocument";
import { isWithinNSEFocusOrigin, registerNSEFocusOrigin, resolveNSEFocusReturnTarget } from "../../src/NSE/Focus/focusOrigin";
import { createRuntimeInputProtocol, focusScopeFromEvent } from "../../src/SynCloudOSReact/runtimeInputProtocol";
import { AppFocusScope } from "../../src/SynCloudOSReact/AppFocusScope";
import type { OverlayDismissReason } from "../../src/NSE/Overlays/overlayTypes";
import { createTestRuntime, mountTestSynWareRuntime, registerTestSynWare } from "./helpers";
import { createWindowTestDependencies, sheetWindow, standardWindow } from "../fixtures/windowTestDependencies";

const disposals: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  cleanup();
  for (const dispose of disposals.splice(0).reverse()) await dispose();
});

function childDocument() {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  disposals.push(() => frame.remove());
  return frame.contentDocument!;
}

function runtime() {
  const value = createTestRuntime();
  disposals.push(() => value.dispose());
  return value;
}

function RuntimeOverlays({ manager, children }: PropsWithChildren<{ manager: ReturnType<typeof createOverlayManager> }>) {
  const port = useRuntimeNSEOverlayPort();
  return <OverlayProvider runtimePort={port} manager={manager}>{children}</OverlayProvider>;
}

it("follows and restores a portalled focus origin from a different DOM realm", () => {
  const doc = childDocument();
  const root = doc.createElement("section");
  const trigger = doc.createElement("button");
  const popup = doc.createElement("section");
  const action = doc.createElement("button");
  root.append(trigger); popup.append(action); doc.body.append(root, popup);
  const release = registerNSEFocusOrigin(popup, trigger);
  disposals.push(release);
  expect(isWithinNSEFocusOrigin(root, action)).toBe(true);
  expect(resolveNSEFocusReturnTarget(action)).toBe(trigger);
});

it("retains foreign runtime and scope markers from cross-realm keyboard events", () => {
  const doc = childDocument();
  const target = doc.createElement("button");
  target.dataset.syncloudosRuntimeOwner = "runtime:foreign";
  target.dataset.syncloudosFocusScope = "foreign-scope";
  doc.body.append(target);
  const protocol = createRuntimeInputProtocol("runtime:local");
  let owned: boolean | undefined;
  let scope: string | undefined;
  target.addEventListener("keydown", event => {
    owned = protocol.owns(event);
    scope = focusScopeFromEvent(event);
  });
  fireEvent.keyDown(target, { key: "Tab" });
  expect(owned).toBe(false);
  expect(scope).toBe("foreign-scope");
});

it("traps and restores a kernel focus scope in its presenting document", async () => {
  const doc = childDocument();
  const rt = runtime();
  rt.responders.register({ id: "editor", kind: "control", parentId: "runtime", scopeId: "root" });
  const target = doc.createElement("button");
  target.dataset.syncloudosRuntimeOwner = rt.runtimeId;
  target.dataset.syncloudosResponderId = "editor";
  doc.body.append(target); target.focus(); rt.focus.requestFocus("editor");
  const ui = (open: boolean) => <SynCloudOSProvider runtime={rt}>
    <PresentingDocumentContext value={doc}>{open && createPortal(
      <FocusScope scopeId="child-modal" kind="modal" parentResponderId="editor">
        <button>First action</button><button>Last action</button>
      </FocusScope>, doc.body)}
    </PresentingDocumentContext>
  </SynCloudOSProvider>;
  const view = render(ui(true));
  const buttons = Array.from(doc.querySelectorAll("[data-syncloudos-focus-scope='child-modal'] button"));
  await waitFor(() => expect(doc.activeElement).toBe(buttons[0]));
  act(() => { (buttons[1] as HTMLButtonElement).focus(); });
  fireEvent.keyDown(buttons[1]!, { key: "Tab" });
  expect(doc.activeElement).toBe(buttons[0]);
  act(() => { target.focus(); });
  expect(doc.activeElement).toBe(buttons[0]);
  view.rerender(ui(false));
  await waitFor(() => expect(doc.activeElement).toBe(target));
  expect(rt.focus.inspect().scopes).toEqual([]);
});

it("uses the presenting document for overlay ownership, dismissal and anchor observation", async () => {
  const doc = childDocument();
  const rt = runtime();
  const manager = createOverlayManager();
  disposals.push(() => manager.dispose());
  const dismissed = vi.fn();
  let projectedDocument: Document | null = null;
  function Projection() {
    projectedDocument = useNSEOverlayProvider().runtime.environment.browser.getDocument();
    return null;
  }
  render(<SynCloudOSProvider runtime={rt}><PresentingDocumentContext value={doc}>
    {createPortal(<RuntimeOverlays manager={manager}><Projection /></RuntimeOverlays>, doc.body)}
  </PresentingDocumentContext></SynCloudOSProvider>);
  const anchor = doc.createElement("button");
  const surface = doc.createElement("section");
  doc.body.append(anchor, surface);
  const register = (id: string) => manager.register({ id, kind: "popover", parentId: null, anchor, surface,
    dismissOn: new Set<OverlayDismissReason>(["escape", "outside-pointer", "anchor-removed"]), restoreFocus: false, onDismiss: dismissed });
  register("child-menu");
  expect(projectedDocument).toBe(doc);
  fireEvent.pointerDown(document.body);
  expect(dismissed).not.toHaveBeenCalled();
  fireEvent.keyDown(doc.body, { key: "Escape" });
  expect(dismissed).toHaveBeenLastCalledWith("escape");
  register("child-menu-again");
  fireEvent.pointerDown(doc.body);
  expect(dismissed).toHaveBeenLastCalledWith("outside-pointer");
  register("anchor-menu");
  anchor.remove();
  await waitFor(() => expect(dismissed).toHaveBeenLastCalledWith("anchor-removed"));
});

it("retains one logical focus lease while its surface moves between presenting documents", async () => {
  const first = childDocument();
  const second = childDocument();
  const rt = runtime();
  const surface = first.createElement("section");
  first.body.append(surface);
  const ui = (doc: Document, open = true) => <SynCloudOSProvider runtime={rt}>
    <PresentingDocumentContext value={doc}>{open && createPortal(
      <FocusScope scopeId="moving-modal" kind="modal" parentResponderId="runtime">
        <input defaultValue="Retained edit" /><button>Last action</button>
      </FocusScope>, surface)}
    </PresentingDocumentContext>
  </SynCloudOSProvider>;
  const view = render(ui(first));
  const input = surface.querySelector("input")!;
  const last = surface.querySelector("button")!;
  await waitFor(() => expect(first.activeElement).toBe(input));
  input.value = "Unsaved edit";
  second.body.append(surface);
  view.rerender(ui(second));
  await waitFor(() => expect(second.activeElement).toBe(input));
  expect(surface.querySelector("input")).toBe(input);
  expect(input.value).toBe("Unsaved edit");
  expect(rt.focus.inspect().scopes.map(scope => scope.id)).toEqual(["moving-modal"]);
  expect(rt.focus.inspect().restorations).toEqual([]);
  act(() => last.focus());
  fireEvent.keyDown(last, { key: "Tab" });
  expect(second.activeElement).toBe(input);
  const external = first.createElement("button");
  first.body.append(external);
  act(() => external.focus());
  expect(first.activeElement).toBe(external);
  expect(second.activeElement).toBe(input);
  view.rerender(ui(second, false));
  expect(rt.focus.inspect().scopes).toEqual([]);
  expect(rt.focus.inspect().restorations).toHaveLength(1);
});

it("lets a manager-owned sheet trap only its blocked window domain", async () => {
  const f = createWindowTestDependencies();
  disposals.push(f.cleanup);
  Object.defineProperty(f.runtime, "windows", { configurable: true, value: f.manager });
  const parent = f.manager.create(standardWindow("sheet-parent"));
  const independent = f.manager.create(standardWindow("independent-window"));
  const sheet = f.manager.create(sheetWindow("attached-sheet", parent.id));
  await f.manager.open(parent.id);
  await f.manager.open(independent.id);
  await f.manager.attachSheet(parent.id, sheet.id);
  const view = render(<SynCloudOSProvider runtime={f.runtime}>
    <div data-syncloudos-runtime-owner={f.runtime.runtimeId}>
      <section data-window-host={parent.id}><button>Blocked editor</button></section>
      <section data-window-host={independent.id}><button>Independent editor</button></section>
      <section data-window-host={sheet.id}>
        <FocusScope scopeId={`window:${sheet.id}`} kind="modal" parentResponderId={parent.windowResponderId}
          externallyManagedScope externallyManagedInert>
          <button>Sheet action</button>
        </FocusScope>
      </section>
    </div>
  </SynCloudOSProvider>);
  const action = view.getByRole("button", { name: "Sheet action" });
  const other = view.getByRole("button", { name: "Independent editor" });
  const blocked = view.getByRole("button", { name: "Blocked editor" });
  await waitFor(() => expect(document.activeElement).toBe(action));
  act(() => other.focus());
  expect(document.activeElement).toBe(other);
  await act(async () => { blocked.focus(); });
  expect(document.activeElement).toBe(action);
});

it("keeps mounted application traps realm-safe and releases document listeners on revocation", async () => {
  const doc = childDocument();
  const rt = runtime();
  const appId = "com.example.presenting-document";
  registerTestSynWare(rt, { schemaVersion: 1, bundleIdentifier: appId, displayName: "Presenting document", version: "1.0.0" });
  const mount = mountTestSynWareRuntime(rt, appId);
  disposals.push(() => mount.dispose());
  const outside = doc.createElement("button");
  doc.body.append(outside);
  const view = render(<PresentingDocumentContext value={doc}>{createPortal(
    <AppFocusScope runtime={mount.runtime} runtimeId={rt.runtimeId}
      options={{ scopeId: "app-modal", kind: "modal", parentResponderId: `application:${appId}` }}>
      <button>First app action</button><button>Last app action</button>
    </AppFocusScope>, doc.body)}
  </PresentingDocumentContext>);
  const [first, last] = Array.from(doc.querySelectorAll<HTMLButtonElement>("[data-syncloudos-focus-scope='app-modal'] button"));
  await waitFor(() => expect(doc.activeElement).toBe(first));
  act(() => last!.focus());
  fireEvent.keyDown(last!, { key: "Tab" });
  expect(doc.activeElement).toBe(first);
  await act(async () => { outside.focus(); });
  expect(doc.activeElement).toBe(first);
  mount.dispose();
  act(() => outside.focus());
  expect(doc.activeElement).toBe(outside);
  expect(() => view.unmount()).not.toThrow();
});

it("retains parent and child overlay leases when their document projection changes", async () => {
  const first = childDocument();
  const second = childDocument();
  const rt = runtime();
  const manager = createOverlayManager();
  disposals.push(() => manager.dispose());
  const dismissed = vi.fn();
  const surface = first.createElement("section");
  first.body.append(surface);
  function Overlay({ id, parentId }: { id: string; parentId: string | null }) {
    const overlay = useNSEOverlay({ id, kind: "popover", parentId, parentResponderId: "runtime", anchor: null,
      open: true, dismissOn: [], restoreFocus: false, onDismiss: dismissed });
    return <div {...overlay.surfaceProps}>{id}</div>;
  }
  const ui = (doc: Document) => <SynCloudOSProvider runtime={rt}><PresentingDocumentContext value={doc}>
    {createPortal(<RuntimeOverlays manager={manager}>
      <Overlay id="parent-overlay" parentId={null} /><Overlay id="child-overlay" parentId="parent-overlay" />
    </RuntimeOverlays>, surface)}
  </PresentingDocumentContext></SynCloudOSProvider>;
  const view = render(ui(first));
  await waitFor(() => expect(manager.getSnapshot().orderedIds).toEqual(["parent-overlay", "child-overlay"]));
  const parent = manager.getRegistration("parent-overlay");
  const child = manager.getRegistration("child-overlay");
  second.body.append(surface);
  view.rerender(ui(second));
  expect(dismissed).not.toHaveBeenCalled();
  expect(manager.getRegistration("parent-overlay")).toBe(parent);
  expect(manager.getRegistration("child-overlay")).toBe(child);
});
