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

export type NSEUnicodePropertyName =
  | "Letter"
  | "Number"
  | "Decimal_Number"
  | "White_Space"
  | "Alphabetic"
  | "Uppercase_Letter"
  | "Lowercase_Letter"
  | "Punctuation"
  | "Symbol"
  | "Mark";

const UNICODE_PROPERTIES: ReadonlySet<NSEUnicodePropertyName> = new Set([
  "Letter",
  "Number",
  "Decimal_Number",
  "White_Space",
  "Alphabetic",
  "Uppercase_Letter",
  "Lowercase_Letter",
  "Punctuation",
  "Symbol",
  "Mark",
]);

function scalar(value: string): string {
  const values = [...value];
  const codePoint = values[0]?.codePointAt(0);
  if (
    values.length !== 1 ||
    codePoint === undefined ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    throw new TypeError("Character-set membership requires exactly one Unicode scalar.");
  }
  return values[0]!;
}

export class NSECharacterSet {
  readonly #contains: (value: string) => boolean;

  private constructor(contains: (value: string) => boolean) {
    this.#contains = contains;
    Object.freeze(this);
  }

  static fromProperty(property: NSEUnicodePropertyName): NSECharacterSet {
    if (!UNICODE_PROPERTIES.has(property)) {
      throw new TypeError("Unsupported Unicode property name.");
    }
    const expression = new RegExp(`^\\p{${property}}$`, "u");
    return new NSECharacterSet((value) => expression.test(value));
  }

  static fromScalars(values: Iterable<string>): NSECharacterSet {
    const members = new Set([...values].map(scalar));
    return new NSECharacterSet((value) => members.has(value));
  }

  static union(...sets: readonly NSECharacterSet[]): NSECharacterSet {
    return new NSECharacterSet((value) => sets.some((set) => set.#contains(value)));
  }

  static intersection(
    ...sets: readonly NSECharacterSet[]
  ): NSECharacterSet {
    return new NSECharacterSet((value) => sets.every((set) => set.#contains(value)));
  }

  contains(value: string): boolean {
    return this.#contains(scalar(value));
  }

  union(...sets: readonly NSECharacterSet[]): NSECharacterSet {
    return NSECharacterSet.union(this, ...sets);
  }

  intersection(...sets: readonly NSECharacterSet[]): NSECharacterSet {
    return NSECharacterSet.intersection(this, ...sets);
  }

  inverted(): NSECharacterSet {
    return new NSECharacterSet((value) => !this.#contains(value));
  }
}
