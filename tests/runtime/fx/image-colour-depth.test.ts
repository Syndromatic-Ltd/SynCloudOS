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
const image = (values: readonly number[], width: number, origin?: { x: number; y: number }) => IFXImage.fromPixels(new GFXImage({ width, height: values.length / (width * 4), alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array(values) }), origin);
const sample = (value: IFXImage, x = .5, y = .5) => new IFXSampler(value, "linear-srgb", 200_000).sample({ x, y }, "nearest");
const straight = (value: Readonly<{ r: number; g: number; b: number; a: number }>) => value.a === 0 ? { r: 0, g: 0, b: 0, a: 0 } : { r: value.r / value.a, g: value.g / value.a, b: value.b / value.a, a: value.a };
const identityCross = Object.freeze({
  redCoefficients: Object.freeze([0, 1, 0, 0, 0, 0, 0, 0, 0, 0]),
  greenCoefficients: Object.freeze([0, 0, 1, 0, 0, 0, 0, 0, 0, 0]),
  blueCoefficients: Object.freeze([0, 0, 0, 1, 0, 0, 0, 0, 0, 0]),
}) satisfies IFXFilterParameters["colorCrossPolynomial"];

function cube(dimension: number, mapper: (r: number, g: number, b: number) => readonly [number, number, number, number]): number[] {
  const result: number[] = [];
  for (let b = 0; b < dimension; b++) for (let g = 0; g < dimension; g++) for (let r = 0; r < dimension; r++)
    result.push(...mapper(r / (dimension - 1), g / (dimension - 1), b / (dimension - 1)));
  return result;
}

describe("ImageFX FX-13 colour depth", () => {
  it("registers every retained colour/LUT/palette/photo source key without guessed required defaults", () => {
    const names = [
      "colorCrossPolynomial", "colorCubeWithColorSpace", "colorCubesMixedWithMask", "colorCurves", "documentEnhancer",
      "paletteCentroid", "palettize", "photoEffectChrome", "photoEffectFade", "photoEffectInstant", "photoEffectMono",
      "photoEffectNoir", "photoEffectProcess", "photoEffectTonal", "photoEffectTransfer", "thermal", "vignette", "vignetteEffect",
      "xRay", "hueSaturationValueGradient",
    ] as const;
        expect(registry.names()).toHaveLength(203);
    expect(registry.names()).toEqual(expect.arrayContaining(names));
    expect(() => registry.create("colorCrossPolynomial", {} as never)).toThrow(/coefficient/i);
    expect(() => registry.create("colorCubeWithColorSpace", { cubeData: [] } as never)).toThrow();
    expect(() => registry.create("colorCubesMixedWithMask", {} as never)).toThrow();
    expect(() => registry.create("colorCurves", {} as never)).toThrow();
    expect(() => registry.create("documentEnhancer", {} as never)).toThrow(/amount/i);
    expect(() => registry.create("palettize", {} as never)).toThrow(/perceptual/i);
    expect(() => registry.create("photoEffectChrome", {} as never)).toThrow(/extrapolate/i);
    expect(() => registry.create("vignette", {} as never)).toThrow(/intensity|radius/i);
    expect(() => registry.create("vignetteEffect", {} as never)).toThrow(/center|falloff|intensity|radius/i);
    expect(() => registry.create("hueSaturationValueGradient", {} as never)).toThrow();
  });

  it("evaluates the ten-term cross polynomial and profile-aware curve/cube operations with explicit alpha policy", () => {
    const source = image([64, 128, 192, 128], 1);
    const identity = registry.create("colorCrossPolynomial", identityCross).apply(source);
    expect(straight(sample(identity))).toEqual(expect.objectContaining({ r: 64 / 255, g: 128 / 255, b: 192 / 255, a: 128 / 255 }));

    const cross = registry.create("colorCrossPolynomial", {
      ...identityCross,
      redCoefficients: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    }).apply(source);
    expect(straight(sample(cross)).r).toBeCloseTo((128 / 255) * (192 / 255), 7);
    expect(sample(registry.create("colorCrossPolynomial", identityCross).apply(image([255, 255, 255, 0], 1))).a).toBe(0);

    const identityCube = cube(2, (r, g, b) => [r, g, b, 1]);
    const swappedCube = cube(2, (r, g, b) => [b, g, r, 1]);
    for (const colorSpace of ["linear-srgb", "srgb", "display-p3"] as const) {
      const transformed = registry.create("colorCubeWithColorSpace", { cubeDimension: 2, cubeData: identityCube, colorSpace, extrapolate: false }).apply(source);
      const actual = straight(sample(transformed));
      expect(actual.r).toBeCloseTo(64 / 255, 4);
      expect(actual.g).toBeCloseTo(128 / 255, 4);
      expect(actual.b).toBeCloseTo(192 / 255, 4);
    }
    expect(straight(sample(registry.create("colorCubeWithColorSpace", { cubeDimension: 2, cubeData: swappedCube, colorSpace: "linear-srgb", extrapolate: false }).apply(source))).r).toBeCloseTo(192 / 255, 7);

    const curve = registry.create("colorCurves", { colorSpace: "linear-srgb", curvesDomain: [0, 1], curvesData: [0, 0, 0, 1, .5, .25, 1, 1, 1] }).apply(source);
    expect(straight(sample(curve)).g).toBeCloseTo(128 / 255, 7);
    expect(straight(sample(curve)).b).toBeLessThan(192 / 255);
  });

  it("mixes two profile-aware cubes from a mask and round-trips the graph as plain data", () => {
    const source = image([64, 128, 192, 255, 64, 128, 192, 255], 2);
    const mask = image([0, 0, 0, 255, 255, 255, 255, 255], 2);
    const identityCube = cube(2, (r, g, b) => [r, g, b, 1]);
    const swappedCube = cube(2, (r, g, b) => [b, g, r, 1]);
    const output = registry.create("colorCubesMixedWithMask", { cubeDimension: 2, cube0Data: identityCube, cube1Data: swappedCube, colorSpace: "linear-srgb", extrapolate: false }).apply(source, mask);
    expect(straight(sample(output, .5, .5)).r).toBeCloseTo(64 / 255, 7);
    expect(straight(sample(output, 1.5, .5)).r).toBeCloseTo(192 / 255, 7);
    const serialized = JSON.parse(JSON.stringify(new IFXFilterGraph(output).serialize()));
    expect(serialized.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "operation", name: "colorCubesMixedWithMask", parameters: expect.objectContaining({ colorSpace: "linear-srgb", extrapolate: false }) })]));
    expect(straight(sample(IFXFilterGraph.deserialize(serialized).output, 1.5, .5)).r).toBeCloseTo(192 / 255, 7);
  });

  it("uses deterministic palette ties and bounded centroid refinement", () => {
    const palette = image([255, 0, 0, 255, 0, 0, 255, 255], 2, { x: 8, y: 9 });
    const tie = image([128, 0, 128, 255], 1);
    expect(straight(sample(registry.create("palettize", { perceptual: false }).apply(tie, palette)))).toEqual({ r: 1, g: 0, b: 0, a: 1 });

    const clustered = image([255, 0, 0, 255, 192, 0, 0, 255, 0, 0, 255, 255, 0, 0, 192, 255], 4);
    const centroids = registry.create("paletteCentroid", { perceptual: false }).apply(clustered, palette);
    expect(centroids.extent).toEqual(palette.extent);
    const red = straight(sample(centroids, 8.5, 9.5)), blue = straight(sample(centroids, 9.5, 9.5));
    expect(red.r).toBeCloseTo((1 + 192 / 255) / 2, 7);
    expect(red.g).toBe(0);
    expect(blue.b).toBeCloseTo((1 + 192 / 255) / 2, 7);
    expect(() => registry.create("palettize", { perceptual: false }).apply(tie, image(new Array(257 * 4).fill(255), 257))).toThrow(/palette|256/i);
  });

  it("implements named portable photo mappings plus thermal/x-ray without claiming native preset identity", () => {
    const chart = image([32, 96, 224, 128], 1);
    const effects = ["photoEffectChrome", "photoEffectFade", "photoEffectInstant", "photoEffectMono", "photoEffectNoir", "photoEffectProcess", "photoEffectTonal", "photoEffectTransfer"] as const;
    const outputs = effects.map(name => straight(sample(registry.create(name, { extrapolate: false }).apply(chart))));
    for (const output of outputs) {
      expect(output.a).toBeCloseTo(128 / 255, 8);
      expect([output.r, output.g, output.b]).not.toEqual([32 / 255, 96 / 255, 224 / 255]);
    }
    expect(new Set(outputs.map(output => [output.r, output.g, output.b].map(value => value.toFixed(5)).join(","))).size).toBe(8);
    const thermal = straight(sample(registry.create("thermal", {}).apply(chart)));
    const xRay = straight(sample(registry.create("xRay", {}).apply(chart)));
    expect(thermal.r).not.toBeCloseTo(thermal.b, 3);
    expect(xRay.r).toBeLessThan(xRay.g);
    expect(xRay.g).toBeLessThanOrEqual(xRay.b);
  });

  it("applies explicit document enhancement/vignette geometry and creates a bounded HSV gradient", () => {
    const flat = image(new Array(5 * 5).fill(0).flatMap(() => [128, 128, 128, 255]), 5);
    const enhanced = registry.create("documentEnhancer", { amount: 1 }).apply(image([64, 64, 64, 255], 1));
    expect(straight(sample(enhanced)).r).not.toBeCloseTo(64 / 255, 6);

    const vignette = registry.create("vignette", { intensity: 1, radius: 2 }).apply(flat);
    expect(straight(sample(vignette, 2.5, 2.5)).r).toBeGreaterThan(straight(sample(vignette, .5, .5)).r);
    const effect = registry.create("vignetteEffect", { center: { x: 2.5, y: 2.5 }, radius: 1, intensity: 1, falloff: .5 }).apply(flat);
    expect(straight(sample(effect, 2.5, 2.5)).r).toBeGreaterThan(straight(sample(effect, .5, .5)).r);

    const gradient = registry.create("hueSaturationValueGradient", { colorSpace: "linear-srgb", dither: 0, radius: 4, softness: 0, value: 1 }).apply();
    expect(gradient.extent).toEqual({ kind: "finite", rect: { x: -4, y: -4, width: 8, height: 8 } });
    const east = straight(sample(gradient, 2, 0)), north = straight(sample(gradient, 0, -2));
    expect([east.r, east.g, east.b]).not.toEqual([north.r, north.g, north.b]);
  });
});
