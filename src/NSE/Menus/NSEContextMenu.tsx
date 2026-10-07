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

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type PropsWithChildren } from "react";
import { useOptionalNSEOverlayProvider } from "../Overlays";
import { NSEMenu } from "./NSEMenu";
import type { NSEMenuController } from "./NSEMenuController";
import { NSEMenuOverlay } from "./NSEMenuOverlay";
import type { NSEMenuModel, NSEMenuOverlayOptions } from "./menuTypes";

export interface NSEContextMenuProps extends PropsWithChildren {
  readonly model: NSEMenuModel;
  readonly controller: NSEMenuController;
  readonly overlay: NSEMenuOverlayOptions;
  readonly longPressDelayMs?: number;
  readonly direction?: "ltr" | "rtl";
}

/** Keyboard and pointer context-menu semantics; the host selects the overlay shell. */
export function NSEContextMenu({ model, controller, children, overlay, longPressDelayMs = 600, direction = "ltr" }: NSEContextMenuProps) {
  const [open, setOpen] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const longPressRef = useRef<unknown | null>(null);
  const instanceId = useId();
  const provider = useOptionalNSEOverlayProvider();
  const menuId = `nse-context-menu-${model.id}-${instanceId}`;
  if (!provider) throw new Error("NSEContextMenu requires an NSEOverlayProvider.");
  const cancelLongPress = useCallback(() => {
    if (longPressRef.current === null) return;
    controller.runtime.scheduler?.clearTimeout(longPressRef.current);
    longPressRef.current = null;
  }, [controller]);
  useEffect(() => cancelLongPress, [cancelLongPress]);
  useEffect(() => {
    const closeForRuntimeAbort = () => {
      cancelLongPress();
      setOpen(false);
    };
    if (controller.runtime.signal.aborted) {
      closeForRuntimeAbort();
      return undefined;
    }
    controller.runtime.signal.addEventListener("abort", closeForRuntimeAbort, { once: true });
    return () => controller.runtime.signal.removeEventListener("abort", closeForRuntimeAbort);
  }, [cancelLongPress, controller]);
  const openMenu = useCallback((event: MouseEvent | KeyboardEvent) => {
    event.preventDefault();
    cancelLongPress();
    setOpen(true);
  }, [cancelLongPress]);
  const beginLongPress = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || !controller.runtime.scheduler) return;
    cancelLongPress();
    longPressRef.current = controller.runtime.scheduler.setTimeout(() => {
      longPressRef.current = null;
      setOpen(true);
    }, Math.max(0, longPressDelayMs));
  }, [cancelLongPress, controller, longPressDelayMs]);
  const menu = <NSEMenu model={model} controller={controller} open={open} labelledBy={menuId} onOpenChange={setOpen} direction={direction} />;
  return (
    <div
      id={menuId}
      ref={hostRef}
      className="nse-context-menu-host"
      tabIndex={0}
      aria-haspopup="menu"
      aria-expanded={open}
      onContextMenu={openMenu}
      onPointerDown={beginLongPress}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.getModifierState("AltGraph")) return;
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) openMenu(event);
      }}
    >
      {children}
      <NSEMenuOverlay
        overlay={overlay}
        controller={controller}
        open={open}
        anchor={hostRef.current}
        labelledBy={menuId}
        kind="context-menu"
        onOpenChange={(nextOpen) => setOpen(nextOpen)}
      >
        {menu}
      </NSEMenuOverlay>
    </div>
  );
}
