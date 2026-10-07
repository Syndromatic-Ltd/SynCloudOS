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
import { GFXImage } from "../../../src/FX/GraphicsFX/public";
import { IFXFilterGraph, IFXFilterRegistry, IFXImage, IFXSampler } from "../../../src/FX/ImageFX/public";

const registry = new IFXFilterRegistry();
const image = (values: readonly number[], width: number, origin?: { x: number; y: number }) => IFXImage.fromPixels(new GFXImage({ width, height: values.length / 4 / width, alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array(values) }), origin);
const sample = (value: IFXImage, x: number, y: number) => new IFXSampler(value).sample({ x, y });
const nearest = (value: IFXImage, x: number, y: number) => new IFXSampler(value).sample({ x, y }, "nearest");
function gray(values: readonly number[], width: number, alpha = 255, origin?: { x: number; y: number }): IFXImage {
    const data: number[] = [];
    for (const value of values)
        data.push(value, value, value, alpha);
    return image(data, width, origin);
}
function solid(value: number, width: number, height: number, alpha = 255, origin?: { x: number; y: number }): IFXImage {
    return gray(Array.from({ length: width * height }, () => value), width, alpha, origin);
}

describe("ImageFX sourced spatial factories", () => {
    it("normalizes the source-backed defaults and nearest-odd rectangular support without rejecting finite floats", () => {
        expect(registry.names()).toEqual(expect.arrayContaining(["maskedVariableBlur", "morphologyRectangleMaximum", "morphologyRectangleMinimum", "zoomBlur", "sobelGradients"]));
        expect(registry.create("maskedVariableBlur", {}).parameters).toEqual({ radius: 10 });
        expect(registry.create("zoomBlur", {}).parameters).toEqual({ center: { x: 150, y: 150 }, amount: 20 });
        expect(registry.create("morphologyRectangleMaximum", { width: 4, height: 2 }).parameters).toEqual({ width: 5, height: 3 });
        expect(registry.create("morphologyRectangleMinimum", { width: 3.4, height: 2.6 }).parameters).toEqual({ width: 3, height: 3 });
        expect(() => registry.create("morphologyRectangleMaximum", {} as never)).toThrow(/width/i);
        expect(() => registry.create("morphologyRectangleMaximum", { width: Infinity, height: 3 })).toThrow(/range/i);
        expect(() => registry.create("morphologyRectangleMaximum", { width: 63, height: 63 })).toThrow(/support/i);
        expect(() => registry.create("maskedVariableBlur", { radius: 101 })).toThrow(/range/i);
        expect(() => registry.create("zoomBlur", { amount: -1 })).toThrow(/range/i);
    });

    it("applies maximum and minimum over a rectangular, non-square support with a conservative halo", () => {
        const source = gray([
            0, 0, 0, 0, 0,
            0, 64, 128, 192, 0,
            0, 0, 0, 0, 0,
        ], 5);
        const maximum = registry.create("morphologyRectangleMaximum", { width: 3, height: 1 }).apply(source);
        const minimum = registry.create("morphologyRectangleMinimum", { width: 3, height: 1 }).apply(source);
        expect(nearest(maximum, 2.5, 1.5).r).toBeCloseTo(192 / 255, 8);
        expect(nearest(minimum, 2.5, 1.5).r).toBeCloseTo(64 / 255, 8);

        const large = solid(0, 20, 20, 255, { x: 10.25, y: -2.5 });
        const rectangular = registry.create("morphologyRectangleMaximum", { width: 4, height: 2 }).apply(large);
        expect(rectangular.extent).toEqual({ kind: "finite", rect: { x: 8.25, y: -3.5, width: 24, height: 22 } });
        expect(new IFXFilterGraph(rectangular).regionsOfInterest({ x: 15.25, y: 3.5, width: 1, height: 1 })[0]?.region).toEqual({ x: 12.25, y: 1.5, width: 7, height: 5 });
    });

    it("varies a bounded radial Gaussian blur from black through semitransparent to white grayscale masks", () => {
        const row = [0, 16, 64, 144, 255], source = gray(Array.from({ length: 5 }, () => row).flat(), 5);
        const black = solid(0, 5, 5), white = solid(255, 5, 5), translucentWhite = solid(255, 5, 5, 128), transparentWhite = solid(255, 5, 5, 0);
        const operation = registry.create("maskedVariableBlur", { radius: 2 });
        const noBlur = sample(operation.apply(source, black), 2.5, 2.5).r;
        const fullBlur = sample(operation.apply(source, white), 2.5, 2.5).r;
        const partialBlur = sample(operation.apply(source, translucentWhite), 2.5, 2.5).r;
        expect(noBlur).toBeCloseTo(64 / 255, 8);
        expect(fullBlur).toBeCloseTo(1279 / (16 * 255), 8);
        expect(partialBlur).toBeGreaterThan(noBlur);
        expect(partialBlur).toBeLessThan(fullBlur);
        expect(sample(operation.apply(source, transparentWhite), 2.5, 2.5).r).toBeCloseTo(noBlur, 8);

        const largeSource = solid(0, 20, 20), largeMask = solid(255, 20, 20);
        const bounded = operation.apply(largeSource, largeMask);
        const roi = new IFXFilterGraph(bounded).regionsOfInterest({ x: 10, y: 10, width: 1, height: 1 });
        expect(roi[0]?.region).toEqual({ x: 7, y: 7, width: 7, height: 7 });
        expect(roi[1]?.region).toEqual({ x: 9.5, y: 9.5, width: 2, height: 2 });
        const sampler = new IFXSampler(bounded, "linear-srgb", 128);
        sampler.sample({ x: 10.5, y: 10.5 });
        expect(sampler.evaluations).toBeLessThanOrEqual(30);
    });

    it("uses the sampled grayscale mask at each output cell rather than applying a uniform blur", () => {
        const sourceValues = Array.from({ length: 9 * 5 }, (_, index) => index === 2 * 9 + 4 ? 255 : 0);
        const maskValues = Array.from({ length: 9 * 5 }, (_, index) => index % 9 === 5 ? 255 : 0);
        const output = registry.create("maskedVariableBlur", { radius: 2 }).apply(gray(sourceValues, 9), gray(maskValues, 9));
        expect(nearest(output, 4.5, 2.5)).toEqual({ r: 1, g: 1, b: 1, a: 1 });
        expect(nearest(output, 5.5, 2.5).r).toBeCloseTo(24 / 256, 8);

        const source = solid(0, 20, 20, 255, { x: 10.25, y: -2.5 });
        const mask = solid(255, 20, 20, 255, { x: 9.75, y: -3.25 });
        const shifted = registry.create("maskedVariableBlur", { radius: 2 }).apply(source, mask);
        expect(shifted.extent).toEqual({ kind: "finite", rect: { x: 8.25, y: -4.5, width: 24, height: 24 } });
        const roi = new IFXFilterGraph(shifted).regionsOfInterest({ x: 15.25, y: 3.75, width: .5, height: .25 });
        expect(roi).toHaveLength(2);
        expect(roi[0]?.region).toEqual({ x: 12.25, y: .75, width: 6.5, height: 6.25 });
        expect(roi[1]?.region).toEqual({ x: 14.75, y: 3.25, width: 1.5, height: 1.25 });
    });

    it("samples only along the center-to-pixel ray for zoom blur and keeps its bounded radial ROI", () => {
        const values = Array.from({ length: 9 }, (_, index) => index === 5 ? 255 : 0), source = gray(values, 9);
        const zoom = registry.create("zoomBlur", { center: { x: .5, y: .5 }, amount: 2 }).apply(source);
        expect(nearest(zoom, 7.5, .5).r).toBeGreaterThan(0);
        expect(nearest(zoom, 3.5, .5).r).toBe(0);
        expect(nearest(registry.create("zoomBlur", { center: { x: .5, y: .5 }, amount: 0 }).apply(source), 5.5, .5).r).toBe(1);
        expect(zoom.extent).toEqual({ kind: "finite", rect: { x: -2, y: -2, width: 13, height: 5 } });

        const large = solid(0, 20, 20), bounded = registry.create("zoomBlur", { center: { x: .5, y: .5 }, amount: 2 }).apply(large);
        expect(new IFXFilterGraph(bounded).regionsOfInterest({ x: 10, y: 10, width: 1, height: 1 })[0]?.region).toEqual({ x: 7, y: 7, width: 7, height: 7 });
        const sampler = new IFXSampler(bounded, "linear-srgb", 64);
        sampler.sample({ x: 10.5, y: 10.5 });
        expect(sampler.evaluations).toBeLessThanOrEqual(12);

        const maximumOperation = registry.create("zoomBlur", { center: { x: 10.5, y: -2 }, amount: 100 });
        const maximum = maximumOperation.apply(solid(128, 20, 20, 255, { x: 10.25, y: -2.5 }));
        expect(maximumOperation.parameters).toEqual({ center: { x: 10.5, y: -2 }, amount: 100 });
        expect(maximum.extent).toEqual({ kind: "finite", rect: { x: -89.75, y: -102.5, width: 220, height: 220 } });
        const centerSampler = new IFXSampler(maximum, "linear-srgb", 16);
        centerSampler.sample({ x: 10.5, y: -2 });
        expect(centerSampler.evaluations).toBeLessThanOrEqual(2);
        const maximumSampler = new IFXSampler(maximum, "linear-srgb", 16);
        maximumSampler.sample({ x: 20.5, y: 5.5 });
        expect(maximumSampler.evaluations).toBeLessThanOrEqual(12);
    });

    it("uses a bounded circular bokeh aperture whose radius, ring, and softness parameters have distinct responses", () => {
        expect(registry.names()).toEqual(expect.arrayContaining(["bokehBlur", "noiseReduction"]));
        expect(registry.create("bokehBlur", {}).parameters).toEqual({ radius: 20, ringAmount: 0, ringSize: .1, softness: 1 });

        const impulse = gray(Array.from({ length: 81 }, (_, index) => index === 4 * 9 + 4 ? 255 : 0), 9);
        const unblurred = nearest(registry.create("bokehBlur", { radius: 0 }).apply(impulse), 4.5, 4.5).r;
        const hardDisc = nearest(registry.create("bokehBlur", { radius: 2, ringAmount: 0, ringSize: .1, softness: 0 }).apply(impulse), 4.5, 4.5).r;
        const softDisc = nearest(registry.create("bokehBlur", { radius: 2, ringAmount: 0, ringSize: .1, softness: 1 }).apply(impulse), 4.5, 4.5).r;
        // The portable hard aperture has thirteen equally weighted circular sample locations.
        expect(unblurred).toBe(1);
        expect(hardDisc).toBeCloseTo(1 / 13, 8);
        expect(softDisc).toBeCloseTo(1 / (3 + 4 * (1 - Math.SQRT1_2)), 8);

        const offsetImpulse = gray(Array.from({ length: 81 }, (_, index) => index === 4 * 9 + 5 ? 255 : 0), 9);
        const noRing = nearest(registry.create("bokehBlur", { radius: 2, ringAmount: 0, ringSize: .5, softness: 0 }).apply(offsetImpulse), 4.5, 4.5).r;
        const halfRing = nearest(registry.create("bokehBlur", { radius: 2, ringAmount: 1, ringSize: .5, softness: 0 }).apply(offsetImpulse), 4.5, 4.5).r;
        const innerRing = nearest(registry.create("bokehBlur", { radius: 2, ringAmount: 1, ringSize: .1, softness: 0 }).apply(offsetImpulse), 4.5, 4.5).r;
        const noRingOtherSize = nearest(registry.create("bokehBlur", { radius: 2, ringAmount: 0, ringSize: .9, softness: 0 }).apply(offsetImpulse), 4.5, 4.5).r;
        expect(halfRing).toBeGreaterThan(noRing);
        expect(halfRing).toBeGreaterThan(innerRing);
        expect(noRingOtherSize).toBeCloseTo(noRing, 12);

        const alphaData = Array.from({ length: 81 }, (_, index) => index === 4 * 9 + 4 ? [255, 0, 0, 128] : [0, 0, 0, 0]).flat();
        const translucent = nearest(registry.create("bokehBlur", { radius: 2, ringAmount: 0, ringSize: .1, softness: 0 }).apply(image(alphaData, 9)), 4.5, 4.5);
        expect(translucent.r).toBeCloseTo((128 / 255) / 13, 8);
        expect(translucent.a).toBeCloseTo((128 / 255) / 13, 8);

        const large = solid(0, 20, 20, 255, { x: 10.25, y: -2.5 });
        const bounded = registry.create("bokehBlur", { radius: 2 }).apply(large);
        expect(bounded.extent).toEqual({ kind: "finite", rect: { x: 8.25, y: -4.5, width: 24, height: 24 } });
        expect(new IFXFilterGraph(bounded).regionsOfInterest({ x: 15.25, y: 3.5, width: 1, height: 1 })[0]?.region).toEqual({ x: 12.25, y: .5, width: 7, height: 7 });
        const sampler = new IFXSampler(bounded, "linear-srgb", 64);
        sampler.sample({ x: 15.5, y: 3.5 });
        expect(sampler.evaluations).toBeLessThanOrEqual(16);
        expect(() => registry.create("bokehBlur", { softness: -1 })).toThrow(/range/i);
        expect(() => registry.create("bokehBlur", { radius: Infinity })).toThrow(/range/i);
    });

    it("reduces sub-threshold flat noise locally, sharpens an edge above the threshold, and preserves center alpha", () => {
        expect(registry.create("noiseReduction", {}).parameters).toEqual({ noiseLevel: .02, sharpness: .4 });

        const noisy = gray(Array.from({ length: 9 }, (_, index) => index === 4 ? 130 : 128), 3);
        const lowThreshold = nearest(registry.create("noiseReduction", { noiseLevel: .01, sharpness: 0 }).apply(noisy), 1.5, 1.5).r;
        const source = 130 / 255, mean = (8 * 128 + 130) / (9 * 255), delta = source - mean;
        const expected = source - delta * (1 - delta / .02);
        const defaultReduced = nearest(registry.create("noiseReduction", { noiseLevel: .02, sharpness: 0 }).apply(noisy), 1.5, 1.5).r;
        const highThreshold = nearest(registry.create("noiseReduction", { noiseLevel: .04, sharpness: 0 }).apply(noisy), 1.5, 1.5).r;
        expect(defaultReduced).toBeCloseTo(expected, 8);
        expect(highThreshold).toBeLessThan(lowThreshold);

        const step = gray(Array.from({ length: 3 }, () => [64, 128, 128]).flat(), 3);
        const unsharpened = nearest(registry.create("noiseReduction", { noiseLevel: .02, sharpness: 0 }).apply(step), 1.5, 1.5).r;
        const sharpened = nearest(registry.create("noiseReduction", { noiseLevel: .02, sharpness: 1 }).apply(step), 1.5, 1.5).r;
        expect(unsharpened).toBeCloseTo(128 / 255, 8);
        expect(sharpened).toBeCloseTo(448 / (3 * 255), 8);

        const alphaData = Array.from({ length: 9 }, (_, index) => index === 4 ? [255, 0, 0, 128] : [0, 0, 0, 0]).flat();
        const translucent = nearest(registry.create("noiseReduction", {}).apply(image(alphaData, 3)), 1.5, 1.5);
        expect(translucent.a).toBeCloseTo(128 / 255, 8);
        expect(translucent.r).toBeCloseTo(128 / 255, 8);

        const bounded = registry.create("noiseReduction", {}).apply(solid(128, 20, 20));
        expect(new IFXFilterGraph(bounded).regionsOfInterest({ x: 10, y: 10, width: 1, height: 1 })[0]?.region).toEqual({ x: 9, y: 9, width: 3, height: 3 });
        const sampler = new IFXSampler(bounded, "linear-srgb", 32);
        sampler.sample({ x: 10.5, y: 10.5 });
        expect(sampler.evaluations).toBeLessThanOrEqual(12);
        const restored = IFXFilterGraph.deserialize(JSON.parse(JSON.stringify(new IFXFilterGraph(registry.create("noiseReduction", {}).apply(noisy)).serialize())));
        expect(nearest(restored.output, 1.5, 1.5)).toEqual(nearest(registry.create("noiseReduction", {}).apply(noisy), 1.5, 1.5));
        expect(() => registry.create("noiseReduction", { noiseLevel: Infinity })).toThrow(/range/i);
        expect(() => registry.create("noiseReduction", { sharpness: -1 })).toThrow(/range/i);
    });

    it("calculates component-wise Sobel magnitudes, preserves the portable alpha policy, and round-trips the named factory", () => {
        const rgba: number[] = [];
        for (let y = 0; y < 3; y++)
            for (let x = 0; x < 3; x++)
                rgba.push(x === 0 ? 0 : 255, 0, 0, 128);
        const source = image(rgba, 3), output = registry.create("sobelGradients", {}).apply(source), edge = nearest(output, 1.5, 1.5);
        expect(output.extent).toEqual({ kind: "finite", rect: { x: 0, y: 0, width: 3, height: 3 } });
        expect(new IFXFilterGraph(output).regionsOfInterest({ x: 1, y: 1, width: 1, height: 1 })[0]?.region).toEqual({ x: 0, y: 0, width: 3, height: 3 });
        expect(edge.r).toBeCloseTo(128 / 255, 8);
        expect(edge.g).toBe(0);
        expect(edge.b).toBe(0);
        expect(edge.a).toBeCloseTo(128 / 255, 8);
        expect(nearest(registry.create("sobelGradients", {}).apply(solid(0, 3, 3)), 1.5, 1.5)).toEqual({ r: 0, g: 0, b: 0, a: 1 });
        expect(() => registry.create("sobelGradients", { unexpected: true } as never)).toThrow();
        const restored = IFXFilterGraph.deserialize(JSON.parse(JSON.stringify(new IFXFilterGraph(output).serialize())));
        expect(nearest(restored.output, 1.5, 1.5)).toEqual(edge);
    });
});
