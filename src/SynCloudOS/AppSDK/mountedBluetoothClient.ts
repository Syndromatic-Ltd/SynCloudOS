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
import type { PrivacyApplicationPort } from "../HostServices/AppSDKHostServiceTypes";
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";

export function createMountedBluetoothClient(adapter: BTFXBluetoothClient | undefined, mountSignal: AbortSignal,
  entitlements: () => readonly string[], authorise: (capability: string) => boolean, privacy?: PrivacyApplicationPort): BTFXBluetoothClient {
  const scope = createMountedResourceScope(mountSignal, { maxResources: 8, budgets: { sessions: 8 } });
  const guard = () => {
    mountSignal.throwIfAborted();
    if (!entitlements().includes("bluetooth.access") || !authorise("bluetooth.access"))
      throw new DOMException("Privacy authorisation requires the bluetooth.access entitlement.", "SecurityError");
  };
  const unavailable = Object.freeze({ apiAvailable: false, retrievesGrantedPeripherals: false, backgroundScanning: false as const, peripheralRole: false as const });
  const capabilities = () => mountSignal.aborted ? unavailable : adapter?.getCapabilities() ?? unavailable;
  return Object.freeze<BTFXBluetoothClient>({ getCapabilities: capabilities,
    createCentralManager(signal) {
      return scope.acquire(signal, (lease, release) => {
        const manager = adapter?.createCentralManager(lease);
        let disposed = false;
        let unbindPrivacy: (() => void) | undefined;
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          unbindPrivacy?.(); unbindPrivacy = undefined;
          lease.removeEventListener("abort", dispose);
          try { manager?.dispose(); } finally { release(); }
        };
        const bindPrivacy = () => { if (privacy && !unbindPrivacy) unbindPrivacy = privacy.bindResource(dispose); };
        lease.addEventListener("abort", dispose, { once: true });
        const check = (active = false) => { lease.throwIfAborted(); guard(); if (active) privacy?.assertRequestAllowed(); };
        const call = async <T>(operation: () => Promise<T>): Promise<T> => { check(true); bindPrivacy(); const result = await operation(); check(true); return result; };
        const characteristic = (value: BTFXCharacteristic): BTFXCharacteristic => Object.freeze<BTFXCharacteristic>({ uuid: value.uuid,
          readValue: () => call(() => value.readValue()),
          writeValue: (data, response) => call(() => value.writeValue(data, response)),
          // Disabling an existing notification subscription remains possible after revocation.
          setNotifyValue: (enabled, listener) => enabled ? call(() => value.setNotifyValue(true, listener && (data => {
            try { check(true); } catch { dispose(); return; } listener(data);
          }))) : value.setNotifyValue(false),
        });
        const service = (value: BTFXService): BTFXService => Object.freeze({ uuid: value.uuid, isPrimary: value.isPrimary,
          discoverCharacteristics: () => call(() => value.discoverCharacteristics()).then(values => Object.freeze(values.map(characteristic))) });
        const peripheral = (value: BTFXPeripheral): BTFXPeripheral => Object.freeze({ identifier: value.identifier, name: value.name,
          get isConnected() { try { check(true); return value.isConnected; } catch { return false; } },
          connect: () => call(() => value.connect()), disconnect: () => value.disconnect(),
          discoverServices: () => call(() => value.discoverServices()).then(values => Object.freeze(values.map(service))) });
        const requireManager = () => { if (!manager) throw new DOMException("Web Bluetooth is unavailable.", "NotSupportedError"); return manager; };
        const result: BTFXCentralManager = Object.freeze<BTFXCentralManager>({ getCapabilities: () => lease.aborted ? unavailable : capabilities(),
          getAuthorizationStatus: async () => {
            try { check(); } catch { return lease.aborted ? "unavailable" : "denied"; }
            if (!manager) return "unavailable";
            const query = async () => { const status = await manager.getAuthorizationStatus(); lease.throwIfAborted(); return status; };
            try { return privacy ? await privacy.getAuthorizationStatus(query) : await query(); }
            catch (error) { if (lease.aborted) return "unavailable"; throw error; }
          },
          requestAuthorization: async request => {
            check(true);
            const operation = async () => {
              check(true); bindPrivacy();
              const selected = await requireManager().requestAuthorization(request);
              try { check(true); } catch (error) { selected.disconnect(); dispose(); throw error; }
              return selected;
            };
            const selected = privacy ? await privacy.request(operation, { signal: lease, dispose: value => value.disconnect() }) : await operation();
            check(true);
            return peripheral(selected);
          },
          retrievePeripherals: async () => {
            check(true);
            // Existing origin grants must not expose peripherals to a new app or
            // turn a passive retrieval into that app's first consent decision.
            if (privacy && privacy.authorizationStatus() !== "granted") throw new DOMException("Bluetooth access is not authorised for this application.", "NotAllowedError");
            return Object.freeze((await call(() => requireManager().retrievePeripherals())).map(peripheral));
          },
          dispose,
        });
        return result;
      }, manager => manager.dispose(), { sessions: 1 });
    },
  });
}