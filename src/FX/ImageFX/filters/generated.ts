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

import { finiteExtent, infiniteExtent, unionExtent } from "../extent";
import { namedColourTransform } from "../../GraphicsFX/namedColourTransform";
import type { GFXColourSpace } from "../../GraphicsFX/colourTypes";
import { fields, number, integer, colour, colourSample, point, rect, processor, mix, luma, straight, premult, clamp, finiteInput, type Definition } from "./common";
const white = [1, 1, 1, 1], black = [0, 0, 0, 1];
export const generated: Record<string, Definition> = {};
const generatedColourSpaces = Object.freeze(["linear-srgb", "srgb", "display-p3", "grayscale"] as const);

function requiredGeneratedColourSpace(value: unknown): GFXColourSpace {
    if (typeof value !== "string" || !generatedColourSpaces.includes(value as typeof generatedColourSpaces[number]))
        throw new TypeError("A supported colorSpace is required.");
    return value as GFXColourSpace;
}

function hsvRGB(hue: number, saturation: number, value: number): Readonly<{ r: number; g: number; b: number }> {
    const h = ((hue % 1) + 1) % 1 * 6, chroma = value * saturation, x = chroma * (1 - Math.abs(h % 2 - 1)), m = value - chroma;
    const base = h < 1 ? [chroma, x, 0] : h < 2 ? [x, chroma, 0] : h < 3 ? [0, chroma, x] : h < 4 ? [0, x, chroma] : h < 5 ? [x, 0, chroma] : [chroma, 0, x];
    return Object.freeze({ r: base[0]! + m, g: base[1]! + m, b: base[2]! + m });
}

function gradientNoise(x: number, y: number): number {
    let value = Math.imul(Math.floor(x * 16) | 0, 0x45d9f3b) ^ Math.imul(Math.floor(y * 16) | 0, 0x119de1f3);
    value = Math.imul(value ^ value >>> 16, 0x45d9f3b);
    value ^= value >>> 16;
    return (value >>> 0) / 0xffffffff - .5;
}
for (const name of ["checkerboard", "stripes"]) {
    generated[name] = { category: "generator", inputs: 0, normalise: value => {
            const p = fields(value, ["center", "width", "colour0", "colour1"]);
            return { center: point(p.center), width: number(p.width, 80, .001, 1e5), colour0: colour(p.colour0, white), colour1: colour(p.colour1, black) };
        }, build: (_inputs, p) => processor(name, p, infiniteExtent, position => {
            const center = p.center as {
                x: number;
                y: number;
            }, width = p.width as number, parity = (Math.floor((position.x - center.x) / width) + (name === "checkerboard" ? Math.floor((position.y - center.y) / width) : 0)) % 2;
            return colourSample((parity === 0 ? p.colour0 : p.colour1) as readonly number[]);
        }, () => []) };
}
generated.random = { category: "generator", inputs: 0, normalise: value => {
        const p = fields(value, ["seed"]);
        return { seed: integer(p.seed, 0, 0, 0xffffffff) };
    }, build: (_inputs, p) => processor("random", p, infiniteExtent, position => {
        const hash = (salt: number) => {
            let n = Math.imul(Math.floor(position.x) | 0, 374761393) ^ Math.imul(Math.floor(position.y) | 0, 668265263) ^ (p.seed as number) ^ salt;
            n = Math.imul(n ^ (n >>> 13), 1274126177);
            return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff;
        };
        return { r: hash(17), g: hash(31), b: hash(47), a: 1 };
    }, () => []) };
generated.roundedRectangle = { category: "generator", inputs: 0, normalise: value => {
        const p = fields(value, ["rect", "radius", "colour"]);
        return { rect: rect(p.rect), radius: number(p.radius, 10, 0, 1e5), colour: colour(p.colour, white) };
    }, build: (_inputs, p) => {
        const r = p.rect as import("../../GraphicsFX/GFXGeometry").GFXRect, radius = Math.min(p.radius as number, r.width / 2, r.height / 2);
        return processor("roundedRectangle", p, finiteExtent(r), position => {
            const dx = Math.max(0, Math.abs(position.x - r.x - r.width / 2) - (r.width / 2 - radius)), dy = Math.max(0, Math.abs(position.y - r.y - r.height / 2) - (r.height / 2 - radius));
            return Math.hypot(dx, dy) <= radius ? colourSample(p.colour as readonly number[]) : { r: 0, g: 0, b: 0, a: 0 };
        }, () => []);
    } };
for (const name of ["linearGradient", "smoothLinearGradient", "radialGradient", "gaussianGradient"]) {
    generated[name] = { category: "gradient", inputs: 0, normalise: value => {
            const linear = name.includes("Linear") || name === "linearGradient", p = fields(value, linear ? ["point0", "point1", "colour0", "colour1"] : name === "radialGradient" ? ["center", "radius0", "radius1", "colour0", "colour1"] : ["center", "radius", "colour0", "colour1"]);
            const common = { colour0: colour(p.colour0, white), colour1: colour(p.colour1, black) };
            if (linear) {
                const a = point(p.point0), b = point(p.point1, { x: 200, y: 200 });
                if (a.x === b.x && a.y === b.y)
                    throw new RangeError("Gradient points must differ.");
                return { ...common, point0: a, point1: b };
            }
            if (name === "radialGradient") {
                const radius0 = number(p.radius0, 5, 0, 1e5), radius1 = number(p.radius1, 100, .001, 1e5);
                if (radius1 <= radius0)
                    throw new RangeError("Gradient outer radius must exceed inner radius.");
                return { ...common, center: point(p.center), radius0, radius1 };
            }
            return { ...common, center: point(p.center), radius: number(p.radius, 300, .001, 1e5) };
        }, build: (_inputs, p) => processor(name, p, infiniteExtent, position => {
            let t: number;
            if (name === "linearGradient" || name === "smoothLinearGradient") {
                const a = p.point0 as {
                    x: number;
                    y: number;
                }, b = p.point1 as {
                    x: number;
                    y: number;
                }, dx = b.x - a.x, dy = b.y - a.y;
                t = clamp(((position.x - a.x) * dx + (position.y - a.y) * dy) / (dx * dx + dy * dy));
                if (name === "smoothLinearGradient")
                    t = t * t * (3 - 2 * t);
            }
            else {
                const c = p.center as {
                    x: number;
                    y: number;
                }, distance = Math.hypot(position.x - c.x, position.y - c.y);
                t = name === "radialGradient" ? clamp((distance - (p.radius0 as number)) / ((p.radius1 as number) - (p.radius0 as number))) : 1 - Math.exp(-distance * distance / (2 * (p.radius as number) ** 2));
            }
            return mix(colourSample(p.colour0 as readonly number[]), colourSample(p.colour1 as readonly number[]), t);
        }, () => []) };
}

generated.hueSaturationValueGradient = { category: "gradient", inputs: 0, normalise: value => {
        const p = fields(value, ["colorSpace", "dither", "radius", "softness", "value"]);
        if (p.colorSpace === undefined || p.dither === undefined || p.radius === undefined || p.softness === undefined || p.value === undefined)
            throw new TypeError("HSV gradient colorSpace, dither, radius, softness and value are required.");
        return Object.freeze({ colorSpace: requiredGeneratedColourSpace(p.colorSpace), dither: number(p.dither, NaN, 0, 1), radius: number(p.radius, NaN, .001, 1e5), softness: number(p.softness, NaN, 0, 1), value: number(p.value, NaN, 0, 1) });
    }, build: (_inputs, p) => {
        const radius = p.radius as number, extent = finiteExtent({ x: -radius, y: -radius, width: radius * 2, height: radius * 2 }), space = p.colorSpace as GFXColourSpace;
        return processor("hueSaturationValueGradient", p, extent, position => {
            const distance = Math.hypot(position.x, position.y), normalized = clamp(distance / radius), softness = p.softness as number, saturation = softness === 0 ? normalized : normalized * normalized * (3 - 2 * normalized) * (1 - softness) + normalized * softness, hue = (Math.atan2(-position.y, position.x) / (Math.PI * 2) + 1) % 1, noise = gradientNoise(position.x, position.y) * (p.dither as number) / 255, encoded = hsvRGB(hue, clamp(saturation + noise), clamp((p.value as number) + noise)), converted = namedColourTransform(space, "linear-srgb", "clip", "clip").apply({ ...encoded, a: 1 });
            return premult(converted);
        }, () => []);
    } };
for (const name of ["dotScreen", "lineScreen", "circularScreen"]) {
    generated[name] = { category: "halftone", inputs: 1, normalise: value => {
            const p = fields(value, name === "circularScreen" ? ["center", "width"] : ["center", "width", "angle"]);
            return { center: point(p.center), width: number(p.width, 6, .1, 1e5), ...(name === "circularScreen" ? {} : { angle: number(p.angle, 0, -Math.PI * 2, Math.PI * 2) }) };
        }, build: (inputs, p) => processor(name, p, inputs[0]!.extent, (position, access) => {
            const c = straight(access.sample(0, position)), center = p.center as {
                x: number;
                y: number;
            }, dx = position.x - center.x, dy = position.y - center.y, w = p.width as number, angle = (p.angle as number) ?? 0, x = (dx * Math.cos(angle) + dy * Math.sin(angle)) / w, y = (-dx * Math.sin(angle) + dy * Math.cos(angle)) / w, coverage = 1 - luma(c), fraction = (x: number) => x - Math.floor(x);
            const black = coverage >= 1 ? true : coverage <= 0 ? false : name === "dotScreen" ? Math.hypot(fraction(x) - .5, fraction(y) - .5) <= Math.sqrt(coverage / Math.PI) : name === "lineScreen" ? fraction(x) < coverage : fraction(Math.hypot(dx, dy) / w) < coverage;
            return premult({ r: black ? 0 : 1, g: black ? 0 : 1, b: black ? 0 : 1, a: c.a });
        }, r => [r]) };
}
for (const name of ["dissolve", "swipe"]) {
    generated[name] = { category: "transition", inputs: 2, normalise: value => {
            const p = fields(value, name === "dissolve" ? ["time"] : ["time", "angle", "width"]);
            return { time: number(p.time, 0, 0, 1), ...(name === "swipe" ? { angle: number(p.angle, 0, -Math.PI * 2, Math.PI * 2), width: number(p.width, 0, 0, 1e5) } : {}) };
        }, build: (inputs, p) => {
            const extent = unionExtent(inputs[0]!.extent, inputs[1]!.extent);
            if (name === "swipe") {
                finiteInput(inputs[0]!);
                finiteInput(inputs[1]!);
            }
            return processor(name, p, extent, (position, access) => {
                let t = p.time as number;
                if (name === "swipe" && t > 0 && t < 1 && extent.kind === "finite") {
                    const r = extent.rect, c = Math.cos(p.angle as number), s = Math.sin(p.angle as number), values = [r.x * c + r.y * s, (r.x + r.width) * c + r.y * s, r.x * c + (r.y + r.height) * s, (r.x + r.width) * c + (r.y + r.height) * s], min = Math.min(...values), max = Math.max(...values), edge = min + (max - min) * t, projection = position.x * c + position.y * s, width = p.width as number;
                    t = width ? clamp(.5 + (edge - projection) / width) : projection < edge ? 1 : 0;
                }
                return mix(access.sample(0, position), access.sample(1, position), t);
            }, r => [r, r]);
        } };
}
