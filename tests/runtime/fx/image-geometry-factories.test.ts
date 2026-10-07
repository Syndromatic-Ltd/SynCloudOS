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
import { IFXContext, IFXFilterGraph, IFXFilterRegistry, IFXImage, IFXRenderDestination, IFXSampler, type IFXFilterParameters } from "../../../src/FX/ImageFX/public";

const registry = new IFXFilterRegistry();

function pixels(data: readonly number[], width: number, origin: Readonly<{ x: number; y: number; }>): IFXImage {
    return IFXImage.fromPixels(new GFXImage({ width, height: data.length / 4 / width, alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array(data) }), origin);
}

const withExtentContract: IFXFilterParameters["perspectiveTransformWithExtent"] = {
    extent: { x: 10, y: -4, width: 2, height: 2 },
    topLeft: { x: 100, y: 50 },
    topRight: { x: 104, y: 50 },
    bottomRight: { x: 103, y: 54 },
    bottomLeft: { x: 100, y: 54 },
};
// @ts-expect-error The documented extent is required for Perspective Transform With Extent.
const missingExtentContract: IFXFilterParameters["perspectiveTransformWithExtent"] = {};
void withExtentContract;
void missingExtentContract;

describe("ImageFX Perspective Transform With Extent", () => {
    it("registers the distinct extent-constrained contract with captured four-coordinate defaults", () => {
        expect(registry.names()).toHaveLength(203);
        expect(registry.names()).toContain("perspectiveTransformWithExtent");
        expect(registry.create("perspectiveTransformWithExtent", { extent: { x: 4, y: 7, width: 8, height: 9 } }).parameters).toEqual({
            extent: { x: 4, y: 7, width: 8, height: 9 },
            topLeft: { x: 118, y: 484 },
            topRight: { x: 646, y: 507 },
            bottomRight: { x: 548, y: 140 },
            bottomLeft: { x: 155, y: 153 },
        });
        expect(() => registry.create("perspectiveTransformWithExtent", {} as never)).toThrow(/parameters|extent/i);
        expect(() => registry.create("perspectiveTransformWithExtent", { extent: { x: 0, y: 0, width: 0, height: 1 } })).toThrow(/extent/i);
        expect(() => registry.create("perspectiveTransformWithExtent", { extent: { x: 0, y: 0, width: 1, height: 1 }, extra: true } as never)).toThrow(/unknown/i);
    });

    it("maps exactly the supplied nonzero source extent into the target quadrilateral and supplies a linear-sampling ROI halo", () => {
        const outside = [255, 0, 255, 255];
        const data = Array.from({ length: 16 }, () => outside).flat();
        const set = (x: number, y: number, rgba: readonly number[]) => data.splice((y * 4 + x) * 4, 4, ...rgba);
        set(1, 1, [255, 0, 0, 255]);
        set(2, 1, [0, 255, 0, 255]);
        set(1, 2, [0, 0, 255, 255]);
        set(2, 2, [255, 255, 255, 255]);
        const source = pixels(data, 4, { x: 9, y: -5 });
        const output = registry.create("perspectiveTransformWithExtent", withExtentContract).apply(source);

        expect(output.extent).toEqual({ kind: "finite", rect: { x: 100, y: 50, width: 4, height: 4 } });
        // Independent inverse-projective vector: (101.5, 51.5) maps to (10 + 24 / 29, -4 + 18 / 29).
        const sample = new IFXSampler(output).sample({ x: 101.5, y: 51.5 });
        expect(sample.r).toBeCloseTo(1061 / 1682, 8);
        expect(sample.g).toBeCloseTo(19 / 58, 8);
        expect(sample.b).toBeCloseTo(7 / 58, 8);
        expect(sample.a).toBe(1);

        const identity = registry.create("perspectiveTransformWithExtent", {
            extent: { x: 10, y: -4, width: 2, height: 2 },
            topLeft: { x: 10, y: -4 },
            topRight: { x: 12, y: -4 },
            bottomRight: { x: 12, y: -2 },
            bottomLeft: { x: 10, y: -2 },
        }).apply(source);
        expect(new IFXFilterGraph(identity).regionsOfInterest({ x: 10.25, y: -3.75, width: .25, height: .25 })).toEqual([{ image: source, region: { x: 9.25, y: -4.75, width: 2.25, height: 2.25 } }]);
    });

    it("uses transparent samples outside the selected extent, rejects malformed near-singular quads, and round-trips its named graph node", () => {
        const edgeInput = pixels([255, 0, 0, 255, 0, 0, 255, 255], 2, { x: 10, y: -4 });
        const parameters = {
            extent: { x: 10, y: -4, width: 1, height: 1 },
            topLeft: { x: 20, y: 5 },
            topRight: { x: 21, y: 5 },
            bottomRight: { x: 21, y: 6 },
            bottomLeft: { x: 20, y: 6 },
        } as const;
        const edgeOutput = registry.create("perspectiveTransformWithExtent", parameters).apply(edgeInput);
        expect(new IFXSampler(edgeOutput).sample({ x: 20.75, y: 5.5 }, "nearest")).toEqual({ r: 1, g: 0, b: 0, a: 1 });
        const linear = new IFXSampler(edgeOutput).sample({ x: 20.75, y: 5.5 });
        expect(linear.r).toBeCloseTo(.75, 12);
        expect(linear.g).toBe(0);
        expect(linear.b).toBe(0);
        expect(linear.a).toBeCloseTo(.75, 12);

        expect(() => registry.create("perspectiveTransformWithExtent", {
            extent: { x: 0, y: 0, width: 1, height: 1 },
            topLeft: { x: 0, y: 0 }, topRight: { x: 1, y: 0 }, bottomRight: { x: 0, y: 1 }, bottomLeft: { x: 1, y: 1 },
        })).toThrow(/perspective quad/i);
        expect(() => registry.create("perspectiveTransformWithExtent", {
            extent: { x: 0, y: 0, width: 1, height: 1 },
            topLeft: { x: 0, y: 0 }, topRight: { x: 1, y: 0 }, bottomRight: { x: 1, y: 1e-12 }, bottomLeft: { x: 0, y: 1e-12 },
        })).toThrow(/perspective quad|horizon|singular/i);

        const serialized = JSON.parse(JSON.stringify(new IFXFilterGraph(edgeOutput).serialize()));
        expect(serialized.nodes.some((node: { kind: string; name?: string; }) => node.kind === "operation" && node.name === "perspectiveTransformWithExtent")).toBe(true);
        expect(new IFXSampler(IFXFilterGraph.deserialize(serialized).output).sample({ x: 20.75, y: 5.5 })).toEqual(linear);
    });

    it("checks cancellation between bounded output rows without publishing a partial transform", async () => {
        const output = registry.create("perspectiveTransformWithExtent", {
            extent: { x: 10, y: -4, width: 2, height: 128 },
            topLeft: { x: -20, y: 10 },
            topRight: { x: -18, y: 10 },
            bottomRight: { x: -18, y: 1034 },
            bottomLeft: { x: -20, y: 1034 },
        }).apply(IFXImage.constant(GFXColour.linearSRGB(1, 0, 0)).cropped({ x: 10, y: -4, width: 2, height: 128 }));
        const destination = new IFXRenderDestination(output.extent);
        const task = new IFXContext().startTask(output, destination);
        setTimeout(() => task.cancel(), 0);
        await expect(task.waitUntilCompleted()).rejects.toMatchObject({ name: "AbortError" });
        expect(destination.image).toBeNull();
    });
});
