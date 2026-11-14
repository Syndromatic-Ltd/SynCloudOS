/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import { SynCloudOSRuntimeContext } from "../../SynCloudOSReact";
import { useNSEAnimationEnvironment } from "../../NSE/Animation";
import { createPortal } from "react-dom";
import { useOptionalNSEWindowSurfaceBridge } from "../../NSE/NSE";
import type { WindowSurfaceBridge, WindowSurfaceRequest } from "../../NSE/NSE";
import { OpenPanelSheetSurface } from "../../NSE/applicationHostInterop";
import { WindowSheetFrame, WindowSheetHostContext } from "./windowChrome";
import type { NSEWindow } from "../../NSE/NSE";
import type { SynWareContextValue } from "../AppSDK/appContextTypes";
import { openPanelFileSystemFor } from "../FilePanels";
import { registerNSEOpenPanelHost, type OpenPanelHost } from "../../NSE/applicationHostInterop";
import { NSEPopup } from "../../NSE/NSE";

const Context = createContext<OpenPanelHost | null>(null);
export function OpenPanelApplicationHost({ value, children }: PropsWithChildren<{ value: SynWareContextValue }>) {
  const bridge = useOptionalNSEWindowSurfaceBridge();
  const runtime = useContext(SynCloudOSRuntimeContext);
  const [compactPanel, setCompactPanel] = useState<{ request: WindowSurfaceRequest; content: ReactNode } | null>(null);
  const currentCompactPanel = useRef(compactPanel); currentCompactPanel.current = compactPanel;
  const presentationBridge = useMemo<WindowSurfaceBridge | null>(() => bridge ? {
    present(request, content) {
      if (value.presentation.getSnapshot().horizontalSizeClass !== "compact") return bridge.present(request, content);
      const panel = { request, content }; currentCompactPanel.current = panel; setCompactPanel(panel); return Promise.resolve(request.id);
    },
    dismiss(id) {
      const panel = currentCompactPanel.current;
      if (!panel || panel.request.id !== id) return bridge.dismiss(id);
      currentCompactPanel.current = null; setCompactPanel(null); panel.request.onDidClose?.();
      return Promise.resolve({ outcome: "closed" });
    },
  } : null, [bridge, value.presentation]);
  const host = useMemo<OpenPanelHost | null>(() => bridge ? {
    bridge: presentationBridge!, images: value.images, signal: value.signal, service: value.filePanels, fileSystem: openPanelFileSystemFor(value.filePanels), responderId: value.responderId,
    isKey: () => { if (runtime && runtime.store.getSnapshot().application.activeAppId !== value.appId) return false; const snapshot = value.windows.getSnapshot(); return snapshot.surface !== "window" || snapshot.current?.isKey === true; },
    // Availability and activation are facts projected by the mounted client.
    isSecureContext: () => openPanelFileSystemFor(value.filePanels)?.isSecureContext() === true,
    hasTransientUserActivation: () => value.filePanels.getStatus().open.activation === "active",
    compact: () => value.presentation.getSnapshot().horizontalSizeClass === "compact",
    frame: () => value.presentation.getSnapshot().contentBounds,
    focusedElement: () => openPanelFileSystemFor(value.filePanels)?.focusedElement() ?? null,
    ...(value.scheduler ? { restoreFocus: (element: HTMLElement) => { value.scheduler.setTimeout(() => { if (!value.signal.aborted && element.isConnected) element.focus(); }, 0); } } : {}),
    ...(value.images.geometry ? { observeGeometry: (element: HTMLElement, listener: () => void) => value.images.geometry!.observe(element, listener) } : {}),
  } : null, [bridge, presentationBridge, runtime, value]);
  useLayoutEffect(() => host ? registerNSEOpenPanelHost(host) : undefined, [host]);
  useEffect(() => () => { currentCompactPanel.current?.request.onDidClose?.(); }, []);
  return <Context.Provider value={host}>{children}{compactPanel ? <OpenPanelSheet request={compactPanel.request} onClose={() => { currentCompactPanel.current = null; setCompactPanel(null); compactPanel.request.onDidClose?.(); }}>{compactPanel.content}</OpenPanelSheet> : null}</Context.Provider>;
}
export function OpenPanelWindowHost({ window, children }: PropsWithChildren<{ window: NSEWindow }>) {
  const host = useContext(Context);
  const bridge = useOptionalNSEWindowSurfaceBridge();
  const [sheet, setSheet] = useState<{ request: WindowSurfaceRequest; content: ReactNode } | null>(null);
  const currentSheet = useRef(sheet); currentSheet.current = sheet;
  const sheetBridge = useMemo<WindowSurfaceBridge | null>(() => host ? {
    present(request, content) {
      if (request.role !== "sheet") return (bridge ?? host.bridge).present(request, content);
      const panel = { request, content }; currentSheet.current = panel; setSheet(panel);
      return Promise.resolve(request.id);
    },
    dismiss(id) {
      const current = currentSheet.current;
      if (!current || current.request.id !== id) return (bridge ?? host.bridge).dismiss(id);
      currentSheet.current = null; setSheet(null); current.request.onDidClose?.();
      return Promise.resolve({ outcome: "closed" });
    },
  } : null, [bridge, host]);
  const owned = useMemo(() => host && sheetBridge ? { ...host, bridge: sheetBridge, isKey: () => window.isKey,
    frame: () => window.frame ?? host.frame() } : null, [host, sheetBridge, window]);
  useLayoutEffect(() => owned ? registerNSEOpenPanelHost(owned, window) : undefined, [owned, window]);
  useEffect(() => () => { currentSheet.current?.request.onDidClose?.(); }, []);
  return <>{children}{sheet ? <OpenPanelSheet request={sheet.request} onClose={() => { currentSheet.current = null; setSheet(null); sheet.request.onDidClose?.(); }}>{sheet.content}</OpenPanelSheet> : null}</>;
}

/** The same window-owned sheet layer and close guard used by NSAlert and custom controller sheets. */
function OpenPanelSheet({ request, onClose, children }: PropsWithChildren<{ request: WindowSurfaceRequest; onClose(): void }>) {
  const sheetHost = useContext(WindowSheetHostContext);
  const { reducedMotion } = useNSEAnimationEnvironment();
  const compact = useContext(Context)?.compact() === true;
  useLayoutEffect(() => sheetHost?.attach(), [sheetHost]);
  if (compact) return <NSEPopup id={request.id} open parentResponderId={request.parentResponderId} anchor={request.anchor}
    presentation={{ mode: "sheet" }} overlayKind="action-sheet" chrome="menu" modal aria-label={request.title} className="nse-open-compact-sheet"
    onOpenChange={open => { if (!open) onClose(); }}>{children}</NSEPopup>;
  const content = <OpenPanelSheetSurface request={request} compact={compact} onClose={onClose}>{children}</OpenPanelSheetSurface>;
  return sheetHost?.layer ? createPortal(<WindowSheetFrame reducedMotion={reducedMotion}>{content}</WindowSheetFrame>, sheetHost.layer) : content;
}
