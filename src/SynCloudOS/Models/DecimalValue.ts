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

export type DecimalRoundingMode =
  | "towards-zero"
  | "away-from-zero"
  | "half-up"
  | "half-even";

export interface DecimalDivisionOptions {
  readonly scale: number;
  readonly rounding: DecimalRoundingMode;
}

function powerOfTen(exponent: number): bigint {
  if (!Number.isSafeInteger(exponent) || exponent < 0) {
    throw new RangeError("Decimal scale must be a non-negative safe integer.");
  }
  return 10n ** BigInt(exponent);
}

function canonical(coefficient: bigint, scale: number): readonly [bigint, number] {
  powerOfTen(scale);
  if (coefficient === 0n) return [0n, 0];
  let next = coefficient;
  let nextScale = scale;
  while (nextScale > 0 && next % 10n === 0n) {
    next /= 10n;
    nextScale -= 1;
  }
  return [next, nextScale];
}

function align(
  left: DecimalValue,
  right: DecimalValue,
): readonly [bigint, bigint, number] {
  const scale = Math.max(left.scale, right.scale);
  return [
    left.coefficient * powerOfTen(scale - left.scale),
    right.coefficient * powerOfTen(scale - right.scale),
    scale,
  ];
}

export class DecimalValue {
  readonly coefficient: bigint;
  readonly scale: number;

  private constructor(coefficient: bigint, scale: number) {
    [this.coefficient, this.scale] = canonical(coefficient, scale);
    Object.freeze(this);
  }

  static parse(value: string): DecimalValue {
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(value)) {
      throw new TypeError("Invalid canonical decimal text.");
    }
    const negative = value.startsWith("-");
    const unsigned = value.replace(/^[+-]/, "");
    const [integer, fraction = ""] = unsigned.split(".");
    const coefficient = BigInt(`${integer}${fraction}`) * (negative ? -1n : 1n);
    return new DecimalValue(coefficient, fraction.length);
  }

  compare(other: DecimalValue): number {
    const [left, right] = align(this, other);
    return left < right ? -1 : left > right ? 1 : 0;
  }

  add(other: DecimalValue): DecimalValue {
    const [left, right, scale] = align(this, other);
    return new DecimalValue(left + right, scale);
  }

  subtract(other: DecimalValue): DecimalValue {
    const [left, right, scale] = align(this, other);
    return new DecimalValue(left - right, scale);
  }

  multiply(other: DecimalValue): DecimalValue {
    if (!Number.isSafeInteger(this.scale + other.scale)) {
      throw new RangeError("Decimal scale exceeds the safe integer range.");
    }
    return new DecimalValue(
      this.coefficient * other.coefficient,
      this.scale + other.scale,
    );
  }

  divide(other: DecimalValue, options: DecimalDivisionOptions): DecimalValue {
    if (other.coefficient === 0n) throw new RangeError("Cannot divide by zero.");
    if (
      !new Set<DecimalRoundingMode>([
        "towards-zero",
        "away-from-zero",
        "half-up",
        "half-even",
      ]).has(options.rounding)
    ) {
      throw new TypeError("Unsupported decimal rounding mode.");
    }
    powerOfTen(options.scale);
    const exponent = other.scale + options.scale - this.scale;
    let numerator = this.coefficient;
    let denominator = other.coefficient;
    if (exponent >= 0) numerator *= powerOfTen(exponent);
    else denominator *= powerOfTen(-exponent);
    if (denominator < 0n) {
      numerator = -numerator;
      denominator = -denominator;
    }
    let quotient = numerator / denominator;
    const remainder = numerator % denominator;
    if (remainder !== 0n) {
      const sign = numerator < 0n ? -1n : 1n;
      const absoluteRemainder = remainder < 0n ? -remainder : remainder;
      const twice = absoluteRemainder * 2n;
      const increment =
        options.rounding === "away-from-zero" ||
        (options.rounding === "half-up" && twice >= denominator) ||
        (options.rounding === "half-even" &&
          (twice > denominator ||
            (twice === denominator &&
              (quotient < 0n ? -quotient : quotient) % 2n === 1n)));
      if (increment) quotient += sign;
    }
    return new DecimalValue(quotient, options.scale);
  }

  toString(): string {
    const negative = this.coefficient < 0n;
    const digits = (negative ? -this.coefficient : this.coefficient).toString();
    if (this.scale === 0) return `${negative ? "-" : ""}${digits}`;
    const padded = digits.padStart(this.scale + 1, "0");
    const split = padded.length - this.scale;
    return `${negative ? "-" : ""}${padded.slice(0, split)}.${padded.slice(split)}`;
  }

  toJSON(): string {
    return this.toString();
  }

  valueOf(): never {
    throw new TypeError("Implicit DecimalValue number conversion is not supported.");
  }

  [Symbol.toPrimitive](hint: string): string {
    if (hint === "string") return this.toString();
    throw new TypeError("Implicit DecimalValue number conversion is not supported.");
  }
}
