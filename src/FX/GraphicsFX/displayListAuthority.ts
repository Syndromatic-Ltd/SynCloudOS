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

import type { GFXIdentifierIssuer, GFXIdentifierScope } from "./identifierAuthority";
import type { GFXDisplayList } from "./graphicsTypes";
import { assertGFXIdentifierIssuer, createGFXIdentifierScope } from "./identifierAuthority";
const ownedDisplayLists = new WeakSet<object>();
const identifierIssuers = new WeakMap<object, GFXIdentifierIssuer>();
export function sealGFXDisplayList(value: GFXDisplayList, issuer: GFXIdentifierIssuer): GFXDisplayList {
    assertGFXIdentifierIssuer(issuer);
    createGFXIdentifierScope(issuer); // Validate mounted liveness before sealing a new snapshot.
    ownedDisplayLists.add(value);
    identifierIssuers.set(value, issuer);
    return value;
}
export function assertGFXDisplayList(value: GFXDisplayList): void {
    if (!value || typeof value !== "object" || !ownedDisplayLists.has(value))
        throw new TypeError("Graphics views accept only recorder-owned display lists.");
    createGFXIdentifierScope(identifierIssuers.get(value)!); // Cached view definitions cannot bypass revocation.
}
export function createGFXViewIdentifierScope(value: GFXDisplayList): GFXIdentifierScope {
    assertGFXDisplayList(value);
    const issuer = identifierIssuers.get(value);
    if (!issuer)
        throw new TypeError("Graphics display list has no runtime identifier authority.");
    return createGFXIdentifierScope(issuer);
}
