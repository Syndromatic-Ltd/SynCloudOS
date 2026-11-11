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

/**
 * A named step of the SDK's spacing (see nse-layout-defaults.css), so a
 * layout follows the theme's rhythm instead of hard-coding pixels:
 * `tight` (a control and its caption), `standard` (sibling controls),
 * `inline` (controls side by side, such as a row of buttons), `related`
 * (stacked groups of related controls), `group` (unrelated groups).
 */
export type NSESpacing = "none" | "tight" | "standard" | "inline" | "related" | "group";
/** A named spacing, a number of CSS pixels or any CSS length. */
export type NSELayoutGap = NSESpacing | number | string;

const spacingTokens: Record<NSESpacing, string> = {
  none: "0px",
  tight: "var(--nse-spacing-tight)",
  standard: "var(--nse-spacing-standard)",
  inline: "var(--nse-spacing-inline)",
  related: "var(--nse-spacing-related)",
  group: "var(--nse-spacing-group)",
};

/** Resolves a gap to CSS: a named spacing, a pixel number or any CSS length. */
export function resolveNSESpacing(value: NSELayoutGap | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return `${value}px`;
  return value in spacingTokens ? spacingTokens[value as NSESpacing] : value;
}
