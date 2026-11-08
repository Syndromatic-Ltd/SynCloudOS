/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { BTFXPeripheral } from "./BTFXPeripheral";
import type { BTFXService } from "./BTFXService";
import type { BTFXCharacteristic } from "./BTFXCharacteristic";
import type { BTFXDescriptor } from "./BTFXDescriptor";
import type { BTFXError } from "./BTFXError";
export interface BTFXPeripheralDelegate {
  peripheralDidDiscoverServices?(peripheral: BTFXPeripheral, error: BTFXError | null): void;
  peripheralDidDiscoverIncludedServicesForService?(peripheral: BTFXPeripheral, service: BTFXService, error: BTFXError | null): void;
  peripheralDidDiscoverCharacteristicsForService?(peripheral: BTFXPeripheral, service: BTFXService, error: BTFXError | null): void;
  peripheralDidDiscoverDescriptorsForCharacteristic?(peripheral: BTFXPeripheral, characteristic: BTFXCharacteristic, error: BTFXError | null): void;
  peripheralDidUpdateValueForCharacteristic?(peripheral: BTFXPeripheral, characteristic: BTFXCharacteristic, error: BTFXError | null): void;
  peripheralDidUpdateValueForDescriptor?(peripheral: BTFXPeripheral, descriptor: BTFXDescriptor, error: BTFXError | null): void;
  peripheralDidWriteValueForCharacteristic?(peripheral: BTFXPeripheral, characteristic: BTFXCharacteristic, error: BTFXError | null): void;
  peripheralDidWriteValueForDescriptor?(peripheral: BTFXPeripheral, descriptor: BTFXDescriptor, error: BTFXError | null): void;
  peripheralDidUpdateNotificationStateForCharacteristic?(peripheral: BTFXPeripheral, characteristic: BTFXCharacteristic, error: BTFXError | null): void;
  peripheralDidReadRSSI?(peripheral: BTFXPeripheral, rssi: number, error: BTFXError | null): void;
}
