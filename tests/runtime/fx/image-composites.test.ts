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
import { IFXFilterGraph, IFXFilterRegistry, IFXImage, IFXSampler, type IFXFilterParameters } from "../../../src/FX/ImageFX/public";

const registry = new IFXFilterRegistry();
const blendFactories = ["colourBlendMode", "divideBlendMode", "hueBlendMode", "linearBurnBlendMode", "linearDodgeBlendMode", "linearLightBlendMode", "luminosityBlendMode", "pinLightBlendMode", "saturationBlendMode", "subtractBlendMode", "vividLightBlendMode"] as const;
const compositingFactories = ["minimumCompositing", "maximumCompositing", "multiplyCompositing"] as const;
const constant = (r: number, g: number, b: number, a = 1) => IFXImage.constant(GFXColour.linearSRGB(r, g, b, a)).cropped({ x: 0, y: 0, width: 1, height: 1 });
const sample = (image: IFXImage, x = .5, y = .5) => new IFXSampler(image).sample({ x, y });
const pixel = (values: readonly number[], origin: { x: number; y: number }) => IFXImage.fromPixels(new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array(values) }), origin);
const emptyCompositeParameters: IFXFilterParameters["colourBlendMode"] = {};
void emptyCompositeParameters;
// @ts-expect-error Named composite factories do not accept properties.
const compositeParametersWithProperty: IFXFilterParameters["colourBlendMode"] = { unexpected: true };
void compositeParametersWithProperty;
// @ts-expect-error Named composite factories do not accept scalar parameters.
const compositeParametersWithScalar: IFXFilterParameters["colourBlendMode"] = "unexpected";
void compositeParametersWithScalar;
function expectSample(image: IFXImage, expected: Readonly<{ r: number; g: number; b: number; a: number; }>, x = .5, y = .5): void {
    const actual = sample(image, x, y);
    for (const key of ["r", "g", "b", "a"] as const)
        expect(actual[key]).toBeCloseTo(expected[key], 8);
}

describe("ImageFX named composite factories", () => {
    it("registers exactly the captured named composite factories with two image inputs", () => {
        const names = registry.names("composite");
        expect(names).toEqual(expect.arrayContaining([...blendFactories, ...compositingFactories]));
        for (const name of [...blendFactories, ...compositingFactories]) {
            const filter = registry.create(name, {});
            expect(filter.inputCount).toBe(2);
            expect(filter.parameters).toEqual({});
        }
        expect(() => registry.create("colourBlendMode", { unexpected: true } as never)).toThrow();
    });

    it("applies independent opaque vectors for the separable blend formulas", () => {
        const source = constant(.75, .2, .4), backdrop = constant(.15, .55, .9);
        const expected = {
            divideBlendMode: { r: .2, g: 1, b: 1, a: 1 },
            linearBurnBlendMode: { r: 0, g: 0, b: .3, a: 1 },
            linearDodgeBlendMode: { r: .9, g: .75, b: 1, a: 1 },
            linearLightBlendMode: { r: .65, g: 0, b: .7, a: 1 },
            pinLightBlendMode: { r: .5, g: .4, b: .8, a: 1 },
            subtractBlendMode: { r: .6, g: 0, b: 0, a: 1 },
            vividLightBlendMode: { r: .3, g: 0, b: .875, a: 1 },
        } as const;
        for (const [name, result] of Object.entries(expected))
            expectSample(registry.create(name as keyof typeof expected, {}).apply(source, backdrop), result);
    });

    it("keeps divide and vivid-light endpoint calculations finite", () => {
        expectSample(registry.create("divideBlendMode", {}).apply(constant(0, .25, 0), constant(.4, .2, .8)), { r: 1, g: .8, b: 1, a: 1 });
        expectSample(registry.create("vividLightBlendMode", {}).apply(constant(0, .5, 1), constant(.3, .7, .2)), { r: 0, g: .7, b: 1, a: 1 });
    });

    it("uses the W3C non-separable hue, saturation, colour, and luminosity vectors", () => {
        const source = constant(.75, .2, .4), backdrop = constant(.15, .55, .9);
        expectSample(registry.create("hueBlendMode", {}).apply(source, backdrop), { r: .9635, g: .2135, b: .4862272727272728, a: 1 });
        expectSample(registry.create("saturationBlendMode", {}).apply(source, backdrop), { r: .2349333333333333, g: .5282666666666667, b: .7849333333333334, a: 1 });
        expectSample(registry.create("colourBlendMode", {}).apply(source, backdrop), { r: .8315, g: .2815, b: .4815, a: 1 });
        expectSample(registry.create("luminosityBlendMode", {}).apply(source, backdrop), { r: .0685, g: .4685, b: .8185, a: 1 });
    });

    it("preserves W3C HSL behavior at grayscale and clipped luminance extremes", () => {
        expectSample(registry.create("saturationBlendMode", {}).apply(constant(1, 0, 0), constant(.4, .4, .4)), { r: .4, g: .4, b: .4, a: 1 });
        expectSample(registry.create("colourBlendMode", {}).apply(constant(1, 0, 0), constant(1, 1, 1)), { r: 1, g: 1, b: 1, a: 1 });
        expectSample(registry.create("luminosityBlendMode", {}).apply(constant(0, 0, 0), constant(.2, .6, .8)), { r: 0, g: 0, b: 0, a: 1 });
    });

    it("round-trips a named factory through graph serialization", () => {
        const output = registry.create("linearBurnBlendMode", {}).apply(constant(.8, .3, .6), constant(.5, .7, .2));
        const serialized = JSON.parse(JSON.stringify(new IFXFilterGraph(output).serialize()));
        expect(serialized.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "operation", name: "linearBurnBlendMode", parameters: {} })]));
        const restored = IFXFilterGraph.deserialize(serialized);
        expectSample(output, { r: .3, g: 0, b: 0, a: 1 });
        expectSample(restored.output, { r: .3, g: 0, b: 0, a: 1 });
    });

    it("uses source-over alpha for blend modes and component-wise premultiplied alpha for compositing", () => {
        const source = constant(.8, .2, .4, .5), backdrop = constant(.1, .7, .5, .25);
        expectSample(registry.create("linearDodgeBlendMode", {}).apply(source, backdrop), { r: .425, g: .275, b: .325, a: .625 });

        const directSource = constant(.8, .3, .6, .5), directBackdrop = constant(.25, .75, .1, .25);
        expectSample(registry.create("minimumCompositing", {}).apply(directSource, directBackdrop), { r: .0625, g: .15, b: .025, a: .25 });
        expectSample(registry.create("maximumCompositing", {}).apply(directSource, directBackdrop), { r: .4, g: .1875, b: .3, a: .5 });
        expectSample(registry.create("multiplyCompositing", {}).apply(directSource, directBackdrop), { r: .025, g: .028125, b: .0075, a: .125 });
    });

    it("preserves finite source-over behavior for transparent inputs, union extents, and same-pixel ROI", () => {
        const transparentSource = constant(1, .3, .2, 0), backdrop = constant(.2, .4, .8, .75);
        for (const name of blendFactories)
            expectSample(registry.create(name, {}).apply(transparentSource, backdrop), { r: .15, g: .3, b: .6, a: .75 });
        expectSample(registry.create("minimumCompositing", {}).apply(transparentSource, backdrop), { r: 0, g: 0, b: 0, a: 0 });
        expectSample(registry.create("maximumCompositing", {}).apply(transparentSource, backdrop), { r: .15, g: .3, b: .6, a: .75 });
        expectSample(registry.create("multiplyCompositing", {}).apply(transparentSource, backdrop), { r: 0, g: 0, b: 0, a: 0 });

        const left = pixel([255, 0, 0, 255], { x: 0, y: 0 }), right = pixel([0, 0, 255, 255], { x: 1, y: 0 });
        const output = registry.create("colourBlendMode", {}).apply(left, right);
        expect(output.extent).toEqual({ kind: "finite", rect: { x: 0, y: 0, width: 2, height: 1 } });
        expectSample(output, { r: 1, g: 0, b: 0, a: 1 }, .5, .5);
        expectSample(output, { r: 0, g: 0, b: 1, a: 1 }, 1.5, .5);
        expect(new IFXFilterGraph(output).regionsOfInterest({ x: 0, y: 0, width: 2, height: 1 })).toEqual([
            { image: left, region: { x: 0, y: 0, width: 1, height: 1 } },
            { image: right, region: { x: 1, y: 0, width: 1, height: 1 } },
        ]);
    });
});
