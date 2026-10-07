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

import { describe, it, expect } from "vitest";
import { GFXImage, GFXColour } from "../../../src/FX/GraphicsFX/public";
import { IFXImage, IFXContext, IFXFilterRegistry, IFXFilterGraph, IFXSampler } from "../../../src/FX/ImageFX/public";
const registry = new IFXFilterRegistry();
const image = (values: number[], width: number) => IFXImage.fromPixels(new GFXImage({ width, height: values.length / 4 / width, alpha: "straight", colourSpace: "linear-srgb", data: new Uint8Array(values) }));
const pixels = async (i: IFXImage) => (await new IFXContext("linear-srgb").render(i)).image;
describe("ImageFX typed processing catalogue", () => {
    it("performs box convolution and morphology over actual neighboring pixels", async () => {
        const input = image([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255], 3);
        expect((await pixels(registry.create("boxBlur", { radius: 1 }).apply(input).cropped({ x: 0, y: 0, width: 3, height: 1 }))).pixel(1, 0).r).toBeCloseTo(156 / 255, 2);
        expect((await pixels(registry.create("morphologyMaximum", { radius: 1 }).apply(input).cropped({ x: 0, y: 0, width: 3, height: 1 }))).pixel(0, 0).r).toBe(1);
        const convolution = registry.create("convolution", { width: 3, height: 1, weights: [.25, .5, .25], bias: 0, rgbOnly: true }).apply(input);
        expect((await pixels(convolution)).pixel(1, 0).r).toBeCloseTo(188 / 255, 2);
    });
    it("performs exposure, invert and premultiplied blending", async () => {
        const input = image([64, 64, 64, 255], 1);
        expect((await pixels(registry.create("exposure", { ev: 1 }).apply(input))).pixel(0, 0).r).toBeCloseTo(188 / 255, 2);
        expect((await pixels(registry.create("invert", {}).apply(image([255, 0, 0, 255], 1)))).pixel(0, 0)).toEqual({ r: 0, g: 1, b: 1, a: 1 });
        expect((await pixels(registry.create("blend", { mode: "multiply" }).apply(input, input))).pixel(0, 0).r).toBeLessThan((await pixels(input)).pixel(0, 0).r);
    });
    it("serializes registered operations and rejects unknown or executable parameters", async () => {
        const output = registry.create("invert", {}).apply(image([255, 0, 0, 255], 1));
        const copy = IFXFilterGraph.deserialize(new IFXFilterGraph(output).serialize());
        expect((await pixels(copy.output)).pixel(0, 0).g).toBe(1);
        expect(() => registry.create("unknown" as never, {} as never)).toThrow();
        expect(() => registry.create("boxBlur", { radius: 1, run: () => {
            } } as never)).toThrow();
        expect(() => registry.create("boxBlur", { radius: Infinity })).toThrow();
        expect(() => registry.create("blend", { mode: "multiply" }).apply(output)).toThrow();
    });
});
const constant = (r: number, g = r, b = r, a = 1) => IFXImage.constant(GFXColour.linearSRGB(r, g, b, a)).cropped({ x: 0, y: 0, width: 3, height: 3 });
const sample = (output: IFXImage, x = 1.5, y = 1.5) => new IFXSampler(output).sample({ x, y });
describe("ImageFX first processing packet numerical fixtures", () => {
    it("normalizes Gaussian/disc/motion neighborhoods and computes median/minimum/gradient", () => {
        const impulse = image([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255], 3);
        expect(sample(registry.create("discBlur", { radius: 1 }).apply(impulse)).r).toBeCloseTo(.2, 8);
        expect(sample(registry.create("motionBlur", { radius: 1, angle: 0 }).apply(impulse)).r).toBeCloseTo(1 / 3, 8);
        const gaussian = sample(registry.create("gaussianBlur", { sigma: 1 }).apply(impulse));
        expect(gaussian.r).toBeCloseTo(.159241, 5);
        expect(gaussian.a).toBeCloseTo(.779905, 5);
        expect(sample(registry.create("median", {}).apply(impulse)).r).toBe(0);
        expect(sample(registry.create("morphologyMinimum", { radius: 1 }).apply(impulse)).r).toBe(0);
        expect(sample(registry.create("morphologyGradient", { radius: 1 }).apply(impulse)).r).toBe(1);
    });
    it("applies all declared adjustment/effect component equations", () => {
        expect(sample(registry.create("gamma", { power: 2 }).apply(constant(.5))).r).toBeCloseTo(.25, 8);
        const mono = sample(registry.create("colourControls", { saturation: 0, brightness: 0, contrast: 1 }).apply(constant(1, 0, 0)));
        expect(mono.r).toBeCloseTo(.2126, 8);
        expect(mono.g).toBe(mono.r);
        const matrix = [0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
        expect(sample(registry.create("colourMatrix", { matrix }).apply(constant(1, 0, 0))).g).toBe(1);
        expect(sample(registry.create("colourClamp", { minimum: [.2, .2, .2, 0], maximum: [.8, .8, .8, 1] }).apply(constant(1, 0, .5)))).toMatchObject({ r: .8, g: .2, b: .5 });
        expect(sample(registry.create("threshold", { threshold: .4 }).apply(constant(.5))).r).toBe(1);
        expect(sample(registry.create("posterize", { levels: 3 }).apply(constant(.3))).r).toBe(.5);
        const sepia = sample(registry.create("sepia", { intensity: 1 }).apply(constant(1, 0, 0)));
        expect(sepia.r).toBeCloseTo(.393, 8);
        expect(sepia.b).toBeCloseTo(.272, 8);
        expect(sample(registry.create("monochrome", { colour: [1, 0, 0, 1], intensity: 1 }).apply(constant(1)))).toMatchObject({ r: 1, g: 0, b: 0 });
        expect(sample(registry.create("falseColour", { colour0: [1, 0, 0, 1], colour1: [0, 0, 1, 1] }).apply(constant(.5)))).toEqual({ r: .5, g: 0, b: .5, a: 1 });
        const mask = sample(registry.create("maskToAlpha", {}).apply(constant(.5)));
        expect(mask.a).toBe(.5);
        expect(mask.r).toBe(.5);
        expect(sample(registry.create("maximumComponent", {}).apply(constant(.1, .8, .3))).r).toBe(.8);
        expect(sample(registry.create("minimumComponent", {}).apply(constant(.1, .8, .3))).g).toBe(.1);
    });
    it("evaluates declared blend equations including Porter-Duff alpha factors", () => {
        const source = constant(.75), backdrop = constant(.25);
        const expected = { normal: .75, multiply: .1875, screen: .8125, overlay: .375, darken: .25, lighten: .75, difference: .5, exclusion: .625, hardLight: .625, softLight: .375, colourDodge: 1, colourBurn: 0 };
        for (const [mode, value] of Object.entries(expected))
            expect(sample(registry.create("blend", { mode: mode as never }).apply(source, backdrop)).r).toBeCloseTo(value, 8);
        const a = constant(1, 0, 0, .5), b = constant(0, 0, 1, .25);
        expect(sample(registry.create("blend", { mode: "sourceIn" }).apply(a, b))).toEqual({ r: .125, g: 0, b: 0, a: .125 });
        expect(sample(registry.create("blend", { mode: "sourceOut" }).apply(a, b))).toEqual({ r: .375, g: 0, b: 0, a: .375 });
        expect(sample(registry.create("blend", { mode: "sourceAtop" }).apply(a, b))).toEqual({ r: .125, g: 0, b: .125, a: .25 });
        expect(sample(registry.create("blend", { mode: "addition" }).apply(a, b))).toEqual({ r: .5, g: 0, b: .25, a: .75 });
    });
    it("generates checker/stripe/noise/rounded-rectangle pixels with finite and infinite extents", () => {
        const checker = registry.create("checkerboard", { width: 1 }).apply();
        expect(checker.extent.kind).toBe("infinite");
        expect(sample(checker, .5, .5).r).toBe(1);
        expect(sample(checker, 1.5, .5).r).toBe(0);
        expect(sample(checker, -.5, .5).r).toBe(0);
        const stripes = registry.create("stripes", { width: 1 }).apply();
        expect(sample(stripes, .5, 2.5).r).toBe(1);
        expect(sample(stripes, 1.5, 2.5).r).toBe(0);
        const noise = registry.create("random", { seed: 42 }).apply();
        expect(sample(noise)).toEqual(sample(registry.create("random", { seed: 42 }).apply()));
        expect(sample(noise)).not.toEqual(sample(registry.create("random", { seed: 43 }).apply()));
        const rounded = registry.create("roundedRectangle", { rect: { x: 0, y: 0, width: 4, height: 4 }, radius: 2 }).apply();
        expect(sample(rounded, .1, .1).a).toBe(0);
        expect(sample(rounded, 2, 2).a).toBe(1);
    });
    it("samples linear, smooth, radial and Gaussian gradient equations", () => {
        const options = { point0: { x: 0, y: 0 }, point1: { x: 4, y: 0 }, colour0: [0, 0, 0, 1] as const, colour1: [1, 1, 1, 1] as const };
        expect(sample(registry.create("linearGradient", options).apply(), 1, 0).r).toBe(.25);
        expect(sample(registry.create("smoothLinearGradient", options).apply(), 1, 0).r).toBe(.15625);
        expect(sample(registry.create("radialGradient", { radius0: 0, radius1: 4, colour0: options.colour0, colour1: options.colour1 }).apply(), 2, 0).r).toBe(.5);
        expect(sample(registry.create("gaussianGradient", { radius: 1, colour0: options.colour0, colour1: options.colour1 }).apply(), 1, 0).r).toBeCloseTo(1 - Math.exp(-.5), 8);
    });
    it("warps distortion coordinates, tiles seams and samples geometry kernels", () => {
        const strip = image([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255], 3);
        const map = IFXImage.constant(GFXColour.linearSRGB(1, .5, 0));
        expect(sample(registry.create("displacement", { scale: 2 }).apply(strip, map), .5, .5).g).toBe(1);
        const square = image([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255], 3);
        expect(sample(registry.create("twirl", { center: { x: 1.5, y: 1.5 }, radius: 2, angle: 4 * Math.PI }).apply(square), 2.5, 1.5).r).toBeCloseTo(1, 8);
        expect(sample(registry.create("affineTile", {}).apply(strip), 3.5, .5).r).toBe(1);
        const seam = sample(registry.create("affineTile", {}).apply(strip), 0, .5);
        expect(seam.r).toBe(.5);
        expect(seam.b).toBe(.5);
        expect(seam.a).toBe(1);
        expect(sample(registry.create("affineClamp", {}).apply(strip), 100, .5).b).toBe(1);
        expect(sample(registry.create("straighten", { angle: Math.PI }).apply(strip), .5, .5).b).toBeCloseTo(1, 8);
        const scaled = registry.create("lanczosScale", { scale: 2 }).apply(strip);
        expect(scaled.extent).toEqual({ kind: "finite", rect: { x: 0, y: 0, width: 6, height: 2 } });
        expect(sample(registry.create("lanczosScale", { scale: 1 }).apply(strip), 1.5, .5).g).toBeCloseTo(1, 8);
    });
    it("computes area/channel reductions and normalized RGB histograms", () => {
        const strip = image([0, 0, 0, 255, 255, 255, 255, 255], 2), extent = { x: 0, y: 0, width: 2, height: 1 };
        expect(sample(registry.create("areaAverage", { extent }).apply(strip), .5, .5).r).toBe(.5);
        expect(sample(registry.create("areaMinimum", { extent }).apply(strip), .5, .5).r).toBe(0);
        expect(sample(registry.create("areaMaximum", { extent }).apply(strip), .5, .5).r).toBe(1);
        const histogram = registry.create("areaHistogram", { extent, bins: 2 }).apply(strip);
        expect(sample(histogram, .5, .5).r).toBe(.5);
        expect(sample(histogram, 1.5, .5).r).toBe(.5);
        expect(sample(registry.create("rowAverage", { extent }).apply(strip), .5, .5).r).toBe(.5);
        expect(sample(registry.create("columnAverage", { extent }).apply(strip), 1.5, .5).r).toBe(1);
    });
    it("sharpens edges, pixelates and blends through each explicit mask channel", () => {
        const strip = image([0, 0, 0, 255, 128, 128, 128, 255, 0, 0, 0, 255], 3);
        expect(sample(registry.create("unsharpMask", { sigma: 1, intensity: 1 }).apply(strip), 1.5, .5).r).toBeGreaterThan(128 / 255);
        expect(sample(registry.create("sharpenLuminance", { sharpness: 1 }).apply(strip), 1.5, .5).r).toBeGreaterThan(128 / 255);
        expect(sample(registry.create("edges", { intensity: 1 }).apply(strip), .5, .5).r).toBeGreaterThan(0);
        expect(sample(registry.create("pixellate", { scale: 2 }).apply(strip), .5, .5).r).toBe(128 / 255);
        const mask = constant(.25, .5, .75, .5);
        for (const [channel, amount] of [["alpha", .5], ["red", .125], ["blue", .375], ["luminance", (.2126 * .25 + .7152 * .5 + .0722 * .75) * .5]] as const) {
            expect(sample(registry.create("blendWithMask", { channel }).apply(constant(1, 0, 0), constant(0, 0, 1), mask)).r).toBeCloseTo(amount, 8);
        }
    });
    it("produces tone-dependent dot, line and circular screens and transition endpoints", () => {
        expect(sample(registry.create("dotScreen", { width: 2 }).apply(constant(0)), 1, 1).r).toBe(0);
        expect(sample(registry.create("dotScreen", { width: 2 }).apply(constant(1)), .5, .5).r).toBe(1);
        expect(sample(registry.create("lineScreen", { width: 2 }).apply(constant(.5)), .5, .5).r).toBe(0);
        expect(sample(registry.create("lineScreen", { width: 2 }).apply(constant(.5)), 1.5, .5).r).toBe(1);
        expect(sample(registry.create("circularScreen", { width: 2 }).apply(constant(.5)), .5, 0).r).toBe(0);
        expect(sample(registry.create("dissolve", { time: .25 }).apply(constant(1, 0, 0), constant(0, 0, 1)))).toEqual({ r: .75, g: 0, b: .25, a: 1 });
        const swipe = registry.create("swipe", { time: .5 }).apply(constant(1, 0, 0), constant(0, 0, 1));
        expect(sample(swipe, .5, .5).b).toBe(1);
        expect(sample(swipe, 2.5, .5).r).toBe(1);
    });
});
describe("ImageFX additional colour and registration boundaries", () => {
    it("applies polynomial, hue, transfer-curve and absolute difference processing", () => {
        expect(sample(registry.create("colourPolynomial", { red: [0, 0, 1, 0], green: [0, 1, 0, 0], blue: [0, 1, 0, 0] }).apply(constant(.5))).r).toBe(.25);
        const hue = sample(registry.create("hueAdjust", { angle: Math.PI }).apply(constant(1, 0, 0)));
        expect(hue.r).toBe(0);
        expect(hue.g).toBeGreaterThan(.5);
        expect(hue.b).toBeGreaterThan(.5);
        expect(sample(registry.create("linearToSRGB", {}).apply(constant(.5))).r).toBeCloseTo(.735356983, 8);
        expect(sample(registry.create("sRGBToLinear", {}).apply(constant(.5))).r).toBeCloseTo(.21404114, 8);
        expect(sample(registry.create("colourAbsoluteDifference", {}).apply(constant(.75), constant(.25))).r).toBe(.5);
    });
    it("rejects unknown serialized filter parameters without executing getters", () => {
        let calls = 0;
        const parameters = { get radius() {
                calls++;
                return 1;
            } };
        expect(() => registry.create("boxBlur", parameters)).toThrow();
        expect(calls).toBe(0);
        const output = registry.create("invert", {}).apply(constant(1));
        const graph = JSON.parse(JSON.stringify(new IFXFilterGraph(output).serialize()));
        graph.nodes[graph.nodes.length - 1].parameters = { run: "code" };
        expect(() => IFXFilterGraph.deserialize(graph)).toThrow();
    });
    it("handles opaque screen endpoints across the full cell", () => {
        expect(sample(registry.create("dotScreen", { width: 2 }).apply(constant(0)), .01, .01).r).toBe(0);
        expect(sample(registry.create("dotScreen", { width: 2 }).apply(constant(1)), 1, 1).r).toBe(1);
    });
});
