/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { NSEData } from "../../../Foundation/NSEData";
import type { NSEUUID } from "../../../Foundation/NSEUUID";
import type { BTFXUUID } from "../BTFXUUID";
import type { BTFXManagerState } from "../BTFXManagerState";
import type { BTFXManagerAuthorization } from "../BTFXManagerAuthorization";
import type { BTFXCharacteristicWriteType } from "../BTFXCharacteristicWriteType";
import { BTFXError } from "../BTFXError";
export interface BTDescriptor { readonly uuid: BTFXUUID; read(): Promise<NSEData | string | number>; write(value: NSEData): Promise<void>; }
export interface BTCharacteristic { readonly uuid: BTFXUUID; readonly properties: number; read(): Promise<NSEData>; write(value: NSEData, type: BTFXCharacteristicWriteType): Promise<void>; discoverDescriptors(): Promise<readonly BTDescriptor[]>; setNotify(enabled: boolean, listener: (value: NSEData) => void): Promise<void>; }
export interface BTService { readonly uuid: BTFXUUID; readonly isPrimary: boolean; discoverCharacteristics(uuids: readonly BTFXUUID[] | null): Promise<readonly BTCharacteristic[]>; }
export interface BTConnection { discoverServices(uuids: readonly BTFXUUID[] | null): Promise<readonly BTService[]>; disconnect(): Promise<void>; }
export interface BTDevice { readonly identifier: NSEUUID; readonly name: string | null; connect(signal: AbortSignal, disconnected: (error: unknown | null) => void): Promise<BTConnection>; }
export interface BTDiscovery { readonly device: BTDevice; readonly advertisementData: Readonly<Record<string, unknown>>; readonly rssi: number; }
export interface BluetoothAdapter { readonly state: BTFXManagerState; observeState?(listener: () => void): () => void; scan(services: readonly BTFXUUID[] | null, signal: AbortSignal): Promise<BTDiscovery>; }
export interface BluetoothPort extends BluetoothAdapter { readonly authorization: BTFXManagerAuthorization; readonly generation: number; assertAccess(generation: number, granted?: boolean): void; bindAccessLifetime(): void; observeAccessLoss(listener: () => void): () => void; }
const ports = new WeakMap<object, BluetoothPort>(); const adapters = new WeakMap<object, BluetoothAdapter>();
export function associateBluetoothPort(context: object, port: BluetoothPort): void { ports.set(context, port); }
export function bluetoothPortFor(context: object): BluetoothPort { const port = ports.get(context); if (!port) throw new BTFXError("operationNotSupported", "Bluetooth is unavailable."); return port; }
export function associateBluetoothAdapter(environment: object, adapter: BluetoothAdapter): void { adapters.set(environment, adapter); }
export function bluetoothAdapterFor(environment: object): BluetoothAdapter | undefined { return adapters.get(environment); }
export function isBluetoothDenial(error: unknown): boolean { return typeof error === "object" && error !== null && "name" in error && (error.name === "NotAllowedError" || error.name === "SecurityError"); }
export function bluetoothFailure(error: unknown): BTFXError { if (error instanceof BTFXError) return error; const name = typeof error === "object" && error !== null && "name" in error ? error.name : ""; return new BTFXError(name === "AbortError" ? "operationCancelled" : name === "NotSupportedError" ? "operationNotSupported" : name === "NotFoundError" ? "unknownDevice" : name === "NetworkError" ? "notConnected" : "unknown", error instanceof Error ? error.message : "Bluetooth operation failed."); }
