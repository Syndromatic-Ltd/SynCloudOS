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
  Fragment,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";
import { NSEListItem } from "../Controls/Selection/NSEListItem";
import { NSEPushButton, type NSEButtonTone } from "../Controls/Buttons/NSEButtons";
import type { HFXFeedbackRequest } from "../Feedback";
import type { NSESmoothSurfaceRequest } from "../SmoothSurface";

type NSEStyleVars = CSSProperties & { [key: `--nse-${string}`]: string | number | undefined };

export type NSEListSelectionMode = "none" | "single" | "multiple";
export type NSESelectionKeys = Iterable<string> | readonly string[] | Set<string>;
export type NSEListSelectionAction = "select" | "toggle" | "clear" | "replace";

export interface NSEListSelectionChange {
  mode: NSEListSelectionMode;
  key: string | null;
  selectedKey: string | null;
  selectedKeys: Set<string>;
  action: NSEListSelectionAction;
}

export interface NSEListSelectionOptions {
  mode?: NSEListSelectionMode;
  selectedKey?: string | null;
  selectedKeys?: NSESelectionKeys;
  defaultSelectedKey?: string | null;
  defaultSelectedKeys?: NSESelectionKeys;
  allowEmptySelection?: boolean;
  onSelectionChange?: (change: NSEListSelectionChange) => void;
}

export interface NSEListSelectionState {
  mode: NSEListSelectionMode;
  selectedKey: string | null;
  selectedKeys: Set<string>;
  selectionCount: number;
  isSelected: (key: string) => boolean;
  select: (key: string) => void;
  toggle: (key: string) => void;
  clear: () => void;
  replace: (keys: NSESelectionKeys) => void;
  getRowSelectionProps: (key: string, disabled?: boolean) => {
    "aria-selected"?: boolean;
    "data-selected": "true" | "false";
    tabIndex?: number;
    onClick: () => void;
  };
}

export interface NSEPageWindowOptions {
  pageIndex?: number;
  defaultPageIndex?: number;
  pageSize?: number;
  overscan?: number;
  onPageChange?: <T>(window: NSEPageWindowSnapshot<T>) => void;
}

export interface NSEPageWindowItem<T> {
  item: T;
  index: number;
}

export interface NSEPageWindowSnapshot<T> {
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  totalCount: number;
  startIndex: number;
  endIndex: number;
  overscanStartIndex: number;
  overscanEndIndex: number;
  windowItems: Array<NSEPageWindowItem<T>>;
}

export interface NSEPageWindowState<T> extends NSEPageWindowSnapshot<T> {
  canPreviousPage: boolean;
  canNextPage: boolean;
  setPageIndex: (pageIndex: number | ((pageIndex: number) => number)) => void;
  previousPage: () => void;
  nextPage: () => void;
  firstPage: () => void;
  lastPage: () => void;
  getWindowProps: () => {
    "data-page-index": number;
    "data-page-size": number;
    "data-page-count": number;
    "data-window-start": number;
    "data-window-end": number;
  };
}

export interface NSEListRenderState<T> {
  key: string;
  item: T;
  index: number;
  selected: boolean;
}

export interface NSEListProps<T = unknown> extends Omit<HTMLAttributes<HTMLDivElement>, "children">, NSEListSelectionOptions {
  items?: readonly T[];
  getKey?: (item: T, index: number) => string;
  renderItem?: (item: T, index: number, state: NSEListRenderState<T>) => ReactNode;
  children?: ReactNode;
  density?: "compact" | "comfortable" | "spacious";
  inset?: boolean;
  dividers?: boolean;
  pageWindow?: false | NSEPageWindowOptions;
}

export interface NSEListRowProps extends Omit<HTMLAttributes<HTMLDivElement>, "onSelect" | "title"> {
  itemKey?: string;
  selected?: boolean;
  disabled?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  title?: ReactNode;
  detail?: ReactNode;
  meta?: ReactNode;
  selectionHaptic?: HFXFeedbackRequest;
  smoothSurface?: NSESmoothSurfaceRequest;
  onSelect?: (key: string) => void;
}

export type NSESwipeSide = "leading" | "trailing";

export interface NSESwipeAction {
  id: string;
  label: ReactNode;
  tone?: NSEButtonTone;
  disabled?: boolean;
  onPress?: () => void;
}

export interface NSESwipeableItemProps extends HTMLAttributes<HTMLDivElement> {
  leadingActions?: NSESwipeAction[];
  trailingActions?: NSESwipeAction[];
  open?: NSESwipeSide | null;
  defaultOpen?: NSESwipeSide | null;
  onOpenChange?: (side: NSESwipeSide | null) => void;
  onSwipe?: (side: NSESwipeSide) => void;
  threshold?: number;
  maxSwipe?: number;
  disabled?: boolean;
}

interface NSEListContextValue {
  selection: NSEListSelectionState;
}

const NSEListContext = createContext<NSEListContextValue | null>(null);

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toKeySet(keys: NSESelectionKeys | string | null | undefined) {
  if (keys == null) return new Set<string>();
  if (typeof keys === "string") return new Set([keys]);
  return new Set(Array.from(keys));
}

function firstKey(keys: Set<string>) {
  return keys.values().next().value ?? null;
}

function normalizeKeysForMode(keys: Set<string>, mode: NSEListSelectionMode) {
  if (mode === "none") return new Set<string>();
  if (mode === "single") {
    const key = firstKey(keys);
    return key ? new Set([key]) : new Set<string>();
  }
  return new Set(keys);
}

function createSelectionChange(
  mode: NSEListSelectionMode,
  keys: Set<string>,
  key: string | null,
  action: NSEListSelectionAction
): NSEListSelectionChange {
  const selectedKeys = normalizeKeysForMode(keys, mode);
  return {
    mode,
    key,
    selectedKey: firstKey(selectedKeys),
    selectedKeys,
    action
  };
}

function createPageWindowSnapshot<T>(
  items: readonly T[],
  pageIndex: number,
  pageSize: number,
  overscan: number
): NSEPageWindowSnapshot<T> {
  const totalCount = items.length;
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(totalCount / safePageSize));
  const safePageIndex = clamp(Math.floor(pageIndex), 0, pageCount - 1);
  const startIndex = Math.min(totalCount, safePageIndex * safePageSize);
  const endIndex = Math.min(totalCount, startIndex + safePageSize);
  const safeOverscan = Math.max(0, Math.floor(overscan));
  const overscanStartIndex = Math.max(0, startIndex - safeOverscan);
  const overscanEndIndex = Math.min(totalCount, endIndex + safeOverscan);

  return {
    pageIndex: safePageIndex,
    pageSize: safePageSize,
    pageCount,
    totalCount,
    startIndex,
    endIndex,
    overscanStartIndex,
    overscanEndIndex,
    windowItems: items.slice(startIndex, endIndex).map((item, offset) => ({
      item,
      index: startIndex + offset
    }))
  };
}

function getDefaultPageSize<T>(items: readonly T[], pageSize?: number) {
  if (pageSize !== undefined && Number.isFinite(pageSize)) return Math.max(1, Math.floor(pageSize));
  return Math.max(1, items.length);
}

export function useNSEListSelection(options: NSEListSelectionOptions = {}): NSEListSelectionState {
  const {
    mode = "single",
    selectedKey,
    selectedKeys,
    defaultSelectedKey,
    defaultSelectedKeys,
    allowEmptySelection = true,
    onSelectionChange
  } = options;
  const initialKeys = useMemo(() => {
    if (defaultSelectedKeys !== undefined) return normalizeKeysForMode(toKeySet(defaultSelectedKeys), mode);
    return normalizeKeysForMode(toKeySet(defaultSelectedKey), mode);
  }, [defaultSelectedKey, defaultSelectedKeys, mode]);
  const [internalKeys, setInternalKeys] = useState(initialKeys);
  const controlledKeys = selectedKeys !== undefined
    ? normalizeKeysForMode(toKeySet(selectedKeys), mode)
    : selectedKey !== undefined
      ? normalizeKeysForMode(toKeySet(selectedKey), mode)
      : null;
  const currentKeys = mode === "none" ? new Set<string>() : controlledKeys ?? internalKeys;

  const commit = useCallback((nextKeys: Set<string>, key: string | null, action: NSEListSelectionAction) => {
    const normalizedKeys = normalizeKeysForMode(nextKeys, mode);
    if (!allowEmptySelection && normalizedKeys.size === 0 && currentKeys.size > 0) return;
    if (controlledKeys === null) setInternalKeys(normalizedKeys);
    onSelectionChange?.(createSelectionChange(mode, normalizedKeys, key, action));
  }, [allowEmptySelection, controlledKeys, currentKeys, mode, onSelectionChange]);

  const select = useCallback((key: string) => {
    if (mode === "none") return;
    if (mode === "multiple") {
      const nextKeys = new Set(currentKeys);
      nextKeys.add(key);
      commit(nextKeys, key, "select");
    } else {
      commit(new Set([key]), key, "select");
    }
  }, [commit, currentKeys, mode]);

  const toggle = useCallback((key: string) => {
    if (mode === "none") return;
    if (mode === "single") {
      const isSelected = currentKeys.has(key);
      commit(isSelected ? new Set<string>() : new Set([key]), key, "toggle");
      return;
    }
    const nextKeys = new Set(currentKeys);
    if (nextKeys.has(key)) {
      nextKeys.delete(key);
    } else {
      nextKeys.add(key);
    }
    commit(nextKeys, key, "toggle");
  }, [commit, currentKeys, mode]);

  const clear = useCallback(() => {
    commit(new Set<string>(), null, "clear");
  }, [commit]);

  const replace = useCallback((keys: NSESelectionKeys) => {
    commit(toKeySet(keys), null, "replace");
  }, [commit]);

  const isSelected = useCallback((key: string) => currentKeys.has(key), [currentKeys]);

  const getRowSelectionProps = useCallback((key: string, disabled = false) => ({
    "aria-selected": mode === "none" ? undefined : currentKeys.has(key),
    "data-selected": currentKeys.has(key) ? "true" as const : "false" as const,
    tabIndex: disabled || mode === "none" ? undefined : 0,
    onClick: () => {
      if (!disabled) {
        if (mode === "multiple") toggle(key);
        else select(key);
      }
    }
  }), [currentKeys, mode, select, toggle]);

  return {
    mode,
    selectedKey: firstKey(currentKeys),
    selectedKeys: new Set(currentKeys),
    selectionCount: currentKeys.size,
    isSelected,
    select,
    toggle,
    clear,
    replace,
    getRowSelectionProps
  };
}

export function useNSEPageWindow<T>(
  items: readonly T[],
  options: NSEPageWindowOptions = {}
): NSEPageWindowState<T> {
  const {
    pageIndex,
    defaultPageIndex = 0,
    pageSize,
    overscan = 0,
    onPageChange
  } = options;
  const safePageSize = getDefaultPageSize(items, pageSize);
  const [internalPageIndex, setInternalPageIndex] = useState(defaultPageIndex);
  const isControlled = pageIndex !== undefined;
  const snapshot = useMemo(
    () => createPageWindowSnapshot(items, isControlled ? pageIndex : internalPageIndex, safePageSize, overscan),
    [internalPageIndex, isControlled, items, overscan, pageIndex, safePageSize]
  );

  const setPageIndex = useCallback((nextPageIndex: number | ((pageIndex: number) => number)) => {
    const rawPageIndex = typeof nextPageIndex === "function" ? nextPageIndex(snapshot.pageIndex) : nextPageIndex;
    const nextSnapshot = createPageWindowSnapshot(items, rawPageIndex, safePageSize, overscan);
    if (!isControlled) setInternalPageIndex(nextSnapshot.pageIndex);
    onPageChange?.(nextSnapshot);
  }, [isControlled, items, onPageChange, overscan, safePageSize, snapshot.pageIndex]);

  const previousPage = useCallback(() => setPageIndex((value) => value - 1), [setPageIndex]);
  const nextPage = useCallback(() => setPageIndex((value) => value + 1), [setPageIndex]);
  const firstPage = useCallback(() => setPageIndex(0), [setPageIndex]);
  const lastPage = useCallback(() => setPageIndex(snapshot.pageCount - 1), [setPageIndex, snapshot.pageCount]);

  return {
    ...snapshot,
    canPreviousPage: snapshot.pageIndex > 0,
    canNextPage: snapshot.pageIndex < snapshot.pageCount - 1,
    setPageIndex,
    previousPage,
    nextPage,
    firstPage,
    lastPage,
    getWindowProps: () => ({
      "data-page-index": snapshot.pageIndex,
      "data-page-size": snapshot.pageSize,
      "data-page-count": snapshot.pageCount,
      "data-window-start": snapshot.startIndex,
      "data-window-end": snapshot.endIndex
    })
  };
}

/**
 * @deprecated For source lists, use `NSEListItem` rows under `NSEDividerDrawer` / `NSERowGroup`
 * (the source-list furniture), with virtualised data via `NSEVirtualList`. This generic
 * data-grid engine's `useNSEListSelection` / `useNSEPageWindow` hooks and
 * `NSESwipeableItem` remain useful plumbing and are retained.
 */
export function NSEList<T = unknown>({
  items,
  getKey,
  renderItem,
  children,
  density = "comfortable",
  inset = false,
  dividers = true,
  pageWindow,
  mode = "none",
  selectedKey,
  selectedKeys,
  defaultSelectedKey,
  defaultSelectedKeys,
  allowEmptySelection,
  onSelectionChange,
  className = "",
  role,
  ...props
}: NSEListProps<T>) {
  const itemList = items ?? [];
  const selection = useNSEListSelection({
    mode,
    selectedKey,
    selectedKeys,
    defaultSelectedKey,
    defaultSelectedKeys,
    allowEmptySelection,
    onSelectionChange
  });
  const windowOptions = pageWindow === false
    ? { pageSize: Math.max(1, itemList.length) }
    : pageWindow ?? { pageSize: Math.max(1, itemList.length) };
  const windowState = useNSEPageWindow(itemList, windowOptions);
  const listRole = role ?? (mode === "none" ? "list" : "listbox");

  return (
    <NSEListContext.Provider value={{ selection }}>
      <div
        {...props}
        {...windowState.getWindowProps()}
        className={classes("nse-list", inset && "is-inset", className)}
        role={listRole}
        data-density={density}
        data-dividers={dividers ? "true" : "false"}
        data-selection-mode={mode}
      >
        {renderItem
          ? windowState.windowItems.map(({ item, index }) => {
              const key = getKey?.(item, index) ?? String(index);
              return (
                <Fragment key={key}>
                  {renderItem(item, index, {
                    key,
                    item,
                    index,
                    selected: selection.isSelected(key)
                  })}
                </Fragment>
              );
            })
          : children}
      </div>
    </NSEListContext.Provider>
  );
}

export function NSEListRow({
  itemKey,
  selected,
  disabled = false,
  leading,
  trailing,
  title,
  detail,
  meta,
  selectionHaptic = "selection",
  smoothSurface = false,
  onSelect,
  className = "",
  role,
  tabIndex,
  onClick,
  onKeyDown,
  children,
  ...props
}: NSEListRowProps) {
  const context = useContext(NSEListContext);
  const canSelect = Boolean(itemKey && context && context.selection.mode !== "none" && !disabled);
  const isSelected = selected ?? (itemKey ? context?.selection.isSelected(itemKey) ?? false : false);
  const rowRole = role ?? (context?.selection.mode === "none" ? "listitem" : "option");
  const rowTabIndex = tabIndex ?? (canSelect ? 0 : undefined);
  const body = children ?? title;

  function activateRow(event: MouseEvent<HTMLDivElement>) {
    onClick?.(event);
    if (!event.defaultPrevented && canSelect && itemKey) {
      if (context?.selection.mode === "multiple") context.selection.toggle(itemKey);
      else context?.selection.select(itemKey);
      onSelect?.(itemKey);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (canSelect && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      event.currentTarget.click();
    }
    onKeyDown?.(event);
  }

  return (
    <NSEListItem
      {...props}
      className={classes("nse-list-row", className)}
      selected={isSelected}
      disabled={disabled}
      leading={leading}
      trailing={trailing}
      meta={meta ?? detail}
      selectionHaptic={selectionHaptic}
      smoothSurface={smoothSurface}
      role={rowRole}
      tabIndex={rowTabIndex}
      data-key={itemKey}
      aria-selected={rowRole === "option" ? isSelected : undefined}
      onClick={activateRow}
      onKeyDown={handleKeyDown}
    >
      {body}
    </NSEListItem>
  );
}

export function NSESwipeableItem({
  leadingActions = [],
  trailingActions = [],
  open,
  defaultOpen = null,
  onOpenChange,
  onSwipe,
  threshold = 48,
  maxSwipe = 96,
  disabled = false,
  className = "",
  style,
  children,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  ...props
}: NSESwipeableItemProps) {
  const pointerState = useRef({ pointerId: -1, startX: 0 });
  const [dragX, setDragX] = useState<number | null>(null);
  const [internalOpen, setInternalOpen] = useState<NSESwipeSide | null>(defaultOpen);
  const openSide = open !== undefined ? open : internalOpen;
  const settledX = openSide === "leading" ? maxSwipe : openSide === "trailing" ? -maxSwipe : 0;
  const translateX = dragX ?? settledX;
  // Only the side the content has moved away from shows its actions: both
  // trays sit under the content, and an unrevealed tray must not show
  // through or take clicks.
  const revealSide = translateX > 0 ? "leading" : translateX < 0 ? "trailing" : "none";
  const itemStyle = {
    "--nse-swipe-x": `${translateX}px`,
    "--nse-swipe-max": `${maxSwipe}px`,
    ...style
  } as NSEStyleVars;

  function commitOpen(side: NSESwipeSide | null) {
    if (open === undefined) setInternalOpen(side);
    onOpenChange?.(side);
  }

  function clampSwipe(delta: number) {
    if (delta > 0 && leadingActions.length === 0) return 0;
    if (delta < 0 && trailingActions.length === 0) return 0;
    return clamp(delta, -maxSwipe, maxSwipe);
  }

  function finishSwipe(delta: number) {
    const clampedDelta = clampSwipe(delta);
    const nextSide = Math.abs(clampedDelta) >= threshold
      ? clampedDelta > 0 ? "leading" : "trailing"
      : null;
    commitOpen(nextSide);
    if (nextSide) onSwipe?.(nextSide);
    setDragX(null);
  }

  function renderActions(side: NSESwipeSide, actions: NSESwipeAction[]) {
    return (
      <div className={`nse-list-swipe-actions nse-list-swipe-actions-${side}`} aria-hidden={actions.length === 0}>
        {actions.map((action) => (
          <NSEPushButton
            key={action.id}
            className="nse-list-swipe-action"
            tone={action.tone ?? (side === "trailing" ? "negative" : "dark")}
            disabled={disabled || action.disabled}
            tabIndex={openSide === side ? 0 : -1}
            onClick={() => {
              action.onPress?.();
              commitOpen(null);
            }}
          >
            {action.label}
          </NSEPushButton>
        ))}
      </div>
    );
  }

  return (
    <div
      {...props}
      className={classes("nse-list-swipeable", disabled && "is-disabled", className)}
      data-open-side={openSide ?? "none"}
      data-reveal-side={revealSide}
      data-dragging={dragX !== null ? "true" : "false"}
      style={itemStyle}
      onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
        onPointerDown?.(event);
        if (event.defaultPrevented || disabled) return;
        pointerState.current = { pointerId: event.pointerId, startX: event.clientX };
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragX(settledX);
      }}
      onPointerMove={(event: ReactPointerEvent<HTMLDivElement>) => {
        onPointerMove?.(event);
        if (pointerState.current.pointerId !== event.pointerId || disabled) return;
        const delta = event.clientX - pointerState.current.startX + settledX;
        setDragX(clampSwipe(delta));
      }}
      onPointerUp={(event: ReactPointerEvent<HTMLDivElement>) => {
        onPointerUp?.(event);
        if (pointerState.current.pointerId !== event.pointerId || disabled) return;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        const delta = event.clientX - pointerState.current.startX + settledX;
        pointerState.current = { pointerId: -1, startX: 0 };
        finishSwipe(delta);
      }}
      onPointerCancel={(event: ReactPointerEvent<HTMLDivElement>) => {
        onPointerCancel?.(event);
        if (pointerState.current.pointerId !== event.pointerId) return;
        pointerState.current = { pointerId: -1, startX: 0 };
        setDragX(null);
      }}
    >
      {renderActions("leading", leadingActions)}
      {renderActions("trailing", trailingActions)}
      <div className="nse-list-swipe-content">
        {children}
      </div>
    </div>
  );
}
