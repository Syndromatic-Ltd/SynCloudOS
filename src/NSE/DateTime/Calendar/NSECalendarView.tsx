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

import { useId, useMemo, useRef } from "react";
import { nseAppearanceSlot, useNSEAppearanceSlot } from "../../Appearance";
import { addCalendarDays, addCalendarMonths, calendarWeekStart, civilToEpochDay, comparePlainDates, epochDayToCivil } from "../calendarArithmetic";
import { plainDateToday } from "../dateTimeFormatting";
import type { NSECalendarMonth, NSEPlainDate } from "../dateTimeTypes";
import type { NSECalendarNavigationRequest, NSECalendarNavigationUnit, NSECalendarSelection, NSECalendarViewProps } from "./calendarTypes";

const key = (date: NSEPlainDate) => `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
const weekday = (date: NSEPlainDate) => ((civilToEpochDay(date) + 4) % 7 + 7) % 7;
const monthBy = (month: NSECalendarMonth, unit: NSECalendarNavigationUnit, direction: -1 | 1): NSECalendarMonth => {
  const moved = addCalendarMonths({ ...month, day: 1 }, direction * (unit === "month" ? 1 : unit === "year" ? 12 : 120));
  return Object.freeze({ year: moved.year, month: moved.month });
};

export function buildCalendarMonthGrid(month: NSECalendarMonth, locale: string): readonly NSEPlainDate[] {
  const first = { ...month, day: 1 };
  const offset = (weekday(first) - calendarWeekStart(locale) + 7) % 7;
  return Object.freeze(Array.from({ length: 42 }, (_, index) => addCalendarDays(first, index - offset)));
}

function activeDate(selection: NSECalendarSelection, month: NSECalendarMonth): NSEPlainDate {
  if (selection.kind === "single") return selection.value;
  if (selection.kind === "range") return selection.value.end;
  if (selection.kind === "multiple" && selection.value.length) return selection.value.at(-1)!;
  return { ...month, day: 1 };
}

export function NSECalendarView(props: NSECalendarViewProps) {
  const instanceId = useId().replace(/:/g, "");
  const gridRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ readonly pointerId: number; readonly startX: number } | null>(null);
  const days = useMemo(() => buildCalendarMonthGrid(props.visibleMonth, props.locale), [props.visibleMonth, props.locale]);
  const active = activeDate(props.selection, props.visibleMonth);
  const today = props.today ?? plainDateToday(props.timeZone);
  const showToday = () => {
    if (props.visibleMonth.year !== today.year || props.visibleMonth.month !== today.month) {
      const step = (today.year - props.visibleMonth.year) * 12 + today.month - props.visibleMonth.month;
      props.onVisibleMonthChange?.(Object.freeze({ year: today.year, month: today.month }), { unit: "month", direction: step < 0 ? -1 : 1, reason: "button" });
    }
    // The today dot sets the date; a range or multiple selection is
    // only brought into view, never replaced.
    if (props.selection.kind === "single" || props.selection.kind === "none") {
      if (!props.isDateDisabled(today)) props.onSelectionChange?.({ kind: "single", value: today, reason: "today" });
    }
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>(`[data-nse-calendar-date="${key(today)}"]`)?.focus({ preventScroll: true }));
  };
  const start = calendarWeekStart(props.locale);
  // One set of formatters per locale, not one per cell per render: building an
  // Intl.DateTimeFormat is costly, and a month grid would otherwise build 50.
  const formatters = useMemo(() => ({
    weekday: new Intl.DateTimeFormat(props.locale, { weekday: "short", timeZone: "UTC" }),
    month: new Intl.DateTimeFormat(props.locale, { month: "long", year: "numeric", timeZone: "UTC" }),
    day: new Intl.DateTimeFormat(props.locale, { dateStyle: "long", timeZone: "UTC" }),
  }), [props.locale]);
  const localeDirection = (new Intl.Locale(props.locale) as Intl.Locale & { textInfo?: { direction: "ltr" | "rtl" } }).textInfo?.direction;
  const direction = props.dir ?? localeDirection ?? "ltr";
  const appearance = useNSEAppearanceSlot(nseAppearanceSlot("calendar-view", "grid", "normal"));
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => formatters.weekday.format((3 + ((start + index) % 7)) * 86_400_000));
  const navigate = (unit: NSECalendarNavigationUnit, direction: -1 | 1, reason: NSECalendarNavigationRequest["reason"]) => props.onVisibleMonthChange?.(monthBy(props.visibleMonth, unit, direction), { unit, direction, reason });
  const select = (date: NSEPlainDate, reason = "pointer") => {
    if (props.isDateDisabled(date)) return;
    if (props.selection.kind === "range") {
      const start = props.selection.value.start;
      props.onSelectionChange?.({ kind: "range", value: comparePlainDates(date, start) < 0 ? { start: date, end: start } : { start, end: date }, reason });
    }
    else if (props.selection.kind === "multiple") {
      const exists = props.selection.value.some((item) => comparePlainDates(item, date) === 0);
      props.onSelectionChange?.({ kind: "multiple", value: exists ? props.selection.value.filter((item) => comparePlainDates(item, date) !== 0) : [...props.selection.value, date], reason });
    } else props.onSelectionChange?.({ kind: "single", value: date, reason });
  };
  return <section data-nse-control="calendar" data-calendar-variant={props.variant ?? "full"} data-state="ready" data-motion={props.reducedMotion ? "reduced" : "full"} {...appearance.attributes} dir={direction} onPointerDown={(event) => { if (props.enableSwipeNavigation === false || (event.pointerType && event.pointerType !== "touch" && event.pointerType !== "pen")) return; swipe.current = { pointerId: event.pointerId, startX: event.clientX }; event.currentTarget.setPointerCapture?.(event.pointerId); }} onPointerUp={(event) => { const activeSwipe = swipe.current; if (!activeSwipe || activeSwipe.pointerId !== event.pointerId) return; swipe.current = null; const delta = event.clientX - activeSwipe.startX; if (Math.abs(delta) < 40) return; const logicalDirection: -1 | 1 = delta < 0 ? 1 : -1; navigate("month", direction === "rtl" ? (logicalDirection * -1) as -1 | 1 : logicalDirection, "swipe"); }} onPointerCancel={() => { swipe.current = null; }} onLostPointerCapture={() => { swipe.current = null; }}>
    <header data-nse-part="header">
      {props.variant !== "month" ? <button type="button" aria-label="Previous year" data-nse-part="previous-year" onClick={() => navigate("year", -1, "button")}>−y</button> : null}
      <button type="button" aria-label="Previous month" data-nse-part="previous-month" onClick={() => navigate("month", -1, "button")}>−m</button>
      <h2 aria-live="polite">{formatters.month.format(civilToEpochDay({ ...props.visibleMonth, day: 1 }) * 86_400_000)}</h2>
      <button type="button" aria-label="Today" data-nse-part="today" onClick={showToday}>•</button>
      <button type="button" aria-label="Next month" data-nse-part="next-month" onClick={() => navigate("month", 1, "button")}>+m</button>
      {props.variant !== "month" ? <button type="button" aria-label="Next year" data-nse-part="next-year" onClick={() => navigate("year", 1, "button")}>+y</button> : null}
    </header>
    <div ref={gridRef} role="grid" aria-label={props["aria-label"]} {...appearance.attributes} onKeyDown={(event) => {
      if (event.key === "PageDown" || event.key === "PageUp") { event.preventDefault(); navigate(event.altKey ? "decade" : event.shiftKey ? "year" : "month", event.key === "PageDown" ? 1 : -1, "keyboard"); return; }
      const inline = direction === "rtl" ? -1 : 1;
      const homeDelta = -((weekday(active) - start + 7) % 7);
      const delta = event.key === "ArrowRight" ? inline : event.key === "ArrowLeft" ? -inline : event.key === "ArrowDown" ? 7 : event.key === "ArrowUp" ? -7 : event.key === "Home" ? homeDelta : event.key === "End" ? homeDelta + 6 : 0;
      if (delta) { event.preventDefault(); const next = addCalendarDays(active, delta); select(next, event.shiftKey ? "keyboard-range" : "keyboard"); gridRef.current?.querySelector<HTMLElement>(`[data-nse-calendar-date="${key(next)}"]`)?.focus({ preventScroll: true }); }
    }}>
      <div role="row">{weekdayLabels.map((label) => <span role="columnheader" key={label}>{label}</span>)}</div>
      {Array.from({ length: 6 }, (_, row) => <div role="row" key={row}>{days.slice(row * 7, row * 7 + 7).map((day) => {
        const indicators = props.eventIndicatorsForDate?.(day) ?? [];
        const descriptionId = indicators.length ? `calendar-events-${instanceId}-${key(day)}` : undefined;
        const selected = props.selection.kind === "single" ? comparePlainDates(props.selection.value, day) === 0 : props.selection.kind === "range" ? comparePlainDates(day, props.selection.value.start) >= 0 && comparePlainDates(day, props.selection.value.end) <= 0 : props.selection.kind === "multiple" ? props.selection.value.some((item) => comparePlainDates(item, day) === 0) : false;
        const rangePosition = selected && props.selection.kind === "range"
          ? comparePlainDates(props.selection.value.start, props.selection.value.end) === 0 ? "single"
            : comparePlainDates(day, props.selection.value.start) === 0 ? "start"
              : comparePlainDates(day, props.selection.value.end) === 0 ? "end" : "middle"
          : undefined;
        return <span key={key(day)}><button role="gridcell" type="button" aria-label={formatters.day.format(civilToEpochDay(day) * 86_400_000)} aria-selected={selected} aria-describedby={descriptionId} disabled={props.isDateDisabled(day)} tabIndex={comparePlainDates(active, day) === 0 ? 0 : -1} data-nse-calendar-date={key(day)} data-nse-part="day" data-state={selected ? "selected" : day.month === props.visibleMonth.month ? "normal" : "adjacent"} data-range-position={rangePosition} data-today={comparePlainDates(day, today) === 0 || undefined} aria-current={comparePlainDates(day, today) === 0 ? "date" : undefined} onPointerEnter={() => { if (!props.isDateDisabled(day)) props.onDatePreview?.(day, "hover"); }} onFocus={() => { if (!props.isDateDisabled(day)) props.onDatePreview?.(day, "focus"); }} onClick={() => select(day)}>{day.day}{indicators.length ? <i aria-hidden="true" data-nse-part="event-indicator" /> : null}</button>{descriptionId ? <span id={descriptionId} hidden>{indicators.map((indicator) => `${indicator.label}${indicator.count === undefined ? "" : `: ${indicator.count}`}`).join(", ")}</span> : null}</span>;
      })}</div>)}
    </div>
  </section>;
}
