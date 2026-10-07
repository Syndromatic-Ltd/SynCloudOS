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

import type { NSECalendarMonth, NSEDateRange, NSEPlainDate, NSEPlainTime } from "../dateTimeTypes";

export type NSECalendarSelectionMode = "none" | "single" | "range" | "multiple";
export type NSECalendarSelection =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "single"; value: NSEPlainDate }>
  | Readonly<{ kind: "range"; value: NSEDateRange }>
  | Readonly<{ kind: "multiple"; value: readonly NSEPlainDate[] }>;
export type NSECalendarNavigationUnit = "month" | "year" | "decade";
export interface NSECalendarNavigationRequest { readonly unit: NSECalendarNavigationUnit; readonly direction: -1 | 1; readonly reason: "button" | "keyboard" | "swipe" }
export interface NSECalendarEventIndicator { readonly id: string; readonly label: string; readonly tone?: "neutral" | "accent" | "warning" | "critical"; readonly count?: number }
export interface NSECalendarViewProps {
  readonly "aria-label": string;
  readonly locale: string;
  readonly timeZone: string;
  readonly visibleMonth: NSECalendarMonth;
  readonly selection: NSECalendarSelection;
  readonly enableSwipeNavigation?: boolean;
  readonly reducedMotion?: boolean;
  readonly dir?: "ltr" | "rtl";
  readonly variant?: "full" | "month";
  /** The date the Today control shows and the grid marks (aria-current).
   * Defaults to the current date in `timeZone`. */
  readonly today?: NSEPlainDate;
  isDateDisabled(date: NSEPlainDate): boolean;
  eventIndicatorsForDate?(date: NSEPlainDate): readonly NSECalendarEventIndicator[];
  onDatePreview?(date: NSEPlainDate, reason: "hover" | "focus"): void;
  onVisibleMonthChange?(month: NSECalendarMonth, request: NSECalendarNavigationRequest): void;
  onSelectionChange?(selection: NSECalendarSelection & { readonly reason?: string }): void;
}
export interface NSEClockViewProps {
  readonly "aria-label": string;
  readonly locale: string;
  readonly timeZone: string;
  readonly date: NSEPlainDate;
  readonly value: NSEPlainTime;
  readonly showSeconds?: boolean;
  readonly disambiguation?: "earlier" | "later" | "reject";
  readonly disabled?: boolean;
  readonly reducedMotion?: boolean;
  readonly showValidationMessage?: boolean;
  readonly minuteStep?: number;
  readonly hourCycle?: "h12" | "h24";
  onValueChange(value: NSEPlainTime, phase: "preview" | "commit"): void;
}
