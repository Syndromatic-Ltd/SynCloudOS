/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { NSEData } from "../../../Foundation/NSEData";
import type { BTFXUUID } from "../BTFXUUID";
import type { BTFXPeripheral } from "../BTFXPeripheral";
import type { BTFXService } from "../BTFXService";
import type { BTFXCharacteristic } from "../BTFXCharacteristic";
import type { BTFXDescriptor } from "../BTFXDescriptor";
import type { BTFXPeripheralDelegate } from "../BTFXPeripheralDelegate";
import type { BTFXPeripheralState } from "../BTFXPeripheralState";
import type { BTDevice, BTConnection, BTService, BTCharacteristic, BTDescriptor } from "./bluetoothPort";
import { BTFXError } from "../BTFXError";
export interface PeripheralOwner { live(): boolean; assert(): void; operation<T>(peripheral: BTFXPeripheral, action: () => Promise<T>, complete: (value: T | null, error: BTFXError | null) => void): void; enqueue(peripheral: BTFXPeripheral, work: () => void): void; }
export interface PeripheralRecord { owner: PeripheralOwner; native: BTDevice; state: BTFXPeripheralState; delegate: BTFXPeripheralDelegate | null; services: readonly BTFXService[] | null; connection?: BTConnection; generation: number; notificationCharacteristics: Set<BTFXCharacteristic>; controller?: AbortController; }
export const peripherals = new WeakMap<BTFXPeripheral, PeripheralRecord>();
export const attributes = new WeakMap<object, BTFXUUID>();
export const services = new WeakMap<BTFXService, { native: BTService; peripheral: BTFXPeripheral; generation: number; characteristics: readonly BTFXCharacteristic[] | null; includedServices: readonly BTFXService[] | null }>();
export const characteristics = new WeakMap<BTFXCharacteristic, { native: BTCharacteristic; service: BTFXService; value: NSEData | null; isNotifying: boolean; notifyGeneration: number; descriptors: readonly BTFXDescriptor[] | null }>();
export const descriptors = new WeakMap<BTFXDescriptor, { native: BTDescriptor; characteristic: BTFXCharacteristic; value: NSEData | string | number | null }>();
export function peripheralRecord(value: BTFXPeripheral): PeripheralRecord { const record=peripherals.get(value); if(!record)throw new BTFXError("invalidHandle"); return record; }
export function assertAttribute(peripheral: BTFXPeripheral, service: BTFXService): void { const p=peripheralRecord(peripheral), s=services.get(service); if(!s || s.peripheral !== peripheral || s.generation !== p.generation)throw new BTFXError("invalidHandle", "The attribute belongs to an ended connection."); }
