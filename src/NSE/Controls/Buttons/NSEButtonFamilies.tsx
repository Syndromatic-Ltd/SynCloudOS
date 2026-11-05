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
import { NSEToolbar, type NSEToolbarProps } from "../../Toolbars";
import { NSERadioGroup, type NSERadioGroupProps, type NSERadioOption } from "../Fields/NSEFields";
import type { NSESelectableOption } from "../Selection/NSESelectors";

function renderControlIcon(icon?: ReactNode, src?: string) {
  const iconSrc = src ?? (typeof icon === "string" ? icon : undefined);
  if (iconSrc) return <img src={iconSrc} alt="" draggable={false} />;
  return icon ?? null;
}

function renderSelectableOption(option: NSESelectableOption) {
  const icon = renderControlIcon(option.icon, option.src);
  const label = option.label ?? option.caption ?? option.value;
  if (!icon) return label;

  return (
    <span className="nse-extended-option">
      <span className="nse-extended-option-icon">{icon}</span>
      <span className="nse-extended-option-label">{label}</span>
    </span>
  );
}

/** A capsule control's size: NSControl's regular or small, or custom when a
 * height is given. The skin draws every part from the one band height, so
 * the art keeps its proportions at any size. */
export interface NSECapsuleSizing {
  /** "small" is the 24px size inspectors and panels use. */
  controlSize?: "regular" | "small";
  /** An explicit band height in CSS pixels; overrides controlSize. */
  height?: number;
}

function capsuleSizeAttribute({ controlSize = "regular", height }: NSECapsuleSizing): "small" | "custom" | undefined {
  return height !== undefined ? "custom" : controlSize === "small" ? "small" : undefined;
}

export type NSEToolButtonGroupProps = Omit<Extract<NSEToolbarProps, { readonly composition: "children" }>, "composition"> & NSECapsuleSizing & {
  label?: string;
};

export function NSEToolButtonGroup({
  label,
  position = "inline",
  grouped = true,
  controlSize,
  height,
  className = "",
  style,
  children,
  ...props
}: NSEToolButtonGroupProps) {
  return (
    <NSEToolbar
      composition="children"
      className={classes("nse-extended-tool-button-group", className)}
      position={position}
      grouped={grouped}
      aria-label={label}
      data-size={capsuleSizeAttribute({ controlSize, height })}
      style={sizedControlStyle(style, height, undefined)}
      {...props}
    >
      {children}
    </NSEToolbar>
  );
}

export interface NSERadioToolButtonGroupProps extends Omit<NSERadioGroupProps, "options">, NSECapsuleSizing {
  options: NSESelectableOption[];
}

export function NSERadioToolButtonGroup({
  options,
  controlSize,
  height,
  className = "",
  style,
  ...props
}: NSERadioToolButtonGroupProps) {
  const radioOptions: NSERadioOption[] = options.map((option) => ({
    value: option.value,
    label: renderSelectableOption(option),
    disabled: option.disabled
  }));

  return (
    <NSERadioGroup
      className={classes("nse-extended-radio-tool-button-group", className)}
      options={radioOptions}
      data-size={capsuleSizeAttribute({ controlSize, height })}
      style={sizedControlStyle(style, height, undefined)}
      {...props}
    />
  );
}
