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

export interface NSEPlainDate { readonly year: number; readonly month: number; readonly day: number }
export interface NSEPlainTime { readonly hour: number; readonly minute: number; readonly second: number }
export interface NSEZonedDateTime { readonly epochMilliseconds: number; readonly timeZone: string; readonly calendar: "gregory" }
export interface NSEDateRange { readonly start: NSEPlainDate; readonly end: NSEPlainDate }
export interface NSECalendarMonth { readonly year: number; readonly month: number }
export type NSECalendarSystem = "gregory";

export type NSEZonedDateTimeResolution =
  | Readonly<{ kind: "resolved"; value: NSEZonedDateTime; disambiguation: "unique" | "earlier" | "later" }>
  | Readonly<{ kind: "nonexistent" }>
  | Readonly<{ kind: "ambiguous"; candidates: readonly number[] }>
  | Readonly<{ kind: "invalid-time-zone"; timeZone: string }>;

export type NSEDateParseResult =
  | Readonly<{ ok: true; value: NSEPlainDate }>
  | Readonly<{ ok: false; code: "syntax" | "invalid-date"; message: string }>;
