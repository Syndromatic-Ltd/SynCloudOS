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

import { forwardRef, type ReactNode } from "react";
import { classes, sizedControlStyle } from "../Core/nseControlsShared";
import { NSEPushButton, type NSEButtonTone, type NSEPushButtonProps } from "./NSEButtons";
import { NSEToolbar, type NSEToolbarProps } from "../../Toolbars";
import { NSERadioGroup, type NSERadioGroupProps, type NSERadioOption } from "../Fields/NSEFields";
import { NSESpinner } from "../../Progress/NSEProgress";
import type { NSESelectableOption } from "../Selection/NSESelectors";

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

export interface NSEActivityButtonProps extends Omit<NSEPushButtonProps, "active" | "children" | "loading" | "loadingLabel"> {
  active?: boolean;
  caption?: ReactNode;
  children?: ReactNode;
  spinnerLabel?: string;
}

export const NSEActivityButton = forwardRef<HTMLButtonElement, NSEActivityButtonProps>(function NSEActivityButton(
  {
    active = false,
    caption,
    children,
    spinnerLabel = "Working",
    className = "",
    icon,
    iconPosition = "right",
    "aria-busy": ariaBusy,
    ...props
  },
  ref
) {
  return (
    <NSEPushButton
      ref={ref}
      className={classes("nse-extended-activity-button", className)}
      data-active={active ? "true" : "false"}
      icon={active ? <NSESpinner size="small" tone="light" label={spinnerLabel} /> : icon}
      iconPosition={active ? "right" : iconPosition}
      aria-busy={ariaBusy ?? (active || undefined)}
      {...props}
    >
      {resolveCaption(children, caption)}
    </NSEPushButton>
  );
});

export interface NSENotificationButtonProps extends Omit<NSEPushButtonProps, "children"> {
  caption?: ReactNode;
  label?: ReactNode;
  children?: ReactNode;
  variant?: "default" | "affirmative" | "negative" | "alternate";
}

// Notification button tones:
// default = medium, alternate = dark,
// affirmative = green, negative = red. NSE has no gold tone, so Onyx's alternate-gold
// collapses onto `dark` (its Heritage-faithful mapping).
const NOTIFICATION_VARIANT_TONES = {
  default: "medium",
  affirmative: "affirmative",
  negative: "negative",
  alternate: "dark"
} as const satisfies Record<NonNullable<NSENotificationButtonProps["variant"]>, NSEButtonTone>;

export const NSENotificationButton = forwardRef<HTMLButtonElement, NSENotificationButtonProps>(
  function NSENotificationButton(
    {
      caption,
      label,
      children,
      variant = "default",
      tone,
      className = "",
      ...props
    },
    ref
  ) {
    return (
      <NSEPushButton
        ref={ref}
        className={classes("nse-extended-notification-button", className)}
        tone={tone ?? NOTIFICATION_VARIANT_TONES[variant]}
        data-variant={variant}
        {...props}
      >
        {resolveCaption(children, caption, label)}
      </NSEPushButton>
    );
  }
);

export interface NSEButtonHeaderProps extends Omit<NSEPushButtonProps, "children" | "content"> {
  caption?: ReactNode;
  content?: ReactNode;
  children?: ReactNode;
}

export const NSEButtonHeader = forwardRef<HTMLButtonElement, NSEButtonHeaderProps>(function NSEButtonHeader(
  {
    caption,
    content,
    children,
    tone = "dark",
    className = "",
    ...props
  },
  ref
) {
  return (
    <NSEPushButton ref={ref} className={classes("nse-extended-button-header", className)} tone={tone} {...props}>
      {resolveCaption(children, caption, content)}
    </NSEPushButton>
  );
});

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

export interface NSEToolButtonProps extends Omit<NSEPushButtonProps, "children" | "icon">, NSECapsuleSizing {
  caption?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  src?: string;
  label?: string;
  showLabel?: boolean;
  /** An explicit width (CSS pixels, or any CSS length). */
  width?: number | string;
}

export const NSEToolButton = forwardRef<HTMLButtonElement, NSEToolButtonProps>(function NSEToolButton(
  {
    caption,
    children,
    icon,
    src,
    label,
    showLabel,
    className = "",
    tone = "dark",
    "aria-label": ariaLabel,
    title,
    controlSize,
    height,
    width,
    style,
    ...props
  },
  ref
) {
  const visibleLabel = resolveCaption(children, caption);
  const accessibleLabel = ariaLabel ?? label ?? (typeof visibleLabel === "string" ? visibleLabel : "Tool button");
  const renderedIcon = renderControlIcon(icon, src);
  // A tool button with no icon shows its caption; otherwise it would draw an
  // empty capsule. With an icon, the caption shows only when asked for.
  const showsLabel = showLabel ?? !renderedIcon;

  return (
    <NSEPushButton
      ref={ref}
      className={classes("nse-extended-tool-button", className)}
      tone={tone}
      icon={renderedIcon}
      aria-label={accessibleLabel}
      title={title ?? accessibleLabel}
      data-size={capsuleSizeAttribute({ controlSize, height })}
      style={sizedControlStyle(style, height, width)}
      {...props}
    >
      {showsLabel && visibleLabel ? visibleLabel : <span className="nse-control-visually-hidden">{accessibleLabel}</span>}
    </NSEPushButton>
  );
});

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
