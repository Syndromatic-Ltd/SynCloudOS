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

import type { CSSProperties } from "react";
import type { NSETopBarItem, NSETopBarStyleDefinition, NSETopBarVariant } from "./nseTopBarTypes";

import { nseTopBarGlyphs } from "./nseTopBarAssets";

const cumulus: NSETopBarStyleDefinition = {
  icons: nseTopBarGlyphs
};

/**
 * Cumulus chrome metrics and built-in item glyphs. The glass bar and its inset controls
 * are vector CSS material (`[data-variant="continuous"]` in nse-chrome.css);
 * the `rail-aligned` variant is likewise CSS-driven and has no definition here.
 */
export const nseTopBarStyles = {
  continuous: cumulus
} satisfies Record<"continuous", NSETopBarStyleDefinition>;

/**
 * A chrome variant's rendered height, as the CSS value to reserve above app content: the exact
 * expression the bar itself uses, so the bar and the content below it can never disagree —
 * including a host override of `--nse-app-topbar-height` and the compact breakpoint.
 */
export function nseTopBarHeightCssValue(variant: NSETopBarVariant): string {
  const token = variant === "rail-aligned" ? "--nse-topbar-height-rail-aligned" : "--nse-topbar-height-continuous";
  return `var(--nse-app-topbar-height, var(${token}, 56px))`;
}

/**
 * The inline style that points a glyph's mask at an SVG through `--nse-app-topbar-glyph`: the
 * item's own `icon`, else its kind's built-in glyph. Undefined when neither exists (a `custom`
 * item with no icon), so the caller renders no glyph rather than an unmasked block.
 */
export function resolveNSETopBarGlyphStyle(
  item: Pick<NSETopBarItem, "kind" | "icon">,
  icons: NSETopBarStyleDefinition["icons"] = nseTopBarGlyphs
): CSSProperties | undefined {
  const url = item.icon ?? (item.kind === "custom" ? undefined : icons[item.kind]);
  return url ? ({ "--nse-app-topbar-glyph": `url(${JSON.stringify(url)})` } as CSSProperties) : undefined;
}
