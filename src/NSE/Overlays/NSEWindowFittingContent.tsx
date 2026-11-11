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

import { useLayoutEffect, useRef, type ReactNode } from "react";

export type NSEWindowFittingSize = { readonly width: number; readonly height: number };

/**
 * A window-hosted surface that follows its content, as NSPopover follows its
 * view controller's preferredContentSize: the content is laid out at its own
 * preferred width, and the window frame is that plus the window's chrome and
 * content padding. Popovers and file panels share it.
 */
export function NSEWindowFittingContent({ onFittingSize, children }: { readonly onFittingSize: (size: NSEWindowFittingSize) => void; readonly children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    const view = node?.closest<HTMLElement>(".nse-window-view, [data-nse-window-popover]");
    const area = node?.closest<HTMLElement>(".nse-window__content, .nse-overlay-popup-content");
    if (!node || !view || !area) return;
    const measure = () => {
      const style = getComputedStyle(area);
      const paddingInline = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const paddingBlock = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const popover = view.hasAttribute("data-nse-window-popover");
      const width = Math.ceil(node.offsetWidth + paddingInline + (popover ? 0 : view.offsetWidth - area.clientWidth));
      const height = Math.ceil(node.offsetHeight + paddingBlock + (popover ? 0 : view.offsetHeight - area.clientHeight));
      if (!popover || width > 0 && height > 0) onFittingSize({ width, height });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [onFittingSize]);
  return <div ref={ref} data-nse-part="window-fitting-content" style={{ inlineSize: "max-content", maxInlineSize: "calc(100vw - 32px)" }}>{children}</div>;
}

/** A content-sized panel stands centred over the upper third of the screen,
 *  where the eye already is, rather than at a fixed offset. */
export function centredWindowBounds(anchor: HTMLElement | null, width: number, height: number) {
  const view = anchor?.ownerDocument.defaultView ?? (typeof window === "undefined" ? null : window);
  const screenWidth = view?.innerWidth ?? 1280;
  const screenHeight = view?.innerHeight ?? 800;
  return {
    x: Math.max(16, Math.round((screenWidth - width) / 2)),
    y: Math.max(16, Math.round(Math.min(screenHeight * 0.18, (screenHeight - height) / 2))),
    width,
    height,
  };
}
