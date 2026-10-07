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

export interface NumberFormatterOptions extends Intl.NumberFormatOptions {
  readonly minimum?: number;
  readonly maximum?: number;
}

interface NumberSymbols {
  readonly digits: ReadonlyMap<string, string>;
  readonly decimal: string;
  readonly groups: readonly string[];
  readonly grouping: {
    readonly primary: number;
    readonly secondary: number;
  } | null;
}

const BIDI_CONTROLS = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;

function replaceAllLiteral(value: string, search: string, replacement: string): string {
  return search.length === 0 ? value : value.split(search).join(replacement);
}

function symbolsFor(
  locale: string,
  options: Intl.NumberFormatOptions,
): NumberSymbols {
  const decimalFormatter = new Intl.NumberFormat(locale, {
    ...options,
    useGrouping: true,
    minimumFractionDigits: 1,
    maximumFractionDigits: Math.max(options.maximumFractionDigits ?? 3, 1),
    signDisplay: "always",
  });
  const parts = decimalFormatter.formatToParts(-12345.6);
  const digitFormatter = new Intl.NumberFormat(locale, {
    useGrouping: false,
    maximumFractionDigits: 0,
  });
  const digits = new Map<string, string>();
  for (let digit = 0; digit <= 9; digit += 1) {
    digits.set(digitFormatter.format(digit).replace(BIDI_CONTROLS, ""), String(digit));
  }

  const groupingParts = new Intl.NumberFormat(locale, {
    ...options,
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    signDisplay: "never",
  }).formatToParts(123_456_789);
  const integerGroups = groupingParts
    .filter(({ type }) => type === "integer")
    .map(({ value }) => {
      let normalised = value.replace(BIDI_CONTROLS, "");
      for (const [digit, ascii] of digits) {
        normalised = replaceAllLiteral(normalised, digit, ascii);
      }
      return normalised;
    });

  return {
    digits,
    decimal: parts.find(({ type }) => type === "decimal")?.value ?? ".",
    groups: [...new Set(parts.filter(({ type }) => type === "group").map(({ value }) => value))],
    grouping:
      integerGroups.length >= 2
        ? {
            primary: integerGroups.at(-1)!.length,
            secondary: integerGroups.at(-2)!.length,
          }
        : null,
  };
}

interface AffixPattern {
  readonly prefix: string;
  readonly suffix: string;
  readonly sign: -1 | 1;
}

const NUMERIC_PART_TYPES = new Set([
  "integer",
  "group",
  "decimal",
  "fraction",
]);

function cleanedText(value: string): string {
  return value.replace(BIDI_CONTROLS, "").trim();
}

function supportsParsing(
  locale: string,
  options: Intl.NumberFormatOptions,
): boolean {
  const resolved = new Intl.NumberFormat(locale, options).resolvedOptions();
  return resolved.notation === "standard" && resolved.signDisplay !== "never";
}

function affixPattern(
  formatter: Intl.NumberFormat,
  value: number,
): AffixPattern | null {
  const parts = formatter.formatToParts(value);
  const first = parts.findIndex(({ type }) => NUMERIC_PART_TYPES.has(type));
  if (first < 0) return null;
  let last = first;
  for (let index = parts.length - 1; index >= first; index -= 1) {
    if (NUMERIC_PART_TYPES.has(parts[index]!.type)) {
      last = index;
      break;
    }
  }
  return {
    prefix: parts.slice(0, first).map(({ value: part }) => part).join(""),
    suffix: parts.slice(last + 1).map(({ value: part }) => part).join(""),
    sign: value < 0 || Object.is(value, -0) ? -1 : 1,
  };
}

function affixPatterns(
  locale: string,
  options: Intl.NumberFormatOptions,
): readonly AffixPattern[] {
  const formatter = new Intl.NumberFormat(locale, options);
  const values = [
    0,
    1,
    2,
    3,
    4,
    5,
    10,
    11,
    99,
    100,
    101,
    102,
    103,
    111,
    1_000,
    12_345.6,
  ];
  const patterns = new Map<string, AffixPattern>();
  for (const value of values) {
    for (const signed of [value, -value]) {
      const pattern = affixPattern(formatter, signed);
      if (!pattern) continue;
      const cleaned = {
        ...pattern,
        prefix: pattern.prefix.replace(BIDI_CONTROLS, ""),
        suffix: pattern.suffix.replace(BIDI_CONTROLS, ""),
      };
      patterns.set(
        `${cleaned.sign}:${cleaned.prefix.length}:${cleaned.prefix}:${cleaned.suffix}`,
        cleaned,
      );
    }
  }
  return Object.freeze(
    [...patterns.values()].sort(
      (left, right) =>
        right.prefix.length + right.suffix.length -
        (left.prefix.length + left.suffix.length),
    ),
  );
}

function validGrouping(text: string, symbols: NumberSymbols): boolean {
  const unsigned = text.replace(/^[+-]/u, "");
  const parts = unsigned.split(symbols.decimal);
  if (parts.length > 2) return false;
  const integer = parts[0] ?? "";
  const usedGroups = symbols.groups.filter((group) => integer.includes(group));
  if (usedGroups.length === 0) return true;
  if (!symbols.grouping || usedGroups.length !== 1) return false;
  const groups = integer.split(usedGroups[0]!);
  if (groups.some((group) => !/^\d+$/u.test(group))) return false;
  if (groups.at(-1)!.length !== symbols.grouping.primary) return false;
  if (
    groups[0]!.length < 1 ||
    groups[0]!.length > symbols.grouping.secondary
  ) {
    return false;
  }
  return groups
    .slice(1, -1)
    .every((group) => group.length === symbols.grouping!.secondary);
}

function normaliseNumberText(
  text: string,
  context: FormatterContext,
  options: Intl.NumberFormatOptions,
): string | null {
  if (!supportsParsing(context.locale, options)) return null;
  const symbols = symbolsFor(context.locale, options);
  const input = cleanedText(text);
  const pattern = affixPatterns(context.locale, options).find(
    ({ prefix, suffix }) =>
      input.startsWith(prefix) &&
      input.endsWith(suffix) &&
      input.length >= prefix.length + suffix.length,
  );
  if (!pattern) return null;
  let normalised = input.slice(
    pattern.prefix.length,
    input.length - pattern.suffix.length,
  );

  for (const [digit, ascii] of [...symbols.digits].sort(
    ([left], [right]) => right.length - left.length,
  )) {
    normalised = replaceAllLiteral(normalised, digit, ascii);
  }
  if (!validGrouping(normalised, symbols)) return null;
  for (const group of symbols.groups) {
    normalised = replaceAllLiteral(normalised, group, "");
  }
  normalised = replaceAllLiteral(normalised, symbols.decimal, ".");
  const numeric = normalised.trim();
  if (pattern.sign < 0) return `-${numeric}`;
  return numeric;
}

export class NumberFormatter implements Formatter<number> {
  readonly #minimum: number | undefined;
  readonly #maximum: number | undefined;
  readonly #intlOptions: Intl.NumberFormatOptions;

  constructor(options: NumberFormatterOptions = {}) {
    const { minimum, maximum, ...intlOptions } = options;
    if (minimum !== undefined && !Number.isFinite(minimum)) {
      throw new RangeError("Number formatter minimum must be finite.");
    }
    if (maximum !== undefined && !Number.isFinite(maximum)) {
      throw new RangeError("Number formatter maximum must be finite.");
    }
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
      throw new RangeError("Number formatter minimum must not exceed maximum.");
    }
    this.#minimum = minimum;
    this.#maximum = maximum;
    this.#intlOptions = { ...intlOptions };
    Object.freeze(this);
  }

  format(value: number, context: FormatterContext): string {
    if (!Number.isFinite(value)) {
      throw new RangeError("Number formatter values must be finite.");
    }
    return new Intl.NumberFormat(context.locale, this.#intlOptions).format(value);
  }

  editingText(value: number, context: FormatterContext): string {
    if (!Number.isFinite(value)) {
      throw new RangeError("Number formatter values must be finite.");
    }
    return new Intl.NumberFormat(context.locale, {
      ...this.#intlOptions,
      useGrouping: false,
    }).format(value);
  }

  parse(text: string, context: FormatterContext): FormatterResult<number> {
    const normalised = normaliseNumberText(text, context, this.#intlOptions);
    if (
      normalised === null ||
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalised)
    ) {
      return formatterFailure(
        "number.invalid",
        "Enter a valid finite number.",
        text,
      );
    }
    let value = Number(normalised);
    if (this.#intlOptions.style === "percent") value /= 100;
    if (!Number.isFinite(value)) {
      return formatterFailure(
        "number.invalid",
        "Enter a valid finite number.",
        text,
      );
    }
    if (this.#minimum !== undefined && value < this.#minimum) {
      return formatterFailure(
        "number.belowMinimum",
        `Enter a value of at least ${this.#minimum}.`,
        text,
      );
    }
    if (this.#maximum !== undefined && value > this.#maximum) {
      return formatterFailure(
        "number.aboveMaximum",
        `Enter a value no greater than ${this.#maximum}.`,
        text,
      );
    }
    return { ok: true, value };
  }

  validatePartial(text: string, context: FormatterContext) {
    const normalised = normaliseNumberText(text, context, this.#intlOptions);
    if (
      normalised !== null &&
      normalised === "" ||
      normalised !== null &&
      normalised === "+" ||
      normalised !== null &&
      normalised === "-" ||
      (normalised !== null && /^[+-]?(?:\d+(?:\.\d*)?|\.\d*)$/.test(normalised))
    ) {
      return { valid: true } as const;
    }
    return {
      valid: false,
      error: {
        code: "number.partialInvalid",
        message: "Enter digits and one decimal separator only.",
        input: text,
      },
    } as const;
  }
}
