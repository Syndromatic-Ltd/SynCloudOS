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

import { d50ReferenceWhite, d50XYZToLinearSRGB, linearSRGBToD50XYZ } from "../../GraphicsFX/GFXColourProfile";
import { namedColourTransform } from "../../GraphicsFX/namedColourTransform";
import type { GFXColourSpace } from "../../GraphicsFX/colourTypes";
import type { GFXPoint, GFXRect } from "../../GraphicsFX/GFXGeometry";
import { finiteExtent, unionExtent } from "../extent";
import type { IFXImage } from "../IFXImage";
import type { ProcessingAccess, ProcessingPreparationAccess } from "../processing";
import { fields, finiteInput, number, integer, tuple, colour, colourSample, point, processor, straight, premult, luma, clamp, mix, type Definition } from "./common";
const white = [1, 1, 1, 1], black = [0, 0, 0, 1];
const maximumCubeBytes = 4 * 1024 * 1024;
const maximumCubeDimension = 64;
export const colours: Record<string, Definition> = {};
const portableColourSpaces = Object.freeze(["linear-srgb", "srgb", "display-p3", "grayscale"] as const);

function requiredBoolean(value: unknown, name: string): boolean {
    if (typeof value !== "boolean")
        throw new TypeError(`${name} must be boolean.`);
    return value;
}

function colourSpace(value: unknown): GFXColourSpace {
    if (typeof value !== "string" || !portableColourSpaces.includes(value as typeof portableColourSpaces[number]))
        throw new TypeError("A supported colorSpace is required.");
    return value as GFXColourSpace;
}

function numericArray(value: unknown, name: string, minimumLength: number, maximumLength: number, multiple = 1): readonly number[] {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < minimumLength || value.length > maximumLength || value.length % multiple !== 0)
        throw new TypeError(`${name} has an invalid length.`);
    const result: number[] = [];
    for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index)), component = descriptor && "value" in descriptor ? descriptor.value : undefined;
        if (typeof component !== "number" || !Number.isFinite(component) || Math.abs(component) > 16)
            throw new RangeError(`${name} must contain bounded finite numeric data.`);
        result.push(component);
    }
    return Object.freeze(result);
}
const options: Record<string, readonly string[]> = { colourPolynomial: ["red", "green", "blue", "alpha"], hueAdjust: ["angle"], linearToSRGB: [], sRGBToLinear: [], exposure: ["ev"], gamma: ["power"], colourControls: ["saturation", "brightness", "contrast"], colourMatrix: ["matrix", "bias"], colourClamp: ["minimum", "maximum"], threshold: ["threshold"], invert: [], sepia: ["intensity"], posterize: ["levels"], monochrome: ["colour", "intensity"], falseColour: ["colour0", "colour1"], maskToAlpha: [], maximumComponent: [], minimumComponent: [] };
for (const name of Object.keys(options)) {
    colours[name] = { category: ["exposure", "gamma", "colourControls", "colourMatrix", "colourClamp", "threshold", "colourPolynomial", "hueAdjust", "linearToSRGB", "sRGBToLinear"].includes(name) ? "colourAdjustment" : "colourEffect", inputs: 1, normalise: value => {
            const p = fields(value, options[name]!);
            switch (name) {
                case "colourPolynomial": return { red: tuple(p.red, [], 4), green: tuple(p.green, [], 4), blue: tuple(p.blue, [], 4), alpha: tuple(p.alpha, [0, 1, 0, 0], 4) };
                case "hueAdjust": return { angle: number(p.angle, 0, -Math.PI * 2, Math.PI * 2) };
                case "exposure": return { ev: number(p.ev, 0, -10, 10) };
                case "gamma": return { power: number(p.power, 1, .01, 10) };
                case "colourControls": return { saturation: number(p.saturation, 1, 0, 4), brightness: number(p.brightness, 0, -1, 1), contrast: number(p.contrast, 1, 0, 4) };
                case "colourMatrix": return { matrix: tuple(p.matrix, [], 16), bias: tuple(p.bias, [0, 0, 0, 0], 4) };
                case "colourClamp": {
                    const minimum = colour(p.minimum, [0, 0, 0, 0]), maximum = colour(p.maximum, [1, 1, 1, 1]);
                    if (minimum.some((v, i) => v > maximum[i]!))
                        throw new RangeError("Colour clamp minimum exceeds maximum.");
                    return { minimum, maximum };
                }
                case "threshold": return { threshold: number(p.threshold, .5, 0, 1) };
                case "sepia": return { intensity: number(p.intensity, 1, 0, 1) };
                case "posterize": return { levels: integer(p.levels, 6, 2, 256) };
                case "monochrome": return { colour: colour(p.colour, [.6, .45, .3, 1]), intensity: number(p.intensity, 1, 0, 1) };
                case "falseColour": return { colour0: colour(p.colour0, black), colour1: colour(p.colour1, white) };
                default: return {};
            }
        }, build: (inputs, p) => processor(name, p, inputs[0]!.extent, (point, access) => {
            const v = access.sample(0, point), c = straight(v);
            let r = c.r, g = c.g, b = c.b, a = c.a;
            switch (name) {
                case "colourPolynomial": {
                    const f = (x: number, coefficients: readonly number[]) => coefficients[0]! + x * (coefficients[1]! + x * (coefficients[2]! + x * coefficients[3]!));
                    r = f(r, p.red as readonly number[]);
                    g = f(g, p.green as readonly number[]);
                    b = f(b, p.blue as readonly number[]);
                    a = f(a, p.alpha as readonly number[]);
                    break;
                }
                case "hueAdjust": {
                    const angle = p.angle as number, co = Math.cos(angle), si = Math.sin(angle), y = .299 * r + .587 * g + .114 * b, i = .596 * r - .274 * g - .322 * b, q = .211 * r - .523 * g + .312 * b, ni = i * co - q * si, nq = i * si + q * co;
                    r = y + .956 * ni + .621 * nq;
                    g = y - .272 * ni - .647 * nq;
                    b = y - 1.106 * ni + 1.703 * nq;
                    break;
                }
                case "linearToSRGB": {
                    const f = (x: number) => x <= .0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - .055;
                    r = f(r);
                    g = f(g);
                    b = f(b);
                    break;
                }
                case "sRGBToLinear": {
                    const f = (x: number) => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
                    r = f(r);
                    g = f(g);
                    b = f(b);
                    break;
                }
                case "exposure": {
                    const factor = 2 ** (p.ev as number);
                    r *= factor;
                    g *= factor;
                    b *= factor;
                    break;
                }
                case "gamma": {
                    const power = p.power as number;
                    r = r ** power;
                    g = g ** power;
                    b = b ** power;
                    break;
                }
                case "colourControls": {
                    const l = luma(c), sat = p.saturation as number, contrast = p.contrast as number, brightness = p.brightness as number;
                    const f = (x: number) => (l + (x - l) * sat - .5) * contrast + .5 + brightness;
                    r = f(r);
                    g = f(g);
                    b = f(b);
                    break;
                }
                case "colourMatrix": {
                    const m = p.matrix as readonly number[], bias = p.bias as readonly number[], values = [r, g, b, a], f = (row: number) => values.reduce((sum, v, i) => sum + v * m[row * 4 + i]!, bias[row]!);
                    r = f(0);
                    g = f(1);
                    b = f(2);
                    a = f(3);
                    break;
                }
                case "colourClamp": {
                    const min = p.minimum as readonly number[], max = p.maximum as readonly number[], f = (x: number, i: number) => Math.max(min[i]!, Math.min(max[i]!, x));
                    r = f(r, 0);
                    g = f(g, 1);
                    b = f(b, 2);
                    a = f(a, 3);
                    break;
                }
                case "threshold":
                    r = g = b = luma(c) >= (p.threshold as number) ? 1 : 0;
                    break;
                case "invert":
                    r = 1 - r;
                    g = 1 - g;
                    b = 1 - b;
                    break;
                case "sepia": {
                    const amount = p.intensity as number;
                    r = c.r + (clamp(.393 * c.r + .769 * c.g + .189 * c.b) - c.r) * amount;
                    g = c.g + (clamp(.349 * c.r + .686 * c.g + .168 * c.b) - c.g) * amount;
                    b = c.b + (clamp(.272 * c.r + .534 * c.g + .131 * c.b) - c.b) * amount;
                    break;
                }
                case "posterize": {
                    const levels = (p.levels as number) - 1;
                    const f = (x: number) => Math.round(x * levels) / levels;
                    r = f(r);
                    g = f(g);
                    b = f(b);
                    break;
                }
                case "monochrome": {
                    const target = p.colour as readonly number[], amount = p.intensity as number, l = luma(c);
                    r += (l * target[0]! - r) * amount;
                    g += (l * target[1]! - g) * amount;
                    b += (l * target[2]! - b) * amount;
                    break;
                }
                case "falseColour": {
                    const target = straight(mix(colourSample(p.colour0 as readonly number[]), colourSample(p.colour1 as readonly number[]), luma(c)));
                    r = target.r;
                    g = target.g;
                    b = target.b;
                    a *= target.a;
                    break;
                }
                case "maskToAlpha":
                    a *= luma(c);
                    r = g = b = 1;
                    break;
                case "maximumComponent":
                    r = g = b = Math.max(r, g, b);
                    break;
                case "minimumComponent":
                    r = g = b = Math.min(r, g, b);
                    break;
                default: throw new TypeError("Unknown colour operation.");
            }
            return premult({ r, g, b, a });
        }, r => [r]) };
}

colours.colorCrossPolynomial = { category: "colourAdjustment", inputs: 1, normalise: value => {
        const p = fields(value, ["redCoefficients", "greenCoefficients", "blueCoefficients"]);
        if (p.redCoefficients === undefined || p.greenCoefficients === undefined || p.blueCoefficients === undefined)
            throw new TypeError("Color cross-polynomial red, green and blue coefficients are required.");
        return Object.freeze({
            redCoefficients: tuple(p.redCoefficients, [], 10),
            greenCoefficients: tuple(p.greenCoefficients, [], 10),
            blueCoefficients: tuple(p.blueCoefficients, [], 10),
        });
    }, build: (inputs, parameters) => processor("colorCrossPolynomial", parameters, inputs[0]!.extent, (position, access) => {
        const source = straight(access.sample(0, position)), terms = [1, source.r, source.g, source.b, source.r ** 2, source.g ** 2, source.b ** 2, source.r * source.g, source.g * source.b, source.b * source.r];
        const evaluate = (coefficients: readonly number[]) => terms.reduce((sum, term, index) => sum + term * coefficients[index]!, 0);
        return premult({ r: evaluate(parameters.redCoefficients as readonly number[]), g: evaluate(parameters.greenCoefficients as readonly number[]), b: evaluate(parameters.blueCoefficients as readonly number[]), a: source.a });
    }, region => [region]) };
function cubeValues(value: unknown, dimension: number): readonly number[] {
    const componentCount = dimension ** 3 * 4, byteCount = componentCount * Float32Array.BYTES_PER_ELEMENT;
    if (!Number.isSafeInteger(componentCount) || byteCount > maximumCubeBytes)
        throw new RangeError("Colour cube data exceeds the four-megabyte processing bound.");
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length !== componentCount)
        throw new TypeError("Colour cube data must contain exactly one RGBA texel for every cube cell.");
    const result = new Array<number>(componentCount);
    for (let index = 0; index < componentCount; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "number" || !Number.isFinite(descriptor.value) || descriptor.value < 0 || descriptor.value > 1)
        throw new RangeError("Colour cube data must contain finite normalized numeric texels.");
        result[index] = descriptor.value;
    }
    for (let index = 0; index < componentCount; index += 4) {
        const alpha = result[index + 3]!;
        if (result[index]! > alpha || result[index + 1]! > alpha || result[index + 2]! > alpha)
        throw new RangeError("Colour cube data must use premultiplied RGBA texels.");
    }
    return Object.freeze(result);
}
function cubeAxis(component: number, dimension: number): Readonly<{ low: number; high: number; fraction: number; }> {
    const coordinate = clamp(component) * (dimension - 1), low = Math.floor(coordinate);
    return Object.freeze({ low, high: Math.min(dimension - 1, low + 1), fraction: coordinate - low });
}
function cubeSample(data: readonly number[], dimension: number, red: number, green: number, blue: number) {
    const texel = (r: number, g: number, b: number) => {
        const index = (r + dimension * (g + dimension * b)) * 4;
        return { r: data[index]!, g: data[index + 1]!, b: data[index + 2]!, a: data[index + 3]! };
    }, r = cubeAxis(red, dimension), g = cubeAxis(green, dimension), b = cubeAxis(blue, dimension);
    const lower = mix(mix(texel(r.low, g.low, b.low), texel(r.high, g.low, b.low), r.fraction), mix(texel(r.low, g.high, b.low), texel(r.high, g.high, b.low), r.fraction), g.fraction);
    const upper = mix(mix(texel(r.low, g.low, b.high), texel(r.high, g.low, b.high), r.fraction), mix(texel(r.low, g.high, b.high), texel(r.high, g.high, b.high), r.fraction), g.fraction);
    return mix(lower, upper, b.fraction);
}

function colourSpaceCube(data: readonly number[], dimension: number, space: GFXColourSpace, source: ReturnType<typeof straight>) {
    const toCube = namedColourTransform("linear-srgb", space, "clip", "clip").apply(source), selected = cubeSample(data, dimension, toCube.r, toCube.g, toCube.b), unpremultiplied = straight(selected), restored = namedColourTransform(space, "linear-srgb", "clip", "clip").apply(unpremultiplied);
    return premult({ r: restored.r, g: restored.g, b: restored.b, a: selected.a });
}
colours.colourCube = { category: "colourEffect", inputs: 1, normalise: value => {
        const p = fields(value, ["cubeDimension", "cubeData", "extrapolate"]), cubeDimension = integer(p.cubeDimension, 2, 2, maximumCubeDimension), extrapolate = p.extrapolate ?? false;
        if (typeof extrapolate !== "boolean")
        throw new TypeError("Colour cube extrapolate must be boolean.");
        if (extrapolate)
        throw new RangeError("Colour cube extrapolation is unavailable for normalized ImageFX pixels.");
        return { cubeDimension, cubeData: cubeValues(p.cubeData, cubeDimension), extrapolate };
    }, build: (inputs, p) => {
        const dimension = p.cubeDimension as number, data = p.cubeData as readonly number[];
        return processor("colourCube", p, inputs[0]!.extent, (position, access) => {
            // CIColorCube indexes with unpremultiplied input RGB; the selected linear-premultiplied LUT RGBA becomes the output without source-alpha scaling.
            const input = straight(access.sample(0, position));
            return cubeSample(data, dimension, input.r, input.g, input.b);
        }, region => [region]);
    } };

colours.colorCubeWithColorSpace = { category: "colourEffect", inputs: 1, normalise: value => {
        const p = fields(value, ["cubeDimension", "cubeData", "colorSpace", "extrapolate"]), cubeDimension = integer(p.cubeDimension, NaN, 2, maximumCubeDimension), extrapolate = requiredBoolean(p.extrapolate, "Color-cube extrapolate");
        if (extrapolate)
            throw new RangeError("Color-cube extrapolation is unavailable in normalized ImageFX pixels.");
        return Object.freeze({ cubeDimension, cubeData: cubeValues(p.cubeData, cubeDimension), colorSpace: colourSpace(p.colorSpace), extrapolate });
    }, build: (inputs, p) => processor("colorCubeWithColorSpace", p, inputs[0]!.extent, (position, access) => colourSpaceCube(p.cubeData as readonly number[], p.cubeDimension as number, p.colorSpace as GFXColourSpace, straight(access.sample(0, position))), region => [region]) };

colours.colorCubesMixedWithMask = { category: "colourEffect", inputs: 2, normalise: value => {
        const p = fields(value, ["cubeDimension", "cube0Data", "cube1Data", "colorSpace", "extrapolate"]), cubeDimension = integer(p.cubeDimension, NaN, 2, maximumCubeDimension), extrapolate = requiredBoolean(p.extrapolate, "Mixed color-cube extrapolate");
        if (extrapolate)
            throw new RangeError("Mixed color-cube extrapolation is unavailable in normalized ImageFX pixels.");
        return Object.freeze({ cubeDimension, cube0Data: cubeValues(p.cube0Data, cubeDimension), cube1Data: cubeValues(p.cube1Data, cubeDimension), colorSpace: colourSpace(p.colorSpace), extrapolate });
    }, build: (inputs, p) => processor("colorCubesMixedWithMask", p, inputs[0]!.extent, (position, access) => {
        const source = straight(access.sample(0, position)), first = colourSpaceCube(p.cube0Data as readonly number[], p.cubeDimension as number, p.colorSpace as GFXColourSpace, source), second = colourSpaceCube(p.cube1Data as readonly number[], p.cubeDimension as number, p.colorSpace as GFXColourSpace, source), mask = straight(access.sample(1, position));
        // Portable policy uses Rec.709 mask luminance; Core Image does not publish the internal mask scalar formula.
        return mix(first, second, clamp(luma(mask)));
    }, region => [region, region]) };

function curveComponent(data: readonly number[], channel: 0 | 1 | 2, value: number, domain: readonly number[]): number {
    const count = data.length / 3, t = clamp((value - domain[0]!) / (domain[1]! - domain[0]!)) * (count - 1), low = Math.min(count - 2, Math.floor(t)), fraction = t - low;
    return data[low * 3 + channel]! + (data[(low + 1) * 3 + channel]! - data[low * 3 + channel]!) * fraction;
}
colours.colorCurves = { category: "colourAdjustment", inputs: 1, normalise: value => {
        const p = fields(value, ["colorSpace", "curvesData", "curvesDomain"]), curvesDomain = tuple(p.curvesDomain, [], 2), curvesData = numericArray(p.curvesData, "Color curves data", 6, 3 * 1024, 3);
        if (curvesDomain[0]! >= curvesDomain[1]!)
            throw new RangeError("Color curves domain must be strictly increasing.");
        return Object.freeze({ colorSpace: colourSpace(p.colorSpace), curvesData, curvesDomain: Object.freeze([curvesDomain[0]!, curvesDomain[1]!] as const) });
    }, build: (inputs, p) => processor("colorCurves", p, inputs[0]!.extent, (position, access) => {
        const source = straight(access.sample(0, position)), space = p.colorSpace as GFXColourSpace, converted = namedColourTransform("linear-srgb", space, "clip", "clip").apply(source), data = p.curvesData as readonly number[], domain = p.curvesDomain as readonly number[], curved = { r: curveComponent(data, 0, converted.r, domain), g: curveComponent(data, 1, converted.g, domain), b: curveComponent(data, 2, converted.b, domain), a: source.a }, restored = namedColourTransform(space, "linear-srgb", "clip", "clip").apply(curved);
        return premult(restored);
    }, region => [region]) };

colours.documentEnhancer = { category: "colourEffect", inputs: 1, normalise: value => {
        const p = fields(value, ["amount"]);
        if (p.amount === undefined)
            throw new TypeError("Document enhancer amount is required.");
        return Object.freeze({ amount: number(p.amount, NaN, 0, 4) });
    }, build: (inputs, p) => processor("documentEnhancer", p, inputs[0]!.extent, (position, access) => {
        const source = straight(access.sample(0, position)), amount = p.amount as number, contrast = 1 + 1.5 * amount, enhancedLuma = clamp((luma(source) - .5) * contrast + .5), originalLuma = luma(source), chromaScale = 1 / (1 + .2 * amount);
        // Portable document adaptation: increase luminance separation while damping paper/ink chroma. Native CIDocumentEnhancer internals are not claimed.
        return premult({ r: enhancedLuma + (source.r - originalLuma) * chromaScale, g: enhancedLuma + (source.g - originalLuma) * chromaScale, b: enhancedLuma + (source.b - originalLuma) * chromaScale, a: source.a });
    }, region => [region]) };

type PhotoRecipe = Readonly<{ contrast: number; saturation: number; gamma: number; lift: number; tint: readonly number[] }>;
const photoRecipes: Readonly<Record<string, PhotoRecipe>> = Object.freeze({
    photoEffectChrome: Object.freeze({ contrast: 1.28, saturation: 1.35, gamma: .9, lift: 0, tint: [1.04, 1, .9] }),
    photoEffectFade: Object.freeze({ contrast: .72, saturation: .78, gamma: 1.08, lift: .12, tint: [1.05, 1, .96] }),
    photoEffectInstant: Object.freeze({ contrast: .9, saturation: .88, gamma: 1, lift: .05, tint: [1.12, 1, .78] }),
    photoEffectMono: Object.freeze({ contrast: 1, saturation: 0, gamma: 1, lift: 0, tint: [1, 1, 1] }),
    photoEffectNoir: Object.freeze({ contrast: 1.48, saturation: 0, gamma: .82, lift: -.02, tint: [.98, 1, 1.04] }),
    photoEffectProcess: Object.freeze({ contrast: 1.12, saturation: 1.24, gamma: .95, lift: .01, tint: [.9, 1.05, 1.12] }),
    photoEffectTonal: Object.freeze({ contrast: .82, saturation: 0, gamma: 1.04, lift: .08, tint: [1.04, 1, .98] }),
    photoEffectTransfer: Object.freeze({ contrast: 1.06, saturation: .94, gamma: .96, lift: .03, tint: [1.12, .95, .84] }),
});
for (const [name, recipe] of Object.entries(photoRecipes)) {
    colours[name] = { category: "colourEffect", inputs: 1, normalise: value => {
            const p = fields(value, ["extrapolate"]), extrapolate = requiredBoolean(p.extrapolate, `${name} extrapolate`);
            if (extrapolate)
                throw new RangeError(`${name} extrapolation is unavailable in normalized ImageFX pixels.`);
            return Object.freeze({ extrapolate });
        }, build: (inputs, p) => processor(name, p, inputs[0]!.extent, (position, access) => {
            const source = straight(access.sample(0, position)), luminance = luma(source), saturate = (channel: number) => luminance + (channel - luminance) * recipe.saturation, adjust = (channel: number, tint: number) => clamp((((Math.max(0, saturate(channel)) ** recipe.gamma) - .5) * recipe.contrast + .5 + recipe.lift) * tint);
            // Named portable adaptation only. Apple does not publish these preset transfer functions; native fidelity remains an open reference gate.
            return premult({ r: adjust(source.r, recipe.tint[0]), g: adjust(source.g, recipe.tint[1]), b: adjust(source.b, recipe.tint[2]), a: source.a });
        }, region => [region]) };
}

function thermalRamp(value: number): readonly [number, number, number] {
    const t = clamp(value);
    if (t < .25) return [0, t * 4 * .6, .35 + t * 4 * .65];
    if (t < .5) return [0, .6 + (t - .25) * 1.6, 1 - (t - .25) * 4];
    if (t < .75) return [(t - .5) * 4, 1, 0];
    return [1, 1 - (t - .75) * 3.2, (t - .75) * 2.4];
}
colours.thermal = { category: "colourEffect", inputs: 1, normalise: value => fields(value, []), build: (inputs, p) => processor("thermal", p, inputs[0]!.extent, (position, access) => {
        const source = straight(access.sample(0, position)), [r, g, b] = thermalRamp(luma(source));
        return premult({ r, g, b, a: source.a });
    }, region => [region]) };
colours.xRay = { category: "colourEffect", inputs: 1, normalise: value => fields(value, []), build: (inputs, p) => processor("xRay", p, inputs[0]!.extent, (position, access) => {
        const source = straight(access.sample(0, position)), inverse = clamp(1 - luma(source)), contrast = clamp((inverse - .5) * 1.3 + .5);
        // Portable radiograph mapping: inverted luminance with a cool spectral bias.
        return premult({ r: contrast * .72, g: contrast * .9, b: contrast, a: source.a });
    }, region => [region]) };

colours.vignette = { category: "colourEffect", inputs: 1, normalise: value => {
        const p = fields(value, ["intensity", "radius"]);
        if (p.intensity === undefined || p.radius === undefined)
            throw new TypeError("Vignette intensity and radius are required.");
        return Object.freeze({ intensity: number(p.intensity, NaN, -4, 4), radius: number(p.radius, NaN, .001, 1e5) });
    }, build: (inputs, p) => {
        const bounds = finiteInput(inputs[0]!), center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }, radius = p.radius as number, intensity = p.intensity as number;
        return processor("vignette", p, inputs[0]!.extent, (position, access) => {
            const source = straight(access.sample(0, position)), edge = clamp((Math.hypot(position.x - center.x, position.y - center.y) - radius) / radius), factor = Math.max(0, 1 - intensity * edge);
            return premult({ r: source.r * factor, g: source.g * factor, b: source.b * factor, a: source.a });
        }, region => [region]);
    } };
colours.vignetteEffect = { category: "colourEffect", inputs: 1, normalise: value => {
        const p = fields(value, ["center", "falloff", "intensity", "radius"]);
        if (p.center === undefined || p.falloff === undefined || p.intensity === undefined || p.radius === undefined)
            throw new TypeError("Vignette effect center, falloff, intensity and radius are required.");
        return Object.freeze({ center: point(p.center), falloff: number(p.falloff, NaN, .001, 1e5), intensity: number(p.intensity, NaN, -4, 4), radius: number(p.radius, NaN, 0, 1e5) });
    }, build: (inputs, p) => processor("vignetteEffect", p, inputs[0]!.extent, (position, access) => {
        const source = straight(access.sample(0, position)), center = p.center as GFXPoint, edge = clamp((Math.hypot(position.x - center.x, position.y - center.y) - (p.radius as number)) / (p.falloff as number)), factor = Math.max(0, 1 - (p.intensity as number) * edge);
        return premult({ r: source.r * factor, g: source.g * factor, b: source.b * factor, a: source.a });
    }, region => [region]) };
type Lab = Readonly<{ l: number; a: number; b: number; }>;
type OtsuSource = Readonly<{ output: GFXRect; grid: GFXRect; pixels: number; }>;
type OtsuThresholds = Readonly<{ r: number; g: number; b: number; }>;
const labEpsilon = 216 / 24389;
const labKappa = 24389 / 27;
const maximumOtsuPixels = 65_536;
const otsuCheckpointCells = 1_024;

function labForward(value: number): number {
    return value > labEpsilon ? Math.cbrt(value) : (labKappa * value + 16) / 116;
}
function labInverse(value: number): number {
    const cubed = value * value * value;
    return cubed > labEpsilon ? cubed : (116 * value - 16) / labKappa;
}
/** ImageFX samples are linear sRGB, so reuse its D50-adapted ICC PCS before CIE Lab encoding. */
function rgbToLab(value: Readonly<{ r: number; g: number; b: number; }>): Lab {
    const xyz = linearSRGBToD50XYZ(value), fx = labForward(xyz.x / d50ReferenceWhite.x), fy = labForward(xyz.y / d50ReferenceWhite.y), fz = labForward(xyz.z / d50ReferenceWhite.z);
    return Object.freeze({ l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) });
}
function labToRGB(value: Lab): Readonly<{ r: number; g: number; b: number; }> {
    const fy = (value.l + 16) / 116, fx = fy + value.a / 500, fz = fy - value.b / 200;
    return d50XYZToLinearSRGB({ x: d50ReferenceWhite.x * labInverse(fx), y: d50ReferenceWhite.y * labInverse(fy), z: d50ReferenceWhite.z * labInverse(fz) });
}
function normaliseLab(value: unknown): Readonly<{ normalize: true; }> {
    const parameters = fields(value, ["normalize"]);
    if (typeof parameters.normalize !== "boolean")
        throw new TypeError("CIConvertLab normalize must be boolean.");
    if (!parameters.normalize)
        throw new RangeError("Unnormalized CIConvertLab encoding is unavailable in the normalized ImageFX pixel pipeline.");
    return Object.freeze({ normalize: true });
}
function encodedLab(value: Lab): Readonly<{ r: number; g: number; b: number; }> {
    return Object.freeze({ r: value.l / 100, g: (value.a + 128) / 256, b: (value.b + 128) / 256 });
}
function decodedLab(value: Readonly<{ r: number; g: number; b: number; }>): Lab {
    return Object.freeze({ l: value.r * 100, a: value.g * 256 - 128, b: value.b * 256 - 128 });
}

colours.convertRGBtoLab = { category: "colourEffect", inputs: 1, normalise: normaliseLab, build: (inputs, parameters) => processor("convertRGBtoLab", parameters, inputs[0]!.extent, (point, access) => {
        const source = straight(access.sample(0, point)), lab = encodedLab(rgbToLab(source));
        return premult({ ...lab, a: source.a });
    }, region => [region]) };
colours.convertLabToRGB = { category: "colourEffect", inputs: 1, normalise: normaliseLab, build: (inputs, parameters) => processor("convertLabToRGB", parameters, inputs[0]!.extent, (point, access) => {
        const source = straight(access.sample(0, point)), rgb = labToRGB(decodedLab(source));
        return premult({ ...rgb, a: source.a });
    }, region => [region]) };

function deltaE94(reference: Lab, comparison: Lab): number {
    const deltaL = reference.l - comparison.l, deltaA = reference.a - comparison.a, deltaB = reference.b - comparison.b, referenceChroma = Math.hypot(reference.a, reference.b), comparisonChroma = Math.hypot(comparison.a, comparison.b), deltaChroma = referenceChroma - comparisonChroma, deltaHueSquared = Math.max(0, deltaA * deltaA + deltaB * deltaB - deltaChroma * deltaChroma);
    return Math.sqrt(deltaL * deltaL + (deltaChroma / (1 + .045 * referenceChroma)) ** 2 + deltaHueSquared / (1 + .015 * referenceChroma) ** 2);
}
colours.labDeltaE = { category: "colourEffect", inputs: 2, normalise: value => fields(value, []), build: (inputs, parameters) => processor("labDeltaE", parameters, unionExtent(inputs[0]!.extent, inputs[1]!.extent), (point, access) => {
        const reference = straight(access.sample(0, point)), comparison = straight(access.sample(1, point)), difference = deltaE94(rgbToLab(reference), rgbToLab(comparison)) / 100, alpha = Math.max(reference.a, comparison.a);
        // Core Image documents ΔE 1994 and 0…100 values, but not its CIE94 parameterization, packed result channels or alpha; this portable surface uses graphic-arts grayscale and max alpha.
        return premult({ r: difference, g: difference, b: difference, a: alpha });
    }, region => [region, region]) };

function otsuSource(input: IFXImage): OtsuSource {
    const output = finiteInput(input), left = Math.floor(output.x), top = Math.floor(output.y), right = Math.ceil(output.x + output.width), bottom = Math.ceil(output.y + output.height), width = right - left, height = bottom - top, pixels = width * height;
    if (![left, top, right, bottom, width, height, pixels].every(Number.isSafeInteger) || width < 1 || height < 1 || pixels > maximumOtsuPixels)
        throw new RangeError("Otsu analysis exceeds the 65,536-pixel bounded source limit.");
    return Object.freeze({ output, grid: Object.freeze({ x: left, y: top, width, height }), pixels });
}
function otsuBin(value: number): number {
    return Math.min(255, Math.floor(clamp(value) * 256));
}
function otsuThreshold(histogram: Uint32Array, pixels: number): number {
    let total = 0, backgroundWeight = 0, backgroundSum = 0, bestVariance = -1, best = 0;
    for (let index = 0; index < histogram.length; index++)
        total += index * histogram[index]!;
    for (let index = 0; index < histogram.length; index++) {
        const count = histogram[index]!;
        backgroundWeight += count;
        if (backgroundWeight === 0)
            continue;
        const foregroundWeight = pixels - backgroundWeight;
        if (foregroundWeight === 0)
            break;
        backgroundSum += index * count;
        const backgroundMean = backgroundSum / backgroundWeight, foregroundMean = (total - backgroundSum) / foregroundWeight, variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
        // Stable first-bin selection is portable policy; Core Image's tie rule is not documented.
        if (variance > bestVariance) {
            bestVariance = variance;
            best = index;
        }
    }
    return best / 255;
}
function* calculateOtsu(access: ProcessingAccess, source: OtsuSource): Generator<void, OtsuThresholds, void> {
    const red = new Uint32Array(256), green = new Uint32Array(256), blue = new Uint32Array(256);
    let cells = 0;
    for (let y = 0; y < source.grid.height; y++)
        for (let x = 0; x < source.grid.width; x++) {
            const value = straight(access.sampleWithin(0, { x: source.grid.x + x + .5, y: source.grid.y + y + .5 }, source.output, "nearest"));
            red[otsuBin(value.r)]++;
            green[otsuBin(value.g)]++;
            blue[otsuBin(value.b)]++;
            if (++cells % otsuCheckpointCells === 0)
                yield;
        }
    return Object.freeze({ r: otsuThreshold(red, source.pixels), g: otsuThreshold(green, source.pixels), b: otsuThreshold(blue, source.pixels) });
}
function synchronous<T>(calculation: Generator<void, T, void>): T {
    for (;;) {
        const result = calculation.next();
        if (result.done)
            return result.value;
    }
}
async function asynchronous<T>(access: ProcessingPreparationAccess, calculation: Generator<void, T, void>): Promise<T> {
    for (;;) {
        const result = calculation.next();
        if (result.done)
            return result.value;
        await access.checkpoint();
    }
}
colours.colourThresholdOtsu = { category: "colourAdjustment", inputs: 1, normalise: value => fields(value, []), build: (inputs, parameters) => {
        const source = otsuSource(inputs[0]!), cacheToken = Object.freeze({}), cached = (access: ProcessingAccess): OtsuThresholds => access.getState<OtsuThresholds>(cacheToken) ?? access.setState(cacheToken, synchronous(calculateOtsu(access, source)));
        return processor("colourThresholdOtsu", parameters, finiteExtent(source.output), (point, access) => {
            const value = straight(access.sample(0, point)), thresholds = cached(access);
            // Apple documents independent RGB thresholding to 0 or 1 with alpha unchanged.
            return premult({ r: value.r > thresholds.r ? 1 : 0, g: value.g > thresholds.g ? 1 : 0, b: value.b > thresholds.b ? 1 : 0, a: value.a });
        }, () => [source.output], async access => {
            if (!access.getState<OtsuThresholds>(cacheToken))
                access.setState(cacheToken, await asynchronous(access, calculateOtsu(access, source)));
        });
    } };

function ditherNoise(x: number, y: number, channel: number): number {
    let value = (Math.floor(x) | 0) ^ Math.imul(Math.floor(y) | 0, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca6b);
    value = Math.imul(value ^ value >>> 16, 0x7feb352d);
    value = Math.imul(value ^ value >>> 15, 0x846ca68b);
    value ^= value >>> 16;
    return (value >>> 0) / 0x1_0000_0000 - .5;
}
colours.dither = { category: "colourEffect", inputs: 1, normalise: value => {
        const parameters = fields(value, ["intensity"]);
        if (parameters.intensity === undefined)
            throw new TypeError("Dither intensity is required.");
        return Object.freeze({ intensity: number(parameters.intensity, NaN, 0, 1) });
    }, build: (inputs, parameters) => {
        const intensity = parameters.intensity as number;
        return processor("dither", parameters, inputs[0]!.extent, (point, access) => {
            const source = straight(access.sample(0, point));
            // CIDither documents randomized noise but no seed/default; this stateless coordinate hash makes portable graphs repeatable.
            return premult({ r: source.r + intensity * ditherNoise(point.x, point.y, 0), g: source.g + intensity * ditherNoise(point.x, point.y, 1), b: source.b + intensity * ditherNoise(point.x, point.y, 2), a: source.a });
        }, region => [region]);
    } };

function gradientCoordinate(gradient: GFXRect, luminance: number): Readonly<{ x: number; y: number; }> {
    const insetX = Math.min(.5, gradient.width / 2), start = gradient.x + insetX, end = gradient.x + gradient.width - insetX;
    return Object.freeze({ x: start + (end - start) * clamp(luminance), y: gradient.y + gradient.height / 2 });
}
colours.colourMap = { category: "colourEffect", inputs: 2, normalise: value => fields(value, []), build: (inputs, parameters) => {
        const gradient = finiteInput(inputs[1]!);
        return processor("colourMap", parameters, inputs[0]!.extent, (point, access) => {
            const source = straight(access.sample(0, point)), luminance = .2125 * source.r + .7154 * source.g + .0721 * source.b, mapped = straight(access.sampleWithin(1, gradientCoordinate(gradient, luminance), gradient, "linear")), alpha = source.a * mapped.a;
            // Apple documents unpremultiplied RGB luma weights; centerline, interpolation, finite-gradient and alpha policies are portable ImageFX choices.
            return premult({ r: mapped.r, g: mapped.g, b: mapped.b, a: alpha });
        }, region => [region, gradient]);
    } };

const defaultTemperatureNeutral: GFXPoint = Object.freeze({ x: 6500, y: 0 });
const minimumPortableTemperature = 1667;
const maximumPortableTemperature = 25_000;
const minimumPortableTint = -150;
const maximumPortableTint = 150;
const portableTintChromaticityStep = .0001;
type WhiteXYZ = Readonly<{ x: number; y: number; z: number; }>;
type TemperatureAdaptation = Readonly<{ x: number; y: number; z: number; }>;

function temperatureVector(value: unknown, fallback: GFXPoint, name: string): GFXPoint {
    const result = point(value, fallback);
    if (result.x < minimumPortableTemperature || result.x > maximumPortableTemperature)
        throw new RangeError(`${name} temperature must be in the portable ${minimumPortableTemperature}…${maximumPortableTemperature} K range.`);
    if (result.y < minimumPortableTint || result.y > maximumPortableTint)
        throw new RangeError(`${name} tint must be in the portable ${minimumPortableTint}…${maximumPortableTint} range.`);
    return result;
}

function temperatureWhite(value: GFXPoint): WhiteXYZ {
    const temperature = value.x;
    const x = temperature <= 4000
        ? -.2661239e9 / temperature ** 3 - .2343580e6 / temperature ** 2 + .8776956e3 / temperature + .179910
        : -3.0258469e9 / temperature ** 3 + 2.1070379e6 / temperature ** 2 + .2226347e3 / temperature + .240390;
    const neutralY = temperature <= 2222
        ? -1.1063814 * x ** 3 - 1.34811020 * x ** 2 + 2.18555832 * x - .20219683
        : temperature <= 4000
            ? -.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - .16748867
            : 3.0817580 * x ** 3 - 5.87338670 * x ** 2 + 3.75112997 * x - .37001483;
    const y = neutralY + value.y * portableTintChromaticityStep, remainder = 1 - x - y;
    if (![x, y, remainder].every(Number.isFinite) || x <= 0 || y <= 0 || remainder <= 0)
        throw new RangeError("Temperature/tint white point is outside the portable chromaticity domain.");
    return Object.freeze({ x: x / y, y: 1, z: remainder / y });
}

function temperatureAdaptation(neutral: GFXPoint, targetNeutral: GFXPoint): TemperatureAdaptation {
    const source = temperatureWhite(neutral), target = temperatureWhite(targetNeutral), result = { x: target.x / source.x, y: target.y / source.y, z: target.z / source.z };
    if (!Object.values(result).every(Number.isFinite))
        throw new RangeError("Temperature/tint adaptation is nonfinite.");
    return Object.freeze(result);
}

colours.temperatureAndTint = { category: "colourAdjustment", inputs: 1, normalise: value => {
        const parameters = fields(value, ["neutral", "targetNeutral"]);
        return Object.freeze({ neutral: temperatureVector(parameters.neutral, defaultTemperatureNeutral, "Neutral"), targetNeutral: temperatureVector(parameters.targetNeutral, defaultTemperatureNeutral, "Target neutral") });
    }, build: (inputs, parameters) => {
        const adaptation = temperatureAdaptation(parameters.neutral as GFXPoint, parameters.targetNeutral as GFXPoint);
        return processor("temperatureAndTint", parameters, inputs[0]!.extent, (position, access) => {
            const source = straight(access.sample(0, position)), xyz = linearSRGBToD50XYZ(source), adjusted = d50XYZToLinearSRGB({ x: xyz.x * adaptation.x, y: xyz.y * adaptation.y, z: xyz.z * adaptation.z });
            // Apple does not publish its CCT/tint transform. This portable operation uses the canonical D50 PCS conversion and diagonal XYZ von Kries adaptation; native colour-profile fidelity remains open.
            return premult({ ...adjusted, a: source.a });
        }, region => [region]);
    } };

const defaultToneCurvePoints: readonly GFXPoint[] = Object.freeze([
    Object.freeze({ x: 0, y: 0 }),
    Object.freeze({ x: .25, y: .25 }),
    Object.freeze({ x: .5, y: .5 }),
    Object.freeze({ x: .75, y: .75 }),
    Object.freeze({ x: 1, y: 1 }),
]);
type ToneSpline = Readonly<{ x: readonly number[]; a: readonly number[]; b: readonly number[]; c: readonly number[]; d: readonly number[]; }>;

function tonePoint(value: unknown, fallback: GFXPoint): GFXPoint {
    const result = point(value, fallback);
    if (result.x < 0 || result.x > 1 || result.y < 0 || result.y > 1)
        throw new RangeError("Tone curve points must be finite unit coordinates.");
    return result;
}

function toneSpline(points: readonly GFXPoint[]): ToneSpline {
    const x = points.map(value => value.x), a = points.map(value => value.y), count = points.length, h = new Array<number>(count - 1), alpha = new Array<number>(count).fill(0), l = new Array<number>(count).fill(0), mu = new Array<number>(count).fill(0), z = new Array<number>(count).fill(0), c = new Array<number>(count).fill(0), b = new Array<number>(count - 1).fill(0), d = new Array<number>(count - 1).fill(0);
    for (let index = 0; index < count - 1; index++) {
        h[index] = x[index + 1]! - x[index]!;
        if (h[index]! <= 0)
            throw new RangeError("Tone curve point x coordinates must be strictly increasing.");
    }
    for (let index = 1; index < count - 1; index++)
        alpha[index] = 3 / h[index]! * (a[index + 1]! - a[index]!) - 3 / h[index - 1]! * (a[index]! - a[index - 1]!);
    l[0] = 1;
    for (let index = 1; index < count - 1; index++) {
        l[index] = 2 * (x[index + 1]! - x[index - 1]!) - h[index - 1]! * mu[index - 1]!;
        if (!Number.isFinite(l[index]) || Math.abs(l[index]!) < 1e-12)
            throw new RangeError("Tone curve spline is singular.");
        mu[index] = h[index]! / l[index]!;
        z[index] = (alpha[index]! - h[index - 1]! * z[index - 1]!) / l[index]!;
    }
    l[count - 1] = 1;
    for (let index = count - 2; index >= 0; index--) {
        c[index] = z[index]! - mu[index]! * c[index + 1]!;
        b[index] = (a[index + 1]! - a[index]!) / h[index]! - h[index]! * (c[index + 1]! + 2 * c[index]!) / 3;
        d[index] = (c[index + 1]! - c[index]!) / (3 * h[index]!);
    }
    if (![...h, ...alpha, ...l, ...mu, ...z, ...c, ...b, ...d].every(Number.isFinite))
        throw new RangeError("Tone curve spline coefficients must be finite.");
    return Object.freeze({ x: Object.freeze(x), a: Object.freeze(a), b: Object.freeze(b), c: Object.freeze(c), d: Object.freeze(d) });
}

function toneSplineValue(spline: ToneSpline, value: number): number {
    if (value <= spline.x[0]!)
        return spline.a[0]!;
    const last = spline.x.length - 1;
    if (value >= spline.x[last]!)
        return spline.a[last]!;
    let index = 0;
    while (index + 1 < last && value >= spline.x[index + 1]!)
        index++;
    const distance = value - spline.x[index]!;
    return spline.a[index]! + spline.b[index]! * distance + spline.c[index]! * distance ** 2 + spline.d[index]! * distance ** 3;
}

function toneCurveComponent(spline: ToneSpline, value: number): number {
    return clamp(toneSplineValue(spline, Math.sqrt(value))) ** 2;
}

colours.toneCurve = { category: "colourAdjustment", inputs: 1, normalise: value => {
        const parameters = fields(value, ["point0", "point1", "point2", "point3", "point4", "extrapolate"]), extrapolate = parameters.extrapolate ?? false;
        if (typeof extrapolate !== "boolean")
            throw new TypeError("Tone curve extrapolate must be boolean.");
        const points = defaultToneCurvePoints.map((fallback, index) => tonePoint(parameters[`point${index}`], fallback));
        toneSpline(points);
        return Object.freeze({ point0: points[0]!, point1: points[1]!, point2: points[2]!, point3: points[3]!, point4: points[4]!, extrapolate });
    }, build: (inputs, parameters) => {
        const spline = toneSpline([parameters.point0, parameters.point1, parameters.point2, parameters.point3, parameters.point4] as GFXPoint[]);
        return processor("toneCurve", parameters, inputs[0]!.extent, (position, access) => {
            const source = straight(access.sample(0, position));
            // Core Image documents a gamma-2 working curve but not a spline family. This is a natural cubic spline; ImageFX's unit pixels cannot expose Apple's HDR extrapolation behavior.
            return premult({ r: toneCurveComponent(spline, source.r), g: toneCurveComponent(spline, source.g), b: toneCurveComponent(spline, source.b), a: source.a });
        }, region => [region]);
    } };

const maximumPortableVibrance = 4;
colours.vibrance = { category: "colourAdjustment", inputs: 1, normalise: value => {
        const parameters = fields(value, ["amount"]);
        if (parameters.amount === undefined)
            throw new TypeError("Vibrance amount is required.");
        return Object.freeze({ amount: number(parameters.amount, NaN, -maximumPortableVibrance, maximumPortableVibrance) });
    }, build: (inputs, parameters) => {
        const amount = parameters.amount as number;
        return processor("vibrance", parameters, inputs[0]!.extent, (position, access) => {
            const source = straight(access.sample(0, position)), chroma = Math.max(source.r, source.g, source.b) - Math.min(source.r, source.g, source.b), luminance = luma(source), scale = 1 + amount * (1 - chroma);
            // Apple documents skin-tone preservation but no public kernel. The portable policy holds luma, weights low-chroma colours more, and has no skin detector.
            return premult({ r: luminance + (source.r - luminance) * scale, g: luminance + (source.g - luminance) * scale, b: luminance + (source.b - luminance) * scale, a: source.a });
        }, region => [region]);
    } };

colours.whitePointAdjust = { category: "colourAdjustment", inputs: 1, normalise: value => {
        const parameters = fields(value, ["colour"]);
        if (parameters.colour === undefined)
            throw new TypeError("White point colour is required.");
        return Object.freeze({ colour: colour(parameters.colour, white) });
    }, build: (inputs, parameters) => {
        const whitePoint = parameters.colour as readonly number[];
        return processor("whitePointAdjust", parameters, inputs[0]!.extent, (position, access) => {
            const source = straight(access.sample(0, position));
            // This maps neutral gray to the supplied RGB white point. CIColor alpha is retained in the serialized parameter but is not a source-alpha multiplier in this portable working-colour policy.
            return premult({ r: source.r * whitePoint[0]!, g: source.g * whitePoint[1]!, b: source.b * whitePoint[2]!, a: source.a });
        }, region => [region]);
    } };

type BlendChannelMode = "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "difference" | "exclusion" | "hardLight" | "softLight" | "colourDodge" | "colourBurn" | "sourceIn" | "sourceOut" | "sourceAtop" | "addition" | "colour" | "divide" | "hue" | "linearBurn" | "linearDodge" | "linearLight" | "luminosity" | "pinLight" | "saturation" | "subtract" | "vividLight";
type RGB = Readonly<{ r: number; g: number; b: number; }>;
const blendModes: readonly BlendChannelMode[] = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "difference", "exclusion", "hardLight", "softLight", "colourDodge", "colourBurn", "sourceIn", "sourceOut", "sourceAtop", "addition"];
const rgb = (r: number, g: number, b: number): RGB => ({ r, g, b });
const blendLum = (c: RGB) => .3 * c.r + .59 * c.g + .11 * c.b;
const blendSat = (c: RGB) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
function clipBlendColour(c: RGB): RGB {
    const l = blendLum(c), n = Math.min(c.r, c.g, c.b), x = Math.max(c.r, c.g, c.b);
    let r = c.r, g = c.g, b = c.b;
    if (n < 0) {
        const factor = l / (l - n);
        r = l + (r - l) * factor;
        g = l + (g - l) * factor;
        b = l + (b - l) * factor;
    }
    if (x > 1) {
        const factor = (1 - l) / (x - l);
        r = l + (r - l) * factor;
        g = l + (g - l) * factor;
        b = l + (b - l) * factor;
    }
    return rgb(clamp(r), clamp(g), clamp(b));
}
function setBlendLum(c: RGB, luminosity: number): RGB {
    const delta = luminosity - blendLum(c);
    return clipBlendColour(rgb(c.r + delta, c.g + delta, c.b + delta));
}
function setBlendSat(c: RGB, saturation: number): RGB {
    const values = [c.r, c.g, c.b], order = [0, 1, 2].sort((left, right) => values[left]! - values[right]! || left - right), result = [0, 0, 0], low = values[order[0]!]!, high = values[order[2]!]!;
    if (high > low) {
        result[order[1]!] = (values[order[1]!]! - low) * saturation / (high - low);
        result[order[2]!] = saturation;
    }
    return rgb(result[0]!, result[1]!, result[2]!);
}
function nonSeparableBlend(backdrop: RGB, source: RGB, mode: BlendChannelMode): RGB {
    switch (mode) {
        case "hue": return setBlendLum(setBlendSat(source, blendSat(backdrop)), blendLum(backdrop));
        case "saturation": return setBlendLum(setBlendSat(backdrop, blendSat(source)), blendLum(backdrop));
        case "colour": return setBlendLum(source, blendLum(backdrop));
        case "luminosity": return setBlendLum(backdrop, blendLum(source));
        default: throw new TypeError("Unknown non-separable blend operation.");
    }
}
function blendChannel(backdrop: number, source: number, mode: BlendChannelMode): number {
    switch (mode) {
        case "normal": return source;
        case "multiply": return backdrop * source;
        case "screen": return backdrop + source - backdrop * source;
        case "overlay": return backdrop <= .5 ? 2 * backdrop * source : 1 - 2 * (1 - backdrop) * (1 - source);
        case "darken": return Math.min(backdrop, source);
        case "lighten": return Math.max(backdrop, source);
        case "difference": return Math.abs(backdrop - source);
        case "exclusion": return backdrop + source - 2 * backdrop * source;
        case "hardLight": return source <= .5 ? 2 * backdrop * source : 1 - 2 * (1 - backdrop) * (1 - source);
        case "softLight": return source <= .5 ? backdrop - (1 - 2 * source) * backdrop * (1 - backdrop) : backdrop + (2 * source - 1) * ((backdrop <= .25 ? ((16 * backdrop - 12) * backdrop + 4) * backdrop : Math.sqrt(backdrop)) - backdrop);
        case "colourDodge": return backdrop === 0 ? 0 : source === 1 ? 1 : Math.min(1, backdrop / (1 - source));
        case "colourBurn": return backdrop === 1 ? 1 : source === 0 ? 0 : 1 - Math.min(1, (1 - backdrop) / source);
        case "divide": return source === 0 ? 1 : Math.min(1, backdrop / source);
        case "linearBurn": return clamp(backdrop + source - 1);
        case "linearDodge": return clamp(backdrop + source);
        case "linearLight": return clamp(backdrop + 2 * source - 1);
        case "pinLight": return source < .5 ? Math.min(backdrop, 2 * source) : Math.max(backdrop, 2 * source - 1);
        case "subtract": return clamp(source - backdrop);
        case "vividLight": return source < .5 ? blendChannel(backdrop, 2 * source, "colourBurn") : blendChannel(backdrop, 2 * (source - .5), "colourDodge");
        default: throw new TypeError("Unknown blend operation.");
    }
}
function blendColour(backdrop: RGB, source: RGB, mode: BlendChannelMode): RGB {
    if (mode === "colour" || mode === "hue" || mode === "saturation" || mode === "luminosity")
        return nonSeparableBlend(backdrop, source, mode);
    return rgb(blendChannel(backdrop.r, source.r, mode), blendChannel(backdrop.g, source.g, mode), blendChannel(backdrop.b, source.b, mode));
}
function sourceOverBlend(source: import("../IFXSampler").IFXPremultipliedSample, backdrop: import("../IFXSampler").IFXPremultipliedSample, mode: BlendChannelMode) {
    if (source.a === 0)
        return backdrop;
    if (backdrop.a === 0)
        return source;
    const straightSource = straight(source), straightBackdrop = straight(backdrop), result = blendColour(rgb(straightBackdrop.r, straightBackdrop.g, straightBackdrop.b), rgb(straightSource.r, straightSource.g, straightSource.b), mode), channel = (key: "r" | "g" | "b") => (1 - backdrop.a) * source[key] + (1 - source.a) * backdrop[key] + source.a * backdrop.a * result[key];
    return { r: channel("r"), g: channel("g"), b: channel("b"), a: source.a + backdrop.a * (1 - source.a) };
}
colours.blend = { category: "composite", inputs: 2, normalise: value => {
        const p = fields(value, ["mode"]);
        const mode = p.mode as BlendChannelMode;
        if (!blendModes.includes(mode))
            throw new TypeError("Unknown blend mode.");
        return { mode };
    }, build: (inputs, p) => processor("blend", p, unionExtent(inputs[0]!.extent, inputs[1]!.extent), (point, access) => {
        const a = access.sample(0, point), b = access.sample(1, point), mode = p.mode as BlendChannelMode;
        if (mode === "addition")
            return { r: Math.min(1, a.r + b.r), g: Math.min(1, a.g + b.g), b: Math.min(1, a.b + b.b), a: Math.min(1, a.a + b.a) };
        if (mode === "sourceIn" || mode === "sourceOut" || mode === "sourceAtop") {
            const factor = mode === "sourceOut" ? 1 - b.a : b.a, back = mode === "sourceAtop" ? 1 - a.a : 0;
            return { r: a.r * factor + b.r * back, g: a.g * factor + b.g * back, b: a.b * factor + b.b * back, a: a.a * factor + b.a * back };
        }
        return sourceOverBlend(a, b, mode);
    }, r => [r, r]) };
const namedBlendFactories: Readonly<Record<string, BlendChannelMode>> = {
    colourBlendMode: "colour",
    divideBlendMode: "divide",
    hueBlendMode: "hue",
    linearBurnBlendMode: "linearBurn",
    linearDodgeBlendMode: "linearDodge",
    linearLightBlendMode: "linearLight",
    luminosityBlendMode: "luminosity",
    pinLightBlendMode: "pinLight",
    saturationBlendMode: "saturation",
    subtractBlendMode: "subtract",
    vividLightBlendMode: "vividLight",
};
for (const [name, mode] of Object.entries(namedBlendFactories)) {
    colours[name] = { category: "composite", inputs: 2, normalise: value => fields(value, []), build: (inputs, p) => processor(name, p, unionExtent(inputs[0]!.extent, inputs[1]!.extent), (point, access) => sourceOverBlend(access.sample(0, point), access.sample(1, point), mode), region => [region, region]) };
}
const namedCompositingFactories: Readonly<Record<string, (source: number, backdrop: number) => number>> = {
    minimumCompositing: Math.min,
    maximumCompositing: Math.max,
    multiplyCompositing: (source, backdrop) => source * backdrop,
};
for (const [name, operation] of Object.entries(namedCompositingFactories)) {
    colours[name] = { category: "composite", inputs: 2, normalise: value => fields(value, []), build: (inputs, p) => processor(name, p, unionExtent(inputs[0]!.extent, inputs[1]!.extent), (point, access) => {
            const source = access.sample(0, point), backdrop = access.sample(1, point);
            return { r: operation(source.r, backdrop.r), g: operation(source.g, backdrop.g), b: operation(source.b, backdrop.b), a: operation(source.a, backdrop.a) };
        }, region => [region, region]) };
}
colours.blendWithMask = { category: "stylize", inputs: 3, normalise: value => {
        const p = fields(value, ["channel"]), channel = p.channel ?? "luminance";
        if (!["luminance", "alpha", "red", "blue"].includes(channel as string))
            throw new TypeError("Unknown mask channel.");
        return { channel };
    }, build: (inputs, p) => processor("blendWithMask", p, unionExtent(inputs[0]!.extent, inputs[1]!.extent), (point, access) => {
        const mask = access.sample(2, point), t = p.channel === "alpha" ? mask.a : p.channel === "red" ? mask.r : p.channel === "blue" ? mask.b : luma(mask);
        return mix(access.sample(1, point), access.sample(0, point), t);
    }, r => [r, r, r]) };
colours.colourAbsoluteDifference = { category: "colourAdjustment", inputs: 2, normalise: value => fields(value, []), build: (inputs, p) => processor("colourAbsoluteDifference", p, unionExtent(inputs[0]!.extent, inputs[1]!.extent), (point, access) => {
        const a = straight(access.sample(0, point)), b = straight(access.sample(1, point));
        return premult({ r: Math.abs(a.r - b.r), g: Math.abs(a.g - b.g), b: Math.abs(a.b - b.b), a: Math.max(a.a, b.a) });
    }, r => [r, r]) };
