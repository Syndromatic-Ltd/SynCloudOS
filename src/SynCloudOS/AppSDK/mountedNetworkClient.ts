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

import type { NWFXPathClient, NWFXPathMonitor, NWFXNetworkPathAdapter } from "../../FX/NetworkFX/NWFXPathMonitor";
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";
export function createMountedNetworkClient(
  adapter: NWFXNetworkPathAdapter,
  mountSignal: AbortSignal,
  permissions: () => readonly string[],
  authorise: (capability: "network.read") => boolean,
): NWFXPathClient {
  const scope = createMountedResourceScope(mountSignal, { maxResources: 8, budgets: { sessions: 8 } });
  const allowed = () => !mountSignal.aborted && permissions().includes("network.read") && authorise("network.read");
  const requireAccess = () => {
    mountSignal.throwIfAborted();
    if (!allowed()) throw new DOMException("SynWare capability network.read must be declared and authorised.", "SecurityError");
  };
  const authorizationStatus = () => !allowed() ? "denied" : adapter.capabilities().pathMonitoring ? "granted" : "unavailable";
  return Object.freeze<NWFXPathClient>({
    capabilities() { requireAccess(); return adapter.capabilities(); },
    authorizationStatus,
    requestAuthorization: authorizationStatus,
    createMonitor(signal) {
      requireAccess();
      return scope.acquire(signal, (lease, release) => {
        let cancelled = false;
        let started = false;
        let subscription: { dispose(): void } | undefined;
        const cancel = () => {
          if (cancelled) return;
          cancelled = true;
          lease.removeEventListener("abort", cancel);
          try { subscription?.dispose(); } finally { release(); }
        };
        lease.addEventListener("abort", cancel, { once: true });
        return Object.freeze<NWFXPathMonitor>({
          start(listener) {
            lease.throwIfAborted();
            requireAccess();
            if (cancelled || started) throw new DOMException("Network monitor already started or cancelled.", "InvalidStateError");
            started = true;
            const deliver = (path: Parameters<typeof listener>[0]) => {
              if (cancelled || lease.aborted) return;
              if (!allowed()) { cancel(); return; }
              listener(path);
            };
            try {
              subscription = adapter.subscribe(deliver);
              if (cancelled) subscription.dispose();
              const path = adapter.currentPath();
              if (path) deliver(path);
            } catch (error) { cancel(); throw error; }
          },
          cancel,
          dispose: cancel,
        });
      }, monitor => monitor.cancel(), { sessions: 1 });
    },
  });
}
