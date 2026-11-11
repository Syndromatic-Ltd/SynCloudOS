/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { NSEData } from "../../Foundation/NSEData";
import { BTFXAttribute } from "./BTFXAttribute";
import type { BTFXService } from "./BTFXService";
import type { BTFXDescriptor } from "./BTFXDescriptor";
import type { BTFXCharacteristicProperties } from "./BTFXCharacteristicProperties";
import { characteristics } from "./internal/bluetoothObjects";
export class BTFXCharacteristic extends BTFXAttribute {
  private constructor() { super(); }
  get service(): BTFXService { return characteristics.get(this)!.service; }
  get value(): NSEData | null { const value=characteristics.get(this)!.value; return value ? NSEData.from(value) : null; }
  get properties(): BTFXCharacteristicProperties { return characteristics.get(this)!.native.properties; }
  get isNotifying(): boolean { return characteristics.get(this)!.isNotifying; }
  get descriptors(): readonly BTFXDescriptor[] | null { return characteristics.get(this)!.descriptors; }
}
