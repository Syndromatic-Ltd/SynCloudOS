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

import { GFXColour } from "./GFXColour";
import { GFXIdentityTransform, invertTransform, normaliseAffineTransform, normaliseRect, transformPoint, type GFXAffineTransform, type GFXPoint, type GFXRect } from "./GFXGeometry";
import type { GFXGradientGeometry, GFXGradientStop } from "./graphicsTypes";
export class GFXGradient {
    readonly stops: readonly GFXGradientStop[];
    readonly geometry: GFXGradientGeometry;
    readonly units: "objectBoundingBox" | "userSpaceOnUse";
    readonly transform: GFXAffineTransform;
    readonly #inverse: GFXAffineTransform;
    constructor(stops: readonly GFXGradientStop[], geometry: GFXGradientGeometry = { kind: "linear", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }, options: Readonly<{
        units?: "objectBoundingBox" | "userSpaceOnUse";
        transform?: GFXAffineTransform;
    }> = {}) {
        if (!options || typeof options !== "object" || Object.getPrototypeOf(options) !== Object.prototype)
            throw new TypeError("Gradient options must be a plain data record.");
        const fields = Object.getOwnPropertyDescriptors(options);
        if (Object.keys(fields).some(key => !["units", "transform"].includes(key) || !("value" in fields[key]!)) || Object.getOwnPropertySymbols(options).length)
            throw new TypeError("Invalid gradient option fields.");
        this.units = fields.units?.value ?? "objectBoundingBox";
        if (this.units !== "objectBoundingBox" && this.units !== "userSpaceOnUse")
            throw new TypeError("Unsupported gradient coordinate units.");
        this.transform = normaliseAffineTransform(fields.transform?.value ?? GFXIdentityTransform);
        this.#inverse = invertTransform(this.transform);
        if (!Array.isArray(stops) || Object.getPrototypeOf(stops) !== Array.prototype || stops.length < 1 || stops.length > 64 || Object.getOwnPropertySymbols(stops).length)
            throw new RangeError("A gradient requires a plain dense array of 1–64 stops.");
        const slots = Object.getOwnPropertyDescriptors(stops);
        this.stops = Object.freeze(Array.from({ length: stops.length }, (_, index) => {
            const slot = slots[index];
            if (!slot || !Object.prototype.hasOwnProperty.call(slot, "value"))
                throw new TypeError("Gradient stop slots must be data properties.");
            const stop = slot.value;
            if (!stop || typeof stop !== "object" || (Object.getPrototypeOf(stop) !== Object.prototype && Object.getPrototypeOf(stop) !== null) || Object.getOwnPropertySymbols(stop).length)
                throw new TypeError("Gradient stop is invalid.");
            const descriptors = Object.getOwnPropertyDescriptors(stop);
            if (Object.keys(descriptors).length !== 2 || !descriptors.offset || !descriptors.colour || !Object.prototype.hasOwnProperty.call(descriptors.offset, "value") || !Object.prototype.hasOwnProperty.call(descriptors.colour, "value"))
                throw new TypeError("Gradient stops must use exact data properties.");
            const offset = descriptors.offset.value;
            const colour = descriptors.colour.value;
            if (typeof offset !== "number" || !Number.isFinite(offset) || offset < 0 || offset > 1)
                throw new RangeError("Gradient offset must be between zero and one.");
            if (!(colour instanceof GFXColour))
                throw new TypeError("Gradient colours must be canonical GFXColour values.");
            return { offset, colour, index };
        }).sort((a, b) => a.offset - b.offset || a.index - b.index).map(({ offset, colour }) => Object.freeze({ offset, colour })));
        if (!geometry || typeof geometry !== "object" || (Object.getPrototypeOf(geometry) !== Object.prototype && Object.getPrototypeOf(geometry) !== null) || Object.getOwnPropertySymbols(geometry).length)
            throw new TypeError("Gradient geometry must be a plain record.");
        const geometryDescriptors = Object.getOwnPropertyDescriptors(geometry);
        const read = (key: string) => {
            const descriptor = geometryDescriptors[key];
            if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value"))
                throw new TypeError("Gradient geometry fields must be data.");
            return descriptor.value;
        };
        const kind = read("kind");
        const geometryKeys = Object.keys(geometryDescriptors);
        if (kind === "linear" && geometryKeys.length === 3 && geometryKeys.every((key) => ["kind", "start", "end"].includes(key)))
            this.geometry = Object.freeze({ kind: "linear", start: point(read("start")), end: point(read("end")) });
        else if (kind === "radial") {
            if (geometryKeys.length !== 3 || geometryKeys.some((key) => !["kind", "centre", "radius"].includes(key)))
                throw new TypeError("Gradient geometry has unsupported fields.");
            const radius = read("radius");
            if (typeof radius !== "number" || !Number.isFinite(radius) || radius <= 0)
                throw new RangeError("Gradient radius must be finite and positive.");
            this.geometry = Object.freeze({ kind: "radial", centre: point(read("centre")), radius });
        }
        else
            throw new TypeError("Gradient geometry is unsupported.");
        Object.freeze(this);
    }
    /** Interpolate premultiplied sRGB components to avoid transparent-stop colour fringes. */
    sample(offset: number): GFXColour {
        if (!Number.isFinite(offset))
            throw new RangeError("Gradient offset must be finite.");
        const stops = this.stops;
        if (offset < stops[0]!.offset)
            return stops[0]!.colour;
        let index = 0;
        while (index + 1 < stops.length && stops[index + 1]!.offset <= offset)
            index++;
        const left = stops[index]!, right = stops[index + 1];
        if (!right)
            return left.colour;
        const t = (offset - left.offset) / (right.offset - left.offset);
        const a = left.colour.converting("srgb").components, b = right.colour.converting("srgb").components;
        const alpha = a.a + (b.a - a.a) * t;
        const channel = (key: "r" | "g" | "b") => alpha === 0 ? 0 : (a[key] * a.a * (1 - t) + b[key] * b.a * t) / alpha;
        return GFXColour.rgba(channel("r"), channel("g"), channel("b"), alpha);
    }
    sampleAt(position: GFXPoint, bounds: GFXRect = { x: 0, y: 0, width: 1, height: 1 }): GFXColour {
        let input = point(position);
        if (this.units === "objectBoundingBox") {
            const rect = normaliseRect(bounds);
            if (!rect.width || !rect.height)
                return this.sample(1);
            input = { x: (input.x - rect.x) / rect.width, y: (input.y - rect.y) / rect.height };
        }
        const p = transformPoint(input, this.#inverse), g = this.geometry;
        if (g.kind === "radial")
            return this.sample(Math.hypot(p.x - g.centre.x, p.y - g.centre.y) / g.radius);
        const dx = g.end.x - g.start.x, dy = g.end.y - g.start.y, length = dx * dx + dy * dy;
        return this.sample(length === 0 ? 1 : ((p.x - g.start.x) * dx + (p.y - g.start.y) * dy) / length);
    }
}
function point(value: unknown): GFXPoint {
    if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null))
        throw new TypeError("Gradient point must be a plain record.");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.keys(descriptors).length !== 2 || ["x", "y"].some((key) => !descriptors[key] || !Object.prototype.hasOwnProperty.call(descriptors[key]!, "value") || typeof descriptors[key]!.value !== "number" || !Number.isFinite(descriptors[key]!.value)))
        throw new TypeError("Gradient point must contain finite data properties.");
    return Object.freeze({ x: descriptors.x!.value, y: descriptors.y!.value });
}
