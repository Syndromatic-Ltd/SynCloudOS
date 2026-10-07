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
import type { NSEDateRange, NSEPlainDate, NSEPlainTime, NSEZonedDateTime } from "../dateTimeTypes";
export type NSEDatePickerMode = "automatic" | "text" | "calendar";
export type NSEDatePickerField = "month" | "day" | "year";
export type NSEDatePickerEditorMode = "text" | "segments";
export interface NSEDatePickerEditorContext { readonly value: NSEPlainDate | null; readonly disabled: boolean; readonly readOnly: boolean; commit(value: NSEPlainDate | null): void }
export interface NSETimePickerEditorContext { readonly value: NSEPlainTime | null; readonly disabled: boolean; readonly readOnly: boolean; commit(value: NSEPlainTime | null): void }
/** "field" (default): AppKit's textual time field with a stepper and a clock popover; "clock": the analogue clock inline; "segments": hour and minute pickers. */
export type NSETimePickerEditorMode = "field" | "clock" | "segments";
export interface NSEDatePickerProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children" | "defaultValue" | "onChange"> { readonly name?: string; readonly value?: NSEPlainDate | null; readonly defaultValue?: NSEPlainDate | null; readonly mode?: NSEDatePickerMode; readonly editor?: NSEDatePickerEditorMode; readonly hiddenFields?: readonly NSEDatePickerField[]; readonly locale: string; readonly timeZone: string; readonly minimum?: NSEPlainDate; readonly maximum?: NSEPlainDate; readonly disabled?: boolean; readonly readOnly?: boolean; readonly required?: boolean; readonly parentResponderId?: string; readonly "aria-label": string; readonly renderEditor?: (context: NSEDatePickerEditorContext) => ReactNode; normalizeValue?(value: NSEPlainDate, current: NSEPlainDate | null): NSEPlainDate; onValueChange?(value: NSEPlainDate | null, phase: "preview" | "commit"): void }
export interface NSETimePickerProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children" | "defaultValue" | "onChange"> { readonly name?: string; readonly value?: NSEPlainTime | null; readonly defaultValue?: NSEPlainTime | null; readonly editor?: NSETimePickerEditorMode; readonly locale: string; readonly timeZone: string; readonly date?: NSEPlainDate; readonly minimum?: NSEPlainTime; readonly maximum?: NSEPlainTime; readonly minuteStep?: number; readonly hourCycle?: "h12" | "h24"; readonly disabled?: boolean; readonly readOnly?: boolean; readonly required?: boolean; readonly "aria-label": string; readonly parentResponderId?: string; readonly renderEditor?: (context: NSETimePickerEditorContext) => ReactNode; onValueChange?(value: NSEPlainTime | null, phase: "preview" | "commit"): void }
export interface NSEDateTimePickerValue { readonly date: NSEPlainDate; readonly time: NSEPlainTime; readonly timeZone: string; readonly disambiguation: "earlier" | "later" | "reject" }
export type NSEDateTimePickerMode = "automatic" | "text" | "calendar" | "clock" | "calendar-clock" | "combined";
export interface NSEDateTimePickerProps { readonly name?: string; readonly value?: NSEDateTimePickerValue | null; readonly defaultValue?: NSEDateTimePickerValue | null; readonly mode?: NSEDateTimePickerMode; readonly locale: string; readonly timeZone: string; readonly hourCycle?: "h12" | "h24"; readonly minimum?: NSEZonedDateTime; readonly maximum?: NSEZonedDateTime; readonly disabled?: boolean; readonly readOnly?: boolean; readonly required?: boolean; readonly "aria-label": string; onValueChange?(value: NSEDateTimePickerValue | null, phase: "preview" | "commit"): void }
export interface NSEDateRangePickerProps { readonly name?: string; readonly value?: NSEDateRange | null; readonly defaultValue?: NSEDateRange | null; readonly locale: string; readonly timeZone: string; readonly minimum?: NSEPlainDate; readonly maximum?: NSEPlainDate; readonly reversePolicy?: "normalize" | "restart"; readonly disabled?: boolean; readonly readOnly?: boolean; readonly required?: boolean; readonly parentResponderId?: string; readonly "aria-label": string; onValueChange?(value: NSEDateRange | null, phase: "preview" | "commit"): void }
