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

import { expect, it, vi } from "vitest";
import { NSEData, NSEUUID } from "../../../src/Foundation/public";
import { BTFXUUID } from "../../../src/FX/BluetoothFX/public";
import { BrowserBluetoothAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserBluetoothAdapter";
const ticks=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function fixture(){
 const descriptor={uuid:"00002901-0000-1000-8000-00805f9b34fb",readValue:vi.fn(async()=>new DataView(new TextEncoder().encode("Sensor").buffer)),writeValue:vi.fn(async()=>{})};
 const characteristic=Object.assign(new EventTarget(),{uuid:"00002a19-0000-1000-8000-00805f9b34fb",properties:{read:true,write:true,notify:true},value:new DataView(new Uint8Array([99,42,88]).buffer,1,1),readValue:vi.fn(async()=>characteristic.value),writeValueWithResponse:vi.fn(async()=>{}),writeValueWithoutResponse:vi.fn(async()=>{}),startNotifications:vi.fn(async()=>characteristic),stopNotifications:vi.fn(async()=>characteristic),getDescriptors:vi.fn(async()=>[descriptor])});
 const service={uuid:"0000180f-0000-1000-8000-00805f9b34fb",isPrimary:true,getCharacteristics:vi.fn(async()=>[characteristic])};
 const gatt={connected:false,connect:vi.fn(async()=>{gatt.connected=true;return gatt;}),disconnect:vi.fn(()=>{gatt.connected=false;}),getPrimaryServices:vi.fn(async()=>[service])};
 const device=Object.assign(new EventTarget(),{id:"opaque-origin-token-not-a-UUID",name:"Battery",gatt});
 const bluetooth=Object.assign(new EventTarget(),{requestDevice:vi.fn(async()=>device),getAvailability:vi.fn(async()=>true)});
 const adapter=new BrowserBluetoothAdapter({isSecureContext:true,browserNavigator:{bluetooth}});return{adapter,bluetooth,device,gatt,characteristic,descriptor};
}
it("uses one chooser, stable private UUIDs, empty advertisements and the Apple unavailable RSSI sentinel",async()=>{const f=fixture();expect(f.bluetooth.requestDevice).not.toHaveBeenCalled();await ticks();expect(f.adapter.state).toBe("poweredOn");const owner=new AbortController();const found=await f.adapter.scan([new BTFXUUID("180F")],owner.signal);expect(found.device.identifier).toBeInstanceOf(NSEUUID);expect(found.device.identifier.uuidString).not.toBe(f.device.id);expect(found.advertisementData).toEqual({});expect(found.rssi).toBe(127);const again=await f.adapter.scan(null,owner.signal);expect(again.device.identifier.isEqual(found.device.identifier)).toBe(true);expect(f.bluetooth.requestDevice).toHaveBeenNthCalledWith(1,{filters:[{services:["0000180f-0000-1000-8000-00805f9b34fb"]}],optionalServices:["0000180f-0000-1000-8000-00805f9b34fb"]});});
it("projects GATT descriptors and byte ranges, then removes notifications on disconnect",async()=>{const f=fixture();await ticks();const owner=new AbortController();const found=await f.adapter.scan(null,owner.signal);const connection=await found.device.connect(owner.signal,()=>{});const [service]=await connection.discoverServices(null);const [characteristic]=await service!.discoverCharacteristics(null);expect(characteristic!.properties).toBe(26);expect((await characteristic!.read()).bytes).toEqual(new Uint8Array([42]));await characteristic!.write(NSEData.from(new Uint8Array([7])),"withResponse");expect(f.characteristic.writeValueWithResponse).toHaveBeenCalledWith(new Uint8Array([7]));const [descriptor]=await characteristic!.discoverDescriptors();expect(await descriptor!.read()).toBe("Sensor");const received=vi.fn();await characteristic!.setNotify(true,received);f.characteristic.dispatchEvent(new Event("characteristicvaluechanged"));expect(received).toHaveBeenCalledOnce();await connection.disconnect();f.characteristic.dispatchEvent(new Event("characteristicvaluechanged"));expect(received).toHaveBeenCalledOnce();expect(f.gatt.disconnect).toHaveBeenCalledOnce();});
it("closes a late old browser GATT handle before allowing a replacement on the same device",async()=>{const f=fixture();await ticks();const owner=new AbortController();const found=await f.adapter.scan(null,owner.signal);let resolve!:(value:typeof f.gatt)=>void;f.gatt.connect.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));const old=found.device.connect(owner.signal,()=>{});await ticks();owner.abort();const next=found.device.connect(new AbortController().signal,()=>{});await ticks();expect(f.gatt.connect).toHaveBeenCalledTimes(1);resolve(f.gatt);await expect(old).rejects.toMatchObject({name:"AbortError"});const replacement=await next;expect(f.gatt.disconnect).toHaveBeenCalledOnce();expect(f.gatt.connected).toBe(true);await replacement.disconnect();expect(f.gatt.disconnect).toHaveBeenCalledTimes(2);});
it("does not enumerate origin grants, reports unavailable browser/radio state, and cancels chooser delivery",async()=>{const f=fixture();await ticks();const owner=new AbortController();let resolve!:(value:typeof f.device)=>void;f.bluetooth.requestDevice.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));const pending=f.adapter.scan(null,owner.signal);owner.abort();resolve(f.device);await expect(pending).rejects.toMatchObject({name:"AbortError"});expect(f.gatt.connect).not.toHaveBeenCalled();expect(new BrowserBluetoothAdapter({isSecureContext:false}).state).toBe("unsupported");});

it("stops a late notification enable after a newer disable without stopping a replacement enable",async()=>{const f=fixture();await ticks();const owner=new AbortController();const found=await f.adapter.scan(null,owner.signal);const connection=await found.device.connect(owner.signal,()=>{});const [service]=await connection.discoverServices(null);const [c]=await service!.discoverCharacteristics(null);let resolve!:(value:typeof f.characteristic)=>void;f.characteristic.startNotifications.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));const first=c!.setNotify(true,()=>{});await c!.setNotify(false,()=>{});resolve(f.characteristic);await first;expect(f.characteristic.stopNotifications).toHaveBeenCalledTimes(2);f.characteristic.startNotifications.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));const old=c!.setNotify(true,()=>{});await c!.setNotify(false,()=>{});await c!.setNotify(true,()=>{});resolve(f.characteristic);await old;expect(f.characteristic.stopNotifications).toHaveBeenCalledTimes(3);await connection.disconnect();});

it("owns and releases the browser availability listener with its last observer",()=>{const f=fixture();const add=vi.spyOn(f.bluetooth,"addEventListener"),remove=vi.spyOn(f.bluetooth,"removeEventListener");const first=f.adapter.observeState(()=>{}),second=f.adapter.observeState(()=>{});expect(add).toHaveBeenCalledTimes(1);first();expect(remove).not.toHaveBeenCalled();second();second();expect(remove).toHaveBeenCalledTimes(1);});
