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

import type { XRFXClient, XRFXSession } from "../../FX/XRFX/public";
import type { PrivacyApplicationPort } from "../HostServices/AppSDKHostServiceTypes";
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";

export function createMountedXRClient(adapter: XRFXClient | undefined, mountSignal: AbortSignal,
  entitlements: () => readonly string[], authorise: (capability: string) => boolean, privacy?: PrivacyApplicationPort): XRFXClient {
  const scope = createMountedResourceScope(mountSignal, { maxResources: 2, budgets: { sessions: 2 } });
  const guard = () => { mountSignal.throwIfAborted();
    if (!entitlements().includes("xr.session") || !authorise("xr.session")) throw new DOMException("Privacy authorisation requires the xr.session entitlement.", "SecurityError"); };
  const unavailable = Object.freeze({ apiAvailable: false, worldTracking: false as const, nativeARKit: false as const });
  const capabilities = () => mountSignal.aborted ? unavailable : adapter?.getCapabilities() ?? unavailable;
  return Object.freeze<XRFXClient>({ getCapabilities: capabilities,
    createSession(signal) {
      return scope.acquire(signal, (lease, release) => {
        const session = adapter?.createSession(lease);
        let disposed = false;
        let unbindPrivacy: (() => void) | undefined;
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          unbindPrivacy?.(); unbindPrivacy = undefined;
          lease.removeEventListener("abort", dispose);
          try { session?.dispose(); } finally { release(); }
        };
        const bindPrivacy = () => { if (privacy && !unbindPrivacy) unbindPrivacy = privacy.bindResource(dispose); };
        lease.addEventListener("abort", dispose, { once: true });
        const check = (active = false) => { lease.throwIfAborted(); guard(); if (active) privacy?.assertRequestAllowed(); };
        const requireSession = (active = false) => { check(active); if (!session) throw new DOMException("WebXR is unavailable.", "NotSupportedError"); return session; };
        const result: XRFXSession = Object.freeze<XRFXSession>({ getCapabilities: () => lease.aborted ? unavailable : capabilities(),
          getAuthorizationStatus: async () => {
            try { check(); } catch { return lease.aborted ? "unavailable" : "denied"; }
            if (!session) return "unavailable";
            const query = async () => { const status = await session.getAuthorizationStatus(); lease.throwIfAborted(); return status; };
            try { return privacy ? await privacy.getAuthorizationStatus(query) : await query(); }
            catch (error) { if (lease.aborted) return "unavailable"; throw error; }
          },
          isSupported: async configuration => { check(); return session?.isSupported(configuration) ?? false; },
          run: async (configuration, listener) => {
            requireSession(true);
            const operation = async () => {
              bindPrivacy();
              await requireSession(true).run(configuration, frame => {
                try { check(true); } catch { dispose(); return; } listener(frame);
              });
              try { check(true); } catch (error) { dispose(); throw error; }
            };
            return privacy ? privacy.request(operation, { signal: lease }) : operation();
          },
          pause: () => session?.pause() ?? Promise.resolve(),
          dispose,
        });
        return result;
      }, session => session.dispose(), { sessions: 1 });
    },
  });
}