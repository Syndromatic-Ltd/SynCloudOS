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

import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { useNSERubberBandScroll } from "./index";
import { NSEScroller } from "./NSEScroller";
import { NSEScrollViewController, type NSEScrollerPolicy, type NSEScrollInsets } from "./scrollTypes";

export interface NSEScrollViewGeometrySnapshot {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly content: { readonly width: number; readonly height: number };
  readonly position: { readonly left: number; readonly top: number };
  readonly insets: NSEScrollInsets;
}

export interface NSEScrollViewProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  rubberBand?: boolean;
  rubberBandCoeff?: number;
  axis?: "y" | "x" | "both";
  horizontalScrollerPolicy?: NSEScrollerPolicy;
  verticalScrollerPolicy?: NSEScrollerPolicy;
  scrollInsets?: Partial<NSEScrollInsets>;
  onScrollSnapshot?(): void;
  onGeometryChange?(snapshot: NSEScrollViewGeometrySnapshot): void;
  controllerRef?(controller: NSEScrollViewController | null): void;
}

/** Canonical scroll surface with distinct passive observation and rubber-band ownership. */
export function NSEScrollView({
  children,
  rubberBand = true,
  rubberBandCoeff = 0.55,
  axis = "y",
  horizontalScrollerPolicy = "automatic",
  verticalScrollerPolicy = "automatic",
  scrollInsets,
  onScrollSnapshot,
  onGeometryChange,
  controllerRef,
  className = "",
  style,
  onKeyDown,
  tabIndex,
  ...props
}: NSEScrollViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onScrollSnapshot, onGeometryChange });
  const [geometry, setGeometry] = useState<NSEScrollViewGeometrySnapshot>(() => ({ viewport: { width: 0, height: 0 }, content: { width: 0, height: 0 }, position: { left: 0, top: 0 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }));
  callbacks.current = { onScrollSnapshot, onGeometryChange };
  const insets: NSEScrollInsets = {
    top: scrollInsets?.top ?? 0,
    right: scrollInsets?.right ?? 0,
    bottom: scrollInsets?.bottom ?? 0,
    left: scrollInsets?.left ?? 0,
  };
  const insetsRef = useRef(insets);
  insetsRef.current = insets;
  const publishGeometry = () => {
    const host = scrollRef.current;
    if (!host) return;
    const next = {
      viewport: { width: host.clientWidth, height: host.clientHeight },
      content: { width: host.scrollWidth, height: host.scrollHeight },
      position: { left: host.scrollLeft, top: host.scrollTop },
      insets: insetsRef.current,
    };
    setGeometry(next);
    callbacks.current.onGeometryChange?.(next);
  };
  useNSERubberBandScroll(scrollRef, contentRef, { enabled: rubberBand, coeff: rubberBandCoeff, axis });
  useEffect(() => {
    const host = scrollRef.current;
    if (!host) return;
    const controller = new NSEScrollViewController(host, insetsRef.current);
    controllerRef?.(controller);
    const disconnect = controller.connect(() => {
      callbacks.current.onScrollSnapshot?.();
      publishGeometry();
    });
    publishGeometry();
    return () => { disconnect(); controllerRef?.(null); };
  }, []);
  useEffect(() => {
    const host = scrollRef.current;
    const content = contentRef.current;
    if (!host || !content) return;
    const ResizeObserverConstructor = host.ownerDocument.defaultView?.ResizeObserver ?? globalThis.ResizeObserver;
    publishGeometry();
    if (!ResizeObserverConstructor) return;
    const observer = new ResizeObserverConstructor(publishGeometry);
    observer.observe(host);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);
  const overflow = (policy: NSEScrollerPolicy, enabled: boolean): CSSProperties["overflowX"] => !enabled || policy === "hidden" ? "hidden" : policy === "always" ? "scroll" : "auto";
  const hostStyle: CSSProperties = { ...style, overflowX: overflow(horizontalScrollerPolicy, axis !== "y"), overflowY: overflow(verticalScrollerPolicy, axis !== "x") };
  const contentStyle: CSSProperties = { padding: `${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px` };

  const maximumLeft = Math.max(0, geometry.content.width - geometry.viewport.width);
  const maximumTop = Math.max(0, geometry.content.height - geometry.viewport.height);
  return <div className="nse-scroll-view-frame" data-nse-control="scroll-view-frame">
  <div {...props} ref={scrollRef} className={["nse-scroll-view", className].filter(Boolean).join(" ")} data-axis={axis} data-horizontal-scroller-policy={horizontalScrollerPolicy} data-vertical-scroller-policy={verticalScrollerPolicy} style={hostStyle} tabIndex={tabIndex ?? 0} onKeyDown={(event) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const host = event.currentTarget;
    const maximumLeft = Math.max(0, host.scrollWidth - host.clientWidth);
    const maximumTop = Math.max(0, host.scrollHeight - host.clientHeight);
    if (event.key === "Home") { event.preventDefault(); host.scrollTo({ left: 0, top: 0, behavior: "auto" }); }
    else if (event.key === "End") { event.preventDefault(); host.scrollTo({ left: axis === "y" ? host.scrollLeft : maximumLeft, top: axis === "x" ? host.scrollTop : maximumTop, behavior: "auto" }); }
    else if (event.key === "PageDown" || event.key === "PageUp") {
      event.preventDefault(); const direction = event.key === "PageDown" ? 1 : -1;
      const horizontal = axis === "x" || (axis === "both" && event.shiftKey);
      host.scrollTo(horizontal ? { left: Math.max(0, Math.min(maximumLeft, host.scrollLeft + direction * host.clientWidth)), top: host.scrollTop, behavior: "auto" } : { left: host.scrollLeft, top: Math.max(0, Math.min(maximumTop, host.scrollTop + direction * host.clientHeight)), behavior: "auto" });
    }
  }}>
    <div ref={contentRef} className="nse-scroll-view-content" style={contentStyle}>{children}</div>
  </div>
  {axis !== "y" ? <NSEScroller orientation="horizontal" policy={horizontalScrollerPolicy} value={geometry.position.left} maximum={maximumLeft} onValueChange={(left) => scrollRef.current?.scrollTo({ left, top: scrollRef.current.scrollTop, behavior: "auto" })} /> : null}
  {axis !== "x" ? <NSEScroller orientation="vertical" policy={verticalScrollerPolicy} value={geometry.position.top} maximum={maximumTop} onValueChange={(top) => scrollRef.current?.scrollTo({ left: scrollRef.current.scrollLeft, top, behavior: "auto" })} /> : null}
  {axis === "both" && horizontalScrollerPolicy !== "hidden" && verticalScrollerPolicy !== "hidden" ? <span aria-hidden="true" data-nse-part="scroller-corner" /> : null}
  </div>;
}
