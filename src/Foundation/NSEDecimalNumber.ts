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

export type NSEDecimalRoundingMode = "plain" | "down" | "up" | "bankers";
export interface NSEDecimalNumberHandlerOptions {
  readonly roundingMode?: NSEDecimalRoundingMode;
  /** Decimal places; omitted retains up to 38 significant digits. */
  readonly scale?: number;
  readonly raiseOnExactness?: boolean;
  readonly raiseOnOverflow?: boolean;
  readonly raiseOnUnderflow?: boolean;
  readonly raiseOnDivideByZero?: boolean;
}
export interface NSEDecimalNumberBehaviors {
  readonly roundingMode: NSEDecimalRoundingMode;
  readonly scale: number | undefined;
  readonly raiseOnExactness: boolean;
  readonly raiseOnOverflow: boolean;
  readonly raiseOnUnderflow: boolean;
  readonly raiseOnDivideByZero: boolean;
  exceptionDuringOperation?(operation: "add" | "subtract" | "multiply" | "divide" | "round", error: RangeError, left: NSEDecimalNumber, right: NSEDecimalNumber | null): NSEDecimalNumber | null;
}
export class NSEDecimalNumberHandler implements NSEDecimalNumberBehaviors {
  readonly roundingMode: NSEDecimalRoundingMode;
  readonly scale: number | undefined;
  readonly raiseOnExactness: boolean;
  readonly raiseOnOverflow: boolean;
  readonly raiseOnUnderflow: boolean;
  readonly raiseOnDivideByZero: boolean;
  constructor(options: NSEDecimalNumberHandlerOptions = {}) {
    this.roundingMode = options.roundingMode ?? "plain";
    if (!["plain", "down", "up", "bankers"].includes(this.roundingMode)) throw new TypeError("Unsupported rounding mode.");
    if (options.scale !== undefined && (!Number.isInteger(options.scale) || options.scale < -127 || options.scale > 128)) throw new RangeError("Decimal scale must be between -127 and 128.");
    this.scale = options.scale;
    this.raiseOnExactness = options.raiseOnExactness ?? false;
    this.raiseOnOverflow = options.raiseOnOverflow ?? true;
    this.raiseOnUnderflow = options.raiseOnUnderflow ?? true;
    this.raiseOnDivideByZero = options.raiseOnDivideByZero ?? true;
    Object.freeze(this);
  }
}
const parsingBehavior = new NSEDecimalNumberHandler();
let defaultBehavior: NSEDecimalNumberBehaviors = parsingBehavior;
const pow10 = (n: number) => 10n ** BigInt(n);
const abs = (n: bigint) => n < 0n ? -n : n;
const digits = (n: bigint) => abs(n).toString().length;
function rounded(n: bigint, d: bigint, h: NSEDecimalNumberBehaviors): bigint {
  if (d < 0n) { n = -n; d = -d; }
  let q = n / d;
  const r = n % d;
  if (r === 0n) return q;
  if (h.raiseOnExactness) throw new RangeError("Decimal loss of precision.");
  const sign = n < 0n ? -1n : 1n, twice = abs(r) * 2n;
  if ((h.roundingMode === "down" && sign < 0n) || (h.roundingMode === "up" && sign > 0n) ||
      (h.roundingMode === "plain" && twice >= d) ||
      (h.roundingMode === "bankers" && (twice > d || (twice === d && abs(q) % 2n === 1n)))) q += sign;
  return q;
}
/** Decimal arithmetic with a maximum of 38 significant digits and exponent -128...127. */
export class NSEDecimalNumber {
  readonly #coefficient: bigint;
  readonly #exponent: number;
  readonly #isNaN: boolean;
  private constructor(coefficient: bigint, exponent: number, isNaN = false) {
    this.#coefficient = coefficient; this.#exponent = exponent; this.#isNaN = isNaN; Object.freeze(this);
  }
  static readonly zero = new NSEDecimalNumber(0n, 0);
  static readonly one = new NSEDecimalNumber(1n, 0);
  static get defaultBehavior(): NSEDecimalNumberBehaviors { return defaultBehavior; }
  static set defaultBehavior(value: NSEDecimalNumberBehaviors) { defaultBehavior = value; }
  static readonly notANumber = new NSEDecimalNumber(0n, 0, true);
  static #make(coefficient: bigint, exponent: number, h: NSEDecimalNumberBehaviors): NSEDecimalNumber {
    if (!Number.isSafeInteger(exponent)) throw new RangeError("Decimal exponent is out of range.");
    if (coefficient === 0n) return new NSEDecimalNumber(0n, 0);
    while (coefficient % 10n === 0n && exponent < 127) { coefficient /= 10n; exponent++; }
    if (exponent + digits(coefficient) - 1 < -128) {
      if (h.raiseOnUnderflow) throw new RangeError("Decimal underflow.");
      return NSEDecimalNumber.notANumber;
    }
    let drop = Math.max(0, digits(coefficient) - 38, -128 - exponent, h.scale === undefined ? 0 : -h.scale - exponent);
    if (drop) {
      coefficient = rounded(coefficient, pow10(drop), h);
      exponent += drop;
    }
    if (coefficient === 0n) return new NSEDecimalNumber(0n, 0);
    if (digits(coefficient) > 38) { coefficient /= 10n; exponent++; }
    while (coefficient % 10n === 0n && exponent < 127) { coefficient /= 10n; exponent++; }
    if (exponent > 127) {
      drop = exponent - 127;
      if (drop <= 38 - digits(coefficient)) { coefficient *= pow10(drop); exponent = 127; }
      else { if (h.raiseOnOverflow) throw new RangeError("Decimal overflow."); return NSEDecimalNumber.notANumber; }
    }
    if (exponent < -128) { if (h.raiseOnUnderflow) throw new RangeError("Decimal underflow."); return NSEDecimalNumber.notANumber; }
    return new NSEDecimalNumber(coefficient, exponent);
  }
  static fromString(value: string): NSEDecimalNumber {
    const m = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value);
    if (!m) throw new TypeError("Invalid decimal string.");
    const exponent = Number(m[4] ?? 0) - (m[3]?.length ?? 0);
    return NSEDecimalNumber.#make(BigInt(`${m[1]}${m[2]}${m[3] ?? ""}`), exponent, parsingBehavior);
  }
  #perform(other: NSEDecimalNumber, op: "add" | "subtract" | "multiply" | "divide", h: NSEDecimalNumberBehaviors): NSEDecimalNumber {
    if (this.#isNaN || other.#isNaN) return NSEDecimalNumber.notANumber;
    if (op === "divide" && other.#coefficient === 0n) {
      if (h.raiseOnDivideByZero) throw new RangeError("Decimal divide by zero.");
      return NSEDecimalNumber.notANumber;
    }
    let coefficient: bigint, exponent: number;
    if (op === "multiply") { coefficient = this.#coefficient * other.#coefficient; exponent = this.#exponent + other.#exponent; }
    else if (op === "divide") {
      const numerator = abs(this.#coefficient), denominator = abs(other.#coefficient);
      let magnitude = digits(numerator) - digits(denominator);
      if (magnitude >= 0 ? numerator < denominator * pow10(magnitude) : numerator * pow10(-magnitude) < denominator) magnitude--;
      magnitude += this.#exponent - other.#exponent;
      if (this.#coefficient !== 0n && magnitude < -128) {
        if (h.raiseOnUnderflow) throw new RangeError("Decimal underflow.");
        return NSEDecimalNumber.notANumber;
      }
      exponent = Math.max(magnitude - 37, h.scale === undefined ? -128 : -h.scale, -128);
      const shift = this.#exponent - other.#exponent - exponent;
      coefficient = shift >= 0
        ? rounded(this.#coefficient * pow10(shift), other.#coefficient, h)
        : rounded(this.#coefficient, other.#coefficient * pow10(-shift), h);
    } else {
      exponent = Math.min(this.#exponent, other.#exponent);
      const a = this.#coefficient * pow10(this.#exponent - exponent), b = other.#coefficient * pow10(other.#exponent - exponent);
      coefficient = op === "add" ? a + b : a - b;
    }
    return NSEDecimalNumber.#make(coefficient, exponent, h);
  }
  #operate(other: NSEDecimalNumber, op: "add" | "subtract" | "multiply" | "divide", h: NSEDecimalNumberBehaviors): NSEDecimalNumber {
    try { return this.#perform(other, op, h); }
    catch (error) {
      if (error instanceof RangeError) {
        const replacement = h.exceptionDuringOperation?.(op, error, this, other);
        if (replacement != null) return replacement;
      }
      throw error;
    }
  }
  adding(other: NSEDecimalNumber, behavior = defaultBehavior): NSEDecimalNumber { return this.#operate(other, "add", behavior); }
  subtracting(other: NSEDecimalNumber, behavior = defaultBehavior): NSEDecimalNumber { return this.#operate(other, "subtract", behavior); }
  multiplying(other: NSEDecimalNumber, behavior = defaultBehavior): NSEDecimalNumber { return this.#operate(other, "multiply", behavior); }
  dividing(other: NSEDecimalNumber, behavior = defaultBehavior): NSEDecimalNumber { return this.#operate(other, "divide", behavior); }
  rounding(behavior: NSEDecimalNumberBehaviors = defaultBehavior): NSEDecimalNumber {
    try { return this.#isNaN ? this : NSEDecimalNumber.#make(this.#coefficient, this.#exponent, behavior); }
    catch (error) { if (error instanceof RangeError) { const replacement=behavior.exceptionDuringOperation?.("round",error,this,null); if (replacement != null) return replacement; } throw error; }
  }
  compare(other: NSEDecimalNumber): number {
    if (this.#isNaN || other.#isNaN) throw new RangeError("Cannot compare NaN.");
    const e = Math.min(this.#exponent, other.#exponent), a = this.#coefficient * pow10(this.#exponent-e), b = other.#coefficient * pow10(other.#exponent-e);
    return a < b ? -1 : a > b ? 1 : 0;
  }
  toString(): string {
    if (this.#isNaN) return "NaN";
    const sign = this.#coefficient < 0n ? "-" : "", raw = abs(this.#coefficient).toString();
    if (this.#exponent >= 0) return sign + raw + "0".repeat(this.#exponent);
    const padded = raw.padStart(1-this.#exponent, "0");
    return sign + padded.slice(0, this.#exponent) + "." + padded.slice(this.#exponent);
  }
  toJSON(): string { return this.toString(); }
}
