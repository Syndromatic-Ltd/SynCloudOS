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
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type UIEvent
} from "react";
import {
  useNSEListSelection,
  type NSEListSelectionOptions,
  type NSEListSelectionState
} from "./NSEList";
import { useNSERubberBandScroll } from "../Scroll";
import { computeNSEVirtualRange } from "../DataViews/Virtualisation";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Inputs to the windowing calculation. */
export interface NSEVirtualWindowOptions {
  /** Total number of rows in the list. */
  rowCount: number;
  /** Fixed pixel height of every row. */
  rowHeight: number;
  /** Height of the scrolling viewport in pixels. */
  viewportHeight: number;
  /** Current scroll offset in pixels. */
  scrollTop: number;
  /** Rows per page. Default 10. */
  pageSize?: number;
  /** Extra pages rendered beyond the viewport on each side. Default 2. */
  lookAhead?: number;
}

/** The resolved window of rows to render plus the page span for acquire/discard. */
export interface NSEVirtualWindow {
  /** First rendered row index (inclusive), snapped to a page boundary. */
  startIndex: number;
  /** Last rendered row index (exclusive), snapped to a page boundary. */
  endIndex: number;
  /** Pixel offset of `startIndex` from the top of the list (startIndex × rowHeight). */
  offsetY: number;
  /** Full scroll height of the list (rowCount × rowHeight). */
  totalHeight: number;
  /** First row actually inside the viewport. */
  firstVisibleIndex: number;
  /** Row just past the last one inside the viewport. */
  lastVisibleIndex: number;
  /** First page in the rendered window (inclusive). */
  startPage: number;
  /** Page just past the last rendered page (exclusive). */
  endPage: number;
  /** Total number of pages. */
  pageCount: number;
}

/**
Computes which rows a virtual list should render for a given scroll position. Only the rows around the
viewport (plus `lookAhead` pages of overbuffer on each side) are returned, and the window is snapped to
page boundaries so `onAcquirePage`/`onDiscardPage` fire per whole page. Pure and side-effect free.
*/
export function computeNSEVirtualWindow(options: NSEVirtualWindowOptions): NSEVirtualWindow {
  const rowHeight = Math.max(1, options.rowHeight);
  const rowCount = Math.max(0, Math.floor(options.rowCount));
  const pageSize = Math.max(1, Math.floor(options.pageSize ?? 10));
  const lookAhead = Math.max(0, Math.floor(options.lookAhead ?? 2));
  const viewportHeight = Math.max(0, options.viewportHeight);
  const genericRange = computeNSEVirtualRange({
    count: rowCount,
    viewportStart: options.scrollTop,
    viewportSize: options.viewportHeight,
    estimateSize: rowHeight,
    overscan: 0
  });
  const totalHeight = genericRange.totalSize;
  const maxScroll = Math.max(0, totalHeight - viewportHeight);
  const scrollTop = clamp(options.scrollTop, 0, maxScroll);
  const pageCount = Math.max(1, Math.ceil(rowCount / pageSize));

  const firstVisibleIndex = viewportHeight === 0
    ? clamp(Math.floor(scrollTop / rowHeight), 0, rowCount)
    : genericRange.visible.start;
  const lastVisibleIndex = viewportHeight === 0
    ? firstVisibleIndex
    : genericRange.visible.start + genericRange.visible.length;

  // Overbuffer is measured in pages, then the window is snapped to page edges.
  const overscanRows = lookAhead * pageSize;
  const startPage = clamp(Math.floor((firstVisibleIndex - overscanRows) / pageSize), 0, pageCount);
  const endPage = clamp(Math.ceil((lastVisibleIndex + overscanRows) / pageSize), 0, pageCount);
  const startIndex = clamp(startPage * pageSize, 0, rowCount);
  const endIndex = clamp(endPage * pageSize, 0, rowCount);

  return {
    startIndex,
    endIndex,
    offsetY: startIndex * rowHeight,
    totalHeight,
    firstVisibleIndex,
    lastVisibleIndex,
    startPage,
    endPage,
    pageCount
  };
}

/** Per-row context handed to `renderRow`. */
export interface NSEVirtualRowState<T> {
  index: number;
  item: T | undefined;
  key: string;
  selected: boolean;
  selection: NSEListSelectionState;
}

/** Imperative handle. */
export interface NSEVirtualListHandle {
  /** Force the visible window to re-render. */
  refresh: () => void;
  /** Scroll a row into view by index. */
  scrollToRow: (index: number, align?: "start" | "center" | "end") => void;
  /** The current rendered window. */
  getWindow: () => NSEVirtualWindow;
  /** The scroll container node. */
  getScrollNode: () => HTMLDivElement | null;
}

export interface NSEVirtualListProps<T = unknown>
  extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "onScroll">,
    NSEListSelectionOptions {
  /** Row data. When omitted, supply `rowCount` and render purely by index. */
  items?: readonly T[];
  /** Total row count (defaults to `items.length`). Required for index-only lists. */
  rowCount?: number;
  /** Fixed pixel height of every row. Required — VirtualList rows are uniform. */
  rowHeight: number;
  /** Rows per page. Default 10. */
  pageSize?: number;
  /** Overbuffer pages beyond the viewport. Default 2. */
  lookAhead?: number;
  /** iOS-style rubber-band overscroll when wheeling/dragging past a boundary. Default true. */
  rubberBand?: boolean;
  /** Rubber-band stiffness coefficient (~0.55; larger = looser pull). */
  rubberBandCoeff?: number;
  /** Stable key for a row (defaults to the row index). */
  getKey?: (item: T | undefined, index: number) => string;
  /** Render a single row. Receives the row's index, data, and selection state. */
  renderRow: (state: NSEVirtualRowState<T>) => ReactNode;
  /** Fired when a page enters the rendered window — use it to lazily load data. */
  onAcquirePage?: (pageIndex: number) => void;
  /** Fired when a page leaves the rendered window. */
  onDiscardPage?: (pageIndex: number) => void;
  /** Fired on scroll with the freshly computed window. */
  onWindowChange?: (window: NSEVirtualWindow) => void;
}

/**
A real virtualised scrolling list: only the rows around the viewport are in the DOM (it replaces the
deprecated page-at-a-time `NSEList`). Rows are a uniform
`rowHeight`; a full-height sizer keeps the native scrollbar accurate while a translated strip holds the
live rows. Its contract is `pageSize`, `lookAhead`, `renderRow`, and
`onAcquirePage`/`onDiscardPage` for lazy data — and integrates `useNSEListSelection`.
*/
export const NSEVirtualList = forwardRef(function NSEVirtualList<T = unknown>(
  {
    items,
    rowCount,
    rowHeight,
    pageSize = 10,
    lookAhead = 2,
    rubberBand = true,
    rubberBandCoeff = 0.55,
    getKey,
    renderRow,
    onAcquirePage,
    onDiscardPage,
    onWindowChange,
    mode = "none",
    selectedKey,
    selectedKeys,
    defaultSelectedKey,
    defaultSelectedKeys,
    allowEmptySelection,
    onSelectionChange,
    className = "",
    style,
    role,
    ...props
  }: NSEVirtualListProps<T>,
  ref: React.Ref<NSEVirtualListHandle>
) {
  const totalRows = Math.max(0, Math.floor(rowCount ?? items?.length ?? 0));
  const scrollRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [, forceRefresh] = useState(0);

  // Shared iOS-style rubber-band overscroll — the sizer is translated to show the bounce.
  useNSERubberBandScroll(scrollRef, sizerRef, { enabled: rubberBand, coeff: rubberBandCoeff });

  const selection = useNSEListSelection({
    mode,
    selectedKey,
    selectedKeys,
    defaultSelectedKey,
    defaultSelectedKeys,
    allowEmptySelection,
    onSelectionChange
  });

  const window = useMemo(
    () => computeNSEVirtualWindow({ rowCount: totalRows, rowHeight, viewportHeight, scrollTop, pageSize, lookAhead }),
    [totalRows, rowHeight, viewportHeight, scrollTop, pageSize, lookAhead]
  );

  // Measure the viewport height and keep it current on resize.
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const measure = () => {
      const height = node.clientHeight;
      setViewportHeight((current) => (current === height ? current : height));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Fire acquire/discard as the set of rendered pages changes.
  const livePagesRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const next = new Set<number>();
    for (let page = window.startPage; page < window.endPage; page++) next.add(page);
    const previous = livePagesRef.current;
    for (const page of next) if (!previous.has(page)) onAcquirePage?.(page);
    for (const page of previous) if (!next.has(page)) onDiscardPage?.(page);
    livePagesRef.current = next;
  }, [window.startPage, window.endPage, onAcquirePage, onDiscardPage]);

  const lastWindowRef = useRef("");
  useEffect(() => {
    const signature = `${window.startIndex}:${window.endIndex}:${window.totalHeight}`;
    if (signature === lastWindowRef.current) return;
    lastWindowRef.current = signature;
    onWindowChange?.(window);
  }, [window, onWindowChange]);

  const scrollToRow = useCallback(
    (index: number, align: "start" | "center" | "end" = "start") => {
      const node = scrollRef.current;
      if (!node) return;
      const target = clamp(index, 0, Math.max(0, totalRows - 1));
      const top = align === "center"
        ? target * rowHeight - (node.clientHeight - rowHeight) / 2
        : align === "end"
          ? target * rowHeight - (node.clientHeight - rowHeight)
          : target * rowHeight;
      node.scrollTop = clamp(top, 0, Math.max(0, totalRows * rowHeight - node.clientHeight));
    },
    [rowHeight, totalRows]
  );

  useImperativeHandle(
    ref,
    () => ({
      refresh: () => forceRefresh((value) => value + 1),
      scrollToRow,
      getWindow: () => window,
      getScrollNode: () => scrollRef.current
    }),
    [scrollToRow, window]
  );

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const next = event.currentTarget.scrollTop;
    setScrollTop((current) => (Math.abs(current - next) < 0.5 ? current : next));
  }

  const rows: ReactNode[] = [];
  for (let index = window.startIndex; index < window.endIndex; index++) {
    const item = items?.[index];
    const key = getKey?.(item, index) ?? String(index);
    rows.push(
      <div
        key={key}
        className="nse-virtual-list-row"
        data-index={index}
        style={{ height: `${rowHeight}px` }}
      >
        {renderRow({ index, item, key, selected: selection.isSelected(key), selection })}
      </div>
    );
  }

  const listRole = role ?? (mode === "none" ? "list" : "listbox");

  return (
    <div
      {...props}
      ref={scrollRef}
      className={classes("nse-virtual-list", className)}
      role={listRole}
      data-selection-mode={mode}
      aria-rowcount={totalRows}
      style={style}
      onScroll={handleScroll}
    >
      <div ref={sizerRef} className="nse-virtual-list-sizer" style={{ height: `${window.totalHeight}px` }}>
        <div
          className="nse-virtual-list-window"
          style={{ transform: `translateY(${window.offsetY}px)` } as CSSProperties}
        >
          {rows}
        </div>
      </div>
    </div>
  );
}) as <T = unknown>(
  props: NSEVirtualListProps<T> & { ref?: React.Ref<NSEVirtualListHandle> }
) => React.ReactElement;
