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

/** Private host-to-FX authority seam; never exported by the public SDK entry. */
declare const scopeBrand: unique symbol;
declare const issuerBrand: unique symbol;
export interface GFXIdentifierScope {
    readonly [scopeBrand]: true;
}
export interface GFXIdentifierIssuer {
    readonly [issuerBrand]: true;
}
const issuerAuthority = new WeakMap<object, () => () => string>();
const scopeAuthority = new WeakMap<object, () => string>();
export function createOwnedGFXIdentifierIssuer(createScope: () => () => string): GFXIdentifierIssuer {
    const issuer = Object.freeze(Object.create(null)) as GFXIdentifierIssuer;
    issuerAuthority.set(issuer, createScope);
    return issuer;
}
/**
 * Bind an existing kernel issuer to a mounted capability generation. The
 * issuer remains opaque, while both scope creation and identifier issuance
 * re-check the mount owner so a retained AppSDK value cannot mint graphics
 * identifiers after revocation.
 */
export function createMountedGFXIdentifierIssuer(issuer: GFXIdentifierIssuer, assertLive: () => void): GFXIdentifierIssuer {
    assertGFXIdentifierIssuer(issuer);
    const createScope = issuerAuthority.get(issuer)!;
    return createOwnedGFXIdentifierIssuer(() => {
        assertLive();
        const issue = createScope();
        return () => {
            assertLive();
            return issue();
        };
    });
}
export function assertGFXIdentifierIssuer(value: unknown): asserts value is GFXIdentifierIssuer {
    if (!value || typeof value !== "object" || !issuerAuthority.has(value))
        throw new TypeError("A runtime-owned graphics identifier issuer is required.");
}
export function createGFXIdentifierScope(issuer: GFXIdentifierIssuer): GFXIdentifierScope {
    assertGFXIdentifierIssuer(issuer);
    const createScope = issuerAuthority.get(issuer)!;
    const issue = createScope();
    const scope = Object.freeze(Object.create(null)) as GFXIdentifierScope;
    scopeAuthority.set(scope, issue);
    return scope;
}
export function issueGFXDefinitionId(scope: GFXIdentifierScope): string {
    if (!scope || typeof scope !== "object" || !scopeAuthority.has(scope))
        throw new TypeError("A runtime-owned graphics identifier scope is required.");
    return scopeAuthority.get(scope)!();
}
