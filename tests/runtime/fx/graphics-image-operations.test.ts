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
import { GFXImage, GFXBitmapContext, GFXPattern } from "../../../src/FX/GraphicsFX/public";
describe("GraphicsFX image operations", () => {
    it("decodes explicit byte layouts and rejects incompatible alpha metadata", () => {
        const bgra = new GFXImage({ width: 1, height: 1, pixelFormat: "bgra8", alpha: "premultiplied", colourSpace: "srgb", data: new Uint8Array([0, 0, 128, 128]) });
        expect(bgra.pixel(0, 0)).toEqual({ r: 1, g: 0, b: 0, a: 128 / 255 });
        expect(new GFXImage({ width: 1, height: 1, pixelFormat: "rgb8", alpha: "opaque", colourSpace: "srgb", data: new Uint8Array([255, 0, 0]) }).pixel(0, 0).r).toBe(1);
        expect(new GFXImage({ width: 1, height: 1, pixelFormat: "gray8", alpha: "opaque", colourSpace: "grayscale", data: new Uint8Array([128]) }).pixel(0, 0)).toEqual({ r: 128 / 255, g: 128 / 255, b: 128 / 255, a: 1 });
        expect(new GFXImage({ width: 1, height: 1, pixelFormat: "a8", alpha: "straight", colourSpace: "srgb", data: new Uint8Array([64]) }).pixel(0, 0)).toEqual({ r: 1, g: 1, b: 1, a: 64 / 255 });
        expect(() => new GFXImage({ width: 1, height: 1, pixelFormat: "rgb8", alpha: "premultiplied", colourSpace: "srgb", data: new Uint8Array(3) })).toThrow();
    });
    it("crops an integral intersection and preserves the original padded rows", () => {
        const image = new GFXImage({ width: 2, height: 2, bytesPerRow: 12, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 9, 9, 9, 9, 0, 0, 255, 255, 255, 255, 255, 255, 8, 8, 8, 8]) });
        const crop = image.cropped({ x: 1, y: 0, width: 2, height: 2 });
        expect(crop?.width).toBe(1);
        expect(crop?.bytesPerRow).toBe(4);
        expect(crop?.pixel(0, 1)).toEqual({ r: 1, g: 1, b: 1, a: 1 });
        expect(image.copyData()[8]).toBe(9);
        expect(image.cropped({ x: 3, y: 0, width: 1, height: 1 })).toBeNull();
        expect(() => image.cropped({ x: 0.5, y: 0, width: 1, height: 1 })).toThrow();
    });
    it("bilinearly resamples premultiplied colours without transparent-edge fringes", () => {
        const image = new GFXImage({ width: 2, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([255, 0, 0, 0, 0, 0, 255, 255]) });
        expect(image.sample({ x: 1, y: 0.5 }, { interpolation: "linear" })).toEqual({ r: 0, g: 0, b: 1, a: 0.5 });
        expect(image.resized({ width: 1, height: 1 }, "linear").pixel(0, 0)).toEqual({ r: 0, g: 0, b: 1, a: 128 / 255 });
        expect(image.sample({ x: 2.5, y: 0.5 }, { edge: "repeat" }).a).toBe(0);
        expect(image.sample({ x: -1, y: 0.5 }, { edge: "transparent" }).a).toBe(0);
    });
    it("converts alpha, extracts masks, applies mask alpha and emits PNG", () => {
        const image = new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([255, 0, 0, 128]) });
        const premult = image.converting("srgb", "premultiplied");
        expect([...premult.copyData()]).toEqual([128, 0, 0, 128]);
        expect(premult.pixel(0, 0).r).toBe(1);
        const mask = image.extractMask("alpha");
        expect(mask.pixelFormat).toBe("a8");
        expect([...mask.copyData()]).toEqual([128]);
        expect(image.extractMask("luminance").copyData()[0]).toBe(27);
        expect(image.withAlphaMask(mask).pixel(0, 0).a).toBe(64 / 255);
        expect(image.toPNG().slice(0, 4)).toEqual(new Uint8Array([137, 80, 78, 71]));
    });
    it("saves and restores bitmap interpolation", () => {
        const image = new GFXImage({ width: 2, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]) }), bitmap = new GFXBitmapContext({ width: 1, height: 1 });
        bitmap.save();
        bitmap.setInterpolation("linear");
        bitmap.drawImage(image, { x: 0, y: 0, width: 1, height: 1 });
        expect(bitmap.makeImage().pixel(0, 0)).toEqual({ r: 128 / 255, g: 0, b: 128 / 255, a: 1 });
        bitmap.restore();
        bitmap.clear();
        bitmap.drawImage(image, { x: 0, y: 0, width: 1, height: 1 });
        expect(bitmap.makeImage().pixel(0, 0).b).toBe(1);
        bitmap.dispose();
    });
    it("repeats bilinear pattern edges and bounds output work before allocating", () => {
        const image = new GFXImage({ width: 2, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([255, 0, 0, 0, 0, 0, 255, 255]) });
        expect(new GFXPattern(image, undefined, "linear").sample({ x: 0, y: 0.5 }).components).toEqual({ r: 0, g: 0, b: 1, a: 0.5 });
        expect(() => image.resized({ width: 100000, height: 100000 })).toThrow(/limit/);
        expect(() => image.resized({ width: 1.5, height: 1 })).toThrow();
        expect(() => image.converting("unknown" as never)).toThrow();
        expect(() => image.withAlphaMask(new GFXImage({ width: 1, height: 1, alpha: "opaque", colourSpace: "srgb", data: new Uint8Array(4) }))).toThrow(/dimensions/);
        expect(image.copyData()).toEqual(new Uint8Array([255, 0, 0, 0, 0, 0, 255, 255]));
    });
    it("retains BGRA bytes when cropping and numerically converts named colour spaces", () => {
        const image = new GFXImage({ width: 2, height: 1, pixelFormat: "bgra8", alpha: "straight", colourSpace: "srgb", data: new Uint8Array([255, 0, 0, 255, 0, 0, 128, 255]) });
        const crop = image.cropped({ x: 1, y: 0, width: 1, height: 1 })!;
        expect(crop.pixelFormat).toBe("bgra8");
        expect([...crop.copyData()]).toEqual([0, 0, 128, 255]);
        const linear = crop.converting("linear-srgb");
        expect(linear.colourSpace).toBe("linear-srgb");
        expect(linear.pixel(0, 0).r).toBeCloseTo(55 / 255);
        expect(linear.converting("srgb").pixel(0, 0).r).toBeCloseTo(128 / 255, 2);
    });
});
