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

import type { PrivacyApplicationPort } from "../HostServices/AppSDKHostServiceTypes";
import { BTFXError } from "../../FX/BluetoothFX/BTFXError";
import { NSEData } from "../../Foundation/NSEData";
import { bluetoothFailure, isBluetoothDenial, type BluetoothAdapter, type BluetoothPort, type BTDevice, type BTConnection, type BTService, type BTCharacteristic, type BTDescriptor } from "../../FX/BluetoothFX/internal/bluetoothPort";
/** All native work retains the generation in which access was granted. */
export function createMountedBluetoothPort(adapter: BluetoothAdapter | undefined, signal: AbortSignal, entitlements: () => readonly string[], authorise: (capability: string) => boolean, privacy?: PrivacyApplicationPort, observeAccess: (listener: () => void) => () => void = () => () => {}): BluetoothPort {
  let generation = 0;
  let releasePrivacy: (() => void) | undefined;
  let previousAuthorization = privacy?.authorizationStatus();
  const observers = new Set<() => void>();
  const stateObservers = new Set<() => void>();
  const live = new Set<() => void>();
  const allowed = () => {
    try {
      return !signal.aborted && entitlements().includes("bluetooth.access") && authorise("bluetooth.access");
    } catch {
      return false;
    }
  };
  const managerState = (): BluetoothPort["state"] => {
    const authorization = privacy?.authorizationStatus();
    if (!allowed() || authorization === "denied" || authorization === "unavailable") return "unauthorized";
    return adapter?.state ?? "unsupported";
  };
  let previousState = managerState();
  const invalidate = () => {
    generation++;
    for (const stop of [...live]) stop();
    for (const observer of [...observers]) observer();
  };
  // The mounted host observes privacy independently of resource leases. A denied
  // manager cannot acquire a lease, but must still see a later withdrawal.
  const releaseAccess = observeAccess(() => {
    const authorization = privacy?.authorizationStatus();
    const privacyLost = authorization !== previousAuthorization && authorization !== "granted";
    previousAuthorization = authorization;
    if (!allowed() || privacyLost) invalidate();
    const state = managerState();
    if (state !== previousState) {
      previousState = state;
      for (const observer of [...stateObservers]) observer();
    }
  });
  const abort = () => {
    invalidate();
    releaseAccess();
    releasePrivacy?.();
    releasePrivacy = undefined;
    observers.clear();
    stateObservers.clear();
  };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const assertAccess = (captured: number, granted = false) => {
    if (signal.aborted || captured !== generation) {
      throw new BTFXError("operationCancelled", "Bluetooth lifetime ended.");
    }
    if (!allowed()) {
      throw new BTFXError("operationNotSupported", "The bluetooth.access launch entitlement or authorization is missing.");
    }
    try {
      privacy?.assertRequestAllowed();
      if (granted && privacy && privacy.authorizationStatus() !== "granted") {
        throw new DOMException("Bluetooth consent is required.", "NotAllowedError");
      }
    } catch (error) {
      throw bluetoothFailure(error);
    }
  };
  const bindAccessLifetime = () => {
    if (!privacy || releasePrivacy) return;
    try {
      releasePrivacy = privacy.bindResource(() => {
        releasePrivacy = undefined;
        // Avoid counting the same withdrawal again when the store publishes it.
        previousAuthorization = privacy.authorizationStatus();
        invalidate();
      });
    } catch {
      // Construction while denied stays passive; releaseAccess remains active.
    }
  };
  const wrapDevice = (device: BTDevice, captured: number): BTDevice => Object.freeze<BTDevice>({ identifier: device.identifier, name: device.name,
    async connect(requestSignal, disconnected) {
      assertAccess(captured, true); requestSignal.throwIfAborted(); bindAccessLifetime();
      if (live.size >= 8) throw new BTFXError("connectionLimitReached");
      const owner = new AbortController(); const combined = AbortSignal.any([signal, requestSignal, owner.signal]);
      let raw: BTConnection | undefined; let closing: Promise<void> | undefined;
      const current = () => captured === generation && !combined.aborted;
      const check = () => { assertAccess(captured, true); combined.throwIfAborted(); };
      const failure = (error: unknown) => { if (current() && isBluetoothDenial(error)) privacy?.observe("denied"); return bluetoothFailure(error); };
      const closeNative = (report: boolean) => {
        if (!raw) return Promise.resolve();
        if (!closing) { let done!: () => void; let fail!: (error: unknown) => void; closing = new Promise<void>((resolve,reject) => { done=resolve; fail=reject; }); void (async () => { try { await raw!.disconnect(); if(report) check(); } catch(error) { if(report) throw failure(error); } })().then(done,fail); }
        return closing;
      };
      const stop = () => { live.delete(stop); combined.removeEventListener("abort", stop); owner.abort(); void closeNative(false).catch(() => {}); };
      live.add(stop); combined.addEventListener("abort", stop, { once: true });
      const perform = async <T>(operation: () => Promise<T>): Promise<T> => { try { check(); const value = await operation(); check(); return value; } catch(error) { throw failure(error); } };
      const descriptor = (value: BTDescriptor): BTDescriptor => Object.freeze<BTDescriptor>({ uuid: value.uuid, read: () => perform(() => value.read()).then(data => data instanceof NSEData ? NSEData.from(data) : data), write: data => perform(() => value.write(NSEData.from(data))) });
      const characteristic = (value: BTCharacteristic): BTCharacteristic => Object.freeze<BTCharacteristic>({ uuid: value.uuid, properties: value.properties, read: () => perform(() => value.read()).then(NSEData.from), write: (data,type) => perform(() => value.write(NSEData.from(data),type)), discoverDescriptors: () => perform(() => value.discoverDescriptors()).then(values => values.map(descriptor)), setNotify: (enabled,listener) => perform(() => value.setNotify(enabled,data => { if(!current())return; try { check(); listener(NSEData.from(data)); } catch(error) { failure(error); } })) });
      const service = (value: BTService): BTService => Object.freeze<BTService>({ uuid: value.uuid, isPrimary: value.isPrimary, discoverCharacteristics: uuids => perform(() => value.discoverCharacteristics(uuids)).then(values => values.map(characteristic)) });
      try { raw = await device.connect(combined, error => { if(!current())return; if(error && isBluetoothDenial(error)) { failure(error); return; } try { check(); disconnected(error); } finally { stop(); } }); check(); }
      catch(error) { const converted = failure(error); await closeNative(false); stop(); throw converted; }
      return Object.freeze<BTConnection>({ discoverServices: uuids => perform(() => raw!.discoverServices(uuids)).then(values => values.map(service)), async disconnect() { try { check(); await closeNative(true); } finally { stop(); } } });
    },
  });
  return Object.freeze<BluetoothPort>({
    observeState(listener) {
      stateObservers.add(listener);
      const releaseNative = adapter?.observeState?.(() => {
        previousState = managerState();
        listener();
      });
      let released = false;
      return () => {
        if (released) return;
        released = true;
        stateObservers.delete(listener);
        releaseNative?.();
      };
    },
    get generation() { return generation; }, assertAccess, bindAccessLifetime, observeAccessLoss(listener) { observers.add(listener); return () => { observers.delete(listener); }; },
    get authorization() { if(!allowed())return "restricted"; const status=privacy?.authorizationStatus(); return status === "denied" || status === "unavailable" ? "denied" : status === "granted" ? "allowedAlways" : "notDetermined"; },
    get state() { return managerState(); },
    async scan(services, requestSignal) {
      const captured=generation; assertAccess(captured); requestSignal.throwIfAborted(); bindAccessLifetime();
      if(!adapter || adapter.state !== "poweredOn")throw new BTFXError("operationNotSupported", "Bluetooth scanning is unavailable.");
      const combined=AbortSignal.any([signal,requestSignal]);
      const operation=async (lease: AbortSignal) => { try { assertAccess(captured); lease.throwIfAborted(); const result=await adapter.scan(services,lease); assertAccess(captured); lease.throwIfAborted(); return result; } catch(error) { if(captured === generation && !combined.aborted && isBluetoothDenial(error))privacy?.observe("denied"); throw bluetoothFailure(error); } };
      const result=privacy ? await privacy.request(operation,{ signal:combined }) : await operation(combined);
      assertAccess(captured); combined.throwIfAborted(); return { ...result, device:wrapDevice(result.device,captured) };
    },
  });
}
