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

import { hslaToRGBA } from "./colourConversion";
import { GFXColourParseError, type GFXColourSpace, type GFXRGBAComponents } from "./colourTypes";
export interface ParsedGFXColour {
    readonly space: GFXColourSpace;
    readonly components: GFXRGBAComponents;
}
const names: Readonly<Record<string, string>> = Object.freeze(Object.assign(Object.create(null), {
    black: "#000000",
    white: "#ffffff",
    red: "#ff0000",
    green: "#008000",
    blue: "#0000ff",
    transparent: "#00000000",
}));
const numberToken = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%?$/;
function numeric(token: string): number | null {
    if (!numberToken.test(token))
        return null;
    const value = Number(token.endsWith("%") ? token.slice(0, -1) : token);
    return Number.isFinite(value) ? value : null;
}
function component(token: string): number | null {
    const value = numeric(token);
    if (value === null)
        return null;
    if (token.endsWith("%"))
        return value >= 0 && value <= 100 ? value / 100 : null;
    return value >= 0 && value <= 255 ? value / 255 : null;
}
function alpha(token: string | undefined): number | null {
    if (token === undefined)
        return 1;
    const value = numeric(token);
    if (value === null)
        return null;
    if (token.endsWith("%"))
        return value >= 0 && value <= 100 ? value / 100 : null;
    return value >= 0 && value <= 1 ? value : null;
}
function tokens(body: string): string[] | null {
    const trimmed = body.trim();
    if (!trimmed)
        return null;
    if (trimmed.includes(",")) {
        if (trimmed.includes("/"))
            return null;
        const values = trimmed.split(/\s*,\s*/);
        return values.some((value) => !value || /\s/.test(value.trim())) ? null : values;
    }
    const slash = trimmed.split(/\s*\/\s*/);
    if (slash.length > 2 || slash.some((value) => !value))
        return null;
    const channels = slash[0].trim().split(/\s+/);
    return slash.length === 2 ? [...channels, slash[1].trim()] : channels;
}
export function parseGFXColourComponents(input: unknown): ParsedGFXColour {
    if (typeof input !== "string")
        throw new GFXColourParseError("<non-string>", "syntax");
    const original = input;
    const text = input.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(names, text))
        return parseGFXColourComponents(names[text]);
    const hexadecimal = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(text);
    if (hexadecimal) {
        let digits = hexadecimal[1];
        if (digits.length <= 4)
            digits = [...digits].map((digit) => digit + digit).join("");
        if (digits.length === 6)
            digits += "ff";
        return { space: "srgb", components: {
                r: Number.parseInt(digits.slice(0, 2), 16) / 255,
                g: Number.parseInt(digits.slice(2, 4), 16) / 255,
                b: Number.parseInt(digits.slice(4, 6), 16) / 255,
                a: Number.parseInt(digits.slice(6, 8), 16) / 255,
            } };
    }
    const rgb = /^rgba?\((.*)\)$/.exec(text);
    if (rgb) {
        const parts = tokens(rgb[1]);
        if (parts && (parts.length === 3 || parts.length === 4)) {
            const values = [component(parts[0]), component(parts[1]), component(parts[2]), alpha(parts[3])];
            if (values.every((value) => value !== null)) {
                return { space: "srgb", components: { r: values[0]!, g: values[1]!, b: values[2]!, a: values[3]! } };
            }
        }
    }
    const hsl = /^hsla?\((.*)\)$/.exec(text);
    if (hsl) {
        const parts = tokens(hsl[1]);
        const hueToken = parts?.[0]?.replace(/deg$/, "") ?? "";
        const hue = numeric(hueToken);
        const saturationValue = parts?.[1]?.endsWith("%") ? numeric(parts[1]) : null;
        const lightnessValue = parts?.[2]?.endsWith("%") ? numeric(parts[2]) : null;
        const saturation = saturationValue === null ? null : saturationValue / 100;
        const lightness = lightnessValue === null ? null : lightnessValue / 100;
        const opacity = alpha(parts?.[3]);
        if (parts && parts.length >= 3 && parts.length <= 4 && hue !== null && saturation !== null && lightness !== null && saturation >= 0 && saturation <= 1 && lightness >= 0 && lightness <= 1 && opacity !== null) {
            return { space: "srgb", components: hslaToRGBA({ h: hue, s: saturation, l: lightness, a: opacity! }) };
        }
    }
    const colour = /^color\(\s*([\w-]+)\s+(.+)\)$/.exec(text);
    if (colour) {
        if (colour[1] !== "display-p3")
            throw new GFXColourParseError(original, "unsupported-space");
        const parts = tokens(colour[2]);
        if (parts && (parts.length === 3 || parts.length === 4)) {
            const values = parts.map((part, index) => index === 3 ? alpha(part) : numeric(part));
            if (values.every((value) => value !== null && value >= 0 && value <= 1))
                return { space: "display-p3", components: { r: values[0]!, g: values[1]!, b: values[2]!, a: values[3] ?? 1 } };
        }
    }
    throw new GFXColourParseError(original, "syntax");
}
