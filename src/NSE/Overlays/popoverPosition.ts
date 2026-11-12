/*
 * SynCloudOS
 * Copyright Â© 2026 Syndromatic Ltd. All rights reserved.
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

import { arrow, computePosition, flip, offset, shift, size, platform, type Placement } from "@floating-ui/dom";
import type { NSELogicalPlacement } from "./overlayTypes";
import { updateNSEPopoverFrame } from "./popoverFrame";
import { setNSEHook } from "../Theme/contract/hookMirrorDOM";

type Rect = Readonly<{ x: number; y: number; width: number; height: number }>;
export interface NSEPopoverPosition {
  readonly bounds: Rect;
  readonly placement: Placement;
  readonly arrowX?: number;
  readonly arrowY?: number;
}

/** One placement engine for window-hosted and standalone popovers. Geometry
 * is independent of the animated DOM and can also run before a window opens. */
export async function computeNSEPopoverPosition({ reference, contentSize, boundary, placement, collisionPadding = 8, presentation = "anchored" }: {
  readonly reference: Rect;
  readonly contentSize: Readonly<{ width: number; height: number }>;
  readonly boundary: Rect;
  readonly placement: Placement;
  readonly collisionPadding?: number;
  readonly presentation?: "anchored" | "sheet";
}): Promise<NSEPopoverPosition> {
  const dimensions = { width: Math.max(1, Math.min(contentSize.width, boundary.width - collisionPadding * 2)), height: Math.max(1, Math.min(contentSize.height, boundary.height - collisionPadding * 2)) };
  if (presentation === "sheet") return { bounds: { x: boundary.x + collisionPadding, y: boundary.y + boundary.height - collisionPadding - dimensions.height, ...dimensions }, placement: "bottom" };
  const pointer = {} as HTMLElement;
  const clipping = { rootBoundary: boundary, boundary: [] as Element[], padding: collisionPadding };
  const result = await computePosition({} as HTMLElement, {} as HTMLElement, {
    strategy: "fixed", placement,
    platform: {
      ...platform,
      getElementRects: () => ({ reference, floating: { x: 0, y: 0, ...dimensions } }),
      getClippingRect: () => boundary,
      getDimensions: element => element === pointer ? { width: 20, height: 20 } : dimensions,
      getOffsetParent: () => ({} as Element),
      isElement: () => false,
      isRTL: () => false,
    },
    middleware: [
      offset(12), flip({ ...clipping, crossAxis: false }), shift(clipping),
      size({ ...clipping, apply: ({ availableWidth, availableHeight }) => {
        dimensions.width = Math.max(1, Math.min(contentSize.width, availableWidth));
        dimensions.height = Math.max(1, Math.min(contentSize.height, availableHeight));
      } }),
      arrow({ element: pointer, padding: 12 }),
    ],
  });
  const x = Math.max(boundary.x + collisionPadding, Math.min(result.x, boundary.x + boundary.width - dimensions.width - collisionPadding));
  const y = Math.max(boundary.y + collisionPadding, Math.min(result.y, boundary.y + boundary.height - dimensions.height - collisionPadding));
  return {
    bounds: { x, y, ...dimensions }, placement: result.placement,
    ...(result.middlewareData.arrow?.x == null ? {} : { arrowX: result.middlewareData.arrow.x + result.x - x }),
    ...(result.middlewareData.arrow?.y == null ? {} : { arrowY: result.middlewareData.arrow.y + result.y - y }),
  };
}

export function nsePopoverReference(anchor: HTMLElement, relativeTo?: Rect): Rect {
  const rect = anchor.getBoundingClientRect();
  if (!relativeTo) return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  const scaleX = anchor.offsetWidth ? rect.width / anchor.offsetWidth : 1;
  const scaleY = anchor.offsetHeight ? rect.height / anchor.offsetHeight : 1;
  return { x: rect.x + relativeTo.x * scaleX, y: rect.y + relativeTo.y * scaleY, width: relativeTo.width * scaleX, height: relativeTo.height * scaleY };
}

export const nsePopoverEdgePlacement = { minX: "inline-start", maxX: "inline-end", minY: "block-start", maxY: "block-end" } as const satisfies Record<string, NSELogicalPlacement>;

/** Shared arrow coordinates, animation origin and continuous outline. */
export function applyNSEPopoverPosition(surface: HTMLElement, pointer: HTMLElement | null, position: NSEPopoverPosition): void {
  surface.dataset.placement = position.placement;
  setNSEHook(surface, "placement", position.placement);
  const { width, height } = position.bounds;
  const side = position.placement.split("-")[0] as "top" | "bottom" | "left" | "right";
  if (pointer) {
    pointer.style.left = position.arrowX == null ? "" : `${position.arrowX}px`;
    pointer.style.top = position.arrowY == null ? "" : `${position.arrowY}px`;
    pointer.style.right = ""; pointer.style.bottom = "";
    pointer.style.setProperty(({ top: "bottom", bottom: "top", left: "right", right: "left" } as const)[side], "-10px");
    surface.style.transformOrigin = `${position.arrowX == null ? (side === "right" ? -10 : width + 10) : position.arrowX + 10}px ${position.arrowY == null ? (side === "bottom" ? -10 : height + 10) : position.arrowY + 10}px`;
  }
  updateNSEPopoverFrame(surface, pointer);
  surface.dataset.nsePositioned = "true";
}
