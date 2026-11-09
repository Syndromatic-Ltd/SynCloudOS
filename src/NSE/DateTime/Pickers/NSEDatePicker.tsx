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

import { NSEDatePickerDrawingContext } from "./datePickerDrawing";
import { useEffect, useState, type ReactElement } from "react";

import { useNSEAnimationEnvironment } from "../../Animation/NSEAnimationEnvironment";
import { addCalendarMonths, clampPlainDate, comparePlainDates } from "../calendarArithmetic";
import { plainDateToday } from "../dateTimeFormatting";
import { NSEGraphicalCalendar } from "../Calendar/graphicalCalendar";
import type { NSECalendarMonth, NSEDateRange, NSEPlainDate } from "../dateTimeTypes";
import { NSEDateEntry } from "./dateEntry";
import { NSEDateRangeEntry } from "./dateRangeEntry";
import { NSEDateTimeEntry } from "./dateTimeEntry";
import type { NSEDatePickerDateProps, NSEDatePickerDateTimeProps, NSEDatePickerProps, NSEDatePickerRangeProps, NSEDatePickerTimeProps } from "./datePickerTypes";
import { NSETimeEntry } from "./timeEntry";

const isTime = (props: NSEDatePickerProps): props is NSEDatePickerTimeProps =>
  props.datePickerElements?.length === 1 && props.datePickerElements[0] === "hourMinute";
const isDateTime = (props: NSEDatePickerProps): props is NSEDatePickerDateTimeProps =>
  props.datePickerElements?.length === 2;
const isRange = (props: NSEDatePickerProps): props is NSEDatePickerRangeProps =>
  "datePickerMode" in props && props.datePickerMode === "range";

/**
 * NSDatePicker. `datePickerElements` chooses what it edits: a date
 * (`["yearMonthDay"]`, the default), a time (`["hourMinute"]`) or both
 * (`["yearMonthDay", "hourMinute"]`). `datePickerMode: "range"` edits a date
 * range. `datePickerStyle` chooses how: a text field (`textField`), a text
 * field with a stepper (`textFieldAndStepper`, the default), or the
 * graphical calendar and clock (`clockAndCalendar`). A text field opens a
 * calendar or clock in a popover when `presentsCalendarOverlay` (the default).
 */
export function NSEDatePicker(props: NSEDatePickerTimeProps): ReactElement;
export function NSEDatePicker(props: NSEDatePickerDateTimeProps): ReactElement;
export function NSEDatePicker(props: NSEDatePickerRangeProps): ReactElement;
export function NSEDatePicker(props: NSEDatePickerDateProps): ReactElement;
export function NSEDatePicker(props: NSEDatePickerProps): ReactElement {
  return <NSEDatePickerDrawingContext.Provider value={{ style: props.datePickerStyle ?? "textFieldAndStepper", enabled: props.isEnabled !== false, datePickerMode: isRange(props) ? "range" : "single" }}><NSEDatePickerContent {...props} /></NSEDatePickerDrawingContext.Provider>;
}
function NSEDatePickerContent(props: NSEDatePickerProps): ReactElement {
  const { datePickerStyle = "textFieldAndStepper", presentsCalendarOverlay = true, isEnabled = true, isEditable = true } = props;
  const disabled = !isEnabled;
  const readOnly = !isEditable;
  const common = { "aria-label": props["aria-label"], locale: props.locale, timeZone: props.timeZone, name: props.name, required: props.required, isEnabled, readOnly };
  if (isDateTime(props)) {
    return <NSEDateTimeEntry {...common} mode={datePickerStyle === "clockAndCalendar" ? "combined" : presentsCalendarOverlay ? "automatic" : "text"} value={props.value} defaultValue={props.defaultValue} minimum={props.minimum} maximum={props.maximum} hourCycle={props.hourCycle} onValueChange={props.onValueChange} />;
  }
  if (isTime(props)) {
    return <NSETimeEntry {...common} editor={datePickerStyle === "clockAndCalendar" ? "clock" : "field"} presentsClockOverlay={presentsCalendarOverlay} parentResponderId={props.parentResponderId} value={props.value} defaultValue={props.defaultValue} minimum={props.minimum} maximum={props.maximum} date={props.date} minuteStep={props.minuteStep} hourCycle={props.hourCycle} onValueChange={props.onValueChange} />;
  }
  if (datePickerStyle === "clockAndCalendar") return <GraphicalDatePicker {...props} />;
  if (isRange(props)) {
    return <NSEDateRangeEntry {...common} parentResponderId={props.parentResponderId} value={props.value} defaultValue={props.defaultValue} minimum={props.minimum} maximum={props.maximum} onValueChange={props.onValueChange} />;
  }
  const date = props as NSEDatePickerDateProps;
  return <NSEDateEntry {...common} mode={presentsCalendarOverlay ? "automatic" : "text"} editor={datePickerStyle === "textField" ? "segments" : "text"} parentResponderId={date.parentResponderId} value={date.value} defaultValue={date.defaultValue} minimum={date.minimum} maximum={date.maximum} onValueChange={date.onValueChange} />;
}

/**
 * NSDatePicker's graphical calendar. As in AppKit, it edits its value live:
 * clicking a day selects it, and the month arrows move the selected date by a
 * month. In range mode a second click, or a Shift-arrow, extends the range.
 */
function GraphicalDatePicker(props: NSEDatePickerDateProps | NSEDatePickerRangeProps) {
  const { reducedMotion } = useNSEAnimationEnvironment();
  const range = isRange(props);
  const controlled = props.value !== undefined;
  const [stored, setStored] = useState<NSEPlainDate | NSEDateRange | null>(props.defaultValue ?? null);
  const current = (controlled ? props.value : stored) ?? null;
  const anchor = current ? ("start" in current ? current.start : current) : null;
  const seed = (): NSECalendarMonth => { const date = anchor ?? props.minimum ?? props.today ?? plainDateToday(props.timeZone); return { year: date.year, month: date.month }; };
  const [visibleMonth, setVisibleMonth] = useState<NSECalendarMonth>(seed);
  useEffect(() => { setVisibleMonth(seed()); }, [anchor?.year, anchor?.month]);
  const inert = props.isEnabled === false || props.isEditable === false;
  const publish = (next: NSEPlainDate | NSEDateRange) => {
    if (!controlled) setStored(next);
    (props.onValueChange as ((value: NSEPlainDate | NSEDateRange, phase: "commit") => void) | undefined)?.(next, "commit");
  };
  const outside = (date: NSEPlainDate) => Boolean((props.minimum && comparePlainDates(date, props.minimum) < 0) || (props.maximum && comparePlainDates(date, props.maximum) > 0));
  const eventIndicators = range ? undefined : (props as NSEDatePickerDateProps).eventIndicatorsForDate;
  return <NSEGraphicalCalendar
    aria-label={props["aria-label"]}
    locale={props.locale}
    timeZone={props.timeZone}
    variant="month"
    reducedMotion={reducedMotion}
    {...(props.today ? { today: props.today } : {})}
    {...(eventIndicators ? { eventIndicatorsForDate: eventIndicators } : {})}
    visibleMonth={visibleMonth}
    selection={current ? (range ? { kind: "range", value: current as NSEDateRange } : { kind: "single", value: current as NSEPlainDate }) : { kind: "none" }}
    isDateDisabled={(date) => inert || outside(date)}
    onVisibleMonthChange={(month, request) => {
      setVisibleMonth(month);
      if (range || inert || !current || request.reason === "swipe") return;
      const date = current as NSEPlainDate;
      const moved = addCalendarMonths(date, (month.year - date.year) * 12 + (month.month - date.month));
      publish(clampPlainDate(moved, props.minimum, props.maximum));
    }}
    onSelectionChange={(selection) => {
      if (inert) return;
      if (selection.kind === "single") publish(range ? { start: selection.value, end: selection.value } : selection.value);
      else if (selection.kind === "range" && range) publish(selection.value);
    }}
  />;
}
