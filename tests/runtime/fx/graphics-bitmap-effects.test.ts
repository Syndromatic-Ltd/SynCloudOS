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
import { GFXBitmapContext, GFXColour, GFXPath, type GFXBlendMode } from "../../../src/FX/GraphicsFX/public";
const rect = (x: number, y: number, width: number, height: number) => GFXPath.rect({ x, y, width, height });
describe("GraphicsFX bitmap compositing effects", () => {
    it("uses premultiplied four-by-four coverage samples at a fractional edge", () => {
        const bitmap = new GFXBitmapContext({ width: 2, height: 1 });
        bitmap.setAntialiasing(true);
        bitmap.fillPath(rect(0.5, 0, 1, 1), GFXColour.rgba(1, 0, 0));
        expect(bitmap.makeImage().pixel(0, 0)).toEqual({ r: 1, g: 0, b: 0, a: 128 / 255 });
        expect(bitmap.makeImage().pixel(1, 0)).toEqual({ r: 1, g: 0, b: 0, a: 128 / 255 });
        bitmap.dispose();
    });
    it.each<[
        GFXBlendMode,
        number[]
    ]>([
        ["normal", [153, 64, 191]], ["multiply", [31, 26, 153]], ["screen", [173, 140, 242]], ["overlay", [61, 51, 230]], ["darken", [51, 64, 191]], ["lighten", [153, 102, 204]]
    ])("computes %s source-over blend channels", (mode, expected) => {
        const bitmap = new GFXBitmapContext({ width: 1, height: 1 });
        bitmap.fillPath(rect(0, 0, 1, 1), GFXColour.rgba(0.2, 0.4, 0.8));
        bitmap.setBlendMode(mode);
        bitmap.fillPath(rect(0, 0, 1, 1), GFXColour.rgba(0.6, 0.25, 0.75));
        expect([...bitmap.makeImage().copyData()]).toEqual([...expected, 255]);
        bitmap.dispose();
    });
    it("composites a half-transparent multiply source with unpremultiplied output", () => {
        const bitmap = new GFXBitmapContext({ width: 1, height: 1 });
        bitmap.fillPath(rect(0, 0, 1, 1), GFXColour.rgba(1, 0, 0, 0.5));
        bitmap.setBlendMode("multiply");
        bitmap.fillPath(rect(0, 0, 1, 1), GFXColour.rgba(0, 0, 1, 0.5));
        const pixel = bitmap.makeImage().pixel(0, 0);
        expect(pixel.a).toBeCloseTo(192 / 255);
        expect(pixel.r).toBeCloseTo(85 / 255);
        expect(pixel.b).toBeCloseTo(85 / 255, 2);
        bitmap.dispose();
    });
    it("projects source shadows outside source bounds and clips their final pixels", () => {
        const bitmap = new GFXBitmapContext({ width: 5, height: 3 });
        bitmap.setShadow({ offset: { x: 2, y: 0 }, blur: 0, spread: 0, colour: GFXColour.rgba(0, 0, 0, 0.5) });
        bitmap.fillPath(rect(-1, 1, 1, 1), GFXColour.rgba(1, 0, 0));
        expect(bitmap.makeImage().pixel(1, 1)).toEqual({ r: 0, g: 0, b: 0, a: 128 / 255 });
        expect(bitmap.makeImage().pixel(0, 1).a).toBe(0);
        bitmap.clear();
        bitmap.clip(rect(0, 0, 1, 3));
        bitmap.fillPath(rect(-1, 1, 1, 1), GFXColour.rgba(1, 0, 0));
        expect(bitmap.makeImage().pixel(1, 1).a).toBe(0);
        bitmap.dispose();
    });
    it("uses a normalized Gaussian blur and finite spread rather than a solid offset box", () => {
        const bitmap = new GFXBitmapContext({ width: 10, height: 9 });
        bitmap.setShadow({ offset: { x: 4, y: 0 }, blur: 2, spread: 0, colour: GFXColour.rgba(0, 0, 0) });
        bitmap.fillPath(rect(1, 4, 1, 1), GFXColour.rgba(1, 0, 0));
        const image = bitmap.makeImage();
        expect(image.pixel(5, 4).a).toBe(41 / 255);
        expect(image.pixel(6, 4).a).toBe(25 / 255);
        expect(image.pixel(5, 5).a).toBe(image.pixel(6, 4).a);
        bitmap.clear();
        bitmap.setShadow({ offset: { x: 4, y: 0 }, blur: 0, spread: 1, colour: GFXColour.rgba(0, 0, 0) });
        bitmap.fillPath(rect(1, 4, 1, 1), GFXColour.rgba(1, 0, 0));
        expect(bitmap.makeImage().pixel(6, 5).a).toBe(1);
        expect(bitmap.makeImage().pixel(7, 5).a).toBe(0);
        bitmap.dispose();
    });
    it("restores effect state and fails excessive shadow work before touching pixels", () => {
        const bitmap = new GFXBitmapContext({ width: 2, height: 2 });
        bitmap.save();
        bitmap.setAntialiasing(true);
        bitmap.setBlendMode("multiply");
        bitmap.setShadow({ offset: { x: 1, y: 0 }, blur: 0, spread: 0, colour: GFXColour.rgba(0, 0, 0) });
        bitmap.restore();
        bitmap.fillPath(rect(0, 0, 1, 1), GFXColour.rgba(1, 0, 0));
        expect(bitmap.makeImage().pixel(1, 0).a).toBe(0);
        const before = bitmap.makeImage().copyData();
        bitmap.setShadow({ offset: { x: 100000, y: 0 }, blur: 10000, spread: 0, colour: GFXColour.rgba(0, 0, 0) });
        expect(() => bitmap.fillPath(rect(0, 0, 1, 1), GFXColour.rgba(0, 1, 0))).toThrow(/limit|budget/);
        expect(bitmap.makeImage().copyData()).toEqual(before);
        bitmap.dispose();
    });
});
