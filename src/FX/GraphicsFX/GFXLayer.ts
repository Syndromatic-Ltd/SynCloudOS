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

import { GFXBitmapContext } from "./GFXBitmapContext";
import { GFXImage, type GFXImageDrawingDestination } from "./GFXImage";
import type { GFXRect } from "./GFXGeometry";
/** A layer snapshots a surface, then composites through another surface's current state. */
export class GFXLayer {
    readonly image: GFXImage;
    constructor(surface: GFXBitmapContext) {
        if (!(surface instanceof GFXBitmapContext))
            throw new TypeError("Layer requires bitmap context.");
        this.image = surface.makeImage();
        Object.freeze(this);
    }
    draw(context: GFXImageDrawingDestination, destination: GFXRect): void {
        context.drawImage(this.image, destination);
    }
}
