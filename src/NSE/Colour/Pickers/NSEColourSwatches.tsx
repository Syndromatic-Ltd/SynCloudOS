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

import type { GFXColour } from "../../../FX/GraphicsFX/public";

export interface NSEColourSwatchesProps {
  readonly colours: readonly GFXColour[];
  readonly selected?: GFXColour | null;
  onSelect(colour: GFXColour): void;
  onRemove?(colour: GFXColour): void;
}

export function NSEColourSwatches({ colours, selected, onSelect, onRemove }: NSEColourSwatchesProps) {
  return <div role="grid" aria-label="Colour swatches" data-nse-control="colour-swatches">
    {colours.map((colour) => <button key={colour.toHex({ includeAlpha: true })} type="button" role="gridcell" aria-label={colour.toHex()} aria-selected={selected?.equals(colour) ?? false} data-state={selected?.equals(colour) ? "selected" : "normal"} style={{ backgroundColor: colour.toCSS() }} onClick={() => onSelect(colour)} onKeyDown={(event) => { if ((event.key === "Delete" || event.key === "Backspace") && onRemove) { event.preventDefault(); onRemove(colour); } }} />)}
  </div>;
}
