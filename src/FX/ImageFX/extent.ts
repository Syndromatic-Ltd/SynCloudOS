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

import { normaliseRect, intersectRects, unionRects, transformRect, type GFXRect, type GFXAffineTransform } from "../GraphicsFX/GFXGeometry";
export type IFXExtent = Readonly<{
    kind: "finite";
    rect: GFXRect;
}> | Readonly<{
    kind: "infinite";
}>;
export const infiniteExtent: IFXExtent = Object.freeze({ kind: "infinite" });
export function finiteExtent(rect: GFXRect): IFXExtent {
    const r = normaliseRect(rect);
    if (!Number.isFinite(r.x + r.width) || !Number.isFinite(r.y + r.height))
        throw new RangeError("Extent overflows.");
    return Object.freeze({ kind: "finite", rect: r });
}
export function cropExtent(extent: IFXExtent, rect: GFXRect): IFXExtent {
    const r = finiteExtent(rect);
    return extent.kind === "infinite" ? r : finiteExtent(intersectRects(extent.rect, rect) ?? { x: rect.x, y: rect.y, width: 0, height: 0 });
}
export function unionExtent(a: IFXExtent, b: IFXExtent): IFXExtent {
    return a.kind === "infinite" || b.kind === "infinite" ? infiniteExtent : finiteExtent(unionRects(a.rect, b.rect));
}
export function transformedExtent(e: IFXExtent, t: GFXAffineTransform): IFXExtent {
    return e.kind === "infinite" ? e : finiteExtent(transformRect(e.rect, t));
}
export function pixelRect(rect: GFXRect): GFXRect {
    const r = normaliseRect(rect);
    if (![r.x, r.y, r.width, r.height, r.x + r.width, r.y + r.height].every(Number.isSafeInteger) || r.width <= 0 || r.height <= 0 || r.width * r.height > 4 * 1024 * 1024)
        throw new RangeError("Destination requires positive integral bounds of at most four million pixels.");
    return r;
}
