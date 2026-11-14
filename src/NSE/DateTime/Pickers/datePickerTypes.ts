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

import type { HTMLAttributes, ReactNode } from "react";
import type { NSECalendarEventIndicator } from "../Calendar/calendarTypes"
import type { NSEDateRange, NSEPlainDate, NSEPlainTime, ZonedDateTime } from "../dateTimeTypes";
export type DateEntryMode = "automatic" | "text" | "calendar";
export type DateEntryField = "month" | "day" | "year";
export type DateEntryEditorMode = "text" | "segments";
export interface DateEntryEditorContext { readonly value: NSEPlainDate | null; readonly isEnabled: boolean; readonly readOnly: boolean; commit(value: NSEPlainDate | null): void }
export interface TimeEntryEditorContext { readonly value: NSEPlainTime | null; readonly isEnabled: boolean; readonly readOnly: boolean; commit(value: NSEPlainTime | null): void }
/** "field" (default): AppKit's textual time field with a stepper and a clock popover; "clock": the analogue clock inline; "segments": hour and minute pickers. */
export type TimeEntryEditorMode = "field" | "clock" | "segments";
export interface DateEntryProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children" | "defaultValue" | "onChange"> { readonly name?: string; readonly value?: NSEPlainDate | null; readonly defaultValue?: NSEPlainDate | null; readonly mode?: DateEntryMode; readonly editor?: DateEntryEditorMode; readonly hiddenFields?: readonly DateEntryField[]; readonly locale: string; readonly timeZone: string; readonly minimum?: NSEPlainDate; readonly maximum?: NSEPlainDate; readonly isEnabled?: boolean; readonly readOnly?: boolean; readonly required?: boolean; readonly parentResponderId?: string; readonly "aria-label": string; readonly renderEditor?: (context: DateEntryEditorContext) => ReactNode; normalizeValue?(value: NSEPlainDate, current: NSEPlainDate | null): NSEPlainDate; onValueChange?(value: NSEPlainDate | null, phase: "preview" | "commit"): void }
export interface TimeEntryProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children" | "defaultValue" | "onChange"> { readonly name?: string; readonly value?: NSEPlainTime | null; readonly defaultValue?: NSEPlainTime | null; readonly editor?: TimeEntryEditorMode; readonly locale: string; readonly timeZone: string; readonly date?: NSEPlainDate; readonly minimum?: NSEPlainTime; readonly maximum?: NSEPlainTime; readonly minuteStep?: number; readonly hourCycle?: "h12" | "h24"; readonly isEnabled?: boolean; readonly readOnly?: boolean; readonly required?: boolean; readonly "aria-label": string; readonly parentResponderId?: string; readonly renderEditor?: (context: TimeEntryEditorContext) => ReactNode
 /** Whether the field opens the clock in a popover. @internal */ readonly presentsClockOverlay?: boolean; onValueChange?(value: NSEPlainTime | null, phase: "preview" | "commit"): void }
export interface NSEDateTimeValue { readonly date: NSEPlainDate; readonly time: NSEPlainTime; readonly timeZone: string; readonly disambiguation: "earlier" | "later" | "reject" }
export type DateTimeEntryMode = "automatic" | "text" | "calendar" | "clock" | "calendar-clock" | "combined";
export interface DateTimeEntryProps { readonly name?: string; readonly value?: NSEDateTimeValue | null; readonly defaultValue?: NSEDateTimeValue | null; readonly mode?: DateTimeEntryMode; readonly locale: string; readonly timeZone: string; readonly hourCycle?: "h12" | "h24"; readonly minimum?: ZonedDateTime; readonly maximum?: ZonedDateTime; readonly isEnabled?: boolean; readonly readOnly?: boolean; readonly required?: boolean; readonly "aria-label": string; onValueChange?(value: NSEDateTimeValue | null, phase: "preview" | "commit"): void }
export interface DateRangeEntryProps { readonly name?: string; readonly value?: NSEDateRange | null; readonly defaultValue?: NSEDateRange | null; readonly locale: string; readonly timeZone: string; readonly minimum?: NSEPlainDate; readonly maximum?: NSEPlainDate; readonly reversePolicy?: "normalize" | "restart"; readonly isEnabled?: boolean; readonly readOnly?: boolean; readonly required?: boolean; readonly parentResponderId?: string; readonly "aria-label": string; onValueChange?(value: NSEDateRange | null, phase: "preview" | "commit"): void }

/** NSDatePicker.Style. */
export type NSEDatePickerStyle = "textFieldAndStepper" | "textField" | "clockAndCalendar"

interface DatePickerBaseProps {
  readonly "aria-label": string
  readonly locale: string
  readonly timeZone: string
  /** A form field name: the value is submitted as ISO 8601. */
  readonly name?: string
  /** NSDatePicker.datePickerStyle. Default textFieldAndStepper. */
  readonly datePickerStyle?: NSEDatePickerStyle
  /** NSDatePicker.presentsCalendarOverlay: a text field opens the calendar (or the clock) in a popover. Default true. */
  readonly presentsCalendarOverlay?: boolean
  /** NSControl.isEnabled. */
  readonly isEnabled?: boolean
  /** Whether the value can be changed; a non-editable picker still shows and submits it. */
  readonly isEditable?: boolean
  readonly required?: boolean
  readonly parentResponderId?: string
}

/** A date (datePickerElements yearMonthDay, the default). */
export interface NSEDatePickerDateProps extends DatePickerBaseProps {
  readonly datePickerElements?: readonly ["yearMonthDay"]
  readonly datePickerMode?: "single"
  readonly value?: NSEPlainDate | null
  readonly defaultValue?: NSEPlainDate | null
  /** NSDatePicker.minDate. */
  readonly minimum?: NSEPlainDate
  /** NSDatePicker.maxDate. */
  readonly maximum?: NSEPlainDate
  /** The date the graphical calendar marks as today. Defaults to today in timeZone. */
  readonly today?: NSEPlainDate
  /** Marks under each day of the graphical calendar, such as a calendar's events. */
  eventIndicatorsForDate?(date: NSEPlainDate): readonly NSECalendarEventIndicator[]
  onValueChange?(value: NSEPlainDate | null, phase: "preview" | "commit"): void
}

/** A date range (NSDatePicker.datePickerMode range). */
export interface NSEDatePickerRangeProps extends DatePickerBaseProps {
  readonly datePickerElements?: readonly ["yearMonthDay"]
  readonly datePickerMode: "range"
  readonly value?: NSEDateRange | null
  readonly defaultValue?: NSEDateRange | null
  readonly minimum?: NSEPlainDate
  readonly maximum?: NSEPlainDate
  readonly today?: NSEPlainDate
  onValueChange?(value: NSEDateRange | null, phase: "preview" | "commit"): void
}

/** A time of day (datePickerElements hourMinute). */
export interface NSEDatePickerTimeProps extends DatePickerBaseProps {
  readonly datePickerElements: readonly ["hourMinute"]
  readonly value?: NSEPlainTime | null
  readonly defaultValue?: NSEPlainTime | null
  readonly minimum?: NSEPlainTime
  readonly maximum?: NSEPlainTime
  /** The day the time falls on, for daylight-saving transitions in timeZone. */
  readonly date?: NSEPlainDate
  readonly minuteStep?: number
  readonly hourCycle?: "h12" | "h24"
  onValueChange?(value: NSEPlainTime | null, phase: "preview" | "commit"): void
}

/** A date and time in a time zone (datePickerElements yearMonthDay and hourMinute). */
export interface NSEDatePickerDateTimeProps extends DatePickerBaseProps {
  readonly datePickerElements: readonly ["yearMonthDay", "hourMinute"]
  readonly value?: NSEDateTimeValue | null
  readonly defaultValue?: NSEDateTimeValue | null
  readonly minimum?: ZonedDateTime
  readonly maximum?: ZonedDateTime
  readonly hourCycle?: "h12" | "h24"
  onValueChange?(value: NSEDateTimeValue | null, phase: "preview" | "commit"): void
}

export type NSEDatePickerProps = NSEDatePickerDateProps | NSEDatePickerRangeProps | NSEDatePickerTimeProps | NSEDatePickerDateTimeProps
