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
import { computeNSEOverlayPosition, computeNSEViewportCornerPosition, type NSEOverlayCollisionPadding, type NSEOverlayDirection } from "./computeNSEOverlayPosition";
import { useNSEOverlayProvider } from "./NSEOverlayProvider";
import { registerNSEFocusOrigin } from "../Focus/focusOrigin";
import type {
  NSELogicalPlacement,
  NSEOverlayDismissReason,
  NSEOverlayId,
  NSEOverlayKind,
  NSEOverlayRegistration,
} from "./overlayTypes";

export interface UseNSEOverlayOptions {
  readonly id: NSEOverlayId;
  readonly kind: NSEOverlayKind;
  /** Focus/inert policy can be modal while retaining anchored popover placement. */
  readonly modal?: boolean;
  readonly parentId?: NSEOverlayId | null;
  readonly parentScopeId?: string;
  readonly parentResponderId: string;
  readonly anchor: HTMLElement | null;
  readonly open: boolean;
  readonly dismissOn?: readonly NSEOverlayDismissReason[] | ReadonlySet<NSEOverlayDismissReason>;
  readonly restoreFocus?: boolean;
  readonly placement?: NSELogicalPlacement;
  readonly direction?: NSEOverlayDirection;
  readonly arrow?: HTMLElement | null;
  readonly offset?: number;
  readonly collisionPadding?: NSEOverlayCollisionPadding;
  readonly positioning?: "anchor" | "viewport-block-start-inline-end";
  readonly viewportCornerBleed?: Readonly<{ blockStart: number; inlineEnd: number }>;
  readonly reRegisterOnDismiss?: boolean;
  /**
   * The surface's content is still arriving (a command menu validating its
   * rows). The surface stays laid out but unpainted, and is placed again in
   * the commit that clears this, so its first visible frame is its final one.
   */
  readonly contentPending?: boolean;
  onDismiss?(reason: NSEOverlayDismissReason): void;
}

export interface UseNSEOverlayResult {
  readonly portalHost: HTMLElement | null;
  readonly surfaceProps: {
    readonly ref: (element: HTMLElement | null) => void;
    readonly "data-nse-control": "overlay";
    readonly "data-nse-part": "surface";
    readonly "data-state": "open";
    readonly "data-placement": NSELogicalPlacement;
    readonly "data-nse-viewport-limited": "true" | "false";
    readonly "data-nse-content-pending"?: "true";
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
interface NSEOverlayParent {
  readonly manager: unknown;
  readonly overlayId: NSEOverlayId;
  readonly scopeId: string | undefined;
}

const NSEOverlayParentContext = createContext<NSEOverlayParent | null>(null);

/** Internal focus membership for controllers rendered through an overlay portal. */
export function useNSEOverlayFocusScope(): string | undefined {
  return useContext(NSEOverlayParentContext)?.scopeId;
}

const interactiveScopeKinds: Readonly<Record<NSEOverlayKind, "menu" | "popover" | "sheet" | null>> = {
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

function dismissKey(reasons: readonly NSEOverlayDismissReason[] | ReadonlySet<NSEOverlayDismissReason>): string {
  return [...reasons].sort().join("|");
}

function restoresOverlayFocus(reason: NSEOverlayDismissReason): boolean {
  return reason === "escape" || reason === "programmatic" || reason === "parent-dismissed";
}

function sidePadding(padding: NSEOverlayCollisionPadding | undefined, side: "top" | "right" | "bottom" | "left"): number {
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
  const enclosing = useContext(NSEOverlayParentContext);
  const inherited = requestedParentId === undefined && enclosing?.manager === manager && enclosing.overlayId !== id ? enclosing : null;
  const parentId = requestedParentId !== undefined ? requestedParentId : inherited?.overlayId ?? null;
  const parentScopeId = requestedParentScopeId ?? inherited?.scopeId;
  const parentRegistered = useSyncExternalStore(
    manager.subscribe,
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
  const managerDismiss = useEffectEvent((reason: NSEOverlayDismissReason) => {
    if (!open) return;
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
  const onManagerDismiss = useCallback((reason: NSEOverlayDismissReason) => managerDismissRef.current(reason), []);

  const registration = useMemo<NSEOverlayRegistration | null>(() => !open || !surface ? null : ({
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
    const initialRegistration: NSEOverlayRegistration = {
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
  }, [controlledDismissGeneration, id, kind, open, parentRegistered, register, runtime, surface]);

  useLayoutEffect(() => {
    if (registration) manager.update(registration);
  }, [manager, registration]);

  useLayoutEffect(() => {
    if (!open || !surface) return;
    if (kind === "action-sheet") {
      surface.style.setProperty("--nse-overlay-available-inline-size", `${Math.max(0, workArea.width - workArea.safeArea.left - workArea.safeArea.right)}px`);
      surface.style.setProperty("--nse-overlay-available-block-size", `${Math.max(0, workArea.height - workArea.safeArea.top - workArea.safeArea.bottom - effectiveCollisionPadding.bottom)}px`);
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
        insetBlockStart: workArea.safeArea.top - (viewportCornerBleed?.blockStart ?? 0),
        insetInlineEnd: workArea.safeArea.right - (viewportCornerBleed?.inlineEnd ?? 0),
        availableInlineSize: workArea.width - workArea.safeArea.left - workArea.safeArea.right,
        availableBlockSize: workArea.height - workArea.safeArea.top - workArea.safeArea.bottom,
        direction,
        signal: runtime.signal,
        onAnchorRemoved,
      });
    }
    return computeNSEOverlayPosition({
      anchor,
      floating: surface,
      arrow,
      placement,
      direction,
      offset,
      collisionPadding: effectiveCollisionPadding,
      signal: runtime.signal,
      scheduler: placementScheduler,
      onAnchorRemoved,
      onError: () => runtime.reportPlacementFailure({ overlayId: id, overlayKind: kind }),
    });
  }, [anchor, arrow, contentPending, direction, effectiveCollisionPadding, id, kind, offset, onAnchorRemoved, open, placement, placementScheduler, positioning, runtime, surface, viewportCornerBleed, workArea]);

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
  const parentValue = useMemo<NSEOverlayParent>(() => ({ manager, overlayId: id, scopeId }), [id, manager, scopeId]);
  const withFocusScope = useCallback((children: ReactElement): ReactNode => {
    if (!scopeKind || !scopeId) return <NSEOverlayParentContext value={parentValue}>{children}</NSEOverlayParentContext>;
    return <NSEOverlayParentContext value={parentValue}>{runtime.wrapFocusScope({
      scopeId,
      kind: scopeKind,
      parentScopeId,
      parentResponderId,
      modal: focusScopeModal,
      trapFocus: focusScopeModal,
      restoreFocus,
      asChild: true,
    }, children)}</NSEOverlayParentContext>;
  }, [focusScopeModal, parentResponderId, parentScopeId, parentValue, restoreFocus, runtime, scopeId, scopeKind]);

  return {
    // Nested React effects run before their parent. Do not expose a child
    // portal until its parent has established the corresponding authority.
    portalHost: parentRegistered ? portalHost : null,
    surfaceProps: {
      ref: setSurfaceRef,
      "data-nse-control": "overlay",
      "data-nse-part": "surface",
      "data-state": "open",
      "data-placement": placement,
      "data-nse-viewport-limited": viewportLimited ? "true" : "false",
      ...(contentPending ? { "data-nse-content-pending": "true" as const } : {}),
    },
    withFocusScope,
  };
}
