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

import type { GFXCMYKAComponents, GFXHSLAComponents, GFXHSVAComponents, GFXRGBAComponents } from "./colourTypes";
export function finite(value: number, label: string): number {
    if (!Number.isFinite(value))
        throw new TypeError(`${label} must be finite.`);
    return value;
}
export function clampUnit(value: number, label = "component"): number {
    return Math.min(1, Math.max(0, finite(value, label)));
}
export function normalizeHue(value: number): number {
    const hue = finite(value, "hue") % 360;
    return hue < 0 ? hue + 360 : hue;
}
export function hslaToRGBA(value: GFXHSLAComponents): GFXRGBAComponents {
    const h = normalizeHue(value.h) / 360;
    const s = clampUnit(value.s, "saturation");
    const l = clampUnit(value.l, "lightness");
    const a = clampUnit(value.a, "alpha");
    if (s === 0)
        return { r: l, g: l, b: l, a };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (offset: number) => {
        let t = h + offset;
        if (t < 0)
            t += 1;
        if (t > 1)
            t -= 1;
        if (t < 1 / 6)
            return p + (q - p) * 6 * t;
        if (t < 1 / 2)
            return q;
        if (t < 2 / 3)
            return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    return { r: channel(1 / 3), g: channel(0), b: channel(-1 / 3), a };
}
export function hsvaToRGBA(value: GFXHSVAComponents): GFXRGBAComponents {
    const h = normalizeHue(value.h) / 60;
    const s = clampUnit(value.s, "saturation");
    const v = clampUnit(value.v, "value");
    const a = clampUnit(value.a, "alpha");
    const chroma = v * s;
    const x = chroma * (1 - Math.abs((h % 2) - 1));
    const match = v - chroma;
    const sextant = Math.floor(h) % 6;
    const rgb = sextant === 0 ? [chroma, x, 0]
        : sextant === 1 ? [x, chroma, 0]
            : sextant === 2 ? [0, chroma, x]
                : sextant === 3 ? [0, x, chroma]
                    : sextant === 4 ? [x, 0, chroma]
                        : [chroma, 0, x];
    return { r: rgb[0] + match, g: rgb[1] + match, b: rgb[2] + match, a };
}
/** CSS Color 5 device-cmyk(): each channel is what the ink and black leave of white. */
export function cmykaToRGBA(value: GFXCMYKAComponents): GFXRGBAComponents {
    const c = clampUnit(value.c, "cyan");
    const m = clampUnit(value.m, "magenta");
    const y = clampUnit(value.y, "yellow");
    const k = clampUnit(value.k, "black");
    return { r: (1 - c) * (1 - k), g: (1 - m) * (1 - k), b: (1 - y) * (1 - k), a: clampUnit(value.a, "alpha") };
}
/** The naive inverse: as much black as the colour allows, the rest in ink. */
export function rgbaToCMYKA({ r, g, b, a }: GFXRGBAComponents): GFXCMYKAComponents {
    const k = 1 - Math.max(r, g, b);
    if (k >= 1)
        return { c: 0, m: 0, y: 0, k: 1, a };
    return { c: (1 - r - k) / (1 - k), m: (1 - g - k) / (1 - k), y: (1 - b - k) / (1 - k), k, a };
}
export function rgbaToHSLA({ r, g, b, a }: GFXRGBAComponents): GFXHSLAComponents {
    const maximum = Math.max(r, g, b);
    const minimum = Math.min(r, g, b);
    const delta = maximum - minimum;
    const l = (maximum + minimum) / 2;
    const { h } = rgbaToHSVA({ r, g, b, a });
    return { h, s: delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1)), l, a };
}
export function rgbaToHSVA({ r, g, b, a }: GFXRGBAComponents): GFXHSVAComponents {
    const maximum = Math.max(r, g, b);
    const minimum = Math.min(r, g, b);
    const delta = maximum - minimum;
    let hue = 0;
    if (delta !== 0) {
        if (maximum === r)
            hue = 60 * (((g - b) / delta) % 6);
        else if (maximum === g)
            hue = 60 * ((b - r) / delta + 2);
        else
            hue = 60 * ((r - g) / delta + 4);
    }
    return { h: normalizeHue(hue), s: maximum === 0 ? 0 : delta / maximum, v: maximum, a };
}
function decode(channel: number): number {
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}
function encode(channel: number): number {
    return channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
}
const P3_TO_XYZ = [
    [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
    [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
    [0, 0.04511338185890264, 1.043944368900976],
] as const;
const XYZ_TO_SRGB = [
    [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
    [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
    [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
] as const;
const SRGB_TO_XYZ = [
    [0.4123907992659595, 0.35758433938387796, 0.1804807884018343],
    [0.21263900587151036, 0.7151686787677559, 0.07219231536073371],
    [0.01933081871559185, 0.11919477979462599, 0.9505321522496606],
] as const;
const XYZ_TO_P3 = [
    [2.493496911941425, -0.9313836179191239, -0.40271078445071684],
    [-0.8294889695615747, 1.7626640603183463, 0.023624685841943577],
    [0.03584583024378447, -0.07617238926804182, 0.9568845240076872],
] as const;
function multiply(matrix: readonly (readonly number[])[], vector: readonly number[]): [
    number,
    number,
    number
] {
    return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0)) as [
        number,
        number,
        number
    ];
}
export function displayP3ToSRGB(value: GFXRGBAComponents): GFXRGBAComponents {
    const linearP3 = [decode(value.r), decode(value.g), decode(value.b)];
    const linearSRGB = multiply(XYZ_TO_SRGB, multiply(P3_TO_XYZ, linearP3));
    return Object.freeze({
        r: clampUnit(encode(linearSRGB[0])),
        g: clampUnit(encode(linearSRGB[1])),
        b: clampUnit(encode(linearSRGB[2])),
        a: value.a,
    });
}
export function sRGBToDisplayP3(value: GFXRGBAComponents): GFXRGBAComponents {
    const linearSRGB = [decode(value.r), decode(value.g), decode(value.b)];
    const linearP3 = multiply(XYZ_TO_P3, multiply(SRGB_TO_XYZ, linearSRGB));
    return Object.freeze({
        r: clampUnit(encode(linearP3[0])),
        g: clampUnit(encode(linearP3[1])),
        b: clampUnit(encode(linearP3[2])),
        a: value.a,
    });
}
export function srgbLinearChannel(channel: number): number {
    return decode(clampUnit(channel));
}
