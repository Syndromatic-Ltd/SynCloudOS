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

import { civilToEpochDay, validatePlainDate, validatePlainTime } from "./calendarArithmetic";
import type { NSEDateParseResult, NSEPlainDate, NSEPlainTime } from "./dateTimeTypes";

export function formatPlainDate(value: NSEPlainDate, locale: string, options: Intl.DateTimeFormatOptions = {}): string {
  const date = validatePlainDate(value);
  const hasExplicitFields = ["dateStyle", "weekday", "era", "year", "month", "day"].some((key) => options[key as keyof Intl.DateTimeFormatOptions] !== undefined);
  return new Intl.DateTimeFormat(locale, { ...(hasExplicitFields ? {} : { dateStyle: "short" as const }), ...options, timeZone: "UTC", calendar: "gregory" }).format(civilToEpochDay(date) * 86_400_000);
}

/** Today's civil date in a time zone: where an empty date control starts. */
export function plainDateToday(timeZone: string): NSEPlainDate {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", calendar: "gregory" }).formatToParts(Date.now());
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

/**
 * The locale's short-date shape as a typing hint ("dd/mm/yyyy" in en-GB,
 * "m/d/yy" in en-US): 5 March 2000 formatted, with each field replaced by
 * letters as long as the locale writes it.
 */
export function plainDatePlaceholder(locale: string): string {
  const parts = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeZone: "UTC", calendar: "gregory", numberingSystem: "latn" }).formatToParts(civilToEpochDay({ year: 2000, month: 3, day: 5 }) * 86_400_000);
  return parts.map((part) => part.type === "day" ? "d".repeat(part.value.length)
    : part.type === "month" ? "m".repeat(part.value.length)
    : part.type === "year" ? "y".repeat(part.value.length)
    : part.value).join("");
}

export function formatPlainTime(value: NSEPlainTime, locale: string, options: Intl.DateTimeFormatOptions = {}): string {
  const time = validatePlainTime(value);
  const hasExplicitFields = ["timeStyle", "dayPeriod", "hour", "minute", "second", "fractionalSecondDigits"].some((key) => options[key as keyof Intl.DateTimeFormatOptions] !== undefined);
  return new Intl.DateTimeFormat(locale, { ...(hasExplicitFields ? {} : { hour: "numeric" as const, minute: "2-digit" as const }), ...options, timeZone: "UTC", calendar: "gregory" }).format(time.hour * 3_600_000 + time.minute * 60_000 + time.second * 1_000);
}

function digitMap(locale: string): Map<string, string> {
  const formatter = new Intl.NumberFormat(locale, { useGrouping: false });
  return new Map(Array.from({ length: 10 }, (_, value) => [formatter.format(value), String(value)]));
}

export function parsePlainDate(text: string, locale: string): NSEDateParseResult {
  const map = digitMap(locale);
  let normalized = "";
  for (const character of text.normalize("NFKC")) normalized += map.get(character) ?? character;
  const values = normalized.match(/\d+/g)?.map(Number) ?? [];
  if (values.length !== 3) return Object.freeze({ ok: false, code: "syntax", message: "Date must contain year, month, and day fields." });
  const sample = Date.UTC(2006, 10, 22, 12);
  const order = new Intl.DateTimeFormat(locale, { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC", calendar: "gregory" }).formatToParts(sample).filter((part) => part.type === "year" || part.type === "month" || part.type === "day").map((part) => part.type);
  const fields: Record<string, number> = {};
  order.forEach((field, index) => { fields[field] = values[index]; });
  try { return Object.freeze({ ok: true, value: validatePlainDate({ year: fields.year, month: fields.month, day: fields.day }) }); }
  catch { return Object.freeze({ ok: false, code: "invalid-date", message: "Date fields do not form a valid civil date." }); }
}
