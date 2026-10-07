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
const image = (values: readonly number[], width: number) => IFXImage.fromPixels(new GFXImage({ width, height: values.length / 4 / width, alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array(values) }));
const sample = (value: IFXImage, x = .5, y = .5) => new IFXSampler(value).sample({ x, y });

function cube(dimension: number, mapper: (r: number, g: number, b: number) => readonly [number, number, number, number]): number[] {
    const values: number[] = [];
    for (let b = 0; b < dimension; b++)
        for (let g = 0; g < dimension; g++)
            for (let r = 0; r < dimension; r++)
                values.push(...mapper(r / (dimension - 1), g / (dimension - 1), b / (dimension - 1)));
    return values;
}

describe("ImageFX colour cube", () => {
    it("uses R-fast premultiplied cells and trilinear interpolation", () => {
        const input = image([64, 128, 191, 255], 1);
        const identity = cube(2, (r, g, b) => [r, g, b, 1]);
        const identityResult = sample(registry.create("colourCube", { cubeDimension: 2, cubeData: identity }).apply(input));
        expect(identityResult.r).toBeCloseTo(64 / 255, 8);
        expect(identityResult.g).toBeCloseTo(128 / 255, 8);
        expect(identityResult.b).toBeCloseTo(191 / 255, 8);
        expect(identityResult.a).toBe(1);

        const tinted = cube(2, (r, g, b) => [b * .5, r * .5, g * .5, .5]);
        const result = sample(registry.create("colourCube", { cubeDimension: 2, cubeData: tinted }).apply(input));
        expect(result.r).toBeCloseTo(191 / 255 * .5, 8);
        expect(result.g).toBeCloseTo(64 / 255 * .5, 8);
        expect(result.b).toBeCloseTo(128 / 255 * .5, 8);
        expect(result.a).toBe(.5);
    });

    it("uses direct cube RGBA rather than multiplying source alpha, and rejects unsafe lookup data", () => {
        const identity = cube(2, (r, g, b) => [r, g, b, 1]);
        expect(sample(registry.create("colourCube", { cubeDimension: 2, cubeData: identity }).apply(image([0, 0, 0, 0], 1)))).toEqual({ r: 0, g: 0, b: 0, a: 1 });
        expect(sample(registry.create("colourCube", { cubeDimension: 2, cubeData: identity }).apply(image([255, 0, 0, 64], 1)))).toEqual({ r: 1, g: 0, b: 0, a: 1 });
        const opaqueRed = cube(2, () => [.5, 0, 0, .5]);
        expect(sample(registry.create("colourCube", { cubeDimension: 2, cubeData: opaqueRed }).apply(image([255, 0, 0, 64], 1)))).toEqual({ r: .5, g: 0, b: 0, a: .5 });
        expect(() => registry.create("colourCube", { cubeDimension: 2, cubeData: opaqueRed.slice(1) })).toThrow(/cube data/i);
        const invalidPremultiplication = [...opaqueRed];
        invalidPremultiplication[0] = .75;
        expect(() => registry.create("colourCube", { cubeDimension: 2, cubeData: invalidPremultiplication })).toThrow(/premultiplied/i);
        expect(() => registry.create("colourCube", { cubeDimension: 65, cubeData: [] })).toThrow();
        expect(() => registry.create("colourCube", { cubeDimension: 2, cubeData: opaqueRed, extrapolate: true })).toThrow(/extrapolat/i);
    });

    it("round trips colour-cube data through a data-only graph", () => {
        const input = image([0, 255, 128, 255], 1);
        const output = registry.create("colourCube", { cubeDimension: 2, cubeData: cube(2, (r, g, b) => [b, r, g, 1]) }).apply(input);
        const serialized = JSON.parse(JSON.stringify(new IFXFilterGraph(output).serialize()));
        const restored = IFXFilterGraph.deserialize(serialized);
        expect(sample(restored.output)).toEqual({ r: 128 / 255, g: 0, b: 1, a: 1 });
    });
});

describe("ImageFX perspective transform", () => {
    it("retains sourced default corners while mapping named IFX y-down source corners", () => {
        const operation = registry.create("perspectiveTransform", {});
        expect(operation.parameters).toMatchObject({
            topLeft: { x: 118, y: 484 },
            topRight: { x: 646, y: 507 },
            bottomRight: { x: 548, y: 140 },
            bottomLeft: { x: 155, y: 153 },
        });

        const input = image([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255], 2);
        const identity = registry.create("perspectiveTransform", {
            topLeft: { x: 0, y: 0 },
            topRight: { x: 2, y: 0 },
            bottomRight: { x: 2, y: 2 },
            bottomLeft: { x: 0, y: 2 },
        }).apply(input);
        expect(identity.extent).toEqual({ kind: "finite", rect: { x: 0, y: 0, width: 2, height: 2 } });
        expect(sample(identity, .5, .5)).toEqual({ r: 1, g: 0, b: 0, a: 1 });
        expect(sample(identity, 1.5, 1.5)).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    });

    it("inverse-warps a target quadrilateral, propagates ROI, and supports an explicit source extent", () => {
        const input = image([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255], 2);
        const warped = registry.create("perspectiveTransform", {
            topLeft: { x: 0, y: 0 },
            topRight: { x: 3, y: 0 },
            bottomRight: { x: 2, y: 2 },
            bottomLeft: { x: 0, y: 2 },
        }).apply(input);
        expect(warped.extent).toEqual({ kind: "finite", rect: { x: 0, y: 0, width: 3, height: 2 } });
        const golden = sample(warped, 1.5, 1.5);
        expect(golden.r).toBeCloseTo(13 / 18, 8);
        expect(golden.g).toBeCloseTo(5 / 6, 8);
        expect(golden.b).toBeCloseTo(5 / 6, 8);
        expect(golden.a).toBe(1);
        expect(new IFXFilterGraph(warped).regionsOfInterest({ x: 1, y: 1, width: 1, height: 1 })[0]?.region).toEqual({ x: 0, y: 0, width: 2, height: 2 });

        const boundedInfinite = registry.create("perspectiveTransform", {
            topLeft: { x: 0, y: 0 },
            topRight: { x: 2, y: 0 },
            bottomRight: { x: 2, y: 2 },
            bottomLeft: { x: 0, y: 2 },
            extent: { x: 5, y: 7, width: 2, height: 2 },
        }).apply(IFXImage.constant(GFXColour.linearSRGB(.25, .5, .75, 1)));
        expect(boundedInfinite.extent).toEqual({ kind: "finite", rect: { x: 0, y: 0, width: 2, height: 2 } });
        expect(sample(boundedInfinite, .5, .5)).toEqual({ r: .25, g: .5, b: .75, a: 1 });
    });

    it("treats an explicit source extent as transparent beyond its linear sampling boundary", () => {
        const output = registry.create("perspectiveTransform", {
            topLeft: { x: 0, y: 0 },
            topRight: { x: 1, y: 0 },
            bottomRight: { x: 1, y: 1 },
            bottomLeft: { x: 0, y: 1 },
            extent: { x: 0, y: 0, width: 1, height: 1 },
        }).apply(image([255, 0, 0, 255, 0, 0, 255, 255], 2));
        expect(new IFXSampler(output).sample({ x: .75, y: .5 }, "nearest")).toEqual({ r: 1, g: 0, b: 0, a: 1 });
        const linear = sample(output, .75, .5);
        expect(linear.r).toBeCloseTo(.75, 8);
        expect(linear.g).toBe(0);
        expect(linear.b).toBe(0);
        expect(linear.a).toBeCloseTo(.75, 8);
        const restored = IFXFilterGraph.deserialize(JSON.parse(JSON.stringify(new IFXFilterGraph(output).serialize())));
        expect(sample(restored.output, .75, .5)).toEqual(linear);
    });

    it("rejects invalid quadrilaterals, preserves data-only graph semantics, and cancels without publication", async () => {
        expect(() => registry.create("perspectiveTransform", {
            topLeft: { x: 0, y: 0 },
            topRight: { x: 2, y: 0 },
            bottomRight: { x: 0, y: 2 },
            bottomLeft: { x: 2, y: 2 },
        })).toThrow(/Perspective quad/i);
        expect(() => registry.create("perspectiveTransform", { extent: { x: 0, y: 0, width: 0, height: 1 } })).toThrow(/extent/i);

        const input = image([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255], 2);
        const output = registry.create("perspectiveTransform", {
            topLeft: { x: 0, y: 0 },
            topRight: { x: 2, y: 0 },
            bottomRight: { x: 2, y: 2 },
            bottomLeft: { x: 0, y: 2 },
        }).apply(input);
        const copy = IFXFilterGraph.deserialize(JSON.parse(JSON.stringify(new IFXFilterGraph(output).serialize())));
        expect(sample(copy.output, 1.5, .5)).toEqual({ r: 0, g: 1, b: 0, a: 1 });

        const tall = registry.create("perspectiveTransform", {
            topLeft: { x: 0, y: 0 },
            topRight: { x: 2, y: 0 },
            bottomRight: { x: 2, y: 40 },
            bottomLeft: { x: 0, y: 40 },
        }).apply(IFXImage.constant(GFXColour.linearSRGB(1, 0, 0)).cropped({ x: 0, y: 0, width: 2, height: 40 }));
        const destination = new IFXRenderDestination(tall.extent);
        const task = new IFXContext().startTask(tall, destination);
        setTimeout(() => task.cancel(), 0);
        await expect(task.waitUntilCompleted()).rejects.toMatchObject({ name: "AbortError" });
        expect(destination.image).toBeNull();
    });
});
