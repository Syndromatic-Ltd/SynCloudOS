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

import { defineNSEAppearance } from "../../Appearance";

export const atmoAppearance = defineNSEAppearance({
  id: "atmo",
  displayName: "Atmo",
  recipes: [
    { slot: "toolbar.surface.normal.1x", recipeId: "atmo.toolbar.surface.bottom-fade.normal.1x" },
    { slot: "toolbar.item.normal.1x", recipeId: "atmo.toolbar.item.menu-button.normal.1x" },
    { slot: "toolbar.item.pressed.1x", recipeId: "atmo.toolbar.item.menu-button.pressed.1x" },
    { slot: "toolbar.item.selected.1x", recipeId: "atmo.toolbar.item.menu-button.selected.1x" },
    { slot: "toolbar.item.disabled.1x", recipeId: "atmo.toolbar.item.menu-button.disabled.1x" },
    { slot: "tab-bar.surface.normal.1x", recipeId: "atmo.tab-bar.surface.top-fade.normal.1x" },
    { slot: "tab-bar.tab.normal.1x", recipeId: "atmo.tab-bar.tab.grouped-toolbutton.normal.1x" },
    { slot: "tab-bar.tab.normal.2x", recipeId: "atmo.tab-bar.tab.grouped-toolbutton.normal.2x" },
    { slot: "tab-bar.tab.selected.1x", recipeId: "atmo.tab-bar.tab.grouped-toolbutton.selected.1x" },
    { slot: "tab-bar.tab.selected.2x", recipeId: "atmo.tab-bar.tab.grouped-toolbutton.selected.2x" },
    { slot: "tab-bar.tab.pressed.1x", recipeId: "atmo.tab-bar.tab.grouped-toolbutton.pressed.1x" },
    { slot: "tab-bar.tab.pressed.2x", recipeId: "atmo.tab-bar.tab.grouped-toolbutton.pressed.2x" },
    { slot: "tab-bar.tab.hover.1x", recipeId: "atmo.tab-bar.tab.grouped-toolbutton.hover.1x" },
    { slot: "tab-bar.tab.hover.2x", recipeId: "atmo.tab-bar.tab.grouped-toolbutton.hover.2x" },
    { slot: "tab-bar.tab.focused.1x", recipeId: "atmo.tab-bar.tab.grouped-toolbutton.focused.1x" },
    { slot: "tab-bar.tab.focused.2x", recipeId: "atmo.tab-bar.tab.grouped-toolbutton.focused.2x" },
    { slot: "tab-bar.tab.disabled.1x", recipeId: "atmo.tab-bar.tab.grouped-toolbutton.disabled.1x" },
    { slot: "tab-bar.tab.disabled.2x", recipeId: "atmo.tab-bar.tab.grouped-toolbutton.disabled.2x" },
  ],
});
