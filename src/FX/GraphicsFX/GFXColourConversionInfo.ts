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
import type { GFXColourSpace } from "./colourTypes";
/** Named-space conversion. ICC profiles require a separately reviewed profile backend. */
export class GFXColourConversionInfo {
    constructor(readonly source: GFXColourSpace, readonly destination: GFXColourSpace) {
        for (const space of [source, destination])
            if (!["srgb", "linear-srgb", "display-p3", "grayscale"].includes(space))
                throw new TypeError("Unsupported colour profile.");
        Object.freeze(this);
    }
    convert(colour: GFXColour): GFXColour {
        if (!(colour instanceof GFXColour) || colour.space !== this.source)
            throw new TypeError("Source colour does not match conversion space.");
        return colour.converting(this.destination);
    }
}
