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

import { useCallback, useState, type CSSProperties } from "react";
import { useNSEFeedback, type HFXFeedbackRequest } from "../../Feedback";
import {
  getOptionalNSESmoothSurfaceProps,
  type NSESmoothSurfaceRequest,
  type NSESmoothSurfaceStyle
} from "../../SmoothSurface";

export type CSSVarStyle = CSSProperties & Record<`--${string}`, string | number>;
export type FloatingPosition = CSSProperties & { minWidth: number };
export type DefaultPreventedEvent = { defaultPrevented?: boolean };
export const TOGGLE_THUMB_PX = 32;
export const TOGGLE_INSET_PX = 0;
export const TOGGLE_TRAVEL_PX = 32;
export const DEFAULT_SLIDER_THUMB_PX = 50;

/**
 * A control drawn from proportional art (a pill, a capsule) sized by the
 * developer: the height becomes --nse-control-height, from which the theme
 * derives end caps and type; the width is the control's inline size.
 */
export function sizedControlStyle(style: CSSProperties | undefined, height: number | undefined, width: number | string | undefined): CSSProperties | undefined {
  if (height === undefined && width === undefined) return style;
  return {
    ...style,
    ...(height !== undefined ? { "--nse-control-height": `${height}px` } : {}),
    ...(width !== undefined ? { inlineSize: typeof width === "number" ? `${width}px` : width } : {}),
  } as CSSProperties;
}

export function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function snapToStep(value: number, min: number, max: number, step: number) {
  if (!Number.isFinite(step) || step <= 0) return clamp(value, min, max);
  const snapped = Math.round((value - min) / step) * step + min;
  return clamp(Number(snapped.toFixed(5)), min, max);
}

export function findFirstEnabledIndex<T extends { disabled?: boolean }>(items: T[]) {
  return items.findIndex((item) => !item.disabled);
}

export function findLastEnabledIndex<T extends { disabled?: boolean }>(items: T[]) {
  return items.reduce((lastIndex, item, index) => item.disabled ? lastIndex : index, -1);
}

export function findNextEnabledIndex<T extends { disabled?: boolean }>(
  items: T[],
  startIndex: number,
  direction: 1 | -1
) {
  if (items.length === 0) return -1;
  for (let step = 1; step <= items.length; step += 1) {
    const nextIndex = (startIndex + direction * step + items.length) % items.length;
    if (!items[nextIndex]?.disabled) return nextIndex;
  }
  return -1;
}

export type NSEControlHapticRequest = HFXFeedbackRequest;
export type NSEControlHapticResult = Promise<void>;

export function useNSEControlFeedback() {
  const feedback = useNSEFeedback();
  const triggerNSEControlHaptic = useCallback((request: HFXFeedbackRequest): NSEControlHapticResult => feedback?.trigger(request) ?? Promise.resolve(), [feedback]);
  const triggerNSEControlHapticForEvent = useCallback((request: HFXFeedbackRequest, event?: DefaultPreventedEvent, enabled = true): NSEControlHapticResult => {
    if (!enabled || event?.defaultPrevented) return Promise.resolve();
    return triggerNSEControlHaptic(request);
  }, [triggerNSEControlHaptic]);
  return { triggerNSEControlHaptic, triggerNSEControlHapticForEvent };
}

export function resolveNSEControlHaptic(request: HFXFeedbackRequest, fallback: HFXFeedbackRequest) {
  return request === undefined ? fallback : request;
}

export function getControlSmoothSurfaceProps(
  smoothSurface: NSESmoothSurfaceRequest,
  className: string,
  style?: CSSProperties
) {
  const resolved = getOptionalNSESmoothSurfaceProps(
    smoothSurface,
    className,
    style as NSESmoothSurfaceStyle | undefined
  );

  return {
    className: resolved.className ?? "",
    style: resolved.style as CSSProperties | undefined
  };
}

export function useControllableState<T>({
  value,
  defaultValue,
  fallback,
  onChange
}: {
  value?: T;
  defaultValue?: T;
  fallback: T;
  onChange?: (value: T) => void;
}) {
  const [internalValue, setInternalValue] = useState<T>(defaultValue ?? fallback);
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;

  const setValue = useCallback((nextValue: T) => {
    if (!isControlled) setInternalValue(nextValue);
    onChange?.(nextValue);
  }, [isControlled, onChange]);

  return [currentValue, setValue] as const;
}
