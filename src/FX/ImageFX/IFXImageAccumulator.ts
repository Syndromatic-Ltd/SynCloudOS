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

import { GFXImage } from "../GraphicsFX/GFXImage";
import { intersectRects, type GFXRect } from "../GraphicsFX/GFXGeometry";
import { IFXImage } from "./IFXImage";
import { IFXContext } from "./IFXContext";
import { IFXRenderDestination } from "./IFXRenderDestination";
import { finiteExtent, pixelRect } from "./extent";
export class IFXImageAccumulator {
    readonly extent: GFXRect;
    #pixels: GFXImage | null;
    #disposed = false;
    #generation = 0;
    constructor(extent: GFXRect) {
        this.extent = pixelRect(extent);
        this.#pixels = new GFXImage({ width: extent.width, height: extent.height, alpha: "straight", colourSpace: "srgb", data: new Uint8Array(extent.width * extent.height * 4) });
        Object.freeze(this);
    }
    #check() {
        if (this.#disposed)
            throw new DOMException("Accumulator disposed.", "AbortError");
    }
    get image(): IFXImage {
        this.#check();
        return IFXImage.fromPixels(this.#pixels!, this.extent);
    }
    async update(image: IFXImage, context: IFXContext, dirty: GFXRect = this.extent, signal?: AbortSignal): Promise<void> {
        this.#check();
        const region = intersectRects(this.extent, dirty);
        if (!region || region.width === 0 || region.height === 0)
            return;
        pixelRect(region);
        const generation = ++this.#generation;
        const output = await context.render(image, new IFXRenderDestination(finiteExtent(region)), { signal });
        this.#check();
        signal?.throwIfAborted();
        if (this.#generation !== generation)
            throw new DOMException("Accumulator update superseded.", "AbortError");
        const bytes = this.#pixels!.copyData(), incoming = output.image.copyData();
        for (let y = 0; y < region.height; y++)
            bytes.set(incoming.subarray(y * region.width * 4, (y + 1) * region.width * 4), ((region.y - this.extent.y + y) * this.extent.width + region.x - this.extent.x) * 4);
        this.#pixels = new GFXImage({ width: this.extent.width, height: this.extent.height, alpha: "straight", colourSpace: "srgb", data: bytes });
    }
    clear(): void {
        this.#check();
        this.#generation++;
        this.#pixels = new GFXImage({ width: this.extent.width, height: this.extent.height, alpha: "straight", colourSpace: "srgb", data: new Uint8Array(this.extent.width * this.extent.height * 4) });
    }
    dispose(): void {
        this.#disposed = true;
        this.#generation++;
        this.#pixels = null;
    }
}
