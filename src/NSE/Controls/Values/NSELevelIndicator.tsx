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

import { nseAppearanceSlot, useNSEAppearanceSlot } from "../../Appearance";
import type { NSELevelIndicatorProps } from "./valueControlTypes";

function levelState(props: NSELevelIndicatorProps): "normal" | "warning" | "critical" {
  if (props.criticalValue !== undefined && props.value >= props.criticalValue) return "critical";
  if (props.warningValue !== undefined && props.value >= props.warningValue) return "warning";
  return "normal";
}

/**
 * Keeps rating/value semantics native to this control while declaring the
 * independent track and segment presentation slots it consumes.
 */
export function NSELevelIndicator(props: NSELevelIndicatorProps) {
  const state = levelState(props);
  const trackState = props.disabled ? "disabled" : "normal";
  const segmentState = props.disabled ? "disabled" : state;
  const trackAppearance = useNSEAppearanceSlot(
    nseAppearanceSlot("level-indicator", "track", trackState),
  );
  const segmentAppearance = useNSEAppearanceSlot(
    nseAppearanceSlot("level-indicator", "segment", segmentState),
  );

  if (props.mode === "rating") {
    return (
      <div
        role="radiogroup"
        aria-label={props["aria-label"]}
        data-nse-control="level-indicator"
        data-state={state}
        {...trackAppearance.attributes}
      >
        {Array.from({ length: Math.max(0, Math.floor(props.maximum - props.minimum)) }, (_, index) => {
          const value = props.minimum + index + 1;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-label={String(value)}
              aria-checked={value === props.value}
              disabled={props.disabled}
              data-nse-part="segment"
              {...segmentAppearance.attributes}
              onClick={() => props.onValueChange?.(value, "commit")}
            >
              ★
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <meter
      aria-label={props["aria-label"]}
      min={props.minimum}
      max={props.maximum}
      value={props.value}
      data-nse-control="level-indicator"
      data-state={state}
      {...trackAppearance.attributes}
    >
      <span data-nse-part="segment" {...segmentAppearance.attributes}>{props.value}</span>
    </meter>
  );
}
