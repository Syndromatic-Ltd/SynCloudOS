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

import { useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { classes } from "../Core/nseControlsShared";

export interface NSEGrabHandleProps extends Omit<HTMLAttributes<HTMLElement>, "onDragStart" | "onDragEnd"> {
  label?: string;
  /** Fires once when a pointer drag begins on the handle. */
  onDragStart?: (event: ReactPointerEvent) => void;
  /** Fires on each move during a drag, with the delta from where the drag began. */
  onDragMove?: (delta: { dx: number; dy: number }, event: ReactPointerEvent) => void;
  /** Fires when the drag ends (pointerup/cancel). */
  onDragEnd?: (event: ReactPointerEvent) => void;
}

/**
A grab handle: a grip the user drags to slide a
pane. With no drag handlers it stays a presentational handle; supply any of `onDragStart/onDragMove/
onDragEnd` and it becomes a real draggable button that pointer-captures and reports the drag delta.
*/
export function NSEGrabHandle({
  label = "Grab handle",
  className = "",
  onDragStart,
  onDragMove,
  onDragEnd,
  ...props
}: NSEGrabHandleProps) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const draggable = Boolean(onDragStart || onDragMove || onDragEnd);

  if (!draggable) {
    return <span className={classes("nse-control-grab-handle", className)} role="img" aria-label={label} {...props} />;
  }

  const begin = (event: ReactPointerEvent<HTMLButtonElement>) => {
    origin.current = { x: event.clientX, y: event.clientY };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onDragStart?.(event);
  };
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!origin.current) return;
    onDragMove?.({ dx: event.clientX - origin.current.x, dy: event.clientY - origin.current.y }, event);
  };
  const end = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!origin.current) return;
    origin.current = null;
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer already released */
    }
    onDragEnd?.(event);
  };

  return (
    <button
      type="button"
      className={classes("nse-control-grab-handle", "nse-control-grab-handle-draggable", className)}
      aria-label={label}
      data-dragging={dragging ? "true" : undefined}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      {...(props as ButtonHTMLAttributes<HTMLButtonElement>)}
    />
  );
}
