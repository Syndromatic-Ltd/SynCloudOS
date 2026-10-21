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
  arrow as floatingArrow,
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  size,
  type Padding,
  type Placement,
} from "@floating-ui/dom";
import type { NSELogicalPlacement } from "./overlayTypes";

export type NSEOverlayDirection = "ltr" | "rtl";
export type NSEOverlayCollisionPadding = Padding;

/**
 * Browser placement work must leave ResizeObserver delivery before it mutates
 * the floating surface. The owning runtime supplies this scheduler so overlay
 * code never acquires ambient timer authority.
 */
export interface NSEOverlayPositionScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface NSEOverlayPositionOptions {
  readonly anchor: HTMLElement;
  readonly floating: HTMLElement;
  readonly arrow?: HTMLElement | null;
  readonly placement?: NSELogicalPlacement;
  readonly direction?: NSEOverlayDirection;
  readonly offset?: number;
  readonly collisionPadding?: NSEOverlayCollisionPadding;
  readonly signal?: AbortSignal;
  readonly scheduler?: NSEOverlayPositionScheduler;
  readonly onAnchorRemoved?: () => void;
  /** Receives a bounded placement failure without exposing DOM or browser data. */
  onError?(): void;
}

export interface NSEViewportCornerPositionOptions {
  readonly anchor: HTMLElement;
  readonly floating: HTMLElement;
  readonly insetBlockStart: number;
  readonly insetInlineEnd: number;
  readonly availableInlineSize: number;
  readonly availableBlockSize: number;
  readonly direction?: NSEOverlayDirection;
  readonly signal?: AbortSignal;
  readonly onAnchorRemoved?: () => void;
}

const logicalPlacementMap: Readonly<Record<NSELogicalPlacement, readonly [Placement, Placement]>> = {
  "block-start": ["top", "top"],
  "block-end": ["bottom", "bottom"],
  "inline-start": ["left", "right"],
  "inline-end": ["right", "left"],
  "block-start-inline-start": ["top-start", "top-end"],
  "block-start-inline-end": ["top-end", "top-start"],
  "block-end-inline-start": ["bottom-start", "bottom-end"],
  "block-end-inline-end": ["bottom-end", "bottom-start"],
};

export function logicalPlacementToFloatingPlacement(
  placement: NSELogicalPlacement,
  direction: NSEOverlayDirection = "ltr",
): Placement {
  return logicalPlacementMap[placement][direction === "rtl" ? 1 : 0];
}

export function computeNSEOverlayPosition({
  anchor,
  floating,
  arrow,
  placement = "block-end-inline-start",
  direction = "ltr",
  offset: offsetValue = 4,
  collisionPadding = 8,
  signal,
  scheduler,
  onAnchorRemoved,
  onError,
}: NSEOverlayPositionOptions): () => void {
  let active = true;
  let generation = 0;
  let anchorRemovalReported = false;
  let placementFailureReported = false;
  let stopAutoUpdate: (() => void) | null = null;
  let hasScheduledUpdate = false;
  let scheduledUpdateHandle: unknown;
  let schedulingUpdate = false;

  const dispose = () => {
    if (!active) return;
    active = false;
    generation += 1;
    if (hasScheduledUpdate) {
      scheduler?.clearTimeout(scheduledUpdateHandle);
      hasScheduledUpdate = false;
    }
    schedulingUpdate = false;
    stopAutoUpdate?.();
    signal?.removeEventListener("abort", dispose);
  };

  const reportAnchorRemoval = () => {
    if (anchorRemovalReported) return;
    anchorRemovalReported = true;
    onAnchorRemoved?.();
    dispose();
  };

  const reportPlacementFailure = () => {
    if (!active || placementFailureReported) return;
    placementFailureReported = true;
    onError?.();
  };

  const performUpdate = () => {
    if (!active) return;
    if (!anchor.isConnected) {
      reportAnchorRemoval();
      return;
    }
    const updateGeneration = ++generation;
    try {
      void computePosition(anchor, floating, {
        // The surface is written as position: fixed, so it is placed in
        // viewport coordinates. The default "absolute" strategy answers in
        // document coordinates, which differ by the scroll offset whenever
        // the document scrolls.
        strategy: "fixed",
        placement: logicalPlacementToFloatingPlacement(placement, direction),
        middleware: [
          offset(offsetValue),
          flip({ fallbackAxisSideDirection: "start", padding: collisionPadding }),
          shift({ padding: collisionPadding }),
          size({
            padding: collisionPadding,
            apply: ({ availableWidth, availableHeight, elements }) => {
              elements.floating.style.setProperty("--nse-overlay-available-inline-size", `${Math.max(0, availableWidth)}px`);
              elements.floating.style.setProperty("--nse-overlay-available-block-size", `${Math.max(0, availableHeight)}px`);
            },
          }),
          ...(arrow ? [floatingArrow({ element: arrow })] : []),
        ],
      }).then(({ x, y, placement: resolvedPlacement, middlewareData }) => {
        if (!active || generation !== updateGeneration || !anchor.isConnected) return;
        const viewport = floating.ownerDocument.defaultView;
        const viewportWidth = viewport?.innerWidth ?? floating.ownerDocument.documentElement.clientWidth;
        const viewportHeight = viewport?.innerHeight ?? floating.ownerDocument.documentElement.clientHeight;
        const floatingRect = floating.getBoundingClientRect();
        const padding = typeof collisionPadding === "number" ? {
          top: collisionPadding,
          right: collisionPadding,
          bottom: collisionPadding,
          left: collisionPadding,
        } : {
          top: collisionPadding.top ?? 0,
          right: collisionPadding.right ?? 0,
          bottom: collisionPadding.bottom ?? 0,
          left: collisionPadding.left ?? 0,
        };
        // Floating UI normally applies shift(), but WebKit can publish a
        // placement before the portal surface's first measured rect. Clamp
        // that result once more at the owning viewport so an interactive
        // overlay cannot be rendered outside the hit-testable area.
        const boundedX = Math.min(Math.max(x, padding.left), Math.max(padding.left, viewportWidth - floatingRect.width - padding.right));
        const boundedY = Math.min(Math.max(y, padding.top), Math.max(padding.top, viewportHeight - floatingRect.height - padding.bottom));
        floating.style.position = "fixed";
        floating.style.left = `${boundedX}px`;
        floating.style.top = `${boundedY}px`;
        floating.dataset.placement = resolvedPlacement;
        const arrowData = middlewareData.arrow;
        if (!arrow || !arrowData) return;
        const staticSide = {
          top: "bottom",
          right: "left",
          bottom: "top",
          left: "right",
        }[resolvedPlacement.split("-")[0] as "top" | "right" | "bottom" | "left"];
        arrow.style.left = arrowData.x == null ? "" : `${arrowData.x}px`;
        arrow.style.top = arrowData.y == null ? "" : `${arrowData.y}px`;
        arrow.style.right = "";
        arrow.style.bottom = "";
        arrow.style.setProperty(staticSide, "-4px");
      }).catch(reportPlacementFailure);
    } catch {
      reportPlacementFailure();
    }
  };

  let placed = false;
  const update = () => {
    if (!active) return;
    // The first placement runs now, inside the opening commit: its promise
    // settles in microtasks, before the browser paints, so the surface is
    // never seen unplaced. Later updates come from observers and leave their
    // delivery through the scheduler.
    if (!scheduler || !placed) {
      placed = true;
      performUpdate();
      return;
    }
    if (hasScheduledUpdate || schedulingUpdate) return;
    schedulingUpdate = true;
    try {
      const handle = scheduler.setTimeout(() => {
        hasScheduledUpdate = false;
        schedulingUpdate = false;
        performUpdate();
      }, 0);
      // Test runtimes can execute injected callbacks synchronously. In that
      // case the callback already cleared the scheduling state before a handle
      // existed, so retaining this handle would leak a phantom update.
      if (schedulingUpdate) {
        scheduledUpdateHandle = handle;
        hasScheduledUpdate = true;
        schedulingUpdate = false;
      }
    } catch {
      schedulingUpdate = false;
      reportPlacementFailure();
    }
  };

  if (signal?.aborted) {
    dispose();
    return () => undefined;
  }
  signal?.addEventListener("abort", dispose, { once: true });
  // Out of the page flow before anything measures it: an in-flow surface
  // lengthens the document and is measured at its flow width.
  floating.style.position = "fixed";
  stopAutoUpdate = autoUpdate(anchor, floating, update);
  return dispose;
}

/**
 * Positions a branch-owned overlay against the runtime work-area corner while
 * retaining its real trigger as lifecycle and focus authority. This is used by
 * shell application menus whose product geometry is viewport-attached rather
 * than trigger-adjacent.
 */
export function computeNSEViewportCornerPosition({
  anchor,
  floating,
  insetBlockStart,
  insetInlineEnd,
  availableInlineSize,
  availableBlockSize,
  direction = "ltr",
  signal,
  onAnchorRemoved,
}: NSEViewportCornerPositionOptions): () => void {
  let active = true;
  let anchorRemovalReported = false;

  const dispose = () => {
    if (!active) return;
    active = false;
    signal?.removeEventListener("abort", dispose);
  };
  const apply = () => {
    if (!active) return;
    if (!anchor.isConnected) {
      if (!anchorRemovalReported) onAnchorRemoved?.();
      anchorRemovalReported = true;
      dispose();
      return;
    }
    floating.style.position = "fixed";
    floating.style.top = `${insetBlockStart}px`;
    floating.style.bottom = "auto";
    if (direction === "rtl") {
      floating.style.left = `${insetInlineEnd}px`;
      floating.style.right = "auto";
    } else {
      floating.style.right = `${insetInlineEnd}px`;
      floating.style.left = "auto";
    }
    floating.style.setProperty("--nse-overlay-available-inline-size", `${availableInlineSize}px`);
    floating.style.setProperty("--nse-overlay-available-block-size", `${availableBlockSize}px`);
    floating.dataset.placement = "viewport-block-start-inline-end";
  };
  if (signal?.aborted) return () => undefined;
  signal?.addEventListener("abort", dispose, { once: true });
  // This position is fixed to the runtime work-area corner. Viewport changes
  // are already published through the runtime environment and cause the
  // owning overlay hook to re-run with fresh geometry; subscribing Floating UI
  // to every overflow ancestor would duplicate those updates and retain
  // resize/scroll listeners for every menu presentation. The corner is known
  // without measuring, so it is applied before the surface first paints.
  apply();
  return dispose;
}
