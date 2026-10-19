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

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useNSEPresenceExiting, useNSEPresentation, type NSEPresentationSpec } from "../../NSE/Animation";
import {
  NSEControlRuntimeProvider,
  NSEFocusPortProvider,
  NSEOverlayProvider,
  NSEWindowSurfaceBridgeProvider,
  NSEBorderlessWindowView,
  NSEHUDWindowView,
  NSEModalWindowView,
  NSEPanelView,
  NSEPopoverWindowView,
  NSESheetView,
  NSEStandardWindowView,
  type NSEWindowHost,
  useNSEDeferredDisposal,
} from "../../NSE/NSE";
import {
  resolveWindowPresentation,
  type ScreenSnapshot,
  type WindowController,
  type WindowManager,
  type WindowManagerSnapshot,
  type WindowRole,
  type CommandSystem,
} from "../../SynCloudOS/SynCloudOS";
import { FocusScope, useRuntimeNSEControlPort, useRuntimeNSEFocusPort, useRuntimeNSEOverlayPort, useKernelSynCloudOS } from "../../SynCloudOSReact";
import { createTransientWindowSurfaceBridge } from "./TransientWindowSurfaceBridge";
import { WindowChromeSlotContext } from "./windowChromeSlotContext";
import { useWindowMoveResize } from "./useWindowMoveResize";
import type { WindowContentRendererRegistry } from "./WindowContentRendererRegistry";

export interface WindowLayerDiagnostic {
  readonly code: "WINDOW_PRESENTATION_GEOMETRY_INVALID";
  readonly windowControllerId: string;
  readonly bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
}

export interface WindowHostProps {
  readonly controller: WindowController;
  readonly manager: WindowManager;
  readonly managerSnapshot: WindowManagerSnapshot;
  readonly screen: ScreenSnapshot;
  readonly commands: CommandSystem;
  readonly renderers: WindowContentRendererRegistry;
  readonly onDiagnostic?: (diagnostic: WindowLayerDiagnostic) => void;
}

const viewByRole: Readonly<Record<WindowRole, NSEWindowHost>> = Object.freeze({
  standard: NSEStandardWindowView,
  panel: NSEPanelView,
  hud: NSEHUDWindowView,
  modal: NSEModalWindowView,
  sheet: NSESheetView,
  popover: NSEPopoverWindowView,
  borderless: NSEBorderlessWindowView,
});

/** A closing window dissolves over 0.16 s. */
const windowFocusableSelector = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable=true], [tabindex]:not([tabindex='-1'])";

const windowHostMotion = Object.freeze({
  exit: Object.freeze({
    duration: 0.16,
    timing: "linear",
    tracks: Object.freeze([Object.freeze({ keyPath: "opacity", values: Object.freeze([1, 0]) })]),
  }) satisfies NSEPresentationSpec,
});

function validGeometry(bounds: Readonly<{ x: number; y: number; width: number; height: number }>): boolean {
  return Number.isFinite(bounds.x) && Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) && Number.isFinite(bounds.height) &&
    bounds.width > 0 && bounds.height > 0;
}

export function WindowHost({
  controller,
  manager,
  managerSnapshot,
  screen,
  commands,
  renderers,
  onDiagnostic,
}: WindowHostProps) {
  const runtime = useKernelSynCloudOS();
  const record = useSyncExternalStore(controller.subscribe, () => controller.record, () => controller.record);
  const contentState = useSyncExternalStore(controller.subscribe, () => controller.contentState, () => controller.contentState);
  useSyncExternalStore(renderers.subscribe, () => renderers.revision, () => renderers.revision);
  const contentRendererAvailable = contentState.status === "loaded" && renderers.has(contentState.mountKey);
  // The custom-titlebar slot div is rendered declaratively by the view; the
  // host learns the node through a ref callback (raw `document` access is
  // forbidden in Webspring surfaces). The mounted application's chrome
  // portals into it once the node exists.
  const [chromeSlotNode, setChromeSlotNode] = useState<HTMLDivElement | null>(null);
  // Readiness handshake: a declared-custom window starts on complete
  // system chrome. Only a mounted bridge that reports a live
  // renderer promotes the window to custom chrome; renderer unmount
  // (detached) or a crash (failed) returns it to the system titlebar, so
  // chromeMode alone can never blank the bar. The key comparison resets the
  // *derived* handshake synchronously without scheduling state during render;
  // callbacks carry the key so stale bridge cleanups cannot overwrite a new
  // controller/mode generation.
  const chromeHandshakeKey = `${controller.id}:${record.chromeMode}`;
  const chromeHandshakeKeyRef = React.useRef(chromeHandshakeKey);
  chromeHandshakeKeyRef.current = chromeHandshakeKey;
  const [chromeHandshake, setChromeHandshake] = useState(
    () => ({ key: chromeHandshakeKey, ready: false, failed: false }),
  );
  const currentChromeHandshake = chromeHandshake.key === chromeHandshakeKey
    ? chromeHandshake
    : { key: chromeHandshakeKey, ready: false, failed: false };
  const chromeReady = record.chromeMode === "custom" && currentChromeHandshake.ready;
  const chromeFailed = currentChromeHandshake.failed;
  const chromeSlot = useMemo(() => ({
    slotElement: chromeSlotNode,
    reportChromeReady: () => setChromeHandshake((state) => chromeHandshakeKeyRef.current === chromeHandshakeKey
      ? { key: chromeHandshakeKey, ready: true, failed: state.key === chromeHandshakeKey && state.failed }
      : state),
    reportChromeDetached: () => setChromeHandshake((state) => chromeHandshakeKeyRef.current === chromeHandshakeKey
      ? { key: chromeHandshakeKey, ready: false, failed: state.key === chromeHandshakeKey && state.failed }
      : state),
    reportChromeFailure: () => setChromeHandshake((state) => chromeHandshakeKeyRef.current === chromeHandshakeKey
      ? { key: chromeHandshakeKey, ready: false, failed: true }
      : state),
  }), [chromeHandshakeKey, chromeSlotNode]);
  const presentation = resolveWindowPresentation(record, screen);
  const focusPort = useRuntimeNSEFocusPort(controller.windowResponderId);
  const overlayPort = useRuntimeNSEOverlayPort(controller.windowResponderId);
  const controlPort = useRuntimeNSEControlPort();
  const transientBridge = useMemo(() => record.applicationId && record.applicationSessionId
    ? createTransientWindowSurfaceBridge({
        runtime,
        renderers,
        physicalHostId: `window:${controller.id}`,
        owner: {
          workspaceId: record.workspaceId,
          applicationId: record.applicationId,
          applicationSessionId: record.applicationSessionId,
        },
        restoreFocus: (anchor) => overlayPort.restoreFocus(controller.windowResponderId, anchor),
      })
    : null, [controller.id, overlayPort, record.applicationId, record.applicationSessionId, record.workspaceId, renderers, runtime]);
  const childTransientBridge = useMemo(() => transientBridge ? {
    present: (request: Parameters<typeof transientBridge.present>[0], content: Parameters<typeof transientBridge.present>[1]) => (
      transientBridge.present({ ...request, parentWindowControllerId: controller.id }, content)
    ),
    dismiss: transientBridge.dismiss,
  } : null, [controller.id, transientBridge]);
  useNSEDeferredDisposal(transientBridge);
  const moveHandleProps = useWindowMoveResize({
    manager,
    windowControllerId: controller.id,
    gesture: { kind: "move" },
    disabled: !presentation.movable,
  });
  const blockStart = useWindowMoveResize({ manager, windowControllerId: controller.id, gesture: { kind: "resize", edge: "block-start" }, disabled: !presentation.resizable });
  const blockEnd = useWindowMoveResize({ manager, windowControllerId: controller.id, gesture: { kind: "resize", edge: "block-end" }, disabled: !presentation.resizable });
  const inlineStart = useWindowMoveResize({ manager, windowControllerId: controller.id, gesture: { kind: "resize", edge: "inline-start" }, disabled: !presentation.resizable });
  const inlineEnd = useWindowMoveResize({ manager, windowControllerId: controller.id, gesture: { kind: "resize", edge: "inline-end" }, disabled: !presentation.resizable });
  const blockStartInlineStart = useWindowMoveResize({ manager, windowControllerId: controller.id, gesture: { kind: "resize", edge: "block-start-inline-start" }, disabled: !presentation.resizable });
  const blockStartInlineEnd = useWindowMoveResize({ manager, windowControllerId: controller.id, gesture: { kind: "resize", edge: "block-start-inline-end" }, disabled: !presentation.resizable });
  const blockEndInlineStart = useWindowMoveResize({ manager, windowControllerId: controller.id, gesture: { kind: "resize", edge: "block-end-inline-start" }, disabled: !presentation.resizable });
  const blockEndInlineEnd = useWindowMoveResize({ manager, windowControllerId: controller.id, gesture: { kind: "resize", edge: "block-end-inline-end" }, disabled: !presentation.resizable });
  const resizeHandleProps = useMemo(() => ({
    "block-start": blockStart,
    "block-end": blockEnd,
    "inline-start": inlineStart,
    "inline-end": inlineEnd,
    "block-start-inline-start": blockStartInlineStart,
    "block-start-inline-end": blockStartInlineEnd,
    "block-end-inline-start": blockEndInlineStart,
    "block-end-inline-end": blockEndInlineEnd,
  }), [blockEnd, blockEndInlineEnd, blockEndInlineStart, blockStart, blockStartInlineEnd, blockStartInlineStart, inlineEnd, inlineStart]);
  const recordGeometryIsValid = validGeometry(record.bounds);
  const geometryIsValid = recordGeometryIsValid && validGeometry(presentation.bounds);
  const invalidBounds = recordGeometryIsValid ? presentation.bounds : record.bounds;
  useEffect(() => {
    if (geometryIsValid) return;
    onDiagnostic?.({
      code: "WINDOW_PRESENTATION_GEOMETRY_INVALID",
      windowControllerId: controller.id,
      bounds: invalidBounds,
    });
  }, [controller.id, geometryIsValid, invalidBounds, onDiagnostic]);
  const hostRef = useRef<HTMLDivElement>(null);
  // The window surface clips to its rounded outline, and a fixed-position
  // popup does not escape a clip-path. Menus and popovers opened from the
  // window's content mount here, beside the surface, so they can hang past
  // the window's edge as a menu does.
  const [overlayLayerNode, setOverlayLayerNode] = useState<HTMLDivElement | null>(null);
  useNSEPresentation(hostRef, windowHostMotion);
  // Closing commits the record as closed and removes the controller in one
  // batch, so by the time NSEPresence holds this host for its exit there is
  // no open window left to draw. The host keeps its last open frame for the
  // exit fade, inert, rather than cutting.
  const exiting = useNSEPresenceExiting();
  const lastFrameRef = useRef<{ readonly style: React.CSSProperties; readonly contents: React.ReactNode } | null>(null);
  const hostRendered = record.state === "open" &&
    contentState.status === "loaded" &&
    contentRendererAvailable &&
    presentation.visible &&
    geometryIsValid;
  // A panel or popover that opens key takes keyboard focus, as a key window's
  // initial first responder does, so Escape and Return reach it. Sheets and
  // modals get this from their FocusScope. Content may name its initial
  // responder with data-nse-initial-focus; otherwise its first focusable
  // control, then the title-bar controls. Only on opening: later key changes
  // come from a click or a command that already placed focus.
  const openedKey = hostRendered && record.isKey;
  useEffect(() => {
    if (!openedKey || (record.role !== "panel" && record.role !== "popover")) return;
    const host = hostRef.current;
    const active = host?.ownerDocument.activeElement;
    if (!host || (active && host.contains(active))) return;
    const target = host.querySelector<HTMLElement>(`.nse-window__content [data-nse-initial-focus]:not([disabled])`) ??
      host.querySelector<HTMLElement>(`.nse-window__content :is(${windowFocusableSelector})`) ??
      host.querySelector<HTMLElement>(windowFocusableSelector);
    target?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, [controller.id, openedKey]);

  if (
    record.state !== "open" ||
    contentState.status !== "loaded" ||
    !contentRendererAvailable ||
    !presentation.visible ||
    !geometryIsValid
  ) {
    const lastFrame = lastFrameRef.current;
    if (!exiting || !lastFrame) return null;
    return (
      <div
        ref={hostRef}
        className="webspring-window-host"
        data-window-host={record.id}
        data-window-exiting=""
        aria-hidden
        inert
        style={{ ...lastFrame.style, pointerEvents: "none" }}
      >
        {lastFrame.contents}
      </div>
    );
  }

  const View = viewByRole[record.role];
  const blocked = managerSnapshot.blockedWindowControllerIds.includes(record.id);
  const dirty = managerSnapshot.dirtyWindowControllerIds.includes(record.id);
  const parentController = record.parentWindowControllerId
    ? manager.select(record.parentWindowControllerId)
    : null;
  const parentResponderId = parentController?.windowResponderId ??
    (record.applicationSessionId ? `application:${record.applicationSessionId}` : "workspace");
  const parentScopeId = parentController && (parentController.record.role === "modal" || parentController.record.role === "sheet")
    ? `window:${parentController.id}`
    : undefined;
  const hostedContent = renderers.render(contentState.mountKey, {
    mountKey: contentState.mountKey,
    window: record,
    presentation,
  });
  const customChromeActive = chromeReady && !chromeFailed;
  // The slot node must exist BEFORE the handshake can complete: the bridge
  // needs a portal target to mount and report ready. Render it for every
  // declared-custom window (the empty div collapses until chrome arrives);
  // paint suppression still waits for customChromeActive.
  const chromeSlotWanted = record.chromeMode === "custom" && !chromeFailed;
  const runtimeHostedContent = (
    <WindowChromeSlotContext.Provider value={chromeSlot}>
      <NSEOverlayProvider
        runtimePort={overlayPort}
        defaultParentResponderId={controller.windowResponderId}
        portalContainer={overlayLayerNode}
      >
        <NSEControlRuntimeProvider port={controlPort}>
          <NSEFocusPortProvider port={focusPort}>
            {childTransientBridge ? (
              <NSEWindowSurfaceBridgeProvider bridge={childTransientBridge}>{hostedContent}</NSEWindowSurfaceBridgeProvider>
            ) : hostedContent}
          </NSEFocusPortProvider>
        </NSEControlRuntimeProvider>
      </NSEOverlayProvider>
    </WindowChromeSlotContext.Provider>
  );
  const view = (
    <View
      record={record}
      presentation={presentation}
      zoomed={controller.geometryState.zoomed}
      blocked={blocked}
      dirty={dirty}
      customChromeActive={customChromeActive}
      customTitleBarSlotRef={chromeSlotWanted ? setChromeSlotNode : undefined}
      dispatchCommand={(commandId, payload) => commands.dispatch(commandId, payload, { source: "toolbar" })}
      moveHandleProps={moveHandleProps}
      resizeHandleProps={resizeHandleProps}
    >
      {runtimeHostedContent}
    </View>
  );
  const windowContents = (
    <>
      {view}
      <div ref={setOverlayLayerNode} data-window-overlay-layer="" style={{ display: "contents" }} />
    </>
  );
  const hostStyle: React.CSSProperties = {
    position: "absolute",
    left: presentation.bounds.x,
    top: presentation.bounds.y,
    width: presentation.bounds.width,
    height: presentation.bounds.height,
    zIndex: record.zIndex,
  };
  // A modal's focus scope is not kept: an exiting sheet traps nothing.
  lastFrameRef.current = { style: hostStyle, contents: windowContents };
  return (
    // Exit fade only (no enter animation): a closing window dissolves instead
    // of cutting, so Quit-with-windows reads as one continuous exit rather
    // than a flash. NSEPresence in WindowLayer owns the unmount.
    <div
      ref={hostRef}
      className="webspring-window-host"
      data-window-host={record.id}
      aria-hidden={blocked ? true : undefined}
      onPointerDownCapture={(event) => {
        const target = event.target;
        if (record.state === "open" && !(target instanceof Element && target.closest("[data-window-control]"))) {
          manager.makeKey(controller.id);
        }
      }}
      style={hostStyle}
    >
      {record.role === "modal" || record.role === "sheet" ? (
        <FocusScope
          scopeId={`window:${record.id}`}
          kind="modal"
          parentScopeId={parentScopeId}
          parentResponderId={parentResponderId}
          modal
          trapFocus
          externallyManagedScope
          externallyManagedInert
        >
          {windowContents}
        </FocusScope>
      ) : windowContents}
    </div>
  );
}
