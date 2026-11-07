/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { BTFXBluetoothClient, BTFXCentralManager, BTFXCharacteristic, BTFXPeripheral, BTFXService } from "../../FX/BluetoothFX/public";
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";

export function createMountedBluetoothClient(adapter: BTFXBluetoothClient | undefined, mountSignal: AbortSignal,
  permissions: () => readonly string[], authorise: (capability: string) => boolean): BTFXBluetoothClient {
  const scope = createMountedResourceScope(mountSignal, { maxResources: 8, budgets: { sessions: 8 } });
  const guard = () => {
    mountSignal.throwIfAborted();
    if (!permissions().includes("bluetooth.access") || !authorise("bluetooth.access"))
      throw new DOMException("The bluetooth.access capability is required.", "SecurityError");
  };
  const unavailable = Object.freeze({ apiAvailable: false, retrievesGrantedPeripherals: false, backgroundScanning: false as const, peripheralRole: false as const });
  const capabilities = () => mountSignal.aborted ? unavailable : adapter?.getCapabilities() ?? unavailable;
  return Object.freeze<BTFXBluetoothClient>({ getCapabilities: capabilities,
    createCentralManager(signal) {
      return scope.acquire(signal, (lease, release) => {
        const manager = adapter?.createCentralManager(lease);
        let disposed = false;
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          lease.removeEventListener("abort", dispose);
          try { manager?.dispose(); } finally { release(); }
        };
        lease.addEventListener("abort", dispose, { once: true });
        const check = () => { lease.throwIfAborted(); guard(); };
        const call = async <T>(operation: () => Promise<T>): Promise<T> => { check(); const result = await operation(); check(); return result; };
        const characteristic = (value: BTFXCharacteristic): BTFXCharacteristic => Object.freeze<BTFXCharacteristic>({ uuid: value.uuid,
          readValue: () => call(() => value.readValue()),
          writeValue: (data, response) => call(() => value.writeValue(data, response)),
          setNotifyValue: (enabled, listener) => call(() => value.setNotifyValue(enabled, listener && (data => {
            try { check(); } catch { manager?.dispose(); return; } listener(data);
          }))),
        });
        const service = (value: BTFXService): BTFXService => Object.freeze({ uuid: value.uuid, isPrimary: value.isPrimary,
          discoverCharacteristics: () => call(() => value.discoverCharacteristics()).then(values => Object.freeze(values.map(characteristic))) });
        const peripheral = (value: BTFXPeripheral): BTFXPeripheral => Object.freeze({ identifier: value.identifier, name: value.name,
          get isConnected() { try { check(); return value.isConnected; } catch { return false; } },
          connect: () => call(() => value.connect()), disconnect: () => value.disconnect(),
          discoverServices: () => call(() => value.discoverServices()).then(values => Object.freeze(values.map(service))) });
        const requireManager = () => { if (!manager) throw new DOMException("Web Bluetooth is unavailable.", "NotSupportedError"); return manager; };
        const result: BTFXCentralManager = Object.freeze<BTFXCentralManager>({ getCapabilities: () => lease.aborted ? unavailable : capabilities(),
          getAuthorizationStatus: async () => { try { check(); } catch { return lease.aborted ? "unavailable" : "denied"; } return manager?.getAuthorizationStatus() ?? "unavailable"; },
          requestAuthorization: request => call(() => requireManager().requestAuthorization(request)).then(peripheral),
          retrievePeripherals: () => call(() => requireManager().retrievePeripherals()).then(values => Object.freeze(values.map(peripheral))),
          dispose,
        });
        return result;
      }, manager => manager.dispose(), { sessions: 1 });
    },
  });
}
