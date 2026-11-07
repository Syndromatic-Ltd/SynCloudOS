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
import { useSCOS } from "../scos/useSCOS";
import type { NWFXPathClient, NWFXPathMonitor } from "../../../FX/NetworkFX/public";
/** Passive facade; component cleanup cancels every monitor it created. */
export function useNetwork(): NWFXPathClient {
  const client = useSCOS().network;
  const binding = useMemo(() => {
    let mounted = false;
    const monitors = new Set<NWFXPathMonitor>();
    const facade = Object.freeze<NWFXPathClient>({
      capabilities: () => client.capabilities(),
      authorizationStatus: () => client.authorizationStatus(),
      requestAuthorization: () => client.requestAuthorization(),
      createMonitor(signal) {
        if (!mounted) throw new DOMException("Network component is not mounted.", "InvalidStateError");
        const monitor = client.createMonitor(signal);
        const cancel = () => { try { monitor.cancel(); } finally { monitors.delete(facadeMonitor); } };
        const facadeMonitor = Object.freeze<NWFXPathMonitor>({ start: listener => monitor.start(listener), cancel, dispose: cancel });
        monitors.add(facadeMonitor);
        return facadeMonitor;
      },
    });
    return { facade, mount() {
      mounted = true;
      return () => { mounted = false; for (const monitor of monitors) monitor.cancel(); monitors.clear(); };
    } };
  }, [client]);
  useLayoutEffect(() => binding.mount(), [binding]);
  return binding.facade;
}
