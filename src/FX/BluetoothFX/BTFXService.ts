/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { BTFXAttribute } from "./BTFXAttribute";
import type { BTFXPeripheral } from "./BTFXPeripheral";
import type { BTFXCharacteristic } from "./BTFXCharacteristic";
import { services } from "./internal/bluetoothObjects";
export class BTFXService extends BTFXAttribute {
  private constructor() { super(); }
  get peripheral(): BTFXPeripheral { return services.get(this)!.peripheral; }
  get isPrimary(): boolean { return services.get(this)!.native.isPrimary; }
  get characteristics(): readonly BTFXCharacteristic[] | null { return services.get(this)!.characteristics; }
  get includedServices(): readonly BTFXService[] | null { return services.get(this)!.includedServices; }
}
