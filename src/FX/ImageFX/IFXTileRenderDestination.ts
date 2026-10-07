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

import type { GFXRect } from "../GraphicsFX/GFXGeometry";
import { GFXColour } from "../GraphicsFX/GFXColour";
import type { GFXAlphaFormat, GFXImage } from "../GraphicsFX/GFXImage";
import type { GFXColourSpace } from "../GraphicsFX/colourTypes";
import { pixelRect, type IFXExtent } from "./extent";

export interface IFXRenderedTile {
    readonly index: number;
    readonly rect: GFXRect;
    readonly image: GFXImage;
}

export interface IFXTileRenderDestinationOptions {
    readonly tileSize?: number;
    readonly colourSpace?: GFXColourSpace;
    readonly alpha?: GFXAlphaFormat;
    readonly write: (tile: IFXRenderedTile) => void | Promise<void>;
}

type State = {
    generation: number;
    disposed: boolean;
    readonly write: (tile: IFXRenderedTile) => void | Promise<void>;
};

const states = new WeakMap<IFXTileRenderDestination, State>();

function state(destination: IFXTileRenderDestination): State {
    const current = states.get(destination);
    if (!current || current.disposed)
        throw new DOMException("Tile render destination is disposed.", "AbortError");
    return current;
}

export function beginTileDestination(destination: IFXTileRenderDestination): number {
    return ++state(destination).generation;
}

export function assertTileDestination(destination: IFXTileRenderDestination, generation: number): void {
    if (state(destination).generation !== generation)
        throw new DOMException("Tile render destination was superseded.", "AbortError");
}

export async function publishTileDestination(destination: IFXTileRenderDestination, generation: number, tile: IFXRenderedTile): Promise<void> {
    assertTileDestination(destination, generation);
    await state(destination).write(Object.freeze(tile));
    assertTileDestination(destination, generation);
}

export class IFXTileRenderDestination {
    readonly bounds: GFXRect;
    readonly tileSize: number | null;
    readonly colourSpace: GFXColourSpace;
    readonly alpha: GFXAlphaFormat;

    constructor(extent: IFXExtent, options: IFXTileRenderDestinationOptions) {
        if (extent.kind !== "finite")
            throw new RangeError("Tile rendering requires explicit finite destination bounds.");
        if (!options || typeof options !== "object" || typeof options.write !== "function")
            throw new TypeError("Tile destination requires a write callback.");
        this.bounds = pixelRect(extent.rect);
        this.tileSize = options.tileSize ?? null;
        if (this.tileSize !== null && (!Number.isSafeInteger(this.tileSize) || this.tileSize < 1 || this.tileSize > 1024))
            throw new RangeError("Tile size must be an integer from 1 to 1024.");
        this.colourSpace = options.colourSpace ?? "srgb";
        this.alpha = options.alpha ?? "straight";
        GFXColour.rgba(0, 0, 0).converting(this.colourSpace);
        if (!["straight", "opaque", "premultiplied"].includes(this.alpha))
            throw new TypeError("Unsupported destination alpha.");
        states.set(this, { generation: 0, disposed: false, write: options.write });
        Object.freeze(this);
    }

    dispose(): void {
        const current = states.get(this);
        if (current) {
            current.disposed = true;
            current.generation += 1;
        }
    }
}
