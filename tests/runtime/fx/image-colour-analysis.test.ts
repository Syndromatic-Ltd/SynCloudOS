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
import { GFXColour, GFXImage } from "../../../src/FX/GraphicsFX/public";
import { IFXContext, IFXFilterGraph, IFXFilterRegistry, IFXImage, IFXSampler, type IFXFilterParameters } from "../../../src/FX/ImageFX/public";

const supportedLabNormalize: IFXFilterParameters["convertLabToRGB"] = { normalize: true };
const supportedRGBNormalize: IFXFilterParameters["convertRGBtoLab"] = { normalize: true };
// @ts-expect-error ImageFX intentionally exposes only its normalized CIConvertLab encoding.
const unsupportedLabNormalize: IFXFilterParameters["convertLabToRGB"] = { normalize: false };
// @ts-expect-error ImageFX intentionally exposes only its normalized CIConvertLab encoding.
const unsupportedRGBNormalize: IFXFilterParameters["convertRGBtoLab"] = { normalize: false };
void supportedLabNormalize;
void supportedRGBNormalize;
void unsupportedLabNormalize;
void unsupportedRGBNormalize;

const registry = new IFXFilterRegistry();
const image = (values: ArrayLike<number>, width: number, origin?: { x: number; y: number }) => IFXImage.fromPixels(new GFXImage({ width, height: values.length / (width * 4), alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array(values) }), origin);
const nearest = (value: IFXImage, x: number, y: number) => new IFXSampler(value).sample({ x, y }, "nearest");
const straight = (value: Readonly<{ r: number; g: number; b: number; a: number; }>) => value.a === 0 ? { r: 0, g: 0, b: 0, a: 0 } : { r: value.r / value.a, g: value.g / value.a, b: value.b / value.a, a: value.a };
function expectChannels(actual: Readonly<{ r: number; g: number; b: number; a: number; }>, expected: Readonly<{ r: number; g: number; b: number; a: number; }>, precision = 7): void {
    for (const key of ["r", "g", "b", "a"] as const)
        expect(actual[key]).toBeCloseTo(expected[key], precision);
}

describe("ImageFX sourced colour-analysis factories", () => {
    it("registers the six source-shaped contracts and requires documented input properties with no invented defaults", () => {
        expect(registry.names()).toHaveLength(203);
        expect(registry.names()).toEqual(expect.arrayContaining(["convertLabToRGB", "convertRGBtoLab", "labDeltaE", "colourThresholdOtsu", "dither", "colourMap"]));
        expect(registry.create("convertLabToRGB", { normalize: true }).parameters).toEqual({ normalize: true });
        expect(registry.create("convertRGBtoLab", { normalize: true }).parameters).toEqual({ normalize: true });
        expect(registry.create("dither", { intensity: .4 }).parameters).toEqual({ intensity: .4 });
        expect(registry.create("colourThresholdOtsu", {}).parameters).toEqual({});
        expect(registry.create("colourMap", {}).parameters).toEqual({});
        expect(registry.create("labDeltaE", {}).parameters).toEqual({});
        expect(() => registry.create("convertRGBtoLab", {} as never)).toThrow(/normalize/i);
        expect(() => registry.create("convertLabToRGB", { normalize: false } as never)).toThrow(/normalized|encoding/i);
        expect(() => registry.create("dither", {} as never)).toThrow(/intensity/i);
        expect(() => registry.create("dither", { intensity: .4, seed: 1 } as never)).toThrow(/unknown/i);
        expect(() => registry.create("colourMap", { gradient: 1 } as never)).toThrow(/unknown/i);
    });

    it("encodes CIE Lab D50 values in the documented normalized channel ranges and round-trips linear RGB", () => {
        const source = image([
            0, 0, 0, 255,
            255, 0, 0, 255,
            255, 255, 255, 255,
            64, 128, 192, 153,
        ], 4);
        const encoded = registry.create("convertRGBtoLab", { normalize: true }).apply(source);
        expectChannels(nearest(encoded, .5, .5), { r: 0, g: .5, b: .5, a: 1 });
        // Independent CIE Lab D50 vector for linear red: L*=54.2917, a*=80.8151, b*=69.8786.
        expectChannels(nearest(encoded, 1.5, .5), { r: .54291734, g: .81568402, b: .77296334, a: 1 });
        expectChannels(nearest(encoded, 2.5, .5), { r: 1, g: .5000135, b: .49990215, a: 1 }, 4);

        const translucentLab = straight(nearest(encoded, 3.5, .5));
        expect(translucentLab.a).toBeCloseTo(153 / 255, 8);
        expectChannels(translucentLab, { r: .73631764, g: .46010782, b: .40500169, a: 153 / 255 }, 6);

        const restored = registry.create("convertLabToRGB", { normalize: true }).apply(encoded);
        const roundTrip = straight(nearest(restored, 3.5, .5));
        expectChannels(roundTrip, { r: 64 / 255, g: 128 / 255, b: 192 / 255, a: 153 / 255 }, 5);
    });

    it("uses the CIE94 graphic-arts Delta E vector, grayscale portable packing, and maximum input alpha", () => {
        const red = image([255, 0, 0, 128], 1, { x: 4, y: -3 }), black = image([0, 0, 0, 192], 1, { x: 4, y: -3 });
        const output = registry.create("labDeltaE", {}).apply(red, black);
        // Independent CIE94 graphic-arts vector: D50 linear red versus black is ΔE94=57.32364.
        expectChannels(nearest(output, 4.5, -2.5), { r: .57323641 * (192 / 255), g: .57323641 * (192 / 255), b: .57323641 * (192 / 255), a: 192 / 255 }, 6);
        const identical = registry.create("labDeltaE", {}).apply(red, red);
        expectChannels(nearest(identical, 4.5, -2.5), { r: 0, g: 0, b: 0, a: 128 / 255 });
        const shiftedBlack = image([0, 0, 0, 255], 1, { x: 5, y: -3 }), union = registry.create("labDeltaE", {}).apply(red, shiftedBlack);
        expect(union.extent).toEqual({ kind: "finite", rect: { x: 4, y: -3, width: 2, height: 1 } });
        expect(new IFXFilterGraph(union).regionsOfInterest({ x: 4.25, y: -2.75, width: 1.5, height: .5 })).toEqual([
            { image: red, region: { x: 4.25, y: -2.75, width: .75, height: .5 } },
            { image: shiftedBlack, region: { x: 5, y: -2.75, width: .75, height: .5 } },
        ]);

        const serial = JSON.parse(JSON.stringify(new IFXFilterGraph(output).serialize()));
        expect(serial.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "operation", name: "labDeltaE", parameters: {} })]));
        expectChannels(nearest(IFXFilterGraph.deserialize(serial).output, 4.5, -2.5), nearest(output, 4.5, -2.5));
    });

    it("prepares bounded RGB-independent Otsu thresholds over the full finite source and preserves alpha", async () => {
        const input = image([
            0, 0, 0, 64,
            64, 255, 32, 128,
            192, 16, 224, 192,
            255, 128, 255, 255,
        ], 4, { x: 2.25, y: -1.5 });
        const output = registry.create("colourThresholdOtsu", {}).apply(input);
        expect(output.extent).toEqual(input.extent);
        // The four physical source values yield R=64, G=16, B=32 thresholds (strictly above selects white); the padded fractional grid is transparent exterior.
        expectChannels(nearest(output, 2.75, -1), { r: 0, g: 0, b: 0, a: 64 / 255 });
        expectChannels(nearest(output, 3.75, -1), { r: 0, g: 128 / 255, b: 0, a: 128 / 255 });
        expectChannels(nearest(output, 4.75, -1), { r: 192 / 255, g: 0, b: 192 / 255, a: 192 / 255 });
        expectChannels(nearest(output, 5.75, -1), { r: 1, g: 1, b: 1, a: 1 });
        expect(new IFXFilterGraph(output).regionsOfInterest({ x: 3.5, y: -1.25, width: .25, height: .25 })).toEqual([{ image: input, region: { x: 2.25, y: -1.5, width: 4, height: 1 } }]);

        const exactBound = IFXImage.constant(GFXColour.linearSRGB(.5, .5, .5)).cropped({ x: 0, y: 0, width: 65536, height: 1 });
        const exactOutput = registry.create("colourThresholdOtsu", {}).apply(exactBound);
        expectChannels(nearest(exactOutput, .5, .5), { r: 1, g: 1, b: 1, a: 1 });
        const tooLarge = IFXImage.constant(GFXColour.linearSRGB(.5, .5, .5)).cropped({ x: 0, y: 0, width: 65537, height: 1 });
        expect(() => registry.create("colourThresholdOtsu", {}).apply(tooLarge)).toThrow(/65,536|analysis/i);

        const data = new Uint8Array(128 * 128 * 4);
        for (let index = 0; index < data.length; index += 4)
            data.set([128, 128, 128, 255], index);
        const cached = registry.create("colourThresholdOtsu", {}).apply(image(data, 128));
        const sampler = new IFXSampler(cached, "linear-srgb", 30000);
        sampler.sample({ x: .5, y: .5 }, "nearest");
        const firstCost = sampler.evaluations;
        sampler.sample({ x: 1.5, y: .5 }, "nearest");
        expect(sampler.evaluations - firstCost).toBeLessThanOrEqual(2);
        const task = new IFXContext().startTask(cached);
        setTimeout(() => task.cancel(), 0);
        await expect(task.waitUntilCompleted()).rejects.toMatchObject({ name: "AbortError" });
    });

    it("adds deterministic coordinate noise only when the required intensity is nonzero and retains source alpha", () => {
        const input = image([128, 128, 128, 127, 128, 128, 128, 127], 2, { x: -3, y: 6 });
        const zero = registry.create("dither", { intensity: 0 }).apply(input), dithered = registry.create("dither", { intensity: .4 }).apply(input);
        expectChannels(nearest(zero, -2.5, 6.5), nearest(input, -2.5, 6.5));
        const first = straight(nearest(dithered, -2.5, 6.5)), repeat = straight(nearest(dithered, -2.5, 6.5)), second = straight(nearest(dithered, -1.5, 6.5));
        expect(first.a).toBeCloseTo(127 / 255, 8);
        expect(first).toEqual(repeat);
        expect(first.r).not.toBeCloseTo(128 / 255, 8);
        expect(second.r).not.toBeCloseTo(first.r, 8);
        const serial = JSON.parse(JSON.stringify(new IFXFilterGraph(dithered).serialize()));
        expect(serial.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "operation", name: "dither", parameters: { intensity: .4 } })]));
        expectChannels(nearest(IFXFilterGraph.deserialize(serial).output, -2.5, 6.5), nearest(dithered, -2.5, 6.5));
    });

    it("looks up unpremultiplied source luma in the gradient centerline, with explicit source-gradient alpha multiplication and full gradient ROI", () => {
        const source = image([255, 0, 0, 128], 1, { x: -4, y: 7 }), gradient = image([255, 0, 0, 255, 0, 0, 255, 255], 2, { x: 20, y: -8 });
        const output = registry.create("colourMap", {}).apply(source, gradient), mapped = nearest(output, -3.5, 7.5);
        expect(output.extent).toEqual(source.extent);
        // Apple documents luma weights (.2125, .7154, .0721); linear red selects 21.25% along this red-to-blue gradient.
        expectChannels(mapped, { r: .7875 * (128 / 255), g: 0, b: .2125 * (128 / 255), a: 128 / 255 }, 7);
        expect(new IFXFilterGraph(output).regionsOfInterest({ x: -3.75, y: 7.25, width: .25, height: .25 })).toEqual([
            { image: source, region: { x: -3.75, y: 7.25, width: .25, height: .25 } },
            { image: gradient, region: { x: 20, y: -8, width: 2, height: 1 } },
        ]);

        const translucentGradient = image([0, 255, 0, 128], 1, { x: 9, y: 9 }), opaqueSource = image([0, 0, 0, 255], 1, { x: -1, y: 3 });
        expectChannels(nearest(registry.create("colourMap", {}).apply(opaqueSource, translucentGradient), -.5, 3.5), { r: 0, g: 128 / 255, b: 0, a: 128 / 255 });
    });
});
