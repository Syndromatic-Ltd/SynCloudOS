/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { NSEData } from "../../Foundation/NSEData";
import { BTFXAttribute } from "./BTFXAttribute";
import type { BTFXCharacteristic } from "./BTFXCharacteristic";
import { descriptors } from "./internal/bluetoothObjects";
export class BTFXDescriptor extends BTFXAttribute {
  private constructor() { super(); }
  get characteristic(): BTFXCharacteristic { return descriptors.get(this)!.characteristic; }
  get value(): NSEData | string | number | null { const value=descriptors.get(this)!.value; return value instanceof NSEData ? NSEData.from(value) : value; }
}
