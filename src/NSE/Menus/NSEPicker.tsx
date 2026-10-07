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

import { useCallback, useId, useMemo, useRef, type HTMLAttributes, type ReactNode } from "react";
import { useNSEOverlayProvider } from "../Overlays";
import { NSEListboxPopup, type NSEListboxOption } from "../Overlays/NSEListboxPopup";
import type { NSEPopupPresentation } from "../Overlays/NSEPopup";
import { NSEPushButton, type NSEPushButtonProps } from "../Controls/Buttons/NSEButtons";
import { classes, sizedControlStyle, useControllableState, useNSEControlFeedback } from "../Controls/Core/nseControlsShared";
import type { NSEMenuOverlayOptions } from "./menuTypes";

export interface NSEPickerOption {
  readonly value: string;
  readonly label: ReactNode;
  readonly disabled?: boolean;
}
/**
 * A command at the end of a picker's menu, after a rule: "Show Fonts…" under a
 * font list, "Customise…" under presets. It runs rather than becoming the value.
 */
export interface NSEPickerAction {
  readonly id: string;
  readonly label: ReactNode;
  readonly disabled?: boolean;
  readonly onSelect: () => void;
}
export interface NSEPickerProps extends Omit<HTMLAttributes<HTMLSpanElement>, "onChange"> {
  readonly options: readonly NSEPickerOption[];
  /** Commands listed after the options, under a rule. */
  readonly actions?: readonly NSEPickerAction[];
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly label?: ReactNode;
  readonly labelHidden?: boolean;
  /** Spoken name when it should say more than the visible caption. */
  readonly accessibleLabel?: string;
  readonly textAlign?: "start" | "center" | "end";
  readonly popupAlign?: "left" | "right";
  readonly pressHaptic?: NSEPushButtonProps["haptic"];
  readonly snapHaptic?: NSEPushButtonProps["haptic"];
  readonly smoothSurface?: boolean;
  readonly listboxOverlay?: NSEMenuOverlayOptions;
  readonly parentResponderId?: string;
  readonly presentation?: NSEPopupPresentation;
  readonly disabled?: boolean;
  /** "small" is the popup-button size inspectors and panels use (24px). */
  readonly controlSize?: "regular" | "small";
  /** An explicit height in CSS pixels; the pill keeps its proportions. */
  readonly height?: number;
  /** An explicit width (CSS pixels, or any CSS length). */
  readonly width?: number | string;
}

/**
 * Canonical picker trigger. The option list is always rendered by the shared
 * NSEListboxPopup/overlay stack; no picker-specific portal or focus engine is
 * created here.
 */
export function NSEPicker({
  options,
  actions,
  value,
  defaultValue,
  onValueChange,
  label,
  labelHidden = false,
  accessibleLabel,
  textAlign = "start",
  popupAlign = "right",
  pressHaptic = "soft",
  snapHaptic = "selection",
  smoothSurface,
  listboxOverlay,
  parentResponderId,
  presentation,
  disabled = false,
  controlSize = "regular",
  height,
  width,
  className,
  id,
  style,
  ...htmlAttributes
}: NSEPickerProps) {
  const provider = useNSEOverlayProvider();
  const generatedId = useId().replace(/:/g, "");
  const pickerId = id ?? `nse-picker:${generatedId}`;
  const buttonId = `${pickerId}-button`;
  const listboxId = `${pickerId}-listbox`;
  const labelId = label ? `${pickerId}-label` : undefined;
  const resolvedParentResponderId = parentResponderId ?? listboxOverlay?.parentResponderId ?? provider.defaultParentResponderId;
  const resolvedOverlay = useMemo(() => {
    if (listboxOverlay) return listboxOverlay;
    if (!resolvedParentResponderId) return null;
    return { id: `${pickerId}:overlay`, parentResponderId: resolvedParentResponderId };
  }, [listboxOverlay, pickerId, resolvedParentResponderId]);
  if (!resolvedParentResponderId || !resolvedOverlay) {
    throw new Error("NSEPicker requires listboxOverlay provenance or an NSEStandaloneControlHost.");
  }
  const fallbackValue = defaultValue ?? options.find((option) => !option.disabled)?.value ?? "";
  const [selectedValue, setSelectedValue] = useControllableState({
    value,
    defaultValue,
    fallback: fallbackValue,
    onChange: onValueChange,
  });
  const [open, setOpen] = useControllableState({
    value: undefined,
    defaultValue: false,
    fallback: false,
  });
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const selectedOption = options.find((option) => option.value === selectedValue) ?? options.find((option) => !option.disabled);
  const { triggerNSEControlHaptic } = useNSEControlFeedback();
  const listboxOptions = useMemo<readonly NSEListboxOption<string>[]>(() => [
    ...options.map((option) => ({ id: option.value, label: option.label, value: option.value, disabled: option.disabled })),
    ...(actions ?? []).map((action, index) => ({ id: `nse-picker-action:${action.id}`, label: action.label, disabled: action.disabled, kind: "action" as const, separatorBefore: index === 0 && options.length > 0 })),
  ], [actions, options]);
  const requestOpen = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
  }, [setOpen]);
  const select = useCallback((option: NSEListboxOption<string>) => {
    if (option.disabled) return;
    if (option.kind === "action") {
      actions?.find((action) => `nse-picker-action:${action.id}` === option.id)?.onSelect();
      return;
    }
    if (option.value === undefined) return;
    setSelectedValue(option.value);
    if (snapHaptic) void triggerNSEControlHaptic(snapHaptic);
  }, [actions, setSelectedValue, snapHaptic, triggerNSEControlHaptic]);

  return (
    <span
      id={id}
      className={classes("nse-control-picker", className)}
      data-text-align={textAlign}
      data-popup-align={popupAlign}
      data-smooth-surface={smoothSurface ? "true" : undefined}
      data-size={height !== undefined ? "custom" : controlSize === "small" ? "small" : undefined}
      style={sizedControlStyle(style, height, width)}
      {...htmlAttributes}
    >
      {/* Name sources for aria-labelledby only are `hidden`: they still name
          the button and listbox, but are not read again as loose text. */}
      {label ? (
        <span id={labelId} className={labelHidden ? undefined : "nse-control-picker-label"} hidden={labelHidden || undefined}>
          {label}
        </span>
      ) : null}
      <span id={`${pickerId}-accessible-label`} hidden>
        {accessibleLabel ?? label} {selectedOption?.label}
      </span>
      <NSEPushButton
        ref={anchorRef}
        id={buttonId}
        className="nse-control-picker-button"
        disabled={disabled}
        haptic={pressHaptic}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={`${pickerId}-accessible-label`}
        onKeyDown={(event) => {
          if (event.defaultPrevented || event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            requestOpen(true);
          }
        }}
        onClick={() => requestOpen(!open)}
      >
        <span className="nse-control-picker-caption">{selectedOption?.label ?? "Select"}</span>
        <span className="nse-control-picker-arrow" aria-hidden="true" />
      </NSEPushButton>
      <NSEListboxPopup
        id={listboxId}
        open={open}
        anchor={anchorRef.current}
        parentResponderId={resolvedOverlay.parentResponderId}
        parentId={resolvedOverlay.parentId}
        parentScopeId={resolvedOverlay.parentScopeId}
        options={listboxOptions}
        selectedId={selectedValue}
        labelledBy={labelId ?? `${pickerId}-accessible-label`}
        presentation={presentation}
        popupAlign={popupAlign}
        controlSize={controlSize === "small" || height !== undefined ? "small" : "regular"}
        onOpenChange={(nextOpen) => requestOpen(nextOpen)}
        onSelect={select}
      />
    </span>
  );
}
