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

import { createContext, useCallback, useContext, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { computeOverlayPosition, computeNSEViewportCornerPosition, type OverlayAnchorPoint, type OverlayCollisionPadding, type OverlayDirection } from "./computeOverlayPosition";
import { useNSEOverlayProvider } from "./OverlayProvider";
import { useNSEOverlayRegion } from "./useNSEOverlayRegion";
import { nseOverlayRegionInsets } from "./overlayRegion";
import { registerNSEFocusOrigin } from "../Focus/focusOrigin";
import type {
  LogicalPlacement,
  OverlayDismissReason,
  OverlayId,
  OverlayKind,
  OverlayRegistration,
} from "./overlayTypes";

export interface UseNSEOverlayOptions {
  readonly id: OverlayId;
  readonly kind: OverlayKind;
  /** Focus/inert policy can be modal while retaining anchored popover placement. */
  readonly modal?: boolean;
  readonly parentId?: OverlayId | null;
  readonly parentScopeId?: string;
  readonly parentResponderId: string;
  readonly anchor: HTMLElement | null;
  /** Place against this viewport point instead of the anchor's box (a context menu at the pointer). */
  readonly anchorPoint?: OverlayAnchorPoint | null;
  readonly anchorRect?: Pick<DOMRectReadOnly, "x" | "y" | "width" | "height">;
  readonly open: boolean;
  readonly dismissOn?: readonly OverlayDismissReason[] | ReadonlySet<OverlayDismissReason>;
  readonly restoreFocus?: boolean;
  readonly placement?: LogicalPlacement;
  readonly direction?: OverlayDirection;
  readonly arrow?: HTMLElement | null;
  readonly offset?: number;
  readonly collisionPadding?: OverlayCollisionPadding;
  readonly positioning?: "anchor" | "viewport-block-start-inline-end";
  readonly viewportCornerBleed?: Readonly<{ blockStart: number; inlineEnd: number }>;
  readonly reRegisterOnDismiss?: boolean;
  /**
   * The surface's content is still arriving (a command menu validating its
   * rows). The surface stays laid out but unpainted, and is placed again in
   * the commit that clears this, so its first visible frame is its final one.
   */
  readonly contentPending?: boolean;
  onDismiss?(reason: OverlayDismissReason): void;
}

export interface UseNSEOverlayResult {
  readonly portalHost: HTMLElement | null;
  readonly surfaceProps: {
    readonly ref: (element: HTMLElement | null) => void;
    readonly "data-nse-control": "menu" | "popover" | "tooltip" | "sheet";
    readonly "data-nse-part": "surface";
    readonly "data-nse-role": "overlay";
    readonly "data-state": "open";
    readonly "data-placement": LogicalPlacement;
    readonly "data-nse-placement": LogicalPlacement;
    readonly "data-nse-viewport-limited": "true" | "false";
    readonly "data-nse-content-pending"?: "true";
    readonly inert?: boolean;
  };
  withFocusScope(children: ReactElement): ReactNode;
}

/**
 * The overlay a surface's content belongs to. An overlay opened from inside
 * another (a picker's listbox or a colour panel in a sheet) is that overlay's
 * child unless the caller names a parent: it dismisses with it, only it is
 * dismissed while it is topmost, and its focus scope nests in the parent's so
 * a modal parent's focus trap lets focus into it.
 */
interface OverlayParent {
  readonly manager: unknown;
  readonly overlayId: OverlayId;
  readonly scopeId: string | undefined;
}

const OverlayParentContext = createContext<OverlayParent | null>(null);

/** Internal focus membership for controllers rendered through an overlay portal. */
export function useNSEOverlayFocusScope(): string | undefined {
  return useContext(OverlayParentContext)?.scopeId;
}

const interactiveScopeKinds: Readonly<Record<OverlayKind, "menu" | "popover" | "sheet" | null>> = {
  menu: "menu",
  submenu: "menu",
  "context-menu": "menu",
  listbox: "popover",
  popover: "popover",
  tooltip: null,
  "action-sheet": "sheet",
};

interface ResolvedOverlayCollisionPadding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

function dismissKey(reasons: readonly OverlayDismissReason[] | ReadonlySet<OverlayDismissReason>): string {
  return [...reasons].sort().join("|");
}

function restoresOverlayFocus(reason: OverlayDismissReason): boolean {
  return reason === "escape" || reason === "programmatic" || reason === "parent-dismissed";
}

function sidePadding(padding: OverlayCollisionPadding | undefined, side: "top" | "right" | "bottom" | "left"): number {
  if (typeof padding === "number") return padding;
  return padding?.[side] ?? 8;
}

export function useNSEOverlay({
  id,
  kind,
  modal,
  parentId: requestedParentId,
  parentScopeId: requestedParentScopeId,
  parentResponderId,
  anchor,
  anchorPoint = null,
  anchorRect,
  open,
  dismissOn = ["escape", "outside-pointer", "focus-left", "anchor-removed", "programmatic", "parent-dismissed"],
  restoreFocus = true,
  placement = "block-end-inline-start",
  direction = "ltr",
  arrow = null,
  offset,
  collisionPadding,
  positioning = "anchor",
  viewportCornerBleed,
  reRegisterOnDismiss = false,
  contentPending = false,
  onDismiss,
}: UseNSEOverlayOptions): UseNSEOverlayResult {
  const { manager, runtime, portalHost, register, retainFocusTarget } = useNSEOverlayProvider();
  const enclosing = useContext(OverlayParentContext);
  const inherited = requestedParentId === undefined && enclosing?.manager === manager && enclosing.overlayId !== id ? enclosing : null;
  const parentId = requestedParentId !== undefined ? requestedParentId : inherited?.overlayId ?? null;
  const parentScopeId = requestedParentScopeId ?? inherited?.scopeId;
  const parentRegistered = useSyncExternalStore(
    useCallback((listener: () => void) => manager.subscribe(() => {
      // Owner abort can release the overlay graph during React's insertion
      // cleanup. Preserve synchronous authority cleanup without repainting a
      // tree whose presentation lease has already ended.
      if (!runtime.signal.aborted) listener();
    }), [manager, runtime]),
    () => parentId === null || manager.getRegistration(parentId) !== null,
    () => parentId === null,
  );
  const workArea = useSyncExternalStore(
    (listener) => runtime.environment.workArea.subscribe(listener),
    () => runtime.environment.workArea.getSnapshot(),
    () => runtime.environment.workArea.getSnapshot(),
  );
  const visualViewport = useSyncExternalStore(
    (listener) => runtime.environment.visualViewport.subscribe(listener),
    () => runtime.environment.visualViewport.getSnapshot(),
    () => runtime.environment.visualViewport.getSnapshot(),
  );
  const { region, hostViewport, getBoundary } = useNSEOverlayRegion({ source: runtime.environment.presentation, open, origin: anchor, document: runtime.environment.browser.getDocument(), direction });
  const [surface, setSurface] = useState<HTMLElement | null>(null);
  const [controlledDismissGeneration, setControlledDismissGeneration] = useState(0);
  const onDismissRef = useRef(onDismiss);
  const restorationGenerationRef = useRef(0);
  const wasOpenRef = useRef(open);
  const managerDismissedRef = useRef(false);
  onDismissRef.current = onDismiss;
  const reasonKey = dismissKey(dismissOn);
  const dismissReasons = useMemo(() => new Set(dismissOn), [reasonKey]);
  const effectiveCollisionPadding = useMemo<ResolvedOverlayCollisionPadding>(() => {
    const virtualKeyboardInset = visualViewport
      ? Math.max(0, workArea.height - (visualViewport.height + visualViewport.offsetTop))
      : 0;
    return {
      top: Math.max(sidePadding(collisionPadding, "top"), workArea.safeArea.top),
      right: Math.max(sidePadding(collisionPadding, "right"), workArea.safeArea.right),
      bottom: Math.max(sidePadding(collisionPadding, "bottom"), workArea.safeArea.bottom, virtualKeyboardInset),
      left: Math.max(sidePadding(collisionPadding, "left"), workArea.safeArea.left),
    };
  }, [collisionPadding, visualViewport, workArea]);
  const placementPadding = region ? { top: Math.max(0, sidePadding(collisionPadding, "top")), right: Math.max(0, sidePadding(collisionPadding, "right")), bottom: Math.max(0, sidePadding(collisionPadding, "bottom")), left: Math.max(0, sidePadding(collisionPadding, "left")) } : effectiveCollisionPadding;
  const placementScheduler = useMemo(() => ({
    setTimeout: (callback: () => void, delayMs: number) => runtime.environment.setTimeout(callback, delayMs),
    clearTimeout: (handle: unknown) => runtime.environment.clearTimeout(handle),
  }), [runtime]);
  const viewportLimited = effectiveCollisionPadding.top > 8
    || effectiveCollisionPadding.right > 8
    || effectiveCollisionPadding.bottom > 8
    || effectiveCollisionPadding.left > 8;

  const onAnchorRemoved = useCallback(() => {
    if (dismissReasons.has("anchor-removed")) manager.dismissBranch(id, "anchor-removed");
  }, [dismissReasons, id, manager]);

  const restoreFocusAfterClose = useCallback(() => {
    if (!restoreFocus) return;
    const restorationGeneration = ++restorationGenerationRef.current;
    const releaseFocusTarget = anchor ? retainFocusTarget(anchor) : null;
    let abortListener: (() => void) | null = null;
    let finishReceipt!: () => void;
    let failReceipt!: (error: unknown) => void;
    const receipt = new Promise<void>((resolve, reject) => {
      finishReceipt = resolve;
      failReceipt = reject;
    });
    runtime.observeFiniteWork?.(receipt, { kind: "focus-restore", label: id });
    let finished = false;
    const finish = (error?: unknown) => {
      if (finished) return;
      finished = true;
      if (error === undefined) finishReceipt();
      else failReceipt(error);
    };
    const restore = () => {
      if (abortListener) runtime.signal.removeEventListener("abort", abortListener);
      if (runtime.signal.aborted || restorationGenerationRef.current !== restorationGeneration) {
        releaseFocusTarget?.();
        finish();
        return;
      }
      try {
        runtime.restoreFocus(parentResponderId, anchor);
        releaseFocusTarget?.();
        finish();
      } catch (error) {
        releaseFocusTarget?.();
        finish(error);
        throw error;
      }
    };
    if (runtime.signal.aborted) {
      releaseFocusTarget?.();
      finish();
      return;
    }
    const handle = runtime.environment.setTimeout(restore, 0);
    abortListener = () => {
      runtime.environment.clearTimeout(handle);
      releaseFocusTarget?.();
      finish();
    };
    runtime.signal.addEventListener("abort", abortListener, { once: true });
  }, [anchor, id, parentResponderId, restoreFocus, retainFocusTarget, runtime]);

  // React can unmount a FocusScope before this hook's layout cleanup removes
  // the corresponding manager record. An Effect Event reads the current
  // committed controlled state, so the scope's own teardown restoration is
  // not reclassified as a user focus-left dismissal of a closing surface.
  const managerDismiss = useEffectEvent((reason: OverlayDismissReason) => {
    // The manager also releases its records during owner teardown. That is
    // authority cleanup, not a request for an obsolete UI to change state.
    if (!open || runtime.signal.aborted) return;
    managerDismissedRef.current = true;
    if (restoreFocus && restoresOverlayFocus(reason)) {
      restoreFocusAfterClose();
    }
    onDismissRef.current?.(reason);
    // A controlled owner may intentionally refuse the request by retaining
    // open=true. Re-run registration so the still-visible surface remains in
    // the branch stack for the next Escape/outside request.
    if (reRegisterOnDismiss) setControlledDismissGeneration((generation) => generation + 1);
  });
  // An Effect Event has a new identity on every render; the registration
  // holds one stable forwarder so a re-render is not a changed registration
  // (and a manager publication) when nothing it describes has changed.
  const managerDismissRef = useRef(managerDismiss);
  useLayoutEffect(() => {
    managerDismissRef.current = managerDismiss;
  });
  const onManagerDismiss = useCallback((reason: OverlayDismissReason) => managerDismissRef.current(reason), []);

  const registration = useMemo<OverlayRegistration | null>(() => !open || !surface ? null : ({
    id,
    kind,
    parentId,
    anchor,
    surface,
    dismissOn: dismissReasons,
    restoreFocus,
    onDismiss: onManagerDismiss,
  }), [anchor, dismissReasons, id, kind, onManagerDismiss, open, parentId, restoreFocus, surface]);

  useLayoutEffect(() => {
    if (!open || !surface || !parentRegistered || runtime.signal.aborted) return;
    const initialRegistration: OverlayRegistration = {
      id,
      kind,
      parentId,
      anchor,
      surface,
      dismissOn: dismissReasons,
      restoreFocus,
      onDismiss: onManagerDismiss,
    };
    return register(initialRegistration);
  // Kind is presentation metadata, updated below. Releasing a live parent
  // lease for a modality change would dismiss its still-open descendants.
  }, [controlledDismissGeneration, id, open, parentRegistered, register, runtime, surface]);

  useLayoutEffect(() => {
    if (registration) manager.update(registration);
  }, [manager, registration]);

  useLayoutEffect(() => {
    if (!open || !surface || !region || !hostViewport) return;
    const insets = nseOverlayRegionInsets(region, hostViewport);
    surface.dataset.nseOverlayRegion = "true";
    for (const side of ["top", "right", "bottom", "left"] as const) surface.style.setProperty(`--nse-overlay-region-${side}`, `${insets[side]}px`);
    return () => {
      delete surface.dataset.nseOverlayRegion;
      for (const side of ["top", "right", "bottom", "left"]) surface.style.removeProperty(`--nse-overlay-region-${side}`);
    };
  }, [open, surface, region?.x, region?.y, region?.width, region?.height, hostViewport?.width, hostViewport?.height]);

  useLayoutEffect(() => {
    if (!open || !surface) return;
    if (kind === "action-sheet") {
      // An adaptive surface retains its DOM and editor state. Its anchored
      // coordinates must leave with that mode so sheet CSS owns placement.
      for (const property of ["left", "top", "right", "bottom", "transform-origin"]) surface.style.removeProperty(property);
      surface.style.setProperty("--nse-overlay-available-inline-size", `${Math.max(0, region ? region.width - placementPadding.left - placementPadding.right : workArea.width - workArea.safeArea.left - workArea.safeArea.right)}px`);
      surface.style.setProperty("--nse-overlay-available-block-size", `${Math.max(0, region ? region.height - placementPadding.top - placementPadding.bottom : workArea.height - workArea.safeArea.top - workArea.safeArea.bottom - effectiveCollisionPadding.bottom)}px`);
      return () => {
        surface.style.removeProperty("--nse-overlay-available-inline-size");
        surface.style.removeProperty("--nse-overlay-available-block-size");
      };
    }
    if (!anchor) return;
    if (positioning === "viewport-block-start-inline-end") {
      return computeNSEViewportCornerPosition({
        anchor,
        floating: surface,
        boundary: region,
        insetBlockStart: region ? placementPadding.top : workArea.safeArea.top - (viewportCornerBleed?.blockStart ?? 0),
        insetInlineEnd: region ? placementPadding.right : workArea.safeArea.right - (viewportCornerBleed?.inlineEnd ?? 0),
        availableInlineSize: region ? region.width - placementPadding.left - placementPadding.right : workArea.width - workArea.safeArea.left - workArea.safeArea.right,
        availableBlockSize: region ? region.height - placementPadding.top - placementPadding.bottom : workArea.height - workArea.safeArea.top - workArea.safeArea.bottom,
        direction,
        signal: runtime.signal,
        onAnchorRemoved,
      });
    }
    return computeOverlayPosition({
      anchor,
      anchorPoint,
      anchorRect,
      floating: surface,
      arrow,
      placement,
      direction,
      offset,
      collisionPadding: placementPadding,
      boundary: getBoundary,
      signal: runtime.signal,
      scheduler: placementScheduler,
      onAnchorRemoved,
      onError: () => runtime.reportPlacementFailure({ overlayId: id, overlayKind: kind }),
    });
  }, [anchor, anchorPoint, anchorRect, arrow, contentPending, direction, effectiveCollisionPadding, id, kind, offset, onAnchorRemoved, open, placement, placementScheduler, positioning, runtime, surface, viewportCornerBleed, workArea, region?.x, region?.y, region?.width, region?.height, getBoundary, collisionPadding]);

  const setSurfaceRef = useCallback((element: HTMLElement | null) => {
    setSurface(element);
  }, []);
  // A dialog opened by a command in this surface returns focus to the
  // control the surface was opened from, not to a row that no longer exists.
  useLayoutEffect(() => (surface ? registerNSEFocusOrigin(surface, anchor) : undefined), [anchor, surface]);
  const scopeKind = interactiveScopeKinds[kind];
  const focusScopeModal = modal ?? kind === "action-sheet";
  useLayoutEffect(() => {
    if (wasOpenRef.current && !open) {
      const managerDismissed = managerDismissedRef.current;
      managerDismissedRef.current = false;
      if (!managerDismissed) restoreFocusAfterClose();
    }
    if (open) restorationGenerationRef.current += 1;
    wasOpenRef.current = open;
  }, [open, restoreFocusAfterClose]);
  const scopeId = scopeKind ? `nse-overlay:${id}` : undefined;
  const parentValue = useMemo<OverlayParent>(() => ({ manager, overlayId: id, scopeId }), [id, manager, scopeId]);
  const withFocusScope = useCallback((children: ReactElement): ReactNode => {
    if (!scopeKind || !scopeId) return <OverlayParentContext value={parentValue}>{children}</OverlayParentContext>;
    return <OverlayParentContext value={parentValue}>{runtime.wrapFocusScope({
      scopeId,
      kind: scopeKind,
      parentScopeId,
      parentResponderId,
      modal: focusScopeModal,
      trapFocus: focusScopeModal,
      restoreFocus,
      asChild: true,
    }, children)}</OverlayParentContext>;
  }, [focusScopeModal, parentResponderId, parentScopeId, parentValue, restoreFocus, runtime, scopeId, scopeKind]);

  return {
    // Nested React effects run before their parent. Do not expose a child
    // portal until its parent has established the corresponding authority.
    portalHost: parentRegistered ? portalHost : null,
    surfaceProps: {
      ref: setSurfaceRef,
      "data-nse-control": kind === "action-sheet" ? "sheet" : kind === "popover" || kind === "tooltip" ? kind : "menu",
      "data-nse-part": "surface",
      "data-nse-role": "overlay",
      "data-state": "open",
      "data-placement": placement,
      "data-nse-placement": placement,
      "data-nse-viewport-limited": viewportLimited ? "true" : "false",
      ...(contentPending ? { "data-nse-content-pending": "true" as const, inert: true } : {}),
    },
    withFocusScope,
  };
}
