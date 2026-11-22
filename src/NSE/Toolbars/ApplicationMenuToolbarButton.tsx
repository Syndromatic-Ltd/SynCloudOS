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

import { useContext, createContext } from "react";
import { TitlebarGlyphButton } from "../Windows/TitlebarGlyphButton";
import { nseTopBarGlyphs } from "../Windows/Chrome/topBarAssets";

export type ApplicationMenuGlyph = "gear" | "person";

/** @internal The window's application menu, shared by the toolbar item and any trigger the app draws. */
export const WindowApplicationMenuContext = createContext<{
  readonly label: string;
  readonly open: boolean;
  activate(anchor: HTMLElement): void;
  setAnchor(element: HTMLElement | null): void;
  toggle(): void;
} | null>(null);

export function ApplicationMenuToolbarButton({ glyph }: { readonly glyph: ApplicationMenuGlyph }) {
  const menu = useContext(WindowApplicationMenuContext);
  return <TitlebarGlyphButton label="Application Menu" glyph={glyph === "gear" ? nseTopBarGlyphs.settings : nseTopBarGlyphs.userInfo}
    position="right" opensMenu selected={menu?.open ?? false} disabled={!menu} onClick={event => menu?.activate(event.currentTarget)} />;
}
