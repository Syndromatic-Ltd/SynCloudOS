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

import type { NSEDateRange, NSEPlainDate, NSEPlainTime, NSEZonedDateTimeResolution } from "./dateTimeTypes";

const integer = (value: number, label: string) => {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${label} must be a safe integer.`);
  return value;
};
export const isLeapYear = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
export const daysInMonth = (year: number, month: number) => [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;

export function validatePlainDate(value: NSEPlainDate): NSEPlainDate {
  integer(value.year, "year"); integer(value.month, "month"); integer(value.day, "day");
  if (value.month < 1 || value.month > 12 || value.day < 1 || value.day > daysInMonth(value.year, value.month)) throw new RangeError("Invalid civil date.");
  return Object.freeze({ year: value.year, month: value.month, day: value.day });
}

export function validatePlainTime(value: NSEPlainTime): NSEPlainTime {
  integer(value.hour, "hour"); integer(value.minute, "minute"); integer(value.second, "second");
  if (value.hour < 0 || value.hour > 23 || value.minute < 0 || value.minute > 59 || value.second < 0 || value.second > 59) throw new RangeError("Invalid civil time.");
  return Object.freeze({ hour: value.hour, minute: value.minute, second: value.second });
}

export function civilToEpochDay(value: NSEPlainDate): number {
  const { year: inputYear, month, day } = validatePlainDate(value);
  let year = inputYear - (month <= 2 ? 1 : 0);
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const shiftedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

export function epochDayToCivil(epochDay: number): NSEPlainDate {
  integer(epochDay, "epoch day");
  const shifted = epochDay + 719468;
  const era = Math.floor(shifted / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365);
  let year = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime + (monthPrime < 10 ? 3 : -9);
  year += month <= 2 ? 1 : 0;
  return Object.freeze({ year, month, day });
}

export function comparePlainDates(first: NSEPlainDate, second: NSEPlainDate): -1 | 0 | 1 {
  const delta = civilToEpochDay(first) - civilToEpochDay(second);
  return delta < 0 ? -1 : delta > 0 ? 1 : 0;
}
export function addCalendarDays(value: NSEPlainDate, amount: number): NSEPlainDate { return epochDayToCivil(civilToEpochDay(value) + integer(amount, "day amount")); }
export function addCalendarMonths(value: NSEPlainDate, amount: number): NSEPlainDate {
  validatePlainDate(value); integer(amount, "month amount");
  const absolute = value.year * 12 + value.month - 1 + amount;
  const year = Math.floor(absolute / 12), month = ((absolute % 12) + 12) % 12 + 1;
  return Object.freeze({ year, month, day: Math.min(value.day, daysInMonth(year, month)) });
}
export function clampPlainDate(value: NSEPlainDate, minimum?: NSEPlainDate, maximum?: NSEPlainDate): NSEPlainDate {
  const date = validatePlainDate(value);
  if (minimum && comparePlainDates(date, minimum) < 0) return validatePlainDate(minimum);
  if (maximum && comparePlainDates(date, maximum) > 0) return validatePlainDate(maximum);
  return date;
}
export function validateDateRange(range: NSEDateRange): Readonly<{ ok: true; value: NSEDateRange }> | Readonly<{ ok: false; reason: "reversed" | "invalid" }> {
  try {
    const start = validatePlainDate(range.start), end = validatePlainDate(range.end);
    return comparePlainDates(start, end) <= 0 ? Object.freeze({ ok: true, value: Object.freeze({ start, end }) }) : Object.freeze({ ok: false, reason: "reversed" });
  } catch { return Object.freeze({ ok: false, reason: "invalid" }); }
}

const zoneFormatterCache = new Map<string, Intl.DateTimeFormat>();
function formatterForZone(timeZone: string): Intl.DateTimeFormat {
  let formatter = zoneFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    zoneFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function partsAt(epochMilliseconds: number, timeZone: string) {
  const values: Record<string, number> = {};
  for (const part of formatterForZone(timeZone).formatToParts(epochMilliseconds)) if (part.type !== "literal") values[part.type] = Number(part.value);
  return { year: values.year, month: values.month, day: values.day, hour: values.hour === 24 ? 0 : values.hour, minute: values.minute, second: values.second };
}

export function resolveZonedDateTime(
  input: Readonly<{ date: NSEPlainDate; time: NSEPlainTime }>,
  timeZone: string,
  disambiguation: "earlier" | "later" | "reject",
): NSEZonedDateTimeResolution {
  const date = validatePlainDate(input.date), time = validatePlainTime(input.time);
  try { formatterForZone(timeZone).format(0); } catch { return Object.freeze({ kind: "invalid-time-zone", timeZone }); }
  const naive = civilToEpochDay(date) * 86_400_000 + time.hour * 3_600_000 + time.minute * 60_000 + time.second * 1_000;
  // A wall time maps to naive - offset for whichever of the zone's offsets is
  // in force at that instant. Offsets change at most a few times a year, so
  // the ones in force a day either side of the wall time (and at it) cover a
  // gap or an overlap; each is tried once, rather than scanning every minute.
  const offsetAt = (epoch: number) => {
    const local = partsAt(epoch, timeZone);
    return civilToEpochDay({ year: local.year, month: local.month, day: local.day }) * 86_400_000 + local.hour * 3_600_000 + local.minute * 60_000 + local.second * 1_000 - epoch;
  };
  const offsets = new Set([offsetAt(naive - 86_400_000), offsetAt(naive), offsetAt(naive + 86_400_000)]);
  const candidates: number[] = [];
  for (const offset of offsets) {
    const epoch = naive - offset;
    const local = partsAt(epoch, timeZone);
    if (local.year === date.year && local.month === date.month && local.day === date.day && local.hour === time.hour && local.minute === time.minute && local.second === time.second) candidates.push(epoch);
  }
  const unique = [...new Set(candidates)].sort((a, b) => a - b);
  if (unique.length === 0) return Object.freeze({ kind: "nonexistent" });
  if (unique.length > 1 && disambiguation === "reject") return Object.freeze({ kind: "ambiguous", candidates: Object.freeze(unique) });
  const epochMilliseconds = disambiguation === "later" ? unique.at(-1)! : unique[0];
  const resolvedDisambiguation: "unique" | "earlier" | "later" = unique.length === 1 ? "unique" : disambiguation === "later" ? "later" : "earlier";
  return Object.freeze({ kind: "resolved", value: Object.freeze({ epochMilliseconds, timeZone, calendar: "gregory" }), disambiguation: resolvedDisambiguation });
}

export function calendarWeekStart(locale: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const resolved = new Intl.Locale(locale);
  const weekInfo = (resolved as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } }).getWeekInfo?.()
    ?? (resolved as Intl.Locale & { weekInfo?: { firstDay: number } }).weekInfo;
  if (weekInfo && Number.isInteger(weekInfo.firstDay) && weekInfo.firstDay >= 1 && weekInfo.firstDay <= 7) return (weekInfo.firstDay % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const region = resolved.maximize().region;
  if (region === "MV") return 5;
  if (region === "IR") return 6;
  if (region === "US" || region === "CA" || region === "PH" || region === "SA") return 0;
  return 1;
}

export function isoWeekNumber(date: NSEPlainDate): Readonly<{ week: number; weekYear: number }> {
  const day = civilToEpochDay(date);
  const isoWeekday = ((day + 3) % 7 + 7) % 7 + 1;
  const thursday = epochDayToCivil(day + 4 - isoWeekday);
  const firstThursday = civilToEpochDay({ year: thursday.year, month: 1, day: 4 });
  const firstWeekday = ((firstThursday + 3) % 7 + 7) % 7 + 1;
  return Object.freeze({ week: 1 + Math.floor((day + 4 - isoWeekday - (firstThursday + 4 - firstWeekday)) / 7), weekYear: thursday.year });
}
