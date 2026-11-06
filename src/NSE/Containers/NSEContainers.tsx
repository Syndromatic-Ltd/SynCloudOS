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
  createElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";
import "../Navigation/SourceList/nse-sourcelist.css";
import { NSEButton } from "../Controls/Buttons/NSEButton";
import {
  getOptionalNSESmoothSurfaceProps,
  type NSESmoothSurfaceRequest,
  type NSESmoothSurfaceStyle
} from "../SmoothSurface";

type NSEStyleVars = CSSProperties & { [key: `--nse-${string}`]: string | number | undefined };
type NSEContainerElement = "div" | "section" | "aside" | "main" | "nav" | "article" | "ul" | "ol";

export type NSEDrawerPlacement = "leading" | "trailing" | "top" | "bottom";
export type ContainerPaneVariant = "plain" | "surface" | "sidebar" | "inspector" | "floating";
export type NSESlidingAxis = "horizontal" | "vertical";
interface NSEDisclosureOptions {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * How a container's body lays out its children: `stack` (the default) is the
 * SDK's leading-aligned content stack at standard spacing; `flow` is plain
 * block flow for fully custom layout (nse-layout-defaults.css).
 */
export type NSEContainerContentLayout = "stack" | "flow";

export interface ContainerPaneProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  as?: NSEContainerElement;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  variant?: ContainerPaneVariant;
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

export interface NSESlidingPaneProps extends Omit<ContainerPaneProps, "as">, NSEDisclosureOptions {
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

export function ContainerPane({
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
}: ContainerPaneProps) {
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
      <ContainerPane
        title={title}
        subtitle={subtitle}
        actions={(
          <>
            {actions}
            <NSEButton appearance="aqua" title={closeLabel} className="nse-container-drawer-close" onClick={() => setOpen(false)} />
          </>
        )}
        footer={footer}
        variant={modal ? "floating" : "surface"}
        smoothSurface={smoothSurface}
        contentLayout={contentLayout}
        style={style}
      >
        {children}
      </ContainerPane>
    </aside>
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
    <ContainerPane
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
    </ContainerPane>
  );
}

/**
A connected, horizontally-sliding group of panes. The selected pane sits at the left; panes before it collapse to tappable peek strips,
panes after it stay visible, and the last pane flexes to fill the remaining space. Selecting a peek
strip (click, keyboard, or horizontal drag) slides the stack so that pane expands. Below
`multiViewMinWidth` the panes stack full-width and slide one at a time. Unlike the single-pane
NSESlidingPane drawer, the panes here stay connected.
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
