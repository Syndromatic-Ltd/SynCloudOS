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

import { useInsertionEffect, useMemo } from "react";
import type { DFXQueue } from "../../../FX/DispatchFX/DFXQueue";
import { BTFXCentralManager, BTFXError, type BTFXCentralManagerDelegate } from "../../../FX/BluetoothFX/public";
import { bluetoothBindings, bluetoothManagers, deferredBluetoothTypes } from "../../../FX/BluetoothFX/internal/bluetoothBindings";
import { useSynWareContext } from "../SynWareContext";
import { bindFXFamily } from "../fx/bindFXFamily";
import { scosSessionsForApp } from "../scos/scosSessionRegistry";
/** A real component-owned central. Native scanning remains an explicit user action. */
export function useBluetooth(delegate: BTFXCentralManagerDelegate | null = null, queue: DFXQueue | null = null, options: Readonly<Record<string,unknown>> | null = null): BTFXCentralManager {
  const context=useSynWareContext();if(!context)throw new BTFXError("operationCancelled","useBluetooth requires a mounted application.");
  const central=useMemo(()=>{
    const sessions=scosSessionsForApp(context.appId).filter(candidate=>candidate.context===context || (candidate.context.signal===context.signal && candidate.context.runtimeInfo.id===context.runtimeInfo.id));
    if(sessions.length!==1)throw new BTFXError("operationCancelled",`Bluetooth application session is ${sessions.length?"ambiguous":"notRunning"}.`);
    const session=sessions[0]!;const Bound=bindFXFamily({BTFXCentralManager},context.appId).BTFXCentralManager;class ContextCentral extends Bound {}
    let ended=false;bluetoothBindings.set(ContextCentral,{resolve(){if(context.signal.aborted || !scosSessionsForApp(context.appId).includes(session))ended=true;if(ended)throw new BTFXError("operationCancelled","Bluetooth application session is ended.");return session;}});
    deferredBluetoothTypes.add(ContextCentral);return new ContextCentral(delegate,queue,options);
  },[context,delegate,queue,options]);
  useInsertionEffect(()=>{bluetoothManagers.get(central)!.activate();return()=>bluetoothManagers.get(central)!.dispose();},[central]);return central;
}
