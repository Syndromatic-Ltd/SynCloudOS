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

export const NSE_WINDOW_APPEARANCE_RECIPE_IDS = Object.freeze([
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
] as const);

export type NSEWindowAppearanceRecipeId = (typeof NSE_WINDOW_APPEARANCE_RECIPE_IDS)[number];

export const NSE_WINDOW_GEOMETRY = Object.freeze({
  titleBarHeight: 31,
  controlHitTarget: 44,
  controlPaintSize: 16,
  controlPaintInlineOrigin: 8,
  controlPaintBlockOrigin: 10,
  resizeGlyphSize: 12,
  shadow: Object.freeze({
    sourceInsets: Object.freeze({ top: 10, right: 19, bottom: 10, left: 20 }),
    distance: 5,
    paintExtents: Object.freeze({ top: 5, right: 19, bottom: 20, left: 20 }),
  }),
} as const);
