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
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";

export function createMountedXRClient(adapter: XRFXClient | undefined, mountSignal: AbortSignal,
  permissions: () => readonly string[], authorise: (capability: string) => boolean): XRFXClient {
  const scope = createMountedResourceScope(mountSignal, { maxResources: 2, budgets: { sessions: 2 } });
  const guard = () => { mountSignal.throwIfAborted();
    if (!permissions().includes("xr.session") || !authorise("xr.session")) throw new DOMException("The xr.session capability is required.", "SecurityError"); };
  const unavailable = Object.freeze({ apiAvailable: false, worldTracking: false as const, nativeARKit: false as const });
  const capabilities = () => mountSignal.aborted ? unavailable : adapter?.getCapabilities() ?? unavailable;
  return Object.freeze<XRFXClient>({ getCapabilities: capabilities,
    createSession(signal) {
      guard();
      return scope.acquire(signal, (lease, release) => {
        const session = adapter?.createSession(lease);
        let disposed = false;
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          lease.removeEventListener("abort", dispose);
          try { session?.dispose(); } finally { release(); }
        };
        lease.addEventListener("abort", dispose, { once: true });
        const check = () => { lease.throwIfAborted(); guard(); };
        const requireSession = () => { check(); if (!session) throw new DOMException("WebXR is unavailable.", "NotSupportedError"); return session; };
        const result: XRFXSession = Object.freeze<XRFXSession>({ getCapabilities: () => lease.aborted ? unavailable : capabilities(),
          getAuthorizationStatus: async () => { try { check(); } catch { return lease.aborted ? "unavailable" : "denied"; } return session?.getAuthorizationStatus() ?? "unavailable"; },
          isSupported: async configuration => { check(); return session?.isSupported(configuration) ?? false; },
          run: async (configuration, listener) => {
            await requireSession().run(configuration, frame => {
              try { check(); } catch { session?.dispose(); return; } listener(frame);
            });
            try { check(); } catch (error) { session?.dispose(); throw error; }
          },
          pause: () => session?.pause() ?? Promise.resolve(),
          dispose,
        });
        return result;
      }, session => session.dispose(), { sessions: 1 });
    },
  });
}
