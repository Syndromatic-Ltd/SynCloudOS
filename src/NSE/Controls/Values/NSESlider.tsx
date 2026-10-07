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

import { NSEMetalThumb } from "../../Appearance/NSEMetalThumb";
import { cloneElement, useEffect, useRef, useState, type CSSProperties, type InputHTMLAttributes, type ReactElement, type ReactNode } from "react";
import { useNSEFeedback } from "../../Feedback";
import { useNSETooltip, useOptionalNSETooltipProvider } from "../../Tooltips";
import type { NSESliderProps } from "./valueControlTypes";
import { commitUndoableValue } from "./valueControlTransaction";

const snap = (value: number, minimum: number, maximum: number, step: number) =>
  Math.max(minimum, Math.min(maximum, Math.round((value - minimum) / step) * step + minimum));

function SliderTooltipAnchor({ input, content }: { readonly input: ReactElement<InputHTMLAttributes<HTMLInputElement>>; readonly content: ReactNode }) {
  const binding = useNSETooltip({ content, delayMs: 0 });
  const anchor = binding.anchorProps;
  return <>{cloneElement(input, {
    ...anchor,
    onFocus: (event) => { input.props.onFocus?.(event); if (!event.isPropagationStopped()) anchor.onFocus?.(event); },
    onBlur: (event) => { input.props.onBlur?.(event); if (!event.isPropagationStopped()) anchor.onBlur?.(event); },
    onPointerEnter: (event) => { input.props.onPointerEnter?.(event); if (!event.isPropagationStopped()) anchor.onPointerEnter?.(event); },
    onPointerLeave: (event) => { input.props.onPointerLeave?.(event); if (!event.isPropagationStopped()) anchor.onPointerLeave?.(event); },
    onPointerDown: (event) => { input.props.onPointerDown?.(event); if (!event.isPropagationStopped()) anchor.onPointerDown?.(event); },
    onPointerMove: (event) => { input.props.onPointerMove?.(event); if (!event.isPropagationStopped()) anchor.onPointerMove?.(event); },
    onPointerUp: (event) => { input.props.onPointerUp?.(event); if (!event.isPropagationStopped()) anchor.onPointerUp?.(event); },
    onPointerCancel: (event) => { input.props.onPointerCancel?.(event); if (!event.isPropagationStopped()) anchor.onPointerCancel?.(event); },
  })}{binding.tooltip}</>;
}

export function NSESlider({ controlSize = "regular", length, thumbMaterial = "standard", wraps: _wraps, value, defaultValue, minimum: suppliedMinimum, maximum: suppliedMaximum, min, max, step = 1, orientation = "horizontal", dir, disabled, readOnly, ticks, detents, detentThreshold = step * 2, name, id, className, label, tooltip, undoManager, onValueChange, onChanging, onChange, style, ...props }: NSESliderProps) {
  const feedback = useNSEFeedback();
  // The value tooltip needs the app's tooltip host; without one the slider
  // still works, its value spoken by the input alone.
  const tooltips = useOptionalNSETooltipProvider();

  const minimum = suppliedMinimum ?? min ?? 0;
  const maximum = suppliedMaximum ?? max ?? 100;
  const controlled = value !== undefined;
  const phasedCallbacks = suppliedMinimum !== undefined || suppliedMaximum !== undefined || orientation !== "horizontal" || readOnly !== undefined || ticks !== undefined || tooltip !== undefined || undoManager !== undefined;
  const [stored, setStored] = useState(defaultValue ?? minimum);
  const [dragging, setDragging] = useState(false);
  const resolvedValue = value ?? stored;
  const active = useRef(false);
  const enteredDetent = useRef<number | null>(null);
  const latest = useRef(resolvedValue);
  const opening = useRef(resolvedValue);
  const callback = useRef(onValueChange);
  callback.current = onValueChange;
  if (!active.current) latest.current = resolvedValue;
  const emit = (next: number, phase: "preview" | "commit") => {
    if (!controlled) setStored(next);
    if (phasedCallbacks) (onValueChange as ((value: number, phase: "preview" | "commit") => void) | undefined)?.(next, phase);
    else (onValueChange as ((value: number) => void) | undefined)?.(next);
    if (phase === "preview") onChanging?.(next); else onChange?.(next);
  };
  callback.current = emit;
  const commitValue = (previous: number, next: number) => {
    if (!undoManager || previous === next || undoManager.isExecuting) { callback.current?.(next, "commit"); return; }
    commitUndoableValue({
      manager: undoManager,
      name: "Change Slider",
      previous,
      next,
      publish: (value) => { callback.current?.(value, "commit"); },
    });
  };

  const commit = () => {
    if (!active.current) return;
    active.current = false;
    enteredDetent.current = null;
    setDragging(false);
    commitValue(opening.current, latest.current);
  };

  useEffect(() => {
    if (disabled) commit();
    return commit;
  }, [disabled]);

  const move = (delta: number) => {
    if (disabled || readOnly) return;
    const next = snap(resolvedValue + delta, minimum, maximum, step);
    if (next !== resolvedValue) commitValue(resolvedValue, next);
  };
  const inlineDirection = dir === "rtl" ? -1 : 1;

  const snapValue = (input: number) => ticks?.length ? [...ticks].sort((first, second) => Math.abs(first - input) - Math.abs(second - input) || first - second)[0] : snap(input, minimum, maximum, step);
  const pointerValue = (input: number) => {
    const stepped = snapValue(input);
    if (!active.current || ticks?.length || !detents?.length) return stepped;
    const threshold = Number.isFinite(detentThreshold) ? Math.max(0, detentThreshold) : 0;
    const nearest = detents.filter((point) => Number.isFinite(point) && point >= minimum && point <= maximum)
      .map((point) => snap(point, minimum, maximum, step))
      .sort((a, b) => Math.abs(a - input) - Math.abs(b - input) || a - b)[0];
    const detent = nearest !== undefined && Math.abs(nearest - input) <= threshold ? nearest : null;
    if (detent !== enteredDetent.current) {
      enteredDetent.current = detent;
      if (detent !== null && feedback?.isSupported && feedback?.getVibrationEnabled()) void feedback?.trigger("selection", { audio: false });
    }
    return detent ?? stepped;
  };
  const sliderInput = <input
    type="range"
    role="slider"
    id={id}
    aria-label={props["aria-label"] ?? (typeof label === "string" ? label : "Slider")}
    {...props}
    aria-orientation={orientation}
    min={minimum}
    max={maximum}
    step={step}
    value={resolvedValue}
    dir={dir}
    disabled={disabled}
    aria-readonly={readOnly || undefined}
    data-nse-control="slider"
    data-orientation={orientation}
    onPointerDown={(event) => {
      if (disabled || readOnly) return;
      active.current = true;
      setDragging(true);
      opening.current = resolvedValue;
      latest.current = Number(event.currentTarget.value);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }}
    onChange={(event) => {
      if (readOnly) return;
      const next = pointerValue(Number(event.currentTarget.value));
      latest.current = next;
      if (!phasedCallbacks && !active.current) commitValue(resolvedValue, next);
      else emit(next, "preview");
    }}
    onPointerUp={commit}
    onPointerCancel={commit}
    onLostPointerCapture={commit}
    onBlur={commit}
    onKeyDown={(event) => {
      if (event.key === "ArrowUp") { event.preventDefault(); move(step); }
      else if (event.key === "ArrowDown") { event.preventDefault(); move(-step); }
      else if (event.key === "ArrowRight") { event.preventDefault(); move(step * (orientation === "horizontal" ? inlineDirection : 1)); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); move(-step * (orientation === "horizontal" ? inlineDirection : 1)); }
      else if (event.key === "Home") { event.preventDefault(); commitValue(resolvedValue, minimum); }
      else if (event.key === "End") { event.preventDefault(); commitValue(resolvedValue, maximum); }
    }}
  />;
  const sliderStyle = { ...style, ...(length !== undefined ? orientation === "vertical" ? { "--nse-control-slider-length": `${length}px` } : { inlineSize: `${length}px`, minInlineSize: 0 } : {}), "--nse-control-slider-progress": `${Math.max(0, Math.min(100, ((resolvedValue - minimum) / Math.max(1, maximum - minimum)) * 100))}%` } satisfies CSSProperties & { "--nse-control-slider-length"?: string; "--nse-control-slider-progress": string };
  return (
    <label className={["nse-control-slider", className].filter(Boolean).join(" ")} data-nse-control="slider-field" data-orientation={orientation} data-size={controlSize} data-thumb-material={thumbMaterial} data-state={disabled ? "disabled" : readOnly ? "read-only" : "ready"} data-dragging={dragging ? "true" : "false"} style={sliderStyle}>{label ? <span className="nse-control-slider-label">{label}</span> : null}
    <span className="nse-control-slider-control">
      <span className="nse-control-slider-track" aria-hidden="true"><span className="nse-control-slider-fill" /></span>
      <span className="nse-control-slider-thumb-rail" aria-hidden="true"><span className="nse-control-slider-thumb-visual">{thumbMaterial === "metal" ? <NSEMetalThumb disabled={disabled} /> : null}</span></span>
      {tooltip === undefined || !tooltips ? sliderInput : <SliderTooltipAnchor input={sliderInput} content={typeof tooltip === "function" ? tooltip(resolvedValue) : tooltip} />}
    </span>
    {ticks?.map((tick) => <i aria-hidden="true" data-nse-part="tick" key={tick} data-value={tick} />)}
    {name ? <input type="hidden" name={name} value={resolvedValue} /> : null}
    </label>
  );
}
