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

import { GFXColourTransform, type GFXGamutMapping, type GFXToneMapPolicy } from "./GFXColourTransform";
import type { GFXColourSpace } from "./colourTypes";

// A GFXColourTransform is frozen and `apply` is a pure function of its
// options, so per-sample callers share one instance per option set instead of
// constructing and validating a transform for every pixel. Keys range over the
// finite named-space and policy vocabularies (invalid names throw before they
// are cached), so the table is bounded by construction. Profile-based
// transforms are not shared here.
const transforms = new Map<string, GFXColourTransform>();

export function namedColourTransform(
    source: GFXColourSpace,
    destination: GFXColourSpace,
    gamutMapping: GFXGamutMapping,
    toneMap: GFXToneMapPolicy,
): GFXColourTransform {
    const key = `${source}\u0000${destination}\u0000${gamutMapping}\u0000${toneMap}`;
    let transform = transforms.get(key);
    if (!transform) {
        transform = new GFXColourTransform({ source, destination, gamutMapping, toneMap });
        transforms.set(key, transform);
    }
    return transform;
}
