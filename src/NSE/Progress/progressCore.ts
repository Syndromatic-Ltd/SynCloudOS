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

import { useEffect, useRef } from "react";

import { clamp, type CSSVarStyle } from "../Controls/Core/nseControlsShared";

export interface ProgressRangeInput {
  readonly value?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly snap?: number;
  readonly alternateValue?: number;
}

export interface ProgressMetrics {
  readonly minimum: number;
  readonly maximum: number;
  readonly range: number;
  readonly value: number;
  readonly snap: number;
  readonly percent: number;
  readonly alternateValue?: number;
  readonly alternatePercent: number;
}

/**
 * Normalizes a progress indicator's value through the same range rules.
 * Progress snap is intentionally absolute, matching the historical progress
 * calcNormalizedPosition implementation rather than anchoring to minimum.
 */
export function normalizeNSEProgress({ value, minimum, maximum, snap, alternateValue }: ProgressRangeInput): ProgressMetrics {
  const safeMinimum = Number.isFinite(minimum) ? minimum as number : 0;
  const rawMaximum = Number.isFinite(maximum) ? maximum as number : 100;
  const safeMaximum = rawMaximum > safeMinimum ? rawMaximum : safeMinimum + 100;
  const safeSnap = Number.isFinite(snap) && (snap as number) > 0 ? snap as number : 1;
  const sourceValue = Number.isFinite(value) ? value as number : safeMinimum;
  const snappedValue = Math.round(sourceValue / safeSnap) * safeSnap;
  const normalizedValue = clamp(snappedValue, safeMinimum, safeMaximum);
  const range = safeMaximum - safeMinimum;
  const percent = clamp(((normalizedValue - safeMinimum) / range) * 100, 0, 100);
  const hasAlternate = Number.isFinite(alternateValue);
  const normalizedAlternateValue = hasAlternate ? clamp(alternateValue as number, safeMinimum, safeMaximum) : undefined;
  const alternatePercent = normalizedAlternateValue === undefined
    ? 0
    : clamp(((normalizedAlternateValue - safeMinimum) / range) * 100, 0, 100);

  return {
    minimum: safeMinimum,
    maximum: safeMaximum,
    range,
    value: normalizedValue,
    snap: safeSnap,
    percent,
    alternateValue: normalizedAlternateValue,
    alternatePercent,
  };
}

export function progressStyle(metrics: ProgressMetrics): CSSVarStyle {
  return {
    "--nse-control-progress": `${Number(metrics.percent.toPrecision(15))}%`,
    "--nse-control-progress-alt": `${Number(metrics.alternatePercent.toPrecision(15))}%`,
  } as CSSVarStyle;
}

export function useNSEProgressVisibility<T extends HTMLElement>() {
  const rootRef = useRef<T>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      root.dataset.suspended = entry?.isIntersecting ? "false" : "true";
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return rootRef;
}
