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

import { useEffect, useRef, type RefObject } from "react";

/** NSEvent.ModifierFlags a key equivalent requires, beyond the key itself. */
export interface NSEKeyEquivalentModifierMask {
  readonly command?: boolean;
  readonly option?: boolean;
  readonly control?: boolean;
  readonly shift?: boolean;
}

/** The key a key-equivalent string names: "\r" is Return, "\u{1b}" is Escape, anything else a character key. */
function keyNamed(keyEquivalent: string): string {
  if (keyEquivalent === "\r" || keyEquivalent === "\n") return "Enter";
  if (keyEquivalent === "\u{1b}") return "Escape";
  if (keyEquivalent === " ") return " ";
  return keyEquivalent.toLowerCase();
}

/** Elements whose own Return, Space or Escape handling comes before the window's key equivalents. */
const OWNS_KEY = "textarea, select, button, a[href], [contenteditable]:not([contenteditable='false']), [role='button'], [role='menuitem'], [role='option'], [role='tab'], [role='switch'], [role='checkbox'], [role='combobox'], [role='listbox'], [role='menu'], [role='tree'], [role='grid']";

/**
 * NSButton.keyEquivalent: while the button's window has focus, pressing the key (with its modifiers)
 * clicks the button. A key the focused control handles itself (Return in a text view, Space on a
 * button) stays with that control, as NSWindow.performKeyEquivalent asks the key view first.
 */
export function useNSEKeyEquivalent(
  button: RefObject<HTMLButtonElement | null>,
  keyEquivalent: string | undefined,
  modifierMask: NSEKeyEquivalentModifierMask | undefined,
  enabled: boolean,
): void {
  const mask = useRef(modifierMask);
  mask.current = modifierMask;
  useEffect(() => {
    const element = button.current;
    if (!keyEquivalent || !enabled || !element) return;
    const key = keyNamed(keyEquivalent);
    const document = element.ownerDocument;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      if (event.key.toLowerCase() !== key.toLowerCase()) return;
      const wanted = mask.current ?? {};
      if (Boolean(wanted.command) !== event.metaKey) return;
      if (Boolean(wanted.option) !== event.altKey || Boolean(wanted.control) !== event.ctrlKey) return;
      // As in AppKit, an upper-case letter implies Shift; other characters carry their own shift state.
      const letter = keyEquivalent.length === 1 && keyEquivalent.toLowerCase() !== keyEquivalent.toUpperCase();
      const shift = wanted.shift ?? (letter ? keyEquivalent !== keyEquivalent.toLowerCase() : undefined);
      if (shift !== undefined && shift !== event.shiftKey) return;
      if (!element.isConnected || element.disabled || element.closest("[hidden], [inert]")) return;
      const target = event.target instanceof Element ? event.target : null;
      const window = element.closest("[data-window-id]");
      if (window) {
        if (target && target !== document.body && !window.contains(target)) return;
        if ((!target || target === document.body) && window.getAttribute("data-window-key") !== "true") return;
      } else if (target && target !== document.body && !(element.closest("[role='dialog']") ?? document.body).contains(target)) {
        return;
      }
      if (target && target !== element && target.closest(OWNS_KEY)) return;
      // Return in a form's field already submits the form through its submit button.
      if (key === "Enter" && element.type === "submit" && target instanceof HTMLInputElement && target.form && target.form === element.form) return;
      event.preventDefault();
      element.click();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [button, keyEquivalent, enabled]);
}
