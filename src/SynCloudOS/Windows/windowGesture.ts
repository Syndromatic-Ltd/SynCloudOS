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

import type { WindowBounds } from "./windowTypes";
import type { WindowManager } from "./WindowManager";

export type WindowResizeEdge =
  | "block-start"
  | "block-end"
  | "inline-start"
  | "inline-end"
  | "block-start-inline-start"
  | "block-start-inline-end"
  | "block-end-inline-start"
  | "block-end-inline-end";

export type WindowMoveResizeGesture =
  | { readonly kind: "move" }
  | { readonly kind: "resize"; readonly edge: WindowResizeEdge };

/** Structural pointer-down event handed to gesture entry points. Framework
 * adapters (React and app-owned custom chrome alike) project their native
 * events onto this shape; the gesture itself never imports a view library. */
export interface WindowGesturePointerDownEvent {
  readonly button: number;
  readonly isPrimary: boolean;
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly target: Element;
  readonly currentTarget: HTMLElement;
}

export interface DeriveWindowGestureBoundsRequest {
  readonly kind: "move" | "resize";
  readonly edge?: WindowResizeEdge;
  readonly initialBounds: WindowBounds;
  readonly inlineDelta: number;
  readonly blockDelta: number;
  readonly minimumSize: { readonly width: number; readonly height: number };
  readonly maximumSize: { readonly width: number; readonly height: number } | null;
}

export interface CreateWindowPointerGestureOptions {
  readonly manager: WindowManager;
  readonly windowControllerId: string;
  readonly gesture: WindowMoveResizeGesture;
  readonly disabled?: boolean;
  /** Live movability read at pointer-down time. Lets hosts track presentation
   * without recreating the gesture — recreating mid-drag would dispose the
   * in-flight gesture and cancel the drag. */
  readonly isDisabled?: () => boolean;
}

interface ActiveGesture {
  readonly target: HTMLElement;
  readonly pointerId: number;
  readonly initialInline: number;
  readonly initialBlock: number;
  readonly initialBounds: WindowBounds;
  readonly minimumSize: { readonly width: number; readonly height: number };
  readonly maximumSize: { readonly width: number; readonly height: number } | null;
  readonly gesture: WindowMoveResizeGesture;
  readonly onPointerMove: (event: PointerEvent) => void;
  readonly onPointerUp: (event: PointerEvent) => void;
  readonly onPointerCancel: (event: PointerEvent) => void;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function deriveWindowGestureBounds(request: DeriveWindowGestureBoundsRequest): WindowBounds {
  const { initialBounds } = request;
  if (request.kind === "move") {
    return {
      x: initialBounds.x + request.inlineDelta,
      y: initialBounds.y + request.blockDelta,
      width: initialBounds.width,
      height: initialBounds.height,
    };
  }
  if (!request.edge) throw new TypeError("Resize gestures require a logical edge.");
  const maximumWidth = request.maximumSize?.width ?? Number.POSITIVE_INFINITY;
  const maximumHeight = request.maximumSize?.height ?? Number.POSITIVE_INFINITY;
  const startsInline = request.edge.includes("inline-start");
  const endsInline = request.edge.includes("inline-end");
  const startsBlock = request.edge.includes("block-start");
  const endsBlock = request.edge.includes("block-end");
  const width = startsInline
    ? clamp(initialBounds.width - request.inlineDelta, request.minimumSize.width, maximumWidth)
    : endsInline
      ? clamp(initialBounds.width + request.inlineDelta, request.minimumSize.width, maximumWidth)
      : initialBounds.width;
  const height = startsBlock
    ? clamp(initialBounds.height - request.blockDelta, request.minimumSize.height, maximumHeight)
    : endsBlock
      ? clamp(initialBounds.height + request.blockDelta, request.minimumSize.height, maximumHeight)
      : initialBounds.height;
  return {
    x: startsInline ? initialBounds.x + initialBounds.width - width : initialBounds.x,
    y: startsBlock ? initialBounds.y + initialBounds.height - height : initialBounds.y,
    width,
    height,
  };
}

/** Owns one pointer-driven move/resize gesture on a window region. The
 * caller forwards its structural pointer-down event and disposes when the
 * region unmounts; gesture bookkeeping never leaks past dispose. */
export function createWindowPointerGesture(options: CreateWindowPointerGestureOptions): {
  readonly onPointerDown: (event: WindowGesturePointerDownEvent) => void;
  readonly dispose: () => void;
} {
  let active: ActiveGesture | null = null;

  const finish = (cancel: boolean) => {
    const gesture = active;
    if (!gesture) return;
    active = null;
    gesture.target.removeEventListener("pointermove", gesture.onPointerMove);
    gesture.target.removeEventListener("pointerup", gesture.onPointerUp);
    gesture.target.removeEventListener("pointercancel", gesture.onPointerCancel);
    if (cancel) options.manager.cancelScheduledBoundsChange(options.windowControllerId);
    else options.manager.flushScheduledBoundsChange(options.windowControllerId);
    if (gesture.target.hasPointerCapture?.(gesture.pointerId)) {
      gesture.target.releasePointerCapture(gesture.pointerId);
    }
  };

  const onPointerDown = (event: WindowGesturePointerDownEvent): void => {
    if (
      options.disabled || options.isDisabled?.() || event.button !== 0 || event.isPrimary === false || active ||
      options.manager.isCompactPresentation(options.windowControllerId)
    ) return;
    if (
      options.gesture.kind === "move" &&
      event.target.closest("button, input, select, textarea, a, [data-window-no-drag]")
    ) return;
    const controller = options.manager.select(options.windowControllerId);
    if (controller.record.state !== "open") return;
    if (options.gesture.kind === "resize" && !controller.record.style.includes("resizable")) return;
    const target = event.currentTarget;
    const onPointerMove = (pointerEvent: PointerEvent) => {
      const current = active;
      if (!current || pointerEvent.pointerId !== current.pointerId) return;
      const bounds = deriveWindowGestureBounds({
        kind: current.gesture.kind,
        edge: current.gesture.kind === "resize" ? current.gesture.edge : undefined,
        initialBounds: current.initialBounds,
        inlineDelta: pointerEvent.clientX - current.initialInline,
        blockDelta: pointerEvent.clientY - current.initialBlock,
        minimumSize: current.minimumSize,
        maximumSize: current.maximumSize,
      });
      options.manager.scheduleBoundsChange(options.windowControllerId, {
        kind: "replace",
        bounds,
        reason: current.gesture.kind === "move" ? "pointer-move" : "pointer-resize",
      });
    };
    const onPointerUp = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId === active?.pointerId) finish(false);
    };
    const onPointerCancel = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId === active?.pointerId) finish(true);
    };
    const gesture: ActiveGesture = {
      target,
      pointerId: event.pointerId,
      initialInline: event.clientX,
      initialBlock: event.clientY,
      initialBounds: controller.record.bounds,
      minimumSize: controller.record.minimumSize,
      maximumSize: controller.record.maximumSize,
      gesture: options.gesture,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    };
    active = gesture;
    target.setPointerCapture(event.pointerId);
    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp);
    target.addEventListener("pointercancel", onPointerCancel);
  };

  return {
    onPointerDown,
    dispose: () => finish(true),
  };
}
