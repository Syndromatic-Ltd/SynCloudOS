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

import { normaliseRect, type GFXRect } from "../../GraphicsFX/GFXGeometry";
import { finiteExtent, type IFXExtent } from "../extent";
import type { IFXPremultipliedSample as Sample } from "../IFXSampler";
import { fields, number, integer, point, tuple, processor, expanded, expandedExtent, premult, straight, luma, clamp, type Definition } from "./common";
type Tap = Readonly<{
    x: number;
    y: number;
    weight: number;
}>;
function weighted(taps: readonly Tap[], p: {
    x: number;
    y: number;
}, access: import("../processing").ProcessingAccess): Sample {
    const c = { r: 0, g: 0, b: 0, a: 0 };
    for (const tap of taps) {
        const v = access.sample(0, { x: p.x + tap.x, y: p.y + tap.y });
        c.r += v.r * tap.weight;
        c.g += v.g * tap.weight;
        c.b += v.b * tap.weight;
        c.a += v.a * tap.weight;
    }
    return c;
}
function gaussian(sigma: number): Tap[] {
    if (sigma === 0)
        return [{ x: 0, y: 0, weight: 1 }];
    const radius = Math.ceil(3 * sigma), taps: Tap[] = [];
    let sum = 0;
    for (let y = -radius; y <= radius; y++)
        for (let x = -radius; x <= radius; x++) {
            const weight = Math.exp(-(x * x + y * y) / (2 * sigma * sigma));
            sum += weight;
            taps.push({ x, y, weight });
        }
    return taps.map(t => ({ ...t, weight: t.weight / sum }));
}
function expandedAxes(bounds: GFXRect, x: number, y: number): GFXRect {
    return normaliseRect({ x: bounds.x - x, y: bounds.y - y, width: bounds.width + 2 * x, height: bounds.height + 2 * y });
}
function expandedAxesExtent(extent: IFXExtent, x: number, y: number): IFXExtent {
    return extent.kind === "infinite" ? extent : finiteExtent(expandedAxes(extent.rect, x, y));
}
export const spatial: Record<string, Definition> = {};
for (const name of ["boxBlur", "discBlur", "gaussianBlur", "median", "morphologyMaximum", "morphologyMinimum", "morphologyGradient", "motionBlur"]) {
    spatial[name] = { category: "blur", inputs: 1, normalise: value => {
            const allowed = name === "median" ? [] : name === "gaussianBlur" ? ["sigma"] : name === "motionBlur" ? ["radius", "angle"] : ["radius"];
            const p = fields(value, allowed);
            return name === "median" ? {} : name === "gaussianBlur" ? { sigma: number(p.sigma, 1, 0, 4) } : name === "motionBlur" ? { radius: integer(p.radius, 3, 0, 16), angle: number(p.angle, 0, -Math.PI * 2, Math.PI * 2) } : { radius: integer(p.radius, 1, 0, 8) };
        }, build: (inputs, p) => {
            const radius = name === "median" ? 1 : name === "gaussianBlur" ? Math.ceil(3 * (p.sigma as number)) : p.radius as number;
            let taps: Tap[] = [];
            if (name === "gaussianBlur")
                taps = gaussian(p.sigma as number);
            else if (name === "motionBlur") {
                for (let i = -radius; i <= radius; i++)
                    taps.push({ x: Math.cos(p.angle as number) * i, y: Math.sin(p.angle as number) * i, weight: 1 / (2 * radius + 1) });
            }
            else {
                for (let y = -radius; y <= radius; y++)
                    for (let x = -radius; x <= radius; x++) {
                        if ((name === "discBlur" || name.startsWith("morphology")) && x * x + y * y > radius * radius)
                            continue;
                        taps.push({ x, y, weight: 1 });
                    }
                taps = taps.map(t => ({ ...t, weight: 1 / taps.length }));
            }
            return processor(name, p, expandedExtent(inputs[0]!.extent, radius), (position, access) => {
                if (name === "median" || name.startsWith("morphology")) {
                    const values = taps.map(t => access.sample(0, { x: position.x + t.x, y: position.y + t.y }));
                    const channel = (key: keyof Sample) => {
                        const sorted = values.map(v => v[key]).sort((a, b) => a - b);
                        return name === "median" ? sorted[Math.floor(sorted.length / 2)]! : name === "morphologyMinimum" ? sorted[0]! : name === "morphologyMaximum" ? sorted[sorted.length - 1]! : sorted[sorted.length - 1]! - sorted[0]!;
                    };
                    return { r: channel("r"), g: channel("g"), b: channel("b"), a: name === "morphologyGradient" ? 1 : channel("a") };
                }
                return weighted(taps, position, access);
            }, bounds => [expanded(bounds, radius)]);
        } };
}
const maximumRectangleDimension = 63;
const maximumRectangleSamples = 1024;
/** Apple specifies nearest odd integer; equidistant even values use the higher odd integer. */
function nearestOddDimension(value: unknown, label: string): number {
    if (value === undefined)
        throw new TypeError(`Rectangular morphology ${label} is required.`);
    const raw = number(value, NaN, 0, maximumRectangleDimension), rounded = 2 * Math.round((raw - 1) / 2) + 1;
    if (!Number.isSafeInteger(rounded) || rounded < 1 || rounded > maximumRectangleDimension)
        throw new RangeError("Rectangular morphology dimension exceeds the portable support limit.");
    return rounded;
}
function morphologyRectangle(position: { x: number; y: number }, access: import("../processing").ProcessingAccess, taps: readonly Tap[], maximum: boolean): Sample {
    let result: { r: number; g: number; b: number; a: number; } | undefined;
    for (const tap of taps) {
        const sample = access.sample(0, { x: position.x + tap.x, y: position.y + tap.y });
        if (!result)
            result = { ...sample };
        else if (maximum) {
            result.r = Math.max(result.r, sample.r);
            result.g = Math.max(result.g, sample.g);
            result.b = Math.max(result.b, sample.b);
            result.a = Math.max(result.a, sample.a);
        }
        else {
            result.r = Math.min(result.r, sample.r);
            result.g = Math.min(result.g, sample.g);
            result.b = Math.min(result.b, sample.b);
            result.a = Math.min(result.a, sample.a);
        }
    }
    if (!result)
        throw new RangeError("Rectangular morphology requires a nonempty support.");
    return result;
}
for (const [name, maximum] of [["morphologyRectangleMaximum", true], ["morphologyRectangleMinimum", false]] as const) {
    spatial[name] = { category: "blur", inputs: 1, normalise: value => {
            const p = fields(value, ["width", "height"]), width = nearestOddDimension(p.width, "width"), height = nearestOddDimension(p.height, "height");
            if (width * height > maximumRectangleSamples)
                throw new RangeError("Rectangular morphology support exceeds the 1,024-sample portable limit.");
            return { width, height };
        }, build: (inputs, p) => {
            const width = p.width as number, height = p.height as number, rx = (width - 1) / 2, ry = (height - 1) / 2, taps: Tap[] = [];
            for (let y = -ry; y <= ry; y++)
                for (let x = -rx; x <= rx; x++)
                    taps.push({ x, y, weight: 1 });
            return processor(name, p, expandedAxesExtent(inputs[0]!.extent, rx, ry), (position, access) => morphologyRectangle(position, access, taps, maximum), bounds => [expandedAxes(bounds, rx + 1, ry + 1)]);
        } };
}
const maximumMaskedVariableBlurRadius = 100;
// A fixed 5x5 binomial Gaussian gives a reusable 25-sample bounded CPU kernel for every local mask radius.
const variableGaussianTaps: readonly Tap[] = Object.freeze([-1, -.5, 0, .5, 1].flatMap((y, iy) => [-1, -.5, 0, .5, 1].map((x, ix) => ({ x, y, weight: [1, 4, 6, 4, 1][ix]! * [1, 4, 6, 4, 1][iy]! / 256 }))));
function scaledGaussian(position: { x: number; y: number }, access: import("../processing").ProcessingAccess, radius: number): Sample {
    if (radius === 0)
        return access.sample(0, position);
    const result = { r: 0, g: 0, b: 0, a: 0 };
    for (const tap of variableGaussianTaps) {
        const sample = access.sample(0, { x: position.x + tap.x * radius, y: position.y + tap.y * radius });
        result.r += sample.r * tap.weight;
        result.g += sample.g * tap.weight;
        result.b += sample.b * tap.weight;
        result.a += sample.a * tap.weight;
    }
    return result;
}
spatial.maskedVariableBlur = { category: "blur", inputs: 2, normalise: value => {
        const p = fields(value, ["radius"]);
        return { radius: number(p.radius, 10, 0, maximumMaskedVariableBlurRadius) };
    }, build: (inputs, p) => {
        const radius = p.radius as number;
        return processor("maskedVariableBlur", p, expandedExtent(inputs[0]!.extent, radius), (position, access) => {
            // Grayscale mask amount is premultiplied luma: straight grayscale luma scaled by mask alpha.
            const amount = clamp(luma(access.sample(1, position)));
            return scaledGaussian(position, access, radius * amount);
        }, bounds => [expanded(bounds, radius + 1), expanded(bounds, .5)]);
    } };
const maximumBokehRadius = 100;
const bokehTaps = Object.freeze([-1, -.5, 0, .5, 1].flatMap(y => [-1, -.5, 0, .5, 1].map(x => ({ x, y, distance: Math.hypot(x, y) })).filter(tap => tap.distance <= 1)));
function bokeh(position: { x: number; y: number }, access: import("../processing").ProcessingAccess, radius: number, ringAmount: number, ringSize: number, softness: number): Sample {
    if (radius === 0)
        return access.sample(0, position);
    const result = { r: 0, g: 0, b: 0, a: 0 }, ringHalfWidth = .25 * (1 + softness);
    let totalWeight = 0;
    for (const tap of bokehTaps) {
        const discWeight = 1 - softness * tap.distance;
        // Core Image documents a circular blur with intensified rings but not its aperture equation.
        // This portable aperture has a soft disc and a separately controlled normalized annular lobe.
        const ringWeight = ringAmount === 0 ? 0 : ringAmount * clamp(1 - Math.abs(tap.distance - ringSize) / ringHalfWidth);
        const weight = discWeight + ringWeight;
        if (weight === 0)
            continue;
        const sample = access.sample(0, { x: position.x + tap.x * radius, y: position.y + tap.y * radius });
        result.r += sample.r * weight;
        result.g += sample.g * weight;
        result.b += sample.b * weight;
        result.a += sample.a * weight;
        totalWeight += weight;
    }
    return { r: result.r / totalWeight, g: result.g / totalWeight, b: result.b / totalWeight, a: result.a / totalWeight };
}
spatial.bokehBlur = { category: "blur", inputs: 1, normalise: value => {
        const p = fields(value, ["radius", "ringAmount", "ringSize", "softness"]);
        // Apple's bokeh factory page demonstrates this softer-blur configuration; it is a portable baseline, not a verified native default.
        return { radius: number(p.radius, 20, 0, maximumBokehRadius), ringAmount: number(p.ringAmount, 0, 0, 1), ringSize: number(p.ringSize, .1, 0, 1), softness: number(p.softness, 1, 0, 1) };
    }, build: (inputs, p) => {
        const radius = p.radius as number, ringAmount = p.ringAmount as number, ringSize = p.ringSize as number, softness = p.softness as number;
        return processor("bokehBlur", p, expandedExtent(inputs[0]!.extent, radius), (position, access) => bokeh(position, access, radius, ringAmount, ringSize, softness), bounds => [expanded(bounds, radius + 1)]);
    } };
const noiseReductionTaps: readonly Tap[] = Object.freeze([-1, 0, 1].flatMap(y => [-1, 0, 1].map(x => ({ x, y, weight: 1 / 9 }))));
function noiseReduction(position: { x: number; y: number }, access: import("../processing").ProcessingAccess, noiseLevel: number, sharpness: number): Sample {
    const center = access.sample(0, position), source = straight(center), local = straight(weighted(noiseReductionTaps, position, access));
    const detail = Math.abs(luma(source) - luma(local));
    // Apple specifies the threshold rule but not its kernel. The portable CPU policy uses a uniform 3x3 local mean.
    const blurAmount = noiseLevel === 0 ? 0 : clamp(1 - detail / noiseLevel), edgeAmount = 1 - blurAmount;
    return premult({
        r: source.r + (local.r - source.r) * blurAmount + (source.r - local.r) * sharpness * edgeAmount,
        g: source.g + (local.g - source.g) * blurAmount + (source.g - local.g) * sharpness * edgeAmount,
        b: source.b + (local.b - source.b) * blurAmount + (source.b - local.b) * sharpness * edgeAmount,
        // The current/archived source describes colour-noise semantics only; retaining the center alpha is the portable policy.
        a: source.a,
    });
}
spatial.noiseReduction = { category: "blur", inputs: 1, normalise: value => {
        const p = fields(value, ["noiseLevel", "sharpness"]);
        return { noiseLevel: number(p.noiseLevel, .02, 0, 1), sharpness: number(p.sharpness, .4, 0, 4) };
    }, build: (inputs, p) => {
        const noiseLevel = p.noiseLevel as number, sharpness = p.sharpness as number;
        return processor("noiseReduction", p, inputs[0]!.extent, (position, access) => noiseReduction(position, access, noiseLevel, sharpness), bounds => [expanded(bounds, 1)]);
    } };
const zoomWeights = [1, 8, 28, 56, 70, 56, 28, 8, 1];
const zoomTaps = Object.freeze(zoomWeights.map((weight, index) => Object.freeze({ offset: -index / (zoomWeights.length - 1), weight: weight / 256 })));
const maximumZoomBlurAmount = 100;
spatial.zoomBlur = { category: "blur", inputs: 1, normalise: value => {
        const p = fields(value, ["center", "amount"]);
        return { center: point(p.center, { x: 150, y: 150 }), amount: number(p.amount, 20, 0, maximumZoomBlurAmount) };
    }, build: (inputs, p) => {
        const center = p.center as { x: number; y: number }, amount = p.amount as number;
        return processor("zoomBlur", p, expandedExtent(inputs[0]!.extent, amount), (position, access) => {
            const dx = position.x - center.x, dy = position.y - center.y, distance = Math.hypot(dx, dy);
            if (amount === 0 || distance === 0)
                return access.sample(0, position);
            const result = { r: 0, g: 0, b: 0, a: 0 }, ux = dx / distance, uy = dy / distance;
            // Fixed one-sided binomial samples model the inward exposure path of a zoom-in; work is nine source samples per output cell.
            for (const tap of zoomTaps) {
                const sample = access.sample(0, { x: position.x + ux * amount * tap.offset, y: position.y + uy * amount * tap.offset });
                result.r += sample.r * tap.weight;
                result.g += sample.g * tap.weight;
                result.b += sample.b * tap.weight;
                result.a += sample.a * tap.weight;
            }
            return result;
        }, bounds => [expanded(bounds, amount + 1)]);
    } };
const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1], sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
spatial.sobelGradients = { category: "stylize", inputs: 1, normalise: value => fields(value, []), build: (inputs, p) => processor("sobelGradients", p, inputs[0]!.extent, (position, access) => {
        const gx = { r: 0, g: 0, b: 0 }, gy = { r: 0, g: 0, b: 0 };
        let index = 0;
        for (let y = -1; y <= 1; y++)
            for (let x = -1; x <= 1; x++) {
                const value = straight(access.sample(0, { x: position.x + x, y: position.y + y })), wx = sobelX[index]!, wy = sobelY[index++]!;
                gx.r += value.r * wx;
                gx.g += value.g * wx;
                gx.b += value.b * wx;
                gy.r += value.r * wy;
                gy.g += value.g * wy;
                gy.b += value.b * wy;
            }
        const alpha = access.sample(0, position).a, magnitude = (x: number, y: number) => clamp(Math.hypot(x, y) / 4);
        // Apple documents component-wise Sobel only; magnitude scaling and alpha preservation are the portable CPU policy.
        return premult({ r: magnitude(gx.r, gy.r), g: magnitude(gx.g, gy.g), b: magnitude(gx.b, gy.b), a: alpha });
    }, bounds => [expanded(bounds, 1)]) };
spatial.convolution = { category: "convolution", inputs: 1, normalise: value => {
        const p = fields(value, ["width", "height", "weights", "bias", "rgbOnly"]), width = integer(p.width, NaN, 1, 9), height = integer(p.height, NaN, 1, 9);
        if (width % 2 === 0 || height % 2 === 0 || width * height > 81)
            throw new RangeError("Convolution requires odd bounded kernel dimensions.");
        if (p.rgbOnly !== undefined && typeof p.rgbOnly !== "boolean")
            throw new TypeError("rgbOnly must be boolean.");
        return { width, height, weights: tuple(p.weights, [], width * height), bias: number(p.bias, 0, -1, 1), rgbOnly: p.rgbOnly ?? false };
    }, build: (inputs, p) => {
        const width = p.width as number, height = p.height as number, weights = p.weights as readonly number[], taps: Tap[] = [];
        for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++)
                taps.push({ x: x - (width - 1) / 2, y: y - (height - 1) / 2, weight: weights[y * width + x]! });
        return processor("convolution", p, inputs[0]!.extent, (point, access) => {
            const c = weighted(taps, point, access), alpha = p.rgbOnly ? access.sample(0, point).a : c.a, bias = p.bias as number;
            return { r: c.r + bias * alpha, g: c.g + bias * alpha, b: c.b + bias * alpha, a: alpha };
        }, r => [expanded(r, Math.max(width, height) / 2)]);
    } };
spatial.unsharpMask = { category: "sharpen", inputs: 1, normalise: value => {
        const p = fields(value, ["sigma", "intensity"]);
        return { sigma: number(p.sigma, 1, 0, 4), intensity: number(p.intensity, .5, 0, 4) };
    }, build: (inputs, p) => {
        const taps = gaussian(p.sigma as number), radius = Math.ceil(3 * (p.sigma as number));
        return processor("unsharpMask", p, inputs[0]!.extent, (point, access) => {
            const a = access.sample(0, point), b = weighted(taps, point, access), amount = p.intensity as number;
            return { r: a.r + (a.r - b.r) * amount, g: a.g + (a.g - b.g) * amount, b: a.b + (a.b - b.b) * amount, a: a.a };
        }, r => [expanded(r, radius)]);
    } };
spatial.sharpenLuminance = { category: "sharpen", inputs: 1, normalise: value => {
        const p = fields(value, ["sharpness"]);
        return { sharpness: number(p.sharpness, .4, 0, 4) };
    }, build: (inputs, p) => processor("sharpenLuminance", p, inputs[0]!.extent, (point, access) => {
        const c = straight(access.sample(0, point));
        let neighbors = 0;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
            neighbors += luma(straight(access.sample(0, { x: point.x + dx!, y: point.y + dy! })));
        const delta = (luma(c) - neighbors / 4) * (p.sharpness as number);
        return premult({ r: c.r + delta, g: c.g + delta, b: c.b + delta, a: c.a });
    }, r => [expanded(r, 1)]) };
spatial.edges = { category: "stylize", inputs: 1, normalise: value => {
        const p = fields(value, ["intensity"]);
        return { intensity: number(p.intensity, 1, 0, 10) };
    }, build: (inputs, p) => processor("edges", p, inputs[0]!.extent, (point, access) => {
        const wx = [-1, 0, 1, -2, 0, 2, -1, 0, 1], wy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
        let gx = 0, gy = 0, i = 0;
        for (let y = -1; y <= 1; y++)
            for (let x = -1; x <= 1; x++) {
                const v = luma(straight(access.sample(0, { x: point.x + x, y: point.y + y })));
                gx += v * wx[i]!;
                gy += v * wy[i++]!;
            }
        const c = Math.hypot(gx, gy) * (p.intensity as number) / 4;
        return premult({ r: c, g: c, b: c, a: access.sample(0, point).a });
    }, r => [expanded(r, 1)]) };
