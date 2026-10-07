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

import { useMemo, type HTMLAttributes, type ReactNode } from "react";
import { classes, useControllableState } from "../Core/nseControlsShared";
import { NSEToolbar, type NSEToolbarProps } from "../../Toolbars";
import { NSEPicker, NSEMenu, type NSEMenuItemDefinition, type NSEMenuProps, type NSEPickerOption, type NSEPickerProps } from "../../Menus";

export type NSEExtendedControlLevel = "P0" | "P1";

export interface NSESelectableOption {
  value: string;
  label?: ReactNode;
  caption?: ReactNode;
  icon?: ReactNode;
  src?: string;
  disabled?: boolean;
}

export interface NSESelectorItem {
  value: string;
  label: ReactNode;
  caption?: ReactNode;
  icon?: ReactNode;
  src?: string;
  disabled?: boolean;
}

export type NSESelectorItemInput = string | NSESelectorItem;

function resolveCaption(children: ReactNode, caption?: ReactNode, label?: ReactNode, fallback?: ReactNode) {
  return children ?? caption ?? label ?? fallback;
}

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

function normalizeSelectorItems(items: NSESelectorItemInput[] = []): NSESelectorItem[] {
  return items.map((item, index) => {
    if (typeof item === "string") {
      return { value: item, label: item };
    }

    const label = item.label ?? item.caption ?? item.value ?? String(index);
    return {
      ...item,
      value: item.value ?? (typeof label === "string" ? label : String(index)),
      label
    };
  });
}

function toPickerOptions(items: NSESelectorItem[]): NSEPickerOption[] {
  return items.map((item) => ({
    value: item.value,
    label: renderSelectableOption(item),
    disabled: item.disabled
  }));
}

function toMenuItems(items: NSESelectorItem[]): NSEMenuItemDefinition[] {
  return items.map((item) => ({
    value: item.value,
    label: renderSelectableOption(item),
    disabled: item.disabled
  }));
}

export interface NSEListSelectorProps extends Omit<NSEPickerProps, "defaultValue" | "onSelect" | "onValueChange" | "options" | "value"> {
  items?: NSESelectorItemInput[];
  options?: NSESelectorItemInput[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onChange?: (value: string, oldValue: string) => void;
  onSelect?: (item: NSESelectorItem, value: string) => void;
  hideItem?: boolean;
  hideArrow?: boolean;
  contentPack?: "start" | "center" | "end";
  popupAlign?: "left" | "right";
}

export function NSEListSelector({
  items,
  options,
  value,
  defaultValue,
  onValueChange,
  onChange,
  onSelect,
  hideItem = false,
  hideArrow = false,
  contentPack = "start",
  popupAlign = "right",
  className = "",
  ...props
}: NSEListSelectorProps) {
  const normalizedItems = normalizeSelectorItems(items ?? options ?? []);
  const fallbackValue = defaultValue ?? normalizedItems.find((item) => !item.disabled)?.value ?? "";
  const [selectedValue, setSelectedValue] = useControllableState({
    value,
    defaultValue,
    fallback: fallbackValue,
    onChange: onValueChange
  });

  function handleValueChange(nextValue: string) {
    const oldValue = selectedValue;
    const selectedItem = normalizedItems.find((item) => item.value === nextValue);
    if (selectedItem) onSelect?.(selectedItem, nextValue);
    if (nextValue !== oldValue) onChange?.(nextValue, oldValue);
    setSelectedValue(nextValue);
  }

  return (
    <NSEPicker
      className={classes("nse-extended-list-selector", className)}
      options={toPickerOptions(normalizedItems)}
      value={selectedValue}
      onValueChange={handleValueChange}
      data-hide-item={hideItem ? "true" : "false"}
      data-hide-arrow={hideArrow ? "true" : "false"}
      data-content-pack={contentPack}
      popupAlign={popupAlign}
      {...props}
    />
  );
}

export interface NSEPopupListProps extends Omit<Extract<NSEMenuProps, { readonly items: readonly NSEMenuItemDefinition[] }>, "items" | "label" | "onSelect"> {
  items?: NSESelectorItemInput[];
  options?: NSESelectorItemInput[];
  label?: ReactNode;
  caption?: ReactNode;
  onSelect?: (value: string, item?: NSESelectorItem) => void;
}

export function NSEPopupList({
  items,
  options,
  label,
  caption,
  onSelect,
  className = "",
  ...props
}: NSEPopupListProps) {
  const normalizedItems = normalizeSelectorItems(items ?? options ?? []);

  return (
    <NSEMenu
      className={classes("nse-extended-popup-list", className)}
      label={label ?? caption ?? "Select"}
      items={toMenuItems(normalizedItems)}
      onSelect={(nextValue) => onSelect?.(nextValue, normalizedItems.find((item) => item.value === nextValue))}
      {...props}
    />
  );
}

export type NSEPickerGroupProps = Omit<Extract<NSEToolbarProps, { readonly composition: "children" }>, "composition"> & {
  label?: string;
};

export function NSEPickerGroup({
  label,
  position = "inline",
  grouped = true,
  className = "",
  children,
  ...props
}: NSEPickerGroupProps) {
  return (
    <NSEToolbar
      composition="children"
      className={classes("nse-extended-picker-group", className)}
      position={position}
      grouped={grouped}
      role={props.role ?? "group"}
      aria-label={label ?? props["aria-label"]}
      {...props}
    >
      {label ? (
        <span className="nse-extended-picker-group-label" aria-hidden="true">{label}</span>
      ) : null}
      {children}
    </NSEToolbar>
  );
}

export interface NSEIntegerPickerProps extends Omit<NSEPickerProps, "defaultValue" | "onValueChange" | "options" | "value"> {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  formatValue?: (value: number) => ReactNode;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function NSEIntegerPicker({
  value,
  defaultValue,
  onValueChange,
  min = 0,
  max = 9,
  step = 1,
  formatValue,
  className = "",
  ...props
}: NSEIntegerPickerProps) {
  const safeStep = Math.max(1, Math.floor(step));
  const safeMin = Math.floor(min);
  const safeMax = Math.max(safeMin, Math.floor(max));
  const options = useMemo(() => {
    const nextOptions: NSEPickerOption[] = [];
    for (let itemValue = safeMin; itemValue <= safeMax; itemValue += safeStep) {
      nextOptions.push({
        value: String(itemValue),
        label: formatValue?.(itemValue) ?? String(itemValue)
      });
    }
    return nextOptions;
  }, [formatValue, safeMax, safeMin, safeStep]);

  return (
    <NSEPicker
      className={classes("nse-extended-integer-picker", className)}
      textAlign="center"
      value={value === undefined ? undefined : String(clampNumber(value, safeMin, safeMax))}
      defaultValue={defaultValue === undefined ? undefined : String(clampNumber(defaultValue, safeMin, safeMax))}
      options={options}
      onValueChange={(nextValue) => onValueChange?.(Number(nextValue))}
      {...props}
    />
  );
}
