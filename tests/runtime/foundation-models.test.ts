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
import { NSEIndexPath } from "../../src/Foundation/NSEIndexPath";
import { NSEIndexSet } from "../../src/Foundation/NSEIndexSet";
import { NSECountedSet } from "../../src/Foundation/NSECountedSet";
import { NSENumberFormatter } from "../../src/Foundation/NSENumberFormatter";
import { NSEPredicate } from "../../src/Foundation/NSEPredicate";
import { NSEUserDefaults } from "../../src/Foundation/NSEUserDefaults";

describe("Foundation Cocoa value contracts", () => {
  it("uses immutable range-backed index values", () => {
    expect(NSEIndexPath.from(2, 3).indexPathByAddingIndex(4).indexes).toEqual([2, 3, 4]);
    const indexes = NSEIndexSet.fromRange({ location: 4, length: 3 });
    expect([...indexes]).toEqual([4, 5, 6]);
    expect(indexes.count).toBe(3);
  });
  it("counts unique objects separately from their multiplicity", () => {
    const set = new NSECountedSet(["a", "a", "b"]);
    expect(set.count).toBe(2);
    expect(set.countForObject("a")).toBe(2);
    set.removeObject("a");
    expect(set.countForObject("a")).toBe(1);
  });
  it("formats and recovers localized values through the formatter contract", () => {
    const formatter = new NSENumberFormatter();
    expect(formatter.string(1234.5, { locale: "de-DE" })).toBe("1.234,5");
    expect(formatter.getObjectValue("1.234,5", { locale: "de-DE" })).toEqual({ ok: true, value: 1234.5 });
    expect(formatter.isPartialStringValid("-", { locale: "de-DE" })).toEqual({ valid: true });
  });
  it("evaluates a predicate block without a host or schema", () => {
    const predicate = NSEPredicate.withBlock<number>((value) => value > 4);
    expect(predicate.evaluate(5)).toBe(true);
    expect(predicate.evaluate(4)).toBe(false);
  });
  it("defaults keep independent volatile domains and accept injected storage", () => {
    const first = new NSEUserDefaults();
    first.set(4, "count");
    expect(first.object("count")).toBe(4);
    expect(new NSEUserDefaults().object("count")).toBeNull();
  });
});
