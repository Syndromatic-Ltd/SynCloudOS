/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { createFXSessionBinding, type FXAppSession } from "../../../SynCloudOS/fxRuntimeContracts";
import { BTFXError } from "../BTFXError";
import type { BTFXCentralManager } from "../BTFXCentralManager";
export const bluetoothBindings = new WeakMap<Function, Readonly<{ resolve(): FXAppSession }>>();
export const deferredBluetoothTypes = new WeakSet<Function>();
export const bluetoothManagers = new WeakMap<BTFXCentralManager, { activate(): void; dispose(): void }>();
export const bluetoothBinding = (type: Function) => bluetoothBindings.get(type) ?? createFXSessionBinding(type, reason => new BTFXError("operationCancelled", `Bluetooth application session is ${reason}.`));
