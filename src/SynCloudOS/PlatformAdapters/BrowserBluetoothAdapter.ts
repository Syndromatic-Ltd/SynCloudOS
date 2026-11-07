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

import { NSEData } from "../../Foundation/public";
import type { BTFXAuthorizationStatus, BTFXBluetoothClient, BTFXCapabilities, BTFXCentralManager, BTFXCharacteristic, BTFXPeripheral, BTFXPeripheralRequest, BTFXService } from "../../FX/BluetoothFX/public";
import { browserDeviceOperation, browserDeviceOwner } from "./BrowserDeviceOperation";

interface BluetoothCharacteristicPort extends EventTarget {
  readonly uuid: string;
  readonly value?: DataView;
  readValue(): Promise<DataView>;
  writeValueWithResponse?(value: Uint8Array<ArrayBuffer>): Promise<void>;
  writeValueWithoutResponse?(value: Uint8Array<ArrayBuffer>): Promise<void>;
  startNotifications(): Promise<unknown>;
  stopNotifications(): Promise<unknown>;
}
interface BluetoothServicePort {
  readonly uuid: string;
  readonly isPrimary: boolean;
  getCharacteristics(): Promise<readonly BluetoothCharacteristicPort[]>;
}
interface BluetoothGATTPort {
  readonly connected: boolean;
  connect(): Promise<unknown>;
  disconnect(): void;
  getPrimaryServices(): Promise<readonly BluetoothServicePort[]>;
}
interface BluetoothDevicePort { readonly id: string; readonly name?: string; readonly gatt?: BluetoothGATTPort }
interface BluetoothPort {
  requestDevice(options: BTFXPeripheralRequest): Promise<BluetoothDevicePort>;
  getDevices?(): Promise<readonly BluetoothDevicePort[]>;
}
export interface BrowserBluetoothOptions {
  readonly isSecureContext: boolean;
  readonly browserNavigator?: { readonly bluetooth?: BluetoothPort } | null;
}

function snapshot(value: DataView): NSEData { return NSEData.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)); }

/** Central-role GATT only. Construction never opens a chooser or connects. */
export class BrowserBluetoothAdapter implements BTFXBluetoothClient {
  constructor(private readonly options: BrowserBluetoothOptions) {}
  getCapabilities(): BTFXCapabilities {
    const bluetooth = this.options.browserNavigator?.bluetooth;
    return Object.freeze({ apiAvailable: this.options.isSecureContext && typeof bluetooth?.requestDevice === "function",
      retrievesGrantedPeripherals: this.options.isSecureContext && typeof bluetooth?.getDevices === "function",
      backgroundScanning: false, peripheralRole: false });
  }
  createCentralManager(parent?: AbortSignal): BTFXCentralManager {
    const owner = browserDeviceOwner(parent), signal = owner.signal;
    const peripherals = new Map<string, BTFXPeripheral>(), devices = new Set<BluetoothDevicePort>();
    const notificationCleanup = new Set<() => void>();
    let authorization: BTFXAuthorizationStatus = "unknown";
    const requirePort = () => {
      signal.throwIfAborted();
      if (!this.getCapabilities().apiAvailable) throw new DOMException("Web Bluetooth is unavailable.", "NotSupportedError");
      return this.options.browserNavigator!.bluetooth!;
    };
    const run = <T>(operation: () => Promise<T>, discard?: (value: T) => void) => browserDeviceOperation(signal, operation, discard);
    const characteristic = (port: BluetoothCharacteristicPort): BTFXCharacteristic => {
      let cleanup: (() => void) | undefined;
      let notificationGeneration = 0;
      return Object.freeze<BTFXCharacteristic>({ uuid: port.uuid,
        readValue: () => run(() => port.readValue()).then(snapshot),
        writeValue: (value, withResponse = true) => run(() => {
          const method = withResponse ? port.writeValueWithResponse : port.writeValueWithoutResponse;
          if (!method) throw new DOMException("This write mode is unavailable.", "NotSupportedError");
          return method.call(port, new Uint8Array(NSEData.from(value).bytes));
        }),
        async setNotifyValue(enabled, listener) {
          signal.throwIfAborted();
          const generation = ++notificationGeneration;
          cleanup?.(); cleanup = undefined;
          if (!enabled) { await run(() => port.stopNotifications()); return; }
          if (!listener) throw new TypeError("A notification listener is required.");
          const receive = () => { if (!signal.aborted && generation === notificationGeneration && port.value) listener(snapshot(port.value)); };
          const remove = () => { port.removeEventListener("characteristicvaluechanged", receive); notificationCleanup.delete(remove); };
          cleanup = remove; notificationCleanup.add(remove);
          port.addEventListener("characteristicvaluechanged", receive);
          try { await run(() => port.startNotifications()); }
          catch (error) { remove(); throw error; }
          if (generation !== notificationGeneration) remove();
        },
      });
    };
    const service = (port: BluetoothServicePort): BTFXService => Object.freeze({ uuid: port.uuid, isPrimary: port.isPrimary,
      discoverCharacteristics: () => run(() => port.getCharacteristics()).then(values => Object.freeze(values.map(characteristic))) });
    const peripheral = (device: BluetoothDevicePort): BTFXPeripheral => {
      const previous = peripherals.get(device.id);
      if (previous) return previous;
      devices.add(device);
      const gatt = () => { signal.throwIfAborted(); if (!device.gatt) throw new DOMException("GATT is unavailable.", "NotSupportedError"); return device.gatt; };
      const value: BTFXPeripheral = Object.freeze({ identifier: device.id, name: device.name ?? null,
        get isConnected() { return !signal.aborted && device.gatt?.connected === true; },
        connect: () => run(() => gatt().connect(), () => device.gatt?.disconnect()).then(() => undefined),
        disconnect: () => { device.gatt?.disconnect(); },
        discoverServices: () => run(() => gatt().getPrimaryServices()).then(values => Object.freeze(values.map(service))),
      });
      peripherals.set(device.id, value); return value;
    };
    signal.addEventListener("abort", () => {
      for (const cleanup of notificationCleanup) cleanup();
      for (const device of devices) device.gatt?.disconnect();
      devices.clear(); peripherals.clear();
    }, { once: true });
    return Object.freeze<BTFXCentralManager>({
      getCapabilities: () => signal.aborted ? Object.freeze({ ...this.getCapabilities(), apiAvailable: false, retrievesGrantedPeripherals: false }) : this.getCapabilities(),
      getAuthorizationStatus: async () => {
        if (signal.aborted || !this.getCapabilities().apiAvailable) return "unavailable";
        const port = requirePort();
        if (port.getDevices) {
          try { return (await run(() => port.getDevices!())).length > 0 ? "granted" : "prompt"; }
          catch { if (signal.aborted) return "unavailable"; }
        }
        return authorization;
      },
      requestAuthorization: (request) => run(() => {
        const port = requirePort();
        if (request.acceptAllDevices === true ? request.filters !== undefined : !request.filters?.length)
          throw new TypeError("Choose non-empty filters or acceptAllDevices, exclusively.");
        return port.requestDevice(request);
      }, device => device.gatt?.disconnect()).then(device => { authorization = "granted"; return peripheral(device); }, error => {
        if (error instanceof DOMException && error.name === "NotAllowedError") authorization = "denied";
        throw error;
      }),
      retrievePeripherals: () => run(() => {
        const port = requirePort();
        if (!port.getDevices) throw new DOMException("Retrieving granted peripherals is unavailable.", "NotSupportedError");
        return port.getDevices();
      }).then(values => Object.freeze(values.map(peripheral))),
      dispose: owner.dispose,
    });
  }
}
