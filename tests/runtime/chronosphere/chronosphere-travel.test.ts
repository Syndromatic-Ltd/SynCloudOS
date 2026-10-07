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
import { projectChronosphereDepth, chronosphereTravelDuration, significantChronosphereIndex } from "../../../src/NSE/Chronosphere/chronosphereTravel";
import type { ChronosphereVersion } from "../../../src/NSE/Chronosphere/chronosphereTypes";

describe("Vortex travel geometry", () => {
  it("converges both axes on the galaxy even when the front document is in the right pane", () => {
    const front = { x: 1048, y: 520 }, core = { x: 800, y: 150 };
    const depths = [0, 1, 4, 12, 28].map(depth => projectChronosphereDepth(depth, front, core));
    expect(depths[0]).toMatchObject({ x: front.x, y: front.y, scale: 1 });
    for (let i = 1; i < depths.length; i++) {
      expect(Math.abs(depths[i].x - core.x)).toBeLessThan(Math.abs(depths[i - 1].x - core.x));
      expect(Math.abs(depths[i].y - core.y)).toBeLessThan(Math.abs(depths[i - 1].y - core.y));
      expect(depths[i].scale).toBeLessThan(depths[i - 1].scale);
    }
    expect(depths.at(-1)!.x).toBeCloseTo(core.x, 0);
  });
  it("makes a long trip last longer without a fixed maximum that skips versions", () => {
    expect(chronosphereTravelDuration(40)).toBeGreaterThan(chronosphereTravelDuration(8) * 3);
    expect(chronosphereTravelDuration(8)).toBeGreaterThan(chronosphereTravelDuration(1));
    expect(chronosphereTravelDuration(0)).toBe(0);
  });
  it("skips small saves and accumulates smaller changes until they become substantial", () => {
    const entries: ChronosphereVersion[] = [0, 0.01, 0.02, 0.3, 0.04, 0.04, 0.04, 0.5].map((changeMagnitude, i) => ({ id: `${i}`, sequence: 8 - i, title: "Draft", dateLabel: "Saved", changeMagnitude }));
    expect(significantChronosphereIndex(entries, 0, 1)).toBe(4);
    expect(significantChronosphereIndex(entries, 3, 1)).toBe(4);
    expect(significantChronosphereIndex(entries, 4, 1)).toBe(7);
    expect(significantChronosphereIndex(entries, 6, -1)).toBe(3);
    expect(significantChronosphereIndex(entries, 7, 1)).toBe(7);
  });
  it("treats versions with no diff metadata as individual meaningful changes", () => {
    const entries: ChronosphereVersion[] = ["now", "old", "oldest"].map((id, i) => ({ id, sequence: 3 - i, title: "Draft", dateLabel: "Saved" }));
    expect(significantChronosphereIndex(entries, 0, 1)).toBe(1);
    expect(significantChronosphereIndex(entries, 1, -1)).toBe(0);
    expect(significantChronosphereIndex([], 0, 1)).toBe(0);
  });
});
