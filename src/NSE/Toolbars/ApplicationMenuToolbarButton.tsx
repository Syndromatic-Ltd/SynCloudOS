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

import { useContext, createContext, type CSSProperties } from "react";
import { nseTopBarGlyphs } from "../Windows/Chrome/topBarAssets";

export type ApplicationMenuGlyph = "gear" | "person";

export const WindowApplicationMenuContext = createContext<{
  readonly open: boolean;
  activate(anchor: HTMLElement): void;
} | null>(null);

export function ApplicationMenuToolbarButton({ glyph }: { readonly glyph: ApplicationMenuGlyph }) {
  const menu = useContext(WindowApplicationMenuContext);
  const mask = glyph === "gear" ? nseTopBarGlyphs.settings : nseTopBarGlyphs.userInfo;
  return <button type="button" aria-label="Application Menu" aria-haspopup="menu" aria-expanded={menu?.open ?? false}
    disabled={!menu} data-window-no-drag="" data-nse-control="toolbar-item" data-nse-part="button"
    className="nse-app-topbar-button" onClick={event => menu?.activate(event.currentTarget)}>
    <span className="nse-app-topbar-button-well" aria-hidden="true" />
    <span className="nse-app-topbar-button-icon" style={{ "--nse-topbar-glyph": `url(${JSON.stringify(mask)})` } as CSSProperties} aria-hidden="true">
      <span className="nse-app-topbar-glyph-shape" />
    </span>
  </button>;
}
