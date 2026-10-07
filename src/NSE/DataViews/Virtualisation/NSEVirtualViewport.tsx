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
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import type { NSEVirtualItem, NSEVirtualiser } from "./virtualisationTypes";

export interface NSEVirtualViewportProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  readonly virtualiser: NSEVirtualiser;
  readonly renderItem: (item: NSEVirtualItem) => ReactNode;
  readonly activeDescendantId?: string;
  readonly busy?: boolean;
  readonly status?: string;
  readonly viewportSize?: number;
}

function NSEMeasuredVirtualItem({
  item,
  virtualiser,
  axis,
  children,
}: {
  readonly item: NSEVirtualItem;
  readonly virtualiser: NSEVirtualiser;
  readonly axis: "block" | "inline";
  readonly children: ReactNode;
}) {
  const nodeRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    const measure = () => {
      const size = axis === "block" ? node.offsetHeight : node.offsetWidth;
      if (size > 0) virtualiser.measure(item.index, size);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [axis, item.index, virtualiser]);
  return (
    <div
      ref={nodeRef}
      className="nse-virtual-item"
      data-index={item.index}
      style={axis === "block"
        ? { position: "absolute", insetInline: 0, insetBlockStart: `${item.start}px`, minHeight: `${item.size}px` }
        : { position: "absolute", insetBlock: 0, insetInlineStart: `${item.start}px`, minWidth: `${item.size}px` }}
    >
      {children}
    </div>
  );
}

export const NSEVirtualViewport = forwardRef<HTMLDivElement, NSEVirtualViewportProps>(function NSEVirtualViewport({
  virtualiser,
  renderItem,
  activeDescendantId,
  busy = false,
  status = "",
  viewportSize,
  role = "list",
  style,
  className = "",
  ...props
}, forwardedRef) {
  const viewportRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwardedRef, () => viewportRef.current!, []);

  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node || viewportSize === undefined) return;
    Object.defineProperty(node, virtualiser.snapshot.axis === "block" ? "clientHeight" : "clientWidth", {
      configurable: true,
      value: viewportSize,
    });
  }, [viewportSize, virtualiser.snapshot.axis]);

  const axis = virtualiser.snapshot.axis;
  const containerStyle: CSSProperties = axis === "block"
    ? { position: "relative", height: `${virtualiser.snapshot.range.totalSize}px` }
    : { position: "relative", width: `${virtualiser.snapshot.range.totalSize}px` };

  return (
    <div
      {...props}
      ref={(node) => { viewportRef.current = node; virtualiser.attachViewport?.(node); }}
      role={role}
      className={`nse-virtual-viewport ${className}`.trim()}
      aria-activedescendant={activeDescendantId}
      aria-busy={busy}
      style={{ overflow: "auto", ...style }}
      data-nse-control="virtual-viewport"
      data-axis={axis}
    >
      <div className="nse-virtual-viewport-content" style={containerStyle}>
        {virtualiser.snapshot.items.map((item) => (
          <NSEMeasuredVirtualItem
            key={item.key}
            item={item}
            virtualiser={virtualiser}
            axis={axis}
          >
            {renderItem(item)}
          </NSEMeasuredVirtualItem>
        ))}
      </div>
      <span role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }}>
        {status}
      </span>
    </div>
  );
});
