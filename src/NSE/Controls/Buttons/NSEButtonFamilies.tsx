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
import { classes, sizedControlStyle } from "../Core/nseControlsShared";
import { ToolbarView, type ToolbarViewProps } from "../../Toolbars/ToolbarView";

/** A capsule control's size: NSControl's regular or small, or custom when a
 * height is given. The skin draws every part from the one band height, so
 * the art keeps its proportions at any size. */
export interface CapsuleSizing {
  /** "small" is the 24px size inspectors and panels use. */
  controlSize?: "regular" | "small";
  /** An explicit band height in CSS pixels; overrides controlSize. */
  height?: number;
}

function capsuleSizeAttribute({ controlSize = "regular", height }: CapsuleSizing): "small" | "custom" | undefined {
  return height !== undefined ? "custom" : controlSize === "small" ? "small" : undefined;
}

export type ToolButtonGroupProps = Omit<Extract<ToolbarViewProps, { readonly composition: "children" }>, "composition"> & CapsuleSizing & {
  label?: string;
};

/** @internal The joined tool-button band: the font panel's tool groups and NSESegmentedControl's textured segments. */
export function ToolButtonGroup({
  label,
  position = "inline",
  grouped = true,
  controlSize,
  height,
  className = "",
  style,
  children,
  ...props
}: ToolButtonGroupProps) {
  return (
    <ToolbarView
      composition="children"
      className={classes("nse-extended-tool-button-group", className)}
      position={position}
      grouped={grouped}
      aria-label={label}
      data-size={capsuleSizeAttribute({ controlSize, height })}
      data-nse-type="tool-button-group"
      data-nse-control-size={controlSize ?? "regular"}
      data-nse-height={height === undefined ? undefined : String(height)}
      style={sizedControlStyle(style, height, undefined)}
      {...props}
    >
      {children}
    </ToolbarView>
  );
}
