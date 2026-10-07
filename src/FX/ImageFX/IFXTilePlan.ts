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

import { normaliseRect, type GFXRect } from "../GraphicsFX/GFXGeometry";

export interface IFXTileDescriptor {
    readonly index: number;
    readonly rect: GFXRect;
    readonly outputBytes: number;
}

const maximumTiles = 16_384;

function integralRect(value: GFXRect): GFXRect {
    const rect = normaliseRect(value);
    const values = [rect.x, rect.y, rect.width, rect.height, rect.x + rect.width, rect.y + rect.height];
    if (!values.every(Number.isSafeInteger) || rect.width <= 0 || rect.height <= 0)
        throw new RangeError("Tile plan requires positive integral destination bounds.");
    return rect;
}

export class IFXTilePlan {
    readonly bounds: GFXRect;
    readonly tileSize: number;
    readonly tiles: readonly IFXTileDescriptor[];
    readonly logicalOutputBytes: number;
    readonly maximumTileBytes: number;

    constructor(bounds: GFXRect, tileSize = 128) {
        this.bounds = integralRect(bounds);
        if (!Number.isSafeInteger(tileSize) || tileSize < 1 || tileSize > 1024)
            throw new RangeError("Tile size must be an integer from 1 to 1024.");
        this.tileSize = tileSize;
        const columns = Math.ceil(this.bounds.width / tileSize);
        const rows = Math.ceil(this.bounds.height / tileSize);
        const count = columns * rows;
        if (!Number.isSafeInteger(count) || count < 1 || count > maximumTiles)
            throw new RangeError(`Tile plan exceeds the ${maximumTiles.toLocaleString("en-US")}-tile budget.`);
        const logicalOutputBytes = this.bounds.width * this.bounds.height * 4;
        if (!Number.isSafeInteger(logicalOutputBytes))
            throw new RangeError("Tile plan output byte size overflows.");
        this.logicalOutputBytes = logicalOutputBytes;
        const tiles: IFXTileDescriptor[] = [];
        let maximumTileBytes = 0;
        for (let row = 0; row < rows; row += 1) {
            for (let column = 0; column < columns; column += 1) {
                const x = this.bounds.x + column * tileSize;
                const y = this.bounds.y + row * tileSize;
                const width = Math.min(tileSize, this.bounds.x + this.bounds.width - x);
                const height = Math.min(tileSize, this.bounds.y + this.bounds.height - y);
                const outputBytes = width * height * 4;
                maximumTileBytes = Math.max(maximumTileBytes, outputBytes);
                tiles.push(Object.freeze({
                    index: tiles.length,
                    rect: Object.freeze({ x, y, width, height }),
                    outputBytes,
                }));
            }
        }
        this.maximumTileBytes = maximumTileBytes;
        this.tiles = Object.freeze(tiles);
        Object.freeze(this);
    }
}
