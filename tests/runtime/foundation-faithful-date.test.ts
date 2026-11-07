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

import { expect, it } from "vitest";
import { NSEDateFormatter } from "../../src/Foundation/NSEDateFormatter";
it("formats and parses explicit numeric patterns in the configured time zone", () => {
  const f = new NSEDateFormatter({locale:"en-GB", timeZone:"UTC", dateFormat:"yyyy-MM-dd HH:mm:ss"});
  const d = new Date("2026-08-09T12:30:45Z");
  expect(f.string(d)).toBe("2026-08-09 12:30:45");
  expect(f.date("2026-08-09 12:30:45")?.toISOString()).toBe(d.toISOString());
  expect(f.date("2026-02-30 12:30:45")).toBeNull();
});
it("uses locale and date/time styles for formatting and parsing", () => {
  const f = new NSEDateFormatter({locale:"en-GB", timeZone:"UTC", dateStyle:"short", timeStyle:"short"});
  const d = new Date("2026-08-09T12:30:00Z");
  expect(f.string(d)).toBe(new Intl.DateTimeFormat("en-GB", {timeZone:"UTC", dateStyle:"short", timeStyle:"short"}).format(d));
  expect(f.date(f.string(d))?.toISOString()).toBe(d.toISOString());
});
it("rejects unsupported format tokens instead of silently reinterpreting them", () => {
  expect(() => new NSEDateFormatter({dateFormat:"yyyy Q"}).string(new Date())).toThrow(/format/i);
});

it("parses local day periods and rejects impossible wall times", () => {
  const f = new NSEDateFormatter({locale:"en-US", timeZone:"America/New_York", dateStyle:"short", timeStyle:"short"});
  const d = new Date("2026-08-09T18:30:00Z");
  expect(f.date(f.string(d))?.toISOString()).toBe(d.toISOString());
  const gap = new NSEDateFormatter({locale:"en-US", timeZone:"America/New_York", dateFormat:"yyyy-MM-dd HH:mm"});
  expect(gap.date("2026-03-08 02:30")).toBeNull();
  expect(gap.date("26-03-08 02:30")).toBeNull();
});

it("rejects unsupported calendars when parsing rather than treating them as Gregorian", () => {
  const f = new NSEDateFormatter({locale:"en-US-u-ca-buddhist", timeZone:"UTC", dateStyle:"short"});
  expect(() => f.date(f.string(new Date("2026-08-09T00:00:00Z")))).toThrow(/Gregorian/i);
});
it("round-trips localized long output and time-only output", () => {
  const d=new Date("2026-08-09T12:30:45Z");
  for (const dateStyle of ["medium","long","full"] as const) {
    const f=new NSEDateFormatter({locale:"en-GB",timeZone:"UTC",dateStyle,timeStyle:"long"});
    expect(f.date(f.string(d))?.toISOString()).toBe(d.toISOString());
  }
  const time=new NSEDateFormatter({locale:"en-GB",timeZone:"UTC",timeStyle:"short"});
  expect(time.date(time.string(d))?.toISOString()).toBe("2001-01-01T12:30:00.000Z");
});
it("preserves four-digit literal years and quoted apostrophes", () => {
  const f=new NSEDateFormatter({locale:"en-GB",timeZone:"UTC",dateFormat:"yyyy-MM-dd 'o''clock'"});
  expect(f.date("0026-03-08 o'clock")?.getUTCFullYear()).toBe(26);
  expect(f.string(new Date("2026-03-08T00:00:00Z"))).toBe("2026-03-08 o'clock");
});
it("round-trips locale digits and verifies weekday text", () => {
  const d=new Date("2026-08-09T12:30:00Z");
  const arabic=new NSEDateFormatter({locale:"ar-EG",timeZone:"UTC",dateStyle:"short",timeStyle:"short"});
  expect(arabic.date(arabic.string(d))?.toISOString()).toBe(d.toISOString());
  const full=new NSEDateFormatter({locale:"en-GB",timeZone:"UTC",dateStyle:"full"});
  expect(full.date(full.string(d))?.toISOString()).toBe("2026-08-09T00:00:00.000Z");
  expect(full.date(full.string(d).replace("Sunday","Monday"))).toBeNull();
});
it("rejects unsupported era and pattern calendars", () => {
  const f=new NSEDateFormatter({locale:"en-GB",timeZone:"UTC",dateFormat:"yyyy-MM-dd"});
  expect(f.date("0000-01-01")).toBeNull();
  expect(() => f.string(new Date("0000-01-01T00:00:00Z"))).toThrow(/era/i);
  const b=new NSEDateFormatter({locale:"en-US-u-ca-buddhist",timeZone:"UTC",dateFormat:"yyyy-MM-dd"});
  expect(() => b.string(new Date())).toThrow(/Gregorian/i);
});
