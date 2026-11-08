/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { NSEUUID } from "../../Foundation/NSEUUID";
import { fxAttributedClass, observeFXSessionEnd } from "../../SynCloudOS/fxRuntimeContracts";
import type { DFXQueue } from "../DispatchFX/DFXQueue";
import { dispatchQueueForSession } from "../DispatchFX/internal/sessionBinding";
import { BTFXManager } from "./BTFXManager";
import type { BTFXManagerState } from "./BTFXManagerState";
import type { BTFXCentralManagerDelegate } from "./BTFXCentralManagerDelegate";
import { BTFXPeripheral } from "./BTFXPeripheral";
import type { BTFXUUID } from "./BTFXUUID";
import { BTFXError } from "./BTFXError";
import { bluetoothBinding, bluetoothManagers, deferredBluetoothTypes } from "./internal/bluetoothBindings";
import { bluetoothPortFor, bluetoothFailure } from "./internal/bluetoothPort";
import { peripherals, peripheralRecord, services, characteristics, descriptors, type PeripheralOwner } from "./internal/bluetoothObjects";
/** CBCentralManager. Construction is passive; scan presents one browser chooser. */
export class BTFXCentralManager extends BTFXManager {
  #binding; #session; #port; #generation; #queue; #delegate: BTFXCentralManagerDelegate | null;
  #watched=false; #stateQueued=false; #ended=false; #owner=new AbortController(); #scan: AbortController | undefined; #scanGeneration=0;
  #releaseState: (()=>void) | undefined; #releaseSession: (()=>void) | undefined; #releaseAccess: (()=>void) | undefined;
  #known=new Map<string,BTFXPeripheral>(); #peripheralOwner: PeripheralOwner;
  constructor(delegate: BTFXCentralManagerDelegate | null = null, queue: DFXQueue | null = null, options: Readonly<Record<string,unknown>> | null = null) {
    super(); this.#binding=bluetoothBinding(new.target);this.#session=this.#binding.resolve();this.#port=bluetoothPortFor(this.#session.context);this.#generation=this.#port.generation;
    if(options && Object.keys(options).length)throw new BTFXError("operationNotSupported","Native Bluetooth manager options are unavailable.");
    if(delegate && typeof delegate.centralManagerDidUpdateState!=="function")throw new BTFXError("invalidParameters","A central state delegate is required.");
    this.#delegate=delegate;this.#queue=queue??dispatchQueueForSession(this.#session).main;
    this.#peripheralOwner={live:()=>this.#live(),assert:()=>this.#assert(),enqueue:(p,work)=>{const generation=peripheralRecord(p).generation;this.#enqueue(()=>{if(generation===peripheralRecord(p).generation)work();});},operation:(p,action,complete)=>{
      this.#assert();const record=this.#owned(p), generation=record.generation;
      const deliver=(value: unknown,error:BTFXError|null)=>this.#enqueue(()=>{if(generation===record.generation)complete(value as never,error);});
      try { if(record.state!=="connected" || !record.connection)throw new BTFXError("notConnected");void action().then(value=>deliver(value,null),error=>deliver(null,bluetoothFailure(error))); } catch(error) { deliver(null,bluetoothFailure(error)); }
    }};
    bluetoothManagers.set(this,{activate:()=>this.#watch(),dispose:()=>this.#end()});if(!deferredBluetoothTypes.has(new.target))this.#watch();
  }
  get state(): BTFXManagerState { return this.#ended ? "unknown" : this.#port.state; }
  get delegate(): BTFXCentralManagerDelegate | null { return this.#delegate; }
  set delegate(value: BTFXCentralManagerDelegate | null) { this.#assert();this.#delegate=value; }
  get isScanning(): boolean { return !this.#ended && this.#scan!==undefined; }
  scanForPeripherals(serviceUUIDs: readonly BTFXUUID[] | null, options: Readonly<Record<string,unknown>> | null = null): void {
    this.#assert();if(options && Object.keys(options).length)throw new BTFXError("operationNotSupported","Native scan options are unavailable.");if(this.#port.state!=="poweredOn")throw new BTFXError("operationNotSupported","Bluetooth scanning is unavailable.");this.stopScan();const owner=new AbortController();this.#scan=owner;const generation=++this.#scanGeneration;
    void this.#port.scan(serviceUUIDs,AbortSignal.any([owner.signal,this.#owner.signal])).then(result=>{
      if(!this.#live() || generation!==this.#scanGeneration)return;
      let peripheral=this.#known.get(result.device.identifier.uuidString);
      if (!peripheral) {
        peripheral = Object.create(BTFXPeripheral.prototype) as BTFXPeripheral;
        peripherals.set(peripheral, {
          owner: this.#peripheralOwner, native: result.device, state: "disconnected",
          delegate: null, services: null, generation: 0, notificationCharacteristics: new Set(),
        });
        this.#known.set(result.device.identifier.uuidString, peripheral);
      }
      const selected=peripheral;this.#scan=undefined;this.#enqueue(()=>{if(generation===this.#scanGeneration)this.#delegate?.centralManagerDidDiscoverPeripheral?.(this,selected,result.advertisementData,result.rssi);});
    },()=>{if(generation===this.#scanGeneration)this.#scan=undefined;});
  }
  stopScan(): void { this.#scanGeneration++;this.#scan?.abort();this.#scan=undefined; }
  connect(peripheral: BTFXPeripheral, options: Readonly<Record<string,unknown>> | null = null): void {
    this.#assert();
    const p = this.#owned(peripheral);
    if (options && Object.keys(options).length) {
      throw new BTFXError("operationNotSupported", "Native connection options are unavailable.");
    }
    if (p.state === "connected" || p.state === "connecting") return;
    p.controller = new AbortController();
    p.state = "connecting";
    const generation = ++p.generation;
    void p.native.connect(AbortSignal.any([this.#owner.signal, p.controller.signal]), error => {
      if (!this.#live() || generation !== p.generation) return;
      this.#retireNotifications(peripheral, generation);
      const disconnectedGeneration = ++p.generation;
      p.state = "disconnected";
      p.connection = undefined;
      this.#enqueue(() => {
        if (disconnectedGeneration === p.generation) {
          this.#delegate?.centralManagerDidDisconnectPeripheral?.(this, peripheral, error ? bluetoothFailure(error) : null);
        }
      });
    }).then(connection => {
      if (!this.#live() || generation !== p.generation) {
        void connection.disconnect().catch(() => {});
        return;
      }
      p.connection = connection;
      p.state = "connected";
      this.#enqueue(() => {
        if (generation === p.generation) this.#delegate?.centralManagerDidConnect?.(this, peripheral);
      });
    }, error => {
      if (!this.#live() || generation !== p.generation) return;
      p.state = "disconnected";
      this.#enqueue(() => {
        if (generation === p.generation) {
          this.#delegate?.centralManagerDidFailToConnect?.(this, peripheral, bluetoothFailure(error));
        }
      });
    });
  }
  cancelPeripheralConnection(peripheral: BTFXPeripheral): void {
    this.#assert();
    const p = this.#owned(peripheral);
    if (p.state === "disconnected") return;
    this.#retireNotifications(peripheral, p.generation);
    const generation = ++p.generation;
    p.state = "disconnecting";
    const connection = p.connection;
    p.connection = undefined;
    const finish = (error: BTFXError | null) => {
      if (!this.#live() || generation !== p.generation) return;
      p.controller?.abort();
      p.state = "disconnected";
      this.#enqueue(() => {
        if (generation === p.generation) {
          this.#delegate?.centralManagerDidDisconnectPeripheral?.(this, peripheral, error);
        }
      });
    };
    if (connection) {
      void connection.disconnect().then(() => finish(null), error => finish(bluetoothFailure(error)));
    } else {
      p.controller?.abort();
      finish(null);
    }
  }
  retrievePeripherals(identifiers: readonly NSEUUID[]): readonly BTFXPeripheral[] { this.#assert();this.#port.assertAccess(this.#generation,true);return Object.freeze(identifiers.flatMap(identifier=>{const p=this.#known.get(identifier.uuidString);return p?[p]:[];})); }
  retrieveConnectedPeripherals(_serviceUUIDs: readonly BTFXUUID[]): readonly BTFXPeripheral[] {this.#assert();throw new BTFXError("operationNotSupported","System-wide connected peripheral enumeration is unavailable.");}
  #retireNotifications(peripheral: BTFXPeripheral, generation: number): void {
    const p = this.#owned(peripheral);
    for (const characteristic of p.notificationCharacteristics) {
      const value = characteristics.get(characteristic)!;
      if (services.get(value.service)!.generation !== generation) continue;
      value.isNotifying = false;
      value.notifyGeneration++;
      p.notificationCharacteristics.delete(characteristic);
    }
  }
  #watch(): void {
    if (this.#watched || this.#ended) return;
    this.#watched = true;
    this.#port.bindAccessLifetime();
    this.#releaseAccess = this.#port.observeAccessLoss(() => this.#end());
    this.#releaseSession = observeFXSessionEnd(this.#session, () => this.#end());
    this.#releaseState = this.#port.observeState?.(() => this.#queueState());
    this.#queueState();
  }
  #queueState(): void {
    if (this.#stateQueued || !this.#sessionLive()) return;
    this.#stateQueued = true;
    this.#queue.async(() => {
      this.#stateQueued = false;
      if (this.#sessionLive()) this.#delegate?.centralManagerDidUpdateState(this);
    });
  }
  #owned(peripheral:BTFXPeripheral){const p=peripheralRecord(peripheral);if(p.owner!==this.#peripheralOwner)throw new BTFXError("invalidHandle");return p;}
  #sessionLive():boolean{try{if(this.#ended || this.#generation!==this.#port.generation)return false;this.#binding.resolve();return true;}catch{return false;}}
  #assert():void{if(!this.#sessionLive())throw new BTFXError("operationCancelled","Bluetooth manager lifetime ended.");this.#port.assertAccess(this.#generation);this.#watch();}
  #live():boolean{try{this.#assert();return true;}catch{return false;}}
  #enqueue(work:()=>void):void{if(this.#live())this.#queue.async(()=>{if(this.#live())work();});}
  #end(): void {
    if (this.#ended) return;
    this.#ended = true;
    this.stopScan();
    this.#owner.abort();
    this.#delegate = null;
    for (const peripheral of this.#known.values()) {
      const p = peripheralRecord(peripheral);
      this.#retireNotifications(peripheral, p.generation);
      p.generation++;
      p.controller?.abort();
      p.state = "disconnected";
      p.delegate = null;
      for (const service of p.services ?? []) {
        for (const characteristic of services.get(service)?.characteristics ?? []) {
          const value = characteristics.get(characteristic)!;
          value.value = null;
          for (const descriptor of value.descriptors ?? []) descriptors.get(descriptor)!.value = null;
        }
      }
      p.services = null;
    }
    this.#releaseState?.();
    this.#releaseState = undefined;
    this.#releaseSession?.();
    this.#releaseSession = undefined;
    this.#releaseAccess?.();
    this.#releaseAccess = undefined;
  }
}
Object.defineProperty(BTFXCentralManager,fxAttributedClass,{value:true});
