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

import { clampPointToRect, insetRect, intersectRects, unionRects } from "../../src/FX/GraphicsFX/GFXGeometry";
import { CountedSet, DecimalValue, UnicodeCharacterSet, intersectRanges, normaliseRange } from "../../src/SynCloudOS/Models";

describe("native model value boundaries", () => {
  it("preserves counts instead of pretending a counted set is a plain Set", () => {
    const values = new CountedSet(["draft", "draft", "saved"]);
    expect(values.count("draft")).toBe(2);
    expect(values.size).toBe(2);
    expect(values.totalCount).toBe(3);
    const iterator = values[Symbol.iterator]();
    values.add("later");
    expect([...iterator]).toEqual(["draft", "saved"]);
    values.delete("draft");
    expect(values.count("draft")).toBe(1);
    expect(values.deleteAll("draft")).toBe(1);
    expect([...values]).toEqual(["saved", "later"]);
    expect(() => values.add("bad", 0)).toThrow(/positive safe integer/i);
    const overflow = new CountedSet<string>();
    overflow.add("full", Number.MAX_SAFE_INTEGER);
    expect(() => overflow.add("full")).toThrow(/safe integer range/i);
    expect(() => overflow.add("other")).toThrow(/safe integer range/i);
  });

  it("handles Unicode scalar properties without UTF-16 code-unit assumptions", () => {
    const letters = UnicodeCharacterSet.fromProperty("Letter");
    expect(letters.contains("é")).toBe(true);
    expect(letters.contains("𐐀")).toBe(true);
    expect(letters.contains("7")).toBe(false);
    expect(() => letters.contains("ab")).toThrow(/one Unicode scalar/i);
    expect(() => letters.contains("\ud800")).toThrow(/one Unicode scalar/i);
    const hexadecimal = UnicodeCharacterSet.fromScalars(["A", "B", "7"]);
    expect(letters.intersection(hexadecimal).contains("A")).toBe(true);
    expect(letters.intersection(hexadecimal).contains("7")).toBe(false);
    expect(letters.inverted().contains("7")).toBe(true);
  });

  it("keeps exact decimal arithmetic and rounding deliberate", () => {
    expect(
      DecimalValue.parse("0.1").add(DecimalValue.parse("0.2")).toString(),
    ).toBe("0.3");
    expect(
      DecimalValue.parse("1").divide(DecimalValue.parse("3"), {
        scale: 4,
        rounding: "half-even",
      }).toString(),
    ).toBe("0.3333");
    expect(
      DecimalValue.parse("2.5").divide(DecimalValue.parse("1"), {
        scale: 0,
        rounding: "half-even",
      }).toString(),
    ).toBe("2");
    expect(
      DecimalValue.parse("3.5").divide(DecimalValue.parse("1"), {
        scale: 0,
        rounding: "half-even",
      }).toString(),
    ).toBe("4");
    expect(DecimalValue.parse("2.5").subtract(DecimalValue.parse("0.5")).toString()).toBe("2");
    expect(DecimalValue.parse("1.2").multiply(DecimalValue.parse("3")).toString()).toBe("3.6");
    expect(DecimalValue.parse("1.20").compare(DecimalValue.parse("1.2"))).toBe(0);
    expect(() => DecimalValue.parse("1e3")).toThrow(/decimal/i);
    expect(() =>
      DecimalValue.parse("1").divide(DecimalValue.parse("3"), {
        scale: 2,
        rounding: "invalid" as "half-even",
      }),
    ).toThrow(/rounding/i);
    expect(() => Number(DecimalValue.parse("1.2"))).toThrow(/implicit/i);
  });

  it("normalises serialisable geometry and range values immutably", () => {
    const intersection = intersectRects(
      { x: 0, y: 0, width: 20, height: 10 },
      { x: 15, y: 5, width: 20, height: 20 },
    );
    expect(intersection).toEqual({ x: 15, y: 5, width: 5, height: 5 });
    expect(Object.isFrozen(intersection)).toBe(true);
    expect(
      unionRects(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 5, y: -5, width: 10, height: 5 },
      ),
    ).toEqual({ x: 0, y: -5, width: 15, height: 15 });
    expect(
      insetRect({ x: 0, y: 0, width: 10, height: 8 }, 2, 1),
    ).toEqual({ x: 2, y: 1, width: 6, height: 6 });
    expect(
      clampPointToRect(
        { x: 20, y: -1 },
        { x: 0, y: 0, width: 10, height: 10 },
      ),
    ).toEqual({ x: 10, y: 0 });
    expect(normaliseRange({ location: 8, length: 3 })).toEqual({
      location: 8,
      length: 3,
    });
    expect(
      intersectRanges(
        { location: 3, length: 8 },
        { location: 7, length: 5 },
      ),
    ).toEqual({ location: 7, length: 4 });
    expect(() => normaliseRange({ location: 0, length: -1 })).toThrow(/length/i);
  });
});
