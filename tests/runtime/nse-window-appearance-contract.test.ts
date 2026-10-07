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

import { describe, expect, it } from "vitest";
import {
  NSE_WINDOW_APPEARANCE_RECIPE_IDS,
  NSE_WINDOW_GEOMETRY,
} from "../../src/NSE/Windows";

describe("NSE window appearance contract", () => {
  it("declares every abstract theme-neutral window recipe in canonical order", () => {
    expect(NSE_WINDOW_APPEARANCE_RECIPE_IDS).toEqual([
      "window.standard.frame",
      "window.standard.head.active",
      "window.standard.head.inactive",
      "window.standard.head.solid",
      "window.standard.head.sheet-solid",
      "window.standard.divider",
      "window.standard.close.normal",
      "window.standard.close.inactive",
      "window.standard.close.highlighted",
      "window.standard.close.unsaved",
      "window.standard.close.unsaved-inactive",
      "window.standard.close.unsaved-highlighted",
      "window.standard.minimise.normal",
      "window.standard.minimise.highlighted",
      "window.standard.zoom.normal",
      "window.standard.zoom.highlighted",
      "window.standard.resize",
      "window.standard.shadow",
      "window.sheet.shadow",
      "window.popover.frame",
      "window.hud.frame",
      "window.hud.close.normal",
      "window.hud.close.highlighted",
    ]);
    expect(Object.isFrozen(NSE_WINDOW_APPEARANCE_RECIPE_IDS)).toBe(true);
    expect(JSON.stringify(NSE_WINDOW_APPEARANCE_RECIPE_IDS)).not.toMatch(/\.(?:png|jpe?g|webp)|Aristo[\\/]/i);
  });

  it("publishes measured CSS-pixel geometry without device-pixel scaling", () => {
    expect(NSE_WINDOW_GEOMETRY).toEqual({
      titleBarHeight: 31,
      controlHitTarget: 44,
      controlPaintSize: 16,
      controlPaintInlineOrigin: 8,
      controlPaintBlockOrigin: 10,
      resizeGlyphSize: 12,
      shadow: {
        sourceInsets: { top: 10, right: 19, bottom: 10, left: 20 },
        distance: 5,
        paintExtents: { top: 5, right: 19, bottom: 20, left: 20 },
      },
    });
    expect(Object.isFrozen(NSE_WINDOW_GEOMETRY)).toBe(true);
  });
});
