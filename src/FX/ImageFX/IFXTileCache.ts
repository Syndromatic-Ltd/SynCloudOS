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

import type { GFXImage } from "../GraphicsFX/GFXImage";
import type { GFXAlphaFormat } from "../GraphicsFX/GFXImage";
import type { GFXColourSpace } from "../GraphicsFX/colourTypes";
import type { GFXInterpolation } from "../GraphicsFX/GFXImage";
import type { GFXRect } from "../GraphicsFX/GFXGeometry";
import type { IFXImage } from "./IFXImage";

type Entry = Readonly<{ image: GFXImage; bytes: number }>;
const graphIds = new WeakMap<IFXImage, number>();
let nextGraphId = 1;

function graphId(image: IFXImage): number {
    let id = graphIds.get(image);
    if (id === undefined) {
        id = nextGraphId++;
        graphIds.set(image, id);
    }
    return id;
}

export function ifxTileCacheKey(
    image: IFXImage,
    rect: GFXRect,
    colourSpace: GFXColourSpace,
    alpha: GFXAlphaFormat,
    interpolation: GFXInterpolation,
): string {
    return `${graphId(image)}|${rect.x},${rect.y},${rect.width},${rect.height}|${colourSpace}|${alpha}|${interpolation}`;
}

export class IFXTileCache {
    readonly #entries = new Map<string, Entry>();
    #bytes = 0;
    #hits = 0;
    #evictions = 0;

    constructor(readonly maximumBytes: number) {
        if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0)
            throw new RangeError("Tile cache byte budget must be a nonnegative safe integer.");
    }
    get bytes(): number { return this.#bytes; }
    get hits(): number { return this.#hits; }
    get evictions(): number { return this.#evictions; }
    get(key: string): GFXImage | null {
        const entry = this.#entries.get(key);
        if (!entry) return null;
        this.#entries.delete(key);
        this.#entries.set(key, entry);
        this.#hits += 1;
        return entry.image;
    }
    set(key: string, image: GFXImage): void {
        const bytes = image.bytesPerRow * image.height;
        if (bytes > this.maximumBytes || this.maximumBytes === 0) return;
        const previous = this.#entries.get(key);
        if (previous) {
            this.#bytes -= previous.bytes;
            this.#entries.delete(key);
        }
        while (this.#bytes + bytes > this.maximumBytes && this.#entries.size) {
            const first = this.#entries.entries().next().value as [string, Entry] | undefined;
            if (!first) break;
            this.#entries.delete(first[0]);
            this.#bytes -= first[1].bytes;
            this.#evictions += 1;
        }
        this.#entries.set(key, Object.freeze({ image, bytes }));
        this.#bytes += bytes;
    }
    clear(): void {
        this.#entries.clear();
        this.#bytes = 0;
    }
}
