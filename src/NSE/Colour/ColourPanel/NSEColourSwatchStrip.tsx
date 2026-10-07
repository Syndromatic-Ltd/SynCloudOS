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

import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { GFXColour } from "../../../FX/GraphicsFX/public";

/** The media type a colour carries when dragged between colour surfaces. */
export const NSE_COLOUR_DRAG_TYPE = "application/x-nse-colour";

const COLUMNS = 10;
const EXPANDED_ROWS = 3;

export interface NSEColourSwatchStripProps {
  readonly swatches: readonly GFXColour[];
  readonly current: GFXColour | null;
  readonly disabled?: boolean;
  onChoose(colour: GFXColour): void;
  onChange(swatches: readonly GFXColour[]): void;
}

/** A colour dropped from a colour surface, or a CSS colour or hex dropped as text. */
export function readDroppedColour(event: DragEvent): GFXColour | null {
  const text = event.dataTransfer.getData(NSE_COLOUR_DRAG_TYPE) || event.dataTransfer.getData("text/plain");
  const trimmed = text.trim();
  if (!trimmed) return null;
  try { return GFXColour.parse(/^[0-9a-f]{3,8}$/i.test(trimmed) ? `#${trimmed}` : trimmed); }
  catch { return null; }
}

export function writeDraggedColour(event: DragEvent, colour: GFXColour) {
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(NSE_COLOUR_DRAG_TYPE, colour.toCSS());
  event.dataTransfer.setData("text/plain", colour.toHex({ includeAlpha: colour.components.a < 1 }).toUpperCase());
}

/**
 * The saved colours along the foot of the colour panel, as NSColorPanel keeps
 * them: click a colour to use it, click an empty well (or drop a colour on
 * any well) to keep the current colour there, and Delete to take one out. The
 * grip beneath opens two more rows.
 */
export function NSEColourSwatchStrip({ swatches, current, disabled = false, onChoose, onChange }: NSEColourSwatchStripProps) {
  const [expanded, setExpanded] = useState(false);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const cells = useRef(new Map<number, HTMLButtonElement>());
  const rows = expanded ? EXPANDED_ROWS : 1;
  const capacity = rows * COLUMNS;
  const store = (index: number, colour: GFXColour) => {
    const next = [...swatches];
    // Wells fill from the start: a colour kept in an empty well joins the end.
    if (index < next.length) next[index] = colour;
    else next.push(colour);
    onChange(next.filter((candidate, position) => next.findIndex((other) => other.equals(candidate)) === position));
  };
  const remove = (index: number) => {
    if (index >= swatches.length) return;
    onChange(swatches.filter((_, position) => position !== index));
  };
  const onKeyDown = (index: number, event: KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key === "Delete" || event.key === "Backspace") && index < swatches.length) {
      event.preventDefault();
      remove(index);
      return;
    }
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLUMNS, ArrowDown: COLUMNS }[event.key as "ArrowLeft"];
    if (step === undefined) return;
    event.preventDefault();
    const next = Math.max(0, Math.min(capacity - 1, index + step));
    cells.current.get(next)?.focus();
  };
  return <div data-nse-part="swatch-strip" data-rows={rows}>
    <div role="grid" aria-label="Saved colours" aria-disabled={disabled || undefined}>
      {Array.from({ length: rows }, (_, row) => <div key={row} role="row">
        {Array.from({ length: COLUMNS }, (_, column) => {
          const index = row * COLUMNS + column;
          const colour = swatches[index] ?? null;
          return <button
            key={column}
            ref={(node) => { if (node) cells.current.set(index, node); else cells.current.delete(index); }}
            type="button"
            role="gridcell"
            tabIndex={index === 0 ? 0 : -1}
            disabled={disabled}
            aria-label={colour ? `Saved colour ${colour.toHex().toUpperCase()}` : "Empty: keep the current colour here"}
            aria-selected={colour !== null && current !== null && colour.equals(current)}
            data-state={colour ? "filled" : "empty"}
            data-drop-target={dropIndex === index ? "true" : undefined}
            style={colour ? { backgroundColor: colour.toCSS() } : undefined}
            draggable={colour !== null}
            onClick={() => {
              if (colour) onChoose(colour);
              else if (current) store(index, current);
            }}
            onKeyDown={(event) => onKeyDown(index, event)}
            onDragStart={(event) => { if (colour) writeDraggedColour(event, colour); }}
            onDragOver={(event) => {
              if (disabled) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setDropIndex(index);
            }}
            onDragLeave={() => setDropIndex((currentIndex) => currentIndex === index ? null : currentIndex)}
            onDrop={(event) => {
              event.preventDefault();
              setDropIndex(null);
              const dropped = readDroppedColour(event);
              if (dropped) store(index, dropped);
            }}
          />;
        })}
      </div>)}
    </div>
    <button type="button" data-nse-part="swatch-grip" aria-label={expanded ? "Show fewer saved colours" : "Show more saved colours"} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} />
  </div>;
}
