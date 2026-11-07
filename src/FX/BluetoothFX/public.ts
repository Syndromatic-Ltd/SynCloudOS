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

import type { NSEData, NSEDataConvertible } from "../../Foundation/public";

export type BTFXAuthorizationStatus = "unknown" | "prompt" | "granted" | "denied" | "unavailable";
export interface BTFXCapabilities {
  readonly apiAvailable: boolean;
  readonly retrievesGrantedPeripherals: boolean;
  readonly backgroundScanning: false;
  readonly peripheralRole: false;
}
export interface BTFXPeripheralRequest {
  readonly filters?: readonly { readonly name?: string; readonly namePrefix?: string; readonly services?: readonly (string | number)[] }[];
  readonly acceptAllDevices?: boolean;
  readonly optionalServices?: readonly (string | number)[];
}
export interface BTFXCharacteristic {
  readonly uuid: string;
  readValue(): Promise<NSEData>;
  writeValue(value: NSEDataConvertible, withResponse?: boolean): Promise<void>;
  setNotifyValue(enabled: boolean, listener?: (value: NSEData) => void): Promise<void>;
}
export interface BTFXService {
  readonly uuid: string;
  readonly isPrimary: boolean;
  discoverCharacteristics(): Promise<readonly BTFXCharacteristic[]>;
}
export interface BTFXPeripheral {
  readonly identifier: string;
  readonly name: string | null;
  readonly isConnected: boolean;
  connect(): Promise<void>;
  disconnect(): void;
  discoverServices(): Promise<readonly BTFXService[]>;
}
export interface BTFXCentralManager {
  getCapabilities(): BTFXCapabilities;
  getAuthorizationStatus(): Promise<BTFXAuthorizationStatus>;
  /** Web Bluetooth authorisation is a chooser grant for one peripheral, returned here. */
  requestAuthorization(request: BTFXPeripheralRequest): Promise<BTFXPeripheral>;
  retrievePeripherals(): Promise<readonly BTFXPeripheral[]>;
  dispose(): void;
}
export interface BTFXBluetoothClient {
  getCapabilities(): BTFXCapabilities;
  createCentralManager(signal?: AbortSignal): BTFXCentralManager;
}
