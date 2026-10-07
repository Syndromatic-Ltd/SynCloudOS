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

import { Children, Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useNSERubberBandScroll } from "../Scroll";
import { NSEPopup, useNSEPopupOpenState, type NSEPopupPresentation } from "./NSEPopup";
import { useNSEOverlayProvider } from "./NSEOverlayProvider";
import type { NSEOverlayDismissReason } from "./overlayTypes";

export interface NSEListboxOption<T = unknown> {
  readonly id: string;
  readonly label: ReactNode;
  readonly value?: T;
  readonly disabled?: boolean;
  /** A rule above this row, starting a new group (as NSMenuItem.separator does). */
  readonly separatorBefore?: boolean;
  /** "action" rows run a command rather than choose a value, like a pop-up
   * button's "Show Fonts…" item; they are never shown as selected. */
  readonly kind?: "option" | "action";
}

export interface NSEListboxPopupProps<T = unknown> {
  readonly id?: string;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly anchor?: HTMLElement | null;
  readonly parentResponderId?: string;
  readonly parentId?: string | null;
  readonly parentScopeId?: string;
  readonly options: readonly NSEListboxOption<T>[];
  readonly selectedId?: string | null;
  readonly labelledBy?: string;
  readonly describedBy?: string;
  readonly presentation?: NSEPopupPresentation;
  readonly direction?: "ltr" | "rtl";
  readonly popupAlign?: "left" | "right";
  /** "small" rows, for the menu of a small picker. */
  readonly controlSize?: "regular" | "small";
  readonly virtualize?: boolean;
  readonly overscan?: number;
  onOpenChange?(open: boolean, reason: NSEOverlayDismissReason): void;
  onSelect?(option: NSEListboxOption<T>): void;
}

interface ListboxWindow {
  readonly start: number;
  readonly end: number;
}

/**
 * Brings a row into view within the listbox's own scroller. Element
 * scrollIntoView() would also scroll every scrollable ancestor, the document
 * included, so opening a list could move the page underneath it.
 */
function revealWithin(scroll: HTMLElement | null, row: HTMLElement): void {
  if (!scroll) return;
  const viewport = scroll.getBoundingClientRect();
  const rect = row.getBoundingClientRect();
  if (rect.top < viewport.top) scroll.scrollTop -= viewport.top - rect.top;
  else if (rect.bottom > viewport.bottom) scroll.scrollTop += rect.bottom - viewport.bottom;
}

function textFromNode(node: ReactNode): string {
  return Children.toArray(node).reduce<string>((text, child) => {
    if (typeof child === "string" || typeof child === "number") return `${text}${child}`;
    return text;
  }, "");
}

function nextEnabledIndex(options: readonly NSEListboxOption[], start: number, delta: number): number {
  if (options.length === 0) return -1;
  let index = start;
  for (let count = 0; count < options.length; count += 1) {
    index = (index + delta + options.length) % options.length;
    if (!options[index]?.disabled) return index;
  }
  return -1;
}

function firstEnabledIndex(options: readonly NSEListboxOption[]): number {
  return options.findIndex((option) => !option.disabled);
}

function useResolvedListboxPresentation(presentation: NSEPopupPresentation | undefined): NSEPopupPresentation {
  const { runtime } = useNSEOverlayProvider();
  const traits = useSyncExternalStore(
    (listener) => runtime.environment.presentation.subscribe(listener),
    () => runtime.environment.presentation.getSnapshot(),
    () => runtime.environment.presentation.getSnapshot(),
  );
  return useMemo(() => {
    if (presentation && presentation.mode !== "automatic") return presentation;
    const compact = traits.horizontalSizeClass === "compact" ||
      traits.contentBounds.height - traits.virtualKeyboardInset < 480;
    return {
      mode: compact ? "sheet" as const : "anchored" as const,
      placement: presentation?.placement,
      collisionPadding: presentation?.collisionPadding,
    };
  }, [presentation, traits]);
}

/** DOM-only listbox presentations stay in the overlay stack, not physical windows. */
export function NSEListboxPopup<T = unknown>({
  id,
  open,
  defaultOpen,
  anchor,
  parentResponderId,
  parentId,
  parentScopeId,
  options,
  selectedId,
  labelledBy,
  describedBy,
  presentation,
  direction = "ltr",
  popupAlign = "left",
  controlSize = "regular",
  virtualize = true,
  overscan = 4,
  onOpenChange,
  onSelect,
}: NSEListboxPopupProps<T>) {
  const provider = useNSEOverlayProvider();
  const generatedId = useId().replace(/:/g, "");
  const resolvedId = id ?? `nse-listbox:${generatedId}`;
  const resolvedParentResponderId = parentResponderId ?? provider.defaultParentResponderId;
  if (!resolvedParentResponderId) {
    throw new Error("NSEListboxPopup requires parentResponderId or an NSEStandaloneControlHost.");
  }
  const state = useNSEPopupOpenState({ open, defaultOpen, onOpenChange });
  const resolvedPresentation = useResolvedListboxPresentation(presentation);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocusId = useRef<string | null>(null);
  const typeaheadRef = useRef<{ prefix: string; handle: unknown | null }>({ prefix: "", handle: null });
  const [activeIndex, setActiveIndex] = useState(() => {
    const selectedIndex = selectedId ? options.findIndex((option) => option.id === selectedId && !option.disabled) : -1;
    return selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(options);
  });
  const [scrollTop, setScrollTop] = useState(0);
  const [fadeTop, setFadeTop] = useState(false);
  const [fadeBottom, setFadeBottom] = useState(false);
  const rowHeight = controlSize === "small" ? 26 : 42;
  const shouldVirtualize = virtualize && options.length > 100;
  const separatorHeight = 9;
  const separatorCount = shouldVirtualize ? 0 : options.filter((option, index) => index > 0 && option.separatorBefore).length;
  const viewportHeight = Math.min(360, Math.max(rowHeight, options.length * rowHeight + separatorCount * separatorHeight));
  const virtualWindow = useMemo<ListboxWindow>(() => {
    if (!shouldVirtualize) return { start: 0, end: options.length };
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - Math.max(0, overscan));
    const end = Math.min(options.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + Math.max(0, overscan));
    return { start, end };
  }, [options.length, overscan, rowHeight, scrollTop, shouldVirtualize, viewportHeight]);

  const updateScrollState = useCallback(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    setScrollTop(scroll.scrollTop);
    setFadeTop(scroll.scrollTop > 1);
    setFadeBottom(scroll.scrollTop + scroll.clientHeight < scroll.scrollHeight - 1);
  }, []);

  useNSERubberBandScroll(scrollRef, contentRef, { enabled: true, axis: "y" });

  useEffect(() => {
    const clearPendingInput = () => {
      if (typeaheadRef.current.handle !== null) provider.runtime.environment.clearTimeout(typeaheadRef.current.handle);
      typeaheadRef.current = { prefix: "", handle: null };
      pendingFocusId.current = null;
    };
    if (!state.open) clearPendingInput();
    return clearPendingInput;
  }, [provider.runtime, state.open]);

  const focusIndex = useCallback((index: number) => {
    if (index < 0 || index >= options.length || options[index]?.disabled) return;
    setActiveIndex(index);
    const optionId = options[index]!.id;
    pendingFocusId.current = optionId;
    const element = optionRefs.current.get(optionId);
    if (element) {
      pendingFocusId.current = null;
      element.focus({ preventScroll: true });
      revealWithin(scrollRef.current, element);
      updateScrollState();
      return;
    }
    const scroll = scrollRef.current;
    if (scroll && shouldVirtualize) {
      scroll.scrollTop = index * rowHeight;
      updateScrollState();
    }
  }, [options, rowHeight, shouldVirtualize, updateScrollState]);

  useLayoutEffect(() => {
    if (!state.open || pendingFocusId.current === null) return;
    const element = optionRefs.current.get(pendingFocusId.current);
    if (!element) return;
    pendingFocusId.current = null;
    element.focus({ preventScroll: true });
    revealWithin(scrollRef.current, element);
    updateScrollState();
  }, [state.open, virtualWindow, updateScrollState]);

  useEffect(() => {
    if (!state.open) return;
    const selectedIndex = selectedId ? options.findIndex((option) => option.id === selectedId && !option.disabled) : -1;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(options));
    const handle = provider.runtime.environment.setTimeout(() => {
      const index = selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(options);
      if (index >= 0) {
        focusIndex(index);
      } else {
        listboxRef.current?.focus({ preventScroll: true });
      }
      updateScrollState();
    }, 0);
    return () => provider.runtime.environment.clearTimeout(handle);
  }, [focusIndex, options, provider.runtime, selectedId, state.open, updateScrollState]);

  const select = useCallback((option: NSEListboxOption<T>) => {
    if (option.disabled) return;
    onSelect?.(option);
    state.requestOpen(false, "selection");
  }, [onSelect, state]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      focusIndex(nextEnabledIndex(options, activeIndex < 0 ? 0 : activeIndex, delta));
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const target = event.key === "Home" ? firstEnabledIndex(options) : nextEnabledIndex(options, 0, -1);
      focusIndex(target);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) select(option);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      state.requestOpen(false, "escape");
      return;
    }
    if (event.key === "Tab") {
      state.requestOpen(false, "focus-left");
      return;
    }
    if (event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) return;
    const prefix = `${typeaheadRef.current.prefix}${event.key.toLocaleLowerCase()}`;
    const match = options.findIndex((option) => !option.disabled && textFromNode(option.label).toLocaleLowerCase().startsWith(prefix));
    const fallback = options.findIndex((option) => !option.disabled && textFromNode(option.label).toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
    const target = match >= 0 ? match : fallback;
    if (target < 0) return;
    event.preventDefault();
    focusIndex(target);
    typeaheadRef.current.prefix = match >= 0 ? prefix : event.key.toLocaleLowerCase();
    if (typeaheadRef.current.handle !== null) provider.runtime.environment.clearTimeout(typeaheadRef.current.handle);
    typeaheadRef.current.handle = provider.runtime.environment.setTimeout(() => {
      typeaheadRef.current = { prefix: "", handle: null };
    }, 500);
  }, [activeIndex, focusIndex, options, provider.runtime, select, state]);

  const optionRows = options.slice(virtualWindow.start, virtualWindow.end).map((option, visibleIndex) => {
    const index = virtualWindow.start + visibleIndex;
    const optionStyle: CSSProperties | undefined = shouldVirtualize ? {
      position: "absolute",
      insetInline: 0,
      insetBlockStart: `${index * rowHeight}px`,
      minBlockSize: `${rowHeight}px`,
    } : undefined;
    const row = (
      <button
        key={option.id}
        ref={(element) => {
          if (element) optionRefs.current.set(option.id, element);
          else optionRefs.current.delete(option.id);
        }}
        id={`${resolvedId}-option-${option.id}`}
        className="nse-overlay-listbox-option"
        type="button"
        role="option"
        aria-selected={option.kind !== "action" && option.id === selectedId}
        data-kind={option.kind === "action" ? "action" : undefined}
        aria-posinset={index + 1}
        aria-setsize={options.length}
        aria-disabled={option.disabled || undefined}
        disabled={option.disabled}
        tabIndex={index === activeIndex ? 0 : -1}
        style={optionStyle}
        onFocus={() => setActiveIndex(index)}
        onMouseEnter={() => !option.disabled && setActiveIndex(index)}
        onClick={() => select(option)}
      >
        {option.label}
      </button>
    );
    return option.separatorBefore && index > 0 && !shouldVirtualize
      ? <Fragment key={option.id}><div className="nse-overlay-listbox-separator" role="separator" />{row}</Fragment>
      : row;
  });

  const contentStyle: CSSProperties | undefined = shouldVirtualize ? { position: "relative", minBlockSize: `${options.length * rowHeight}px` } : undefined;
  return (
    <NSEPopup
      id={resolvedId}
      open={state.open}
      anchor={anchor}
      parentResponderId={resolvedParentResponderId}
      parentId={parentId}
      parentScopeId={parentScopeId}
      labelledBy={labelledBy}
      describedBy={describedBy}
      overlayKind={resolvedPresentation.mode === "sheet" ? "action-sheet" : "listbox"}
      modal={resolvedPresentation.mode === "sheet"}
      presentation={resolvedPresentation}
      dir={direction}
      role="presentation"
      onOpenChange={state.requestOpen}
    >
      <div
        ref={listboxRef}
        id={`${resolvedId}-listbox`}
        className="nse-overlay-listbox"
        role="listbox"
        tabIndex={0}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-activedescendant={activeIndex >= 0 && activeIndex < options.length ? `${resolvedId}-option-${options[activeIndex]!.id}` : undefined}
        data-nse-overlay-kind={resolvedPresentation.mode === "sheet" ? undefined : "listbox"}
        data-popup-align={popupAlign}
        data-size={controlSize === "small" ? "small" : undefined}
        data-fade-top={fadeTop ? "true" : "false"}
        data-fade-bottom={fadeBottom ? "true" : "false"}
        onKeyDown={handleKeyDown}
      >
        <div ref={scrollRef} className="nse-overlay-listbox-scroll" onScroll={updateScrollState}>
          <div ref={contentRef} className="nse-overlay-listbox-scroll-content" style={contentStyle}>
            {optionRows}
          </div>
        </div>
      </div>
    </NSEPopup>
  );
}
