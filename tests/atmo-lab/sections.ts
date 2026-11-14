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

export const labSections: readonly LabSection[] = [
  { id: "switches", title: "Switches", brief: "Track length follows the label; height stays fixed. Wells are an inset bevel that reads on light and dark. Thumbs cast a shadow." },
  { id: "knob", title: "Metal knob", brief: "Two soft streaks on the metal, two on the sheen. They meet as two bright streaks and part into four dim ones as it turns." },
  { id: "sizing", title: "Sizing", brief: "Measured heights against Apple's targets: 44 pt iOS/iPadOS, 28 pt macOS, with their minimums." },
  { id: "outline", title: "Outline groups", brief: "The group line runs from the label to an arrow pinned near the trailing edge, whatever the label length." },
  { id: "menus", title: "Menus", brief: "Section dividers, submenu arrows and the scroll indicator." },
  { id: "bars", title: "Top bars", brief: "Top bars, toolbars and grouped buttons." },
  { id: "catalogue", title: "Catalogue", brief: "Any of the frozen baseline catalogue's surfaces, by name." },
];
