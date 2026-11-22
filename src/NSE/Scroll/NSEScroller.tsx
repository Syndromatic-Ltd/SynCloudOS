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

import type { CSSProperties } from "react";
import type { ScrollerPolicy } from "./scrollTypes";
import "./scroll.css";

export interface NSEScrollerProps {
  readonly style?: CSSProperties;
  readonly orientation: "horizontal" | "vertical";
  readonly policy?: ScrollerPolicy;
  readonly value: number;
  readonly maximum: number;
  /** NSScroller.knobProportion, from 0 to 1. Omission uses the theme's default length. */
  readonly knobProportion?: number;
  readonly disabled?: boolean;
  onValueChange(value: number): void;
}

export function NSEScroller({ style, orientation, policy = "automatic", value, maximum, knobProportion, disabled, onValueChange }: NSEScrollerProps) {
  if (policy === "hidden") return null;
  const limit = Number.isFinite(maximum) ? Math.max(0, maximum) : 0;
  const current = Number.isFinite(value) ? Math.min(Math.max(0, value), limit) : 0;
  const isDisabled = disabled || limit === 0;
  const proportion = knobProportion !== undefined && Number.isFinite(knobProportion)
    ? Math.min(1, Math.max(0, knobProportion))
    : undefined;
  const trackStyle = {
    ...style,
    "--nse-scroller-position": limit ? current / limit : 0,
    ...(proportion === undefined ? {} : { "--nse-scroller-knob-length": proportion * 100 + "%" }),
  } as CSSProperties;
  return <span style={trackStyle} data-nse-control="scroller" data-nse-part="track"
    data-nse-orientation={orientation} data-nse-enabled={isDisabled ? "false" : undefined}
    data-orientation={orientation} data-policy={policy}>
    <input type="range" aria-label={orientation + " scroller"} aria-orientation={orientation}
      min={0} max={limit} value={current} disabled={isDisabled} data-nse-part="field"
      onChange={event => onValueChange(Number(event.currentTarget.value))} />
    <span data-nse-part="knob" aria-hidden="true" />
  </span>;
}
