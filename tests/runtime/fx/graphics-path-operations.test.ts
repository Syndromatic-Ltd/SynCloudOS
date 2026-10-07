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
import { GFXPath } from "../../../src/FX/GraphicsFX/public";
describe("GraphicsFX dashed and stroked geometry", () => {
    const line = new GFXPath().move({ x: 0, y: 0 }).line({ x: 10, y: 0 });
    it("dashes by path length with phase, odd pattern repetition and contour reset", () => {
        expect(line.dashed([2, 2]).toSVGPathData()).toBe("M 0 0 L 2 0 M 4 0 L 6 0 M 8 0 L 10 0");
        expect(line.dashed([2, 2], 1).toSVGPathData()).toBe("M 0 0 L 1 0 M 3 0 L 5 0 M 7 0 L 9 0");
        expect(line.dashed([2]).toSVGPathData()).toBe(line.dashed([2, 2]).toSVGPathData());
        expect(() => line.dashed([0, 0])).toThrow();
        expect(() => line.dashed([0.000000001, 0.000000001])).toThrow(/limit/);
        expect(line.dashed([])).toBe(line);
        expect(line.dashed([2, 2], -1).toSVGPathData()).toBe("M 1 0 L 3 0 M 5 0 L 7 0 M 9 0 L 10 0");
        const contours = line.append(new GFXPath().move({ x: 0, y: 2 }).line({ x: 3, y: 2 }));
        expect(contours.dashed([2, 2]).toSVGPathData()).toBe(line.dashed([2, 2]).toSVGPathData() + " M 0 2 L 2 2");
        const closed = GFXPath.rect({ x: 0, y: 0, width: 2, height: 2 }).dashed([3, 1], 1);
        expect(closed.toSVGPathData()).toBe("M 0 1 L 0 0 L 2 0 M 2 1 L 2 2 L 0 2");
    });
    it("produces actual cap outlines and zero-width empty geometry", () => {
        expect(line.stroked({ width: 2, cap: "butt" }).bounds).toEqual({ x: 0, y: -1, width: 10, height: 2 });
        expect(line.stroked({ width: 2, cap: "square" }).bounds).toEqual({ x: -1, y: -1, width: 12, height: 2 });
        const round = line.stroked({ width: 2, cap: "round" });
        expect(round.contains({ x: -0.7, y: 0.7 })).toBe(true);
        expect(round.contains({ x: -0.9, y: 0.9 })).toBe(false);
        expect(line.stroked({ width: 0 }).commands).toHaveLength(0);
        expect(new GFXPath().move({ x: 0, y: 0 }).stroked({ width: 2, cap: "round" }).commands).toHaveLength(0);
        let reads = 0;
        expect(() => line.stroked({ get width() {
                reads++;
                return 2;
            } })).toThrow();
        expect(reads).toBe(0);
    });
    it("bounds miter joins and preserves closed-path holes", () => {
        const corner = new GFXPath().move({ x: 0, y: 10 }).line({ x: 0, y: 0 }).line({ x: 10, y: 0 });
        expect(corner.stroked({ width: 2, join: "miter", miterLimit: 10 }).contains({ x: -0.9, y: -0.9 })).toBe(true);
        expect(corner.stroked({ width: 2, join: "bevel" }).contains({ x: -0.9, y: -0.9 })).toBe(false);
        expect(corner.stroked({ width: 2, join: "miter", miterLimit: 1 }).contains({ x: -0.9, y: -0.9 })).toBe(false);
        const outline = GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 }).stroked({ width: 2 });
        expect(outline.contains({ x: 5, y: 5 })).toBe(false);
        expect(outline.contains({ x: 0.5, y: 5 })).toBe(true);
    });
    it("flattens curves for length/outline operations without mutating the source", () => {
        const curve = new GFXPath().move({ x: 0, y: 0 }).quad({ x: 5, y: 10 }, { x: 10, y: 0 });
        const dash = curve.dashed([2, 1]);
        expect(dash.commands.length).toBeGreaterThan(6);
        const outline = curve.stroked({ width: 1, cap: "round", join: "round" });
        expect(outline.contains({ x: 5, y: 5 })).toBe(true);
        expect(curve.commands).toHaveLength(2);
        expect(() => curve.stroked({ width: -1 })).toThrow();
    });
});
