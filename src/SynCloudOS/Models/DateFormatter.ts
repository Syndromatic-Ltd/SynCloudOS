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

import {
  formatterFailure,
  type Formatter,
  type FormatterContext,
  type FormatterResult,
} from "./Formatter";

export type DateFormatterValueType = "date" | "epochMilliseconds" | "iso";
export type DateFormatterValue = Date | number | string;

export interface DateFormatterOptions extends Intl.DateTimeFormatOptions {
  readonly valueType: DateFormatterValueType;
}

const ISO_DATE = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})(?:T(?<hour>\d{2}):(?<minute>\d{2})(?::(?<second>\d{2})(?:\.(?<millisecond>\d{1,3}))?)?(?<zone>Z|[+-]\d{2}:\d{2}))?$/u;

interface ParsedISO {
  readonly date: Date;
  readonly dateOnly: boolean;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseISO(text: string): ParsedISO | null {
  const match = ISO_DATE.exec(text);
  if (!match?.groups) return null;
  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    return null;
  }
  if (match.groups.hour === undefined) {
    const date = new Date(`${text}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) ? { date, dateOnly: true } : null;
  }
  const hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute);
  const second = Number(match.groups.second ?? "0");
  const zone = match.groups.zone!;
  const offsetHour = zone === "Z" ? 0 : Number(zone.slice(1, 3));
  const offsetMinute = zone === "Z" ? 0 : Number(zone.slice(4, 6));
  if (
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return null;
  }
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? { date, dateOnly: false } : null;
}

export class DateFormatter implements Formatter<DateFormatterValue> {
  readonly #valueType: DateFormatterValueType;
  readonly #intlOptions: Intl.DateTimeFormatOptions;

  constructor(options: DateFormatterOptions) {
    const { valueType, ...intlOptions } = options;
    this.#valueType = valueType;
    this.#intlOptions = { ...intlOptions };
    Object.freeze(this);
  }

  #date(value: DateFormatterValue): Date {
    if (this.#valueType === "date" && value instanceof Date) {
      const copy = new Date(value.getTime());
      if (Number.isFinite(copy.getTime())) return copy;
    } else if (
      this.#valueType === "epochMilliseconds" &&
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return new Date(value);
    } else if (
      this.#valueType === "iso" &&
      typeof value === "string" &&
      parseISO(value)
    ) {
      return parseISO(value)!.date;
    }
    throw new RangeError(
      `Date formatter expects ${this.#valueType} values.`,
    );
  }

  format(value: DateFormatterValue, context: FormatterContext): string {
    const parsed =
      this.#valueType === "iso" && typeof value === "string"
        ? parseISO(value)
        : null;
    return new Intl.DateTimeFormat(context.locale, {
      ...this.#intlOptions,
      timeZone: parsed?.dateOnly
        ? "UTC"
        : context.timeZone ?? this.#intlOptions.timeZone,
    }).format(this.#date(value));
  }

  editingText(value: DateFormatterValue): string {
    const date = this.#date(value);
    if (this.#valueType === "date") return date.toISOString();
    if (this.#valueType === "epochMilliseconds") return String(date.getTime());
    return value as string;
  }

  parse(
    text: string,
    _context: FormatterContext,
  ): FormatterResult<DateFormatterValue> {
    const input = text.trim();
    if (this.#valueType === "epochMilliseconds") {
      if (!/^[+-]?\d+$/u.test(input)) {
        return formatterFailure(
          "date.invalidEpoch",
          "Enter epoch milliseconds as an integer.",
          text,
        );
      }
      const value = Number(input);
      if (!Number.isSafeInteger(value) || !Number.isFinite(new Date(value).getTime())) {
        return formatterFailure(
          "date.invalidEpoch",
          "Enter valid epoch milliseconds.",
          text,
        );
      }
      return { ok: true, value };
    }
    const parsed = parseISO(input);
    if (!parsed) {
      return formatterFailure(
        "date.invalidISO",
        "Enter an ISO 8601 date with an explicit time zone when time is included.",
        text,
      );
    }
    return this.#valueType === "date"
      ? { ok: true, value: parsed.date }
      : { ok: true, value: input };
  }

  validatePartial(text: string, context: FormatterContext) {
    if (text.trim() === "") return { valid: true } as const;
    const parsed = this.parse(text, context);
    if (parsed.ok || /^[0-9T:+.Z-]{1,29}$/u.test(text.trim())) {
      return { valid: true } as const;
    }
    return { valid: false, error: parsed.error } as const;
  }
}
