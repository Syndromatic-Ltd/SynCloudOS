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
  createElement,
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import { useNSEThemeProjection } from "../Appearance";
import { NSEFocusScope, resolveNSEFocusReturnTarget } from "../Focus";
import { NSEActionSheet, useOptionalNSEOverlayProvider, type NSEActionSheetProps } from "../Overlays";
import "../Navigation/SourceList/nse-sourcelist.css";
import { NSEDivider } from "../Controls/Selection/NSEDivider";
import { NSEPushButton, type NSEButtonTone } from "../Controls/Buttons/NSEButtons";
import {
  getOptionalNSESmoothSurfaceProps,
  type NSESmoothSurfaceRequest,
  type NSESmoothSurfaceStyle
} from "../SmoothSurface";

type NSEStyleVars = CSSProperties & { [key: `--nse-${string}`]: string | number | undefined };
type NSEContainerElement = "div" | "section" | "aside" | "main" | "nav" | "article" | "ul" | "ol";

export type NSEDrawerPlacement = "leading" | "trailing" | "top" | "bottom";
export type NSEPaneVariant = "plain" | "surface" | "sidebar" | "inspector" | "floating";
export type NSESlidingAxis = "horizontal" | "vertical";
export type NSEDialogVariant = "dialog" | "sheet" | "panel" | "confirm";
export type NSEToastTone = "info" | "success" | "warning" | "critical";
export type NSEToasterPosition =
  | "top-leading"
  | "top-center"
  | "top-trailing"
  | "bottom-leading"
  | "bottom-center"
  | "bottom-trailing";

interface NSEDisclosureOptions {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export interface NSERowGroupProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  as?: NSEContainerElement;
  title?: ReactNode;
  caption?: ReactNode;
  footer?: ReactNode;
  inset?: boolean;
  /** Render the body as a "roundy" framed group with guide-line rails between rows. Default true. */
  rails?: boolean;
  /** Wrap each child in an Item-style row. Enables the
      showRow/hideRow ref handle. Default false so already-row-shaped children aren't double-wrapped. */
  wrapRows?: boolean;
}

/** Imperative handle that shows and hides individual rows (operates on wrapped rows). */
export interface NSERowGroupHandle {
  showRow: (index: number) => void;
  hideRow: (index: number) => void;
  toggleRow: (index: number) => void;
  isRowHidden: (index: number) => boolean;
}

/**
 * How a container's body lays out its children: `stack` (the default) is the
 * SDK's leading-aligned content stack at standard spacing; `flow` is plain
 * block flow for fully custom layout (nse-layout-defaults.css).
 */
export type NSEContainerContentLayout = "stack" | "flow";

export interface NSEPaneProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  as?: NSEContainerElement;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  variant?: NSEPaneVariant;
  smoothSurface?: NSESmoothSurfaceRequest;
  contentLayout?: NSEContainerContentLayout;
}

export interface NSEDrawerProps extends Omit<HTMLAttributes<HTMLElement>, "title">, NSEDisclosureOptions {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  placement?: NSEDrawerPlacement;
  modal?: boolean;
  keepMounted?: boolean;
  closeLabel?: string;
  smoothSurface?: NSESmoothSurfaceRequest;
  contentLayout?: NSEContainerContentLayout;
}

export interface NSEDividerDrawerProps extends Omit<HTMLAttributes<HTMLDivElement>, "title">, NSEDisclosureOptions {
  title: string;
  dividerLabel?: string;
  keepMounted?: boolean;
  contentLayout?: NSEContainerContentLayout;
}

export interface NSESlidingPaneProps extends Omit<NSEPaneProps, "as">, NSEDisclosureOptions {
  placement?: NSEDrawerPlacement;
  size?: number | string;
  peekWidth?: number | string;
  dismissDistance?: number;
  multiView?: boolean;
  multiViewMinWidth?: number;
  selected?: boolean;
  draggable?: boolean;
  keepMounted?: boolean;
}

export interface NSESlidingViewItem {
  key: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export interface NSESlidingViewProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  views: readonly NSESlidingViewItem[];
  activeKey?: string;
  defaultActiveKey?: string;
  onActiveKeyChange?: (key: string) => void;
  axis?: NSESlidingAxis;
  controls?: boolean;
  controlLabel?: string;
}

/** One pane in a connected NSESlidingPanes group. */
export interface NSESlidingPaneView {
  key: string;
  /** Accessible name / peek-strip caption shown when this pane is collapsed behind a later selection. */
  label?: ReactNode;
  content: ReactNode;
  /** Expanded width (px) when not the flexed pane. Default `paneWidth`. */
  width?: number;
  /** Peek-strip width (px) when collapsed. Default `peekWidth`. */
  peekWidth?: number;
  /** Flex to fill the remaining space (the last pane does this by default). */
  flex?: boolean;
  disabled?: boolean;
}

export interface NSESlidingPanesProps extends Omit<HTMLAttributes<HTMLDivElement>, "onSelect"> {
  views: readonly NSESlidingPaneView[];
  selectedKey?: string;
  defaultSelectedKey?: string;
  onSelectedKeyChange?: (key: string) => void;
  /** Default peek-strip width for collapsed panes. Default 64. */
  peekWidth?: number;
  /** Default expanded width for non-flex panes. Default 320. */
  paneWidth?: number;
  /** Below this container width, panes stack full-width and slide one at a time. Default 600. */
  multiViewMinWidth?: number;
  /** Allow dragging horizontally to move between panes. Default true. */
  draggable?: boolean;
}

export interface NSEDialogProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  variant?: NSEDialogVariant;
  role?: "dialog" | "alertdialog";
  modal?: boolean;
  closeLabel?: string;
  onClose?: () => void;
  smoothSurface?: NSESmoothSurfaceRequest;
  contentLayout?: NSEContainerContentLayout;
}

export interface NSEModalDialogProps extends NSEDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  dismissOnOutside?: boolean;
  dismissOnEscape?: boolean;
  portal?: boolean;
  /**
   * Opt into the canonical action-sheet branch. Existing standalone
   * callers retain their compatibility presentation until their runtime host
   * supplies an NSEOverlayProvider.
   */
  interaction?: Pick<NSEActionSheetProps, "id" | "anchor" | "parentResponderId" | "parentId" | "parentScopeId" | "presentation" | "restoreFocus" | "parentWindowControllerId" | "windowBridge">;
}

export interface NSEConfirmPromptProps extends Omit<NSEModalDialogProps, "actions" | "children" | "title" | "variant" | "role" | "open"> {
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  confirmTone?: NSEButtonTone;
  cancelTone?: NSEButtonTone;
  onConfirm: () => void;
  onCancel?: () => void;
  /** Render inline within the page rather than as a scrimmed modal overlay. */
  inline?: boolean;
  /** Whether the modal form is open (ignored when `inline`). */
  open?: boolean;
}

export interface NSEToastAction {
  label: ReactNode;
  tone?: NSEButtonTone;
  onPress: () => void;
}

export interface NSEToast {
  id: string;
  title?: ReactNode;
  message: ReactNode;
  tone?: NSEToastTone;
  action?: NSEToastAction;
  dismissLabel?: string;
}

export interface NSEToasterProps extends HTMLAttributes<HTMLDivElement> {
  toasts: readonly NSEToast[];
  position?: NSEToasterPosition;
  onDismiss?: (id: string) => void;
}

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cssLength(value: number | string | undefined) {
  if (value === undefined) return undefined;
  return typeof value === "number" ? `${value}px` : value;
}

function useDisclosureState({ open, defaultOpen = false, onOpenChange }: NSEDisclosureOptions) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;

  const setOpen = useCallback((nextOpen: boolean | ((open: boolean) => boolean)) => {
    const resolvedOpen = typeof nextOpen === "function" ? nextOpen(isOpen) : nextOpen;
    if (!isControlled) setInternalOpen(resolvedOpen);
    onOpenChange?.(resolvedOpen);
  }, [isControlled, isOpen, onOpenChange]);

  return [isOpen, setOpen] as const;
}

function useControllableKey({
  value,
  defaultValue,
  fallback,
  onChange
}: {
  value?: string;
  defaultValue?: string;
  fallback: string;
  onChange?: (value: string) => void;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? fallback);
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;

  const setValue = useCallback((nextValue: string) => {
    if (!isControlled) setInternalValue(nextValue);
    onChange?.(nextValue);
  }, [isControlled, onChange]);

  return [currentValue, setValue] as const;
}

export const NSERowGroup = forwardRef<NSERowGroupHandle, NSERowGroupProps>(function NSERowGroup({
  as = "section",
  title,
  caption,
  footer,
  inset = false,
  rails = true,
  wrapRows = false,
  className = "",
  children,
  ...props
}, ref) {
  const titleId = useId();
  const labelledBy = props["aria-labelledby"] ?? (title ? titleId : undefined);
  const [hiddenRows, setHiddenRows] = useState<ReadonlySet<number>>(() => new Set());

  useImperativeHandle(
    ref,
    () => ({
      showRow: (index) =>
        setHiddenRows((set) => {
          if (!set.has(index)) return set;
          const next = new Set(set);
          next.delete(index);
          return next;
        }),
      hideRow: (index) =>
        setHiddenRows((set) => {
          if (set.has(index)) return set;
          const next = new Set(set);
          next.add(index);
          return next;
        }),
      toggleRow: (index) =>
        setHiddenRows((set) => {
          const next = new Set(set);
          if (next.has(index)) next.delete(index);
          else next.add(index);
          return next;
        }),
      isRowHidden: (index) => hiddenRows.has(index)
    }),
    [hiddenRows]
  );

  // A row group can wrap each child into an item row; opt-in so already-row-shaped children aren't
  // double-wrapped. The wrapper carries the show/hide state.
  const body = wrapRows
    ? Children.toArray(children).map((child, index) => (
        <div
          key={index}
          className="nse-container-row-group-row"
          role="listitem"
          data-row-index={index}
          hidden={hiddenRows.has(index)}
        >
          {child}
        </div>
      ))
    : children;

  return createElement(
    as,
    {
      ...props,
      className: classes("nse-container-row-group", inset && "is-inset", className),
      "data-rails": rails ? "true" : "false",
      "aria-labelledby": labelledBy
    },
    <>
      {title || caption ? (
        <header className="nse-container-row-group-header">
          {title ? <h3 id={titleId}>{title}</h3> : null}
          {caption ? <p>{caption}</p> : null}
        </header>
      ) : null}
      <div className="nse-container-row-group-body" role={wrapRows ? "list" : undefined}>
        {body}
      </div>
      {footer ? <footer className="nse-container-row-group-footer">{footer}</footer> : null}
    </>
  );
});

export function NSEPane({
  as = "section",
  title,
  subtitle,
  actions,
  footer,
  variant = "surface",
  smoothSurface = false,
  contentLayout = "stack",
  className = "",
  style,
  children,
  ...props
}: NSEPaneProps) {
  const titleId = useId();
  const labelledBy = props["aria-labelledby"] ?? (title ? titleId : undefined);
  const surfaceProps = getOptionalNSESmoothSurfaceProps(
    smoothSurface,
    classes("nse-container-pane", className),
    style as NSESmoothSurfaceStyle | undefined
  );

  return createElement(
    as,
    {
      ...props,
      className: surfaceProps.className,
      "data-variant": variant,
      "aria-labelledby": labelledBy,
      style: surfaceProps.style
    },
    <>
      {title || subtitle || actions ? (
        <header className="nse-container-pane-header">
          <span className="nse-container-pane-copy">
            {title ? <h2 id={titleId}>{title}</h2> : null}
            {subtitle ? <span className="nse-container-pane-subtitle">{subtitle}</span> : null}
          </span>
          {actions ? <span className="nse-container-pane-actions">{actions}</span> : null}
        </header>
      ) : null}
      <div className="nse-container-pane-body" data-nse-content-layout={contentLayout === "stack" ? "stack" : undefined}>{children}</div>
      {footer ? <footer className="nse-container-pane-footer">{footer}</footer> : null}
    </>
  );
}

export function NSEDrawer({
  title,
  subtitle,
  actions,
  footer,
  placement = "trailing",
  modal = false,
  keepMounted = true,
  closeLabel = "Close drawer",
  smoothSurface = false,
  contentLayout,
  open,
  defaultOpen,
  onOpenChange,
  className = "",
  style,
  children,
  ...props
}: NSEDrawerProps) {
  const [isOpen, setOpen] = useDisclosureState({ open, defaultOpen, onOpenChange });
  if (!keepMounted && !isOpen) return null;

  return (
    <aside
      {...props}
      className={classes("nse-container-drawer", className)}
      data-placement={placement}
      data-open={isOpen ? "true" : "false"}
      data-modal={modal ? "true" : "false"}
      aria-hidden={!isOpen || undefined}
      hidden={!isOpen}
    >
      <NSEPane
        title={title}
        subtitle={subtitle}
        actions={(
          <>
            {actions}
            <NSEPushButton className="nse-container-drawer-close" tone="light" onClick={() => setOpen(false)}>
              {closeLabel}
            </NSEPushButton>
          </>
        )}
        footer={footer}
        variant={modal ? "floating" : "surface"}
        smoothSurface={smoothSurface}
        contentLayout={contentLayout}
        style={style}
      >
        {children}
      </NSEPane>
    </aside>
  );
}

export function NSEDividerDrawer({
  title,
  dividerLabel,
  keepMounted = true,
  contentLayout = "stack",
  open,
  defaultOpen,
  onOpenChange,
  className = "",
  children,
  ...props
}: NSEDividerDrawerProps) {
  const [isOpen, setOpen] = useDisclosureState({ open, defaultOpen, onOpenChange });

  // Divider-drawer grammar: caption styled as part of the divider rail, then one continuous line
  // that runs to the edge, passing through the disclosure arrow (label -> line -> arrow -> line-end).
  const header = (
    <div className="nse-container-divider-drawer-header">
      <span className="nse-container-divider-drawer-label">{title}</span>
      <span className="nse-container-divider-drawer-line" aria-hidden="true" />
      <NSEDivider
        variant="arrow"
        className="nse-container-divider-drawer-arrow"
        label={dividerLabel ?? title}
        expanded={isOpen}
        onToggle={() => setOpen((value) => !value)}
      />
      <span className="nse-container-divider-drawer-line nse-container-divider-drawer-line-end" aria-hidden="true" />
    </div>
  );

  return (
    <div {...props} className={classes("nse-container-divider-drawer", className)} data-open={isOpen ? "true" : "false"}>
      {header}
      {keepMounted || isOpen ? (
        // The drawer animates open and closed. A grid-rows 1fr↔0fr transition on the
        // panel (inner content clipped) animates the height without measuring; aria-hidden + the clip
        // keep the collapsed content out of the way.
        <div className="nse-container-divider-drawer-panel" aria-hidden={!isOpen}>
          <div className="nse-container-divider-drawer-panel-inner" data-nse-content-layout={contentLayout === "stack" ? "stack" : undefined}>{children}</div>
        </div>
      ) : null}
    </div>
  );
}

export function NSESlidingPane({
  placement = "trailing",
  size = 320,
  peekWidth = 0,
  dismissDistance = 72,
  multiView = false,
  multiViewMinWidth = 800,
  selected = true,
  draggable = true,
  keepMounted = true,
  open,
  defaultOpen,
  onOpenChange,
  className = "",
  style,
  children,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  ...props
}: NSESlidingPaneProps) {
  const [isOpen, setOpen] = useDisclosureState({ open, defaultOpen, onOpenChange });
  const dragRef = useRef<{ pointerId: number; start: number } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  if (!keepMounted && !isOpen) return null;

  const isVertical = placement === "top" || placement === "bottom";
  const closingDirection = placement === "leading" || placement === "top" ? -1 : 1;
  const paneStyle = {
    "--nse-sliding-pane-size": cssLength(size),
    "--nse-sliding-pane-peek": cssLength(peekWidth),
    "--nse-sliding-pane-drag": `${dragOffset}px`,
    ...style
  } as NSEStyleVars;

  function pointerCoordinate(event: ReactPointerEvent<HTMLElement>) {
    return isVertical ? event.clientY : event.clientX;
  }

  function signedDismissDelta(rawDelta: number) {
    return rawDelta * closingDirection;
  }

  function resetDrag() {
    dragRef.current = null;
    setDragOffset(0);
    setIsDragging(false);
  }

  return (
    <NSEPane
      {...props}
      className={classes("nse-container-sliding-pane", className)}
      data-placement={placement}
      data-open={isOpen ? "true" : "false"}
      data-dragging={isDragging ? "true" : "false"}
      data-multi-view={multiView ? "true" : "false"}
      data-multi-view-min-width={multiViewMinWidth}
      data-selected={selected ? "true" : "false"}
      aria-hidden={!isOpen || undefined}
      style={paneStyle}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        if (event.defaultPrevented || !draggable || !isOpen) return;
        dragRef.current = { pointerId: event.pointerId, start: pointerCoordinate(event) };
        setIsDragging(true);
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        onPointerMove?.(event);
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const rawDelta = pointerCoordinate(event) - drag.start;
        setDragOffset(signedDismissDelta(rawDelta) > 0 ? rawDelta : 0);
      }}
      onPointerUp={(event) => {
        onPointerUp?.(event);
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const rawDelta = pointerCoordinate(event) - drag.start;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        }
        if (signedDismissDelta(rawDelta) >= dismissDistance) setOpen(false);
        resetDrag();
      }}
      onPointerCancel={(event) => {
        onPointerCancel?.(event);
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        resetDrag();
      }}
    >
      {children}
    </NSEPane>
  );
}

export function NSESlidingView({
  views,
  activeKey,
  defaultActiveKey,
  onActiveKeyChange,
  axis = "horizontal",
  controls = false,
  controlLabel = "Views",
  className = "",
  style,
  ...props
}: NSESlidingViewProps) {
  const fallbackKey = views.find((view) => !view.disabled)?.key ?? views[0]?.key ?? "";
  const [currentKey, setCurrentKey] = useControllableKey({
    value: activeKey,
    defaultValue: defaultActiveKey,
    fallback: fallbackKey,
    onChange: onActiveKeyChange
  });
  const activeIndex = Math.max(0, views.findIndex((view) => view.key === currentKey));
  const offset = `-${activeIndex * 100}%`;
  const trackStyle = {
    transform: axis === "horizontal"
      ? `translate3d(${offset}, 0, 0)`
      : `translate3d(0, ${offset}, 0)`
  };

  return (
    <div
      {...props}
      className={classes("nse-container-sliding-view", className)}
      data-axis={axis}
      data-active-key={currentKey}
      style={style}
    >
      {controls ? (
        <div className="nse-container-sliding-view-controls" role="tablist" aria-label={controlLabel}>
          {views.map((view) => (
            <NSEPushButton
              key={view.key}
              role="tab"
              tone="light"
              selected={view.key === currentKey}
              aria-selected={view.key === currentKey}
              disabled={view.disabled}
              onClick={() => setCurrentKey(view.key)}
            >
              {view.label}
            </NSEPushButton>
          ))}
        </div>
      ) : null}
      <div className="nse-container-sliding-view-viewport">
        <div className="nse-container-sliding-view-track" style={trackStyle}>
          {views.map((view) => (
            <section
              key={view.key}
              className="nse-container-sliding-view-panel"
              role="tabpanel"
              aria-hidden={view.key !== currentKey}
              data-active={view.key === currentKey ? "true" : "false"}
            >
              {view.content}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
A connected, horizontally-sliding group of panes. The selected pane sits at the left; panes before it collapse to tappable peek strips,
panes after it stay visible, and the last pane flexes to fill the remaining space. Selecting a peek
strip (click, keyboard, or horizontal drag) slides the stack so that pane expands. Below
`multiViewMinWidth` the panes stack full-width and slide one at a time. Unlike the single-pane
NSESlidingPane drawer / NSESlidingView carousel, the panes here stay connected.
*/
export function NSESlidingPanes({
  views,
  selectedKey,
  defaultSelectedKey,
  onSelectedKeyChange,
  peekWidth = 64,
  paneWidth = 320,
  multiViewMinWidth = 600,
  draggable = true,
  className = "",
  style,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  ...props
}: NSESlidingPanesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const dragRef = useRef<{ pointerId: number; startX: number } | null>(null);
  const [dragDx, setDragDx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const fallbackKey = views.find((view) => !view.disabled)?.key ?? views[0]?.key ?? "";
  const [currentKey, setCurrentKey] = useControllableKey({
    value: selectedKey,
    defaultValue: defaultSelectedKey,
    fallback: fallbackKey,
    onChange: onSelectedKeyChange
  });
  const selectedIndex = Math.max(0, views.findIndex((view) => view.key === currentKey));
  const lastIndex = views.length - 1;

  // Track the container width to switch between the side-by-side and stacked layouts.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const measure = () => setContainerWidth((current) => (current === node.clientWidth ? current : node.clientWidth));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Default to multi-view until measured so the side-by-side layout renders on first paint.
  const multiView = containerWidth === 0 || containerWidth > multiViewMinWidth;

  function selectByOffset(delta: number) {
    const next = views[clamp(selectedIndex + delta, 0, lastIndex)];
    if (next && !next.disabled) setCurrentKey(next.key);
  }

  function endDrag() {
    dragRef.current = null;
    setDragDx(0);
    setIsDragging(false);
  }

  return (
    <div
      {...props}
      ref={containerRef}
      className={classes("nse-container-sliding-panes", className)}
      data-mode={multiView ? "multi" : "single"}
      data-draggable={draggable ? "true" : "false"}
      data-dragging={isDragging ? "true" : "false"}
      style={style}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        if (event.defaultPrevented || !draggable) return;
        dragRef.current = { pointerId: event.pointerId, startX: event.clientX };
        setIsDragging(true);
      }}
      onPointerMove={(event) => {
        onPointerMove?.(event);
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        // Single-view: the track follows the finger 1:1, with rubber-band resistance past the ends
        //. Multi-view resizes panes, so it stays a release-threshold select.
        if (!multiView) {
          const raw = event.clientX - drag.startX;
          const atStart = selectedIndex === 0 && raw > 0;
          const atEnd = selectedIndex === lastIndex && raw < 0;
          const width = containerWidth || 1;
          const damped =
            atStart || atEnd
              ? Math.sign(raw) * width * 0.22 * Math.log10(1 + Math.abs(raw) / width)
              : raw;
          setDragDx(damped);
        }
      }}
      onPointerUp={(event) => {
        onPointerUp?.(event);
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const dx = event.clientX - drag.startX;
        // Single-view settles to the nearest pane (threshold = ~28% of the width or 60px); multi-view
        // selects on the same release threshold it always used.
        const threshold = multiView ? 48 : Math.min(60, (containerWidth || 240) * 0.28);
        if (Math.abs(dx) >= threshold) selectByOffset(dx < 0 ? 1 : -1);
        endDrag();
      }}
      onPointerCancel={(event) => {
        onPointerCancel?.(event);
        const drag = dragRef.current;
        if (drag && drag.pointerId !== event.pointerId) return;
        endDrag();
      }}
    >
      <div
        className="nse-container-sliding-panes-track"
        style={multiView ? undefined : { transform: `translate3d(calc(-${selectedIndex * 100}% + ${dragDx}px), 0, 0)` }}
      >
        {views.map((view, index) => {
          const collapsed = multiView && index < selectedIndex;
          const isLast = index === lastIndex;
          const flexed = (view.flex ?? isLast) && !collapsed;
          const basis = collapsed ? (view.peekWidth ?? peekWidth) : (view.width ?? paneWidth);
          const paneStyle: CSSProperties = multiView
            ? { flex: flexed ? "1 1 0%" : `0 0 ${basis}px` }
            : { flex: "0 0 100%" };
          const isCollapsedButton = collapsed && !view.disabled;
          return (
            <section
              key={view.key}
              className="nse-container-sliding-pane-view"
              data-collapsed={collapsed ? "true" : "false"}
              data-selected={view.key === currentKey ? "true" : "false"}
              aria-hidden={!multiView && view.key !== currentKey ? true : undefined}
              style={paneStyle}
              role={isCollapsedButton ? "button" : undefined}
              tabIndex={isCollapsedButton ? 0 : undefined}
              aria-label={isCollapsedButton && typeof view.label === "string" ? view.label : undefined}
              onClick={isCollapsedButton ? () => setCurrentKey(view.key) : undefined}
              onKeyDown={isCollapsedButton ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setCurrentKey(view.key);
                }
              } : undefined}
            >
              <div className="nse-container-sliding-pane-content">{view.content}</div>
              {collapsed ? (
                <span className="nse-container-sliding-pane-peek" aria-hidden="true">
                  {view.label ? <span className="nse-container-sliding-pane-peek-label">{view.label}</span> : null}
                </span>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function NSEDialog({
  title,
  description,
  actions,
  variant = "dialog",
  role = "dialog",
  modal = false,
  closeLabel = "Close dialog",
  onClose,
  smoothSurface = false,
  contentLayout = "stack",
  className = "",
  style,
  children,
  onKeyDown,
  ...props
}: NSEDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const surfaceProps = getOptionalNSESmoothSurfaceProps(
    smoothSurface,
    classes("nse-container-dialog", className),
    style as NSESmoothSurfaceStyle | undefined
  );

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && onClose) {
      event.preventDefault();
      onClose();
    }
    onKeyDown?.(event);
  }

  return (
    <section
      {...props}
      className={surfaceProps.className}
      data-variant={variant}
      role={role}
      aria-modal={modal || undefined}
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descriptionId : undefined}
      tabIndex={props.tabIndex ?? -1}
      style={surfaceProps.style}
      onKeyDown={handleKeyDown}
    >
      {title || onClose ? (
        <header className="nse-container-dialog-header">
          {title ? <h2 id={titleId}>{title}</h2> : null}
          {onClose ? (
            <button className="nse-container-dialog-close" type="button" aria-label={closeLabel} onClick={onClose}>
              <span aria-hidden="true">x</span>
            </button>
          ) : null}
        </header>
      ) : null}
      {description ? <p id={descriptionId} className="nse-container-dialog-description">{description}</p> : null}
      <div className="nse-container-dialog-body" data-nse-content-layout={contentLayout === "stack" ? "stack" : undefined}>{children}</div>
      {actions ? <footer className="nse-container-dialog-actions">{actions}</footer> : null}
    </section>
  );
}

export function NSEModalDialog({
  open,
  onOpenChange,
  dismissOnOutside = true,
  dismissOnEscape = true,
  portal = true,
  modal = true,
  className = "",
  onClose,
  interaction,
  ...props
}: NSEModalDialogProps) {
  const themeProjection = useNSEThemeProjection();
  const overlayProvider = useOptionalNSEOverlayProvider();
  const focusScopeId = useId();
  const shellRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    onClose?.();
    onOpenChange?.(false);
  }, [onClose, onOpenChange]);

  useEffect(() => {
    if (interaction || !open) return;
    const previousFocus = resolveNSEFocusReturnTarget(document.activeElement);
    shellRef.current?.focus({ preventScroll: true });

    return () => {
      previousFocus?.focus({ preventScroll: true });
    };
  }, [interaction, open]);

  if (interaction) {
    return (
      <NSEActionSheet
        {...interaction}
        open={open}
        dismissOnOutside={dismissOnOutside}
        dismissOnEscape={dismissOnEscape}
        onOpenChange={(_nextOpen, _reason) => close()}
      >
        <NSEDialog {...props} className={className} modal={modal} onClose={close} />
      </NSEActionSheet>
    );
  }

  if (overlayProvider) throw new Error("NSEModalDialog inside an NSEOverlayProvider requires explicit canonical interaction provenance.");

  if (!open) return null;

  const content = (
    <NSEFocusScope options={{ scopeId: `nse-modal-dialog:${focusScopeId}`, kind: "modal", modal, trapFocus: modal, asChild: true }}>
      <div
        className="nse-container-modal-layer nse-container-fade-in"
        {...themeProjection}
        onMouseDown={(event) => {
          if (dismissOnOutside && event.target === event.currentTarget) close();
        }}
      >
        <div
          ref={shellRef}
          className="nse-container-modal-shell nse-container-rise-in"
          tabIndex={-1}
          onKeyDown={(event) => {
            if (dismissOnEscape && event.key === "Escape") {
              event.preventDefault();
              close();
            }
          }}
        >
          <NSEDialog
            {...props}
            className={className}
            modal={modal}
            onClose={close}
          />
        </div>
      </div>
    </NSEFocusScope>
  );

  return portal && typeof document !== "undefined" ? createPortal(content, document.body) : content;
}

export function NSEConfirmPrompt({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmTone = "affirmative",
  cancelTone = "light",
  onConfirm,
  onCancel,
  onOpenChange,
  inline = false,
  open,
  className = "",
  ...props
}: NSEConfirmPromptProps) {
  function cancel() {
    onCancel?.();
    onOpenChange?.(false);
  }

  function confirm() {
    onConfirm();
    onOpenChange?.(false);
  }

  const actions = (
    <>
      <NSEPushButton tone={cancelTone} onClick={cancel}>{cancelLabel}</NSEPushButton>
      <NSEPushButton tone={confirmTone} onClick={confirm}>{confirmLabel}</NSEPushButton>
    </>
  );

  // Inline prompts render without a scrim; the default is a modal overlay.
  if (inline) {
    return (
      <div
        className={classes("nse-container-confirm-inline", className)}
        role="alertdialog"
        aria-label={typeof title === "string" ? title : undefined}
      >
        {title ? <div className="nse-container-confirm-inline-title">{title}</div> : null}
        {message ? <p className="nse-container-confirm-inline-message">{message}</p> : null}
        <div className="nse-container-confirm-inline-actions">{actions}</div>
      </div>
    );
  }

  return (
    <NSEModalDialog
      {...props}
      open={open ?? false}
      className={className}
      title={title}
      description={message}
      role="alertdialog"
      variant="confirm"
      onOpenChange={onOpenChange}
      actions={actions}
    />
  );
}

export function NSEToaster({
  toasts,
  position = "top-trailing",
  onDismiss,
  className = "",
  ...props
}: NSEToasterProps) {
  const hasCriticalToast = useMemo(() => toasts.some((toast) => toast.tone === "critical"), [toasts]);
  // Toasts fly in from the toaster's screen edge.
  const flyInClass = position.startsWith("bottom") ? "nse-container-fly-in-bottom" : "nse-container-fly-in-top";

  return (
    <div
      {...props}
      className={classes("nse-container-toaster", className)}
      data-position={position}
      role={hasCriticalToast ? "alert" : "status"}
      aria-live={hasCriticalToast ? "assertive" : "polite"}
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <article key={toast.id} className={classes("nse-container-toast", flyInClass)} data-tone={toast.tone ?? "info"}>
          <span className="nse-container-toast-copy">
            {toast.title ? <strong>{toast.title}</strong> : null}
            <span>{toast.message}</span>
          </span>
          {toast.action ? (
            <NSEPushButton tone={toast.action.tone ?? "dark"} onClick={toast.action.onPress}>
              {toast.action.label}
            </NSEPushButton>
          ) : null}
          {onDismiss ? (
            <button
              className="nse-container-toast-dismiss"
              type="button"
              aria-label={toast.dismissLabel ?? "Dismiss notification"}
              onClick={() => onDismiss(toast.id)}
            >
              <span aria-hidden="true">x</span>
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
}
