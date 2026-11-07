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
import type { NSEOverlayRegionBounds } from "./overlayRegion";
import type { NSELogicalPlacement } from "./overlayTypes";
import { updateNSEPopoverFrame } from "./popoverFrame";

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

/** A point in viewport coordinates. */
export interface NSEOverlayAnchorPoint {
  readonly x: number;
  readonly y: number;
}

export interface NSEOverlayPositionOptions {
  readonly anchor: HTMLElement;
  /**
   * Place against this point instead of the anchor's box, as
   * NSMenu.popUpContextMenu(_:with:for:) places a menu at the event's location.
   * The anchor still owns the surface's lifetime and focus.
   */
  readonly anchorPoint?: NSEOverlayAnchorPoint | null;
  /** A rectangle in the positioning view's local coordinates. */
  readonly anchorRect?: Pick<DOMRectReadOnly, "x" | "y" | "width" | "height">;
  readonly floating: HTMLElement;
  readonly boundary?: () => NSEOverlayRegionBounds | null;
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
  readonly boundary?: NSEOverlayRegionBounds | null;
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
  anchorPoint = null,
  anchorRect,
  floating,
  boundary,
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

  const reference = anchorPoint
    ? {
        contextElement: anchor,
        getBoundingClientRect: () => ({ x: anchorPoint.x, y: anchorPoint.y, top: anchorPoint.y, left: anchorPoint.x, bottom: anchorPoint.y, right: anchorPoint.x, width: 0, height: 0 }),
      }
    : anchorRect ? {
        contextElement: anchor,
        getBoundingClientRect: () => {
          const bounds = anchor.getBoundingClientRect();
          const scaleX = anchor.offsetWidth ? bounds.width / anchor.offsetWidth : 1;
          const scaleY = anchor.offsetHeight ? bounds.height / anchor.offsetHeight : 1;
          const x = bounds.x + anchorRect.x * scaleX, y = bounds.y + anchorRect.y * scaleY;
          const width = anchorRect.width * scaleX, height = anchorRect.height * scaleY;
          return { x, y, top: y, left: x, right: x + width, bottom: y + height, width, height };
        },
      } : anchor;

  const performUpdate = () => {
    if (!active) return;
    if (!anchor.isConnected) {
      reportAnchorRemoval();
      return;
    }
    const updateGeneration = ++generation;
    try {
      const region = boundary?.() ?? null;
      const clipping = region ? { rootBoundary: region, boundary: [] as Element[] } : {};
      void computePosition(reference, floating, {
        // The surface is written as position: fixed, so it is placed in
        // viewport coordinates. The default "absolute" strategy answers in
        // document coordinates, which differ by the scroll offset whenever
        // the document scrolls.
        strategy: "fixed",
        placement: logicalPlacementToFloatingPlacement(placement, direction),
        middleware: [
          offset(anchorPoint ? 0 : offsetValue),
          flip({ ...clipping, padding: collisionPadding, ...(arrow ? { crossAxis: false } : { fallbackAxisSideDirection: "start" as const }) }),
          // Shift along the edge. Size, rather than primary-axis shifting,
          // keeps a tall popover beside the anchor instead of covering it.
          shift({ ...clipping, padding: collisionPadding }),
          size({
            ...clipping,
            padding: collisionPadding,
            apply: ({ availableWidth, availableHeight, elements, rects }) => {
              elements.floating.style.setProperty("--nse-overlay-anchor-inline-size", `${rects.reference.width}px`);
              elements.floating.style.setProperty("--nse-overlay-available-inline-size", `${region ? Math.max(0, availableWidth) : availableWidth}px`);
              elements.floating.style.setProperty("--nse-overlay-available-block-size", `${region ? Math.max(0, availableHeight) : availableHeight}px`);
            },
          }),
          ...(arrow ? [floatingArrow({ element: arrow, padding: 12 })] : []),
        ],
      }).then(({ x, y, placement: resolvedPlacement, middlewareData }) => {
        if (!active || generation !== updateGeneration || !anchor.isConnected) return;
        const viewport = floating.ownerDocument.defaultView;
        const viewportWidth = viewport?.innerWidth ?? floating.ownerDocument.documentElement.clientWidth;
        const viewportHeight = viewport?.innerHeight ?? floating.ownerDocument.documentElement.clientHeight;
        // Presentation scaling must not change the collision geometry.
        const floatingRect = { width: floating.offsetWidth, height: floating.offsetHeight };
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
        const boundedX = Math.min(Math.max(x, (region?.x ?? 0) + padding.left), Math.max((region?.x ?? 0) + padding.left, (region ? region.x + region.width : viewportWidth) - floatingRect.width - padding.right));
        const boundedY = Math.min(Math.max(y, (region?.y ?? 0) + padding.top), Math.max((region?.y ?? 0) + padding.top, (region ? region.y + region.height : viewportHeight) - floatingRect.height - padding.bottom));
        floating.style.position = "fixed";
        floating.style.left = `${boundedX}px`;
        floating.style.top = `${boundedY}px`;
        floating.dataset.placement = resolvedPlacement;
        const arrowData = middlewareData.arrow;
        if (!arrow || !arrowData) { floating.dataset.nsePositioned = "true"; return; }
        const staticSide = {
          top: "bottom",
          right: "left",
          bottom: "top",
          left: "right",
        }[resolvedPlacement.split("-")[0] as "top" | "right" | "bottom" | "left"];
        // The final viewport guard can shift a first WebKit measurement after
        // middleware ran. Correct the arrow by that same displacement.
        const arrowWidth = arrow.offsetWidth, arrowHeight = arrow.offsetHeight;
        const arrowX = arrowData.x == null ? null : Math.max(12, Math.min(floatingRect.width - 12 - arrowWidth, arrowData.x + x - boundedX));
        const arrowY = arrowData.y == null ? null : Math.max(12, Math.min(floatingRect.height - 12 - arrowHeight, arrowData.y + y - boundedY));
        arrow.style.left = arrowX == null ? "" : `${arrowX}px`;
        arrow.style.top = arrowY == null ? "" : `${arrowY}px`;
        arrow.style.right = "";
        arrow.style.bottom = "";
        arrow.style.setProperty(staticSide, `${-(staticSide === "left" || staticSide === "right" ? arrowWidth : arrowHeight) / 2}px`);
        const originX = arrowX == null ? (staticSide === "left" ? -arrowWidth / 2 : floatingRect.width + arrowWidth / 2) : arrowX + arrowWidth / 2;
        const originY = arrowY == null ? (staticSide === "top" ? -arrowHeight / 2 : floatingRect.height + arrowHeight / 2) : arrowY + arrowHeight / 2;
        floating.style.transformOrigin = `${originX}px ${originY}px`;
        updateNSEPopoverFrame(floating, arrow);
        floating.dataset.nsePositioned = "true";
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
  stopAutoUpdate = autoUpdate(reference, floating, update);
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
  boundary,
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
    floating.style.top = `${(boundary?.y ?? 0) + insetBlockStart}px`;
    floating.style.bottom = "auto";
    if (direction === "rtl") {
      floating.style.left = `${(boundary?.x ?? 0) + insetInlineEnd}px`;
      floating.style.right = "auto";
    } else {
      floating.style.right = `${(boundary ? (floating.ownerDocument.defaultView?.innerWidth ?? boundary.x + boundary.width) - boundary.x - boundary.width : 0) + insetInlineEnd}px`;
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
