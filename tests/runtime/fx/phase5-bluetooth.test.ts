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

import { describe, expect, it, vi } from "vitest";
import { NSEData } from "../../../src/Foundation/public";
import { BrowserBluetoothAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserBluetoothAdapter";
import { createMountedBluetoothClient } from "../../../src/SynCloudOS/AppSDK/mountedBluetoothClient";

function fixture() {
  const characteristic = Object.assign(new EventTarget(), {
    uuid: "level", value: new DataView(new Uint8Array([42]).buffer),
    readValue: vi.fn(async () => new DataView(new Uint8Array([42]).buffer)),
    writeValueWithResponse: vi.fn(async (_data: Uint8Array) => {}),
    startNotifications: vi.fn(async () => characteristic), stopNotifications: vi.fn(async () => characteristic),
  });
  const service = { uuid: "battery", isPrimary: true, getCharacteristics: vi.fn(async () => [characteristic]) };
  const gatt = { connected: true, connect: vi.fn(async () => gatt), disconnect: vi.fn(), getPrimaryServices: vi.fn(async () => [service]) };
  const device = { id: "peripheral-1", name: "Battery", gatt };
  const bluetooth = { requestDevice: vi.fn(async () => device), getDevices: vi.fn(async () => [device]) };
  const adapter = new BrowserBluetoothAdapter({ isSecureContext: true, browserNavigator: { bluetooth } });
  return { adapter, bluetooth, device, gatt, characteristic };
}

describe("BluetoothFX browser and mounted ownership", () => {
  it("is passive, grants a selected peripheral, copies bytes and disconnects on disposal", async () => {
    const f = fixture(), manager = f.adapter.createCentralManager();
    expect(f.bluetooth.requestDevice).not.toHaveBeenCalled();
    expect(f.adapter.getCapabilities().apiAvailable).toBe(true);
    expect(await manager.getAuthorizationStatus()).toBe("granted");
    const peripheral = await manager.requestAuthorization({ filters: [{ services: ["battery_service"] }] });
    await peripheral.connect();
    const [service] = await peripheral.discoverServices();
    const [characteristic] = await service.discoverCharacteristics();
    expect((await characteristic.readValue()).bytes).toEqual(new Uint8Array([42]));
    await characteristic.writeValue(NSEData.from(new Uint8Array([7])));
    expect(f.characteristic.writeValueWithResponse).toHaveBeenCalledWith(new Uint8Array([7]));
    const values: number[] = [];
    await characteristic.setNotifyValue(true, value => values.push(value.bytes[0]));
    f.characteristic.dispatchEvent(new Event("characteristicvaluechanged"));
    expect(values).toEqual([42]);
    manager.dispose();
    f.characteristic.dispatchEvent(new Event("characteristicvaluechanged"));
    expect(values).toEqual([42]);
    expect(f.gatt.disconnect).toHaveBeenCalled();
    await expect(characteristic.readValue()).rejects.toMatchObject({ name: "AbortError" });
  });

  it("checks declarations and policy again for retained peripheral and characteristic handles", async () => {
    const f = fixture(), mount = new AbortController();
    let allowed = true;
    const client = createMountedBluetoothClient(f.adapter, mount.signal, () => ["bluetooth.access"], () => allowed);
    const manager = client.createCentralManager();
    const peripheral = await manager.requestAuthorization({ acceptAllDevices: true });
    await peripheral.connect();
    const [service] = await peripheral.discoverServices();
    const [characteristic] = await service.discoverCharacteristics();
    allowed = false;
    await expect(characteristic.readValue()).rejects.toMatchObject({ name: "SecurityError" });
    expect(f.characteristic.readValue).not.toHaveBeenCalled();
    await characteristic.setNotifyValue(false);
    expect(f.characteristic.stopNotifications).toHaveBeenCalledOnce();
    mount.abort();
    expect(f.gatt.disconnect).toHaveBeenCalled();
    const undeclared = createMountedBluetoothClient(f.adapter, new AbortController().signal, () => [], () => true).createCentralManager();
    expect(await undeclared.getAuthorizationStatus()).toBe("denied");
    await expect(undeclared.requestAuthorization({ acceptAllDevices: true })).rejects.toMatchObject({ name: "SecurityError" });
    undeclared.dispose();
  });

  it("rejects pending chooser immediately on revocation and discards a late grant", async () => {
    const f = fixture();
    let resolve!: (value: typeof f.device) => void;
    f.bluetooth.requestDevice.mockImplementation(() => new Promise(next => { resolve = next; }));
    const manager = f.adapter.createCentralManager();
    const request = manager.requestAuthorization({ acceptAllDevices: true });
    manager.dispose();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    resolve(f.device);
    await Promise.resolve();
    expect(f.gatt.disconnect).toHaveBeenCalled();
  });

  it("reports insecure and missing browser APIs honestly", async () => {
    const client = new BrowserBluetoothAdapter({ isSecureContext: false });
    expect(client.getCapabilities().apiAvailable).toBe(false);
    const manager = client.createCentralManager();
    expect(await manager.getAuthorizationStatus()).toBe("unavailable");
    await expect(manager.requestAuthorization({ acceptAllDevices: true })).rejects.toMatchObject({ name: "NotSupportedError" });
    manager.dispose();
  });

  it("releases aborted caller leases and withdraws owner capabilities", () => {
    const f = fixture(), mount = new AbortController();
    const client = createMountedBluetoothClient(f.adapter, mount.signal, () => ["bluetooth.access"], () => true);
    for (let index = 0; index < 12; index++) {
      const caller = new AbortController(), manager = client.createCentralManager(caller.signal);
      caller.abort();
      expect(manager.getCapabilities().apiAvailable).toBe(false);
    }
    mount.abort();
    expect(client.getCapabilities().apiAvailable).toBe(false);
  });
});
