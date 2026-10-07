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

import type { HTMLAttributes, ReactNode } from "react";

import type { HFXFeedbackRequest } from "../Feedback";
import type { NSEButtonTone } from "../Controls/Buttons/NSEButtons";
import { classes } from "../Controls/Core/nseControlsShared";
import { NSETabStrip, type NSETabStyle } from "./tabStrip";

export interface NSETabOption {
  readonly value: string;
  readonly label?: ReactNode;
  readonly caption?: ReactNode;
  readonly icon?: ReactNode;
  readonly src?: string;
  readonly disabled?: boolean;
}

export interface NSETabGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  readonly options?: readonly NSETabOption[];
  readonly value?: string;
  readonly defaultValue?: string;
  readonly label?: string;
  readonly tone?: NSEButtonTone;
  /** "icons" draws the options as a row of icons, each named by a tooltip or
   * (with showsCaptions) beneath it; each option supplies its `icon`. */
  readonly tabStyle?: NSETabStyle;
  readonly showsCaptions?: boolean;
  readonly selectionHaptic?: HFXFeedbackRequest;
  /** NSControl's size for capsule tabs: regular, or small (the 24px inspector size). */
  readonly controlSize?: "regular" | "small";
  /** An explicit band height in CSS pixels; overrides controlSize. */
  readonly height?: number;
  onValueChange?(value: string): void;
  onChange?(value: string): void;
}

function tabAccessibleLabel(item: NSETabOption) {
  if (typeof item.label === "string") return item.label;
  if (typeof item.caption === "string") return item.caption;
  return item.value;
}

function tabIcon(item: NSETabOption) {
  const iconSource = item.src ?? (typeof item.icon === "string" ? item.icon : undefined);
  return iconSource ? <img src={iconSource} alt="" draggable={false} /> : item.icon;
}

function tabLabel(item: NSETabOption) {
  const icon = tabIcon(item);
  const label = item.label ?? item.caption ?? item.value;
  if (!icon) return label;
  return <span className="nse-extended-option"><span className="nse-extended-option-icon">{icon}</span><span className="nse-extended-option-label">{label}</span></span>;
}

export function NSETabGroup({
  options,
  value,
  defaultValue,
  onValueChange,
  onChange,
  label = "Tabs",
  tone = "dark",
  tabStyle = "capsule",
  showsCaptions = false,
  selectionHaptic = "selection",
  controlSize,
  height,
  className = "",
  style,
  ...hostProps
}: NSETabGroupProps) {
  const items = options ?? [];

  const icons = tabStyle === "icons";
  return <div {...hostProps} className={classes("nse-extended-tab-group", className)} data-nse-control="tab-group" data-tone={tone} data-tab-style={tabStyle}
    data-size={height !== undefined ? "custom" : controlSize === "small" ? "small" : undefined}
    style={height !== undefined ? { ...style, ["--nse-control-height" as string]: `${height}px` } : style}>
    <NSETabStrip
      aria-label={label}
      tone={tone}
      panelIdentity={false}
      presentation={{ tabListClassName: icons ? undefined : "nse-extended-tab-group", directTabButtons: true, tabStyle, showsCaptions }}
      selectedId={value}
      defaultSelectedId={defaultValue ?? items.find((item) => !item.disabled)?.value}
      selectionHaptic={selectionHaptic}
      items={items.map((item) => ({ id: item.value, label: icons ? item.label ?? item.caption ?? item.value : tabLabel(item), accessibleLabel: tabAccessibleLabel(item), icon: icons ? tabIcon(item) : undefined, disabled: item.disabled }))}
      onSelectedIdChange={(next) => {
        onValueChange?.(next);
        onChange?.(next);
      }}
    />
  </div>;
}
