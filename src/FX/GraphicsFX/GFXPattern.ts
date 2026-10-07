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

import { GFXImage, type GFXInterpolation } from "./GFXImage";
import { GFXColour } from "./GFXColour";
import { GFXIdentityTransform, invertTransform, normaliseAffineTransform, transformPoint, type GFXAffineTransform, type GFXPoint } from "./GFXGeometry";
/** Repeating bitmap pattern with explicit interpolation in an explicit user-space transform. */
export class GFXPattern {
    readonly transform: GFXAffineTransform;
    #inverse: GFXAffineTransform;
    constructor(readonly image: GFXImage, transform: GFXAffineTransform = GFXIdentityTransform, readonly interpolation: GFXInterpolation = "nearest") {
        if (interpolation !== "nearest" && interpolation !== "linear")
            throw new TypeError("Unsupported pattern interpolation.");
        if (!(image instanceof GFXImage))
            throw new TypeError("Pattern requires a GFXImage.");
        this.transform = normaliseAffineTransform(transform);
        this.#inverse = invertTransform(this.transform);
        Object.freeze(this);
    }
    sample(position: GFXPoint): GFXColour {
        const p = transformPoint(position, this.#inverse);
        const c = this.image.sample(p, { interpolation: this.interpolation, edge: "repeat" });
        return (this.image.colourSpace === "display-p3" ? GFXColour.displayP3(c.r, c.g, c.b, c.a) : this.image.colourSpace === "linear-srgb" ? GFXColour.linearSRGB(c.r, c.g, c.b, c.a) : GFXColour.rgba(c.r, c.g, c.b, c.a));
    }
}
