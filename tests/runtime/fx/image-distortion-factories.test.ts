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
import { IFXFilterGraph, IFXFilterRegistry, IFXImage, IFXSampler, type IFXFilterParameters } from "../../../src/FX/ImageFX/public";

const registry = new IFXFilterRegistry();
const gridOrigin = Object.freeze({ x: -30, y: 40 });
const alpha = 192 / 255;

function coordinateGrid(origin: Readonly<{ x: number; y: number; }> = gridOrigin, width = 80, height = 80): IFXImage {
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 4;
            data[index] = x * 3;
            data[index + 1] = y * 3;
            data[index + 2] = 97;
            data[index + 3] = 192;
        }
    return IFXImage.fromPixels(new GFXImage({ width, height, alpha: "straight", colourSpace: "linear-srgb", data }), origin);
}
function straight(value: Readonly<{ r: number; g: number; b: number; a: number; }>) {
    return value.a === 0 ? { r: 0, g: 0, b: 0, a: 0 } : { r: value.r / value.a, g: value.g / value.a, b: value.b / value.a, a: value.a };
}
function sampled(image: IFXImage, position: Readonly<{ x: number; y: number; }>) {
    return straight(new IFXSampler(image).sample(position, "nearest"));
}
function expectGridPixel(value: Readonly<{ r: number; g: number; b: number; a: number; }>, x: number, y: number): void {
    expect(value.r).toBeCloseTo(x * 3 / 255, 8);
    expect(value.g).toBeCloseTo(y * 3 / 255, 8);
    expect(value.b).toBeCloseTo(97 / 255, 8);
    expect(value.a).toBeCloseTo(alpha, 8);
}
function contains(region: Readonly<{ x: number; y: number; width: number; height: number; }>, position: Readonly<{ x: number; y: number; }>): boolean {
    return position.x >= region.x && position.y >= region.y && position.x <= region.x + region.width && position.y <= region.y + region.height;
}

const bumpContract: IFXFilterParameters["bumpDistortion"] = { center: { x: 0, y: 60 }, radius: 12, scale: .5 };
const linearContract: IFXFilterParameters["bumpDistortionLinear"] = { center: { x: 0, y: 60 }, radius: 12, angle: 0, scale: .5 };
const splashContract: IFXFilterParameters["circleSplashDistortion"] = { center: { x: 0, y: 60 }, radius: 12 };
const holeContract: IFXFilterParameters["holeDistortion"] = { center: { x: 0, y: 60 }, radius: 12 };
const pinchContract: IFXFilterParameters["pinchDistortion"] = { center: { x: 0, y: 60 }, radius: 12, scale: .5 };
const vortexContract: IFXFilterParameters["vortexDistortion"] = { center: { x: 0, y: 60 }, radius: 12, angle: Math.PI / 2 };
// @ts-expect-error Radius is numeric, not an executable value.
const invalidRadiusContract: IFXFilterParameters["bumpDistortion"] = { radius: () => 12 };
void bumpContract;
void linearContract;
void splashContract;
void holeContract;
void pinchContract;
void vortexContract;
void invalidRadiusContract;

describe("ImageFX sourced distortion factories", () => {
    it("registers all six documented contracts and captured defaults, while rejecting invalid portable parameters", () => {
        expect(registry.names()).toHaveLength(203);
        expect(registry.names()).toEqual(expect.arrayContaining(["bumpDistortion", "bumpDistortionLinear", "circleSplashDistortion", "holeDistortion", "pinchDistortion", "vortexDistortion"]));
        expect(registry.create("bumpDistortion", {}).parameters).toEqual({ center: { x: 150, y: 150 }, radius: 300, scale: .5 });
        expect(registry.create("bumpDistortionLinear", {}).parameters).toEqual({ center: { x: 300, y: 300 }, radius: 300, angle: 0, scale: .5 });
        expect(registry.create("circleSplashDistortion", {}).parameters).toEqual({ center: { x: 150, y: 150 }, radius: 150 });
        expect(registry.create("holeDistortion", {}).parameters).toEqual({ center: { x: 150, y: 150 }, radius: 150 });
        expect(registry.create("pinchDistortion", {}).parameters).toEqual({ center: { x: 150, y: 150 }, radius: 300, scale: .5 });
        expect(registry.create("vortexDistortion", {}).parameters).toEqual({ center: { x: 150, y: 150 }, radius: 300, angle: 56.55 });
        expect(() => registry.create("bumpDistortion", { radius: -1 })).toThrow(/range/i);
        expect(() => registry.create("bumpDistortion", { radius: Infinity })).toThrow(/range/i);
        expect(() => registry.create("pinchDistortion", { scale: 2 })).toThrow(/range/i);
        expect(() => registry.create("vortexDistortion", { angle: 129 * Math.PI })).toThrow(/range/i);
        expect(() => registry.create("circleSplashDistortion", { center: { x: 0, y: 0 }, radius: 1, extra: true } as never)).toThrow(/unknown/i);
    });

    it("uses distinct bounded inverse coordinate maps over a nonzero-origin grid", () => {
        const input = coordinateGrid(), center = { x: 0, y: 60 };
        // Independent coordinate-grid goldens: each expected channel identifies the nearest source cell reached by the documented effect's portable inverse map.
        expectGridPixel(sampled(registry.create("bumpDistortion", { center, radius: 12, scale: 1 }).apply(input), { x: 6.5, y: 60.5 }), 35, 20);
        expectGridPixel(sampled(registry.create("bumpDistortionLinear", { center, radius: 12, angle: 0, scale: 1 }).apply(input), { x: 3.5, y: 66.5 }), 33, 27);
        expectGridPixel(sampled(registry.create("circleSplashDistortion", { center, radius: 12 }).apply(input), { x: 18.5, y: 60.5 }), 50, 20);
        expectGridPixel(sampled(registry.create("holeDistortion", { center, radius: 12 }).apply(input), { x: 6.5, y: 60.5 }), 33, 20);
        expectGridPixel(sampled(registry.create("pinchDistortion", { center, radius: 12, scale: 1 }).apply(input), { x: 6.5, y: 60.5 }), 37, 20);
        expectGridPixel(sampled(registry.create("vortexDistortion", { center, radius: 12, angle: Math.PI / 2 }).apply(input), { x: 6.5, y: 60.5 }), 35, 22);
    });

    it("makes explicit portable degeneracies identity and preserves transparent sampled edges", () => {
        const input = coordinateGrid(), position = { x: 6.5, y: 60.5 }, original = sampled(input, position);
        for (const [name, parameters] of [
            ["bumpDistortion", { center: { x: 0, y: 60 }, radius: 0, scale: 1 }],
            ["bumpDistortionLinear", { center: { x: 0, y: 60 }, radius: 0, angle: 1, scale: 1 }],
            ["circleSplashDistortion", { center: { x: 0, y: 60 }, radius: 0 }],
            ["holeDistortion", { center: { x: 0, y: 60 }, radius: 0 }],
            ["pinchDistortion", { center: { x: 0, y: 60 }, radius: 0, scale: 1 }],
            ["vortexDistortion", { center: { x: 0, y: 60 }, radius: 0, angle: Math.PI }],
        ] as const)
            expect(sampled(registry.create(name, parameters).apply(input), position)).toEqual(original);
        expect(sampled(registry.create("bumpDistortion", { center: { x: .5, y: .5 }, radius: 10, scale: -1 }).apply(coordinateGrid({ x: 0, y: 0 }, 2, 2)), { x: 1.5, y: .5 }).a).toBe(0);
    });

    it("declares ROIs that contain every mapped linear tap, including a splash request far beyond its circle across crop origins", () => {
        const input = coordinateGrid(), center = { x: 0, y: 60 };
        const cases = [
            ["bumpDistortion", { center, radius: 12, scale: 1 }, { x: 6.5, y: 60.5 }, { x: 5.1440664945, y: 60.3956974227 }],
            ["bumpDistortionLinear", { center, radius: 12, angle: 0, scale: 1 }, { x: 3.5, y: 66.5 }, { x: 3.5, y: 67.8654513889 }],
            ["circleSplashDistortion", { center, radius: 12 }, { x: 18.5, y: 60.5 }, { x: 20.8780415383, y: 60.5642713929 }],
            ["holeDistortion", { center, radius: 12 }, { x: 6.5, y: 60.5 }, { x: 3.5312346362, y: 60.2716334336 }],
            ["pinchDistortion", { center, radius: 12, scale: 1 }, { x: 6.5, y: 60.5 }, { x: 7.8559335055, y: 60.6043025773 }],
            ["vortexDistortion", { center, radius: 12, angle: Math.PI / 2 }, { x: 6.5, y: 60.5 }, { x: 5.9932312994, y: 62.5653807888 }],
        ] as const;
        for (const [name, parameters, output, tap] of cases) {
            const rois = new IFXFilterGraph(registry.create(name, parameters).apply(input)).regionsOfInterest({ x: output.x - .05, y: output.y - .05, width: .1, height: .1 });
            expect(rois).toHaveLength(1);
            expect(rois[0]!.image).toBe(input);
            for (const offset of [-.5, .5])
                for (const axis of ["x", "y"] as const)
                    expect(contains(rois[0]!.region, axis === "x" ? { x: tap.x + offset, y: tap.y } : { x: tap.x, y: tap.y + offset })).toBe(true);
        }
        const root = coordinateGrid(), cropped = root.cropped({ x: -10, y: 45, width: 40, height: 30 });
        const output = registry.create("circleSplashDistortion", { center: { x: 0, y: 60 }, radius: 10 }).apply(cropped);
        expect(output.extent).toEqual(cropped.extent);
        const rois = new IFXFilterGraph(output).regionsOfInterest({ x: 24.2, y: 60.2, width: .1, height: .1 });
        expect(rois).toHaveLength(1);
        expect(rois[0]!.image).toBe(root);
        expect(contains(rois[0]!.region, { x: 24.3, y: 60.3 })).toBe(true);
    });

    it("serializes all six normalized parameter records and keeps the restored coordinate result", () => {
        const input = coordinateGrid();
        const chained = registry.create("vortexDistortion", { center: { x: 0, y: 60 }, radius: 12, angle: Math.PI / 2 }).apply(registry.create("pinchDistortion", { center: { x: 0, y: 60 }, radius: 12, scale: 1 }).apply(registry.create("holeDistortion", { center: { x: 0, y: 60 }, radius: 12 }).apply(registry.create("circleSplashDistortion", { center: { x: 0, y: 60 }, radius: 12 }).apply(registry.create("bumpDistortionLinear", { center: { x: 0, y: 60 }, radius: 12, angle: 0, scale: 1 }).apply(registry.create("bumpDistortion", { center: { x: 0, y: 60 }, radius: 12, scale: 1 }).apply(input))))));
        const serialized = JSON.parse(JSON.stringify(new IFXFilterGraph(chained).serialize()));
        expect(serialized.nodes.filter((node: { kind: string; }) => node.kind === "operation").map((node: { name: string; }) => node.name)).toEqual(expect.arrayContaining(["bumpDistortion", "bumpDistortionLinear", "circleSplashDistortion", "holeDistortion", "pinchDistortion", "vortexDistortion"]));
        expect(sampled(IFXFilterGraph.deserialize(serialized).output, { x: 6.5, y: 60.5 })).toEqual(sampled(chained, { x: 6.5, y: 60.5 }));
    });
});
