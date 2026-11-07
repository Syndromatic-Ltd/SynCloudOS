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

import { useLayoutEffect, useMemo } from "react";
import type { BTFXCentralManager } from "../../../FX/BluetoothFX/public";
import { useSCOS } from "../scos/useSCOS";

/** Component-scoped passive device owner; requests remain explicit user actions. */
export function useBluetooth(): BTFXCentralManager {
  const client = useSCOS().bluetooth;
  const binding = useMemo(() => {
    let current: BTFXCentralManager | null = null;
    const requireOwner = () => {
      if (!current) throw new DOMException("The component device owner is not mounted.", "AbortError");
      return current;
    };
    const facade: BTFXCentralManager = Object.freeze<BTFXCentralManager>({
      getCapabilities: () => current?.getCapabilities() ?? Object.freeze({ apiAvailable: false, retrievesGrantedPeripherals: false, backgroundScanning: false, peripheralRole: false }),
      getAuthorizationStatus: () => current?.getAuthorizationStatus() ?? Promise.resolve("unavailable"),
      requestAuthorization: request => requireOwner().requestAuthorization(request),
      retrievePeripherals: () => requireOwner().retrievePeripherals(),
      dispose: () => current?.dispose(),
    });
    return { facade, mount() {
      const owner = client.createCentralManager(); current = owner;
      return () => { if (current === owner) current = null; owner.dispose(); };
    } };
  }, [client]);
  useLayoutEffect(() => binding.mount(), [binding]);
  return binding.facade;
}
