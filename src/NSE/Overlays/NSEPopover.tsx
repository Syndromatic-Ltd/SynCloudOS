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

import { useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { NSEActionResponderContext } from "../Controls/Core/useNSEControlAction";
import { NSEPopup, type NSEPopupPresentation } from "./NSEPopup";
import { useNSEOverlayProvider } from "./OverlayProvider";
import type { OverlayDismissReason } from "./overlayTypes";
import { useOptionalNSEWindowSurfaceBridge, type NSEWindowSurfaceBridge, type NSEPopoverPreferredEdge, type NSEPopoverBehavior } from "./NSEWindowSurfaceBridge";
import { nsePopoverEdgePlacement } from "./popoverPosition";
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
  /** NSPopover.show(relativeTo:of:preferredEdge:): a rectangle in the anchor's
   * local coordinates; omitted means the entire positioning view. */
  readonly relativeTo?: Pick<DOMRectReadOnly, "x" | "y" | "width" | "height">;
  readonly preferredEdge?: NSEPopoverPreferredEdge;
  readonly behavior?: NSEPopoverBehavior;
  /** Null denotes an application-stage surface with no WindowManager parent. */
  readonly parentWindowControllerId: string | null;
  readonly parentResponderId?: string;
  readonly parentId?: string | null;
  readonly parentScopeId?: string;
  readonly presentation?: NSEPopupPresentation;
  readonly labelledBy?: string;
  readonly describedBy?: string;
  /** The popover's accessible name (it has no title bar). */
  readonly title?: string;
  /** Size of a window-hosted popover's content, as NSPopover.contentSize. */
  readonly contentSize?: { readonly width: number; readonly height: number };
  /** Draw the standard plate. When false the content paints it and supplies
   * `--nse-popover-content-fill` on its root for the arrow. Defaults to true. */
  readonly drawsBackground?: boolean;
  readonly children: ReactNode;
  readonly windowBridge?: NSEPopoverWindowBridge;
  /** Keep content in the canonical overlay stack even when a physical-window bridge is available. */
  readonly surface?: "automatic" | "overlay";
  onOpenChange(open: boolean, reason: OverlayDismissReason): void;
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
 * A mounted popover is a WindowManager window. Standalone hosts and explicit
 * overlay surfaces use the same frame and positioning without a window host.
 */
export function NSEPopover({
  id,
  open,
  anchor,
  relativeTo,
  preferredEdge,
  behavior = "transient",
  parentWindowControllerId,
  parentResponderId,
  parentId,
  parentScopeId,
  presentation,
  labelledBy,
  describedBy,
  title,
  contentSize,
  drawsBackground = true,
  children,
  windowBridge,
  surface = "automatic",
  onOpenChange,
}: NSEPopoverProps) {
  const automaticPresentation = useResolvedPresentation(presentation);
  const resolvedPresentation = useMemo(() => ({ ...automaticPresentation,
    placement: preferredEdge ? nsePopoverEdgePlacement[preferredEdge] : automaticPresentation.placement,
  }), [automaticPresentation, preferredEdge]);
  const hostedBridge = useOptionalNSEWindowSurfaceBridge();
  const nearestResponder = useContext(NSEActionResponderContext);
  const { defaultParentResponderId } = useNSEOverlayProvider();
  const resolvedParentResponderId = parentResponderId ?? nearestResponder ?? defaultParentResponderId;
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
    role: "popover" as const,
    title: title ?? (labelledBy ? anchor?.ownerDocument.getElementById(labelledBy)?.textContent?.trim() : undefined) ?? id,
    parentWindowControllerId,
    anchor,
    relativeTo,
    parentResponderId: resolvedParentResponderId,
    preferredEdge,
    behavior,
    presentation: resolvedPresentation,
    drawsBackground,
    placement: resolvedPresentation.placement,
    collisionPadding: resolvedPresentation.collisionPadding,
    labelledBy,
    describedBy,
    // The host hangs a popover off its anchor; x/y stand only where it cannot.
    bounds: {
      x: 180,
      y: 120,
      width: contentSize?.width ?? fitting?.width ?? (resolvedPresentation.mode === "sheet" ? 520 : 360),
      height: contentSize?.height ?? fitting?.height ?? (resolvedPresentation.mode === "sheet" ? 420 : 280),
    },
    onDidClose: handleDidClose,
  }), [anchor, relativeTo, preferredEdge, behavior, drawsBackground, describedBy, contentSize?.height, contentSize?.width, fitting?.height, fitting?.width, handleDidClose, id, labelledBy, parentWindowControllerId, resolvedParentResponderId, resolvedPresentation.mode, resolvedPresentation.placement, resolvedPresentation.collisionPadding, title]);
  const presentedContent = useNSEPresentedContent(contentSize
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
      relativeTo={relativeTo}
      parentResponderId={parentResponderId}
      parentId={parentId}
      parentScopeId={parentScopeId}
      labelledBy={labelledBy}
      describedBy={describedBy}
      {...(title && !labelledBy ? { "aria-label": title } : {})}
      overlayKind={resolvedPresentation.mode === "sheet" ? "action-sheet" : "popover"}
      modal={resolvedPresentation.mode === "sheet"}
      presentation={resolvedPresentation}
      drawsBackground={drawsBackground}
      dismissOnOutside={behavior === "transient"}
      dismissOnEscape={behavior !== "applicationDefined"}
      style={contentSize ? { width: contentSize.width, height: contentSize.height, minWidth: 0 } : undefined}
      onOpenChange={onOpenChange}
    >
      {children}
    </NSEPopup>
  );
}
