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

import {
  createElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type AriaRole,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { useNSEAnimationEnvironment } from "../Animation/NSEAnimationEnvironment";
import { nsePopoverSpringEasing, useNSEPopoverSurface } from "./useNSEPopoverSurface";
import { nseMenuChosenAttribute, nseMenuChosenFadeMs } from "../Menus/menuSelectionFlash";
import { createPortal } from "react-dom";
import type { NSEOverlayAnchorPoint } from "./computeNSEOverlayPosition";
import { useNSEOverlay } from "./useNSEOverlay";
import { useNSEOverlayProvider } from "./NSEOverlayProvider";
import { NSEActionResponderContext } from "../Controls/Core/useNSEControlAction";
import { useNSEAppearanceProjection } from "../Appearance";
import type {
  NSELogicalPlacement,
  NSEOverlayDismissReason,
  NSEOverlayKind,
} from "./overlayTypes";

function classNames(...values: readonly (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}

export interface NSEPopupPresentation {
  readonly mode: "automatic" | "anchored" | "sheet" | "viewport-block-start-inline-end";
  readonly placement?: NSELogicalPlacement;
  readonly collisionPadding?: number;
  readonly viewportCornerBleed?: Readonly<{ blockStart: number; inlineEnd: number }>;
}

export interface NSEPopupProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Stable branch-local identity. A standalone host supplies one when omitted. */
  readonly id?: string;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly anchor?: HTMLElement | null;
  /** @internal Place against this viewport point instead of the anchor's box (a context menu at the pointer). */
  readonly anchorPoint?: NSEOverlayAnchorPoint | null;
  /** @internal NSEPopover's positioning rectangle in the anchor view. */
  readonly relativeTo?: Pick<DOMRectReadOnly, "x" | "y" | "width" | "height">;
  /** Defaults to the nearest class controller, then the branch's host responder. */
  readonly parentResponderId?: string;
  readonly parentId?: string | null;
  readonly parentScopeId?: string;
  readonly presentation?: NSEPopupPresentation;
  readonly title?: ReactNode;
  readonly labelledBy?: string;
  readonly describedBy?: string;
  readonly modal?: boolean;
  readonly dismissOnOutside?: boolean;
  readonly dismissOnEscape?: boolean;
  readonly restoreFocus?: boolean;
  readonly exitDuration?: number;
  /** Surface family stays independent of adaptive placement and modality.
   * Content supplies its own paint (for example a paper card); menus and
   * listboxes retain their family recipe when presented as a modal sheet.
   * Placement, dismissal and focus remain owned by NSEPopup. */
  readonly chrome?: "standard" | "content" | "menu" | "context-menu" | "submenu" | "listbox";
  /** Keep the portal container mounted while a menu is closed to preserve its event boundary. */
  readonly keepPortalMounted?: boolean;
  /** The content is still arriving; the surface is not painted until it has. */
  readonly contentPending?: boolean;
  /** Internal family specialisation; callers should prefer family entry points. */
  readonly overlayKind?: NSEOverlayKind;
  /** @internal NSEPopover owns the continuous plate and arrow frame. */
  readonly drawsBackground?: boolean;
  onOpenChange?(open: boolean, reason: NSEOverlayDismissReason): void;
}

interface NSEPopupState {
  readonly open: boolean;
  requestOpen(open: boolean, reason: NSEOverlayDismissReason): void;
}

function useNSEPopupState({ open, defaultOpen = false, onOpenChange }: Pick<NSEPopupProps, "open" | "defaultOpen" | "onOpenChange">): NSEPopupState {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const controlled = open !== undefined;
  const resolvedOpen = controlled ? open : uncontrolledOpen;
  const requestOpen = useCallback((nextOpen: boolean, reason: NSEOverlayDismissReason) => {
    if (!controlled) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen, reason);
  }, [controlled, onOpenChange]);
  return { open: resolvedOpen, requestOpen };
}

function dismissalReasons({
  dismissOnEscape,
  dismissOnOutside,
  anchored,
}: Pick<NSEPopupProps, "dismissOnEscape" | "dismissOnOutside"> & { readonly anchored: boolean }): readonly NSEOverlayDismissReason[] {
  return [
    ...(dismissOnEscape ? ["escape" as const] : []),
    ...(dismissOnOutside ? ["outside-pointer" as const, "focus-left" as const] : []),
    // A modal sheet or centred panel is not positioned against its anchor,
    // which is only where focus returns: losing it (a menu row that opened
    // the sheet, say) must not close work in progress.
    ...(anchored ? ["anchor-removed" as const] : []),
    "parent-dismissed",
    "programmatic",
  ];
}

/**
 * Canonical popup surface. Its only interaction authority is the nearest
 * NSEOverlayProvider; presentation is a projection of that branch-local stack.
 */
export function NSEPopup({
  id,
  open,
  defaultOpen,
  anchor,
  anchorPoint,
  relativeTo,
  parentResponderId,
  parentId,
  parentScopeId,
  presentation,
  title,
  labelledBy,
  describedBy,
  modal = false,
  dismissOnOutside = true,
  dismissOnEscape = true,
  restoreFocus = true,
  exitDuration = 0,
  chrome = "standard",
  keepPortalMounted = false,
  contentPending = false,
  overlayKind,
  drawsBackground,
  onOpenChange,
  className,
  children,
  role,
  ...htmlAttributes
}: NSEPopupProps) {
  const appearanceProjection = useNSEAppearanceProjection();
  const generatedId = useId().replace(/:/g, "");
  const resolvedId = id ?? `nse-popup:${generatedId}`;
  const titleId = `nse-popup-title:${generatedId}`;
  const state = useNSEPopupState({ open, defaultOpen, onOpenChange });
  const { runtime, defaultParentResponderId } = useNSEOverlayProvider();
  const nearestResponderId = useContext(NSEActionResponderContext);
  const resolvedParentResponderId = parentResponderId ?? nearestResponderId ?? defaultParentResponderId;
  if (!resolvedParentResponderId) {
    throw new Error("NSEPopup requires parentResponderId or an NSEStandaloneControlHost.");
  }
  const [mounted, setMounted] = useState(state.open);
  const [closing, setClosing] = useState(false);
  const { reducedMotion } = useNSEAnimationEnvironment();
  const hasPopoverFrame = drawsBackground !== undefined;
  const [surfaceElement, setSurfaceElement] = useState<HTMLElement | null>(null);
  const [arrow, setArrow] = useState<HTMLElement | null>(null);
  const kind: NSEOverlayKind = overlayKind ?? (modal ? "action-sheet" : "popover");
  const resolvedPresentation = presentation ?? { mode: kind === "action-sheet" ? "sheet" as const : "anchored" as const };
  const isModal = kind === "action-sheet" || modal;
  const overlay = useNSEOverlay({
    id: resolvedId,
    kind,
    modal: isModal,
    parentId,
    parentScopeId,
    parentResponderId: resolvedParentResponderId,
    anchor: anchor ?? null,
    anchorPoint: anchorPoint ?? null,
    anchorRect: relativeTo,
    arrow: hasPopoverFrame && kind === "popover" ? arrow : null,
    offset: hasPopoverFrame ? 12 : undefined,
    open: state.open,
    placement: resolvedPresentation.placement,
    collisionPadding: resolvedPresentation.collisionPadding,
    positioning: resolvedPresentation.mode === "viewport-block-start-inline-end"
      ? "viewport-block-start-inline-end"
      : "anchor",
    viewportCornerBleed: resolvedPresentation.viewportCornerBleed,
    dismissOn: dismissalReasons({ dismissOnEscape, dismissOnOutside, anchored: !isModal }),
    restoreFocus,
    reRegisterOnDismiss: open !== undefined,
    contentPending,
    onDismiss: (reason) => state.requestOpen(false, reason),
  });
  const surfaceRef = useCallback((element: HTMLElement | null) => {
    overlay.surfaceProps.ref(element);
    setSurfaceElement(element);
  }, [overlay.surfaceProps.ref]);
  useNSEPopoverSurface(surfaceElement, kind === "popover" ? arrow : null, state.open, hasPopoverFrame);
  const surfaceClassName = useMemo(() => classNames(
    "nse-overlay-popup",
    `nse-overlay-popup--${chrome === "standard" ? kind : chrome}`,
    isModal && "nse-overlay-popup--modal",
    hasPopoverFrame && "nse-popover",
    className,
  ), [chrome, className, hasPopoverFrame, isModal, kind]);
  const surfaceRole: AriaRole = role ?? (kind === "listbox" ? "listbox" : "dialog");

  // A menu whose row was just chosen fades out (the row flashed and marked its popup), so it stays
  // mounted for the fade even when this popup has no exit of its own.
  const chosen = !state.open && mounted
    && overlay.portalHost?.ownerDocument.getElementById(resolvedId)?.hasAttribute(nseMenuChosenAttribute) === true;
  const exit = Math.max(exitDuration, hasPopoverFrame ? (reducedMotion ? 100 : 150) : 0, chosen ? nseMenuChosenFadeMs : 0);

  useEffect(() => {
    if (state.open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    if (exit <= 0) {
      setMounted(false);
      return;
    }
    setClosing(true);
    const handle = runtime.environment.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, exit);
    return () => runtime.environment.clearTimeout(handle);
  }, [exit, mounted, runtime, state.open]);

  const rendered = exit > 0 ? state.open || mounted : state.open;
  if (!overlay.portalHost || (!rendered && !keepPortalMounted)) return null;
  if (!rendered) {
    return createPortal(
      createElement("div", { hidden: true, "data-nse-portal-retainer": resolvedId }),
      overlay.portalHost,
    );
  }

  const surface = createElement(
    "div",
    {
      ...htmlAttributes,
      ...overlay.surfaceProps,
      ...appearanceProjection,
      ref: surfaceRef,
      id: resolvedId,
      "data-state": closing || !state.open ? "closing" : "open",
      inert: !state.open || contentPending ? true : undefined,
      ...(hasPopoverFrame ? {
        "data-nse-popover-draws-background": String(drawsBackground),
        "data-nse-reduced-motion": String(reducedMotion),
        style: { ...htmlAttributes.style, "--nse-popover-spring": nsePopoverSpringEasing },
      } : {}),
      className: surfaceClassName,
      role: surfaceRole,
      "aria-modal": isModal ? true : undefined,
      "aria-labelledby": labelledBy ?? (title && !htmlAttributes["aria-label"] ? titleId : undefined),
      "aria-describedby": describedBy,
      "data-nse-overlay-kind": kind,
      "data-nse-presentation": resolvedPresentation.mode,
      tabIndex: htmlAttributes.tabIndex ?? -1,
    },
    hasPopoverFrame ? createElement("svg", { className: "nse-popover-frame", "data-nse-part": "popover-frame", "aria-hidden": true },
      createElement("path", { "data-nse-part": "popover-arrow-fill" }),
      createElement("path", { "data-nse-part": "popover-outline" }),
    ) : null,
    hasPopoverFrame && kind === "popover" ? createElement("span", { ref: setArrow, className: "nse-popover-arrow", "data-nse-part": "arrow", "aria-hidden": true }) : null,
    title ? createElement("div", { id: titleId, className: "nse-overlay-popup-title" }, title) : null,
    createElement("div", { className: "nse-overlay-popup-content" }, children),
  );

  // A compact action sheet owns a physical outside target. It remains outside
  // the registered surface, so the provider's one capture listener performs
  // the same branch-aware outside-pointer dismissal as an anchored popup.
  // Keep the same parent and child positions when adaptive presentation
  // changes modality. Reparenting the surface would remount an unsaved editor.
  const portalContents = createElement(
      "div",
      { className: isModal ? "nse-overlay-popup-modal-host" : "nse-overlay-popup-host", ...appearanceProjection },
      createElement("div", {
        className: "nse-overlay-popup-backdrop",
        hidden: !isModal,
        "data-nse-part": "backdrop",
        "aria-hidden": true,
      }),
      surface,
    );

  return createPortal(overlay.withFocusScope(portalContents), overlay.portalHost);
}

export function useNSEPopupOpenState(options: Pick<NSEPopupProps, "open" | "defaultOpen" | "onOpenChange">): NSEPopupState {
  return useNSEPopupState(options);
}
