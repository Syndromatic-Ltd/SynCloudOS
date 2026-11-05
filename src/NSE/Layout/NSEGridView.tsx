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

import { Children, createContext, isValidElement, useContext, useId, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { resolveNSESpacing, type NSELayoutGap } from "./layoutSpacing";

/** NSGridCell.Placement across a column. */
export type NSEGridXPlacement = "leading" | "centre" | "trailing" | "fill";
/** NSGridRow's placement of its cells. `firstBaseline` is NSGridRow.rowAlignment's first baseline. */
export type NSEGridYPlacement = "firstBaseline" | "top" | "centre";

/** NSGridColumn. */
export interface NSEGridColumn {
  /** Where each cell sits across the column. Default leading. */
  readonly xPlacement?: NSEGridXPlacement;
  /** A fixed width in CSS pixels. By default a fill column takes the space left and any other column is as wide as its widest cell. */
  readonly width?: number;
}

export interface NSEGridViewProps extends HTMLAttributes<HTMLDivElement> {
  /** NSGridView.column(at:), for each column. */
  readonly columns?: readonly NSEGridColumn[];
  /** NSGridView.columnSpacing. Default the theme's label spacing. */
  readonly columnSpacing?: NSELayoutGap;
  /** NSGridView.rowSpacing. Default the theme's form row spacing. */
  readonly rowSpacing?: NSELayoutGap;
  readonly children?: ReactNode;
}

export interface NSEGridRowProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** How a label cell meets the row's views. `firstBaseline` (the default) centres it on the first line, so a label sits level with a field, a checkbox or a slider alike. */
  readonly yPlacement?: NSEGridYPlacement;
  /** NSGridRow.mergeCells(in:): the row's one cell spans every column. */
  readonly mergesCells?: boolean;
  /** Each child is one cell: a string is a label, any other node a view, and a fragment one cell of several views. */
  readonly children?: ReactNode;
}

/** Each column's placement, when the grid is not a two-column form. */
const NSEGridPlacements = createContext<readonly CSSProperties["justifySelf"][] | null>(null);

const xPlacementCSS: Record<NSEGridXPlacement, CSSProperties["justifySelf"]> = { leading: "start", centre: "center", trailing: "end", fill: "stretch" };

/** The layout of a Mac form: trailing labels, then a column that fills. */
const isFormShape = (columns: readonly NSEGridColumn[]) => columns.length === 2
  && (columns[0]?.xPlacement === "trailing" || columns[0]?.xPlacement === "leading") && columns[1]?.xPlacement === "fill" && columns[1]?.width === undefined;

/**
 * NSGridView: views in rows and columns. With a trailing (or leading) label
 * column and a fill column it is a Mac form or preferences pane: every control
 * starts on the same line, and below 420px each label moves above its control,
 * as on iOS. A view cell is a content stack: fields, sliders and lists fill
 * it, while buttons, switches and checkboxes keep their natural size.
 */
export function NSEGridView({ columns = [], columnSpacing, rowSpacing, className = "", style, children, ...props }: NSEGridViewProps) {
  const form = isFormShape(columns);
  const template = form ? undefined : (columns.length ? columns : [{}, {}]).map((column) =>
    column.width !== undefined ? `${column.width}px` : column.xPlacement === "fill" ? "minmax(0, 1fr)" : "max-content").join(" ");
  const gridStyle = {
    ...style,
    ...(form && columns[0]?.width !== undefined ? { "--nse-form-label-column": `${columns[0].width}px` } : null),
    ...(columnSpacing === undefined ? null : { "--nse-form-label-spacing": resolveNSESpacing(columnSpacing) }),
    ...(rowSpacing === undefined ? null : { "--nse-form-row-spacing": resolveNSESpacing(rowSpacing) }),
  } as CSSProperties;
  const placements = columns.map((column) => xPlacementCSS[column.xPlacement ?? "leading"]);
  return (
    <div {...props} className={["nse-form", className].filter(Boolean).join(" ")} data-nse-control="grid-view" data-label-alignment={columns[0]?.xPlacement === "leading" ? "leading" : "trailing"} style={gridStyle}>
      <div className="nse-form-grid" style={template ? { gridTemplateColumns: template } : undefined}>
        <NSEGridPlacements.Provider value={form ? null : placements}>{children}</NSEGridPlacements.Provider>
      </div>
    </div>
  );
}

/** NSGridRow. */
export function NSEGridRow({ yPlacement = "firstBaseline", mergesCells = false, className = "", children, ...props }: NSEGridRowProps) {
  const placements = useContext(NSEGridPlacements);
  const rowId = useId();
  const cells = Children.toArray(children);
  const labelId = typeof cells[0] === "string" && !mergesCells ? `${rowId}-label` : undefined;
  return (
    <div
      {...props}
      className={["nse-form-row", className].filter(Boolean).join(" ")}
      data-nse-full-width={mergesCells || labelId === undefined ? "true" : undefined}
      data-label-align={yPlacement === "centre" ? "center" : yPlacement === "top" ? "top" : undefined}
    >
      {cells.map((cell, index) => {
        const position: CSSProperties | undefined = placements ? { gridColumn: mergesCells ? "1 / -1" : index + 1, justifySelf: placements[index] ?? "start" } : undefined;
        if (index === 0 && labelId) return <div key="label" className="nse-form-label" id={labelId} style={position}>{cell}</div>;
        return <div
          key={isValidElement(cell) && cell.key != null ? cell.key : index}
          className="nse-form-control"
          data-nse-content-layout="stack"
          role={labelId && index === 1 ? "group" : undefined}
          aria-labelledby={labelId && index === 1 ? labelId : undefined}
          style={position}
        >{cell}</div>;
      })}
    </div>
  );
}
