/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import { SynCloudOSRuntimeContext } from "../../SynCloudOSReact/runtimeContext";
import { useNSEAnimationEnvironment } from "../../NSE/Animation/NSEAnimationEnvironment";
import { createPortal } from "react-dom";
import { useOptionalNSEWindowSurfaceBridge } from "../../NSE/Overlays/NSEWindowSurfaceBridge";
import type { NSEWindowSurfaceBridge, NSEWindowSurfaceRequest } from "../../NSE/Overlays/NSEWindowSurfaceBridge";
import { NSEFocusScope } from "../../NSE/Focus";
import { useNSEAppearance } from "../../NSE/Appearance/NSEAppearanceProvider";
import { NSEWindowSheetFrame, NSEWindowSheetHostContext } from "./windowChrome";
import type { NSEWindow } from "../../NSE/Application/NSEWindowController";
import type { SynWareContextValue } from "../AppSDK/appContextTypes";
import { openPanelFileSystemFor } from "../FilePanels/OpenPanelFileSystem";
import { registerNSEOpenPanelHost, type NSEOpenPanelHost } from "../../NSE/FilePanels/openPanelHost";

const Context = createContext<NSEOpenPanelHost | null>(null);
export function NSEOpenPanelApplicationHost({ value, children }: PropsWithChildren<{ value: SynWareContextValue }>) {
  const bridge = useOptionalNSEWindowSurfaceBridge();
  const runtime = useContext(SynCloudOSRuntimeContext);
  const host = useMemo<NSEOpenPanelHost | null>(() => bridge ? {
    bridge, signal: value.signal, service: value.filePanels, fileSystem: openPanelFileSystemFor(value.filePanels), responderId: value.responderId,
    isKey: () => { if (runtime && runtime.store.getSnapshot().application.activeAppId !== value.appId) return false; const snapshot = value.windows.getSnapshot(); return snapshot.surface !== "window" || snapshot.current?.isKey === true; },
    // Availability and activation are facts projected by the mounted client.
    isSecureContext: () => openPanelFileSystemFor(value.filePanels)?.isSecureContext() === true,
    hasTransientUserActivation: () => value.filePanels.getStatus().open.activation === "active",
    compact: () => value.presentation.getSnapshot().horizontalSizeClass === "compact",
    frame: () => value.presentation.getSnapshot().contentBounds,
    focusedElement: () => openPanelFileSystemFor(value.filePanels)?.focusedElement() ?? null,
    ...(value.images.geometry ? { observeGeometry: (element: HTMLElement, listener: () => void) => value.images.geometry!.observe(element, listener) } : {}),
  } : null, [bridge, runtime, value]);
  useLayoutEffect(() => host ? registerNSEOpenPanelHost(host) : undefined, [host]);
  return <Context.Provider value={host}>{children}</Context.Provider>;
}
export function NSEOpenPanelWindowHost({ window, children }: PropsWithChildren<{ window: NSEWindow }>) {
  const host = useContext(Context);
  const bridge = useOptionalNSEWindowSurfaceBridge();
  const [sheet, setSheet] = useState<{ request: NSEWindowSurfaceRequest; content: ReactNode } | null>(null);
  const currentSheet = useRef(sheet); currentSheet.current = sheet;
  const sheetBridge = useMemo<NSEWindowSurfaceBridge | null>(() => host ? {
    present(request, content) {
      if (request.role !== "sheet") return (bridge ?? host.bridge).present(request, content);
      setSheet({ request, content });
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
function OpenPanelSheet({ request, onClose, children }: PropsWithChildren<{ request: NSEWindowSurfaceRequest; onClose(): void }>) {
  const sheetHost = useContext(NSEWindowSheetHostContext);
  const appearance = useNSEAppearance();
  const { reducedMotion } = useNSEAnimationEnvironment();
  const compact = useContext(Context)?.compact() === true;
  useLayoutEffect(() => sheetHost?.attach(), [sheetHost]);
  const content = <NSEFocusScope options={{ scopeId: request.id, kind: "modal", modal: true, trapFocus: true, asChild: true }}>
    <div className="nse-open-sheet-backdrop nse-window-sheet-backdrop" data-compact={compact || undefined} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
      <section role="dialog" aria-modal="true" aria-label={request.title} data-nse-colour-scheme-resolved={appearance.resolvedColourScheme} className="nse-open-sheet nse-sheet" data-compact={compact || undefined}
        style={{ width: compact ? "100%" : `min(${request.bounds.width}px, calc(100% - 32px))`, height: `min(${request.bounds.height}px, 100%)` }}>{children}</section>
    </div>
  </NSEFocusScope>;
  return sheetHost?.layer ? createPortal(<NSEWindowSheetFrame reducedMotion={reducedMotion}>{content}</NSEWindowSheetFrame>, sheetHost.layer) : content;
}
