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

// The lab's pages. The shell reads this list without loading any NSE code.
export interface LabSection {
  readonly id: string;
  readonly title: string;
  readonly brief: string;
}

// Every element, as the baseline catalogue draws it, grouped by family. A surface belongs to the family with its longest matching name.
export interface ElementFamily extends LabSection {
  readonly prefixes: readonly string[];
  readonly wide?: boolean;
}

export const elementFamilies: readonly ElementFamily[] = [
  { id: "buttons", title: "Buttons", brief: "Every bezel, size, button type and state, plus image positions and the default, destructive and Aqua buttons.", prefixes: ["button"] },
  { id: "fields", title: "Fields", brief: "Text, secure and search fields, combo boxes, token fields, pop-ups and steppers.", prefixes: ["text-field", "secure-text-field", "search-field", "combo-box", "token-field", "pop-up-button", "stepper", "switch"] },
  { id: "values", title: "Values", brief: "Sliders (linear and circular), segmented controls, level and progress indicators, colour wells, badges and path controls.", prefixes: ["slider", "segmented-control", "level-indicator", "progress-indicator", "loading-spinner", "badge", "colour-well", "path-control"] },
  { id: "dates", title: "Date & time", brief: "Date and time pickers in every style.", prefixes: ["date-picker", "time-picker"] },
  { id: "data", title: "Lists & data", brief: "Tables, outlines, collections and source lists in every data state, with browsers, cells and rule editors.", prefixes: ["table-view", "outline-view", "collection-view", "source-list", "browser", "table-cell-view", "rule-editor", "predicate-editor"], wide: true },
  { id: "layout", title: "Boxes & layout", brief: "Boxes at every title position, stacks, grids, split views, drawers, scroll and clip views and panes.", prefixes: ["box", "stack-view", "stack-item", "grid-view", "split-view", "drawer", "scroll-view", "clip-view", "view", "container-pane", "input-box"], wide: true },
  { id: "chrome", title: "Bars & navigation", brief: "Top bars, title bars at every toolbar style, toolbars, tab views, tab bars, menu bars and page controllers.", prefixes: ["top-bar", "titlebar", "toolbar", "tab-view", "tab-bar", "menu-bar", "page-controller", "window"], wide: true },
  { id: "content", title: "Text & media", brief: "Text views, rulers, text input, images, web content and the route picker.", prefixes: ["text-view", "ruler-view", "text-input-host", "image-view", "web-view", "route-picker"], wide: true },
  { id: "overlays", title: "Windows & panels", brief: "Dialogs, sheets, popovers, menus and system panels, each in a window of its own.", prefixes: ["login-window", "about", "confirm-dialog", "settings", "popover", "sheet", "menu", "colour-panel", "font-panel", "open-panel", "save-panel", "board", "notifications", "notification-centre", "folder-presentation"] },
  { id: "more", title: "More elements", brief: "Elements the frozen catalogue never draws: radio groups, dividers, grouped rows, tooltips, panels, spinners and the Chronosphere arrows.", prefixes: [] },
  { id: "other", title: "Other", brief: "Catalogue surfaces no family claims yet.", prefixes: [] },
];

export const labSections: readonly LabSection[] = [
  { id: "switches", title: "Switches", brief: "Track length follows the label; height stays fixed. Wells are an inset bevel that reads on light and dark. Thumbs cast a shadow." },
  { id: "knob", title: "Metal knob", brief: "Two soft streaks on the metal, two on the sheen. They meet as two bright streaks and part into four dim ones as it turns." },
  { id: "sizing", title: "Sizing", brief: "Measured heights against Apple's targets: 44 pt iOS/iPadOS, 28 pt macOS, with their minimums." },
  { id: "outline", title: "Outline groups", brief: "The group line runs from the label to an arrow pinned near the trailing edge, whatever the label length." },
  { id: "menus", title: "Menus", brief: "Section dividers, submenu arrows and the scroll indicator." },
  { id: "bars", title: "Top bars", brief: "Top bars, toolbars and grouped buttons." },
  ...elementFamilies.map(family => ({ id: family.id, title: family.title, brief: family.brief })),
  { id: "catalogue", title: "Catalogue", brief: "Any of the frozen baseline catalogue's surfaces, by name." },
];
