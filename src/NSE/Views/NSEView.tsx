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

import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type HTMLAttributes, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { useOptionalNSEOverlayProvider } from "../Overlays";
import { NSEActionResponderContext } from "../Controls/Core/useNSEControlAction";
import { NSEMenuView } from "../Menus/NSEMenuView";
import type { NSEMenu } from "../Menus/NSEMenu";
import { NSEMenuOverlay } from "../Menus/NSEMenuOverlay";
import type { NSEMenuOverlayOptions } from "../Menus/menuTypes";

export interface NSEViewProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * NSView.menu: the contextual menu. It opens on a secondary click, the
   * context-menu key or Shift-F10, and a touch long press.
   */
  readonly menu?: NSEMenu;
  /** NSView.toolTip. */
  readonly toolTip?: string;
  /** Overlay provenance for the menu, when the nearest responder is not its parent. */
  readonly menuOverlay?: NSEMenuOverlayOptions;
  /** How long a touch must rest before the menu opens. */
  readonly longPressDelayMs?: number;
  readonly direction?: "ltr" | "rtl";
}

/** NSView: a region of a window, with the contextual menu and tooltip every view can carry. */
export function NSEView({ menu, toolTip, menuOverlay, longPressDelayMs = 600, direction = "ltr", children, ...htmlAttributes }: NSEViewProps) {
  if (!menu) return <div title={toolTip} {...htmlAttributes}>{children}</div>;
  return (
    <NSEMenuHostView menu={menu} toolTip={toolTip} menuOverlay={menuOverlay} longPressDelayMs={longPressDelayMs} direction={direction} {...htmlAttributes}>
      {children}
    </NSEMenuHostView>
  );
}

function NSEMenuHostView({ menu, toolTip, menuOverlay, longPressDelayMs, direction, children, className, ...htmlAttributes }: NSEViewProps & { readonly menu: NSEMenu }) {
  const [open, setOpen] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const longPressRef = useRef<unknown | null>(null);
  const instanceId = useId();
  const provider = useOptionalNSEOverlayProvider();
  const nearestResponderId = useContext(NSEActionResponderContext);
  const viewId = htmlAttributes.id ?? `nse-view-${menu.identifier}-${instanceId}`;
  if (!provider) throw new Error("An NSEView with a menu needs an NSEOverlayProvider.");
  const parentResponderId = menuOverlay?.parentResponderId ?? nearestResponderId ?? provider.defaultParentResponderId;
  if (!parentResponderId) throw new Error("An NSEView with a menu needs a responder to parent it: render it inside an application's views, or pass menuOverlay.");
  const overlay = useMemo(() => menuOverlay ?? { id: `${viewId}:menu`, parentResponderId }, [menuOverlay, parentResponderId, viewId]);
  const cancelLongPress = useCallback(() => {
    if (longPressRef.current === null) return;
    menu.runtime.scheduler?.clearTimeout(longPressRef.current);
    longPressRef.current = null;
  }, [menu]);
  useEffect(() => cancelLongPress, [cancelLongPress]);
  useEffect(() => {
    const closeForRuntimeAbort = () => {
      cancelLongPress();
      setOpen(false);
    };
    if (menu.runtime.signal.aborted) {
      closeForRuntimeAbort();
      return undefined;
    }
    menu.runtime.signal.addEventListener("abort", closeForRuntimeAbort, { once: true });
    return () => menu.runtime.signal.removeEventListener("abort", closeForRuntimeAbort);
  }, [cancelLongPress, menu]);
  const openMenu = useCallback((event: MouseEvent | KeyboardEvent) => {
    event.preventDefault();
    cancelLongPress();
    setOpen(true);
  }, [cancelLongPress]);
  const beginLongPress = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || !menu.runtime.scheduler) return;
    cancelLongPress();
    longPressRef.current = menu.runtime.scheduler.setTimeout(() => {
      longPressRef.current = null;
      setOpen(true);
    }, Math.max(0, longPressDelayMs ?? 600));
  }, [cancelLongPress, menu, longPressDelayMs]);
  return (
    <div
      {...htmlAttributes}
      id={viewId}
      ref={hostRef}
      title={toolTip}
      className={["nse-context-menu-host", className].filter(Boolean).join(" ")}
      tabIndex={htmlAttributes.tabIndex ?? 0}
      aria-haspopup="menu"
      aria-expanded={open}
      onContextMenu={(event) => { htmlAttributes.onContextMenu?.(event); if (!event.defaultPrevented) openMenu(event); }}
      onPointerDown={(event) => { htmlAttributes.onPointerDown?.(event); beginLongPress(event); }}
      onPointerUp={(event) => { htmlAttributes.onPointerUp?.(event); cancelLongPress(); }}
      onPointerCancel={(event) => { htmlAttributes.onPointerCancel?.(event); cancelLongPress(); }}
      onPointerLeave={(event) => { htmlAttributes.onPointerLeave?.(event); cancelLongPress(); }}
      onKeyDown={(event) => {
        htmlAttributes.onKeyDown?.(event);
        if (event.defaultPrevented || event.nativeEvent.isComposing || event.getModifierState("AltGraph")) return;
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) openMenu(event);
      }}
    >
      {children}
      <NSEMenuOverlay
        overlay={overlay}
        controller={menu}
        open={open}
        anchor={hostRef.current}
        labelledBy={viewId}
        kind="context-menu"
        onOpenChange={(nextOpen) => setOpen(nextOpen)}
      >
        <NSEMenuView model={menu.model} controller={menu} open={open} labelledBy={viewId} onOpenChange={setOpen} direction={direction} />
      </NSEMenuOverlay>
    </div>
  );
}
