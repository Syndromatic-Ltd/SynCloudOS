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
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type CSSVarStyle = CSSProperties & Record<`--${string}`, string | number>;

export interface NSESplitViewProps extends HTMLAttributes<HTMLDivElement> {
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
}

export function NSESplitView({
  sidebar,
  children,
  sidebarWidth,
  defaultSidebarWidth = 280,
  minSidebarWidth = 208,
  maxSidebarWidth = 460,
  onSidebarWidthChange,
  resizable = true,
  sidebarPosition = "leading",
  label = "Resize sidebar",
  valueText,
  dir = "ltr",
  className = "",
  style,
  ...props
}: NSESplitViewProps) {
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
    if (!resizable || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startWidth: activeWidth };
    setResizing(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const physicalDirection = (sidebarPosition === "leading" ? 1 : -1) * (dir === "rtl" ? -1 : 1);
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
    if (!resizable) return;
    const direction = (sidebarPosition === "leading" ? 1 : -1) * (dir === "rtl" ? -1 : 1);
    if (event.key === "ArrowLeft") commitWidth(clampWidth(activeWidth - 16 * direction));
    else if (event.key === "ArrowRight") commitWidth(clampWidth(activeWidth + 16 * direction));
    else if (event.key === "Home") commitWidth(minSidebarWidth);
    else if (event.key === "End") commitWidth(maxSidebarWidth);
    else return;
    event.preventDefault();
  };

  const splitStyle: CSSVarStyle = {
    "--nse-split-sidebar": `${activeWidth}px`,
    ...(style as CSSVarStyle | undefined)
  };

  return (
    <div
      className={classes("nse-split-view", className)}
      data-sidebar-position={sidebarPosition}
      data-resizable={resizable ? "true" : "false"}
      data-resizing={resizing ? "true" : undefined}
      dir={dir}
      style={splitStyle}
      {...props}
    >
      <div className="nse-split-view-sidebar">{sidebar}</div>
      {resizable ? (
        <div
          className="nse-split-view-resizer"
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
          <span className="nse-split-view-resizer-grip" aria-hidden="true" />
        </div>
      ) : null}
      <div className="nse-split-view-main">{children}</div>
    </div>
  );
}
