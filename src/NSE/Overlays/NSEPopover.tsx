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

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { NSEPopup, type NSEPopupPresentation } from "./NSEPopup";
import { useNSEOverlayProvider } from "./NSEOverlayProvider";
import type { NSEOverlayDismissReason } from "./overlayTypes";
import { useOptionalNSEWindowSurfaceBridge, type NSEWindowSurfaceBridge } from "./NSEWindowSurfaceBridge";
import { reportNSEWindowSurfaceError, useNSEWindowSurfaceLifecycle } from "./useNSEWindowSurfaceLifecycle";
import { useNSEPresentedContent } from "./useNSEPresentedContent";
import { NSEWindowFittingContent, type NSEWindowFittingSize } from "./NSEWindowFittingContent";

export interface NSEPopoverWindowRequest {
  readonly id: string;
  readonly role: "popover" | "sheet";
  /** Null denotes an application-stage surface with no WindowManager parent. */
  readonly parentWindowControllerId: string | null;
  readonly anchor: HTMLElement | null;
  readonly presentation: NSEPopupPresentation;
}

/**
 * Window-host adapter seam. A host that can register a serialisable content
 * renderer supplies this port; NSE itself never manufactures a WindowRecord.
 */
export interface NSEPopoverWindowBridge {
  open?(request: NSEPopoverWindowRequest): void;
  close?(request: NSEPopoverWindowRequest): void;
  present?: NSEWindowSurfaceBridge["present"];
  dismiss?: NSEWindowSurfaceBridge["dismiss"];
}

export interface NSEPopoverProps {
  readonly id: string;
  readonly open: boolean;
  readonly anchor: HTMLElement | null;
  /** Null denotes an application-stage surface with no WindowManager parent. */
  readonly parentWindowControllerId: string | null;
  readonly parentResponderId?: string;
  readonly parentId?: string | null;
  readonly parentScopeId?: string;
  readonly presentation?: NSEPopupPresentation;
  readonly labelledBy?: string;
  readonly describedBy?: string;
  /** Accessible name of a window-hosted popover (it has no title bar). */
  readonly title?: string;
  /** Size of a window-hosted popover's content, as NSPopover.contentSize. */
  readonly contentSize?: { readonly width: number; readonly height: number };
  readonly children: ReactNode;
  readonly windowBridge?: NSEPopoverWindowBridge;
  /** Keep content in the canonical overlay stack even when a physical-window bridge is available. */
  readonly surface?: "automatic" | "overlay";
  onOpenChange(open: boolean, reason: NSEOverlayDismissReason): void;
}

function useResolvedPresentation(presentation: NSEPopupPresentation | undefined): NSEPopupPresentation {
  const { runtime } = useNSEOverlayProvider();
  const traits = useSyncExternalStore(
    (listener) => runtime.environment.presentation.subscribe(listener),
    () => runtime.environment.presentation.getSnapshot(),
    () => runtime.environment.presentation.getSnapshot(),
  );
  return useMemo(() => {
    if (presentation && presentation.mode !== "automatic") return presentation;
    const compact = traits.horizontalSizeClass === "compact" ||
      traits.contentBounds.height - traits.virtualKeyboardInset <= 480;
    return {
      mode: compact ? "sheet" : "anchored",
      placement: presentation?.placement,
      collisionPadding: presentation?.collisionPadding,
    };
  }, [presentation, traits]);
}

/**
 * A popover's visual DOM remains an overlay branch. The optional window bridge
 * mirrors the parent/window relationship only when the host has a registered
 * renderer capable of owning that window record.
 */
export function NSEPopover({
  id,
  open,
  anchor,
  parentWindowControllerId,
  parentResponderId,
  parentId,
  parentScopeId,
  presentation,
  labelledBy,
  describedBy,
  title,
  contentSize,
  children,
  windowBridge,
  surface = "automatic",
  onOpenChange,
}: NSEPopoverProps) {
  const resolvedPresentation = useResolvedPresentation(presentation);
  const hostedBridge = useOptionalNSEWindowSurfaceBridge();
  const canonicalBridge = surface === "overlay" ? null : windowBridge?.present && windowBridge.dismiss ? windowBridge as NSEWindowSurfaceBridge : hostedBridge;
  const handleDidClose = useNSEWindowSurfaceLifecycle({
    bridge: canonicalBridge,
    requestId: id,
    open,
    onDismissRefused: () => onOpenChange(true, "programmatic"),
    onDidClose: () => onOpenChange(false, "programmatic"),
  });
  const [fitting, setFitting] = useState<NSEWindowFittingSize | null>(null);
  const onFittingSize = useCallback((next: NSEWindowFittingSize) => {
    setFitting((current) => current && current.width === next.width && current.height === next.height ? current : next);
  }, []);
  const windowRequest = useMemo<NSEPopoverWindowRequest>(() => ({
    id,
    role: resolvedPresentation.mode === "sheet" ? "sheet" : "popover",
    parentWindowControllerId,
    anchor,
    presentation: resolvedPresentation,
  }), [anchor, id, parentWindowControllerId, resolvedPresentation]);

  useEffect(() => {
    if (!open || !windowBridge || canonicalBridge) return;
    windowBridge.open?.(windowRequest);
    return () => windowBridge.close?.(windowRequest);
  }, [canonicalBridge, open, windowBridge, windowRequest]);
  const canonicalRequest = useMemo(() => ({
    id,
    role: resolvedPresentation.mode === "sheet" ? "sheet" as const : "popover" as const,
    title: title ?? (labelledBy ? anchor?.ownerDocument.getElementById(labelledBy)?.textContent?.trim() : undefined) ?? id,
    parentWindowControllerId,
    anchor,
    // The host hangs a popover off its anchor; x/y stand only where it cannot.
    bounds: {
      x: 180,
      y: 120,
      width: contentSize?.width ?? fitting?.width ?? (resolvedPresentation.mode === "sheet" ? 520 : 360),
      height: contentSize?.height ?? fitting?.height ?? (resolvedPresentation.mode === "sheet" ? 420 : 280),
    },
    onDidClose: handleDidClose,
  }), [anchor, contentSize?.height, contentSize?.width, fitting?.height, fitting?.width, handleDidClose, id, labelledBy, parentWindowControllerId, resolvedPresentation.mode, title]);
  const presentedContent = useNSEPresentedContent(contentSize || resolvedPresentation.mode === "sheet"
    ? children
    : <NSEWindowFittingContent onFittingSize={onFittingSize}>{children}</NSEWindowFittingContent>);
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
      parentId={parentId}
      parentScopeId={parentScopeId}
      labelledBy={labelledBy}
      describedBy={describedBy}
      overlayKind={resolvedPresentation.mode === "sheet" ? "action-sheet" : "popover"}
      modal={resolvedPresentation.mode === "sheet"}
      presentation={resolvedPresentation}
      onOpenChange={onOpenChange}
    >
      {children}
    </NSEPopup>
  );
}
