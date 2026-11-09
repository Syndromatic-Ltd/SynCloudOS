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
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref
} from "react";

import type { NSEBookRegions } from "../../Navigation/bookRegions";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type CSSVarStyle = CSSProperties & Record<`--${string}`, string | number>;

export interface NSESplitViewProps extends HTMLAttributes<HTMLDivElement> {
  readonly bookRegions?: NSEBookRegions | null;
  sidebar: ReactNode;
  children: ReactNode;
  sidebarWidth?: number | null;
  defaultSidebarWidth?: number;
  minSidebarWidth?: number;
  maxSidebarWidth?: number;
  onSidebarWidthChange?: (width: number | null) => void;
  resizable?: boolean;
  sidebarPosition?: "leading" | "trailing";
  label?: string;
  valueText?: (width: number) => string;
  /** The split view's root element. */
  ref?: Ref<HTMLDivElement>;
}

export function NSESplitView({
  sidebar,
  children,
  bookRegions,
  sidebarWidth,
  defaultSidebarWidth = 280,
  minSidebarWidth = 208,
  maxSidebarWidth = 460,
  onSidebarWidthChange,
  resizable = true,
  sidebarPosition = "leading",
  label = "Resize sidebar",
  valueText,
  dir,
  className = "",
  style,
  ref,
  ...props
}: NSESplitViewProps) {
  const root = useRef<HTMLDivElement>(null);
  const setRoot = useCallback((node: HTMLDivElement | null) => {
    root.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }, [ref]);
  const [inheritedDirection, setInheritedDirection] = useState("ltr");
  useLayoutEffect(() => {
    const element = root.current;
    if (element) setInheritedDirection(element.ownerDocument.defaultView?.getComputedStyle(element).direction ?? "ltr");
  }, [dir, bookRegions]);
  const direction = dir ?? inheritedDirection;
  const canResize = resizable && !bookRegions;
  useLayoutEffect(() => { if (!canResize) { dragRef.current = null; setResizing(false); } }, [canResize]);
  const [internalWidth, setInternalWidth] = useState<number | null>(null);
  const resolvedWidth = sidebarWidth !== undefined ? sidebarWidth : internalWidth;
  const activeWidth = resolvedWidth ?? defaultSidebarWidth;
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [resizing, setResizing] = useState(false);

  const clampWidth = useCallback((value: number) => (
    Math.min(maxSidebarWidth, Math.max(minSidebarWidth, Math.round(value)))
  ), [maxSidebarWidth, minSidebarWidth]);

  const commitWidth = useCallback((value: number | null) => {
    if (sidebarWidth === undefined) setInternalWidth(value);
    onSidebarWidthChange?.(value);
  }, [onSidebarWidthChange, sidebarWidth]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canResize || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startWidth: activeWidth };
    setResizing(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !canResize) return;
    const physicalDirection = (sidebarPosition === "leading" ? 1 : -1) * (direction === "rtl" ? -1 : 1);
    const delta = (event.clientX - drag.startX) * physicalDirection;
    commitWidth(clampWidth(drag.startWidth + delta));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setResizing(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* Pointer capture can already be released during teardown. */
    }
  };

  const onPointerCancel = () => {
    dragRef.current = null;
    setResizing(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!canResize) return;
    const keyDirection = (sidebarPosition === "leading" ? 1 : -1) * (direction === "rtl" ? -1 : 1);
    if (event.key === "ArrowLeft") commitWidth(clampWidth(activeWidth - 16 * keyDirection));
    else if (event.key === "ArrowRight") commitWidth(clampWidth(activeWidth + 16 * keyDirection));
    else if (event.key === "Home") commitWidth(minSidebarWidth);
    else if (event.key === "End") commitWidth(maxSidebarWidth);
    else return;
    event.preventDefault();
  };

  const splitStyle: CSSVarStyle = {
    "--nse-split-sidebar": `${activeWidth}px`,
    ...(style as CSSVarStyle | undefined),
    ...(bookRegions ? {
      "--nse-book-left": `${bookRegions.left.x}px`, "--nse-book-left-width": `${bookRegions.left.width}px`,
      "--nse-book-gap": `${bookRegions.right.x - bookRegions.left.x - bookRegions.left.width}px`,
      "--nse-book-right-width": `${bookRegions.right.width}px`, "--nse-book-top": `${bookRegions.left.y}px`,
      "--nse-book-height": `${bookRegions.left.height}px`,
    } : {})
  };

  return (
    <div
      ref={setRoot}
      data-nse-control="split-view" data-nse-part="background" data-nse-position={sidebarPosition}
      className={classes("nse-split-view", className)}
      data-book-regions={bookRegions ? "true" : undefined}
      data-book-sidebar-side={((sidebarPosition === "leading") !== (direction === "rtl")) ? "left" : "right"}
      data-sidebar-position={sidebarPosition}
      data-resizable={canResize ? "true" : "false"}
      data-resizing={resizing ? "true" : undefined}
      dir={dir}
      style={splitStyle}
      {...props}
    >
      <div data-nse-part="sidebar" className="nse-split-view-sidebar">{sidebar}</div>
      {canResize ? (
        <div
          data-nse-part="divider" data-nse-highlighted={resizing ? "" : undefined} className="nse-split-view-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={label}
          aria-valuemin={minSidebarWidth}
          aria-valuemax={maxSidebarWidth}
          aria-valuenow={Math.round(activeWidth)}
          aria-valuetext={valueText?.(Math.round(activeWidth))}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onLostPointerCapture={onPointerCancel}
          onDoubleClick={() => commitWidth(null)}
          onKeyDown={onKeyDown}
        >
          <span data-nse-part="handle" className="nse-split-view-resizer-grip" aria-hidden="true" />
        </div>
      ) : null}
      <div data-nse-part="content" className="nse-split-view-main">{children}</div>
    </div>
  );
}
