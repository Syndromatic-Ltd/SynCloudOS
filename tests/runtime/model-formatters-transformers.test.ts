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
import { NSEByteCountFormatter, NSENumberFormatter } from "../../src/Foundation/public";

it("formats and parses locale-aware values with structured failures", () => {
  const number = new NSENumberFormatter({
    style: "decimal",
    minimum: 0,
    maximum: 100,
  });

  expect(number.string(1234.5, { locale: "de-DE" })).toBe("1.234,5");
  expect(number.getObjectValue("42,5", { locale: "de-DE" })).toEqual({
    ok: true,
    value: 42.5,
  });
  expect(number.getObjectValue("-2", { locale: "en-GB" })).toMatchObject({
    ok: false,
    error: { code: "number.belowMinimum" },
  });
  expect(
    new NSEByteCountFormatter({ unitSystem: "binary" }).string(1536, {
      locale: "en-GB",
    }),
  ).toBe("1.5 KiB");
});

it("normalises locale digits and rejects incomplete or non-finite number input", () => {
  const number = new NSENumberFormatter({ maximumFractionDigits: 2 });

  expect(number.getObjectValue("١٢٫٥", { locale: "ar-EG" })).toEqual({
    ok: true,
    value: 12.5,
  });
  expect(number.getObjectValue("1e3", { locale: "en-GB" })).toMatchObject({
    ok: false,
    error: { code: "number.invalid" },
  });
  expect(number.isPartialStringValid("-", { locale: "en-GB" })).toEqual({
    valid: true,
  });
});

it("uses explicit byte units and returns structured parse failures", () => {
  const bytes = new NSEByteCountFormatter({
    unitSystem: "decimal",
    allowedUnits: ["B", "kB", "MB"],
    maximumFractionDigits: 1,
  });

  expect(bytes.string(2_500_000, { locale: "en-GB" })).toBe("2.5 MB");
  expect(bytes.getObjectValue("2.5 MB", { locale: "en-GB" })).toEqual({
    ok: true,
    value: 2_500_000,
  });
  expect(bytes.getObjectValue("2 GiB", { locale: "en-GB" })).toMatchObject({
    ok: false,
    error: { code: "bytes.unit" },
  });
});

it("rejects malformed grouping and impossible dates", () => {
  const number = new NSENumberFormatter({ style: "decimal" });
  expect(number.getObjectValue("1,,2", { locale: "en-GB" })).toMatchObject({ok:false});
  expect(number.getObjectValue("12,34", { locale: "en-GB" })).toMatchObject({ok:false});
  const date = new NSEDateFormatter({locale:"en-GB", timeZone:"UTC", dateFormat:"yyyy-MM-dd"});
  expect(date.date("2026-02-30")).toBeNull();
  expect(date.string(new Date("2026-08-09T00:00:00Z"))).toBe("2026-08-09");
});

it("round-trips accounting currency signs and configured unit affixes", () => {
  const accounting = new NSENumberFormatter({
    style: "currency",
    currency: "USD",
    currencySign: "accounting",
  });
  const accountingText = accounting.string(-1234.5, { locale: "en-US" });
  expect(accountingText).toBe("($1,234.50)");
  expect(accounting.getObjectValue(accountingText, { locale: "en-US" })).toEqual({
    ok: true,
    value: -1234.5,
  });

  const kilometres = new NSENumberFormatter({
    style: "unit",
    unit: "kilometer",
    unitDisplay: "short",
    maximumFractionDigits: 0,
  });
  const kilometreText = kilometres.string(123, { locale: "en-GB" });
  expect(kilometreText).toBe("123 km");
  expect(kilometres.getObjectValue(kilometreText, { locale: "en-GB" })).toEqual({
    ok: true,
    value: 123,
  });
});

it("keeps byte counts finite and canonical at signed zero", () => {
  const bytes = new NSEByteCountFormatter({ unitSystem: "binary" });

  expect(bytes.string(-0, { locale: "en-GB" })).toBe("0 B");
  const parsed = bytes.getObjectValue("-0 B", { locale: "en-GB" });
  expect(parsed).toEqual({ ok: true, value: 0 });
  if (parsed.ok) expect(Object.is(parsed.value, -0)).toBe(false);
  expect(() => bytes.editingString(-1, { locale: "en-GB" })).toThrow(/non-negative/i);
  expect(() => bytes.string(Number.POSITIVE_INFINITY, { locale: "en-GB" })).toThrow(
    /finite/i,
  );
});
