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

import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import type { HFXFeedbackRequest } from "../Feedback";
import {
  classes,
  useControllableState,
  useNSEControlFeedback,
} from "../Controls/Core/nseControlsShared";
import { NSESlider } from "../Controls/Values/NSESlider";
import type { NSESliderProps } from "../Controls/Values/valueControlTypes";
import {
  normalizeNSEProgress,
  progressStyle,
  useNSEProgressVisibility,
} from "./progressCore";
export interface NSEProgressBarProps extends Omit<HTMLAttributes<HTMLDivElement>, "content"> {
  value: number;
  /** The range floor. Default 0. */
  min?: number;
  max?: number;
  /** Round the position to a multiple of this. Default 1. */
  snap?: number;
  /** A secondary fill drawn behind the primary progress. */
  altValue?: number;
  /** Animate width changes. Default true. */
  animatePosition?: boolean;
  /** Text overlaid on the bar. */
  content?: ReactNode;
  label?: string;
}

export function NSEProgressBar({
  value,
  min = 0,
  max = 100,
  snap = 1,
  altValue,
  animatePosition = true,
  content,
  label,
  className = "",
  style,
  children,
  ...props
}: NSEProgressBarProps) {
  const metrics = normalizeNSEProgress({ value, minimum: min, maximum: max, snap, alternateValue: altValue });
  const overlay = content ?? children;

  return (
    <div
      className={classes("nse-control-progress-bar", className)}
      data-empty={metrics.percent <= 0 ? "true" : "false"}
      data-full={metrics.percent >= 100 ? "true" : "false"}
      data-animate={animatePosition ? "true" : "false"}
      role="progressbar"
      aria-label={label}
      aria-valuemin={metrics.minimum}
      aria-valuemax={metrics.maximum}
      aria-valuenow={metrics.value}
      style={{ ...style, ...progressStyle(metrics) }}
      {...props}
    >
      {metrics.alternateValue !== undefined && metrics.alternatePercent > 0 ? <span className="nse-control-progress-alt" aria-hidden="true" /> : null}
      <span className="nse-control-progress-inner" />
      {overlay !== undefined && overlay !== null && overlay !== "" ? <span className="nse-control-progress-content">{overlay}</span> : null}
    </div>
  );
}

export interface NSESpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: "small" | "large";
  tone?: "light" | "dark";
  label?: string;
}

export function NSESpinner({ size = "small", tone = "light", label = "Loading", className = "", ...props }: NSESpinnerProps) {
  const rootRef = useNSEProgressVisibility<HTMLSpanElement>();

  return (
    <span ref={rootRef} className={classes("nse-control-spinner", className)} data-size={size} data-tone={tone} role="status" aria-label={label} {...props}>
      <span className="nse-control-spinner-sprite" aria-hidden="true" />
    </span>
  );
}

export interface NSEProgressItemProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  variant?: "item" | "pill";
  label?: ReactNode;
}

export function NSEProgressItem({
  value,
  max = 100,
  variant = "item",
  label,
  className = "",
  style,
  children,
  ...props
}: NSEProgressItemProps) {
  const metrics = normalizeNSEProgress({ value, minimum: 0, maximum: max, snap: 1 });

  return (
    <div
      className={classes("nse-control-progress-item", className)}
      data-variant={variant}
      role="progressbar"
      aria-label={typeof label === "string" ? label : undefined}
      aria-valuemin={metrics.minimum}
      aria-valuemax={metrics.maximum}
      aria-valuenow={metrics.value}
      style={{ ...style, ...progressStyle(metrics) }}
      {...props}
    >
      <span className="nse-control-progress-item-fill" aria-hidden="true" />
      <span className="nse-control-progress-item-label">{children ?? label}</span>
    </div>
  );
}

export { NSESlider } from "../Controls/Values/NSESlider";
export type { NSESliderProps } from "../Controls/Values/valueControlTypes";
