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

import { useEffect, useId, useReducer, useRef, useState } from "react";
import { NSEPopover, useOptionalNSEOverlayProvider } from "../../Overlays";
import { NSECalendarView, type NSECalendarSelection } from "../Calendar";
import { comparePlainDates, validateDateRange } from "../calendarArithmetic";
import { formatPlainDate, parsePlainDate, plainDatePlaceholder, plainDateToday } from "../dateTimeFormatting";
import type { NSECalendarMonth, NSEDateRange } from "../dateTimeTypes";
import type { NSEDateRangePickerProps } from "./datePickerTypes";
import { createPickerTransaction, reducePickerTransaction } from "./pickerTransaction";
import { NSEPushButton } from "../../Controls/Buttons/NSEButtons";
import { NSETextField } from "../../Controls/Fields/NSEFields";
import { civilToEpochDay } from "../calendarArithmetic";

const serialise = (value: NSEDateRange | null) => value ? `${String(value.start.year).padStart(4,"0")}-${String(value.start.month).padStart(2,"0")}-${String(value.start.day).padStart(2,"0")}/${String(value.end.year).padStart(4,"0")}-${String(value.end.month).padStart(2,"0")}-${String(value.end.day).padStart(2,"0")}` : "";
/** The trigger's display: the locale's range format, e.g. "28–30 Mar 2026". */
const displayRange = (value: NSEDateRange, locale: string) => {
  const format = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC", calendar: "gregory" });
  const start = civilToEpochDay(value.start) * 86_400_000, end = civilToEpochDay(value.end) * 86_400_000;
  return typeof format.formatRange === "function" ? format.formatRange(start, end) : `${format.format(start)} – ${format.format(end)}`;
};
const sameRange = (left: NSEDateRange | null, right: NSEDateRange | null) => left === right || Boolean(left && right && comparePlainDates(left.start, right.start) === 0 && comparePlainDates(left.end, right.end) === 0);

export function NSEDateRangePicker({ value, defaultValue = null, onValueChange, ...props }: NSEDateRangePickerProps) {
  const controlled = value !== undefined;
  const [stored, setStored] = useState(defaultValue);
  const current = controlled ? value : stored;
  const [transaction, dispatchTransaction] = useReducer(reducePickerTransaction<NSEDateRange | null>, current, createPickerTransaction);
  const draft = transaction.draft;
  const open = transaction.open;
  const [startText, setStartText] = useState(draft ? formatPlainDate(draft.start, props.locale) : "");
  const [endText, setEndText] = useState(draft ? formatPlainDate(draft.end, props.locale) : "");
  const [invalid, setInvalid] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState<NSECalendarMonth>(() => { const seed = current?.start ?? props.minimum ?? plainDateToday(props.timeZone); return { year: seed.year, month: seed.month }; });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hostRef = useRef<HTMLElement>(null);
  const selectionStartRef = useRef<NSEDateRange["start"] | null>(null);
  const lastPublishedRef = useRef<NSEDateRange | null | undefined>(undefined);
  const instanceId = useId().replace(/:/g, "");
  const overlay = useOptionalNSEOverlayProvider();

  useEffect(() => {
    if (!controlled) return;
    if (lastPublishedRef.current !== undefined && sameRange(current, lastPublishedRef.current)) {
      lastPublishedRef.current = undefined;
      return;
    }
    dispatchTransaction({ type: "replace", value: current });
    selectionStartRef.current = null;
    setStartText(current ? formatPlainDate(current.start, props.locale) : "");
    setEndText(current ? formatPlainDate(current.end, props.locale) : "");
    if (current) setVisibleMonth({ year: current.start.year, month: current.start.month });
    setInvalid(false);
  }, [controlled, current, props.locale]);
  useEffect(() => {
    const form = hostRef.current?.closest("form");
    if (!form || controlled) return;
    const reset = () => {
      setStored(defaultValue);
      dispatchTransaction({ type: "replace", value: defaultValue });
      setStartText(defaultValue ? formatPlainDate(defaultValue.start, props.locale) : "");
      setEndText(defaultValue ? formatPlainDate(defaultValue.end, props.locale) : "");
      setInvalid(false);
    };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [controlled, defaultValue, props.locale]);
  const inBounds = (range: NSEDateRange) => (!props.minimum || comparePlainDates(range.start, props.minimum) >= 0) && (!props.maximum || comparePlainDates(range.end, props.maximum) <= 0);
  const publish = (next: NSEDateRange, phase: "preview" | "commit") => {
    if (!inBounds(next)) { setInvalid(true); return; }
    setInvalid(false);
    dispatchTransaction({ type: phase === "commit" ? "commit" : "preview", value: next });
    setStartText(formatPlainDate(next.start, props.locale));
    setEndText(formatPlainDate(next.end, props.locale));
    lastPublishedRef.current = next;
    if (phase === "commit") {
      if (!controlled) setStored(next);
    }
    onValueChange?.(next, phase);
  };
  const commitText = () => { if (props.disabled || props.readOnly) return; const start = parsePlainDate(startText, props.locale), end = parsePlainDate(endText, props.locale); if (!start.ok || !end.ok) { setInvalid(true); return; } const validated = validateDateRange({ start: start.value, end: end.value }); if (!validated.ok || !inBounds(validated.value)) { setInvalid(true); return; } setInvalid(false); publish(validated.value, "commit"); };
  const previewText = (nextStart = startText, nextEnd = endText) => {
    if (props.disabled || props.readOnly) return;
    if (!nextStart.trim() && !nextEnd.trim()) { setInvalid(false); return; }
    const start = parsePlainDate(nextStart, props.locale), end = parsePlainDate(nextEnd, props.locale);
    if (!start.ok || !end.ok) { setInvalid(true); return; }
    const validated = validateDateRange({ start: start.value, end: end.value });
    if (!validated.ok || !inBounds(validated.value)) { setInvalid(true); return; }
    setInvalid(false);
    selectionStartRef.current = null;
    setVisibleMonth({ year: validated.value.start.year, month: validated.value.start.month });
    publish(validated.value, "preview");
  };
  const cancel = () => {
    const baseline = transaction.hasOpening ? transaction.opening : transaction.draft;
    dispatchTransaction({ type: "cancel" });
    setStartText(baseline ? formatPlainDate(baseline.start, props.locale) : "");
    setEndText(baseline ? formatPlainDate(baseline.end, props.locale) : "");
    setInvalid(false);
    selectionStartRef.current = null;
    if (transaction.previewed) {
      lastPublishedRef.current = baseline;
      onValueChange?.(baseline, "preview");
    }
    queueMicrotask(() => triggerRef.current?.focus({ preventScroll: true }));
  };
  const applyCalendar = () => { if (!draft || props.disabled || props.readOnly || !inBounds(draft)) return; setInvalid(false); selectionStartRef.current = null; publish(draft, "commit"); queueMicrotask(() => triggerRef.current?.focus({ preventScroll: true })); };
  const openCalendar = () => {
    selectionStartRef.current = null;
    dispatchTransaction({ type: "begin", value: current });
    const seed = current?.start ?? props.minimum ?? plainDateToday(props.timeZone);
    setVisibleMonth({ year: seed.year, month: seed.month });
  };
  const previewDate = (date: NSEDateRange["start"]) => {
    if (props.disabled || props.readOnly) return;
    const anchor = (transaction.hasOpening ? transaction.opening : null)?.start ?? draft?.start ?? date;
    const reversed = comparePlainDates(date, anchor) < 0;
    publish(reversed && props.reversePolicy === "restart" ? { start: date, end: date } : reversed ? { start: date, end: anchor } : { start: anchor, end: date }, "preview");
  };
  const titleId = `date-range-picker-title-${instanceId}`;
  const selectedDateFromCalendar = (selection: Extract<NSECalendarSelection, { kind: "range" }>) => {
    const openingAnchor = transaction.hasOpening ? transaction.opening?.start ?? null : null;
    if (openingAnchor && comparePlainDates(selection.value.start, openingAnchor) < 0 && comparePlainDates(selection.value.end, openingAnchor) === 0) return selection.value.start;
    return selection.value.end;
  };
  const selectDate = (selected: NSEDateRange["start"]) => {
    const selectionStart = selectionStartRef.current;
    if (selectionStart) {
      const reversed = comparePlainDates(selected, selectionStart) < 0;
      selectionStartRef.current = null;
      publish(reversed && props.reversePolicy === "restart" ? { start: selected, end: selected } : reversed ? { start: selected, end: selectionStart } : { start: selectionStart, end: selected }, "preview");
      return;
    }
    const openingAnchor = transaction.hasOpening ? transaction.opening?.start ?? null : null;
    const reversedFromOpening = Boolean(openingAnchor && comparePlainDates(selected, openingAnchor) < 0);
    selectionStartRef.current = selected;
    publish(reversedFromOpening && props.reversePolicy !== "restart" ? { start: selected, end: openingAnchor! } : { start: selected, end: selected }, "preview");
  };
  const calendar = <NSECalendarView aria-label={`${props["aria-label"]} calendar`} locale={props.locale} timeZone={props.timeZone} visibleMonth={visibleMonth} selection={draft ? { kind: "range", value: draft } : { kind: "none" }} isDateDisabled={(date) => Boolean((props.minimum && comparePlainDates(date, props.minimum) < 0) || (props.maximum && comparePlainDates(date, props.maximum) > 0))} onDatePreview={previewDate} onVisibleMonthChange={setVisibleMonth} onSelectionChange={(selection) => {
    if (props.disabled || props.readOnly) return;
    if (selection.kind === "range") selectDate(selectedDateFromCalendar(selection));
    else if (selection.kind === "single") selectDate(selection.value);
  }} />;
  const valueId = `date-range-picker-value-${instanceId}`;
  const fields = (
    <div data-nse-part="range-fields">
      <NSETextField controlSize="small" label="Start" aria-label={`${props["aria-label"]} start`} value={startText} disabled={props.disabled} readOnly={props.readOnly} onValueChange={(text, phase) => { if (phase === "preview") setStartText(text); else if (phase === "commit") { if (overlay) previewText(text, endText); } }} />
      <NSETextField controlSize="small" label="End" aria-label={`${props["aria-label"]} end`} value={endText} disabled={props.disabled} readOnly={props.readOnly} onValueChange={(text, phase) => { if (phase === "preview") setEndText(text); else if (phase === "commit") { if (overlay) previewText(startText, text); } }} />
    </div>
  );
  return <section ref={hostRef} data-nse-control="date-range-picker" data-state={invalid ? "invalid" : props.disabled ? "disabled" : props.readOnly ? "read-only" : open ? "open" : "ready"}>
    {overlay ? <button ref={triggerRef} type="button" aria-label={`Choose ${props["aria-label"].toLowerCase()} dates`} aria-describedby={current ? valueId : undefined} aria-expanded={open} disabled={props.disabled || props.readOnly} onClick={openCalendar} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openCalendar(); } }} onKeyUp={(event) => { if (event.key === " ") event.preventDefault(); }}><span id={valueId} data-nse-part="value" data-placeholder={current ? undefined : "true"}>{current ? displayRange(current, props.locale) : `${plainDatePlaceholder(props.locale)} – ${plainDatePlaceholder(props.locale)}`}</span></button> : <>
      {fields}
      <span data-nse-part="actions">
        <NSEPushButton tone="affirmative" aria-label={`Apply ${props["aria-label"].toLowerCase()}`} disabled={props.disabled || props.readOnly} onClick={commitText}>Apply</NSEPushButton>
        <NSEPushButton tone="light" aria-label={`Cancel ${props["aria-label"].toLowerCase()}`} disabled={props.disabled} onClick={cancel}>Cancel</NSEPushButton>
      </span>
    </>}
    {overlay ? <NSEPopover id={`date-range-picker-${instanceId}`} open={open} anchor={triggerRef.current} parentWindowControllerId="date-range-picker-window" parentResponderId={props.parentResponderId} presentation={{ mode: "automatic" }} surface="overlay" labelledBy={titleId} onOpenChange={(next) => { if (!next) cancel(); }}><section data-nse-part="calendar-sheet"><h2 id={titleId} className="nse-control-visually-hidden">{props["aria-label"]} calendar</h2>{fields}{calendar}{invalid ? <span role="alert">Enter a valid date range.</span> : null}<div data-nse-part="actions"><NSEPushButton tone="affirmative" disabled={!draft || invalid || props.disabled || props.readOnly} onClick={applyCalendar}>Apply</NSEPushButton><NSEPushButton tone="light" onClick={cancel}>Cancel</NSEPushButton></div></section></NSEPopover> : null}
    {props.name ? <input type="hidden" name={props.name} value={serialise(current)} /> : null}
    {invalid && !open ? <span role="alert">Enter a valid date range.</span> : null}
  </section>;
}
