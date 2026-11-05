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

import { useRef, useState, type HTMLAttributes, type PointerEvent, type ReactNode } from "react";

/** How far a horizontal swipe travels before it turns the page, in CSS pixels. */
const SWIPE_DISTANCE = 48;

/**
 * NSPageController.TransitionStyle. `horizontalStrip` lays the pages side by
 * side and slides between them.
 */
export type NSEPageControllerTransitionStyle = "horizontalStrip";

export interface NSEPageControllerProps<T> extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** NSPageController.arrangedObjects: one page for each object. */
  readonly arrangedObjects: readonly T[];
  /** NSPageController.selectedIndex. Uncontrolled when omitted. */
  readonly selectedIndex?: number;
  readonly defaultSelectedIndex?: number;
  /** pageController(_:didTransitionTo:), after a swipe turns the page. */
  readonly onSelectedIndexChange?: (index: number, object: T) => void;
  /** NSPageController.transitionStyle. Default `horizontalStrip`. */
  readonly transitionStyle?: NSEPageControllerTransitionStyle;
  /** pageController(_:identifierFor:): a stable key for an object's page. Default its index. */
  readonly identifierForObject?: (object: T, index: number) => string;
  /** pageController(_:viewControllerForIdentifier:) and prepare(_:with:): the page's view for an object. */
  readonly viewForObject: (object: T, index: number) => ReactNode;
}

/**
 * NSPageController: pages for an array of objects, one shown at a time. A
 * horizontal swipe turns to the next or previous page. The pages stay
 * mounted, so each keeps its state; pages not shown are inert.
 */
export function NSEPageController<T>({
  arrangedObjects,
  selectedIndex,
  defaultSelectedIndex = 0,
  onSelectedIndexChange,
  transitionStyle = "horizontalStrip",
  identifierForObject = (_object, index) => String(index),
  viewForObject,
  className = "",
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  ...props
}: NSEPageControllerProps<T>) {
  const [uncontrolledIndex, setUncontrolledIndex] = useState(defaultSelectedIndex);
  const swipe = useRef<{ readonly pointerId: number; readonly x: number; readonly y: number } | null>(null);
  const count = arrangedObjects.length;
  const index = count ? Math.min(Math.max(0, Math.trunc(selectedIndex ?? uncontrolledIndex)), count - 1) : 0;
  const transition = (next: number) => {
    if (next < 0 || next >= count || next === index) return;
    if (selectedIndex === undefined) setUncontrolledIndex(next);
    onSelectedIndexChange?.(next, arrangedObjects[next] as T);
  };
  const endSwipe = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    if (Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) > Math.abs(event.clientY - start.y)) transition(index + (dx < 0 ? 1 : -1));
  };
  return (
    <div
      {...props}
      className={["nse-container-sliding-view", className].filter(Boolean).join(" ")}
      data-nse-control="page-controller"
      data-transition-style={transitionStyle}
      data-axis="horizontal"
      data-selected-index={index}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        if (!event.defaultPrevented && event.isPrimary) swipe.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => { onPointerUp?.(event); endSwipe(event); }}
      onPointerCancel={(event) => { onPointerCancel?.(event); swipe.current = null; }}
    >
      <div className="nse-container-sliding-view-viewport">
        <div className="nse-container-sliding-view-track" style={{ transform: `translate3d(-${index * 100}%, 0, 0)` }}>
          {arrangedObjects.map((object, objectIndex) => (
            <section
              key={identifierForObject(object, objectIndex)}
              className="nse-container-sliding-view-panel"
              aria-roledescription="page"
              aria-hidden={objectIndex !== index}
              inert={objectIndex !== index}
              data-active={objectIndex === index ? "true" : "false"}
            >
              {viewForObject(object, objectIndex)}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
