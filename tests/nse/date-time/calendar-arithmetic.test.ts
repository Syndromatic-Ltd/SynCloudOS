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

import { describe, expect, it } from "vitest";

import {
  addCalendarDays,
  addCalendarMonths,
  calendarWeekStart,
  clampPlainDate,
  formatPlainDate,
  formatPlainTime,
  isoWeekNumber,
  parsePlainDate,
  resolveZonedDateTime,
  validatePlainTime,
  validateDateRange,
} from "../../../src/NSE/DateTime";

describe("civil date and time arithmetic", () => {
  it("handles leap years and month overflow without host-local Date parsing", () => {
    expect(addCalendarDays({ year: 2024, month: 2, day: 28 }, 1)).toEqual({ year: 2024, month: 2, day: 29 });
    expect(addCalendarDays({ year: 2023, month: 2, day: 28 }, 1)).toEqual({ year: 2023, month: 3, day: 1 });
    expect(addCalendarMonths({ year: 2024, month: 1, day: 31 }, 1)).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it("clamps dates and validates ordered inclusive ranges", () => {
    expect(clampPlainDate({ year: 2020, month: 1, day: 1 }, { year: 2024, month: 1, day: 1 }, { year: 2025, month: 1, day: 1 })).toEqual({ year: 2024, month: 1, day: 1 });
    expect(validateDateRange({ start: { year: 2025, month: 1, day: 2 }, end: { year: 2025, month: 1, day: 1 } })).toEqual({ ok: false, reason: "reversed" });
  });

  it("resolves London DST gaps and folds with explicit disambiguation", () => {
    const gap = resolveZonedDateTime({ date: { year: 2026, month: 3, day: 29 }, time: { hour: 1, minute: 30, second: 0 } }, "Europe/London", "reject");
    expect(gap).toEqual({ kind: "nonexistent" });
    const rejectedFold = resolveZonedDateTime({ date: { year: 2026, month: 10, day: 25 }, time: { hour: 1, minute: 30, second: 0 } }, "Europe/London", "reject");
    expect(rejectedFold).toMatchObject({ kind: "ambiguous", candidates: expect.arrayContaining([expect.any(Number), expect.any(Number)]) });
    const earlier = resolveZonedDateTime({ date: { year: 2026, month: 10, day: 25 }, time: { hour: 1, minute: 30, second: 0 } }, "Europe/London", "earlier");
    const later = resolveZonedDateTime({ date: { year: 2026, month: 10, day: 25 }, time: { hour: 1, minute: 30, second: 0 } }, "Europe/London", "later");
    expect(earlier.kind).toBe("resolved");
    expect(later.kind).toBe("resolved");
    if (earlier.kind === "resolved" && later.kind === "resolved") expect(later.value.epochMilliseconds - earlier.value.epochMilliseconds).toBe(3_600_000);
  });

  it("handles non-hour Lord Howe folds and Apia's skipped civil day", () => {
    const early = resolveZonedDateTime({ date: { year: 2026, month: 4, day: 5 }, time: { hour: 1, minute: 45, second: 0 } }, "Australia/Lord_Howe", "earlier");
    const late = resolveZonedDateTime({ date: { year: 2026, month: 4, day: 5 }, time: { hour: 1, minute: 45, second: 0 } }, "Australia/Lord_Howe", "later");
    expect(early.kind).toBe("resolved"); expect(late.kind).toBe("resolved");
    if (early.kind === "resolved" && late.kind === "resolved") expect(late.value.epochMilliseconds - early.value.epochMilliseconds).toBe(1_800_000);
    expect(resolveZonedDateTime({ date: { year: 2011, month: 12, day: 30 }, time: { hour: 12, minute: 0, second: 0 } }, "Pacific/Apia", "reject")).toEqual({ kind: "nonexistent" });
  });

  it("returns bounded results for invalid, UTC, and fixed-offset zone identifiers", () => {
    const input = { date: { year: 2026, month: 7, day: 12 }, time: { hour: 13, minute: 5, second: 0 } } as const;
    expect(resolveZonedDateTime(input, "Not/A_Zone", "reject")).toEqual({ kind: "invalid-time-zone", timeZone: "Not/A_Zone" });
    expect(resolveZonedDateTime(input, "UTC", "reject")).toMatchObject({ kind: "resolved", value: { timeZone: "UTC" }, disambiguation: "unique" });
    expect(resolveZonedDateTime(input, "Etc/GMT-1", "reject")).toMatchObject({ kind: "resolved", value: { timeZone: "Etc/GMT-1" }, disambiguation: "unique" });
    expect(() => validatePlainTime({ hour: 24, minute: 0, second: 0 })).toThrow(/Invalid civil time/);
  });

  it("uses locale week starts and stable ISO week numbers", () => {
    expect(calendarWeekStart("en-GB")).toBe(1);
    expect(calendarWeekStart("en-US")).toBe(0);
    expect(calendarWeekStart("ar-SA")).toBe(0);
    expect(calendarWeekStart("dv-MV")).toBe(5);
    expect(calendarWeekStart("fa-IR")).toBe(6);
    expect(calendarWeekStart("en-AE")).toBe(1);
    expect(isoWeekNumber({ year: 2021, month: 1, day: 1 })).toEqual({ week: 53, weekYear: 2020 });
  });

  it("formats 12/24-hour values and localized Arabic digits", () => {
    expect(formatPlainTime({ hour: 13, minute: 5, second: 0 }, "en-GB", { hour12: false })).toMatch(/13.*05/);
    expect(formatPlainTime({ hour: 13, minute: 5, second: 0 }, "en-US", { hour12: true })).toMatch(/1.*05.*PM/i);
    expect(formatPlainDate({ year: 2026, month: 7, day: 12 }, "ar-EG")).toMatch(/[٠-٩]/);
    expect(formatPlainDate({ year: 2026, month: 7, day: 12 }, "th-TH-u-ca-buddhist", { year: "numeric" })).toMatch(/2026|๒๐๒๖/);
  });

  it("parses locale field order and digits without locale-string guessing", () => {
    expect(parsePlainDate("12/07/2026", "en-GB")).toEqual({ ok: true, value: { year: 2026, month: 7, day: 12 } });
    expect(parsePlainDate("١٢‏/٧‏/٢٠٢٦", "ar-EG")).toEqual({ ok: true, value: { year: 2026, month: 7, day: 12 } });
    expect(parsePlainDate("31/02/2026", "en-GB")).toMatchObject({ ok: false });
  });
});
