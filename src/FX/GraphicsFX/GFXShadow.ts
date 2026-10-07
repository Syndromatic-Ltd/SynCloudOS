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
import type { GFXShadowValue } from "./graphicsTypes";
export class GFXShadow implements GFXShadowValue {
    readonly offset;
    readonly blur;
    readonly spread;
    readonly colour;
    constructor(value: GFXShadowValue) {
        if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null))
            throw new TypeError("Shadow must be a plain record.");
        const descriptors = Object.getOwnPropertyDescriptors(value);
        if (Object.keys(descriptors).length !== 4 || Object.keys(descriptors).some((key) => !["offset", "blur", "spread", "colour"].includes(key)))
            throw new TypeError("Shadow has unsupported fields.");
        const read = (key: string) => {
            const descriptor = descriptors[key];
            if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value"))
                throw new TypeError("Shadow fields must be data.");
            return descriptor.value;
        };
        const offset = read("offset");
        const offsetDescriptors = offset && typeof offset === "object" ? Object.getOwnPropertyDescriptors(offset) : {};
        if (Object.keys(offsetDescriptors).length !== 2 || Object.keys(offsetDescriptors).some((key) => !["x", "y"].includes(key)))
            throw new TypeError("Shadow offset has unsupported fields.");
        const x = offsetDescriptors.x?.value;
        const y = offsetDescriptors.y?.value;
        const blur = read("blur");
        const spread = read("spread");
        const colour = read("colour");
        if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y) || typeof blur !== "number" || !Number.isFinite(blur) || blur < 0 || typeof spread !== "number" || !Number.isFinite(spread) || !(colour instanceof GFXColour))
            throw new TypeError("Shadow values are invalid.");
        this.offset = Object.freeze({ x, y });
        this.blur = blur;
        this.spread = spread;
        this.colour = colour;
        Object.freeze(this);
    }
}
