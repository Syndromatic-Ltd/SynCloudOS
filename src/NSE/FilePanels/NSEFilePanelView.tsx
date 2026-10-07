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

import { useCallback, useEffect, useMemo, useState } from "react";
import { NSEPopup, reportNSEWindowSurfaceError, useNSEWindowSurfaceLifecycle, useOptionalNSEWindowSurfaceBridge, type NSEOverlayDismissReason, type NSEWindowSurfaceBridge } from "../Overlays";
import { useNSEPresentedContent } from "../Overlays/useNSEPresentedContent";
import { NSEWindowFittingContent, centredWindowBounds, type NSEWindowFittingSize } from "../Overlays/NSEWindowFittingContent";
import type { FilePanelResult, FilePanelSaveTarget } from "../../SynCloudOS/SynCloudOS";

export type NSEFilePanelWindowRole = "panel" | "sheet";

export interface NSEFilePanelWindowRequest {
  readonly id: string;
  readonly role: NSEFilePanelWindowRole;
  /** Null denotes a top-level application-stage panel. */
  readonly parentWindowControllerId: string | null;
}

/** Window-host seam: the application owns WindowManager records and renderers. */
export interface NSEFilePanelWindowBridge {
  open?(request: NSEFilePanelWindowRequest): void;
  close?(request: NSEFilePanelWindowRequest): void;
  present?: NSEWindowSurfaceBridge["present"];
  dismiss?: NSEWindowSurfaceBridge["dismiss"];
}

export interface NSEFilePanelViewProps {
  readonly id: string;
  readonly open: boolean;
  readonly anchor: HTMLElement | null;
  readonly parentResponderId: string;
  readonly parentScopeId?: string;
  /** Null denotes a top-level application-stage panel. */
  readonly parentWindowControllerId: string | null;
  readonly compact?: boolean;
  readonly title: string;
  readonly windowBridge?: NSEFilePanelWindowBridge;
  readonly result: FilePanelResult<unknown> | FilePanelResult<FilePanelSaveTarget> | null;
  readonly children: React.ReactNode;
  onOpenChange(open: boolean, reason: NSEOverlayDismissReason): void;
}

function resultMessage(result: NSEFilePanelViewProps["result"]): string | null {
  if (!result || result.kind === "accepted" || result.kind === "cancelled") return null;
  if (result.kind === "choose-another") return "Choose another destination.";
  if (result.kind === "unavailable") return result.message;
  if (result.kind === "denied" || result.kind === "revoked" || result.kind === "interrupted" || result.kind === "error") return result.message;
  return null;
}

/**
 * The overlay runtime supplies the focus boundary. The window runtime owns the physical panel or
 * sheet through the explicit host bridge; this component never registers a
 * parallel window record.
 */
export function NSEFilePanelView({
  id,
  open,
  anchor,
  parentResponderId,
  parentScopeId,
  parentWindowControllerId,
  compact = false,
  title,
  windowBridge,
  result,
  children,
  onOpenChange,
}: NSEFilePanelViewProps) {
  if (!id.trim()) throw new TypeError("NSE file panel IDs must not be empty.");
  if (!parentResponderId.trim()) throw new TypeError("NSE file panels require a parent responder ID.");
  if (parentWindowControllerId !== null && !parentWindowControllerId.trim()) throw new TypeError("NSE file-panel parent window controller IDs must not be empty.");
  const bridgeRequest = useMemo(() => Object.freeze({
    id,
    role: compact ? "sheet" as const : "panel" as const,
    parentWindowControllerId,
  }), [compact, id, parentWindowControllerId]);
  const hostedBridge = useOptionalNSEWindowSurfaceBridge();
  const canonicalBridge = windowBridge?.present && windowBridge.dismiss ? windowBridge as NSEWindowSurfaceBridge : hostedBridge;
  const handleDidClose = useNSEWindowSurfaceLifecycle({
    bridge: canonicalBridge,
    requestId: id,
    open,
    onDismissRefused: () => onOpenChange(true, "programmatic"),
    onDidClose: () => onOpenChange(false, "programmatic"),
  });
  useEffect(() => {
    if (!open || canonicalBridge) return;
    windowBridge?.open?.(bridgeRequest);
    return () => windowBridge?.close?.(bridgeRequest);
  }, [bridgeRequest, canonicalBridge, open, windowBridge]);
  const message = resultMessage(result);
  const status = result ? result.kind : "ready";
  const dismiss = useCallback((nextOpen: boolean, reason: NSEOverlayDismissReason) => {
    onOpenChange(nextOpen, reason);
  }, [onOpenChange]);

  const content = (
    <section className="nse-file-panel-content" data-nse-part="content" data-nse-control="file-panel" data-state={status}>
      {message ? <p className="nse-file-panel-status" role="status" data-state={status}>{message}</p> : null}
      {children}
    </section>
  );
  // The window follows the panel's content rather than a fixed frame; the
  // fallback size only stands until the first measurement.
  const [fitting, setFitting] = useState<NSEWindowFittingSize | null>(null);
  const onFittingSize = useCallback((next: NSEWindowFittingSize) => {
    setFitting((current) => current && current.width === next.width && current.height === next.height ? current : next);
  }, []);
  const canonicalRequest = useMemo(() => ({
    id,
    role: compact ? "sheet" as const : "panel" as const,
    title,
    parentWindowControllerId,
    anchor,
    bounds: centredWindowBounds(anchor, fitting?.width ?? 420, fitting?.height ?? 180),
    sizing: "content" as const,
    onDidClose: handleDidClose,
  }), [anchor, compact, fitting?.height, fitting?.width, handleDidClose, id, parentWindowControllerId, title]);
  const presentedContent = useNSEPresentedContent(<NSEWindowFittingContent onFittingSize={onFittingSize}>{content}</NSEWindowFittingContent>);
  useEffect(() => {
    if (!open || !canonicalBridge) return;
    canonicalBridge.present(canonicalRequest, presentedContent).catch((error: unknown) => {
      reportNSEWindowSurfaceError(canonicalBridge, error, id, "present");
    });
  }, [canonicalBridge, canonicalRequest, id, open, presentedContent]);
  if (canonicalBridge) return null;
  return (
    <NSEPopup
      id={id}
      open={open}
      anchor={anchor}
      parentResponderId={parentResponderId}
      parentScopeId={parentScopeId}
      presentation={{ mode: compact ? "sheet" : "anchored" }}
      overlayKind={compact ? "action-sheet" : "popover"}
      modal={compact}
      title={title}
      aria-label={title}
      className="nse-file-panel"
      data-nse-control="file-panel"
      data-nse-part="surface"
      data-state={status}
      data-appearance-recipe={`file-panel.${compact ? "sheet" : "panel"}`}
      onOpenChange={dismiss}
    >
      {content}
    </NSEPopup>
  );
}
