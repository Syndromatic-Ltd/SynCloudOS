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

import { WindowPresentationSlot, useWindowPresentationContent } from "../WindowPresentationContent";
import { isNSEDOMElement, WindowLayoutContext, WindowLayoutModel } from "../../NSE/hostComposition";

import React, { useCallback, useLayoutEffect, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useNSEPresenceExiting, useNSEPresentation, type PresentationSpec } from "../../NSE/Animation";
import {
  ControlRuntimeProvider,
  FocusPortProvider,
  OverlayProvider,
  TooltipProvider,
  WindowSurfaceBridgeProvider,
  BorderlessWindowView,
  HUDWindowView,
  ModalWindowView,
  PanelView,
  PopoverWindowView,
  SheetView,
  StandardWindowView,
  type WindowViewRenderer,
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
import { useWindowMoveResize } from "./useWindowMoveResize";
import type { WindowContentRendererRegistry } from "./WindowContentRendererRegistry";
import { PopoverWindowSurface } from "./PopoverWindowSurface";
import { ResponderHierarchyContext } from "../../SynCloudOSReact";
import { FocusScopeIdContext } from "../../SynCloudOSReact";

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
  readonly detached?: boolean;
}

const viewByRole: Readonly<Record<WindowRole, WindowViewRenderer>> = Object.freeze({
  standard: StandardWindowView,
  panel: PanelView,
  hud: HUDWindowView,
  modal: ModalWindowView,
  sheet: SheetView,
  popover: PopoverWindowView,
  borderless: BorderlessWindowView,
});

/** A closing window dissolves over 0.16 s. */
const windowFocusableSelector = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable=true], [tabindex]:not([tabindex='-1'])";

const windowHostMotion = Object.freeze({
  exit: Object.freeze({
    duration: 0.16,
    timing: "linear",
    tracks: Object.freeze([Object.freeze({ keyPath: "opacity", values: Object.freeze([1, 0]) })]),
  }) satisfies PresentationSpec,
});
const popoverWindowMotion = { exit: { duration: 0.15, timing: "linear", tracks: [{ keyPath: "opacity", values: [1, 1] }] } } satisfies Parameters<typeof useNSEPresentation>[1];

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
  detached = false,
}: WindowHostProps) {
  const runtime = useKernelSynCloudOS();
  const sharedPresentation = useWindowPresentationContent();
  const record = useSyncExternalStore(controller.subscribe, () => controller.record, () => controller.record);
  const contentState = useSyncExternalStore(controller.subscribe, () => controller.contentState, () => controller.contentState);
  useSyncExternalStore(renderers.subscribe, () => renderers.revision, () => renderers.revision);
  const contentRendererAvailable = contentState.status === "loaded" && renderers.has(contentState.mountKey);
  const surface = contentState.status === "loaded" ? renderers.surface(contentState.mountKey) : null;
  const popoverSurface = surface && (record.role === "popover" || record.role === "sheet" && surface.request.drawsBackground !== undefined) ? surface : null;
  const wasPopoverSurface = useRef(false);
  if (popoverSurface) wasPopoverSurface.current = true;
  const presentation = detached ? {
    kind: "desktop-window" as const,
    visible: true,
    bounds: screen.workArea,
    safeAreaInsets: screen.safeAreaInsets,
    movable: false,
    resizable: false,
    titleBarVisible: true,
  } : resolveWindowPresentation(record, screen, controller.geometryState);
  const compactPopover = Boolean(popoverSurface && (presentation.kind === "mobile-sheet" || popoverSurface.request.presentation?.mode === "sheet"));
  const ownsPopoverFocus = record.role === "popover" && popoverSurface !== null;
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
  const layout = useMemo(() => new WindowLayoutModel(), [controller.id]);
  useNSEDeferredDisposal(layout);
  // A host with invalid geometry is omitted and reported, so it has no bounds to lay out against.
  useLayoutEffect(() => {
    layout.setLogicalScreenInsets(presentation.safeAreaInsets, detached ? undefined : screen.layoutViewport);
    if (geometryIsValid) layout.setBounds(presentation.bounds);
  }, [detached, layout, screen.layoutViewport, presentation.safeAreaInsets, presentation.bounds, geometryIsValid]);
  useLayoutEffect(() => hostRef.current ? layout.connectRoot(hostRef.current) : undefined, [layout, record.state, contentRendererAvailable]);
  // The window surface clips to its rounded outline, and a fixed-position
  // popup does not escape a clip-path. Menus and popovers opened from the
  // window's content mount here, beside the surface, so they can hang past
  // the window's edge as a menu does.
  const [overlayLayerNode, setOverlayLayerNode] = useState<HTMLDivElement | null>(null);
  useNSEPresentation(hostRef, wasPopoverSurface.current ? popoverWindowMotion : windowHostMotion);
  // Closing commits the record as closed and removes the controller in one
  // batch, so by the time NSEPresence holds this host for its exit there is
  // no open window left to draw. The host keeps its last open frame for the
  // exit fade, inert, rather than cutting.
  const exiting = useNSEPresenceExiting();
  const lastFrameRef = useRef<{
    readonly style: React.CSSProperties;
    readonly contents: React.ReactNode;
    readonly popoverScope?: { readonly parentResponderId: string; readonly parentScopeId?: string };
  } | null>(null);
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
  const contentGeneration = contentState.status === "loaded" ? contentState.mountKey : null;
  useEffect(() => {
    if (!openedKey || (record.role !== "panel" && record.role !== "popover" && !popoverSurface)) return;
    const host = hostRef.current;
    if (!host) return;
    const surface = host.querySelector<HTMLElement>("[data-nse-window-popover]");
    let observer: MutationObserver | null = null;
    const focusInitialControl = () => {
      const active = host.ownerDocument.activeElement;
      const initialResponder = host.querySelector<HTMLElement>("[data-nse-view-controller][tabindex]") ?? surface;
      const target = host.querySelector<HTMLElement>(`.nse-window__content [data-nse-initial-focus]:not([disabled])`) ??
        host.querySelector<HTMLElement>(`.nse-window__content :is(${windowFocusableSelector})`) ??
        host.querySelector<HTMLElement>(windowFocusableSelector);
      if (active && host.contains(active) && active !== surface && active !== initialResponder) { observer?.disconnect(); return true; }
      if (target) {
        target.focus({ preventScroll: true });
        const focused = host.ownerDocument.activeElement === target || target.contains(host.ownerDocument.activeElement);
        if (focused) observer?.disconnect();
        return focused;
      }
      // A presented controller is a valid first responder even while every
      // command button is validating, including inside a modal compact sheet.
      initialResponder?.focus({ preventScroll: true });
      return false;
    };
    if (!focusInitialControl()) {
      // Command controls arrive disabled until asynchronous validation has
      // settled. Complete the opening handoff when the first one is ready.
      const Observer = host.ownerDocument.defaultView?.MutationObserver;
      observer = Observer ? new Observer(focusInitialControl) : null;
      observer?.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "data-nse-positioned", "hidden", "inert", "style"] });
    }
    return () => observer?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, [contentGeneration, controller.id, openedKey]);

  if (
    record.state !== "open" ||
    contentState.status !== "loaded" ||
    !contentRendererAvailable ||
    !presentation.visible ||
    !geometryIsValid
  ) {
    const lastFrame = lastFrameRef.current;
    if (!exiting || !lastFrame) return null;
    // The same provider as the open frame keeps the tree's shape, so the exit
    // keeps the mounted contents rather than remounting them empty.
    return (
      <WindowLayoutContext.Provider value={layout}>
      <div
        ref={hostRef}
        className="webspring-window-host"
        data-window-host={record.id}
        data-window-exiting=""
        aria-hidden
        inert
        style={{ ...lastFrame.style, pointerEvents: "none" }}
      >
        {lastFrame.popoverScope ? <FocusScope
          scopeId={`window:${record.id}`} kind="popover"
          parentScopeId={lastFrame.popoverScope.parentScopeId}
          parentResponderId={lastFrame.popoverScope.parentResponderId}
          modal={false} trapFocus={false} restoreFocus={false}
          externallyManagedScope externallyManagedInert
        >{lastFrame.contents}</FocusScope> : lastFrame.contents}
      </div>
      </WindowLayoutContext.Provider>
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
  const hostedContent = sharedPresentation && record.role === "standard" && record.content.rendererId === "application"
    ? <WindowPresentationSlot windowId={record.id} priority={detached ? 3 : 1} bridge={childTransientBridge} overlay={overlayLayerNode} />
    : renderers.render(contentState.mountKey, {
    mountKey: contentState.mountKey,
    window: record,
    presentation,
  });
  const surfaceContent = popoverSurface
    ? <PopoverWindowSurface key={contentState.mountKey} surface={popoverSurface} windowControllerId={controller.id} anchored={record.role === "popover" && !compactPopover}>
        <FocusScopeIdContext.Provider value={`window:${record.id}`}>
          <ResponderHierarchyContext.Provider value={{
            runtimeId: runtime.runtimeId,
            responderId: popoverSurface.request.parentResponderId ?? controller.windowResponderId,
            windowResponderId: controller.windowResponderId,
            applicationResponderId: record.applicationSessionId ? `application:${record.applicationSessionId}` : undefined,
          }}>{hostedContent}</ResponderHierarchyContext.Provider>
        </FocusScopeIdContext.Provider>
      </PopoverWindowSurface>
    : hostedContent;
  const runtimeHostedContent = (
      <OverlayProvider
        runtimePort={overlayPort}
        defaultParentResponderId={controller.windowResponderId}
        portalContainer={overlayLayerNode}
      >
        <TooltipProvider>
        <ControlRuntimeProvider port={controlPort}>
          <FocusPortProvider port={focusPort}>
            {childTransientBridge ? (
              <WindowSurfaceBridgeProvider bridge={childTransientBridge}>{surfaceContent}</WindowSurfaceBridgeProvider>
            ) : surfaceContent}
          </FocusPortProvider>
        </ControlRuntimeProvider>
      </TooltipProvider>
      </OverlayProvider>
  );
  const view = popoverSurface ? runtimeHostedContent : (
    <View
      record={record}
      presentation={presentation}
      zoomed={controller.geometryState.zoomed}
      blocked={blocked}
      dirty={dirty}
      dispatchCommand={(commandId, payload) => commands.dispatch(commandId, payload, { source: "toolbar" })}
      presentationControl={sharedPresentation && record.role === "standard" && record.content.rendererId === "application" &&
        manager.host.capabilities.separateSurfaces && presentation.kind === "desktop-window" &&
        !record.parentWindowControllerId ? <button type="button" className="nse-window__transfer-control" data-nse-part="button" data-nse-role="transfer"
          aria-label={detached ? "Reattach to Webspring" : "Detach Window"} data-window-transfer="" data-window-no-drag=""
          onClick={() => { if (detached) void manager.reattach(record.id); else void manager.detach(record.id); }}>
          {detached ? "↙" : "↗"}
        </button> : undefined}
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
  const sheetInset = Math.max(8, presentation.safeAreaInsets.blockEnd);
  const sheetBounds = compactPopover ? {
    x: screen.visualViewport.x + Math.max(8, presentation.safeAreaInsets.inlineStart),
    y: screen.visualViewport.y + screen.visualViewport.height - sheetInset - presentation.bounds.height,
    width: Math.min(presentation.bounds.width, screen.visualViewport.width - Math.max(8, presentation.safeAreaInsets.inlineStart) - Math.max(8, presentation.safeAreaInsets.inlineEnd)),
    height: presentation.bounds.height,
  } : presentation.bounds;
  const hostStyle: React.CSSProperties = detached ? { position: "absolute", inset: 0, zIndex: record.zIndex } : {
    position: "absolute",
    left: sheetBounds.x,
    top: sheetBounds.y,
    width: sheetBounds.width,
    height: sheetBounds.height,
    zIndex: record.zIndex,
  };
  // A modal's focus scope is not kept: an exiting sheet traps nothing.
  lastFrameRef.current = { style: hostStyle, contents: windowContents,
    ...(ownsPopoverFocus ? { popoverScope: { parentScopeId, parentResponderId: popoverSurface?.request.parentResponderId ?? parentResponderId } } : {}),
  };
  return (
    <WindowLayoutContext.Provider value={layout}>
    {/* Exit fade only (no enter animation): a closing window dissolves instead
     * of cutting, so Quit-with-windows reads as one continuous exit rather
     * than a flash. NSEPresence in WindowLayer owns the unmount. */}
    <div
      ref={hostRef}
      className="webspring-window-host"
      data-window-host={record.id}
      aria-hidden={blocked ? true : undefined}
      onPointerDownCapture={(event) => {
        const target = event.target;
        if (record.state === "open" && !(isNSEDOMElement(target) && target.closest("[data-window-control]"))) {
          manager.makeKey(controller.id);
        }
      }}
      style={hostStyle}
    >
      {record.role === "modal" || record.role === "sheet" || ownsPopoverFocus ? (
        <FocusScope
          scopeId={`window:${record.id}`}
          kind={ownsPopoverFocus ? "popover" : "modal"}
          parentScopeId={parentScopeId}
          parentResponderId={ownsPopoverFocus ? popoverSurface?.request.parentResponderId ?? parentResponderId : parentResponderId}
          modal={!ownsPopoverFocus || compactPopover}
          trapFocus={!ownsPopoverFocus || compactPopover}
          restoreFocus={!ownsPopoverFocus}
          externallyManagedScope={!ownsPopoverFocus}
          externallyManagedInert
        >
          {windowContents}
        </FocusScope>
      ) : windowContents}
    </div>
    </WindowLayoutContext.Provider>
  );
}
