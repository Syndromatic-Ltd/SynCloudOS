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

import type { PKFXPaymentJSON } from "../public";

/** Snapshot merchant/response JSON without retaining mutable browser objects. */
export function copyPaymentJSON(value: PKFXPaymentJSON, ancestors = new Set<object>()): PKFXPaymentJSON {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "object") {
    if (ancestors.has(value)) throw new TypeError("Payment method data must not be cyclic.");
    ancestors.add(value);
    try {
      if (Array.isArray(value)) return Object.freeze(value.map(entry => copyPaymentJSON(entry, ancestors)));
      if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
        return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, copyPaymentJSON(entry, ancestors)])));
      }
    } finally { ancestors.delete(value); }
  }
  throw new TypeError("Payment method data must contain finite JSON values.");
}
