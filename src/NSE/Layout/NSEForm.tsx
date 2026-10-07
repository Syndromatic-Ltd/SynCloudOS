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

import { useId, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";

type NSEStyleVars = CSSProperties & { [key: `--nse-${string}`]: string | number | undefined };

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export interface NSEFormProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Where labels sit in their column. `trailing` (the default) right-aligns
   * them against their controls, as a Mac preferences pane does; `leading`
   * lines them up on the left.
   */
  labelAlignment?: "trailing" | "leading";
  /** Fixes the label column's width. By default it is as wide as the widest label. */
  labelWidth?: number | string;
}

export interface NSEFormRowProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** The row's label. It names the control cell for assistive technology. */
  label?: ReactNode;
  /** A short explanation under the control, in the secondary footnote style. */
  help?: ReactNode;
  /** Lays several peer controls out on one wrapping line instead of a column. */
  inline?: boolean;
  /** Spans both columns: a row with no label whose content starts at the form's leading edge. */
  fullWidth?: boolean;
  /**
   * How the label meets its control. `first-line` (the default) centres it on
   * the control's first line, as a Mac form does, so it sits level with a
   * field, a checkbox or a slider alike. `center` centres it on the whole
   * cell; `top` pins it to the cell's top edge.
   */
  labelAlign?: "first-line" | "center" | "top";
  children?: ReactNode;
}

/**
 * A label column and a control column, the layout of every Mac form and
 * preferences pane (AppKit's NSGridView with trailing labels and first-baseline
 * rows). Rows share one label column, so every control starts on the same
 * line. Below 420px the label moves above its control, as on iOS.
 *
 * Each control cell is a content stack: fields, sliders and lists fill the
 * column; buttons, switches and checkboxes keep their natural size.
 */
export function NSEForm({ labelAlignment = "trailing", labelWidth, className = "", style, children, ...props }: NSEFormProps) {
  const formStyle: NSEStyleVars = {
    ...style,
    ...(labelWidth === undefined ? null : { "--nse-form-label-column": typeof labelWidth === "number" ? `${labelWidth}px` : labelWidth }),
  };
  return (
    <div {...props} className={classes("nse-form", className)} data-label-alignment={labelAlignment} style={formStyle}>
      <div className="nse-form-grid">{children}</div>
    </div>
  );
}

export function NSEFormRow({ label, help, inline = false, fullWidth = false, labelAlign = "first-line", className = "", children, ...props }: NSEFormRowProps) {
  const labelId = useId();
  const helpId = useId();
  return (
    <div
      {...props}
      className={classes("nse-form-row", className)}
      data-nse-inline={inline ? "true" : undefined}
      data-nse-full-width={fullWidth || label === undefined ? "true" : undefined}
      data-label-align={labelAlign === "first-line" ? undefined : labelAlign}
    >
      {label !== undefined && !fullWidth ? <div className="nse-form-label" id={labelId}>{label}</div> : null}
      <div
        className="nse-form-control"
        data-nse-content-layout="stack"
        role={label !== undefined ? "group" : undefined}
        aria-labelledby={label !== undefined && !fullWidth ? labelId : undefined}
        aria-describedby={help ? helpId : undefined}
      >
        {children}
        {help ? <p className="nse-form-help" id={helpId}>{help}</p> : null}
      </div>
    </div>
  );
}

/** A hairline between groups of rows, with related spacing above and below. */
export function NSEFormSeparator({ className = "", ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr {...props} className={classes("nse-form-separator", className)} />;
}
