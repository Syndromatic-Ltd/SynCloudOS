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
import { GFXColour } from "./GFXColour";
import { GFXIdentityTransform, invertTransform, normaliseAffineTransform, normalisePoint, transformPoint, type GFXAffineTransform, type GFXPoint } from "./GFXGeometry";
export type GFXShadingGeometry = Readonly<{
    kind: "axial";
    start: GFXPoint;
    end: GFXPoint;
}> | Readonly<{
    kind: "radial";
    centre: GFXPoint;
    radius: number;
}> | Readonly<{
    kind: "conic";
    centre: GFXPoint;
    startAngle: number;
}>;
/** A shading maps user coordinates into a gradient's normalized colour ramp. Angles are radians. */
export class GFXShading {
    readonly geometry: GFXShadingGeometry;
    readonly transform: GFXAffineTransform;
    #inverse: GFXAffineTransform;
    constructor(readonly gradient: GFXGradient, geometry: GFXShadingGeometry, transform: GFXAffineTransform = GFXIdentityTransform) {
        if (!(gradient instanceof GFXGradient))
            throw new TypeError("Shading requires GFXGradient.");
        this.transform = normaliseAffineTransform(transform);
        this.#inverse = invertTransform(this.transform);
        if (geometry.kind === "axial")
            this.geometry = Object.freeze({ kind: "axial", start: normalisePoint(geometry.start), end: normalisePoint(geometry.end) });
        else if (geometry.kind === "radial") {
            if (!Number.isFinite(geometry.radius) || geometry.radius <= 0)
                throw new RangeError("Shading radius must be positive.");
            this.geometry = Object.freeze({ kind: "radial", centre: normalisePoint(geometry.centre), radius: geometry.radius });
        }
        else if (geometry.kind === "conic") {
            if (!Number.isFinite(geometry.startAngle))
                throw new RangeError("Shading angle must be finite.");
            this.geometry = Object.freeze({ kind: "conic", centre: normalisePoint(geometry.centre), startAngle: geometry.startAngle });
        }
        else
            throw new TypeError("Unsupported shading geometry.");
        Object.freeze(this);
    }
    sample(position: GFXPoint): GFXColour {
        const p = transformPoint(position, this.#inverse), g = this.geometry;
        if (g.kind === "radial")
            return this.gradient.sample(Math.hypot(p.x - g.centre.x, p.y - g.centre.y) / g.radius);
        if (g.kind === "conic") {
            const turn = 2 * Math.PI, angle = Math.atan2(p.y - g.centre.y, p.x - g.centre.x) - g.startAngle;
            return this.gradient.sample(((angle % turn) + turn) % turn / turn);
        }
        const dx = g.end.x - g.start.x, dy = g.end.y - g.start.y, length = dx * dx + dy * dy;
        return this.gradient.sample(length ? ((p.x - g.start.x) * dx + (p.y - g.start.y) * dy) / length : 1);
    }
}
