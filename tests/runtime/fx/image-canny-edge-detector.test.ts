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
import { IFXContext, IFXFilterGraph, IFXFilterRegistry, IFXImage, IFXRenderDestination, IFXSampler } from "../../../src/FX/ImageFX/public";

const registry = new IFXFilterRegistry();
const image = (values: readonly number[], width: number, origin?: { x: number; y: number }) => IFXImage.fromPixels(new GFXImage({ width, height: values.length / 4 / width, alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array(values) }), origin);
const sample = (value: IFXImage, x: number, y: number) => new IFXSampler(value).sample({ x, y }, "nearest");
const pixel = (value: number) => [value, value, value, 255] as const;
function verticalStep(width = 7, height = 7, left = 0, right = 255, origin?: { x: number; y: number }): IFXImage {
    const values: number[] = [];
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
            values.push(...pixel(x < Math.floor(width / 2) ? left : right));
    return image(values, width, origin);
}
function diagonalStep(size = 7): IFXImage {
    const values: number[] = [];
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++)
            values.push(...pixel(x >= y ? 255 : 0));
    return image(values, size);
}
function largeVerticalStep(size = 512): IFXImage {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
            const index = (y * size + x) * 4, value = x < size / 2 ? 0 : 255;
            data[index] = value;
            data[index + 1] = value;
            data[index + 2] = value;
            data[index + 3] = 255;
        }
    return IFXImage.fromPixels(new GFXImage({ width: size, height: size, alpha: "straight", colourSpace: "linear-srgb", data }));
}

describe("ImageFX Canny edge detector", () => {
    it("uses the sourced parameter defaults and rejects unsafe threshold and work configurations", () => {
        const operation = registry.create("cannyEdgeDetector", {});
        expect(operation.parameters).toEqual({ gaussianSigma: 1.6, perceptual: false, thresholdLow: .02, thresholdHigh: .05, hysteresisPasses: 1 });
        expect(sample(operation.apply(verticalStep()), 2.5, 3.5)).toEqual({ r: 1, g: 1, b: 1, a: 1 });
        expect(() => registry.create("cannyEdgeDetector", { thresholdLow: .4, thresholdHigh: .2 })).toThrow(/threshold/i);
        expect(() => registry.create("cannyEdgeDetector", { gaussianSigma: 11 })).toThrow(/Gaussian/i);
        expect(() => registry.create("cannyEdgeDetector", { hysteresisPasses: 21 })).toThrow(/hysteresis/i);
        expect(() => registry.create("cannyEdgeDetector", { hysteresisPasses: 1.5 })).toThrow(/hysteresis/i);
        expect(() => registry.create("cannyEdgeDetector", { perceptual: null } as never)).toThrow(/perceptual/i);
        const oneMegapixel = largeVerticalStep(1024);
        const oneMegapixelOutput = operation.apply(oneMegapixel), configured = new IFXContext("linear-srgb", 2 * 1024 * 1024);
        expect(oneMegapixelOutput.extent).toEqual({ kind: "finite", rect: { x: 0, y: 0, width: 1024, height: 1024 } });
        expect(configured.maximumSamples).toBe(2 * 1024 * 1024);
        const oversized = IFXImage.constant(GFXColour.linearSRGB(0, 0, 0)).cropped({ x: 0, y: 0, width: 1025, height: 1025 });
        expect(() => operation.apply(oversized)).toThrow(/Canny.*pixel/i);
        expect(() => registry.create("cannyEdgeDetector", { gaussianSigma: 10 }).apply(oneMegapixel)).toThrow(/work/i);
    });

    it("smooths, suppresses nonmaxima to a thin vertical edge, and respects high thresholds", () => {
        const source = verticalStep();
        const detected = registry.create("cannyEdgeDetector", { gaussianSigma: 0, thresholdLow: .2, thresholdHigh: .5, hysteresisPasses: 0 }).apply(source);
        expect(detected.extent).toEqual({ kind: "finite", rect: { x: 0, y: 0, width: 7, height: 7 } });
        expect(sample(detected, 2.5, 3.5)).toEqual({ r: 0, g: 0, b: 0, a: 1 });
        expect(sample(detected, 3.5, 3.5)).toEqual({ r: 1, g: 1, b: 1, a: 1 });
        expect(sample(detected, 4.5, 3.5)).toEqual({ r: 0, g: 0, b: 0, a: 1 });
        const excluded = registry.create("cannyEdgeDetector", { gaussianSigma: 0, thresholdLow: .2, thresholdHigh: .8, hysteresisPasses: 0 }).apply(source);
        expect(sample(excluded, 3.5, 3.5)).toEqual({ r: 0, g: 0, b: 0, a: 1 });
        const smoothed = registry.create("cannyEdgeDetector", { gaussianSigma: 1, thresholdLow: .2, thresholdHigh: .3, hysteresisPasses: 0 }).apply(source);
        expect(sample(smoothed, 2.5, 3.5)).toEqual({ r: 1, g: 1, b: 1, a: 1 });
        expect(sample(smoothed, 3.5, 3.5)).toEqual({ r: 0, g: 0, b: 0, a: 1 });
        expect(sample(smoothed, 4.5, 3.5)).toEqual({ r: 0, g: 0, b: 0, a: 1 });
        const smoothedExcluded = registry.create("cannyEdgeDetector", { gaussianSigma: 1, thresholdLow: .2, thresholdHigh: .5, hysteresisPasses: 0 }).apply(source);
        expect(sample(smoothedExcluded, 2.5, 3.5)).toEqual({ r: 0, g: 0, b: 0, a: 1 });
        const shifted = registry.create("cannyEdgeDetector", { gaussianSigma: 0, thresholdLow: .2, thresholdHigh: .5, hysteresisPasses: 0 }).apply(verticalStep(7, 7, 0, 255, { x: -5, y: 2 }));
        expect(shifted.extent).toEqual({ kind: "finite", rect: { x: -5, y: 2, width: 7, height: 7 } });
        expect(sample(shifted, -1.5, 5.5)).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    });

    it("detects y-down diagonal edges and applies perceptual thresholding", () => {
        const diagonal = registry.create("cannyEdgeDetector", { gaussianSigma: 0, thresholdLow: .2, thresholdHigh: .45, hysteresisPasses: 0 }).apply(diagonalStep());
        expect(sample(diagonal, 3.5, 3.5)).toEqual({ r: 1, g: 1, b: 1, a: 1 });
        expect(sample(diagonal, 1.5, 3.5)).toEqual({ r: 0, g: 0, b: 0, a: 1 });

        const source = verticalStep(7, 7, 64, 128);
        const linear = registry.create("cannyEdgeDetector", { gaussianSigma: 0, perceptual: false, thresholdLow: .05, thresholdHigh: .16, hysteresisPasses: 0 }).apply(source);
        const perceptual = registry.create("cannyEdgeDetector", { gaussianSigma: 0, perceptual: true, thresholdLow: .05, thresholdHigh: .16, hysteresisPasses: 0 }).apply(source);
        expect(sample(linear, 3.5, 3.5).r).toBe(1);
        expect(sample(perceptual, 3.5, 3.5).r).toBe(0);
    });

    it("renders a 512-square input with an existing configured context sample budget", async () => {
        const output = registry.create("cannyEdgeDetector", { gaussianSigma: 0, thresholdLow: .2, thresholdHigh: .5, hysteresisPasses: 0 }).apply(largeVerticalStep());
        const rendered = await new IFXContext("linear-srgb", 600000).render(output);
        expect(rendered.image.width).toBe(512);
        expect(rendered.image.height).toBe(512);
        expect(rendered.image.pixel(256, 256)).toEqual({ r: 1, g: 1, b: 1, a: 1 });
        expect(rendered.info.sampleEvaluations).toBeLessThanOrEqual(600000);
    });

    it("preserves a fractional output extent while materializing an internal padded grid", async () => {
        const input = verticalStep().cropped({ x: .25, y: .25, width: 6, height: 6 });
        const output = registry.create("cannyEdgeDetector", { gaussianSigma: 0, thresholdLow: .2, thresholdHigh: .5, hysteresisPasses: 0 }).apply(input);
        expect(output.extent).toEqual({ kind: "finite", rect: { x: .25, y: .25, width: 6, height: 6 } });
        expect(new IFXFilterGraph(output).regionsOfInterest({ x: 3, y: 3, width: 1, height: 1 })[0]?.region).toEqual({ x: .25, y: .25, width: 6, height: 6 });
        expect(sample(output, .1, .5)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
        const direct = sample(output, 3.5, 3.5), full = await new IFXContext().render(output);
        const cropped = await new IFXContext().render(output, new IFXRenderDestination({ kind: "finite", rect: { x: 3, y: 3, width: 1, height: 1 } }));
        expect(cropped.image.pixel(0, 0)).toEqual(full.image.pixel(3, 3));
        expect(cropped.image.pixel(0, 0).r).toBe(direct.r);
    });

    it("promotes connected weak edges only through the requested hysteresis passes", () => {
        const values: number[] = [];
        for (let y = 0; y < 9; y++)
            for (let x = 0; x < 7; x++) {
                const level = y === 2 ? 255 : y >= 3 && y <= 6 ? 96 : 0;
                values.push(...pixel(x < 3 ? 0 : level));
            }
        const source = image(values, 7);
        const none = registry.create("cannyEdgeDetector", { gaussianSigma: 0, thresholdLow: .12, thresholdHigh: .42, hysteresisPasses: 0 }).apply(source);
        const promoted = registry.create("cannyEdgeDetector", { gaussianSigma: 0, thresholdLow: .12, thresholdHigh: .42, hysteresisPasses: 4 }).apply(source);
        expect(sample(none, 3.5, 5.5).r).toBe(0);
        expect(sample(promoted, 3.5, 5.5).r).toBe(1);
    });

    it("uses full-input ROI and a per-render cached result for connected edges, graph data, and cancellation", async () => {
        const values: number[] = [];
        for (let y = 0; y < 9; y++)
            for (let x = 0; x < 7; x++) {
                const level = y === 2 ? 255 : y >= 3 && y <= 6 ? 96 : 0;
                values.push(...pixel(x < 3 ? 0 : level));
            }
        const output = registry.create("cannyEdgeDetector", { gaussianSigma: 0, thresholdLow: .12, thresholdHigh: .42, hysteresisPasses: 4 }).apply(image(values, 7));
        expect(new IFXFilterGraph(output).regionsOfInterest({ x: 3, y: 5, width: 1, height: 1 })[0]?.region).toEqual({ x: 0, y: 0, width: 7, height: 9 });
        const sampler = new IFXSampler(output, "linear-srgb", 10000);
        sampler.sample({ x: 3.5, y: 5.5 }, "nearest");
        const firstCost = sampler.evaluations;
        sampler.sample({ x: 3.5, y: 4.5 }, "nearest");
        expect(sampler.evaluations - firstCost).toBeLessThanOrEqual(2);
        const shared = output.compositedOver(output), prepared = new IFXSampler(shared, "linear-srgb", 10000);
        await prepared.prepare();
        expect(prepared.evaluations).toBeLessThanOrEqual(64);
        const restored = IFXFilterGraph.deserialize(JSON.parse(JSON.stringify(new IFXFilterGraph(output).serialize())));
        expect(sample(restored.output, 3.5, 5.5)).toEqual(sample(output, 3.5, 5.5));

        const full = await new IFXContext().render(output);
        const croppedDestination = new IFXRenderDestination({ kind: "finite", rect: { x: 3, y: 5, width: 1, height: 1 } });
        const cropped = await new IFXContext().render(output, croppedDestination);
        expect(cropped.image.pixel(0, 0)).toEqual(full.image.pixel(3, 5));
        expect(cropped.image.pixel(0, 0).r).toBe(1);

        const preaborted = new AbortController();
        preaborted.abort();
        expect(() => new IFXContext().startTask(output, new IFXRenderDestination(output.extent), { signal: preaborted.signal })).toThrow(/abort/i);

        const data = new Uint8Array(128 * 128 * 4);
        for (let index = 3; index < data.length; index += 4)
            data[index] = 255;
        const cancellable = registry.create("cannyEdgeDetector", {}).apply(image(data, 128));
        const destination = new IFXRenderDestination(cancellable.extent);
        const task = new IFXContext().startTask(cancellable, destination);
        setTimeout(() => task.cancel(), 0);
        await expect(task.waitUntilCompleted()).rejects.toMatchObject({ name: "AbortError" });
        expect(destination.image).toBeNull();
    });
});
