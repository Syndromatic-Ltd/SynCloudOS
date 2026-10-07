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
import { IFXContext, IFXFilterGraph, IFXFilterRegistry, IFXImage, IFXSampler } from "../../../src/FX/ImageFX/public";

const registry = new IFXFilterRegistry();
const image = (values: readonly number[], width: number, origin?: { x: number; y: number }) => IFXImage.fromPixels(new GFXImage({ width, height: values.length / (width * 4), alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array(values) }), origin);
const sample = (value: IFXImage, x: number, y: number) => new IFXSampler(value).sample({ x, y }, "nearest");
const constant = (value: number, width: number, height: number) => IFXImage.constant(GFXColour.linearSRGB(value, value, value)).cropped({ x: 0, y: 0, width, height });
function strip(values: readonly number[]): IFXImage {
    if (values.length === 0)
        throw new RangeError("Strip requires at least one value.");
    let output = constant(values[0]!, 1, 1);
    for (let x = 1; x < values.length; x++)
        output = IFXImage.constant(GFXColour.linearSRGB(values[x]!, values[x]!, values[x]!)).cropped({ x, y: 0, width: 1, height: 1 }).compositedOver(output);
    return output;
}
function expectSample(value: IFXImage, x: number, y: number, expected: Readonly<{ r: number; g: number; b: number; a: number; }>): void {
    const actual = sample(value, x, y);
    for (const key of ["r", "g", "b", "a"] as const)
        expect(actual[key]).toBeCloseTo(expected[key], 8);
}

describe("ImageFX bounded reduction factories", () => {
    it("registers the six captured reduction factories with their typed parameter contracts", () => {
        const extent = { x: 0, y: 0, width: 2, height: 1 };
        expect(registry.names("reduction")).toEqual(expect.arrayContaining(["areaLogarithmicHistogram", "areaMaximumAlpha", "areaMinimumAlpha", "areaMinMax", "areaMinMaxRed", "histogramDisplay"]));
        expect(registry.create("areaLogarithmicHistogram", { extent, count: 3, minimumStop: -2, maximumStop: 0, scale: 1 }).inputCount).toBe(1);
        expect(registry.create("areaMaximumAlpha", { extent }).inputCount).toBe(1);
        expect(registry.create("areaMinimumAlpha", { extent }).inputCount).toBe(1);
        expect(registry.create("areaMinMax", { extent }).inputCount).toBe(1);
        expect(registry.create("areaMinMaxRed", { extent }).inputCount).toBe(1);
        expect(registry.create("histogramDisplay", { height: 4, lowLimit: .25, highLimit: .75 }).inputCount).toBe(1);
        expect(() => registry.create("areaLogarithmicHistogram", { extent, minimumStop: 0, maximumStop: 0 })).toThrow();
        expect(() => registry.create("histogramDisplay", { height: 4, lowLimit: .75, highLimit: .25 })).toThrow();
    });

    it("computes explicitly bounded logarithmic histogram bins", () => {
        const input = image([64, 64, 64, 255, 128, 128, 128, 255, 255, 255, 255, 255, 0, 0, 0, 255], 4);
        const output = registry.create("areaLogarithmicHistogram", { extent: { x: 0, y: 0, width: 4, height: 1 }, count: 3, minimumStop: -2, maximumStop: 0, scale: 1 }).apply(input);
        expect(output.extent).toEqual({ kind: "finite", rect: { x: 0, y: 0, width: 3, height: 1 } });
        expectSample(output, .5, .5, { r: .5, g: .5, b: .5, a: 1 });
        expectSample(output, 1.5, .5, { r: .25, g: .25, b: .25, a: 1 });
        expectSample(output, 2.5, .5, { r: .25, g: .25, b: .25, a: 1 });
    });

    it("snapshots logarithmic defaults and places zero and stop endpoints in deterministic bins", () => {
        const extent = { x: 0, y: 0, width: 4, height: 1 };
        expect(registry.create("areaLogarithmicHistogram", { extent }).parameters).toEqual({ extent, count: 64, minimumStop: -10, maximumStop: 4, scale: 1 });
        const output = registry.create("areaLogarithmicHistogram", { extent, count: 4, minimumStop: -2, maximumStop: 0, scale: 1 }).apply(strip([0, .25, .5, 1]));
        expectSample(output, .5, .5, { r: .5, g: .5, b: .5, a: 1 });
        expectSample(output, 1.5, .5, { r: 0, g: 0, b: 0, a: 1 });
        expectSample(output, 2.5, .5, { r: .25, g: .25, b: .25, a: 1 });
        expectSample(output, 3.5, .5, { r: .25, g: .25, b: .25, a: 1 });
    });

    it("packs alpha extrema and component and red min/max results into their reduction cells", () => {
        const alphaInput = image([10, 20, 30, 64, 100, 130, 250, 192], 2);
        const alphaExtent = { x: 0, y: 0, width: 2, height: 1 };
        expectSample(registry.create("areaMaximumAlpha", { extent: alphaExtent }).apply(alphaInput), .5, .5, { r: 0, g: 0, b: 0, a: 192 / 255 });
        expectSample(registry.create("areaMinimumAlpha", { extent: alphaExtent }).apply(alphaInput), .5, .5, { r: 0, g: 0, b: 0, a: 64 / 255 });

        const channels = image([51, 179, 102, 255, 230, 26, 204, 255], 2);
        const output = registry.create("areaMinMax", { extent: alphaExtent }).apply(channels);
        expect(output.extent).toEqual({ kind: "finite", rect: { x: 0, y: 0, width: 2, height: 1 } });
        expectSample(output, .5, .5, { r: 51 / 255, g: 26 / 255, b: 102 / 255, a: 1 });
        expectSample(output, 1.5, .5, { r: 230 / 255, g: 179 / 255, b: 204 / 255, a: 1 });
        const red = registry.create("areaMinMaxRed", { extent: alphaExtent }).apply(channels);
        expectSample(red, .5, .5, { r: 51 / 255, g: 0, b: 0, a: 1 });
        expectSample(red, 1.5, .5, { r: 230 / 255, g: 0, b: 0, a: 1 });
    });

    it("keeps nonzero analysis origins and distinguishes premultiplied components from straight red", () => {
        const origin = { x: -4, y: 3 }, source = image([255, 0, 0, 128, 51, 0, 0, 255], 2, origin), extent = { x: -4, y: 3, width: 2, height: 1 };
        const alpha = registry.create("areaMaximumAlpha", { extent }).apply(source);
        expectSample(alpha, .5, .5, { r: 0, g: 0, b: 0, a: 1 });
        expect(new IFXFilterGraph(alpha).regionsOfInterest({ x: 0, y: 0, width: 1, height: 1 })).toEqual([{ image: source, region: extent }]);

        const components = registry.create("areaMinMax", { extent }).apply(source);
        expectSample(components, .5, .5, { r: 51 / 255, g: 0, b: 0, a: 128 / 255 });
        expectSample(components, 1.5, .5, { r: 128 / 255, g: 0, b: 0, a: 1 });
        const red = registry.create("areaMinMaxRed", { extent }).apply(source);
        expectSample(red, .5, .5, { r: 51 / 255, g: 0, b: 0, a: 1 });
        expectSample(red, 1.5, .5, { r: 1, g: 0, b: 0, a: 1 });
    });

    it("renders bounded histogram columns from explicit display limits", () => {
        const histogram = image([0, 127, 192, 255, 255, 0, 128, 255], 2);
        const output = registry.create("histogramDisplay", { height: 4, lowLimit: .25, highLimit: .75 }).apply(histogram);
        expect(output.extent).toEqual({ kind: "finite", rect: { x: 0, y: 0, width: 2, height: 4 } });
        expectSample(output, .5, .5, { r: 0, g: 1, b: 1, a: 1 });
        expectSample(output, .5, 2.5, { r: 0, g: 0, b: 1, a: 1 });
        expectSample(output, 1.5, .5, { r: 1, g: 0, b: 1, a: 1 });
        expect(() => registry.create("histogramDisplay", {}).apply(image([0, 0, 0, 255, 255, 255, 255, 255], 1))).toThrow(/one-row finite histogram/i);
    });

    it("uses the entire selected analysis region once per sampler, caps output cells, and cooperates with cancellation", async () => {
        const sourceData = new Uint8Array(128 * 128 * 4);
        for (let index = 0; index < sourceData.length; index += 4)
            sourceData.set([128, 128, 128, 255], index);
        const input = IFXImage.fromPixels(new GFXImage({ width: 128, height: 128, alpha: "straight", colourSpace: "linear-srgb", data: sourceData })), extent = { x: 0, y: 0, width: 128, height: 128 };
        const output = registry.create("areaLogarithmicHistogram", { extent, count: 256, minimumStop: -2, maximumStop: 0, scale: 1 }).apply(input);
        expect(new IFXFilterGraph(output).regionsOfInterest({ x: 3, y: 0, width: 1, height: 1 })).toEqual([{ image: input, region: extent }]);
        const sampler = new IFXSampler(output, "linear-srgb", 30000);
        sampler.sample({ x: .5, y: .5 }, "nearest");
        const firstCost = sampler.evaluations;
        sampler.sample({ x: 1.5, y: .5 }, "nearest");
        expect(sampler.evaluations - firstCost).toBeLessThanOrEqual(2);

        const histogram = constant(.5, 256, 1);
        expect(() => registry.create("histogramDisplay", { height: 257 }).apply(histogram)).toThrow(/output/i);
        const exactAnalysisBoundary = registry.create("areaMaximumAlpha", { extent: { x: 0, y: 0, width: 65536, height: 1 } }).apply(constant(.5, 65536, 1));
        expectSample(exactAnalysisBoundary, .5, .5, { r: 0, g: 0, b: 0, a: 1 });
        expect(() => registry.create("areaLogarithmicHistogram", { extent: { x: 0, y: 0, width: 65537, height: 1 } }).apply(constant(.5, 65537, 1))).toThrow(/region/i);
        expect(() => registry.create("areaMinMax", { extent: { x: .5, y: 0, width: 1, height: 1 } })).toThrow(/integral/i);

        const task = new IFXContext().startTask(output);
        setTimeout(() => task.cancel(), 0);
        await expect(task.waitUntilCompleted()).rejects.toMatchObject({ name: "AbortError" });
    });
});
