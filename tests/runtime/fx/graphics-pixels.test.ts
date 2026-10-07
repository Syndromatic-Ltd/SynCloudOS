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

import { describe, expect, it, vi } from "vitest";
import { GFXShading, GFXMutablePath, GFXDataProvider, GFXDataConsumer, GFXColourConversionInfo, GFXLayer, GFXBitmapContext, GFXColour, GFXGradient, GFXImage, GFXPath, GFXPattern, GFXIdentityTransform, invertTransform, concatenateTransforms, transformPoint } from "../../../src/FX/GraphicsFX/public";
describe("GraphicsFX pixel and geometry values", () => {
    it("inverts affine transforms and rejects singular geometry", () => {
        const t = { a: 2, b: 1, c: 0, d: 3, tx: 4, ty: -2 };
        const point = transformPoint(transformPoint({ x: 3, y: 7 }, t), invertTransform(t));
        expect(point.x).toBeCloseTo(3);
        expect(point.y).toBeCloseTo(7);
        const identity = concatenateTransforms(t, invertTransform(t));
        for (const key of Object.keys(identity) as (keyof typeof identity)[])
            expect(identity[key]).toBeCloseTo(GFXIdentityTransform[key]);
        expect(() => invertTransform({ ...t, a: 0, b: 0 })).toThrow(/singular/);
    });
    it("owns immutable pixel copies and validates stride", () => {
        const bytes = new Uint8Array([255, 0, 0, 128, 0, 0, 0, 0]);
        const image = new GFXImage({ width: 1, height: 1, bytesPerRow: 8, alpha: "straight", colourSpace: "srgb", data: bytes });
        bytes[0] = 0;
        expect(image.pixel(0, 0)).toEqual({ r: 1, g: 0, b: 0, a: 128 / 255 });
        image.copyData()[0] = 0;
        expect(image.pixel(0, 0).r).toBe(1);
        expect(() => image.pixel(1, 0)).toThrow();
        expect(() => new GFXImage({ width: 2, height: 1, bytesPerRow: 4, alpha: "straight", colourSpace: "srgb", data: bytes })).toThrow();
    });
    it("renders at DPR 2, intersects masks, repeats a transformed pattern and tears down", () => {
        const surface = new GFXBitmapContext({ width: 2, height: 2, scale: 2 });
        surface.fillPath(GFXPath.rect({ x: 0, y: 0, width: 2, height: 2 }), GFXColour.rgba(1, 0, 0));
        expect(surface.makeImage().width).toBe(4);
        expect(surface.makeImage().pixel(3, 3)).toEqual({ r: 1, g: 0, b: 0, a: 1 });
        surface.save();
        surface.clip(GFXPath.rect({ x: 0, y: 0, width: 1, height: 2 }));
        const mask = new GFXImage({ width: 1, height: 1, data: new Uint8Array([0, 0, 0, 128]), alpha: "straight", colourSpace: "srgb" });
        surface.clipToMask(mask, { x: 0, y: 0, width: 2, height: 2 });
        surface.fillPath(GFXPath.rect({ x: 0, y: 0, width: 2, height: 2 }), GFXColour.rgba(0, 0, 1));
        expect(surface.makeImage().pixel(0, 0).b).toBeCloseTo(128 / 255);
        expect(surface.makeImage().pixel(3, 0).r).toBe(1);
        surface.restore();
        const tile = new GFXImage({ width: 2, height: 1, data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]), alpha: "straight", colourSpace: "srgb" });
        const pattern = new GFXPattern(tile, { ...GFXIdentityTransform, tx: 1 });
        expect(pattern.sample({ x: 0.5, y: 0.5 }).components.g).toBe(1);
        surface.dispose();
        expect(() => surface.makeImage()).toThrow(/disposed/);
    });
    it("samples premultiplied gradient stops and explicit linear colour conversion", () => {
        const gradient = new GFXGradient([{ offset: 0, colour: GFXColour.rgba(1, 0, 0, 0) }, { offset: 1, colour: GFXColour.rgba(0, 0, 1, 1) }]);
        expect(gradient.sample(0.5).components).toEqual({ r: 0, g: 0, b: 1, a: 0.5 });
        expect(GFXColour.rgba(0.5, 0.5, 0.5).converting("linear-srgb").components.r).toBeCloseTo(0.214041, 5);
        expect(GFXColour.linearSRGB(0.214041, 0, 0).converting("srgb").components.r).toBeCloseTo(0.5, 5);
        expect(() => GFXColour.rgba(1, 0, 0).converting("icc-unknown" as never)).toThrow();
    });
    it("uses even-odd containment and immutable snapshots from mutable construction", () => {
        const builder = new GFXMutablePath(GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 }));
        const outer = builder.copy();
        builder.append(GFXPath.rect({ x: 2, y: 2, width: 6, height: 6 }));
        expect(outer.contains({ x: 5, y: 5 })).toBe(true);
        expect(builder.copy().contains({ x: 5, y: 5 }, "nonzero")).toBe(true);
        expect(builder.copy().contains({ x: 5, y: 5 }, "evenodd")).toBe(false);
        builder.clear();
        expect(builder.copy().commands).toHaveLength(0);
        expect(outer.commands).toHaveLength(5);
    });
    it("bounds provider reads and consumer writes and preserves byte ownership", () => {
        const bytes = new Uint8Array([1, 2, 3]);
        const provider = new GFXDataProvider(bytes);
        bytes[0] = 9;
        expect(provider.read(0, 2)).toEqual(new Uint8Array([1, 2]));
        expect(() => provider.read(2, 2)).toThrow();
        const consumer = new GFXDataConsumer(3);
        consumer.write(provider.read(0, 2));
        expect(() => consumer.write(bytes)).toThrow();
        consumer.write(new Uint8Array([4]));
        expect(consumer.finish()).toEqual(new Uint8Array([1, 2, 4]));
        expect(() => consumer.write(bytes)).toThrow(/closed/);
    });
    it("bounds callback provider reads and finalizes its owner exactly once", () => {
        const backing = new Uint8Array([10, 20, 30, 40]);
        const release = vi.fn();
        const read = vi.fn((offset: number, length: number) => backing.subarray(offset, offset + length));
        const provider = new GFXDataProvider({ length: backing.length, read, release });
        const first = provider.read(1, 2);
        expect(first).toEqual(new Uint8Array([20, 30]));
        first[0] = 99;
        expect(backing[1]).toBe(20);
        expect(() => provider.read(3, 2)).toThrow(/bounds/i);
        expect(read).toHaveBeenCalledTimes(1);
        provider.release();
        provider.release();
        expect(release).toHaveBeenCalledTimes(1);
        expect(provider.released).toBe(true);
        expect(() => provider.read(0, 1)).toThrow(/released/i);
    });
    it("rejects malformed callback provider output without transferring its storage", () => {
        const release = vi.fn();
        const provider = new GFXDataProvider({ length: 4, read: () => new Uint8Array([1]), release });
        expect(() => provider.read(0, 2)).toThrow(/length/i);
        provider.release();
        expect(release).toHaveBeenCalledTimes(1);
    });
    it("samples transformed conic and radial shading at fixed coordinates", () => {
        const ramp = new GFXGradient([{ offset: 0, colour: GFXColour.rgba(0, 0, 0) }, { offset: 1, colour: GFXColour.rgba(1, 1, 1) }]);
        const conic = new GFXShading(ramp, { kind: "conic", centre: { x: 0, y: 0 }, startAngle: 0 }, { ...GFXIdentityTransform, tx: 2 });
        expect(conic.sample({ x: 2, y: 1 }).components.r).toBeCloseTo(0.25);
        expect(conic.sample({ x: 1, y: 0 }).components.r).toBeCloseTo(0.5);
        const radial = new GFXShading(ramp, { kind: "radial", centre: { x: 0, y: 0 }, radius: 2 });
        expect(radial.sample({ x: 1, y: 0 }).components.r).toBeCloseTo(0.5);
        const surface = new GFXBitmapContext({ width: 1, height: 1 });
        surface.fillPath(GFXPath.rect({ x: 0, y: 0, width: 1, height: 1 }), new GFXShading(ramp, { kind: "conic", centre: { x: 0, y: 0 }, startAngle: 0 }));
        expect(surface.makeImage().pixel(0, 0).r).toBeCloseTo(32 / 255);
        surface.dispose();
    });
    it("composites layer snapshots and respects named conversion metadata", () => {
        const source = new GFXBitmapContext({ width: 1, height: 1 });
        source.fillPath(GFXPath.rect({ x: 0, y: 0, width: 1, height: 1 }), GFXColour.rgba(0, 1, 0));
        const layer = new GFXLayer(source);
        source.dispose();
        const destination = new GFXBitmapContext({ width: 2, height: 1 });
        destination.setAlpha(0.5);
        layer.draw(destination, { x: 0, y: 0, width: 2, height: 1 });
        expect(destination.makeImage().pixel(1, 0)).toEqual({ r: 0, g: 1, b: 0, a: 128 / 255 });
        const conversion = new GFXColourConversionInfo("linear-srgb", "srgb");
        expect(conversion.convert(GFXColour.linearSRGB(0.214041, 0, 0)).components.r).toBeCloseTo(0.5, 5);
        expect(() => conversion.convert(GFXColour.rgba(1, 0, 0))).toThrow(/Source/);
        destination.dispose();
    });
    it("rasterizes shared path stroke outlines with an unpainted interior", () => {
        const context = new GFXBitmapContext({ width: 6, height: 6 });
        context.strokePath(GFXPath.rect({ x: 1, y: 1, width: 4, height: 4 }), GFXColour.rgba(1, 0, 0), { width: 1, join: "miter" });
        const output = context.makeImage();
        expect(output.pixel(1, 2).r).toBe(1);
        expect(output.pixel(3, 3).a).toBe(0);
        context.dispose();
    });
});
