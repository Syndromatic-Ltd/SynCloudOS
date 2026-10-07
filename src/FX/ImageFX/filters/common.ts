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

import { normaliseRect, normalisePoint, normaliseAffineTransform, type GFXRect, type GFXPoint, type GFXAffineTransform } from "../../GraphicsFX/GFXGeometry";
import type { IFXImage } from "../IFXImage";
import type { ImageProcessor, ProcessingAccess, ProcessingPreparationAccess } from "../processing";
import type { IFXPremultipliedSample as Sample } from "../IFXSampler";
import { finiteExtent, type IFXExtent } from "../extent";
export const clamp = (v: number) => Math.max(0, Math.min(1, v));
export const transparent: Sample = Object.freeze({ r: 0, g: 0, b: 0, a: 0 });
export const mix = (a: Sample, b: Sample, t: number): Sample => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: a.a + (b.a - a.a) * t });
export const straight = (v: Sample) => ({ r: v.a ? v.r / v.a : 0, g: v.a ? v.g / v.a : 0, b: v.a ? v.b / v.a : 0, a: v.a });
export const premult = (v: Sample): Sample => ({ r: clamp(v.r) * clamp(v.a), g: clamp(v.g) * clamp(v.a), b: clamp(v.b) * clamp(v.a), a: clamp(v.a) });
export const luma = (v: Sample) => .2126 * v.r + .7152 * v.g + .0722 * v.b;
export function fields(value: unknown, allowed: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) || Object.getOwnPropertySymbols(value).length)
        throw new TypeError("Filter parameters must be plain data.");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.keys(descriptors).some(key => !allowed.includes(key) || !("value" in descriptors[key]!)))
        throw new TypeError("Unknown or executable filter parameter.");
    return Object.fromEntries(Object.keys(descriptors).map(key => [key, descriptors[key]!.value]));
}
export function number(value: unknown, fallback: number, min = -1e6, max = 1e6): number {
    const n = value === undefined ? fallback : value;
    if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max)
        throw new RangeError("Filter numeric parameter exceeds its range.");
    return n;
}
export function integer(value: unknown, fallback: number, min: number, max: number): number {
    const n = number(value, fallback, min, max);
    if (!Number.isInteger(n))
        throw new RangeError("Integral filter parameter required.");
    return n;
}
export function tuple(value: unknown, defaultValue: readonly number[], length = defaultValue.length): readonly number[] {
    const input = value === undefined ? defaultValue : value;
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length !== length || length > 81)
        throw new TypeError("Filter vector has invalid length.");
    const result = [];
    for (let i = 0; i < length; i++) {
        const d = Object.getOwnPropertyDescriptor(input, String(i));
        if (!d || !("value" in d))
            throw new TypeError("Filter vectors must contain data.");
        result.push(number(d.value, 0));
    }
    return Object.freeze(result);
}
export function colour(value: unknown, fallback: readonly number[]): readonly number[] {
    const c = tuple(value, fallback, 4);
    c.forEach(v => number(v, 0, 0, 1));
    return c;
}
export const colourSample = (c: readonly number[]): Sample => ({ r: c[0]! * c[3]!, g: c[1]! * c[3]!, b: c[2]! * c[3]!, a: c[3]! });
export function point(value: unknown, fallback: GFXPoint = { x: 0, y: 0 }): GFXPoint {
    if (value === undefined)
        return Object.freeze({ ...fallback });
    const p = fields(value, ["x", "y"]);
    return normalisePoint({ x: number(p.x, NaN), y: number(p.y, NaN) });
}
export function rect(value: unknown): GFXRect {
    const r = fields(value, ["x", "y", "width", "height"]);
    return normaliseRect({ x: number(r.x, NaN), y: number(r.y, NaN), width: number(r.width, NaN, 0), height: number(r.height, NaN, 0) });
}
export function transform(value: unknown): GFXAffineTransform {
    if (value === undefined)
        return Object.freeze({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
    const r = fields(value, ["a", "b", "c", "d", "tx", "ty"]);
    return normaliseAffineTransform({ a: number(r.a, NaN), b: number(r.b, NaN), c: number(r.c, NaN), d: number(r.d, NaN), tx: number(r.tx, NaN), ty: number(r.ty, NaN) });
}
export function expanded(r: GFXRect, radius: number): GFXRect {
    return normaliseRect({ x: r.x - radius, y: r.y - radius, width: r.width + 2 * radius, height: r.height + 2 * radius });
}
export function expandedExtent(e: IFXExtent, radius: number): IFXExtent {
    return e.kind === "infinite" ? e : finiteExtent(expanded(e.rect, radius));
}
export function finiteInput(input: IFXImage): GFXRect {
    if (input.extent.kind !== "finite" || input.extent.rect.width <= 0 || input.extent.rect.height <= 0)
        throw new RangeError("Filter requires nonempty finite input.");
    return input.extent.rect;
}
export function processor(name: string, parameters: Readonly<Record<string, unknown>>, extent: IFXExtent, evaluate: (point: GFXPoint, access: ProcessingAccess) => Sample, regions: (bounds: GFXRect) => readonly GFXRect[], prepare?: (access: ProcessingPreparationAccess) => Promise<void>, preparation?: ImageProcessor["preparation"]): ImageProcessor {
    return Object.freeze({ name, parameters: Object.freeze(parameters), extent, evaluate, regions, prepare, preparation });
}
export type Definition = {
    readonly category: import("../filterTypes").IFXFilterCategory;
    readonly inputs: number;
    normalise(value: unknown): Readonly<Record<string, unknown>>;
    build(inputs: readonly IFXImage[], parameters: Readonly<Record<string, unknown>>): ImageProcessor;
};
