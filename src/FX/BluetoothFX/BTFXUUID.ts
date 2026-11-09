/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { NSEData } from "../../Foundation/NSEData";
import { NSEUUID } from "../../Foundation/NSEUUID";
import { BTFXError } from "./BTFXError";
/** CBUUID init(string:), init(data:) and init(nsuuid:) overloads. */
export class BTFXUUID {
  readonly #data: NSEData;
  constructor(value: string | NSEData | NSEUUID) {
    if (value instanceof NSEUUID) value = value.uuidString;
    if (typeof value === "string") {
      if (!/^(?:[0-9a-f]{4}|[0-9a-f]{8}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(value))
        throw new BTFXError("invalidParameters", "A Bluetooth UUID requires 16, 32 or 128 bits.");
      value = NSEData.from(
        new Uint8Array(
          value
            .replaceAll("-", "")
            .match(/../g)!
            .map(byte => parseInt(byte, 16)),
        ),
      );
    }
    if (!(value instanceof NSEData) || ![2, 4, 16].includes(value.count))
      throw new BTFXError("invalidParameters", "A Bluetooth UUID requires 2, 4 or 16 bytes.");
    this.#data = NSEData.from(value);
    Object.freeze(this);
  }
  get data(): NSEData {
    return NSEData.from(this.#data);
  }
  get uuidString(): string {
    return this.#data.count === 16
      ? new NSEUUID(this.#data.bytes).uuidString
      : [...this.#data.bytes]
          .map(byte => byte.toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase();
  }
  isEqual(other: unknown): boolean {
    const full = (uuid: BTFXUUID) =>
      uuid.data.count === 16 ? uuid.uuidString : `${uuid.uuidString.padStart(8, "0")}-0000-1000-8000-00805F9B34FB`;
    return other instanceof BTFXUUID && full(other) === full(this);
  }
}
