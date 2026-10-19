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
import React, { useLayoutEffect, useMemo, useState, type PropsWithChildren } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NSEOverlayProvider,
  computeNSEOverlayPosition,
  createNSEOverlayManager,
  logicalPlacementToFloatingPlacement,
  useNSEOverlay,
  type NSEOverlayDismissReason,
  type NSEOverlayKind,
  type NSEOverlayRuntimePort,
} from "../../../src/NSE/Overlays";
import { belongsToNearestNSEOverlayProvider, isWithinNSEOverlay, nseOverlayEventPath } from "../../../src/NSE/Overlays/overlayEventOwnership";
import { SynCloudOSProvider, useRuntimeNSEOverlayPort } from "../../../src/SynCloudOSReact";
import { createStaticPresentationPort } from "../../fixtures/presentationTraits";
import { createTestRuntime } from "../../runtime/helpers";
import { SynCloudOSLifecycleError } from "../../../src/SynCloudOS/nseRuntimeContracts";

afterEach(cleanup);

it("diagnoses registration after overlay manager disposal", () => {
  const manager = createNSEOverlayManager(); manager.dispose(); manager.dispose();
  const registration = { id: "late", kind: "menu" as const, parentId: null, anchor: null, surface: document.createElement("div"), restoreFocus: false, dismissOn: new Set<NSEOverlayDismissReason>(), onDismiss: vi.fn() };
  expect(() => manager.register(registration)).toThrow(SynCloudOSLifecycleError);
  expect(() => manager.register(registration)).toThrow(expect.objectContaining({ code: "NSE_OVERLAY_MANAGER_DISPOSED", operation: "register", disposal: expect.objectContaining({ reason: "explicit" }) }));
});

function RuntimeOverlayProvider({ manager, children }: PropsWithChildren<{ readonly manager: ReturnType<typeof createNSEOverlayManager> }>) {
  const runtimePort = useRuntimeNSEOverlayPort();
  return <NSEOverlayProvider manager={manager} runtimePort={runtimePort}>{children}</NSEOverlayProvider>;
}

interface OverlayFixtureProps {
  readonly id: string;
  readonly label: string;
  readonly kind?: NSEOverlayKind;
  readonly parentId?: string | null;
  readonly parentScopeId?: string;
  readonly parentResponderId: string;
  readonly anchor: HTMLElement | null;
  readonly dismissOn?: readonly NSEOverlayDismissReason[];
  readonly onDismiss?: (reason: NSEOverlayDismissReason) => void;
}

function OverlayFixture({
  id,
  label,
  kind = "menu",
  parentId = null,
  parentScopeId,
  parentResponderId,
  anchor,
  dismissOn = ["escape", "outside-pointer", "focus-left", "anchor-removed", "programmatic", "parent-dismissed"],
  onDismiss,
}: OverlayFixtureProps) {
  const [open, setOpen] = useState(true);
  const overlay = useNSEOverlay({
    id,
    kind,
    parentId,
    parentScopeId,
    parentResponderId,
    anchor,
    open,
    dismissOn,
    restoreFocus: true,
    onDismiss: (reason) => {
      onDismiss?.(reason);
      setOpen(false);
    },
  });

  if (!open) return null;
  return overlay.withFocusScope(
    <div
      {...overlay.surfaceProps}
      aria-label={label}
      role={kind === "menu" || kind === "submenu" || kind === "context-menu" ? "menu" : "dialog"}
      tabIndex={0}
    >
      {label}
    </div>,
  );
}

/** Models FocusScope's physical parent restoration during a controlled close.
 * The provider must not reinterpret that teardown focus as a user focus-left
 * dismissal before the overlay can restore its exact anchor. */
function TeardownFocusScope({ children }: PropsWithChildren) {
  useLayoutEffect(() => () => {
    document.querySelector<HTMLButtonElement>("[data-testid='teardown-parent-focus']")?.focus();
  }, []);
  return <>{children}</>;
}

function ControlledCloseOverlay({ onDismiss }: { readonly onDismiss: (reason: NSEOverlayDismissReason) => void }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const overlay = useNSEOverlay({
    id: "controlled-close",
    kind: "popover",
    parentResponderId: "application:controlled-close",
    anchor,
    open,
    onDismiss: (reason) => {
      onDismiss(reason);
      setOpen(false);
    },
  });

  return (
    <>
      <button ref={setAnchor} type="button" onClick={() => setOpen(true)}>Open controlled overlay</button>
      <button data-testid="teardown-parent-focus" type="button">Parent responder target</button>
      {open ? overlay.withFocusScope(
        <div {...overlay.surfaceProps} role="dialog" aria-label="Controlled overlay">
          <button type="button" onClick={() => setOpen(false)}>Complete selection</button>
        </div>,
      ) : null}
    </>
  );
}

function ControlledCloseHarness({ onDismiss }: { readonly onDismiss: (reason: NSEOverlayDismissReason) => void }) {
  const runtimePort = useMemo<NSEOverlayRuntimePort>(() => {
    const signal = new AbortController().signal;
    const snapshot = Object.freeze({ width: 1200, height: 800, safeArea: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }) });
    const presentation = createStaticPresentationPort({ width: 1200, height: 800 });
    return {
      runtimeId: "runtime:controlled-close",
      signal,
      environment: {
        browser: { getDocument: () => document, getWindow: () => window },
        workArea: { getSnapshot: () => snapshot, subscribe: () => () => undefined },
        visualViewport: { getSnapshot: () => null, subscribe: () => () => undefined },
        presentation,
        setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
        clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      },
      restoreFocus: (_responderId, target) => target?.focus(),
      reportPlacementFailure: () => undefined,
      wrapFocusScope: (_options, children) => <TeardownFocusScope>{children}</TeardownFocusScope>,
    };
  }, []);
  return <NSEOverlayProvider runtimePort={runtimePort}><ControlledCloseOverlay onDismiss={onDismiss} /></NSEOverlayProvider>;
}

function NestedOverlayFixture({ manager }: { readonly manager: ReturnType<typeof createNSEOverlayManager> }) {
  const [showFormat, setShowFormat] = useState(true);
  const [applicationAnchor, setApplicationAnchor] = useState<HTMLButtonElement | null>(null);
  const [formatAnchor, setFormatAnchor] = useState<HTMLButtonElement | null>(null);
  return (
    <RuntimeOverlayProvider manager={manager}>
      <button ref={setApplicationAnchor} data-syncloudos-responder-id="application-trigger">Application</button>
      <button ref={setFormatAnchor} data-syncloudos-responder-id="format-trigger">Format</button>
      <OverlayFixture
        id="application"
        label="Application"
        anchor={applicationAnchor}
        parentResponderId="application-trigger"
      />
      {showFormat ? (
        <OverlayFixture
          id="format"
          label="Format"
          parentId="application"
          parentScopeId="nse-overlay:application"
          parentResponderId="format-trigger"
          anchor={formatAnchor}
          onDismiss={() => setShowFormat(false)}
        />
      ) : null}
      <button>Outside focus target</button>
    </RuntimeOverlayProvider>
  );
}

function UpdatedRegistrationFixture({ dismissed }: { readonly dismissed: ReturnType<typeof vi.fn> }) {
  const [firstAnchor, setFirstAnchor] = useState<HTMLButtonElement | null>(null);
  const [secondAnchor, setSecondAnchor] = useState<HTMLButtonElement | null>(null);
  const [useSecond, setUseSecond] = useState(false);
  const [escapeOnly, setEscapeOnly] = useState(false);
  return (
    <>
      <button ref={setFirstAnchor} type="button">First anchor</button>
      <button ref={setSecondAnchor} type="button">Second anchor</button>
      <button type="button" onClick={() => { setUseSecond(true); setEscapeOnly(true); }}>Update registration</button>
      <OverlayFixture
        id="updated-registration"
        label="Updated registration"
        anchor={useSecond ? secondAnchor : firstAnchor}
        parentResponderId="runtime"
        dismissOn={escapeOnly ? ["escape"] : ["escape", "outside-pointer"]}
        onDismiss={dismissed}
      />
    </>
  );
}

function LateIdleProvider({ manager }: { readonly manager: ReturnType<typeof createNSEOverlayManager> }) {
  const [mounted, setMounted] = useState(false);
  React.useEffect(() => setMounted(true), []);
  return mounted ? <RuntimeOverlayProvider manager={manager}><span>Idle nested runtime surface</span></RuntimeOverlayProvider> : null;
}

describe("NSEOverlayManager", () => {
  it("keeps mounted SynWare ownership inside the host overlay provider", () => {
    const provider = document.createElement("div");
    provider.dataset.nseOverlayProvider = "provider:host";
    provider.dataset.syncloudosRuntimeOwner = "runtime:host";
    const appSurface = document.createElement("button");
    appSurface.dataset.syncloudosRuntimeOwner = "app:nse-control-gallery";
    provider.append(appSurface);
    document.body.append(provider);

    const event = new PointerEvent("pointerdown", { bubbles: true, composed: true, button: 0 });
    appSurface.dispatchEvent(event);

    expect(belongsToNearestNSEOverlayProvider(event, "runtime:host", "provider:host")).toBe(true);
    const foreignSurface = document.createElement("button");
    foreignSurface.dataset.syncloudosRuntimeOwner = "runtime:foreign";
    provider.append(foreignSurface);
    const foreignEvent = new PointerEvent("pointerdown", { bubbles: true, composed: true, button: 0 });
    foreignSurface.dispatchEvent(foreignEvent);
    expect(belongsToNearestNSEOverlayProvider(foreignEvent, "runtime:host", "provider:host")).toBe(false);
  });

  it("recognises a live overlay surface after a same-id DOM replacement", () => {
    const staleSurface = document.createElement("div");
    staleSurface.id = "overlay:replacement";
    const liveSurface = document.createElement("div");
    liveSurface.id = staleSurface.id;
    liveSurface.dataset.nsePart = "surface";
    const target = document.createElement("button");
    liveSurface.append(target);
    document.body.append(liveSurface);
    const event = new PointerEvent("pointerdown", { bubbles: true, composed: true, button: 0 });
    target.dispatchEvent(event);

    const path = nseOverlayEventPath(event);
    expect(path).toContain(liveSurface);
    expect(liveSurface.dataset.nsePart).toBe("surface");
    expect(isWithinNSEOverlay(path, {
      id: staleSurface.id,
      kind: "popover",
      parentId: null,
      anchor: null,
      surface: staleSurface,
      dismissOn: new Set(["outside-pointer"]),
      restoreFocus: false,
      onDismiss: () => undefined,
    })).toBe(true);

    const partialPathEvent = { target, composedPath: () => [target] } as unknown as Event;
    expect(nseOverlayEventPath(partialPathEvent)).toContain(liveSurface);
  });

  it("rejects missing, self, and cyclic parents before publishing a corrupt graph", () => {
    const manager = createNSEOverlayManager();
    const surface = document.createElement("div");
    const registration = (id: string, parentId: string | null) => ({
      id,
      kind: "menu" as const,
      parentId,
      anchor: null,
      surface,
      dismissOn: new Set<NSEOverlayDismissReason>(["programmatic"]),
      restoreFocus: false,
      onDismiss: vi.fn(),
    });

    expect(() => manager.register(registration("missing-child", "missing"))).toThrow(/parent.*missing/i);
    expect(() => manager.register(registration("self", "self"))).toThrow(/parent|self/i);
    manager.register(registration("root", null));
    manager.register(registration("child", "root"));
    expect(() => manager.register(registration("root", "child"))).toThrow(/already registered|cycle/i);
    expect(manager.getSnapshot().orderedIds).toEqual(["root", "child"]);
  });

  it("removes descendants topmost-first when a parent registration disappears", () => {
    const manager = createNSEOverlayManager();
    const surface = document.createElement("div");
    const dismissed: string[] = [];
    const register = (id: string, parentId: string | null) => manager.register({
      id,
      kind: "menu",
      parentId,
      anchor: null,
      surface,
      dismissOn: new Set(["parent-dismissed"]),
      restoreFocus: false,
      onDismiss: (reason) => dismissed.push(`${id}:${reason}`),
    });
    const unregisterRoot = register("root", null);
    register("child", "root");
    register("grandchild", "child");

    unregisterRoot();

    expect(manager.getSnapshot().orderedIds).toEqual([]);
    expect(dismissed).toEqual([
      "grandchild:parent-dismissed",
      "child:parent-dismissed",
    ]);
  });

  it("dismisses a parent branch in topmost-first order and remains idempotent", () => {
    const manager = createNSEOverlayManager();
    const dismissed: string[] = [];
    const surface = document.createElement("div");
    const register = (id: string, parentId: string | null) => manager.register({
      id,
      kind: "menu",
      parentId,
      anchor: null,
      surface,
      dismissOn: new Set(["programmatic", "parent-dismissed"]),
      restoreFocus: true,
      onDismiss: (reason) => dismissed.push(`${id}:${reason}`),
    });

    const unregisterApplication = register("application", null);
    register("format", "application");
    register("alignment", "format");

    expect(manager.getSnapshot().orderedIds).toEqual(["application", "format", "alignment"]);
    expect(manager.dismissBranch("application", "programmatic")).toEqual(["alignment", "format", "application"]);
    expect(dismissed).toEqual([
      "alignment:programmatic",
      "format:programmatic",
      "application:programmatic",
    ]);
    expect(manager.getSnapshot().topmostId).toBeNull();
    expect(unregisterApplication()).toBeUndefined();
    expect(manager.dismiss("application", "programmatic")).toBe(false);
  });

  it("closes only the topmost nested branch on Escape and restores its exact trigger", async () => {
    const runtime = createTestRuntime();
    runtime.responders.register({ id: "application-trigger", kind: "control", parentId: "runtime", scopeId: "root" });
    runtime.responders.register({ id: "format-trigger", kind: "control", parentId: "application-trigger", scopeId: "nse-overlay:application" });
    runtime.focus.requestFocus("format-trigger");
    const manager = createNSEOverlayManager();

    render(
      <SynCloudOSProvider runtime={runtime}>
        <NestedOverlayFixture manager={manager} />
      </SynCloudOSProvider>,
    );

    const format = await screen.findByRole("menu", { name: "Format" });
    fireEvent.keyDown(format, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("menu", { name: "Format" })).toBeNull());
    expect(screen.getByRole("menu", { name: "Application" })).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Format" })));
  });

  it("classifies outside pointer and focus-left dismissal through the provider listener set", async () => {
    const runtime = createTestRuntime();
    runtime.responders.register({ id: "trigger", kind: "control", parentId: "runtime", scopeId: "root" });
    const manager = createNSEOverlayManager();
    const dismissed = vi.fn();
    const anchor = document.createElement("button");

    render(
      <SynCloudOSProvider runtime={runtime}>
        <RuntimeOverlayProvider manager={manager}>
          <button ref={(node) => { if (node && !anchor.isConnected) node.replaceWith(anchor); }} data-syncloudos-responder-id="trigger">Trigger</button>
          <OverlayFixture id="popover" label="Popover" kind="popover" anchor={anchor} parentResponderId="trigger" onDismiss={dismissed} />
          <button>Outside focus target</button>
        </RuntimeOverlayProvider>
      </SynCloudOSProvider>,
    );

    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(dismissed).toHaveBeenCalledWith("outside-pointer"));

    const secondManager = createNSEOverlayManager();
    const focusDismissed = vi.fn();
    const focusAnchor = document.createElement("button");
    render(
      <SynCloudOSProvider runtime={runtime}>
        <RuntimeOverlayProvider manager={secondManager}>
          <button ref={(node) => { if (node && !focusAnchor.isConnected) node.replaceWith(focusAnchor); }} data-syncloudos-responder-id="trigger">Trigger</button>
          <OverlayFixture id="focus-popover" label="Focus popover" kind="popover" anchor={focusAnchor} parentResponderId="trigger" onDismiss={focusDismissed} />
          <button>Outside focus target</button>
        </RuntimeOverlayProvider>
      </SynCloudOSProvider>,
    );
    const outsideFocusTarget = screen.getAllByRole("button", { name: "Outside focus target" }).at(-1)!;
    outsideFocusTarget.focus();
    await waitFor(() => expect(focusDismissed).toHaveBeenCalledWith("focus-left"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(document.activeElement).toBe(outsideFocusTarget);
  });

  it("uses the manager's live anchor and dismissal policy after an open registration update", async () => {
    const runtime = createTestRuntime({ id: "runtime:overlay-update" });
    const manager = createNSEOverlayManager();
    const dismissed = vi.fn();
    render(
      <SynCloudOSProvider runtime={runtime}>
        <RuntimeOverlayProvider manager={manager}>
          <UpdatedRegistrationFixture dismissed={dismissed} />
        </RuntimeOverlayProvider>
      </SynCloudOSProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Update registration" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Second anchor" }));
    fireEvent.pointerDown(document.body);

    expect(dismissed).not.toHaveBeenCalled();
    expect(manager.getSnapshot().topmostId).toBe("updated-registration");
  });

  it("routes a markerless body event to an active outer provider instead of an idle later provider", async () => {
    const runtime = createTestRuntime({ id: "runtime:markerless-owner" });
    const outerManager = createNSEOverlayManager();
    const idleInnerManager = createNSEOverlayManager();
    const dismissed = vi.fn();
    render(
      <SynCloudOSProvider runtime={runtime}>
        <RuntimeOverlayProvider manager={outerManager}>
          <OverlayFixture id="outer-active" label="Outer active" kind="popover" anchor={null} parentResponderId="runtime" onDismiss={dismissed} />
          <LateIdleProvider manager={idleInnerManager} />
        </RuntimeOverlayProvider>
      </SynCloudOSProvider>,
    );

    fireEvent.pointerDown(document.body);

    await waitFor(() => expect(dismissed).toHaveBeenCalledWith("outside-pointer"));
    expect(idleInnerManager.getSnapshot().topmostId).toBeNull();
  });

  it("lets an outer provider dismiss from idle nested application content", async () => {
    const runtime = createTestRuntime({ id: "runtime:nested-idle-boundary" });
    const outerManager = createNSEOverlayManager();
    const innerManager = createNSEOverlayManager();
    const dismissed = vi.fn();
    render(
      <SynCloudOSProvider runtime={runtime}>
        <RuntimeOverlayProvider manager={outerManager}>
          <OverlayFixture id="outer-active" label="Outer active" kind="popover" anchor={null} parentResponderId="runtime" onDismiss={dismissed} />
          <RuntimeOverlayProvider manager={innerManager}>
            <button type="button">Idle nested content</button>
          </RuntimeOverlayProvider>
        </RuntimeOverlayProvider>
      </SynCloudOSProvider>,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "Idle nested content" }));

    await waitFor(() => expect(dismissed).toHaveBeenCalledWith("outside-pointer"));
    expect(innerManager.getSnapshot().topmostId).toBeNull();
  });

  it("routes markerless events by latest provider activation instead of mount order", async () => {
    const runtime = createTestRuntime({ id: "runtime:markerless-activation" });
    const firstManager = createNSEOverlayManager();
    const secondManager = createNSEOverlayManager();
    const firstDismissed = vi.fn();
    const secondDismissed = vi.fn();
    render(
      <SynCloudOSProvider runtime={runtime}>
        <RuntimeOverlayProvider manager={firstManager}>
          <RuntimeOverlayProvider manager={secondManager}><span>Providers mounted</span></RuntimeOverlayProvider>
        </RuntimeOverlayProvider>
      </SynCloudOSProvider>,
    );
    const surface = document.createElement("div");
    const registration = (id: string, onDismiss: (reason: NSEOverlayDismissReason) => void) => ({
      id,
      kind: "popover" as const,
      parentId: null,
      parentScopeId: "root",
      parentResponderId: "runtime",
      anchor: null,
      surface,
      dismissOn: new Set<NSEOverlayDismissReason>(["outside-pointer"]),
      restoreFocus: false,
      onDismiss,
    });
    secondManager.register(registration("second", secondDismissed));
    firstManager.register(registration("first", firstDismissed));

    fireEvent.pointerDown(document.body);

    await waitFor(() => expect(firstDismissed).toHaveBeenCalledOnce());
    expect(secondDismissed).not.toHaveBeenCalled();
    firstManager.register(registration("first-still-open", firstDismissed));
    secondManager.register(registration("second-latest", secondDismissed));
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(secondDismissed).toHaveBeenCalledOnce());
    expect(firstDismissed).toHaveBeenCalledOnce();
  });

  it("does not classify FocusScope teardown as focus-left during a controlled selection close", async () => {
    const dismissed = vi.fn();
    render(<ControlledCloseHarness onDismiss={dismissed} />);

    const trigger = screen.getByRole("button", { name: "Open controlled overlay" });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("button", { name: "Complete selection" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Controlled overlay" })).toBeNull());
    expect(dismissed).not.toHaveBeenCalledWith("focus-left");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(dismissed).not.toHaveBeenCalledWith("focus-left");
  });

  it("dismisses an overlay when its anchor is removed and isolates foreign runtime composed paths", async () => {
    const outerRuntime = createTestRuntime({ id: "runtime:outer" });
    const innerRuntime = createTestRuntime({ id: "runtime:inner" });
    outerRuntime.responders.register({ id: "outer-trigger", kind: "control", parentId: "runtime", scopeId: "root" });
    innerRuntime.responders.register({ id: "inner-trigger", kind: "control", parentId: "runtime", scopeId: "root" });
    const outerManager = createNSEOverlayManager();
    const innerManager = createNSEOverlayManager();
    const outerDismissed = vi.fn();
    const anchor = document.createElement("button");

    const view = render(
      <SynCloudOSProvider runtime={outerRuntime}>
        <RuntimeOverlayProvider manager={outerManager}>
          <button ref={(node) => { if (node && !anchor.isConnected) node.replaceWith(anchor); }} data-syncloudos-responder-id="outer-trigger">Outer trigger</button>
          <OverlayFixture id="outer" label="Outer overlay" kind="popover" anchor={anchor} parentResponderId="outer-trigger" onDismiss={outerDismissed} />
          <SynCloudOSProvider runtime={innerRuntime}>
            <RuntimeOverlayProvider manager={innerManager}>
              <button data-syncloudos-responder-id="inner-trigger">Inner trigger</button>
              <OverlayFixture id="inner" label="Inner overlay" kind="popover" anchor={null} parentResponderId="inner-trigger" />
              <button>Foreign runtime target</button>
            </RuntimeOverlayProvider>
          </SynCloudOSProvider>
        </RuntimeOverlayProvider>
      </SynCloudOSProvider>,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "Foreign runtime target" }));
    expect(outerDismissed).not.toHaveBeenCalled();

    anchor.remove();
    await waitFor(() => expect(outerDismissed).toHaveBeenCalledWith("anchor-removed"));
    view.unmount();
  });

  it("maps logical placement explicitly for RTL and fences late placement writes after disposal", async () => {
    expect(logicalPlacementToFloatingPlacement("block-start-inline-start", "ltr")).toBe("top-start");
    expect(logicalPlacementToFloatingPlacement("block-start-inline-start", "rtl")).toBe("top-end");
    expect(logicalPlacementToFloatingPlacement("inline-start", "rtl")).toBe("right");

    const anchor = document.createElement("button");
    const floating = document.createElement("div");
    document.body.append(anchor, floating);
    const stop = computeNSEOverlayPosition({
      anchor,
      floating,
      placement: "block-end-inline-end",
      direction: "rtl",
    });
    stop();
    await Promise.resolve();
    expect(floating.style.left).toBe("");
    anchor.remove();
    floating.remove();
  });

  it("fences a pending placement update when its injected abort signal is cancelled", async () => {
    const controller = new AbortController();
    const anchor = document.createElement("button");
    const floating = document.createElement("div");
    document.body.append(anchor, floating);

    computeNSEOverlayPosition({
      anchor,
      floating,
      signal: controller.signal,
    });
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(floating.style.left).toBe("");
    anchor.remove();
    floating.remove();
  });

  it("places at once, then defers observer placement writes through the injected scheduler and cancels them on disposal", async () => {
    const anchor = document.createElement("button");
    const floating = document.createElement("div");
    document.body.append(anchor, floating);
    const handle = { id: "placement" };
    let queuedUpdate: (() => void) | null = null;
    const scheduler = {
      setTimeout: vi.fn((callback: () => void) => {
        queuedUpdate = callback;
        return handle;
      }),
      clearTimeout: vi.fn(),
    };

    const stop = computeNSEOverlayPosition({ anchor, floating, scheduler });

    // The opening placement is written before the surface first paints.
    expect(floating.style.position).toBe("fixed");
    expect(scheduler.setTimeout).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(floating.style.top).not.toBe(""));
    // A later update (here a scroll) leaves its delivery through the scheduler.
    window.dispatchEvent(new Event("scroll"));
    expect(scheduler.setTimeout).toHaveBeenCalledWith(expect.any(Function), 0);
    floating.style.left = "";
    floating.style.top = "";
    stop();
    expect(scheduler.clearTimeout).toHaveBeenCalledWith(handle);

    queuedUpdate?.();
    await Promise.resolve();
    expect(floating.style.left).toBe("");
    expect(floating.style.top).toBe("");
    anchor.remove();
    floating.remove();
  });
});
