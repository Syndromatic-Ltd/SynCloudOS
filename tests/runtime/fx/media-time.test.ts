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

import { MEFXTime } from "../../../src/FX/MediaFX/MEFXTime";

const finite = (value: bigint, timescale: number, epoch = 0n) => MEFXTime.finite(value, timescale, epoch);

describe("MediaFX exact time", () => {
  it("adds rational durations without Number intermediates", () => {
    const result = finite(1n, 3).addDuration(finite(1n, 6));
    expect(result.value).toEqual({ kind: "finite", value: 1n, timescale: 2, epoch: 0n, rounded: false });
    expect(finite(48_000n, 48_000).compare(finite(1n, 1))).toBe(0);
  });

  it("compares large exact values beyond Number.MAX_SAFE_INTEGER", () => {
    const base = 9_007_199_254_740_993n;
    expect(finite(base, 3).compare(finite(base + 1n, 3))).toBe(-1);
  });

  it("rejects invalid scales and unordered epoch arithmetic", () => {
    expect(() => finite(1n, 0)).toThrow(/timescale/i);
    expect(() => finite(1n, 2 ** 31)).toThrow(/timescale/i);
    expect(finite(1n, 1, 1n).compare(finite(1n, 1, 2n))).toBe("unordered");
    expect(() => finite(1n, 1, 1n).subtract(finite(1n, 1, 2n))).toThrow(/epoch/i);
    expect(() => finite(1n, 1).addDuration(finite(1n, 1, 2n))).toThrow(/duration.*epoch/i);
  });

  it("rounds signed half-way values under every declared mode", () => {
    expect(finite(1n, 2).convertScale(1, "nearest-even").value).toMatchObject({ value: 0n, rounded: true });
    expect(finite(3n, 2).convertScale(1, "nearest-even").value).toMatchObject({ value: 2n, rounded: true });
    expect(finite(-1n, 2).convertScale(1, "nearest-even").value).toMatchObject({ value: 0n, rounded: true });
    expect(finite(-3n, 2).convertScale(1, "nearest-even").value).toMatchObject({ value: -2n, rounded: true });
    expect(finite(-3n, 2).convertScale(1, "toward-zero").value).toMatchObject({ value: -1n });
    expect(finite(-3n, 2).convertScale(1, "floor").value).toMatchObject({ value: -2n });
    expect(finite(-3n, 2).convertScale(1, "ceil").value).toMatchObject({ value: -1n });
  });

  it("serializes finite BigInt values without precision loss", () => {
    const original = finite(123456789012345678901234567890n, 30_000, -42n);
    const restored = MEFXTime.fromJSON(original.toJSON());
    expect(restored.value).toEqual(original.value);
  });

  it("rejects exact arithmetic whose denominator cannot fit the portable scale", () => {
    expect(() => finite(1n, 2_147_483_647).addDuration(finite(1n, 2_147_483_646))).toThrow(/scale/i);
  });

  it("keeps special values explicit instead of hiding NaN", () => {
    expect(MEFXTime.invalid.addDuration(finite(1n, 1)).value).toEqual({ kind: "invalid" });
    expect(MEFXTime.positiveInfinity.addDuration(MEFXTime.negativeInfinity).value).toEqual({ kind: "invalid" });
    expect(MEFXTime.indefinite.compare(finite(1n, 1))).toBe("unordered");
  });
});
