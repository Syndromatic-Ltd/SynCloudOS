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

import { useRef, type PointerEvent as ReactPointerEvent } from "react";

import { NSEPopupButton } from "../../Menus";
import type { NSETableColumnMenu } from "./tableTypes";

export interface NSETableHeaderColumn {
  readonly id: string;
  readonly title: string;
  readonly width: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly sortDirection: "ascending" | "descending" | null;
  readonly sortable: boolean;
  readonly onSort: () => void;
  readonly onResize: (width: number) => void;
}

export interface NSETableHeaderProps {
  readonly columns: readonly NSETableHeaderColumn[];
  readonly height: number;
  readonly width: number;
  readonly menu?: NSETableColumnMenu;
  readonly disabled?: boolean;
}

export function NSETableHeader({ columns, height, width, menu, disabled = false }: NSETableHeaderProps) {
  const dragRef = useRef<{ id: string; start: number; width: number } | null>(null);
  return (
    <div role="row" data-nse-part="header" style={{ display: "flex", height: `${height}px`, inlineSize: `${width}px`, position: "sticky", insetBlockStart: 0 }}>
      {columns.map((column, index) => (
        <div
          key={column.id}
          role="columnheader"
          aria-colindex={index + 1}
          aria-sort={column.sortDirection ?? undefined}
          data-column-id={column.id}
          data-state={column.sortDirection ? `sorted-${column.sortDirection}` : "normal"}
          style={{ flex: `0 0 ${column.width}px`, inlineSize: `${column.width}px` }}
        >
          {column.sortable ? (
            <button type="button" aria-label={`Sort by ${column.title}`} disabled={disabled} onClick={column.onSort}>
              {column.title}<span aria-hidden="true" data-nse-part="sort-glyph" data-appearance-recipe="table-sort-glyph" />
            </button>
          ) : <span>{column.title}</span>}
          {/* A column fixed at one width (NSTableColumn with no resizing mask)
              offers no handle to resize it by. */}
          {column.minimum === column.maximum ? null : <div
            role="separator"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled || undefined}
            aria-label={`Resize ${column.title}`}
            aria-orientation="vertical"
            aria-valuemin={column.minimum}
            aria-valuemax={column.maximum}
            aria-valuenow={column.width}
            data-nse-part="column-resize-handle"
            onKeyDown={(event) => {
              if (disabled) return;
              if (event.key === "ArrowLeft") column.onResize(Math.max(column.minimum, column.width - 16));
              else if (event.key === "ArrowRight") column.onResize(Math.min(column.maximum, column.width + 16));
              else if (event.key === "Home") column.onResize(column.minimum);
              else if (event.key === "End") column.onResize(column.maximum);
              else return;
              event.preventDefault();
            }}
            onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
              if (disabled || event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              dragRef.current = { id: column.id, start: event.clientX, width: column.width };
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (disabled || !drag || drag.id !== column.id) return;
              column.onResize(Math.min(column.maximum, Math.max(column.minimum, drag.width + event.clientX - drag.start)));
            }}
            onPointerUp={(event) => {
              dragRef.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => { dragRef.current = null; }}
          />}
          {menu && !disabled && index === columns.length - 1 ? (
            <NSEPopupButton label="Columns" model={menu.model} controller={menu.controller} overlay={menu.overlay} />
          ) : null}
        </div>
      ))}
    </div>
  );
}
