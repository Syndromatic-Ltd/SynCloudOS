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

import type { LUFXSearchableItem } from "../../FX/LuminaFX/LUFXSearchableItem";

/**
 * One owner's eligible donations at one moment, as plain data that can cross
 * to the index worker: the items bound eligible (by domain, ID and the
 * revision the binding names) and the activation route each of the owner's
 * domains is registered with. An item matches exactly when
 * `LuminaEligibilityRegistry.bindingFor` would bind it at that moment, so the
 * worker can filter an index where it lives instead of the whole index
 * crossing to the main thread to be filtered there.
 */
export interface LuminaEligibilityRestriction {
  readonly items: readonly (readonly [domain: string, itemId: string, revision: string])[];
  readonly routes: readonly (readonly [domain: string, routeName: string])[];
}

const itemKey = (domain: string, itemId: string) => `${domain}\u0000${itemId}`;

/** The predicate a restriction describes. */
export function luminaRestrictionMatcher(restriction: LuminaEligibilityRestriction): (item: LUFXSearchableItem) => boolean {
  const revisions = new Map(restriction.items.map(([domain, itemId, revision]) => [itemKey(domain, itemId), revision]));
  const routes = new Map(restriction.routes);
  return (item) => item.visibility === "eligible-donation"
    && routes.get(item.domain) === item.activation.routeName
    && revisions.get(itemKey(item.domain, item.id)) === item.revision;
}

/** Throws unless a restriction received across a boundary is well formed. */
export function assertLuminaEligibilityRestriction(value: unknown): asserts value is LuminaEligibilityRestriction {
  const isStringTuple = (entry: unknown, length: number) => Array.isArray(entry)
    && entry.length === length
    && entry.every((part) => typeof part === "string");
  if (!value || typeof value !== "object"
    || !Array.isArray((value as LuminaEligibilityRestriction).items)
    || !Array.isArray((value as LuminaEligibilityRestriction).routes)
    || !(value as LuminaEligibilityRestriction).items.every((entry) => isStringTuple(entry, 3))
    || !(value as LuminaEligibilityRestriction).routes.every((entry) => isStringTuple(entry, 2))) {
    throw new TypeError("A Lumina eligibility restriction lists [domain, item, revision] items and [domain, route] routes.");
  }
}
