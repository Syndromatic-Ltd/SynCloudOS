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
import { MEFXTimeRange } from "../../../src/FX/MediaFX/MEFXTimeRange";
import { MEFXTimeMapping } from "../../../src/FX/MediaFX/MEFXTimeMapping";

const finite = (value: bigint, timescale: number, epoch = 0n) => MEFXTime.finite(value, timescale, epoch);
const range = (start: MEFXTime, duration: MEFXTime) => new MEFXTimeRange(start, duration);

describe("MediaFX ranges and mappings", () => {
  it("uses half-open containment and stable empty intersections", () => {
    const first = range(finite(0n, 1), finite(1n, 1));
    const second = range(finite(1n, 1), finite(1n, 1));
    expect(first.contains(finite(0n, 1))).toBe(true);
    expect(first.contains(finite(1n, 1))).toBe(false);
    const intersection = first.intersection(second);
    expect(intersection.duration.value).toMatchObject({ kind: "finite", value: 0n });
    expect(intersection.contains(finite(1n, 1))).toBe(false);
  });

  it("rejects range operations across position epochs", () => {
    const first = range(finite(0n, 1, 1n), finite(1n, 1));
    const second = range(finite(0n, 1, 2n), finite(1n, 1));
    expect(() => first.intersection(second)).toThrow(/epoch/i);
  });

  it("maps both endpoints exactly and round-trips rational frame positions", () => {
    const source = range(finite(0n, 1), finite(10n, 1));
    const target = range(finite(1001n, 30_000), finite(1001n * 300n, 30_000));
    const mapping = new MEFXTimeMapping(source, target);
    const inverse = mapping.inverted();
    expect(mapping.map(source.start).compare(target.start)).toBe(0);
    expect(mapping.map(source.end).compare(target.end)).toBe(0);

    let position = finite(123n, 100, 0n);
    for (let index = 0; index < 10_000; index += 1)
      position = inverse.map(mapping.map(position));
    expect(position.compare(finite(123n, 100))).toBe(0);
  });

  it("rejects zero source duration while allowing a zero target collapse", () => {
    const zeroSource = new MEFXTimeMapping(
      range(finite(0n, 1), finite(0n, 1)),
      range(finite(5n, 1), finite(1n, 1)),
    );
    expect(() => zeroSource.map(finite(0n, 1))).toThrow(/zero source/i);

    const collapsed = new MEFXTimeMapping(
      range(finite(-1n, 1), finite(2n, 1)),
      range(finite(5n, 1), finite(0n, 1)),
    );
    expect(collapsed.map(finite(-1n, 1)).compare(finite(5n, 1))).toBe(0);
    expect(() => collapsed.inverted()).toThrow(/zero target/i);
  });

  it("keeps negative preroll positions representable", () => {
    const preroll = range(finite(-1001n, 30_000), finite(2002n, 30_000));
    expect(preroll.contains(finite(-500n, 30_000))).toBe(true);
  });
});
