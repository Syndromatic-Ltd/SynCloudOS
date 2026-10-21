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

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { NSEClockView } from "../Calendar";
import type { NSEPlainDate, NSEPlainTime } from "../dateTimeTypes";
import type { NSETimePickerEditorMode, NSETimePickerProps } from "./datePickerTypes";
import { nseThemeSlot, useNSEThemeRecipe } from "../../Appearance";
import { NSEPushButton } from "../../Controls/Buttons/NSEButtons";
import { NSEStepper } from "../../Controls/Values/NSEStepper";
import { NSEChoiceControl } from "../../Menus/NSEChoiceControl";
import { NSEPopover, useOptionalNSEOverlayProvider } from "../../Overlays";

export const serializePlainTime = (value: NSEPlainTime | null) => value ? `${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}:${String(value.second).padStart(2, "0")}` : "";

const range = (minimum: number, maximum: number) => {
  const values: number[] = [];
  for (let value = minimum; value <= maximum; value += 1) values.push(value);
  return values;
};

const totalSeconds = (value: NSEPlainTime) => value.hour * 3600 + value.minute * 60 + value.second;
const fromSeconds = (value: number): NSEPlainTime => ({ hour: Math.floor(value / 3600), minute: Math.floor(value % 3600 / 60), second: value % 60 });

const timePartOrder = (locale: string): readonly ("hour" | "minute")[] => {
  try {
    const parts = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "numeric", timeZone: "UTC" })
      .formatToParts(Date.UTC(2026, 10, 22, 13, 45))
      .map((part) => part.type)
      .filter((part): part is "hour" | "minute" => part === "hour" || part === "minute");
    const unique = [...new Set(parts)];
    return unique.length === 2 ? unique : ["hour", "minute"];
  } catch {
    return ["hour", "minute"];
  }
};

const minuteValuesForHour = (hour: number, activeMinute: number | undefined, minimum: NSEPlainTime, maximum: NSEPlainTime, step: number) => {
  const effectiveMinimum = hour === minimum.hour ? minimum.minute : 0;
  const effectiveMaximum = hour === maximum.hour ? maximum.minute : 59;
  const values = range(effectiveMinimum, effectiveMaximum).filter((minute) => (minute - effectiveMinimum) % step === 0);
  if (activeMinute !== undefined && activeMinute >= effectiveMinimum && activeMinute <= effectiveMaximum && !values.includes(activeMinute)) values.push(activeMinute);
  return values.sort((left, right) => left - right);
};

const nearestMinuteForHour = (hour: number, minute: number, minimum: NSEPlainTime, maximum: NSEPlainTime, step: number) => {
  const values = minuteValuesForHour(hour, undefined, minimum, maximum, step);
  return values.reduce((nearest, candidate) => Math.abs(candidate - minute) < Math.abs(nearest - minute) ? candidate : nearest, values[0] ?? 0);
};

interface NSEInlineSelectProps {
  readonly label: string;
  readonly value: number | string;
  readonly values: readonly (number | string)[];
  readonly disabled: boolean;
  readonly format?: (value: number | string) => string;
  onChange(value: string): void;
}

function NSEInlineSelect({ label, value, values, disabled, format, onChange }: NSEInlineSelectProps) {
  return <NSEChoiceControl className="nse-extended-inline-picker" label={label} labelHidden value={String(value)} disabled={disabled}
    options={values.map((option) => ({ id: String(option), label: format?.(option) ?? String(option) }))} onChange={onChange} />;
}

type NSETimeSegment = "hour" | "minute" | "ampm";

interface NSETimeSegmentEditorProps {
  readonly value: NSEPlainTime | null;
  readonly fallback: NSEPlainTime;
  readonly minimum: NSEPlainTime;
  readonly maximum: NSEPlainTime;
  readonly locale: string;
  readonly hourCycle: "h12" | "h24";
  readonly minuteStep: number;
  readonly label: string;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  onCommit(value: NSEPlainTime): void;
}

function NSETimeSegmentEditor({
  value,
  fallback,
  minimum,
  maximum,
  locale,
  hourCycle,
  minuteStep,
  label,
  disabled,
  readOnly,
  onCommit,
}: NSETimeSegmentEditorProps) {
  const active = value ?? fallback;
  const parts = timePartOrder(locale);
  const validHours = range(minimum.hour, maximum.hour);
  const period: "am" | "pm" = active.hour < 12 ? "am" : "pm";
  const displayHour = hourCycle === "h12" ? active.hour % 12 || 12 : active.hour;
  const hourValues = hourCycle === "h12"
    ? validHours.filter((hour) => hour < 12 === (period === "am")).map((hour) => hour % 12 || 12)
    : validHours;
  const periodValues = (["am", "pm"] as const).filter((nextPeriod) => validHours.some((hour) => hour < 12 === (nextPeriod === "am")));
  const hourForPeriod = (nextPeriod: "am" | "pm") => {
    const available = validHours.filter((hour) => hour < 12 === (nextPeriod === "am"));
    return available.find((hour) => (hour % 12 || 12) === displayHour) ?? available[0] ?? active.hour;
  };
  const minuteValues = minuteValuesForHour(active.hour, active.minute, minimum, maximum, minuteStep);
  const commitHour = (nextHour: number) => onCommit({
    ...active,
    hour: nextHour,
    minute: minuteValuesForHour(nextHour, active.minute, minimum, maximum, minuteStep).includes(active.minute)
      ? active.minute
      : nearestMinuteForHour(nextHour, active.minute, minimum, maximum, minuteStep),
  });
  const editors: Record<NSETimeSegment, ReactNode> = {
    hour: <NSEInlineSelect key="hour" label="Hour" value={displayHour} values={hourValues} disabled={disabled || readOnly} onChange={(hour) => commitHour(hourCycle === "h12" ? Number(hour) % 12 + (period === "pm" ? 12 : 0) : Number(hour))} />,
    minute: <NSEInlineSelect key="minute" label="Minute" value={active.minute} values={minuteValues} disabled={disabled || readOnly} format={(minute) => String(minute).padStart(2, "0")} onChange={(minute) => onCommit({ ...active, minute: Number(minute) })} />,
    ampm: <NSEInlineSelect key="ampm" label="AM/PM" value={period} values={periodValues} disabled={disabled || readOnly} format={(next) => String(next).toUpperCase()} onChange={(next) => commitHour(hourForPeriod(next as "am" | "pm"))} />,
  };
  const fieldOrder: readonly NSETimeSegment[] = hourCycle === "h12" ? [...parts, "ampm"] : parts;

  return (
    <span role="group" aria-label={label} data-value={serializePlainTime(active)} data-locale-order={parts.join("-")} data-hour-mode={hourCycle === "h12" ? "12" : "24"} data-field-editor="segments">
      {fieldOrder.map((part) => editors[part])}
    </span>
  );
}


/** The locale's hour/minute separator (":" for most, "." for some). */
const timeSeparator = (locale: string) => {
  try {
    const parts = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).formatToParts(Date.UTC(2026, 10, 22, 13, 45));
    const hour = parts.findIndex((part) => part.type === "hour");
    const literal = parts[hour + 1];
    return literal?.type === "literal" && parts[hour + 2]?.type === "minute" ? literal.value : ":";
  } catch {
    return ":";
  }
};

const dayPeriodLabels = (locale: string) => {
  const format = new Intl.DateTimeFormat(locale, { hour: "numeric", hourCycle: "h12", timeZone: "UTC" });
  const label = (hour: number) => format.formatToParts(Date.UTC(2026, 0, 1, hour)).find((part) => part.type === "dayPeriod")?.value ?? (hour < 12 ? "AM" : "PM");
  return { am: label(9), pm: label(15) };
};

interface NSETimeFieldEditorProps {
  readonly value: NSEPlainTime;
  readonly minimum: NSEPlainTime;
  readonly maximum: NSEPlainTime;
  readonly locale: string;
  readonly timeZone: string;
  readonly date?: NSEPlainDate;
  readonly hourCycle: "h12" | "h24";
  readonly minuteStep: number;
  readonly label: string;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly parentResponderId?: string;
  onChange(value: NSEPlainTime, phase: "preview" | "commit"): void;
}

/**
 * AppKit's NSTextFieldAndStepperDatePickerStyle for time: hour and minute
 * (and a day period on 12-hour clocks) as keyboard segments, a stepper that
 * steps the segment last focused, and the analogue clock in a popover.
 */
function NSETimeFieldEditor({ value, minimum, maximum, locale, timeZone, date, hourCycle, minuteStep, label, disabled, readOnly, parentResponderId, onChange }: NSETimeFieldEditorProps) {
  const [segment, setSegment] = useState<NSETimeSegment>("minute");
  const [open, setOpen] = useState(false);
  const typed = useRef<{ segment: NSETimeSegment; text: string } | null>(null);
  const clockButton = useRef<HTMLButtonElement>(null);
  const segmentRefs = useRef(new Map<NSETimeSegment, HTMLElement>());
  const overlay = useOptionalNSEOverlayProvider();
  const instanceId = useId().replace(/:/g, "");
  const inert = disabled || readOnly;
  const minutes = value.hour * 60 + value.minute;
  const lowest = minimum.hour * 60 + minimum.minute;
  const highest = maximum.hour * 60 + maximum.minute;
  const clamp = (total: number) => Math.max(lowest, Math.min(highest, total));
  const commit = (total: number, phase: "preview" | "commit" = "commit") => {
    if (inert) return;
    const next = clamp(total);
    onChange({ hour: Math.floor(next / 60), minute: next % 60, second: 0 }, phase);
  };
  const periods = dayPeriodLabels(locale);
  const displayHour = hourCycle === "h12" ? value.hour % 12 || 12 : value.hour;
  const order: readonly NSETimeSegment[] = hourCycle === "h12" ? [...timePartOrder(locale), "ampm"] : timePartOrder(locale);
  // Segments step within their own unit, as AppKit's do: minutes wrap inside
  // the hour and hours inside the day; the result is then held to the bounds.
  const step = (part: NSETimeSegment, direction: 1 | -1) => {
    if (part === "hour") commit(((value.hour + direction + 24) % 24) * 60 + value.minute);
    else if (part === "minute") commit(value.hour * 60 + ((value.minute + direction * minuteStep + 60) % 60));
    else commit((minutes + 720) % 1440);
  };
  const move = (from: NSETimeSegment, direction: 1 | -1) => {
    const next = order[order.indexOf(from) + direction];
    if (next) segmentRefs.current.get(next)?.focus();
  };
  const type = (part: NSETimeSegment, digit: string) => {
    const buffer = typed.current?.segment === part ? typed.current.text + digit : digit;
    const number = Number(buffer);
    if (part === "minute") {
      commit(value.hour * 60 + Math.min(59, number));
      typed.current = buffer.length >= 2 || number > 5 ? null : { segment: part, text: buffer };
      if (!typed.current) move(part, 1);
      return;
    }
    const top = hourCycle === "h12" ? 12 : 23;
    const hour = Math.min(top, number);
    const hour24 = hourCycle === "h12" ? (hour % 12) + (value.hour >= 12 ? 12 : 0) : hour;
    commit(hour24 * 60 + value.minute);
    typed.current = buffer.length >= 2 || number * 10 > top ? null : { segment: part, text: buffer };
    if (!typed.current) move(part, 1);
  };
  const keyDown = (part: NSETimeSegment) => (event: KeyboardEvent<HTMLElement>) => {
    if (inert) return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); typed.current = null; step(part, event.key === "ArrowUp" ? 1 : -1); }
    else if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); typed.current = null; move(part, event.key === "ArrowRight" ? 1 : -1); }
    else if (part !== "ampm" && /^\d$/.test(event.key)) { event.preventDefault(); type(part, event.key); }
    else if (part === "ampm" && /^[ap]$/i.test(event.key)) { event.preventDefault(); const pm = event.key.toLowerCase() === "p"; if (pm !== value.hour >= 12) step("ampm", 1); }
  };
  const segmentProps = (part: NSETimeSegment, now: number, min: number, max: number, text: string, name: string) => ({
    ref: (node: HTMLElement | null) => { if (node) segmentRefs.current.set(part, node); else segmentRefs.current.delete(part); },
    role: "spinbutton" as const,
    tabIndex: disabled ? -1 : 0,
    "aria-label": name,
    "aria-valuenow": now,
    "aria-valuemin": min,
    "aria-valuemax": max,
    "aria-valuetext": text,
    "aria-disabled": disabled || undefined,
    "aria-readonly": readOnly || undefined,
    "data-nse-part": `${part}-segment`,
    onFocus: () => { setSegment(part); typed.current = null; },
    onKeyDown: keyDown(part),
  });
  const segments: Record<NSETimeSegment, ReactNode> = {
    hour: <span key="hour" {...segmentProps("hour", displayHour, hourCycle === "h12" ? 1 : 0, hourCycle === "h12" ? 12 : 23, String(displayHour), "Hour")}>{hourCycle === "h12" ? String(displayHour) : String(displayHour).padStart(2, "0")}</span>,
    minute: <span key="minute" {...segmentProps("minute", value.minute, 0, 59, String(value.minute).padStart(2, "0"), "Minute")}>{String(value.minute).padStart(2, "0")}</span>,
    ampm: <span key="ampm" {...segmentProps("ampm", value.hour >= 12 ? 1 : 0, 0, 1, value.hour >= 12 ? periods.pm : periods.am, "AM/PM")}>{value.hour >= 12 ? periods.pm : periods.am}</span>,
  };
  const separator = timeSeparator(locale);
  const stepSize = segment === "hour" ? 60 : segment === "ampm" ? 720 : minuteStep;
  const titleId = `time-field-clock-${instanceId}`;
  return (
    <span role="group" aria-label={label} data-field-editor="field" data-value={serializePlainTime(value)}>
      <span data-nse-part="segments">
        {order.flatMap((part, index) => {
          const nodes: ReactNode[] = [];
          if (index > 0) nodes.push(<span key={`gap-${part}`} data-nse-part={part === "ampm" ? "period-gap" : "separator"} aria-hidden="true">{part === "ampm" ? " " : separator}</span>);
          nodes.push(segments[part]);
          return nodes;
        })}
      </span>
      <NSEStepper size="small" aria-label={`Step ${label.toLowerCase()} ${segment === "ampm" ? "AM/PM" : segment}`} value={minutes} minimum={lowest} maximum={highest} step={stepSize} disabled={disabled} readOnly={readOnly} formatValue={(total) => `${String(Math.floor(total / 60)).padStart(2, "0")}${separator}${String(total % 60).padStart(2, "0")}`} onValueChange={(total, phase) => commit(total, phase)} />
      {overlay ? <button ref={clockButton} type="button" data-nse-part="clock-affix" aria-label={`Show ${label.toLowerCase()} clock`} aria-expanded={open} disabled={inert} onClick={() => setOpen(true)} /> : null}
      {overlay ? <NSEPopover id={`time-field-${instanceId}`} open={open} anchor={clockButton.current} parentWindowControllerId="time-picker-window" parentResponderId={parentResponderId} presentation={{ mode: "automatic" }} surface="overlay" labelledBy={titleId} onOpenChange={(next) => { if (!next) { setOpen(false); queueMicrotask(() => clockButton.current?.focus({ preventScroll: true })); } }}>
        <section data-nse-part="clock-sheet"><h2 id={titleId} className="nse-control-visually-hidden">{label} clock</h2>
          <NSEClockView aria-label={label} locale={locale} timeZone={timeZone} date={date ?? { year: 1970, month: 1, day: 1 }} value={value} disabled={inert} minuteStep={minuteStep} hourCycle={hourCycle} onValueChange={(next, phase) => commit(next.hour * 60 + next.minute, phase)} />
        </section>
      </NSEPopover> : null}
    </span>
  );
}

export function NSETimePicker({
  value, defaultValue = null, onValueChange,
  name, editor: requestedEditor, locale, timeZone, date, minimum: requestedMinimum, maximum: requestedMaximum, minuteStep: requestedMinuteStep, hourCycle: requestedHourCycle, disabled, readOnly, required, renderEditor, parentResponderId,
  "aria-label": label, onFocusCapture, onBlurCapture, ...hostProps
}: NSETimePickerProps) {
  const controlled = value !== undefined;
  const [stored, setStored] = useState(defaultValue);
  const [focused, setFocused] = useState(false);
  const current = controlled ? value : stored;
  const hiddenRef = useRef<HTMLInputElement>(null);
  const minimum = requestedMinimum ?? { hour: 0, minute: 0, second: 0 };
  const maximum = requestedMaximum ?? { hour: 23, minute: 59, second: 59 };
  const fallback = requestedMinimum ?? { hour: 0, minute: 0, second: 0 };
  const normalise = (next: NSEPlainTime) => {
    const minimumSeconds = totalSeconds(minimum);
    const maximumSeconds = totalSeconds(maximum);
    return fromSeconds(Math.max(minimumSeconds, Math.min(maximumSeconds, totalSeconds(next))));
  };
  const change = (next: NSEPlainTime | null, phase: "preview" | "commit") => {
    if (disabled || readOnly || (!next && required)) return;
    const normal = next ? normalise(next) : null;
    if (!controlled) setStored(normal);
    onValueChange?.(normal, phase);
  };
  useEffect(() => {
    const form = hiddenRef.current?.form;
    if (!form || controlled) return;
    const reset = () => setStored(defaultValue);
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [controlled, defaultValue]);
  const localeHourCycle = new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hourCycle;
  const hourCycle = requestedHourCycle ?? (localeHourCycle === "h11" || localeHourCycle === "h12" ? "h12" : "h24");
  const minuteStep = Math.max(1, Math.min(60, Math.floor(requestedMinuteStep ?? 1)));
  const editorMode: NSETimePickerEditorMode = requestedEditor ?? "field";
  const customEditor = renderEditor?.({ value: current, disabled: Boolean(disabled), readOnly: Boolean(readOnly), commit: (next) => change(next, "commit") });
  const editor = customEditor ?? (editorMode === "segments" ? (
    <NSETimeSegmentEditor
      value={current}
      fallback={fallback}
      minimum={minimum}
      maximum={maximum}
      locale={locale}
      hourCycle={hourCycle}
      minuteStep={minuteStep}
      label={label}
      disabled={Boolean(disabled)}
      readOnly={Boolean(readOnly)}
      onCommit={(next) => change(next, "commit")}
    />
  ) : current && editorMode === "field" ? (
    <NSETimeFieldEditor value={current} minimum={minimum} maximum={maximum} locale={locale} timeZone={timeZone} date={date} hourCycle={hourCycle} minuteStep={minuteStep} label={label} disabled={Boolean(disabled)} readOnly={Boolean(readOnly)} parentResponderId={parentResponderId} onChange={change} />
  ) : current ? (
    <NSEClockView aria-label={label} locale={locale} timeZone={timeZone} date={date ?? { year: 1970, month: 1, day: 1 }} value={current} disabled={disabled || readOnly} minuteStep={minuteStep} hourCycle={hourCycle} onValueChange={change} />
  ) : (
    <NSEPushButton tone="light" disabled={disabled || readOnly} aria-label={`Set ${label.toLowerCase()}`} onClick={() => change(minimum, "commit")}>Set time</NSEPushButton>
  ));
  const appearanceState = disabled ? "disabled" : focused ? "focused" : "normal";
  const appearance = useNSEThemeRecipe(nseThemeSlot("time-picker", "select", appearanceState));
  return (
    <span {...hostProps} data-nse-control="time-picker" data-state={disabled ? "disabled" : current ? "ready" : "empty"} data-hour-mode={hourCycle === "h12" ? "12" : "24"} data-editor={editorMode} {...appearance.attributes} onFocusCapture={(event) => { setFocused(true); onFocusCapture?.(event); }} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); onBlurCapture?.(event); }}>
      {editor}
      <input ref={hiddenRef} type="hidden" {...(name ? { name: name } : {})} value={serializePlainTime(current ?? null)} />
    </span>
  );
}
