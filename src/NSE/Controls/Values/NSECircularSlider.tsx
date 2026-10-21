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

import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import { nseThemeSlot, useNSEThemeRecipe } from "../../Appearance";
import { NSEMetalThumb } from "../../Appearance/NSEMetalThumb";
import { NSESlider } from "./NSESlider";
import type { NSECircularSliderProps } from "./valueControlTypes";

/**
 * NSSlider's circular style: a knob turned to an angle, its position marked
 * by a dot. A click anywhere on the knob turns it straight there, so no drag
 * is needed; the arrow keys step it, wrapping round when the contract wraps.
 * The linear alternative stays in the accessibility tree for assistive
 * technologies that cannot operate a radial control.
 */
export function NSECircularSlider({ controlSize = "regular", valueText, ...props }: NSECircularSliderProps) {
  const activePointer = useRef<number | null>(null);
  const opening = useRef(props.value);
  const latest = useRef(props.value);
  latest.current = props.value;
  const inert = props.disabled || props.readOnly;
  const span = props.maximum - props.minimum;
  const clamp = (value: number) => Math.max(props.minimum, Math.min(props.maximum, Math.round((value - props.minimum) / props.step) * props.step + props.minimum));
  const update = (event: ReactPointerEvent<HTMLElement>, phase: "preview" | "commit") => {
    if (inert) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - (rect.left + rect.width / 2);
    const y = event.clientY - (rect.top + rect.height / 2);
    const turns = (Math.atan2(y, x) * 180 / Math.PI + 450) % 360;
    const raw = clamp(props.minimum + (turns / 360) * span);
    // A wrapping dial's end is its start: a full turn reads as the minimum.
    const next = props.wraps && raw === props.maximum ? props.minimum : raw;
    latest.current = next;
    props.onValueChange(next, phase);
  };
  const cancel = () => {
    if (activePointer.current === null || inert) return;
    activePointer.current = null;
    latest.current = opening.current;
    props.onValueChange(opening.current, "preview");
  };
  const keyChange = (key: string) => {
    const delta = key === "ArrowRight" || key === "ArrowUp" ? props.step : -props.step;
    let next: number;
    if (key === "Home") next = props.minimum;
    else if (key === "End") next = props.maximum;
    else if (props.wraps && span > 0) next = clamp(props.minimum + ((((props.value - props.minimum + delta) % span) + span) % span));
    else next = clamp(props.value + delta);
    latest.current = next;
    props.onValueChange(next, "commit");
  };
  const progress = span === 0 ? 0 : (props.value - props.minimum) / span;
  const style = { "--nse-circular-angle": `${progress * 360}deg` } as CSSProperties;
  const appearanceState = props.disabled ? "disabled" : "normal";
  const trackAppearance = useNSEThemeRecipe(
    nseThemeSlot("circular-slider", "track", appearanceState),
  );
  const knobAppearance = useNSEThemeRecipe(
    nseThemeSlot("circular-slider", "knob", appearanceState),
  );

  return <span data-nse-control="circular-slider" data-size={controlSize} data-state={props.disabled ? "disabled" : props.readOnly ? "read-only" : "ready"} {...trackAppearance.attributes} style={style}>
    <span
      role="slider"
      aria-label={props["aria-label"]}
      aria-valuemin={props.minimum}
      aria-valuemax={props.maximum}
      aria-valuenow={props.value}
      aria-valuetext={valueText?.(props.value)}
      aria-readonly={props.readOnly || undefined}
      aria-disabled={props.disabled || undefined}
      tabIndex={inert ? -1 : 0}
      data-nse-part="circular-body"
      {...trackAppearance.attributes}
      onPointerDown={(event) => { if (inert) return; activePointer.current = event.pointerId; opening.current = props.value; event.currentTarget.setPointerCapture?.(event.pointerId); update(event, "preview"); }}
      onPointerMove={(event) => { if (activePointer.current === event.pointerId) update(event, "preview"); }}
      onPointerUp={(event) => { if (activePointer.current !== event.pointerId || inert) return; update(event, "commit"); activePointer.current = null; event.currentTarget.releasePointerCapture?.(event.pointerId); }}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={(event) => { if (inert || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return; event.preventDefault(); keyChange(event.key); }}
    ><NSEMetalThumb disabled={props.disabled} /><i aria-hidden="true" data-nse-part="knob" {...knobAppearance.attributes} /></span>
    <span data-nse-part="linear-alternative">
      <NSESlider {...props} aria-label={`${props["aria-label"]} linear alternative`} orientation="horizontal" />
    </span>
  </span>;
}
