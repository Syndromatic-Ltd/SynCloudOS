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

import { useRef } from "react";
import { NSEChoiceControl } from "../../Menus/NSEChoiceControl";
import { NSETextField } from "../../Controls/Fields/NSEFields";
import { nseAppearanceSlot, useNSEAppearanceSlot } from "../../Appearance";
import { resolveZonedDateTime } from "../calendarArithmetic";
import type { NSEPlainTime } from "../dateTimeTypes";
import type { NSEClockViewProps } from "./calendarTypes";

export function NSEClockView({ value, date, timeZone, disambiguation = "reject", showSeconds, disabled, showValidationMessage = true, minuteStep = 1, hourCycle = "h24", onValueChange, ...props }: NSEClockViewProps) {
  const pointer = useRef<{ pointerId: number; opening: NSEPlainTime; latest: NSEPlainTime } | null>(null);
  const resolution = resolveZonedDateTime({ date, time: value }, timeZone, disambiguation);
  const update = (field: keyof NSEPlainTime, amount: number) => {
    const limits = { hour: 24, minute: 60, second: 60 };
    const increment = field === "minute" ? Math.max(1, Math.min(60, Math.floor(minuteStep))) : 1;
    const next = { ...value, [field]: (value[field] + amount * increment + limits[field]) % limits[field] };
    onValueChange(next, "commit");
  };
  const field = (label: string, name: keyof NSEPlainTime, max: number) => <NSETextField key={name} controlSize="small" data-nse-part={`${name}-field`} label={label} type="number" inputMode="numeric" aria-label={label} min={name === "hour" && hourCycle === "h12" ? 1 : 0} max={name === "hour" && hourCycle === "h12" ? 12 : max} step={name === "minute" ? minuteStep : 1} value={String(name === "hour" && hourCycle === "h12" ? value.hour % 12 || 12 : value[name])} disabled={disabled} onChange={(event) => { const raw = Number(event.currentTarget.value); const next = name === "hour" && hourCycle === "h12" ? raw % 12 + (value.hour >= 12 ? 12 : 0) : raw; onValueChange({ ...value, [name]: next }, "preview"); }} onBlur={(event) => { const raw = Number(event.currentTarget.value); const next = name === "hour" && hourCycle === "h12" ? raw % 12 + (value.hour >= 12 ? 12 : 0) : raw; onValueChange({ ...value, [name]: next }, "commit"); }} onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); update(name, event.key === "ArrowUp" ? 1 : -1); } }} />;
  const timeFromPointer = (element: HTMLElement, clientX: number, clientY: number): NSEPlainTime => {
    const bounds = element.getBoundingClientRect();
    const x = clientX - (bounds.left + bounds.width / 2);
    const y = clientY - (bounds.top + bounds.height / 2);
    const angle = (Math.atan2(y, x) * 180 / Math.PI + 450) % 360;
    const radius = Math.hypot(x, y);
    const outer = radius >= Math.min(bounds.width, bounds.height) * 0.34;
    return outer
      ? { ...value, minute: Math.round(angle / 6) % 60 }
      : { ...value, hour: Math.round(angle / 30) % 12 + (value.hour >= 12 ? 12 : 0) };
  };
  const hourRotation = (value.hour % 12) * 30 + value.minute * 0.5 + value.second / 120;
  const minuteRotation = value.minute * 6 + value.second * 0.1;
  const secondRotation = value.second * 6;
  const appearance = useNSEAppearanceSlot(nseAppearanceSlot("clock-view", "face", disabled ? "disabled" : "normal"));
  return <section aria-label={props["aria-label"]} data-nse-control="clock" data-state={resolution.kind} data-disabled={disabled ? "true" : "false"} data-motion={props.reducedMotion ? "reduced" : "full"} {...appearance.attributes}>
    <div role="img" aria-label="Analogue clock" data-nse-part="face" tabIndex={disabled ? -1 : 0} {...appearance.attributes}
      onPointerDown={(event) => { if (disabled) return; const latest = timeFromPointer(event.currentTarget, event.clientX, event.clientY); pointer.current = { pointerId: event.pointerId, opening: value, latest }; event.currentTarget.setPointerCapture?.(event.pointerId); onValueChange(latest, "preview"); }}
      onPointerMove={(event) => { const active = pointer.current; if (!active || active.pointerId !== event.pointerId || disabled) return; const latest = timeFromPointer(event.currentTarget, event.clientX, event.clientY); pointer.current = { ...active, latest }; onValueChange(latest, "preview"); }}
      onPointerUp={(event) => { const active = pointer.current; if (!active || active.pointerId !== event.pointerId) return; const latest = timeFromPointer(event.currentTarget, event.clientX, event.clientY); pointer.current = null; event.currentTarget.releasePointerCapture?.(event.pointerId); onValueChange(latest, "commit"); }}
      onPointerCancel={(event) => { const active = pointer.current; if (!active || active.pointerId !== event.pointerId) return; pointer.current = null; onValueChange(active.opening, "preview"); }}
      onLostPointerCapture={(event) => { const active = pointer.current; if (!active || active.pointerId !== event.pointerId) return; pointer.current = null; onValueChange(active.opening, "preview"); }}>
      <i data-nse-part="hour-hand" style={{ transform: `rotate(${hourRotation}deg)`, blockSize: 32, inlineSize: 4 }} /><i data-nse-part="minute-hand" style={{ transform: `rotate(${minuteRotation}deg)`, blockSize: 46, inlineSize: 2 }} />{showSeconds ? <i data-nse-part="second-hand" style={{ transform: `rotate(${secondRotation}deg)`, blockSize: 50, inlineSize: 2 }} /> : null}<i data-nse-part="centre" />
    </div>
    <div data-nse-part="numeric">{field("Hour", "hour", 23)}{field("Minute", "minute", 59)}{showSeconds ? field("Second", "second", 59) : null}{hourCycle === "h12" ? <NSEChoiceControl label="AM/PM" value={value.hour >= 12 ? "pm" : "am"} disabled={disabled} options={[{ id: "am", label: "AM" }, { id: "pm", label: "PM" }]} onChange={(period) => onValueChange({ ...value, hour: value.hour % 12 + (period === "pm" ? 12 : 0) }, "commit")} /> : null}</div>
    {showValidationMessage && resolution.kind === "nonexistent" ? <span role="alert">This local time does not exist in {timeZone}.</span> : showValidationMessage && resolution.kind === "ambiguous" ? <span role="alert">This local time occurs twice in {timeZone}.</span> : null}
  </section>;
}
