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

import {
  ByteCountFormatter,
  DateFormatter,
  NumberFormatter,
  ValueTransformerRegistry,
  composeTransformers,
  createValueTransformer,
} from "../../src/SynCloudOS/Models";

it("formats and parses locale-aware values with structured failures", () => {
  const number = new NumberFormatter({
    style: "decimal",
    minimum: 0,
    maximum: 100,
  });

  expect(number.format(1234.5, { locale: "de-DE" })).toBe("1.234,5");
  expect(number.parse("42,5", { locale: "de-DE" })).toEqual({
    ok: true,
    value: 42.5,
  });
  expect(number.parse("-2", { locale: "en-GB" })).toMatchObject({
    ok: false,
    error: { code: "number.belowMinimum" },
  });
  expect(
    new ByteCountFormatter({ unitSystem: "binary" }).format(1536, {
      locale: "en-GB",
    }),
  ).toBe("1.5 KiB");
});

it("keeps transformer registration instance-scoped and reversible", () => {
  const registry = new ValueTransformerRegistry();
  const trim = createValueTransformer<string, string>({
    id: "trim",
    transform: (value) => value.trim(),
  });
  const length = createValueTransformer<string, number>({
    id: "length",
    transform: (value) => value.length,
  });
  const reversibleNumber = createValueTransformer<string, number>({
    id: "number",
    transform: Number,
    reverse: String,
  });

  registry.register(trim);
  expect(registry.get<string, string>("trim")?.transform("  cloud  ")).toBe(
    "cloud",
  );
  expect(composeTransformers("trim-length", trim, length).transform("  cloud  ")).toBe(5);
  expect(reversibleNumber.reversible).toBe(true);
  expect(reversibleNumber.reverse?.(42)).toBe("42");
  expect(new ValueTransformerRegistry().get("trim")).toBeNull();
  expect(() => registry.register(trim)).toThrow(/already registered/i);
});

it("normalises locale digits and rejects incomplete or non-finite number input", () => {
  const number = new NumberFormatter({ maximumFractionDigits: 2 });

  expect(number.parse("١٢٫٥", { locale: "ar-EG" })).toEqual({
    ok: true,
    value: 12.5,
  });
  expect(number.parse("1e3", { locale: "en-GB" })).toMatchObject({
    ok: false,
    error: { code: "number.invalid" },
  });
  expect(number.validatePartial("-", { locale: "en-GB" })).toEqual({
    valid: true,
  });
});

it("uses explicit byte units and returns structured parse failures", () => {
  const bytes = new ByteCountFormatter({
    unitSystem: "decimal",
    allowedUnits: ["B", "kB", "MB"],
    maximumFractionDigits: 1,
  });

  expect(bytes.format(2_500_000, { locale: "en-GB" })).toBe("2.5 MB");
  expect(bytes.parse("2.5 MB", { locale: "en-GB" })).toEqual({
    ok: true,
    value: 2_500_000,
  });
  expect(bytes.parse("2 GiB", { locale: "en-GB" })).toMatchObject({
    ok: false,
    error: { code: "bytes.unit" },
  });
});

it("does not guess regional numeric dates", () => {
  const formatter = new DateFormatter({
    valueType: "iso",
    dateStyle: "medium",
    timeZone: "UTC",
  });

  expect(formatter.parse("08/09/2026", { locale: "en-GB" })).toMatchObject({
    ok: false,
    error: { code: "date.invalidISO" },
  });
  expect(
    formatter.parse("2026-08-09T12:30:00.000Z", { locale: "en-GB" }),
  ).toEqual({ ok: true, value: "2026-08-09T12:30:00.000Z" });
  expect(
    formatter.format("2026-08-09T12:30:00.000Z", { locale: "en-GB" }),
  ).toContain("9 Aug 2026");
});

it("rejects malformed grouping and preserves strict ISO civil dates", () => {
  const number = new NumberFormatter({ style: "decimal" });
  expect(number.parse("1,,2", { locale: "en-GB" })).toMatchObject({
    ok: false,
    error: { code: "number.invalid" },
  });
  expect(number.parse("12,34", { locale: "en-GB" })).toMatchObject({
    ok: false,
    error: { code: "number.invalid" },
  });

  const formatter = new DateFormatter({ valueType: "iso", dateStyle: "medium" });
  expect(formatter.parse("2026-02-30", { locale: "en-GB" })).toMatchObject({
    ok: false,
    error: { code: "date.invalidISO" },
  });
  expect(
    formatter.format("2026-08-09", {
      locale: "en-GB",
      timeZone: "America/Los_Angeles",
    }),
  ).toContain("9 Aug 2026");
});

it("round-trips accounting currency signs and configured unit affixes", () => {
  const accounting = new NumberFormatter({
    style: "currency",
    currency: "USD",
    currencySign: "accounting",
  });
  const accountingText = accounting.format(-1234.5, { locale: "en-US" });
  expect(accountingText).toBe("($1,234.50)");
  expect(accounting.parse(accountingText, { locale: "en-US" })).toEqual({
    ok: true,
    value: -1234.5,
  });

  const kilometres = new NumberFormatter({
    style: "unit",
    unit: "kilometer",
    unitDisplay: "short",
    maximumFractionDigits: 0,
  });
  const kilometreText = kilometres.format(123, { locale: "en-GB" });
  expect(kilometreText).toBe("123 km");
  expect(kilometres.parse(kilometreText, { locale: "en-GB" })).toEqual({
    ok: true,
    value: 123,
  });
});

it("keeps byte counts finite and canonical at signed zero", () => {
  const bytes = new ByteCountFormatter({ unitSystem: "binary" });

  expect(bytes.format(-0, { locale: "en-GB" })).toBe("0 B");
  const parsed = bytes.parse("-0 B", { locale: "en-GB" });
  expect(parsed).toEqual({ ok: true, value: 0 });
  if (parsed.ok) expect(Object.is(parsed.value, -0)).toBe(false);
  expect(() => bytes.editingText(-1, { locale: "en-GB" })).toThrow(/non-negative/i);
  expect(() => bytes.format(Number.POSITIVE_INFINITY, { locale: "en-GB" })).toThrow(
    /finite/i,
  );
});
