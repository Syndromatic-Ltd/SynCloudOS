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

import type { GFXImage, GFXAlphaFormat } from "../GraphicsFX/GFXImage";
import type { GFXColourSpace } from "../GraphicsFX/colourTypes";
import { GFXColour } from "../GraphicsFX/GFXColour";
import { pixelRect, type IFXExtent } from "./extent";
import type { GFXRect } from "../GraphicsFX/GFXGeometry";
type State = {
    generation: number;
    disposed: boolean;
    image: GFXImage | null;
};
const states = new WeakMap<IFXRenderDestination, State>();
function state(destination: IFXRenderDestination): State {
    const s = states.get(destination);
    if (!s || s.disposed)
        throw new DOMException("Render destination is disposed.", "AbortError");
    return s;
}
export function beginDestination(destination: IFXRenderDestination): number {
    return ++state(destination).generation;
}
export function assertDestination(destination: IFXRenderDestination, generation: number): void {
    if (state(destination).generation !== generation)
        throw new DOMException("Render destination was superseded.", "AbortError");
}
export function publishDestination(destination: IFXRenderDestination, generation: number, image: GFXImage): void {
    assertDestination(destination, generation);
    state(destination).image = image;
}
export class IFXRenderDestination {
    readonly bounds: GFXRect;
    constructor(extent: IFXExtent, readonly colourSpace: GFXColourSpace = "srgb", readonly alpha: GFXAlphaFormat = "straight") {
        if (extent.kind !== "finite")
            throw new RangeError("Infinite image requires explicit finite destination bounds.");
        this.bounds = pixelRect(extent.rect);
        GFXColour.rgba(0, 0, 0).converting(colourSpace);
        if (!["straight", "opaque", "premultiplied"].includes(alpha))
            throw new TypeError("Unsupported destination alpha.");
        states.set(this, { generation: 0, disposed: false, image: null });
        Object.freeze(this);
    }
    get image(): GFXImage | null {
        return state(this).image;
    }
    dispose(): void {
        const s = states.get(this);
        if (s) {
            s.disposed = true;
            s.generation++;
            s.image = null;
        }
    }
}
