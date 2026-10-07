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

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useOptionalNSEOverlayProvider } from "../Overlays";
import { NSEMenu } from "./NSEMenu";
import type { NSEMenuController } from "./NSEMenuController";
import { NSEMenuOverlay } from "./NSEMenuOverlay";
import type { NSEMenuModel, NSEMenuOverlayOptions } from "./menuTypes";

export interface NSEMenuBarItem {
  readonly model: NSEMenuModel;
  readonly controller: NSEMenuController;
}

export interface NSEMenuBarOverlayOptions extends Omit<NSEMenuOverlayOptions, "id"> {
  /** The owner supplies stable branch IDs; menu bars never derive global IDs. */
  idForItem(item: NSEMenuBarItem, index: number): string;
}

export interface NSEMenuBarProps {
  readonly items: readonly NSEMenuBarItem[];
  readonly overlay: NSEMenuBarOverlayOptions;
  readonly direction?: "ltr" | "rtl";
}

/**
 * One active presentation at a time, projected from independent command
 * controllers. It is deliberately not a command, responder, or focus owner.
 */
export function NSEMenuBar({ items, overlay, direction = "ltr" }: NSEMenuBarProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [initialFocus, setInitialFocus] = useState<"first" | "last">("first");
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const instanceId = useId();
  const provider = useOptionalNSEOverlayProvider();
  if (!provider) throw new Error("NSEMenuBar requires an NSEOverlayProvider.");
  const focus = (index: number) => buttonRefs.current[index]?.focus({ preventScroll: true });
  const move = (current: number, delta: 1 | -1) => {
    if (items.length === 0) return;
    const index = (current + delta + items.length) % items.length;
    setOpenIndex(openIndex === null ? null : index);
    focus(index);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.getModifierState("AltGraph")) return;
    const nextKey = direction === "rtl" ? "ArrowLeft" : "ArrowRight";
    const previousKey = direction === "rtl" ? "ArrowRight" : "ArrowLeft";
    if (event.key === nextKey) {
      event.preventDefault();
      move(index, 1);
    } else if (event.key === previousKey) {
      event.preventDefault();
      move(index, -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setOpenIndex(openIndex === null ? null : 0);
      focus(0);
    } else if (event.key === "End") {
      event.preventDefault();
      const last = Math.max(0, items.length - 1);
      setOpenIndex(openIndex === null ? null : last);
      focus(last);
    } else if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setInitialFocus("first");
      setOpenIndex(index);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setInitialFocus("last");
      setOpenIndex(index);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpenIndex(null);
    }
  };

  return (
    <div className="nse-menu-bar" role="menubar" dir={direction}>
      {items.map((item, index) => {
        const { model, controller } = item;
        const open = openIndex === index;
        const triggerId = `nse-menu-bar-${instanceId}-${index}`;
        const menu = <NSEMenu model={model} controller={controller} open={open} labelledBy={triggerId} onOpenChange={() => setOpenIndex(null)} direction={direction} initialFocus={initialFocus} />;
        const overlayOptions = { ...overlay, id: overlay.idForItem(item, index) };
        return (
          <span key={`${model.id}:${index}`} className="nse-menu-bar-item" onPointerEnter={() => {
            if (openIndex !== null) setOpenIndex(index);
          }}>
            <button
              id={triggerId}
              ref={(element) => { buttonRefs.current[index] = element; }}
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={open}
              data-active={open ? "true" : "false"}
              onClick={() => {
                setInitialFocus("first");
                setOpenIndex(open ? null : index);
              }}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {model.label}
            </button>
            <NSEMenuOverlay
              overlay={overlayOptions}
              controller={controller}
              open={open}
              anchor={buttonRefs.current[index]}
              labelledBy={triggerId}
              onOpenChange={(nextOpen) => setOpenIndex(nextOpen ? index : null)}
            >
              {menu}
            </NSEMenuOverlay>
          </span>
        );
      })}
    </div>
  );
}
