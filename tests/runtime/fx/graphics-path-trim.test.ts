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

import { describe, it, expect } from "vitest";
import { GFXPath } from "../../../src/FX/GraphicsFX/GFXPath";
describe("canonical path arc-length operations", () => {
  it("trims total arc length across independent contours without connecting them", () => {
    const path = new GFXPath([
      { kind: "move", point: { x: 0, y: 0 } },
      { kind: "line", point: { x: 10, y: 0 } },
      { kind: "move", point: { x: 20, y: 0 } },
      { kind: "line", point: { x: 30, y: 0 } },
    ]);
    expect(path.length()).toBe(20);
    const trimmed = path.trimmed(0.25, 0.75);
    expect(trimmed.length()).toBe(10);
    expect(trimmed.toSVGPathData()).toBe("M 5 0 L 10 0 M 20 0 L 25 0");
    expect(path.trimmed(0, 1)).toBe(path);
  });
  it("uses existing bounded curve flattening and retains fully selected closed contours", () => {
    const curve = new GFXPath([
      { kind: "move", point: { x: 0, y: 0 } },
      {
        kind: "curve",
        control1: { x: 0, y: 100 },
        control2: { x: 100, y: 100 },
        point: { x: 100, y: 0 },
      },
    ]);
    expect(curve.length()).toBeCloseTo(200, 0);
    const half = curve.trimmed(0, 0.5);
    expect(half.length()).toBeCloseTo(curve.length() / 2, 5);
    const endpoint = half.commands.at(-1)!;
    expect(endpoint.kind).toBe("line");
    if (endpoint.kind !== "line")
      throw new Error("Expected a trimmed line endpoint.");
    expect(endpoint.point.x).toBeCloseTo(50, 10);
    expect(endpoint.point.y).toBeCloseTo(75, 10);
    const square = GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 });
    expect(square.length()).toBe(40);
    const two = square.append(
      square.transformed({ a: 1, b: 0, c: 0, d: 1, tx: 20, ty: 0 }),
    );
    expect(two.trimmed(0, 0.5).commands.at(-1)).toEqual({ kind: "close" });
  });
  it("rejects invalid fractions and handles empty/degenerate ranges truthfully", () => {
    const path = GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 });
    expect(() => path.trimmed(NaN, 1)).toThrow();
    expect(() => path.trimmed(-0.1, 1)).toThrow();
    expect(() => path.trimmed(0, Infinity)).toThrow();
    expect(path.trimmed(0.8, 0.2).length()).toBe(0);
    expect(new GFXPath().trimmed(0.2, 0.8).length()).toBe(0);
  });
});
