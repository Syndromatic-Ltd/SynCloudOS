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

import { useEffect, useMemo, type HTMLAttributes, type ReactNode } from "react";
import { NSEPopup, useNSEPopupOpenState, type NSEPopupPresentation, type NSEPopupProps } from "./NSEPopup";
import type { NSEOverlayDismissReason } from "./overlayTypes";
import { useOptionalNSEWindowSurfaceBridge, type NSEWindowSurfaceBridge } from "./NSEWindowSurfaceBridge";
import { reportNSEWindowSurfaceError, useNSEWindowSurfaceLifecycle } from "./useNSEWindowSurfaceLifecycle";
import { useNSEPresentedContent } from "./useNSEPresentedContent";

export interface NSEActionSheetProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  readonly id: string;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly anchor?: HTMLElement | null;
  readonly parentResponderId: string;
  readonly parentId?: string | null;
  readonly parentScopeId?: string;
  readonly title?: ReactNode;
  readonly labelledBy?: string;
  readonly describedBy?: string;
  readonly dismissOnOutside?: boolean;
  readonly dismissOnEscape?: boolean;
  readonly restoreFocus?: boolean;
  readonly presentation?: NSEPopupPresentation;
  /** Optional window-host seam for a real NSEModalWindowView-backed record. */
  readonly parentWindowControllerId?: string;
  readonly windowBridge?: NSEModalWindowBridge;
  onOpenChange?(open: boolean, reason: NSEOverlayDismissReason): void;
}

export interface NSEModalWindowRequest {
  readonly id: string;
  readonly role: "sheet";
  readonly parentWindowControllerId: string | null;
  readonly presentation: NSEPopupPresentation;
}

/** Window-host seam; the host owns renderer registration and WindowManager.create/open/close. */
export interface NSEModalWindowBridge {
  open?(request: NSEModalWindowRequest): void;
  close?(request: NSEModalWindowRequest): void;
  present?: NSEWindowSurfaceBridge["present"];
  dismiss?: NSEWindowSurfaceBridge["dismiss"];
}

/** A modal surface; it is an overlay record, never an ad hoc window registry. */
export function NSEActionSheet({
  anchor = null,
  presentation,
  open,
  defaultOpen,
  onOpenChange,
  parentWindowControllerId,
  windowBridge,
  ...props
}: NSEActionSheetProps) {
  const state = useNSEPopupOpenState({ open, defaultOpen, onOpenChange });
  const hostedBridge = useOptionalNSEWindowSurfaceBridge();
  const canonicalBridge = windowBridge?.present && windowBridge.dismiss ? windowBridge as NSEWindowSurfaceBridge : hostedBridge;
  const handleDidClose = useNSEWindowSurfaceLifecycle({
    bridge: canonicalBridge,
    requestId: props.id,
    open: state.open,
    onDismissRefused: () => state.requestOpen(true, "programmatic"),
    onDidClose: () => state.requestOpen(false, "programmatic"),
  });
  const resolvedPresentation = presentation ?? { mode: "sheet" as const };
  const windowRequest = useMemo<NSEModalWindowRequest>(() => ({
    id: props.id,
    role: "sheet",
    parentWindowControllerId: parentWindowControllerId ?? null,
    presentation: resolvedPresentation,
  }), [parentWindowControllerId, props.id, resolvedPresentation]);
  useEffect(() => {
    if (!state.open || !windowBridge || canonicalBridge) return;
    windowBridge.open?.(windowRequest);
    return () => windowBridge.close?.(windowRequest);
  }, [canonicalBridge, state.open, windowBridge, windowRequest]);
  const canonicalRequest = useMemo(() => ({
    id: props.id,
    role: "sheet" as const,
    title: typeof props.title === "string" ? props.title : props.id,
    parentWindowControllerId: parentWindowControllerId ?? null,
    anchor,
    bounds: { x: 180, y: 120, width: 520, height: 420 },
    onDidClose: handleDidClose,
  }), [anchor, handleDidClose, parentWindowControllerId, props.id, props.title]);
  const hostedContent = <div role="dialog" aria-label={typeof props.title === "string" ? props.title : props.id}>{props.children}</div>;
  const presentedContent = useNSEPresentedContent(hostedContent);
  useEffect(() => {
    if (!state.open || !canonicalBridge) return;
    canonicalBridge.present(canonicalRequest, presentedContent).catch((error: unknown) => {
      reportNSEWindowSurfaceError(canonicalBridge, error, props.id, "present");
    });
  }, [canonicalBridge, canonicalRequest, presentedContent, props.id, state.open]);
  if (canonicalBridge) return null;

  return (
    <NSEPopup
      {...(props as Omit<NSEPopupProps, "anchor" | "overlayKind" | "modal" | "presentation">)}
      anchor={anchor}
      open={state.open}
      overlayKind="action-sheet"
      modal
      presentation={resolvedPresentation}
      onOpenChange={state.requestOpen}
    />
  );
}
