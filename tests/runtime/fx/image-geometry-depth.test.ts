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
import { GFXFloatImage, GFXImage } from "../../../src/FX/GraphicsFX/public";
import { IFXFilterGraph, IFXFilterRegistry, IFXImage, IFXSampler } from "../../../src/FX/ImageFX/public";

const registry = new IFXFilterRegistry();
const packetNames = [
  "circularWrap", "droste", "glassDistortion", "glassLozenge", "lightTunnel",
  "ninePartStretched", "ninePartTiled", "stretchCrop", "torusLensDistortion",
  "bicubicScaleTransform", "edgePreserveUpsample",
  "keystoneCorrectionCombined", "keystoneCorrectionHorizontal", "keystoneCorrectionVertical",
  "perspectiveCorrection", "perspectiveRotate", "depthToDisparity", "disparityToDepth",
] as const;

function byteImage(width: number, height: number, pixel: (x: number, y: number) => readonly [number, number, number, number]): IFXImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return IFXImage.fromPixels(new GFXImage({ width, height, alpha: "straight", colourSpace: "linear-srgb", data }));
}

function sample(image: IFXImage, x: number, y: number) {
  return new IFXSampler(image).sample({ x, y }, "nearest");
}

describe("ImageFX geometry depth packet", () => {
  it("registers every retained geometry key and requires uncaptured parameters instead of inventing Apple defaults", () => {
        expect(registry.names()).toHaveLength(203);
    expect(registry.names()).toEqual(expect.arrayContaining(packetNames));
    expect(() => registry.create("bicubicScaleTransform", {})).toThrow(/parameter|required|numeric/i);
    expect(() => registry.create("perspectiveCorrection", {})).toThrow(/parameter|required|point|crop/i);
    expect(() => registry.create("depthToDisparity", {})).toThrow(/parameter|required|numeric|calibration/i);
    expect(() => registry.create("ninePartTiled", { breakpoint0: { x: 1, y: 1 }, breakpoint1: { x: 2, y: 2 }, growAmount: { x: 1, y: 1 } } as never)).toThrow(/flip|parameter|required/i);
  });

  it("implements bounded bicubic scaling and edge-aware two-image upsampling", () => {
    const constant = byteImage(4, 4, () => [128, 64, 32, 255]);
    const bicubic = registry.create("bicubicScaleTransform", { scale: 2, aspectRatio: 1, parameterB: 1 / 3, parameterC: 1 / 3 }).apply(constant);
    expect(bicubic.extent).toEqual({ kind: "finite", rect: { x: 0, y: 0, width: 8, height: 8 } });
    const middle = sample(bicubic, 4.5, 4.5);
    expect(middle.r).toBeCloseTo(128 / 255, 5);
    expect(middle.g).toBeCloseTo(64 / 255, 5);

    const guide = byteImage(4, 1, x => x < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255]);
    const small = byteImage(2, 1, x => x === 0 ? [255, 0, 0, 255] : [0, 0, 255, 255]);
    const upsampled = registry.create("edgePreserveUpsample", { spatialSigma: 1, lumaSigma: 0.08 }).apply(guide, small);
    expect(upsampled.extent).toEqual(guide.extent);
    const left = sample(upsampled, 1.5, .5), right = sample(upsampled, 2.5, .5);
    expect(left.r).toBeGreaterThan(left.b);
    expect(right.b).toBeGreaterThan(right.r);
  });

  it("rectifies four-corner geometry, distinguishes crop policy, and keeps zero-angle perspective rotation exact", () => {
    const source = byteImage(4, 4, (x, y) => [x * 60, y * 60, 40, 255]);
    const identityCorners = { topLeft: { x: 0, y: 0 }, topRight: { x: 4, y: 0 }, bottomRight: { x: 4, y: 4 }, bottomLeft: { x: 0, y: 4 } } as const;
    const corrected = registry.create("perspectiveCorrection", { ...identityCorners, crop: false }).apply(source);
    expect(corrected.extent).toEqual(source.extent);
    expect(sample(corrected, 2.5, 2.5)).toEqual(sample(source, 2.5, 2.5));

    const skewed = { topLeft: { x: .5, y: 0 }, topRight: { x: 3.5, y: .5 }, bottomRight: { x: 4, y: 4 }, bottomLeft: { x: 0, y: 4 } } as const;
    const cropped = registry.create("perspectiveCorrection", { ...skewed, crop: true }).apply(source);
    const uncropped = registry.create("perspectiveCorrection", { ...skewed, crop: false }).apply(source);
    expect(cropped.extent.kind).toBe("finite");
    expect(uncropped.extent.kind).toBe("finite");
    if (cropped.extent.kind === "finite" && uncropped.extent.kind === "finite") {
      expect(cropped.extent.rect.width).toBeLessThanOrEqual(uncropped.extent.rect.width);
      expect(cropped.extent.rect.height).toBeLessThanOrEqual(uncropped.extent.rect.height);
    }

    for (const name of ["keystoneCorrectionCombined", "keystoneCorrectionHorizontal", "keystoneCorrectionVertical"] as const) {
      const output = registry.create(name, { ...identityCorners, focalLength: 100 }).apply(source);
      expect(sample(output, 2.5, 2.5)).toEqual(sample(source, 2.5, 2.5));
    }
    const rotated = registry.create("perspectiveRotate", { focalLength: 100, pitch: 0, roll: 0, yaw: 0 }).apply(source);
    expect(rotated.extent).toEqual(source.extent);
    expect(sample(rotated, 2.5, 2.5)).toEqual(sample(source, 2.5, 2.5));
    expect(() => registry.create("perspectiveCorrection", {
      topLeft: { x: 0, y: 0 }, topRight: { x: 4, y: 0 }, bottomRight: { x: 0, y: 4 }, bottomLeft: { x: 4, y: 4 }, crop: false,
    })).toThrow(/quad|perspective|degenerate/i);
  });

  it("implements nine-part growth and stretch-crop with explicit finite output geometry", () => {
    const source = byteImage(3, 3, (x, y) => [x * 100, y * 100, 20, 255]);
    const stretched = registry.create("ninePartStretched", { breakpoint0: { x: 1, y: 1 }, breakpoint1: { x: 2, y: 2 }, growAmount: { x: 2, y: 2 } }).apply(source);
    const tiled = registry.create("ninePartTiled", { breakpoint0: { x: 1, y: 1 }, breakpoint1: { x: 2, y: 2 }, growAmount: { x: 2, y: 2 }, flipYTiles: true }).apply(source);
    expect(stretched.extent).toEqual({ kind: "finite", rect: { x: 0, y: 0, width: 5, height: 5 } });
    expect(tiled.extent).toEqual(stretched.extent);
    expect(sample(stretched, .5, .5)).toEqual(sample(source, .5, .5));
    expect(sample(tiled, 4.5, 4.5)).toEqual(sample(source, 2.5, 2.5));

    const resized = registry.create("stretchCrop", { size: { x: 6, y: 4 }, cropAmount: 0.5, centerStretchAmount: 0.75 }).apply(source);
    expect(resized.extent).toEqual({ kind: "finite", rect: { x: 0, y: 0, width: 6, height: 4 } });
    expect(sample(resized, 3.5, 2.5).a).toBeGreaterThan(0);
  });

  it("gives the remaining distortion keys bounded nonidentity coordinate maps and durable graph records", () => {
    const source = byteImage(8, 8, (x, y) => [x * 24, y * 24, 80, 255]);
    const texture = byteImage(8, 8, (x, y) => [x < 4 ? 255 : 0, y < 4 ? 255 : 0, 128, 255]);
    const cases = [
      ["circularWrap", { center: { x: 4, y: 4 }, radius: 4, angle: Math.PI }, [source]],
      ["droste", { insetPoint0: { x: 2, y: 2 }, insetPoint1: { x: 6, y: 6 }, periodicity: 2, rotation: .2, strands: 1, zoom: 1.2 }, [source]],
      ["glassDistortion", { center: { x: 4, y: 4 }, scale: 2 }, [source, texture]],
      ["glassLozenge", { point0: { x: 2, y: 4 }, point1: { x: 6, y: 4 }, radius: 2, refraction: 1.5 }, [source]],
      ["lightTunnel", { center: { x: 4, y: 4 }, radius: 2, rotation: .5 }, [source]],
      ["torusLensDistortion", { center: { x: 4, y: 4 }, radius: 3, width: 2, refraction: 1.5 }, [source]],
    ] as const;
    const operationNames: string[] = [];
    for (const [name, parameters, inputs] of cases) {
      const output = registry.create(name, parameters as never).apply(...inputs);
      expect(output.extent).toEqual(source.extent);
      const value = sample(output, 5.5, 4.5);
      expect([value.r, value.g, value.b, value.a].every(Number.isFinite)).toBe(true);
      const serialized = JSON.parse(JSON.stringify(new IFXFilterGraph(output).serialize()));
      operationNames.push(...serialized.nodes.filter((node: { kind: string }) => node.kind === "operation").map((node: { name: string }) => node.name));
    }
    for (const name of cases.map(entry => entry[0])) expect(operationNames).toContain(name);
    expect(sample(registry.create("circularWrap", cases[0][1]).apply(source), 5.5, 4.5)).not.toEqual(sample(source, 5.5, 4.5));
  });

  it("converts calibrated depth and disparity reciprocally and defines zero as an invalid zero sample", () => {
    const pixels = new GFXFloatImage({ width: 1, height: 1, sampleFormat: "float32", alpha: "straight", colourSpace: "linear-srgb", data: new Float32Array([0.25, 0.25, 0.25, 1]) });
    const depth = IFXImage.fromPixels(pixels);
    const calibration = { focalLength: 4, baseline: .25, depthScale: 4, disparityScale: 4 } as const;
    const disparity = registry.create("depthToDisparity", calibration).apply(depth);
    expect(sample(disparity, .5, .5).r).toBeCloseTo(.25, 6);
    const restored = registry.create("disparityToDepth", calibration).apply(disparity);
    expect(sample(restored, .5, .5).r).toBeCloseTo(.25, 6);

    const zero = IFXImage.fromPixels(new GFXFloatImage({ width: 1, height: 1, sampleFormat: "float32", alpha: "straight", colourSpace: "linear-srgb", data: new Float32Array([0, 0, 0, 1]) }));
    expect(sample(registry.create("disparityToDepth", calibration).apply(zero), .5, .5)).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(() => registry.create("depthToDisparity", { ...calibration, baseline: 0 })).toThrow(/range|calibration/i);
  });
});
