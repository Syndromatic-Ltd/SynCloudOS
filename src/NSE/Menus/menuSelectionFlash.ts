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

import { setNSEHook } from "../Theme/contract/hookMirrorDOM";

/** How long a chosen row stays unhighlighted, then highlighted again, before its menu acts and fades. */
const flashOffMs = 100;
const flashOnMs = 120;

/**
 * @internal How long a menu fades out after one of its rows is chosen. Its popup keeps the menu mounted
 * this long when the row flashed; a menu dismissed without a choice closes at once.
 */
export const nseMenuChosenFadeMs = 200;

/** @internal Set on a menu's popup surface when a row in it was chosen, so it fades out as it closes. */
export const nseMenuChosenAttribute = "data-nse-menu-chosen";

/**
 * @internal A chosen menu row flashes before the menu acts and fades out, as a Mac menu item does:
 * highlighted, unhighlighted, highlighted again. Desktop only (a fine pointer that hovers); elsewhere,
 * and with no row, there is no flash and it returns null, so the menu acts at once. The row keeps its
 * highlight until the menu closes.
 */
export function nseFlashMenuSelection(row: HTMLElement | null | undefined): Promise<void> | null {
  const view = row?.ownerDocument.defaultView;
  if (!row || !view || typeof view.matchMedia !== "function" || !view.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    return null;
  }
  const popup = row.closest(".nse-overlay-popup");
  if (popup) setNSEHook(popup, "menu-chosen", "");
  return new Promise((resolve) => {
    setNSEHook(row, "menu-flash", "off");
    view.setTimeout(() => {
      setNSEHook(row, "menu-flash", "on");
      view.setTimeout(resolve, flashOnMs);
    }, flashOffMs);
  });
}
