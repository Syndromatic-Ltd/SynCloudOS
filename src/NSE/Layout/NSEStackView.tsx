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
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { NSEStackItem } from "./NSEStackItem";
import { resolveStackLayout } from "./resolveStackLayout";
import type {
  NSEStackItemLayout,
  NSEStackItemProps,
  NSEStackResolvedItem,
  NSEStackViewProps,
} from "./stackViewTypes";

interface StackChild {
  readonly element: ReactElement<NSEStackItemProps>;
  readonly layout: NSEStackItemLayout;
  readonly sourceIndex: number;
  readonly overflowLabel: string;
  readonly onOverflowActivate: (() => void) | undefined;
}

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(" ");
  if (isValidElement(node)) {
    const props = node.props as { readonly children?: ReactNode; readonly "aria-label"?: unknown };
    return typeof props["aria-label"] === "string" ? props["aria-label"] : textContent(props.children);
  }
  return "";
}

function readStackChildren(children: ReactNode): readonly StackChild[] {
  return Children.toArray(children).map((child, index) => {
    if (isValidElement(child) && child.type === NSEStackItem) {
      const element = child as ReactElement<NSEStackItemProps>;
      const props = element.props;
      return {
        element,
        layout: {
          id: props.id,
          minimumSize: props.minimumSize,
          preferredSize: props.preferredSize,
          maximumSize: props.maximumSize,
          weight: props.weight,
          visibilityPriority: props.visibilityPriority,
          detachedWhenHidden: props.detachedWhenHidden,
          gravity: props.gravity,
          spacingAfter: props.spacingAfter,
          hidden: props.hidden,
        },
        sourceIndex: index,
        overflowLabel: props.overflowLabel?.trim() || textContent(props.children).trim() || props.id,
        onOverflowActivate: props.onOverflowActivate,
      };
    }
    const id = isValidElement(child) && child.key != null ? `nse-stack-${String(child.key)}` : `nse-stack-${index}`;
    return {
      element: <NSEStackItem id={id}>{child}</NSEStackItem>,
      layout: { id },
      sourceIndex: index,
      overflowLabel: textContent(child).trim() || id,
      onOverflowActivate: undefined,
    };
  });
}

function formatSize(size: number) {
  return String(Math.round(size * 1_000) / 1_000);
}

function itemStyle(
  result: NSEStackResolvedItem,
  previousEnd: number,
  orientation: "horizontal" | "vertical",
  distribution: NSEStackViewProps["distribution"],
  alignment: NonNullable<NSEStackViewProps["alignment"]>,
  style: CSSProperties | undefined,
): CSSProperties {
  const size = `${formatSize(result.size)}px`;
  const margin = `${formatSize(Math.max(0, result.position - previousEnd))}px`;
  const alignSelf = alignment === "leading" ? "flex-start"
    : alignment === "centre" ? "center"
      : alignment === "trailing" ? "flex-end"
        : alignment === "first-baseline" ? "first baseline"
          : alignment === "last-baseline" ? "last baseline"
            : "stretch";
  if (distribution === "gravity-areas") {
    return orientation === "horizontal"
      ? { ...style, position: "absolute", flex: `0 0 ${size}`, inlineSize: size, insetInlineStart: `${formatSize(result.position)}px`, alignSelf }
      : { ...style, position: "absolute", flex: `0 0 ${size}`, blockSize: size, insetBlockStart: `${formatSize(result.position)}px`, alignSelf };
  }
  return orientation === "horizontal"
    ? { flex: `0 0 ${size}`, inlineSize: size, marginInlineStart: margin, alignSelf, ...style }
    : { flex: `0 0 ${size}`, blockSize: size, marginBlockStart: margin, alignSelf, ...style };
}

function overflowStyle(
  orientation: "horizontal" | "vertical",
  distribution: NSEStackViewProps["distribution"],
  size: number,
  spacing: number,
  position: number | null,
): CSSProperties {
  const value = `${formatSize(size)}px`;
  const margin = `${formatSize(spacing)}px`;
  if (distribution === "gravity-areas" && position !== null) {
    return orientation === "horizontal"
      ? { position: "absolute", flex: `0 0 ${value}`, inlineSize: value, insetInlineStart: `${formatSize(position)}px` }
      : { position: "absolute", flex: `0 0 ${value}`, blockSize: value, insetBlockStart: `${formatSize(position)}px` };
  }
  return orientation === "horizontal"
    ? { flex: `0 0 ${value}`, inlineSize: value, marginInlineStart: margin }
    : { flex: `0 0 ${value}`, blockSize: value, marginBlockStart: margin };
}

function firstFocusable(target: HTMLElement | null | undefined): HTMLElement | null {
  if (!target) return null;
  return target.querySelector<HTMLElement>([
    "button:not([disabled])",
    "[href]",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(","));
}

/**
 * Keeps an item in one React ownership location while its stable DOM host is
 * relocated between the normal stack, retained hidden parking, and overflow
 * presentation. Moving the host preserves component state and effect identity
 * without cloning an authoritative action into a second React parent.
 */
function NSEStackItemPortal({
  element,
  ownerDocument,
  target,
  presentationProps,
  itemId,
  sourceIndex,
}: {
  readonly element: ReactElement<NSEStackItemProps>;
  readonly ownerDocument: Document | null;
  readonly target: HTMLElement | null;
  readonly presentationProps: Partial<NSEStackItemProps>;
  readonly itemId: string;
  readonly sourceIndex: number;
}) {
  const [portalHost, setPortalHost] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!ownerDocument) return undefined;
    const nextHost = ownerDocument.createElement("div");
    nextHost.className = "nse-stack-view-item-host";
    nextHost.dataset.stackItemHost = "true";
    nextHost.dataset.stackSourceIndex = String(sourceIndex);
    setPortalHost(nextHost);
    return () => { nextHost.remove(); };
  }, [ownerDocument]);

  useLayoutEffect(() => {
    if (!portalHost || !target) return;
    portalHost.dataset.stackSourceIndex = String(sourceIndex);
    const following = Array.from(target.children).find((child) => {
      const candidate = child as HTMLElement;
      const index = Number(candidate.dataset.stackSourceIndex ?? candidate.dataset.stackOverflowSourceIndex);
      return Number.isSafeInteger(index) && index > sourceIndex;
    });
    target.insertBefore(portalHost, following ?? null);
  }, [portalHost, sourceIndex, target]);

  const itemKey = `nse-stack-item:${itemId}`;
  return portalHost
    ? createPortal(cloneElement(element, { ...presentationProps, key: itemKey }), portalHost, itemKey)
    : null;
}

const nativeOverflowActionSelector = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
].join(",");

const overflowActionSelector = [
  nativeOverflowActionSelector,
  "[role='button']",
].join(",");

function isAriaDisabled(value: unknown): boolean {
  return value === true || value === "true";
}

function hasDisabledActionAncestor(element: Element): boolean {
  if (element.closest("[disabled]")) return true;
  for (let current: Element | null = element; current; current = current.parentElement) {
    if (isAriaDisabled(current.getAttribute("aria-disabled"))) return true;
  }
  return false;
}

function isEnabledOverflowActionTarget(target: EventTarget | null, overflowMenu: HTMLElement | null): boolean {
  if (!overflowMenu || !target || typeof target !== "object") return false;
  const element = target as Element;
  if (typeof element.closest !== "function" || !overflowMenu.contains(element)) return false;
  const action = element.closest<HTMLElement>("[data-stack-overflow-action]");
  if (!action || hasDisabledActionAncestor(element)) return false;
  if (action.dataset.stackOverflowSelfAction === "true") return true;
  const descendant = element.closest<HTMLElement>(overflowActionSelector);
  return descendant !== null && action.contains(descendant);
}

function isNativeOverflowActionTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as Element;
  return typeof element.closest === "function"
    && element.closest(nativeOverflowActionSelector) !== null;
}

/**
 * Semantic, appearance-neutral stack layout. The host may provide an exact
 * size, or pass a runtime-owned observer/scheduler pair for responsive layout.
 */
export function NSEStackView({
  orientation = "horizontal",
  distribution = "fill",
  alignment = "fill",
  spacing = 0,
  edgeInsets,
  availableSize,
  overflowPolicy = "menu",
  overflowLabel = "More items",
  resizeObserverFactory,
  frameScheduler,
  reducedMotion = false,
  onOverflowChange,
  className = "",
  style,
  children,
  role,
  dir,
  onFocusCapture,
  onClickCapture,
  onKeyDownCapture,
  ...props
}: NSEStackViewProps) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [visibleItemsHost, setVisibleItemsHost] = useState<HTMLDivElement | null>(null);
  const [retainedItemsHost, setRetainedItemsHost] = useState<HTMLDivElement | null>(null);
  const [overflowMenu, setOverflowMenu] = useState<HTMLDivElement | null>(null);
  const [measuredSize, setMeasuredSize] = useState<number | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const frameRef = useRef<{ readonly token: number; handle?: unknown } | null>(null);
  const frameToken = useRef(0);
  const overflowTriggerRef = useRef<HTMLButtonElement | null>(null);
  const focusedItemId = useRef<string | null>(null);
  const hiddenTabIndexes = useRef(new Map<HTMLElement, string | null>());
  const overflowOpenRef = useRef(false);
  const overflowCloseRequest = useRef(0);
  const overflowKeyboardDispatches = useRef(new Set<() => void>());
  const childEntries = useMemo(() => readStackChildren(children), [children]);
  const measuredAvailableSize = availableSize ?? measuredSize ?? Number.POSITIVE_INFINITY;
  const layout = useMemo(() => resolveStackLayout({
    orientation,
    distribution,
    alignment,
    availableSize: measuredAvailableSize,
    spacing,
    edgeInsets,
    direction: dir === "rtl" ? "rtl" : "ltr",
    overflowPolicy,
    items: childEntries.map(({ layout: item }) => item),
  }), [alignment, childEntries, dir, distribution, edgeInsets, measuredAvailableSize, orientation, overflowPolicy, spacing]);
  const resolvedItems = useMemo(() => new Map(layout.items.map((item) => [item.id, item])), [layout.items]);
  const overflowEntries = useMemo(() => childEntries.filter(({ layout: item }) => layout.overflowIds.includes(item.id)), [childEntries, layout.overflowIds]);

  const cancelScheduledMeasure = useCallback(() => {
    const pending = frameRef.current;
    if (!pending) return;
    if (pending.handle !== undefined) frameScheduler?.cancelFrame(pending.handle);
    frameRef.current = null;
  }, [frameScheduler]);

  const measure = useCallback(() => {
    if (!host || availableSize !== undefined) return;
    const rect = host.getBoundingClientRect();
    const nextSize = orientation === "horizontal" ? rect.width : rect.height;
    cancelScheduledMeasure();
    if (!frameScheduler) {
      setMeasuredSize(nextSize);
      return;
    }
    const pending = { token: ++frameToken.current };
    frameRef.current = pending;
    const handle = frameScheduler.requestFrame(() => {
      if (frameRef.current?.token !== pending.token) return;
      frameRef.current = null;
      setMeasuredSize(nextSize);
    });
    if (frameRef.current?.token === pending.token) frameRef.current = { ...pending, handle };
  }, [availableSize, cancelScheduledMeasure, frameScheduler, host, orientation]);

  useEffect(() => {
    if (!host || availableSize !== undefined || !resizeObserverFactory) return undefined;
    const observer = resizeObserverFactory(measure);
    observer?.observe(host);
    measure();
    return () => {
      observer?.disconnect();
      cancelScheduledMeasure();
    };
  }, [availableSize, cancelScheduledMeasure, host, measure, resizeObserverFactory]);

  useEffect(() => () => cancelScheduledMeasure(), [cancelScheduledMeasure]);

  useEffect(() => {
    onOverflowChange?.(layout.overflowIds);
  }, [layout.overflowIds, onOverflowChange]);

  useEffect(() => {
    if (!overflowOpen) return;
    firstFocusable(overflowMenu)?.focus({ preventScroll: true });
  }, [overflowMenu, overflowOpen]);

  useEffect(() => {
    const hiddenIds = new Set(layout.overflowIds);
    for (const [target] of hiddenTabIndexes.current) {
      if (!host?.contains(target)) hiddenTabIndexes.current.delete(target);
    }
    for (const item of host?.querySelectorAll<HTMLElement>("[data-stack-item-id]") ?? []) {
      const renderedInOpenOverflow = overflowOpen && item.closest("[data-stack-overflow-presentation]") !== null;
      const hidden = hiddenIds.has(item.dataset.stackItemId ?? "") && !renderedInOpenOverflow;
      for (const target of item.querySelectorAll<HTMLElement>([
        "button:not([disabled])",
        "[href]",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        "[role='button']:not([aria-disabled='true'])",
        "[tabindex]",
      ].join(","))) {
        if (hidden) {
          if (!hiddenTabIndexes.current.has(target)) hiddenTabIndexes.current.set(target, target.getAttribute("tabindex"));
          target.setAttribute("tabindex", "-1");
        } else if (hiddenTabIndexes.current.has(target)) {
          const prior = hiddenTabIndexes.current.get(target);
          if (prior === undefined) continue;
          if (prior === null) target.removeAttribute("tabindex");
          else target.setAttribute("tabindex", prior);
          hiddenTabIndexes.current.delete(target);
        }
      }
    }
  }, [host, layout.overflowIds, overflowOpen]);

  useEffect(() => () => {
    for (const [target, prior] of hiddenTabIndexes.current) {
      if (prior === null) target.removeAttribute("tabindex");
      else target.setAttribute("tabindex", prior);
    }
    hiddenTabIndexes.current.clear();
  }, []);

  useEffect(() => {
    const focused = focusedItemId.current;
    if (!focused || !layout.overflowIds.includes(focused)) return;
    const target = overflowTriggerRef.current
      ?? childEntries
        .filter(({ layout: item }) => layout.visibleIds.includes(item.id))
        .map(({ layout: item }) => Array.from(host?.querySelectorAll<HTMLElement>("[data-stack-item-id]") ?? [])
          .find((element) => element.dataset.stackItemId === item.id))
        .map(firstFocusable)
        .find((element): element is HTMLElement => element !== null)
      ?? null;
    target?.focus({ preventScroll: true });
  }, [childEntries, host, layout.overflowIds, layout.visibleIds]);

  const isOverflowPresentationOpen = useCallback(() => (
    overflowOpenRef.current && overflowMenu !== null && !overflowMenu.hidden && overflowMenu.getAttribute("aria-hidden") !== "true"
  ), [overflowMenu]);
  const cancelPendingOverflowKeyboardDispatches = useCallback(() => {
    for (const cancel of Array.from(overflowKeyboardDispatches.current)) cancel();
  }, []);
  const closeOverflow = useCallback(() => {
    cancelPendingOverflowKeyboardDispatches();
    if (!isOverflowPresentationOpen()) return;
    overflowOpenRef.current = false;
    setOverflowOpen(false);
    overflowTriggerRef.current?.focus({ preventScroll: true });
  }, [cancelPendingOverflowKeyboardDispatches, isOverflowPresentationOpen]);
  const scheduleOverflowClose = useCallback(() => {
    const request = ++overflowCloseRequest.current;
    void Promise.resolve().then(() => {
      if (overflowCloseRequest.current !== request || !isOverflowPresentationOpen()) return;
      closeOverflow();
    });
  }, [closeOverflow, isOverflowPresentationOpen]);
  useEffect(() => () => {
    overflowCloseRequest.current += 1;
    cancelPendingOverflowKeyboardDispatches();
  }, [cancelPendingOverflowKeyboardDispatches]);
  const rootStyle: CSSProperties = {
    paddingInlineStart: edgeInsets?.inlineStart,
    paddingInlineEnd: edgeInsets?.inlineEnd,
    paddingBlockStart: edgeInsets?.blockStart,
    paddingBlockEnd: edgeInsets?.blockEnd,
    ...style,
  };
  let previousEnd = orientation === "horizontal" ? edgeInsets?.inlineStart ?? 0 : edgeInsets?.blockStart ?? 0;

  return (
    <div
      {...props}
      ref={setHost}
      role={role ?? "group"}
      dir={dir}
      className={["nse-stack-view", className].filter(Boolean).join(" ")}
      data-nse-control="stack-view"
      data-orientation={orientation}
      data-distribution={distribution}
      data-alignment={alignment}
      data-overflow={layout.overflowed ? "true" : "false"}
      data-overflow-open={overflowOpen ? "true" : "false"}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      style={rootStyle}
      onFocusCapture={(event) => {
        const target = event.target as { readonly closest?: <T extends Element>(selectors: string) => T | null } | null;
        const item = target?.closest?.<HTMLElement>("[data-stack-item-id]") ?? null;
        focusedItemId.current = item?.dataset.stackItemId ?? null;
        onFocusCapture?.(event);
      }}
      onClickCapture={(event) => {
        onClickCapture?.(event);
        if (event.isPropagationStopped()) return;
        if (!isOverflowPresentationOpen()) return;
        if (isEnabledOverflowActionTarget(event.target, overflowMenu)) scheduleOverflowClose();
      }}
      onKeyDownCapture={(event) => {
        onKeyDownCapture?.(event);
        if (event.isPropagationStopped()) return;
        if (!isOverflowPresentationOpen()) return;
        if (event.key === "Escape") {
          event.preventDefault();
          closeOverflow();
          return;
        }
        if ((event.key !== "Enter" && event.key !== " ") || !isEnabledOverflowActionTarget(event.target, overflowMenu)) return;
        const nativeEvent = event.nativeEvent;
        const nativeActionTarget = isNativeOverflowActionTarget(event.target);
        const stopPropagation = nativeEvent.stopPropagation;
        let propagationStopped = nativeEvent.cancelBubble;
        const latchedStopPropagation = () => {
          propagationStopped = true;
          stopPropagation.call(nativeEvent);
        };
        nativeEvent.stopPropagation = latchedStopPropagation;
        let task: ReturnType<typeof globalThis.setTimeout> | undefined;
        // Portal-owned bubble handlers complete after capture-phase microtasks in Chromium.
        const cancelPostDispatch = () => {
          if (task !== undefined) globalThis.clearTimeout(task);
          task = undefined;
          if (nativeEvent.stopPropagation === latchedStopPropagation) nativeEvent.stopPropagation = stopPropagation;
          overflowKeyboardDispatches.current.delete(cancelPostDispatch);
        };
        task = globalThis.setTimeout(() => {
          cancelPostDispatch();
          if (nativeEvent.defaultPrevented || (!nativeActionTarget && (propagationStopped || nativeEvent.cancelBubble))) {
            scheduleOverflowClose();
          }
        }, 0);
        overflowKeyboardDispatches.current.add(cancelPostDispatch);
      }}
    >
      <div ref={setVisibleItemsHost} className="nse-stack-view-items" data-stack-items-host="visible" />
      <div ref={setRetainedItemsHost} className="nse-stack-view-retained-items" data-stack-items-host="retained" hidden />
      {childEntries.map((entry) => {
        const result = resolvedItems.get(entry.layout.id)!;
        const element = entry.element;
        const itemProps = element.props;
        const menuOverflowed = result.hidden && overflowPolicy === "menu";
        const retainedForExplicitBridge = menuOverflowed && entry.onOverflowActivate !== undefined;
        const directItemAction = typeof itemProps.onClick === "function"
          || typeof itemProps.onKeyDown === "function"
          || itemProps.role === "button";
        const itemStyleValue = itemStyle(result, previousEnd, orientation, distribution, alignment, itemProps.style);
        if (!menuOverflowed) previousEnd = Math.max(previousEnd, result.position + result.size);
        const target = retainedForExplicitBridge
          ? retainedItemsHost
          : menuOverflowed
            ? overflowMenu
            : visibleItemsHost;
        return (
          <NSEStackItemPortal
            key={entry.layout.id}
            element={element}
            ownerDocument={host?.ownerDocument ?? null}
            target={target}
            itemId={entry.layout.id}
            sourceIndex={entry.sourceIndex}
            presentationProps={{
              className: [itemProps.className, menuOverflowed && !retainedForExplicitBridge ? "nse-stack-view-overflow-action" : ""].filter(Boolean).join(" "),
              style: menuOverflowed ? itemProps.style : result.hidden ? { ...itemStyleValue, display: "none" } : itemStyleValue,
              "data-stack-size": formatSize(result.size),
              "data-stack-position": formatSize(result.position),
              "data-stack-hidden": result.hidden ? "true" : "false",
              "data-stack-overflow-action": menuOverflowed && !retainedForExplicitBridge ? "true" : undefined,
              "data-stack-overflow-self-action": menuOverflowed && !retainedForExplicitBridge && directItemAction ? "true" : undefined,
              "aria-hidden": retainedForExplicitBridge || (result.hidden && !menuOverflowed) ? true : undefined,
              tabIndex: retainedForExplicitBridge || (result.hidden && !menuOverflowed) ? -1 : itemProps.tabIndex,
            } as Partial<NSEStackItemProps>}
          />
        );
      })}
      {overflowPolicy === "menu" && overflowEntries.length > 0 ? (
        <span
          className="nse-stack-view-overflow"
          data-stack-overflow-size={formatSize(layout.overflowTriggerSize)}
          style={overflowStyle(orientation, distribution, layout.overflowTriggerSize, layout.overflowTriggerSpacing, layout.overflowTriggerPosition)}
        >
          <button
            ref={overflowTriggerRef}
            type="button"
            className="nse-stack-view-overflow-trigger"
            aria-label={overflowLabel}
            aria-haspopup="dialog"
            aria-expanded={overflowOpen}
            data-stack-overflow-trigger="true"
            onClick={() => {
              cancelPendingOverflowKeyboardDispatches();
              const next = !overflowOpenRef.current;
              overflowCloseRequest.current += 1;
              overflowOpenRef.current = next;
              setOverflowOpen(next);
            }}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown") return;
              event.preventDefault();
              cancelPendingOverflowKeyboardDispatches();
              overflowCloseRequest.current += 1;
              overflowOpenRef.current = true;
              setOverflowOpen(true);
            }}
          >
            <span aria-hidden="true">…</span>
          </button>
          <div
            ref={setOverflowMenu}
            role="dialog"
            aria-label={`${overflowLabel} overflow`}
            aria-hidden={!overflowOpen}
            hidden={!overflowOpen}
            className="nse-stack-view-overflow-menu"
            data-stack-overflow-presentation="true"
          >
            {overflowEntries.map((entry) => {
              if (entry.onOverflowActivate) {
                const itemAriaDisabled = isAriaDisabled(entry.element.props["aria-disabled"]);
                return (
                  <button
                    key={entry.layout.id}
                    type="button"
                    disabled={itemAriaDisabled}
                    aria-disabled={itemAriaDisabled ? true : undefined}
                    className="nse-stack-view-overflow-item"
                    data-stack-overflow-action="true"
                    data-stack-overflow-source-index={entry.sourceIndex}
                    onClick={() => entry.onOverflowActivate?.()}
                  >
                    {entry.overflowLabel}
                  </button>
                );
              }
              return null;
            })}
          </div>
        </span>
      ) : null}
    </div>
  );
}
