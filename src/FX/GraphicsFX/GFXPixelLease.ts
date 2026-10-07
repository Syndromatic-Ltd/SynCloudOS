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

import { GFXImage } from "./GFXImage";
import type { GFXBytePixelDescriptor } from "./GFXPixelDescriptor";

export interface GFXPixelLease {
    readonly descriptor: GFXBytePixelDescriptor;
    readonly released: boolean;
    copyImage(): GFXImage;
    transferImage(): GFXImage;
    release(): void;
}

class OwnedGFXPixelLease implements GFXPixelLease {
    #image: GFXImage | null;
    #released = false;

    constructor(image: GFXImage) {
        if (!(image instanceof GFXImage))
            throw new TypeError("Pixel lease requires an owned GFXImage.");
        this.#image = image;
    }

    get descriptor(): GFXBytePixelDescriptor {
        return this.#assertLive().descriptor;
    }

    get released(): boolean {
        return this.#released;
    }

    copyImage(): GFXImage {
        const image = this.#assertLive();
        const descriptor = image.descriptor;
        return new GFXImage({
            width: descriptor.width,
            height: descriptor.height,
            bytesPerRow: descriptor.bytesPerRow,
            pixelFormat: descriptor.pixelFormat,
            alpha: descriptor.alpha,
            colourSpace: descriptor.colourSpace,
            data: image.copyData(),
        });
    }

    transferImage(): GFXImage {
        const image = this.#assertLive();
        this.#image = null;
        this.#released = true;
        return image;
    }

    release(): void {
        if (this.#released)
            return;
        this.#image = null;
        this.#released = true;
    }

    #assertLive(): GFXImage {
        if (this.#released || !this.#image)
            throw new Error("Pixel lease is released.");
        return this.#image;
    }
}

export function createGFXPixelLease(image: GFXImage): GFXPixelLease {
    return new OwnedGFXPixelLease(image);
}
