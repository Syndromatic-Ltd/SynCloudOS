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

import { NSEData } from "../../Foundation/NSEData";
import { NSEUUID } from "../../Foundation/NSEUUID";
import { BTFXUUID } from "../../FX/BluetoothFX/BTFXUUID";
import { BTFXCharacteristicProperties } from "../../FX/BluetoothFX/BTFXCharacteristicProperties";
import type { BTFXManagerState } from "../../FX/BluetoothFX/BTFXManagerState";
import type { BluetoothAdapter, BTConnection, BTCharacteristic, BTService, BTDescriptor, BTDevice, BTDiscovery } from "../../FX/BluetoothFX/internal/bluetoothPort";
interface Descriptor extends EventTarget { readonly uuid:string; readValue():Promise<DataView>; writeValue(value:Uint8Array<ArrayBuffer>):Promise<void>; }
interface Characteristic extends EventTarget {readonly uuid:string;readonly properties:Readonly<Record<string,boolean>>;readonly value?:DataView;readValue():Promise<DataView>;writeValueWithResponse?(value:Uint8Array<ArrayBuffer>):Promise<void>;writeValueWithoutResponse?(value:Uint8Array<ArrayBuffer>):Promise<void>;getDescriptors():Promise<readonly Descriptor[]>;startNotifications():Promise<unknown>;stopNotifications():Promise<unknown>;}
interface Service {readonly uuid:string;readonly isPrimary:boolean;getCharacteristics():Promise<readonly Characteristic[]>;}
interface GATT {readonly connected:boolean;connect():Promise<GATT>;disconnect():void;getPrimaryServices():Promise<readonly Service[]>;}
interface Device extends EventTarget {readonly id:string;readonly name?:string;readonly gatt?:GATT;}
interface Bluetooth extends EventTarget {requestDevice(options: {acceptAllDevices?:boolean;filters?:readonly {services:readonly string[]}[];optionalServices?:readonly string[]}):Promise<Device>;getAvailability?():Promise<boolean>;}
export interface BrowserBluetoothOptions {readonly isSecureContext:boolean;readonly browserNavigator?:{readonly bluetooth?:Bluetooth}|null;}
const identifiers=new WeakMap<Bluetooth,Map<string,NSEUUID>>();
// Browser GATT objects are shared per origin/device: serialize owners until a retired
// pending connect has settled and released its exact native handle.
const connections=new WeakMap<GATT,Promise<void>>();
const expanded=(uuid:BTFXUUID)=> (uuid.data.count===16?uuid.uuidString:`${uuid.uuidString.padStart(8,"0")}-0000-1000-8000-00805F9B34FB`).toLowerCase();
const snapshot=(value:DataView)=>NSEData.from(new Uint8Array(value.buffer,value.byteOffset,value.byteLength));
export class BrowserBluetoothAdapter implements BluetoothAdapter {
 #state:BTFXManagerState="unknown";#observers=new Set<()=>void>();#bluetooth:Bluetooth|undefined;#availabilityChanged:((event:Event)=>void)|undefined;#refreshAvailability:(()=>void)|undefined;
 constructor(options:BrowserBluetoothOptions){this.#bluetooth=options.isSecureContext?options.browserNavigator?.bluetooth:undefined;if(!this.#bluetooth?.requestDevice){this.#state="unsupported";return;}const bluetooth=this.#bluetooth;
  const update=(available:boolean)=>{this.#state=available?"poweredOn":"poweredOff";this.#observers.forEach(observer=>observer());};
  this.#refreshAvailability=()=>{if(bluetooth.getAvailability)void bluetooth.getAvailability().then(update,()=>{this.#state="unknown";this.#observers.forEach(observer=>observer());});};this.#refreshAvailability();
  this.#availabilityChanged=event=>{const available=(event as Event&{value?:unknown}).value;if(typeof available==="boolean")update(available);};
 }
 get state():BTFXManagerState{return this.#state;}
 observeState(listener:()=>void):()=>void{if(!this.#observers.size && this.#availabilityChanged){this.#bluetooth?.addEventListener?.("availabilitychanged",this.#availabilityChanged);this.#refreshAvailability?.();}this.#observers.add(listener);let released=false;return()=>{if(released)return;released=true;this.#observers.delete(listener);if(!this.#observers.size && this.#availabilityChanged)this.#bluetooth?.removeEventListener?.("availabilitychanged",this.#availabilityChanged);};}
 async scan(services:readonly BTFXUUID[]|null,signal:AbortSignal):Promise<BTDiscovery>{
  signal.throwIfAborted();if(!this.#bluetooth || this.#state!=="poweredOn")throw new DOMException("Bluetooth radio availability is unknown or unavailable.","NotSupportedError");
  const uuids=services?.map(expanded);const device=await this.#bluetooth.requestDevice(uuids?.length?{filters:uuids.map(uuid=>({services:[uuid]})),optionalServices:uuids}:{acceptAllDevices:true});signal.throwIfAborted();
  let ids=identifiers.get(this.#bluetooth);if(!ids){ids=new Map();identifiers.set(this.#bluetooth,ids);}let identifier=ids.get(device.id);if(!identifier){identifier=new NSEUUID();ids.set(device.id,identifier);}
  const native:BTDevice=Object.freeze<BTDevice>({identifier,name:device.name??null,connect:async(owner,disconnected)=>{
   owner.throwIfAborted();const gatt=device.gatt;if(!gatt)throw new DOMException("GATT is unavailable.","NotSupportedError");
   const prior=connections.get(gatt)??Promise.resolve();let release!:()=>void;const lease=new Promise<void>(resolve=>{release=resolve;});connections.set(gatt,prior.then(()=>lease));await prior;
   try{owner.throwIfAborted();}catch(error){release();throw error;}
   let server:GATT|undefined;let stopped=false;const cleanups=new Set<()=>void>();
   const remove=()=>{for(const cleanup of [...cleanups])cleanup();cleanups.clear();device.removeEventListener("gattserverdisconnected",lost);owner.removeEventListener("abort",aborted);};
   const close=()=>{if(stopped)return;stopped=true;remove();try{server?.disconnect();}finally{release();}};
   const aborted=()=>{if(server)close();};const lost=()=>{if(stopped)return;stopped=true;remove();release();if(!owner.aborted)disconnected(null);};
   owner.addEventListener("abort",aborted,{once:true});device.addEventListener("gattserverdisconnected",lost);
   try{server=await gatt.connect();owner.throwIfAborted();}catch(error){close();throw error;}
   const check=()=>{owner.throwIfAborted();if(stopped)throw new DOMException("The connection ended.","AbortError");};
   const run=async<T>(work:()=>Promise<T>):Promise<T>=>{check();const value=await work();check();return value;};
   const descriptor=(value:Descriptor):BTDescriptor=>Object.freeze<BTDescriptor>({uuid:new BTFXUUID(value.uuid),read:()=>run(()=>value.readValue()).then(data=>{const uuid=new BTFXUUID(value.uuid);if(uuid.isEqual(new BTFXUUID("2901")))return new TextDecoder("utf-8",{fatal:true}).decode(data);if(["2900","2902","2903"].some(id=>uuid.isEqual(new BTFXUUID(id)))){if(data.byteLength!==2)throw new DOMException("Malformed descriptor.","DataError");return data.getUint16(0,true);}return snapshot(data);}),write:data=>run(()=>value.writeValue(new Uint8Array(data.bytes)))});
   const characteristic=(value:Characteristic):BTCharacteristic=>{let removeNotify:(()=>void)|undefined;let generation=0;let wantsNotifications=false;return Object.freeze<BTCharacteristic>({uuid:new BTFXUUID(value.uuid),properties:Object.entries(BTFXCharacteristicProperties).reduce((bits,[name,bit])=>bits|(value.properties[name]?bit:0),0),read:()=>run(()=>value.readValue()).then(snapshot),write:(data,type)=>run(()=>{const method=type==="withResponse"?value.writeValueWithResponse:value.writeValueWithoutResponse;if(!method)throw new DOMException("Write mode unavailable.","NotSupportedError");return method.call(value,new Uint8Array(data.bytes));}),discoverDescriptors:()=>run(()=>value.getDescriptors()).then(values=>values.map(descriptor)),async setNotify(enabled,listener){check();wantsNotifications=enabled;const captured=++generation;removeNotify?.();removeNotify=undefined;if(!enabled){await run(()=>value.stopNotifications());return;}const receive=()=>{if(!owner.aborted && !stopped && captured===generation && value.value)listener(snapshot(value.value));};const cleanup=()=>{value.removeEventListener("characteristicvaluechanged",receive);cleanups.delete(cleanup);};removeNotify=cleanup;cleanups.add(cleanup);value.addEventListener("characteristicvaluechanged",receive);try{await run(()=>value.startNotifications());if(captured!==generation){cleanup();if(!wantsNotifications)await run(()=>value.stopNotifications());}}catch(error){cleanup();throw error;}}});};
   const service=(value:Service):BTService=>Object.freeze<BTService>({uuid:new BTFXUUID(value.uuid),isPrimary:value.isPrimary,discoverCharacteristics:uuids=>run(()=>value.getCharacteristics()).then(values=>values.filter(value=>!uuids || uuids.some(uuid=>uuid.isEqual(new BTFXUUID(value.uuid)))).map(characteristic))});
   return Object.freeze<BTConnection>({discoverServices:uuids=>run(()=>server!.getPrimaryServices()).then(values=>values.filter(value=>!uuids || uuids.some(uuid=>uuid.isEqual(new BTFXUUID(value.uuid)))).map(service)),async disconnect(){check();close();}});
  }});
  // Apple's CBCentralManager.h reserves 127 for unavailable RSSI. No advertisement
  // fields are synthesized from chooser names, filters or GATT service results.
  return Object.freeze({device:native,advertisementData:Object.freeze({}),rssi:127});
 }
}
