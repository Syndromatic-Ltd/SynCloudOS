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

import { nseControlHooks, nseStateHooks } from "../../Theme/contract/hooks";
import { useNSEThemeInteraction } from "../../Theme/contract/useThemeInteraction";

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
  const theme = useNSEThemeInteraction<HTMLElement>(props.isEnabled !== false);
  const hooks = nseControlHooks({ control: "level-indicator", enabled: props.isEnabled !== false, hovered: theme.hovered, focused: theme.focused, variants: { type: props.mode ?? "continuous" } });
  const state = levelState(props);


  if (props.mode === "rating") {
    return (
      <div
        role="radiogroup"
        aria-label={props["aria-label"]}
        data-nse-part="track" {...hooks} {...theme.events}
        data-state={state}

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
              disabled={(props.isEnabled === false)}
              data-nse-part="segment"
              {...nseStateHooks({ selected: value === props.value, enabled: props.isEnabled !== false })}

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
      data-nse-part="track" {...hooks} {...theme.events}
      data-state={state}

    >
      <span data-nse-part="segment" >{props.value}</span>
    </meter>
  );
}
