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

import { GFXGradient } from "./GFXGradient";
import { GFXShading } from "./GFXShading";
import { GFXImage } from "./GFXImage";
import { GFXPattern } from "./GFXPattern";
import type { GFXRect } from "./GFXGeometry";
/** Axial/radial shadings use native SVG gradients; conic uses pixel-center sampled owned image data. */
export function projectShading(shading: GFXShading, bounds: GFXRect, samplingScale = 1): GFXGradient | GFXPattern {
    const g = shading.geometry;
    if (g.kind !== "conic")
        return new GFXGradient(shading.gradient.stops, g.kind === "axial" ? { kind: "linear", start: g.start, end: g.end } : g, { units: "userSpaceOnUse", transform: shading.transform });
    if (!Number.isFinite(samplingScale) || samplingScale <= 0 || samplingScale > 8)
        throw new RangeError("Paint sampling scale must be finite, positive and at most eight.");
    const width = Math.max(1, Math.ceil(bounds.width * samplingScale)), height = Math.max(1, Math.ceil(bounds.height * samplingScale));
    if (width * height > 65536)
        throw new RangeError("Conic shading exceeds the 65536-pixel sampling limit.");
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const colour = shading.sample({ x: bounds.x + (x + 0.5) * bounds.width / width, y: bounds.y + (y + 0.5) * bounds.height / height }).converting("srgb").components;
            const i = (y * width + x) * 4;
            pixels[i] = Math.round(colour.r * 255);
            pixels[i + 1] = Math.round(colour.g * 255);
            pixels[i + 2] = Math.round(colour.b * 255);
            pixels[i + 3] = Math.round(colour.a * 255);
        }
    return new GFXPattern(new GFXImage({ width, height, alpha: "straight", colourSpace: "srgb", data: pixels }), { a: bounds.width ? bounds.width / width : 1, b: 0, c: 0, d: bounds.height ? bounds.height / height : 1, tx: bounds.x, ty: bounds.y });
}
