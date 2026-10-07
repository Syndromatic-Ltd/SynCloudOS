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

import { clampUnit, cmykaToRGBA, displayP3ToSRGB, hslaToRGBA, hsvaToRGBA, rgbaToCMYKA, rgbaToHSLA, rgbaToHSVA, sRGBToDisplayP3, srgbLinearChannel } from "./colourConversion";
import { parseGFXColourComponents } from "./colourParsing";
import type { GFXCMYKAComponents, GFXColourSpace, GFXHSLAComponents, GFXHSVAComponents, GFXRGBAComponents } from "./colourTypes";
const rounded = (value: number, digits = 6) => Number(value.toFixed(digits));
const byte = (value: number) => Math.round(clampUnit(value) * 255);
const encodeSRGBChannel = (x: number) => x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;

/**
 * Named-space conversion of unit components, returning unit-clamped
 * components. The single implementation behind `GFXColour.converting`, exposed
 * so per-sample FX paths can convert without allocating colour objects while
 * producing bit-identical values. Not part of the public GraphicsFX entry.
 */
export function convertColourComponents(components: Readonly<GFXRGBAComponents>, from: GFXColourSpace, to: GFXColourSpace): GFXRGBAComponents {
    const srgb = from === "display-p3" ? displayP3ToSRGB(components)
        : from === "linear-srgb" ? { r: encodeSRGBChannel(components.r), g: encodeSRGBChannel(components.g), b: encodeSRGBChannel(components.b), a: components.a }
            : components;
    if (to === "linear-srgb")
        return { r: clampUnit(srgbLinearChannel(srgb.r), "red"), g: clampUnit(srgbLinearChannel(srgb.g), "green"), b: clampUnit(srgbLinearChannel(srgb.b), "blue"), a: clampUnit(srgb.a, "alpha") };
    if (to === "srgb")
        return { r: clampUnit(srgb.r, "red"), g: clampUnit(srgb.g, "green"), b: clampUnit(srgb.b, "blue"), a: clampUnit(srgb.a, "alpha") };
    if (to === "grayscale") {
        const luminance = clampUnit(0.2126 * srgb.r + 0.7152 * srgb.g + 0.0722 * srgb.b, "red");
        return { r: luminance, g: luminance, b: luminance, a: clampUnit(srgb.a, "alpha") };
    }
    const p3 = sRGBToDisplayP3(srgb);
    return { r: clampUnit(p3.r, "red"), g: clampUnit(p3.g, "green"), b: clampUnit(p3.b, "blue"), a: clampUnit(p3.a, "alpha") };
}
export class GFXColour {
    private constructor(readonly space: GFXColourSpace, components: Readonly<GFXRGBAComponents>) {
        this.components = Object.freeze({
            r: clampUnit(components.r, "red"),
            g: clampUnit(components.g, "green"),
            b: clampUnit(components.b, "blue"),
            a: clampUnit(components.a, "alpha"),
        });
        Object.freeze(this);
    }
    readonly components: Readonly<GFXRGBAComponents>;
    static rgba(r: number, g: number, b: number, a = 1): GFXColour {
        return new GFXColour("srgb", { r, g, b, a });
    }
    static linearSRGB(r: number, g: number, b: number, a = 1): GFXColour {
        return new GFXColour("linear-srgb", { r, g, b, a });
    }
    static displayP3(r: number, g: number, b: number, a = 1): GFXColour {
        return new GFXColour("display-p3", { r, g, b, a });
    }
    static hsla(value: GFXHSLAComponents): GFXColour {
        return new GFXColour("srgb", hslaToRGBA(value));
    }
    static hsva(value: GFXHSVAComponents): GFXColour {
        return new GFXColour("srgb", hsvaToRGBA(value));
    }
    /** A device CMYK colour (see GFXCMYKAComponents), held as its sRGB equivalent. */
    static cmyka(value: GFXCMYKAComponents): GFXColour {
        return new GFXColour("srgb", cmykaToRGBA(value));
    }
    static grayscale(white: number, alpha = 1): GFXColour {
        return new GFXColour("grayscale", { r: white, g: white, b: white, a: alpha });
    }
    static parse(input: string): GFXColour {
        const parsed = parseGFXColourComponents(input);
        return new GFXColour(parsed.space, parsed.components);
    }
    get hsva(): GFXHSVAComponents {
        return Object.freeze(rgbaToHSVA(this.converting("srgb").components));
    }
    get hsla(): GFXHSLAComponents {
        return Object.freeze(rgbaToHSLA(this.converting("srgb").components));
    }
    /** Device CMYK components (see GFXCMYKAComponents). */
    get cmyka(): GFXCMYKAComponents {
        return Object.freeze(rgbaToCMYKA(this.converting("srgb").components));
    }
    converting(to: GFXColourSpace): GFXColour {
        if (!["srgb", "display-p3", "grayscale", "linear-srgb"].includes(to))
            throw new TypeError("Unsupported colour space or profile.");
        if (to === this.space)
            return this;
        return new GFXColour(to, convertColourComponents(this.components, this.space, to));
    }
    withAlpha(alpha: number): GFXColour {
        return new GFXColour(this.space, { ...this.components, a: alpha });
    }
    equals(other: GFXColour, epsilon = 1 / 510): boolean {
        if (!(other instanceof GFXColour))
            return false;
        const first = this.converting("srgb").components;
        const second = other.converting("srgb").components;
        return (["r", "g", "b", "a"] as const).every((key) => Math.abs(first[key] - second[key]) <= epsilon);
    }
    toCSS(): string {
        if (this.space === "display-p3") {
            const { r, g, b, a } = this.components;
            return `color(display-p3 ${rounded(r)} ${rounded(g)} ${rounded(b)}${a === 1 ? "" : ` / ${rounded(a)}`})`;
        }
        const { r, g, b, a } = this.converting("srgb").components;
        return `rgb(${byte(r)} ${byte(g)} ${byte(b)}${a === 1 ? "" : ` / ${rounded(a)}`})`;
    }
    toHex(options: Readonly<{
        includeAlpha?: boolean;
    }> = {}): string {
        const { r, g, b, a } = this.converting("srgb").components;
        const parts = [r, g, b, ...(options.includeAlpha ? [a] : [])];
        return `#${parts.map((value) => byte(value).toString(16).padStart(2, "0")).join("")}`;
    }
}
/** Public value-level parser; raw tokenizer output stays an internal implementation detail. */
export function parseGFXColour(input: string): GFXColour {
    return GFXColour.parse(input);
}
export function compositeColour(foreground: GFXColour, background: GFXColour): GFXColour {
    const fg = foreground.converting("srgb").components;
    const bg = background.converting("srgb").components;
    if (bg.a !== 1)
        throw new TypeError("The composite background must be opaque.");
    const alpha = fg.a + bg.a * (1 - fg.a);
    return GFXColour.rgba((fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / alpha, (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / alpha, (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / alpha, alpha);
}
export function relativeLuminance(colour: GFXColour, background?: GFXColour): number {
    let resolved = colour;
    if (colour.components.a !== 1) {
        if (!background)
            throw new TypeError("A background is required for translucent colour luminance.");
        resolved = compositeColour(colour, background);
    }
    const { r, g, b } = resolved.converting("srgb").components;
    return 0.2126 * srgbLinearChannel(r) + 0.7152 * srgbLinearChannel(g) + 0.0722 * srgbLinearChannel(b);
}
export function contrastRatio(foreground: GFXColour, background: GFXColour): number {
    if (background.components.a !== 1)
        throw new TypeError("The contrast background must be opaque.");
    const first = relativeLuminance(foreground, background);
    const second = relativeLuminance(background);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
export function bestContrastingColour(background: GFXColour, candidates: readonly GFXColour[]): GFXColour | null {
    if (!Array.isArray(candidates))
        throw new TypeError("Colour candidates must be a dense data-only array.");
    let best: GFXColour | null = null;
    let score = -Infinity;
    for (let index = 0; index < candidates.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(candidates, index);
        if (!descriptor || !("value" in descriptor) || !(descriptor.value instanceof GFXColour))
            throw new TypeError("Colour candidates must be a dense data-only array.");
        const candidate = descriptor.value;
        const candidateScore = contrastRatio(candidate, background);
        if (candidateScore > score) {
            best = candidate;
            score = candidateScore;
        }
    }
    return best;
}
