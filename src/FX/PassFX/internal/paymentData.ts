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

import { NSEData, type NSEDataConvertible } from "../../../Foundation/NSEData";
import type { PKFXPaymentValue } from "../public";

/** Snapshot recursive method data without retaining mutable objects or buffers. */
export function snapshotPaymentData(value: unknown, ancestors = new Set<object>()): PKFXPaymentValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof NSEData) return NSEData.from(value);
  if (ArrayBuffer.isView(value)) return NSEData.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  if (typeof value === "object") {
    try { return NSEData.from(value as NSEDataConvertible); } catch { /* Not an ArrayBuffer. */ }
    if (ancestors.has(value)) throw new TypeError("Payment method data must not be cyclic.");
    ancestors.add(value);
    try {
      if (Array.isArray(value)) return Object.freeze(value.map(entry => snapshotPaymentData(entry, ancestors)));
      if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
        return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, snapshotPaymentData(entry, ancestors)])));
      }
    } finally { ancestors.delete(value); }
  }
  throw new TypeError("Payment data must contain finite values, records, arrays, or bytes.");
}

/** Each browser constructor receives its own mutable BufferSources. */
export function bridgePaymentData(value: PKFXPaymentValue): unknown {
  if (value instanceof NSEData) return new Uint8Array(value.bytes).buffer;
  if (Array.isArray(value)) return value.map(bridgePaymentData);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, bridgePaymentData(entry)]));
  return value;
}

/** SPC returns a native PublicKeyCredential whose properties are WebIDL getters.
 * Snapshot the assertion and extension results explicitly, preserving raw bytes. */
export function snapshotPaymentDetails(value: unknown): PKFXPaymentValue {
  if (value && typeof value === "object") {
    const credential = value as Record<string, unknown>;
    if (credential.type === "public-key" && typeof credential.getClientExtensionResults === "function") {
      const assertion = credential.response as Record<string, unknown>;
      if (!assertion || typeof assertion !== "object") throw new TypeError("A payment credential requires an assertion response.");
      return snapshotPaymentData({
        id: credential.id, type: credential.type, rawId: credential.rawId,
        ...(credential.authenticatorAttachment === undefined ? {} : { authenticatorAttachment: credential.authenticatorAttachment }),
        response: {
          clientDataJSON: assertion.clientDataJSON, authenticatorData: assertion.authenticatorData,
          signature: assertion.signature, userHandle: assertion.userHandle,
        },
        clientExtensionResults: credential.getClientExtensionResults(),
      });
    }
  }
  return snapshotPaymentData(value);
}
