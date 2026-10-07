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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NSEPanelView } from "../Windows/NSEPanelView";
import { createCanonicalWindowRecord, freezeWindowRecord } from "../../SynCloudOS/nseRuntimeContracts";
import type { SynCloudOSRuntimeId, WindowPresentation, WindowRecord } from "../../SynCloudOS/SynCloudOS";
import { useNSEAppearanceProjection } from "../Appearance";
import { useNSEOverlayProvider } from "./NSEOverlayProvider";
import { useOptionalNSEWindowSurfaceBridge } from "./NSEWindowSurfaceBridge";
import { reportNSEWindowSurfaceError, useNSEWindowSurfaceLifecycle } from "./useNSEWindowSurfaceLifecycle";
import { useNSEPresentedContent } from "./useNSEPresentedContent";
import { NSEWindowFittingContent, type NSEWindowFittingSize } from "./NSEWindowFittingContent";
import { registerNSEInspectorOrigin } from "../Focus/focusOrigin";

export interface NSEUtilityPanelProps {
  readonly id: string;
  readonly open: boolean;
  readonly title: string;
  /** The control the panel was opened from: it places the panel's first frame. */
  readonly anchor: HTMLElement | null;
  /** Null denotes an application-stage surface with no WindowManager parent. */
  readonly parentWindowControllerId?: string | null;
  readonly children: ReactNode;
  /** "none" lays the content edge to edge under the title bar, for a panel
   * whose bars and wells run out to the frame (the font panel). */
  readonly contentInset?: "standard" | "none";
  /** The panel's close control (or Escape inside it) was used. */
  onClose(): void;
  /** The window host refused to close the panel, which therefore stays open. */
  onDismissRefused?(): void;
}

type Frame = { readonly x: number; readonly y: number };

const EDGE_MARGIN = 12;
const ANCHOR_GAP = 12;
/** A dragged panel keeps this much of its title bar on screen. */
const MINIMUM_VISIBLE = 48;
/** The frame used until the content has been measured (or where it cannot be). */
const PROVISIONAL_SIZE: NSEWindowFittingSize = { width: 320, height: 420 };

/**
 * The panel's frame: its content's size, no taller than the screen allows. A
 * taller panel scrolls its content area, as an NSPanel on a short screen does.
 */
function panelSize(fitting: NSEWindowFittingSize | null, view: Window | null): NSEWindowFittingSize {
  const size = fitting && fitting.width > 0 && fitting.height > 0 ? fitting : PROVISIONAL_SIZE;
  const height = view?.innerHeight;
  return height && size.height > height - 2 * EDGE_MARGIN ? { width: size.width, height: Math.max(120, height - 2 * EDGE_MARGIN) } : size;
}

function viewOf(anchor: HTMLElement | null): Window | null {
  return anchor?.ownerDocument.defaultView ?? (typeof window === "undefined" ? null : window);
}

/**
 * Beside the control that opened it, as an inspector opens beside the thing
 * it inspects: to the inline end if it fits, else the inline start, top
 * aligned with the control and kept on screen.
 */
function frameBeside(anchor: HTMLElement | null, size: NSEWindowFittingSize): Frame {
  const view = viewOf(anchor);
  const width = view?.innerWidth ?? 1280;
  const height = view?.innerHeight ?? 800;
  const rect = anchor?.isConnected ? anchor.getBoundingClientRect() : null;
  if (!rect) return { x: Math.max(EDGE_MARGIN, Math.round((width - size.width) / 2)), y: Math.round(height * 0.18) };
  const after = rect.right + ANCHOR_GAP;
  const before = rect.left - ANCHOR_GAP - size.width;
  const x = after + size.width <= width - EDGE_MARGIN ? after : before >= EDGE_MARGIN ? before : width - EDGE_MARGIN - size.width;
  const y = Math.min(rect.top - 40, height - EDGE_MARGIN - size.height);
  return { x: Math.round(Math.max(EDGE_MARGIN, x)), y: Math.round(Math.max(EDGE_MARGIN, y)) };
}

/** The whole frame on screen, as a window is brought back when it or the screen changes size. */
function keepOnScreen(frame: Frame, size: NSEWindowFittingSize, view: Window | null): Frame {
  const width = view?.innerWidth ?? 1280;
  const height = view?.innerHeight ?? 800;
  const x = Math.max(EDGE_MARGIN, Math.min(frame.x, width - EDGE_MARGIN - size.width));
  const y = Math.max(EDGE_MARGIN, Math.min(frame.y, height - EDGE_MARGIN - size.height));
  return x === frame.x && y === frame.y ? frame : { x, y };
}

/** A closing panel fades out over the same 0.16 s as a closing window. */
const CLOSE_FADE_MS = 160;

function clampFrame(frame: Frame, size: NSEWindowFittingSize, view: Window | null): Frame {
  const width = view?.innerWidth ?? 1280;
  const height = view?.innerHeight ?? 800;
  return {
    x: Math.min(Math.max(frame.x, MINIMUM_VISIBLE - size.width), width - MINIMUM_VISIBLE),
    y: Math.min(Math.max(frame.y, 0), height - MINIMUM_VISIBLE),
  };
}

/**
 * A non-modal utility panel: the inspector form of NSPanel, as the colour and
 * font panels are. It floats above the application, never takes focus when it
 * opens, stays open while the user works in the document, moves by its title
 * bar and closes only from its close control.
 *
 * A host with a window manager receives it as a floating `panel` window. A
 * standalone host draws the same NSEPanelView in its overlay layer, positioned
 * and moved here; it is not an overlay registration, so clicks elsewhere and
 * focus moving on leave it open.
 */
export function NSEUtilityPanel({ id, open, title, anchor, parentWindowControllerId = null, children, contentInset = "standard", onClose, onDismissRefused }: NSEUtilityPanelProps) {
  const bridge = useOptionalNSEWindowSurfaceBridge();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const handleDidClose = useNSEWindowSurfaceLifecycle({
    bridge,
    requestId: id,
    open,
    onDismissRefused: () => onDismissRefused?.(),
    onDidClose: () => onCloseRef.current(),
  });
  const [fitting, setFitting] = useState<NSEWindowFittingSize | null>(null);
  const onFittingSize = useCallback((next: NSEWindowFittingSize) => {
    setFitting((current) => current && current.width === next.width && current.height === next.height ? current : next);
  }, []);
  // Register before the host's initial focus effect. The whole window belongs
  // to this origin, including its title bar and its portalled child menus.
  const releaseOrigin = useRef<(() => void) | null>(null);
  const bindOrigin = useCallback((body: HTMLDivElement | null) => {
    releaseOrigin.current?.();
    releaseOrigin.current = body && open
      ? registerNSEInspectorOrigin(body.closest("[data-window-host], .nse-utility-panel") ?? body, anchor)
      : null;
  }, [anchor, open]);
  const presentedContent = useNSEPresentedContent(<NSEWindowFittingContent onFittingSize={onFittingSize}><div ref={bindOrigin} className="nse-utility-panel-body" data-content-inset={contentInset}>{children}</div></NSEWindowFittingContent>);
  const request = useMemo(() => {
    const size = panelSize(fitting, viewOf(anchor));
    return {
      id,
      role: "panel" as const,
      title,
      parentWindowControllerId,
      anchor,
      bounds: { ...frameBeside(anchor, size), ...size },
      sizing: "content" as const,
      onDidClose: handleDidClose,
    };
    // The position places the window when it opens; once open, the host keeps
    // wherever the user has moved it and follows only the size.
  }, [anchor, fitting, handleDidClose, id, parentWindowControllerId, title]);
  useEffect(() => {
    if (!open || !bridge) return;
    bridge.present(request, presentedContent).catch((error: unknown) => reportNSEWindowSurfaceError(bridge, error, id, "present"));
  }, [bridge, id, open, presentedContent, request]);
  // A closed panel stays drawn while it fades out; reopening during the fade
  // takes it back.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const onExited = useCallback(() => setMounted(false), []);
  if (bridge || !mounted) return null;
  return <StandaloneUtilityPanel id={id} title={title} anchor={anchor} fitting={fitting} closing={!open} onExited={onExited} onClose={() => onCloseRef.current()}>{presentedContent}</StandaloneUtilityPanel>;
}

function StandaloneUtilityPanel({ id, title, anchor, fitting, closing, onExited, onClose, children }: {
  readonly id: string;
  readonly title: string;
  readonly anchor: HTMLElement | null;
  readonly fitting: NSEWindowFittingSize | null;
  readonly closing: boolean;
  readonly children: ReactNode;
  onExited(): void;
  onClose(): void;
}) {
  const { portalHost, runtime } = useNSEOverlayProvider();
  const appearanceProjection = useNSEAppearanceProjection();
  const [frame, setFrame] = useState<Frame | null>(null);
  const drag = useRef<{ readonly pointerId: number; readonly originX: number; readonly originY: number; readonly frame: Frame } | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  // Closing while the user works inside the panel returns them to the control
  // it serves; closing it from elsewhere leaves their focus where it is. This
  // happens as the fade begins (and, on an abrupt unmount, in the layout
  // cleanup, which runs before the surface leaves the document).
  const returnFocus = useCallback(() => {
    const surface = surfaceRef.current;
    if (surface?.contains(surface.ownerDocument.activeElement) && anchorRef.current?.isConnected) anchorRef.current.focus();
  }, []);
  useLayoutEffect(() => returnFocus, [returnFocus]);
  const view = runtime.environment.browser.getWindow();
  useLayoutEffect(() => {
    if (!closing) return;
    returnFocus();
    const reduced = view?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const handle = runtime.environment.setTimeout(onExited, reduced ? 0 : CLOSE_FADE_MS);
    return () => runtime.environment.clearTimeout(handle);
  }, [closing, onExited, returnFocus, runtime, view]);
  // The first measured size places the panel, before that frame paints.
  const size = panelSize(fitting, view);
  useLayoutEffect(() => {
    if (!fitting || frame) return;
    setFrame(frameBeside(anchor, size));
  }, [anchor, fitting, frame, size]);
  // A panel that grows (a taller picker) or a screen that shrinks brings the
  // whole panel back on screen; a drag may still leave it partly off.
  const { width, height } = size;
  useLayoutEffect(() => {
    setFrame((current) => current && keepOnScreen(current, { width, height }, view));
  }, [height, view, width]);
  useEffect(() => {
    if (!view) return;
    const onResize = () => setFrame((current) => current && keepOnScreen(current, panelSize(fitting, view), view));
    view.addEventListener("resize", onResize);
    return () => view.removeEventListener("resize", onResize);
  }, [fitting, view]);
  const record = useMemo<WindowRecord>(() => {
    const canonical = createCanonicalWindowRecord({
      workspaceId: "standalone",
      applicationId: "standalone",
      applicationSessionId: "standalone",
      documentId: null,
      documentAssociationRole: null,
      representedDocument: null,
      toolbar: null,
      role: "panel",
      style: ["titled", "closable"],
      title,
      content: { rendererId: "nse-utility-panel", parameters: null },
      bounds: { x: 0, y: 0, width: size.width, height: size.height },
      minimumSize: { width: 1, height: 1 },
      maximumSize: null,
      level: "floating",
      parentWindowControllerId: null,
      anchor: null,
      pinned: false,
      mobilePolicy: "sheet",
      restorationKey: `nse-utility-panel.${id}`,
      chromeMode: "system",
      smoothSurface: null,
    }, runtime.runtimeId as SynCloudOSRuntimeId, id);
    return freezeWindowRecord({ ...canonical, state: "open", isKey: true, isMain: false, zIndex: 1 });
  }, [id, runtime.runtimeId, size.height, size.width, title]);
  const presentation = useMemo<WindowPresentation>(() => ({
    kind: "desktop-window",
    visible: true,
    bounds: record.bounds,
    safeAreaInsets: { blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 },
    movable: true,
    resizable: false,
    titleBarVisible: true,
  }), [record.bounds]);
  const moveHandleProps = useMemo<HTMLAttributes<HTMLElement>>(() => ({
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (event.button !== 0 || !frame || (event.target as HTMLElement).closest("button")) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointerId: event.pointerId, originX: event.clientX, originY: event.clientY, frame };
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const active = drag.current;
      if (!active || active.pointerId !== event.pointerId) return;
      setFrame(clampFrame({ x: active.frame.x + event.clientX - active.originX, y: active.frame.y + event.clientY - active.originY }, size, view));
    },
    onPointerUp(event: ReactPointerEvent<HTMLElement>) {
      if (drag.current?.pointerId === event.pointerId) drag.current = null;
    },
    onPointerCancel() {
      drag.current = null;
    },
  }), [frame, size, view]);
  const dispatchCommand = useCallback(async (commandId: string) => {
    if (commandId === "window.close") onClose();
    return { handled: commandId === "window.close" };
  }, [onClose]);
  if (!portalHost) return null;
  return createPortal(
    <div
      ref={surfaceRef}
      className="nse-utility-panel"
      data-nse-utility-panel={id}
      data-state={closing ? "closing" : "open"}
      inert={closing || undefined}
      {...appearanceProjection}
      style={{
        position: "fixed",
        left: frame?.x ?? 0,
        top: frame?.y ?? 0,
        // A provisional frame until the content is measured: the fitting
        // measurement reads the chrome from a laid-out window.
        width: size.width,
        height: size.height,
        // Measured and placed before it is shown.
        visibility: frame ? undefined : "hidden",
      }}
    >
      <NSEPanelView record={record} presentation={presentation} blocked={false} dirty={false} dispatchCommand={dispatchCommand} moveHandleProps={moveHandleProps}>
        {children}
      </NSEPanelView>
    </div>,
    portalHost,
  );
}
