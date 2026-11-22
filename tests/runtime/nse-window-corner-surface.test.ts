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
import {
  defaultWindowSmoothSurface,
  InvalidWindowRecordError,
  normaliseWindowSmoothSurface,
} from "../../src/SynCloudOS/Windows";
describe("window smoothSurface normalisation", () => {
  it("resolves undefined to the named default window smooth surface", () => {
    expect(normaliseWindowSmoothSurface(undefined)).toEqual(defaultWindowSmoothSurface);
    expect(defaultWindowSmoothSurface).toMatchObject({ radius: 10, curve: "squircle", smoothing: 0.6, overflow: "hidden", physicality: "off" });
  });

  it("keeps off sentinels, radii, and corner objects", () => {
    expect(normaliseWindowSmoothSurface(null)).toBeNull();
    expect(normaliseWindowSmoothSurface("off")).toBe("off");
    expect(normaliseWindowSmoothSurface(false)).toBe("off");
    expect(normaliseWindowSmoothSurface(24)).toBe(24);
    expect(normaliseWindowSmoothSurface({ radius: 5, topLeft: 2 })).toEqual({ radius: 5, topLeft: 2 });
    expect(() => normaliseWindowSmoothSurface({ curve: "squircle", smoothing: 1.4 })).toThrow(InvalidWindowRecordError);
  });

  it("throws on invalid values in assertion mode and notes fallbacks in manifest mode", () => {
    expect(() => normaliseWindowSmoothSurface({ radius: -5 })).toThrow(InvalidWindowRecordError);
    expect(() => normaliseWindowSmoothSurface({ curve: "blob" })).toThrow(InvalidWindowRecordError);
    expect(() => normaliseWindowSmoothSurface("square")).toThrow(InvalidWindowRecordError);
    expect(() => normaliseWindowSmoothSurface({ radius: 4, invented: true })).toThrow(InvalidWindowRecordError);
    expect(() => normaliseWindowSmoothSurface({
      physicality: { top: { offsetY: 1, color: "#000", opacity: 1, invented: true } },
    })).toThrow(InvalidWindowRecordError);
    const notes: Array<{ field: string; from: unknown }> = [];
    normaliseWindowSmoothSurface({ radius: -5, curve: "blob" }, (field, from) => { notes.push({ field, from }); });
    expect(notes.map(({ field }) => field)).toEqual(["radius", "curve"]);
  });
});
