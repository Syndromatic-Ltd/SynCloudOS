/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * @vitest-environment jsdom
 *
 * The namespace import keeps the existing framework loadable for the TDD red
 * run before getMountedAppDOMRuntimeId is added to the private module.
 */
import * as React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SynWareRuntimeMount } from "../../src/SynCloudOS/AppSDK/SynWareRuntimeMount";
import { createMountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import * as overlayBridge from "../../src/SynCloudOS/Runtime/MountedAppOverlayBridge";
import { NSEPopover } from "../../src/NSE/Overlays/NSEPopover";
import { WindowSurfaceBridgeProvider } from "../../src/NSE/Overlays/NSEWindowSurfaceBridge";
import { FocusScope, HostSiteBrandingProvider, ResponderScope, SynCloudOSProvider, useRuntimeNSEFocusPort } from "../../src/SynCloudOSReact";
import { SynCloudOSRuntimeContext, SynWareRuntimeContext } from "../../src/SynCloudOSReact/runtimeContext";
import { useResponderHierarchy } from "../../src/SynCloudOSReact/responderHierarchy";
import { createTransientWindowSurfaceBridge, WindowContentRendererRegistry, WindowLayer } from "../../src/Webspring/WindowLayer";
import { createTestBundle, createTestRuntime } from "./helpers";

const bundleId = "com.example.dom-ownership";
const applicationResponder = `application:${bundleId}`;
const branding = Object.freeze({
  name: "Mounted ownership fixture", logoUrl: null, lightLogoUrl: null,
  darkLogoUrl: null, compactLogoUrl: null, logoAlt: "Mounted ownership fixture",
});
type Runtime = ReturnType<typeof createTestRuntime>;
type IdentityGetter = (runtime: object) => string;
const runtimes: Runtime[] = [];
const bridges: ReturnType<typeof createTransientWindowSurfaceBridge>[] = [];
const registries: WindowContentRendererRegistry[] = [];

afterEach(async () => {
  cleanup();
  for (const bridge of bridges.splice(0)) bridge.dispose();
  for (const registry of registries.splice(0)) registry.dispose();
  await Promise.all(runtimes.splice(0).map(runtime => runtime.dispose("DOM ownership test cleanup")));
  vi.restoreAllMocks();
});

function fixture(id: string) {
  const runtime = createTestRuntime({ id });
  runtimes.push(runtime);
  runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: bundleId, route: "/dom-ownership" }));
  const app = runtime.apps.getApp(bundleId)!;
  runtime.responders.register({
    id: applicationResponder, kind: "application", parentId: "workspace", scopeId: applicationResponder,
  });
  const registry = new WindowContentRendererRegistry();
  registries.push(registry);
  const bridge = createTransientWindowSurfaceBridge({
    runtime, renderers: registry, physicalHostId: `test:${id}`,
    owner: { workspaceId: "workspace:default", applicationId: bundleId, applicationSessionId: bundleId },
  });
  bridges.push(bridge);
  return { runtime, app, registry, bridge };
}
type Fixture = ReturnType<typeof fixture>;

function HierarchyProbe({ testId }: { readonly testId: string }) {
  const hierarchy = useResponderHierarchy();
  return <output data-testid={testId} data-logical-runtime={hierarchy.runtimeId ?? ""} data-responder={hierarchy.responderId ?? ""} />;
}

function InheritedFocusScope() {
  const port = useRuntimeNSEFocusPort();
  return port.wrapFocusScope(
    { scopeId: "scope:inherited-focus", kind: "menu", trapFocus: false },
    <span>Inherited focus scope</span>,
  );
}

function PopoverProbe({ name, authoredId, closed }: {
  readonly name: string;
  readonly authoredId?: string;
  readonly closed: () => void;
}) {
  const [anchor, setAnchor] = React.useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = React.useState(false);
  return <ResponderScope responderId={`control:${name}`} kind="control" parentResponderId={applicationResponder} scopeId={`scope:${name}`}>
    <HierarchyProbe testId={`hierarchy-${name}`} />
    <button id={authoredId} ref={setAnchor} type="button" aria-expanded={open} onClick={() => setOpen(true)}>{name} trigger</button>
    <NSEPopover id={`popover:${name}`} open={open} anchor={anchor} title={`${name} details`}
      parentResponderId={applicationResponder} parentWindowControllerId={null}
      presentation={{ mode: "anchored" }} contentSize={{ width: 240, height: 150 }}
      onOpenChange={(next) => { setOpen(next); if (!next) closed(); }}>
      <p>{name} popover content</p>
    </NSEPopover>
  </ResponderScope>;
}

function MountedSurface({ value, name, authoredId, closed }: {
  readonly value: Fixture;
  readonly name: string;
  readonly authoredId?: string;
  readonly closed: () => void;
}) {
  return <SynCloudOSProvider runtime={value.runtime}>
    <HostSiteBrandingProvider value={branding}>
      <WindowSurfaceBridgeProvider bridge={value.bridge}>
        <SynWareRuntimeMount runtime={value.runtime} app={value.app} responderId={applicationResponder}>
          <PopoverProbe name={name} authoredId={authoredId} closed={closed} />
        </SynWareRuntimeMount>
      </WindowSurfaceBridgeProvider>
      <WindowLayer contentRegistry={value.registry} />
    </HostSiteBrandingProvider>
  </SynCloudOSProvider>;
}

function ownerOf(element: Element): string | undefined {
  return element.closest<HTMLElement>("[data-syncloudos-runtime-owner]")?.dataset.syncloudosRuntimeOwner;
}

// Return the helper at call time: the mounted-popover RED test can run with
// the old bridge module, which does not yet export this private function.
function domRuntimeId(runtime: object): string {
  const candidate = (overlayBridge as typeof overlayBridge & { getMountedAppDOMRuntimeId?: IdentityGetter }).getMountedAppDOMRuntimeId;
  if (!candidate) throw new Error("Private getMountedAppDOMRuntimeId has not been implemented");
  return candidate(runtime);
}

describe("mounted application physical DOM ownership", () => {
  it("keeps a real mounted popover anchored through unrelated DOM mutation, then closes when its anchor is removed", async () => {
    const value = fixture("runtime:ownership-mounted-popover");
    const closed = vi.fn();
    const dismiss = vi.spyOn(value.runtime.windows, "dismissTransientWindows");
    const view = render(<div data-testid="root" data-syncloudos-runtime-owner={value.runtime.runtimeId}>
      <MountedSurface value={value} name="first" closed={closed} />
    </div>);
    const anchor = await screen.findByRole("button", { name: "first trigger" });
    const parent = anchor.parentNode!;
    const nextSibling = anchor.nextSibling;
    try {
      expect(ownerOf(anchor)).toBe(value.runtime.runtimeId);
      expect(screen.getByTestId("hierarchy-first").dataset.logicalRuntime).toBe(`app:${bundleId}`);
      expect(screen.getByTestId("hierarchy-first").dataset.responder).toBe("control:first");
      fireEvent.click(anchor);
      await screen.findByText("first popover content");
      await waitFor(() => expect(value.runtime.windows.list({ role: "popover" })).toHaveLength(1));
      const record = value.runtime.windows.list({ role: "popover" })[0];
      const id = record.id;
      expect(anchor.id).not.toBe("");
      expect(record.record.anchor?.id).toBe(anchor.id);
      expect(anchor.getAttribute("aria-expanded")).toBe("true");
      dismiss.mockClear();
      await act(async () => {
        screen.getByTestId("root").append(document.createElement("span"));
        await Promise.resolve();
      });
      expect(anchor.isConnected).toBe(true);
      expect(screen.getByRole("button", { name: "first trigger" })).toBe(anchor);
      expect(value.runtime.windows.snapshot().windowControllerIds).toContain(id);
      expect(value.runtime.windows.select(id).record.anchor?.id).toBe(anchor.id);
      expect(anchor.getAttribute("aria-expanded")).toBe("true");
      expect(screen.getByText("first popover content")).toBeTruthy();
      expect(dismiss).not.toHaveBeenCalledWith({ reason: "anchor-removed" });
      expect(closed).not.toHaveBeenCalled();
      await act(async () => { anchor.remove(); await Promise.resolve(); });
      await waitFor(() => expect(value.runtime.windows.snapshot().windowControllerIds).not.toContain(id));
      await waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
      expect(anchor.hasAttribute("id")).toBe(false);
    } finally {
      // Restore an imperatively detached React child before React's cleanup.
      if (!anchor.isConnected) parent.insertBefore(anchor, nextSibling?.parentNode === parent ? nextSibling : null);
      view.unmount();
    }
  });

  it("uses the canonical physical owner for direct FocusScope without changing app responder inheritance", async () => {
    const value = fixture("runtime:ownership-focus");
    render(<SynCloudOSProvider runtime={value.runtime}><HostSiteBrandingProvider value={branding}>
      <SynWareRuntimeMount runtime={value.runtime} app={value.app} responderId={applicationResponder}>
        <ResponderScope responderId="control:focus-parent" kind="control" parentResponderId={applicationResponder} scopeId="scope:focus-parent">
          <HierarchyProbe testId="focus-hierarchy" />
          <FocusScope asChild scopeId="scope:direct-focus" kind="menu" parentResponderId="control:focus-parent" trapFocus={false}>
            <div data-testid="direct-focus-host"><button>Focus child</button></div>
          </FocusScope>
          <InheritedFocusScope />
        </ResponderScope>
      </SynWareRuntimeMount>
    </HostSiteBrandingProvider></SynCloudOSProvider>);
    const host = await screen.findByTestId("direct-focus-host");
    expect(host.dataset.syncloudosRuntimeOwner).toBe(value.runtime.runtimeId);
    expect(screen.getByTestId("focus-hierarchy").dataset.logicalRuntime).toBe(`app:${bundleId}`);
    expect(screen.getByTestId("focus-hierarchy").dataset.responder).toBe("control:focus-parent");
    expect(value.runtime.focus.inspect().scopes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "scope:direct-focus", parentResponderId: "control:focus-parent" }),
      expect.objectContaining({ id: "scope:inherited-focus", parentResponderId: "control:focus-parent" }),
    ]));
  });

  it("isolates nested kernels for the same bundle even when mounted popovers have duplicate anchor IDs", async () => {
    const outer = fixture("runtime:ownership-outer");
    const inner = fixture("runtime:ownership-inner");
    const outerClosed = vi.fn(), innerClosed = vi.fn();
    const outerDismiss = vi.spyOn(outer.runtime.windows, "dismissTransientWindows");
    const innerDismiss = vi.spyOn(inner.runtime.windows, "dismissTransientWindows");
    const view = render(<div data-testid="outer-root" data-syncloudos-runtime-owner={outer.runtime.runtimeId}>
      <MountedSurface value={outer} name="outer" authoredId="duplicate-app-anchor" closed={outerClosed} />
      <div data-testid="inner-root" data-syncloudos-runtime-owner={inner.runtime.runtimeId}>
        <MountedSurface value={inner} name="inner" authoredId="duplicate-app-anchor" closed={innerClosed} />
      </div>
    </div>);
    const a = await screen.findByRole("button", { name: "outer trigger" });
    const b = await screen.findByRole("button", { name: "inner trigger" });
    const aParent = a.parentNode!, aNext = a.nextSibling;
    try {
      expect(ownerOf(a)).toBe(outer.runtime.runtimeId);
      expect(ownerOf(b)).toBe(inner.runtime.runtimeId);
      expect(screen.getByTestId("hierarchy-outer").dataset.logicalRuntime).toBe(`app:${bundleId}`);
      expect(screen.getByTestId("hierarchy-inner").dataset.logicalRuntime).toBe(`app:${bundleId}`);
      expect(outer.runtime.runtimeId).not.toBe(inner.runtime.runtimeId);
      fireEvent.click(a);
      await screen.findByText("outer popover content");
      fireEvent.click(b);
      await screen.findByText("inner popover content");
      await waitFor(() => {
        expect(outer.runtime.windows.list({ role: "popover" })).toHaveLength(1);
        expect(inner.runtime.windows.list({ role: "popover" })).toHaveLength(1);
      });
      expect(a.id).toBe("duplicate-app-anchor");
      expect(b.id).toBe(a.id);
      const outerId = outer.runtime.windows.list({ role: "popover" })[0].id;
      const innerId = inner.runtime.windows.list({ role: "popover" })[0].id;
      outerDismiss.mockClear(); innerDismiss.mockClear();
      await act(async () => { a.remove(); await Promise.resolve(); });
      await waitFor(() => expect(outer.runtime.windows.snapshot().windowControllerIds).not.toContain(outerId));
      await waitFor(() => expect(outerClosed).toHaveBeenCalledTimes(1));
      expect(inner.runtime.windows.snapshot().windowControllerIds).toContain(innerId);
      expect(b.isConnected).toBe(true);
      expect(b.getAttribute("aria-expanded")).toBe("true");
      expect(innerClosed).not.toHaveBeenCalled();
      expect(innerDismiss).not.toHaveBeenCalledWith({ reason: "anchor-removed" });
      // A nested runtime's pointer must not be accepted by the outer layer.
      outerDismiss.mockClear(); innerDismiss.mockClear();
      fireEvent.pointerDown(b);
      await waitFor(() => expect(innerDismiss).toHaveBeenCalledWith({ reason: "outside-pointer" }));
      expect(outerDismiss).not.toHaveBeenCalledWith({ reason: "outside-pointer" });
    } finally {
      if (!a.isConnected) aParent.insertBefore(a, aNext?.parentNode === aParent ? aNext : null);
      view.unmount();
    }
  });

  it("keeps inert ownership on an aborted exit subtree without registering new responders, focus scopes, or focus", async () => {
    const value = fixture("runtime:ownership-revoked");
    const mount = createMountedSynWareRuntime({ runtime: value.runtime, app: value.app, responderId: applicationResponder });
    function ExitingTree({ fresh }: { readonly fresh: boolean }) {
      return <SynCloudOSRuntimeContext.Provider value={null}>
        <SynWareRuntimeContext.Provider value={mount.runtime}>
          <ResponderScope responderId="view:retained" kind="view" parentResponderId={applicationResponder} scopeId="scope:retained">
            <HierarchyProbe testId="retained-hierarchy" />
            <button type="button">Retained view child</button>
            <FocusScope scopeId="scope:retained-focus" kind="menu" parentResponderId={applicationResponder} trapFocus={false}><span>Retained scope</span></FocusScope>
            {fresh ? <ResponderScope responderId="view:fresh" kind="view" parentResponderId={applicationResponder} scopeId="scope:fresh">
              <FocusScope scopeId="scope:fresh-focus" kind="menu" parentResponderId={applicationResponder} trapFocus={false}><button>Fresh view child</button></FocusScope>
            </ResponderScope> : null}
          </ResponderScope>
        </SynWareRuntimeContext.Provider>
      </SynCloudOSRuntimeContext.Provider>;
    }
    const view = render(<ExitingTree fresh={false} />);
    expect(ownerOf(screen.getByRole("button", { name: "Retained view child" }))).toBe(value.runtime.runtimeId);
    expect(screen.getByTestId("retained-hierarchy").dataset.logicalRuntime).toBe(`app:${bundleId}`);
    expect(value.runtime.responders.get("view:retained")).not.toBeNull();
    expect(value.runtime.focus.inspect().scopes.map(scope => scope.id)).toContain("scope:retained-focus");
    act(() => { mount.dispose("simulate retained exit"); });
    expect(mount.runtime.signal.aborted).toBe(true);
    expect(() => overlayBridge.getMountedAppOverlayAuthority(mount.runtime)).toThrow();
    const scopesAfterDispose = value.runtime.focus.inspect().scopes.map(scope => scope.id);
    const focusAfterDispose = value.runtime.focus.getFocusedResponderId();
    expect(() => view.rerender(<ExitingTree fresh />)).not.toThrow();
    expect(ownerOf(screen.getByRole("button", { name: "Fresh view child" }))).toBe(value.runtime.runtimeId);
    expect(value.runtime.responders.get("view:fresh")).toBeNull();
    expect(value.runtime.focus.inspect().scopes.map(scope => scope.id)).toEqual(scopesAfterDispose);
    expect(value.runtime.focus.inspect().scopes.map(scope => scope.id)).not.toContain("scope:fresh-focus");
    expect(() => fireEvent.focus(screen.getByRole("button", { name: "Retained view child" }))).not.toThrow();
    expect(() => fireEvent.focus(screen.getByRole("button", { name: "Fresh view child" }))).not.toThrow();
    expect(value.runtime.focus.getFocusedResponderId()).toBe(focusAfterDispose);
    view.unmount();
  });

  it("forwards an asChild focus callback once while live and stops forwarding after mount revocation", () => {
    const value = fixture("runtime:ownership-as-child-exit");
    const mount = createMountedSynWareRuntime({ runtime: value.runtime, app: value.app, responderId: applicationResponder });
    const childFocus = vi.fn(() => value.runtime.focus.getFocusedResponderId());
    const view = render(<SynCloudOSRuntimeContext.Provider value={null}>
      <SynWareRuntimeContext.Provider value={mount.runtime}>
        <ResponderScope asChild responderId="view:as-child" kind="view" parentResponderId={applicationResponder} scopeId="scope:as-child">
          <div onFocusCapture={childFocus}><button type="button">As-child focus target</button></div>
        </ResponderScope>
      </SynWareRuntimeContext.Provider>
    </SynCloudOSRuntimeContext.Provider>);
    try {
      const target = screen.getByRole("button", { name: "As-child focus target" });
      const focusedBefore = value.runtime.focus.getFocusedResponderId();
      expect(value.runtime.responders.get("view:as-child")).not.toBeNull();
      fireEvent.focus(target);
      expect(childFocus).toHaveBeenCalledTimes(1);
      expect(childFocus.mock.results[0]?.value).toBe(focusedBefore);
      expect(value.runtime.focus.getFocusedResponderId()).toBe("view:as-child");
      act(() => { mount.dispose("simulate asChild exit"); });
      expect(mount.runtime.signal.aborted).toBe(true);
      expect(value.runtime.responders.get("view:as-child")).toBeNull();
      childFocus.mockClear();
      fireEvent.focus(target);
      expect(childFocus).not.toHaveBeenCalled();
    } finally {
      view.unmount();
      mount.dispose();
    }
  });

  it("retains only the trusted inert identity after revocation and rejects unknown or conflicting facade bindings", () => {
    const first = fixture("runtime:identity-first");
    const second = fixture("runtime:identity-second");
    const a = createMountedSynWareRuntime({ runtime: first.runtime, app: first.app, responderId: applicationResponder });
    const b = createMountedSynWareRuntime({ runtime: second.runtime, app: second.app, responderId: applicationResponder });
    try {
      const authority = overlayBridge.getMountedAppOverlayAuthority(a.runtime);
      expect(domRuntimeId(a.runtime)).toBe(first.runtime.runtimeId);
      expect(domRuntimeId(b.runtime)).toBe(second.runtime.runtimeId);
      expect(domRuntimeId(a.runtime)).not.toBe(domRuntimeId(b.runtime));
      expect(() => domRuntimeId({})).toThrow(expect.objectContaining({ name: "SecurityError" }));
      expect(() => overlayBridge.setMountedAppOverlayAuthority(a.runtime, { ...authority, runtimeId: second.runtime.runtimeId })).toThrow();
      expect(overlayBridge.getMountedAppOverlayAuthority(a.runtime)).toBe(authority);
      expect(domRuntimeId(a.runtime)).toBe(first.runtime.runtimeId);
      a.dispose("identity revoked");
      expect(domRuntimeId(a.runtime)).toBe(first.runtime.runtimeId);
      expect(() => overlayBridge.getMountedAppOverlayAuthority(a.runtime)).toThrow(expect.objectContaining({ name: "SecurityError" }));
      expect(() => overlayBridge.setMountedAppOverlayAuthority(a.runtime, { ...authority, runtimeId: second.runtime.runtimeId })).toThrow();
      expect(domRuntimeId(a.runtime)).toBe(first.runtime.runtimeId);
      expect(() => overlayBridge.getMountedAppOverlayAuthority(a.runtime)).toThrow(expect.objectContaining({ name: "SecurityError" }));
      expect(domRuntimeId(b.runtime)).toBe(second.runtime.runtimeId);
      expect(overlayBridge.getMountedAppOverlayAuthority(b.runtime).runtimeId).toBe(second.runtime.runtimeId);
    } finally { a.dispose(); b.dispose(); }
  });
});
