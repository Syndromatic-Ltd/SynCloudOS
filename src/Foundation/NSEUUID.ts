/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/** NSUUID immutable 128-bit identifier. Invalid textual/byte initializers throw. */
export class NSEUUID {
  readonly #bytes: Uint8Array;
  constructor(value?: string | Uint8Array) {
    if (value === undefined) value = crypto.randomUUID();
    if (typeof value === "string") {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new TypeError("Invalid UUID string.");
      this.#bytes = new Uint8Array(value.replaceAll("-", "").match(/../g)!.map(byte => parseInt(byte, 16)));
    } else { if (!(value instanceof Uint8Array) || value.length !== 16) throw new TypeError("UUID requires 16 bytes."); this.#bytes = value.slice(); }
    Object.freeze(this);
  }
  get uuidString(): string { const hex = [...this.#bytes].map(byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase(); return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`; }
  getBytes(bytes: Uint8Array): void { if (bytes.length < 16) throw new RangeError("UUID output requires 16 bytes."); bytes.set(this.#bytes); }
  isEqual(other: unknown): boolean { return other instanceof NSEUUID && other.uuidString === this.uuidString; }
  copy(): NSEUUID { return this; }
}
