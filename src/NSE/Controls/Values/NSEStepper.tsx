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

import { useEffect, useRef, useState } from "react";
import { nseThemeSlot, useNSEThemeRecipe } from "../../Appearance";
import { useOptionalNSEControlRuntimePort } from "../Core";
import type { NSENumericValueContract, NSEStepperValueContract, NSEUndoManagerPort } from "./valueControlTypes";
import { commitUndoableValue } from "./valueControlTransaction";

type NumericStepperOptions = NSENumericValueContract & { readonly contract?: never };
type GenericStepperOptions<T> = { readonly contract: NSEStepperValueContract<T>; readonly minimum?: never; readonly maximum?: never; readonly step?: never; readonly wraps?: never };

export type NSEStepperProps<T = number> = (NumericStepperOptions | GenericStepperOptions<T>) & {
  readonly "aria-label": string;
  readonly value: T;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly size?: "regular" | "small" | "mini";
  readonly pageStep?: number;
  readonly name?: string;
  readonly undoManager?: NSEUndoManagerPort;
  readonly formatValue?: (value: T) => string;
  onValueChange(value: T, phase: "preview" | "commit"): void;
};

function numericContract(options: NumericStepperOptions): NSEStepperValueContract<number> {
  return {
    minimum: options.minimum,
    maximum: options.maximum,
    wraps: options.wraps,
    compare: (first, second) => first - second,
    step: (value, direction) => value + direction * options.step
  };
}

export function NSEStepper<T = number>(props: NSEStepperProps<T>) {
  const runtime = useOptionalNSEControlRuntimePort();
  const contract = (props.contract ?? numericContract(props as NumericStepperOptions)) as NSEStepperValueContract<T>;
  const propsRef = useRef(props);
  const contractRef = useRef(contract);
  const valueRef = useRef(props.value);
  const hold = useRef<{ handle: unknown | null; active: boolean; changed: boolean; direction: 1 | -1; delay: number }>({ handle: null, active: false, changed: false, direction: 1, delay: 120 });
  const suppressClick = useRef(false);
  const holdOpening = useRef(props.value);
  const [hoveredPart, setHoveredPart] = useState<"increment" | "decrement" | null>(null);
  const [pressedPart, setPressedPart] = useState<"increment" | "decrement" | null>(null);
  const [focusedPart, setFocusedPart] = useState<"increment" | "decrement" | null>(null);
  propsRef.current = props;
  contractRef.current = contract;
  if (!hold.current.active) valueRef.current = props.value;

  const clearTimer = () => {
    const scheduler = runtime?.scheduler;
    if (scheduler && hold.current.handle !== null) scheduler.clearTimeout(hold.current.handle);
    hold.current.handle = null;
  };

  const publishCommit = (previous: T, next: T) => {
    const currentProps = propsRef.current;
    const manager = currentProps.undoManager;
    if (!manager || contractRef.current.compare(previous, next) === 0 || manager.isExecuting) { currentProps.onValueChange(next, "commit"); return; }
    commitUndoableValue({
      manager,
      name: `Change ${currentProps["aria-label"]}`,
      previous,
      next,
      publish: (value) => { propsRef.current.onValueChange(value, "commit"); },
    });
  };

  const move = (direction: 1 | -1, phase: "preview" | "commit" = "commit") => {
    const currentProps = propsRef.current;
    const currentContract = contractRef.current;
    if (currentProps.disabled || currentProps.readOnly) return false;
    let next = currentContract.step(valueRef.current, direction);
    if (currentContract.compare(next, currentContract.maximum) > 0) next = currentContract.wraps ? currentContract.minimum : currentContract.maximum;
    if (currentContract.compare(next, currentContract.minimum) < 0) next = currentContract.wraps ? currentContract.maximum : currentContract.minimum;
    if (currentContract.compare(next, valueRef.current) === 0) return false;
    const previous = valueRef.current;
    valueRef.current = next;
    try {
      if (phase === "commit") publishCommit(previous, next);
      else currentProps.onValueChange(next, phase);
    } catch (error) {
      valueRef.current = previous;
      throw error;
    }
    return true;
  };

  const finishHold = () => {
    if (!hold.current.active) return;
    clearTimer();
    hold.current.active = false;
    if (hold.current.changed) publishCommit(holdOpening.current, valueRef.current);
    hold.current.changed = false;
  };

  const scheduleRepeat = (delay: number) => {
    const scheduler = runtime?.scheduler;
    if (!scheduler || !hold.current.active) return;
    hold.current.handle = scheduler.setTimeout(() => {
      hold.current.handle = null;
      if (!hold.current.active || runtime?.signal.aborted) return;
      hold.current.changed = move(hold.current.direction, "preview") || hold.current.changed;
      hold.current.delay = Math.max(40, hold.current.delay - 10);
      scheduleRepeat(hold.current.delay);
    }, delay);
  };

  useEffect(() => {
    const signal = runtime?.signal;
    if (!signal) return;
    const abort = () => finishHold();
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    return () => {
      signal.removeEventListener("abort", abort);
      finishHold();
    };
  }, [runtime]);

  useEffect(() => {
    if (props.disabled || props.readOnly) finishHold();
  }, [props.disabled, props.readOnly]);

  const startHold = (direction: 1 | -1, event: React.PointerEvent<HTMLButtonElement>) => {
    if (!runtime?.scheduler || runtime.signal.aborted || props.disabled || props.readOnly) return;
    finishHold();
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    valueRef.current = props.value;
    holdOpening.current = props.value;
    hold.current = { handle: null, active: true, changed: move(direction, "preview"), direction, delay: 120 };
    suppressClick.current = true;
    scheduleRepeat(400);
  };

  const click = (direction: 1 | -1) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    valueRef.current = props.value;
    move(direction, "commit");
  };

  const setBoundary = (boundary: "minimum" | "maximum") => {
    if (props.disabled || props.readOnly) return;
    const next = contract[boundary];
    if (contract.compare(next, valueRef.current) !== 0) publishCommit(valueRef.current, next);
  };

  const appearanceStateFor = (part: "increment" | "decrement") => {
    if (props.disabled) return "disabled";
    if (pressedPart === part) return "pressed";
    if (focusedPart === part) return "focused";
    if (hoveredPart === part) return "hover";
    return "normal";
  };
  const incrementAppearance = useNSEThemeRecipe(
    nseThemeSlot("stepper", "increment", appearanceStateFor("increment")),
  );
  const decrementAppearance = useNSEThemeRecipe(
    nseThemeSlot("stepper", "decrement", appearanceStateFor("decrement")),
  );
  const endPresentation = (part: "increment" | "decrement") => {
    setPressedPart((current) => current === part ? null : current);
    finishHold();
  };

  return (
    <span role="spinbutton" aria-label={props["aria-label"]} aria-valuenow={typeof props.value === "number" ? props.value : undefined} aria-valuetext={props.formatValue?.(props.value)} tabIndex={props.disabled ? -1 : 0} data-nse-control="stepper" data-state={props.disabled ? "disabled" : props.readOnly ? "read-only" : "ready"} data-size={props.size ?? "regular"} {...incrementAppearance.attributes} onKeyDown={(event) => {
      if (event.key === "ArrowUp" || event.key === "ArrowRight") { event.preventDefault(); valueRef.current = props.value; move(1); }
      else if (event.key === "ArrowDown" || event.key === "ArrowLeft") { event.preventDefault(); valueRef.current = props.value; move(-1); }
      else if ((event.key === "PageUp" || event.key === "PageDown") && typeof props.value === "number" && !props.contract) { event.preventDefault(); const direction = event.key === "PageUp" ? 1 : -1; const next = Math.max((props as NumericStepperOptions).minimum, Math.min((props as NumericStepperOptions).maximum, props.value + direction * (props.pageStep ?? (props as NumericStepperOptions).step * 10))); publishCommit(props.value, next as T); }
      else if (event.key === "Home") { event.preventDefault(); setBoundary("minimum"); }
      else if (event.key === "End") { event.preventDefault(); setBoundary("maximum"); }
    }}>
      <button type="button" aria-label={`Increment ${props["aria-label"]}`} data-nse-part="increment" tabIndex={-1} disabled={props.disabled} {...incrementAppearance.attributes} onFocus={() => setFocusedPart("increment")} onBlur={() => { setFocusedPart((current) => current === "increment" ? null : current); endPresentation("increment"); }} onPointerEnter={() => setHoveredPart("increment")} onPointerLeave={() => setHoveredPart((current) => current === "increment" ? null : current)} onPointerDown={(event) => { setPressedPart("increment"); startHold(1, event); }} onPointerUp={() => endPresentation("increment")} onPointerCancel={() => endPresentation("increment")} onLostPointerCapture={() => endPresentation("increment")} onClick={() => click(1)}>+</button>
      <button type="button" aria-label={`Decrement ${props["aria-label"]}`} data-nse-part="decrement" tabIndex={-1} disabled={props.disabled} {...decrementAppearance.attributes} onFocus={() => setFocusedPart("decrement")} onBlur={() => { setFocusedPart((current) => current === "decrement" ? null : current); endPresentation("decrement"); }} onPointerEnter={() => setHoveredPart("decrement")} onPointerLeave={() => setHoveredPart((current) => current === "decrement" ? null : current)} onPointerDown={(event) => { setPressedPart("decrement"); startHold(-1, event); }} onPointerUp={() => endPresentation("decrement")} onPointerCancel={() => endPresentation("decrement")} onLostPointerCapture={() => endPresentation("decrement")} onClick={() => click(-1)}>−</button>
      {props.name ? <input type="hidden" name={props.name} value={String(props.value)} /> : null}
    </span>
  );
}
