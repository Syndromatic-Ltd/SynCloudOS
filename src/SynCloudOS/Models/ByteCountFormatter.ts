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
import { NumberFormatter } from "./NumberFormatter";

export type ByteUnitSystem = "decimal" | "binary";
export type DecimalByteUnit = "B" | "kB" | "MB" | "GB" | "TB" | "PB";
export type BinaryByteUnit = "B" | "KiB" | "MiB" | "GiB" | "TiB" | "PiB";
export type ByteUnit = DecimalByteUnit | BinaryByteUnit;

export interface ByteCountFormatterOptions {
  readonly unitSystem: ByteUnitSystem;
  readonly allowedUnits?: readonly ByteUnit[];
  readonly minimumFractionDigits?: number;
  readonly maximumFractionDigits?: number;
  readonly includeCount?: boolean;
  readonly includeUnit?: boolean;
  readonly includeActualByteCount?: boolean;
}

const DECIMAL_UNITS = ["B", "kB", "MB", "GB", "TB", "PB"] as const;
const BINARY_UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"] as const;

export class ByteCountFormatter implements Formatter<number> {
  readonly #units: readonly ByteUnit[];
  readonly #base: number;
  readonly #options: ByteCountFormatterOptions;

  constructor(options: ByteCountFormatterOptions) {
    const available = options.unitSystem === "binary" ? BINARY_UNITS : DECIMAL_UNITS;
    const units = options.allowedUnits ?? available;
    if (units.length === 0 || units.some((unit) => !available.includes(unit as never))) {
      throw new TypeError(
        `Byte units must belong to the ${options.unitSystem} unit system.`,
      );
    }
    this.#units = Object.freeze([...new Set(units)]);
    this.#base = options.unitSystem === "binary" ? 1024 : 1000;
    this.#options = { ...options };
    Object.freeze(this);
  }

  #factor(unit: ByteUnit): number {
    const available = this.#options.unitSystem === "binary" ? BINARY_UNITS : DECIMAL_UNITS;
    return this.#base ** available.indexOf(unit as never);
  }

  #displayUnit(bytes: number): ByteUnit {
    const magnitude = Math.abs(bytes);
    return [...this.#units]
      .sort((left, right) => this.#factor(right) - this.#factor(left))
      .find((unit) => magnitude >= this.#factor(unit)) ?? this.#units[0]!;
  }

  #normaliseByteCount(value: number): number {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError("Byte counts must be finite and non-negative.");
    }
    return Object.is(value, -0) ? 0 : value;
  }

  format(value: number, context: FormatterContext): string {
    value = this.#normaliseByteCount(value);
    const unit = this.#displayUnit(value);
    const count = value / this.#factor(unit);
    const number = new NumberFormatter({
      minimumFractionDigits: this.#options.minimumFractionDigits,
      maximumFractionDigits: this.#options.maximumFractionDigits ?? 1,
    }).format(count, context);
    const parts: string[] = [];
    if (this.#options.includeCount ?? true) parts.push(number);
    if (this.#options.includeUnit ?? true) parts.push(unit);
    let result = parts.join(" ");
    if (this.#options.includeActualByteCount) {
      const actual = new NumberFormatter({ maximumFractionDigits: 0 }).format(
        value,
        context,
      );
      result = `${result}${result ? " " : ""}(${actual} bytes)`;
    }
    return result;
  }

  editingText(value: number, context: FormatterContext): string {
    value = this.#normaliseByteCount(value);
    return new NumberFormatter({
      maximumFractionDigits: 0,
      useGrouping: false,
    }).editingText(value, context);
  }

  parse(text: string, context: FormatterContext): FormatterResult<number> {
    const trimmed = text.trim();
    const match = /^(.*?)(?:\s*([A-Za-z]+))?$/.exec(trimmed);
    const unit = (match?.[2] ?? "B") as ByteUnit;
    if (!this.#units.includes(unit)) {
      return formatterFailure(
        "bytes.unit",
        `Use one of these byte units: ${this.#units.join(", ")}.`,
        text,
      );
    }
    const parsed = new NumberFormatter({ minimum: 0 }).parse(
      match?.[1]?.trim() ?? "",
      context,
    );
    if (!parsed.ok) {
      return formatterFailure("bytes.invalid", parsed.error.message, text);
    }
    const value = parsed.value * this.#factor(unit);
    if (!Number.isFinite(value)) {
      return formatterFailure(
        "bytes.invalid",
        "Enter a finite byte count.",
        text,
      );
    }
    return { ok: true, value: Object.is(value, -0) ? 0 : value };
  }

  validatePartial(text: string, context: FormatterContext) {
    const match = /^(.*?)(?:\s*([A-Za-z]*))?$/.exec(text.trim());
    const unit = match?.[2] ?? "";
    const number = new NumberFormatter({ minimum: 0 }).validatePartial(
      match?.[1] ?? "",
      context,
    );
    return {
      valid:
        number.valid &&
        (unit.length === 0 || this.#units.some((candidate) => candidate.startsWith(unit))),
      ...(!number.valid ? { error: number.error } : {}),
    };
  }
}
