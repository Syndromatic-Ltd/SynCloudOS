/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { BTFXCentralManager } from "./BTFXCentralManager";
import type { BTFXPeripheral } from "./BTFXPeripheral";
import type { BTFXError } from "./BTFXError";
export interface BTFXCentralManagerDelegate {
  centralManagerDidUpdateState(central: BTFXCentralManager): void;
  centralManagerDidDiscoverPeripheral?(central: BTFXCentralManager, peripheral: BTFXPeripheral, advertisementData: Readonly<Record<string, unknown>>, rssi: number): void;
  centralManagerDidConnect?(central: BTFXCentralManager, peripheral: BTFXPeripheral): void;
  centralManagerDidFailToConnect?(central: BTFXCentralManager, peripheral: BTFXPeripheral, error: BTFXError | null): void;
  centralManagerDidDisconnectPeripheral?(central: BTFXCentralManager, peripheral: BTFXPeripheral, error: BTFXError | null): void;
}
