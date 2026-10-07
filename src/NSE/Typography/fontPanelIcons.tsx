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

import type { ReactNode } from "react";

/* The font panel's effect glyphs, after the Mac OS X 10.3 font panel: a
   serif T for the text itself, marked for each effect. They draw in
   currentColor so the appearance sets their ink. */

function Glyph({ children, label }: { readonly children: ReactNode; readonly label?: string }) {
  return <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label} focusable={false} data-nse-part="effect-glyph">{children}</svg>;
}

const serifT = "M3.5 2.5h9v2.6h-.8l-.35-1.5H8.9v7.6l1.2.35v.65H5.9v-.65l1.2-.35V3.6H4.65l-.35 1.5h-.8Z";

export function UnderlineGlyph() {
  return <Glyph><path d={serifT} fill="currentColor" /><path d="M2.5 14.25h11" stroke="currentColor" strokeWidth="1.1" /></Glyph>;
}

export function StrikethroughGlyph() {
  return <Glyph><path d={serifT} fill="currentColor" /><path d="M2.25 8.2h11.5" stroke="currentColor" strokeWidth="1.1" /></Glyph>;
}

export function TextColourGlyph() {
  return <Glyph><path d={serifT} fill="currentColor" /></Glyph>;
}

/** A page with its corner turned: the document the text sits on. */
export function DocumentColourGlyph() {
  return <Glyph>
    <path d="M4 1.75h5.25L12.25 4.75V14.25H4Z" fill="#fff" stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round" />
    <path d="M9.25 1.75V4.75H12.25" fill="none" stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round" />
  </Glyph>;
}

/** A T casting a soft shadow down and to the right. */
export function ShadowGlyph() {
  return <Glyph>
    <path d={serifT} fill="currentColor" opacity="0.28" transform="translate(1.4 1.4)" />
    <path d={serifT} fill="currentColor" />
  </Glyph>;
}

export function PlusGlyph() {
  return <Glyph><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></Glyph>;
}

export function MinusGlyph() {
  return <Glyph><path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></Glyph>;
}

/** The action menu's gear. */
export function GearGlyph() {
  const teeth = Array.from({ length: 8 }, (_, index) => index * 45);
  return <Glyph>
    <g fill="currentColor">
      {teeth.map((angle) => <rect key={angle} x="7" y="1.5" width="2" height="3" rx="0.4" transform={`rotate(${angle} 8 8)`} />)}
      <circle cx="8" cy="8" r="4.6" />
    </g>
    <circle cx="8" cy="8" r="1.8" fill="var(--nse-font-panel-gear-hole, #fff)" />
  </Glyph>;
}
