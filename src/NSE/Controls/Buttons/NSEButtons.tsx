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

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { HFXFeedbackPresetName, HFXFeedbackRequest } from "../../Feedback";
import { NSESpinner } from "../../Progress/NSEProgress";
import { classes, resolveNSEControlHaptic, sizedControlStyle, useNSEControlFeedback } from "../Core/nseControlsShared";
import { useNSEButtonPress } from "./useNSEButtonPress";

export type NSEButtonTone = "medium" | "light" | "dark" | "affirmative" | "negative";


const NSE_BUTTON_TONE_HAPTICS = {
  medium: "medium",
  light: "light",
  dark: "rigid",
  affirmative: "success",
  negative: "error"
} as const satisfies Record<NSEButtonTone, HFXFeedbackPresetName>;

export interface NSEPushButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: NSEButtonTone;
  selected?: boolean;
  active?: boolean;
  pressed?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  icon?: ReactNode;
  iconPosition?: "left" | "right";
  haptic?: HFXFeedbackRequest;
  /** NSControl's size: regular (the default) or small, the 24px inspector and panel size. */
  controlSize?: "regular" | "small";
  /** An explicit band height in CSS pixels; overrides controlSize. The face scales with it. */
  height?: number;
}

export const NSEPushButton = forwardRef<HTMLButtonElement, NSEPushButtonProps>(function NSEPushButton(
  {
    tone = "medium",
    selected = false,
    active = false,
    pressed = false,
    loading = false,
    loadingLabel = "Loading",
    icon,
    iconPosition = "left",
    haptic,
    controlSize,
    height,
    children,
    className = "",
    style,
    disabled,
    onClick,
    onPointerDown,
    onLostPointerCapture,
    onKeyDown,
    onKeyUp,
    onBlur,
    type = "button",
    ...props
  },
  ref
) {
  const { triggerNSEControlHapticForEvent } = useNSEControlFeedback();

  const isDisabled = Boolean(disabled || loading);
  const press = useNSEButtonPress(isDisabled);

  return (
    <button
      ref={ref}
      className={classes("nse-control-button", className)}
      type={type}
      data-tone={tone}
      data-selected={selected || active ? "true" : "false"}
      data-pressed={pressed ? "true" : "false"}
      data-press-active={press.active ? "true" : "false"}
      data-loading={loading ? "true" : "false"}
      data-size={height !== undefined ? "custom" : controlSize === "small" ? "small" : undefined}
      style={sizedControlStyle(style, height, undefined)}
      aria-busy={loading || undefined}
      disabled={isDisabled}
      onPointerDown={(event) => { onPointerDown?.(event); press.pointerDown(event); }}
      onLostPointerCapture={(event) => { press.cancel(); onLostPointerCapture?.(event); }}
      onKeyDown={(event) => { onKeyDown?.(event); press.keyDown(event); }}
      onKeyUp={(event) => { press.keyUp(event); onKeyUp?.(event); }}
      onBlur={(event) => { press.blur(); onBlur?.(event); }}
      onClick={(event) => {
        if (!press.allowsClick(event.detail)) { event.preventDefault(); event.stopPropagation(); return; }
        onClick?.(event);
        triggerNSEControlHapticForEvent(resolveNSEControlHaptic(haptic, NSE_BUTTON_TONE_HAPTICS[tone]), event, !isDisabled);
      }}
      {...props}
    >
      {loading ? <NSESpinner size="small" tone={tone === "light" ? "dark" : "light"} label={loadingLabel} /> : null}
      {icon && iconPosition === "left" ? <span className="nse-control-button-icon">{icon}</span> : null}
      <span className="nse-control-button-label">{children}</span>
      {icon && iconPosition === "right" ? <span className="nse-control-button-icon">{icon}</span> : null}
    </button>
  );
});

export interface NSEIconButtonProps extends Omit<NSEPushButtonProps, "icon" | "children"> {
  src?: string;
  icon?: ReactNode;
  label: string;
  showLabel?: boolean;
}

export function NSEIconButton({
  src,
  icon,
  label,
  showLabel = false,
  className = "",
  ...props
}: NSEIconButtonProps) {
  const renderedIcon = icon ?? (src ? <img src={src} alt="" draggable={false} /> : null);

  return (
    <NSEPushButton
      className={classes("nse-control-icon-button", className)}
      icon={renderedIcon}
      aria-label={label}
      title={label}
      {...props}
    >
      {showLabel ? label : <span className="nse-control-visually-hidden">{label}</span>}
    </NSEPushButton>
  );
}

