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
const constant = (r: number, g = r, b = r, a = 1, origin = { x: 0, y: 0 }) => IFXImage.constant(GFXColour.linearSRGB(r, g, b, a)).cropped({ ...origin, width: 1, height: 1 });
const sample = (image: IFXImage, x = .5, y = .5) => new IFXSampler(image).sample({ x, y }, "nearest");
const straight = (value: Readonly<{ r: number; g: number; b: number; a: number; }>) => value.a === 0 ? { r: 0, g: 0, b: 0, a: 0 } : { r: value.r / value.a, g: value.g / value.a, b: value.b / value.a, a: value.a };
function expectStraight(actual: Readonly<{ r: number; g: number; b: number; a: number; }>, expected: Readonly<{ r: number; g: number; b: number; a: number; }>, precision = 7): void {
    const value = straight(actual);
    for (const key of ["r", "g", "b", "a"] as const)
        expect(value[key]).toBeCloseTo(expected[key], precision);
}

const temperatureContract: IFXFilterParameters["temperatureAndTint"] = { neutral: { x: 6500, y: 0 }, targetNeutral: { x: 4000, y: 0 } };
const toneCurveContract: IFXFilterParameters["toneCurve"] = { point0: { x: 0, y: 0 }, point1: { x: .25, y: .25 }, point2: { x: .5, y: .5 }, point3: { x: .75, y: .75 }, point4: { x: 1, y: 1 }, extrapolate: false };
const vibranceContract: IFXFilterParameters["vibrance"] = { amount: .5 };
const whitePointContract: IFXFilterParameters["whitePointAdjust"] = { colour: [1, .6, .6, 1] };
// @ts-expect-error CIVibrance has no captured default amount.
const missingVibranceAmount: IFXFilterParameters["vibrance"] = {};
// @ts-expect-error CIWhitePointAdjust has no captured default colour.
const missingWhitePointColour: IFXFilterParameters["whitePointAdjust"] = {};
void temperatureContract;
void toneCurveContract;
void vibranceContract;
void whitePointContract;
void missingVibranceAmount;
void missingWhitePointColour;

describe("ImageFX sourced colour-adjustment factories", () => {
    it("registers the four source-shaped contracts, retaining only captured defaults", () => {
        expect(registry.names()).toHaveLength(203);
        expect(registry.names()).toEqual(expect.arrayContaining(["temperatureAndTint", "toneCurve", "vibrance", "whitePointAdjust"]));
        expect(registry.create("temperatureAndTint", {}).parameters).toEqual({ neutral: { x: 6500, y: 0 }, targetNeutral: { x: 6500, y: 0 } });
        expect(registry.create("toneCurve", {}).parameters).toEqual({ point0: { x: 0, y: 0 }, point1: { x: .25, y: .25 }, point2: { x: .5, y: .5 }, point3: { x: .75, y: .75 }, point4: { x: 1, y: 1 }, extrapolate: false });
        expect(registry.create("vibrance", { amount: 2 }).parameters).toEqual({ amount: 2 });
        expect(registry.create("whitePointAdjust", { colour: [1, .6, .6, 1] }).parameters).toEqual({ colour: [1, .6, .6, 1] });
        expect(() => registry.create("vibrance", {} as never)).toThrow(/amount/i);
        expect(() => registry.create("whitePointAdjust", {} as never)).toThrow(/colour/i);
        expect(() => registry.create("temperatureAndTint", { neutral: { x: 900, y: 0 } } as never)).toThrow(/temperature|CCT/i);
        expect(() => registry.create("temperatureAndTint", { targetNeutral: { x: 6500, y: 151 } } as never)).toThrow(/tint/i);
        expect(() => registry.create("toneCurve", { point0: { x: 0, y: 0 }, point1: { x: .75, y: .25 }, point2: { x: .5, y: .5 }, point3: { x: .8, y: .75 }, point4: { x: 1, y: 1 } } as never)).toThrow(/increasing|curve/i);
        expect(() => registry.create("toneCurve", { point0: { x: 0, y: 0 }, point1: { x: Number.MIN_VALUE, y: 1 }, point2: { x: .5, y: .5 }, point3: { x: .75, y: .75 }, point4: { x: 1, y: 1 } } as never)).toThrow(/spline|finite/i);
        expect(() => registry.create("toneCurve", { extrapolate: 1 } as never)).toThrow(/boolean/i);
        expect(() => registry.create("whitePointAdjust", { colour: [1, 1, 1, 1], profile: "native" } as never)).toThrow(/unknown/i);
    });

    it("maps gray shades to the supplied white-point colour while retaining source alpha", () => {
        const input = constant(.5, .5, .5, .4, { x: -3, y: 7 });
        const output = registry.create("whitePointAdjust", { colour: [.8, .6, .4, .1] }).apply(input);
        expect(output.extent).toEqual(input.extent);
        expectStraight(sample(output, -2.5, 7.5), { r: .4, g: .3, b: .2, a: .4 });
        const roiInput = IFXImage.fromPixels(new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array([128, 128, 128, 102]) }), { x: -3, y: 7 });
        const roiOutput = registry.create("whitePointAdjust", { colour: [.8, .6, .4, .1] }).apply(roiInput);
        expect(new IFXFilterGraph(roiOutput).regionsOfInterest({ x: -2.8, y: 7.2, width: .25, height: .25 })).toEqual([{ image: roiInput, region: { x: -2.8, y: 7.2, width: .25, height: .25 } }]);
    });

    it("uses saturation headroom for the portable vibrance scalar and preserves translucent straight colours", () => {
        const input = constant(.5, .25, .25, .6, { x: 4, y: -2 });
        const increased = registry.create("vibrance", { amount: .5 }).apply(input);
        const decreased = registry.create("vibrance", { amount: -.5 }).apply(input);
        // Golden values use luma .2126R + .7152G + .0722B and a 1 + amount * (1 - chroma) scale.
        expectStraight(sample(increased, 4.5, -1.5), { r: .57381875, g: .23006875, b: .23006875, a: .6 });
        expectStraight(sample(decreased, 4.5, -1.5), { r: .42618125, g: .26993125, b: .26993125, a: .6 });
        expectStraight(sample(registry.create("vibrance", { amount: 2 }).apply(constant(.5)), .5, .5), { r: .5, g: .5, b: .5, a: 1 });
    });

    it("applies five-knot gamma-two spline values at endpoints and knots, clamps portable overshoot, and permits nonmonotonic y knots", () => {
        expectStraight(sample(registry.create("toneCurve", {}).apply(constant(.36)), .5, .5), { r: .36, g: .36, b: .36, a: 1 });
        const curve = registry.create("toneCurve", {
            point0: { x: 0, y: 0 },
            point1: { x: .25, y: 1 },
            point2: { x: .5, y: 0 },
            point3: { x: .75, y: 1 },
            point4: { x: 1, y: 0 },
            extrapolate: false,
        });
        expectStraight(sample(curve.apply(constant(0)), .5, .5), { r: 0, g: 0, b: 0, a: 1 });
        expectStraight(sample(curve.apply(constant(.0625)), .5, .5), { r: 1, g: 1, b: 1, a: 1 });
        expectStraight(sample(curve.apply(constant(1)), .5, .5), { r: 0, g: 0, b: 0, a: 1 });
        expectStraight(sample(curve.apply(constant(.04)), .5, .5), { r: 1, g: 1, b: 1, a: 1 });
        const overshoot = registry.create("toneCurve", {
            point0: { x: 0, y: 0 },
            point1: { x: .25, y: 0 },
            point2: { x: .5, y: 1 },
            point3: { x: .75, y: 0 },
            point4: { x: 1, y: 0 },
        }).apply(constant(.04));
        expectStraight(sample(overshoot), { r: 0, g: 0, b: 0, a: 1 });
    });

    it("uses the bounded portable temperature/tint adaptation, preserves alpha and serializes normalized parameters", () => {
        const input = constant(.5, .5, .5, .5, { x: 8, y: -5 });
        const identity = registry.create("temperatureAndTint", {}).apply(input);
        expectStraight(sample(identity, 8.5, -4.5), { r: .5, g: .5, b: .5, a: .5 });
        const warm = registry.create("temperatureAndTint", { neutral: { x: 6500, y: 0 }, targetNeutral: { x: 4000, y: 0 } }).apply(input);
        const tinted = registry.create("temperatureAndTint", { neutral: { x: 6500, y: 0 }, targetNeutral: { x: 6500, y: 40 } }).apply(input);
        const warmColour = straight(sample(warm, 8.5, -4.5));
        // Independent portable-policy golden: D50 PCS gray adapted from 6500 K to 4000 K.
        expectStraight(sample(warm, 8.5, -4.5), { r: .6508023265, g: .4739172019, b: .2549198904, a: .5 }, 7);
        expect(warmColour.r).toBeGreaterThan(.5);
        expect(warmColour.b).toBeLessThan(.5);
        expect(warmColour.a).toBeCloseTo(.5, 8);
        expectStraight(sample(tinted, 8.5, -4.5), { r: .4862314168, g: .5054416713, b: .4861846116, a: .5 }, 7);
        const chained = registry.create("whitePointAdjust", { colour: [.9, .8, .7, .2] }).apply(registry.create("vibrance", { amount: .5 }).apply(registry.create("toneCurve", { extrapolate: true }).apply(warm)));
        const serialized = JSON.parse(JSON.stringify(new IFXFilterGraph(chained).serialize()));
        expect(serialized.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "operation", name: "temperatureAndTint", parameters: { neutral: { x: 6500, y: 0 }, targetNeutral: { x: 4000, y: 0 } } })]));
        expect(serialized.nodes).toEqual(expect.arrayContaining([
            expect.objectContaining({ kind: "operation", name: "toneCurve", parameters: expect.objectContaining({ extrapolate: true }) }),
            expect.objectContaining({ kind: "operation", name: "vibrance", parameters: { amount: .5 } }),
            expect.objectContaining({ kind: "operation", name: "whitePointAdjust", parameters: { colour: [.9, .8, .7, .2] } }),
        ]));
        expectStraight(sample(IFXFilterGraph.deserialize(serialized).output, 8.5, -4.5), straight(sample(chained, 8.5, -4.5)));
    });
});
