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

import type { NFXNFCClient, NFXNDEFReaderSession } from "../../FX/NFCFX/public";
import type { PrivacyApplicationPort } from "../HostServices/AppSDKHostServiceTypes";
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";

/** Mounted NFC access combines immutable launch declarations with per-app privacy. */
export function createMountedNFCClient(
  adapter: NFXNFCClient | undefined,
  mountSignal: AbortSignal,
  entitlements: () => readonly string[],
  authorise: (capability: string) => boolean,
  privacy?: PrivacyApplicationPort,
): NFXNFCClient {
  const scope = createMountedResourceScope(mountSignal, { maxResources: 4, budgets: { sessions: 4 } });
  const requireCapability = (capability: "nfc.read" | "nfc.write") => {
    mountSignal.throwIfAborted();
    if (!entitlements().includes(capability)) throw new DOMException(`SynWare entitlement ${capability} must be declared.`, "SecurityError");
    if (!authorise(capability)) throw new DOMException(`Privacy authorisation denied ${capability}.`, "SecurityError");
    privacy?.assertRequestAllowed();
  };
  return Object.freeze<NFXNFCClient>({
    getCapabilities: () => !mountSignal.aborted && adapter ? adapter.getCapabilities() : Object.freeze({ reading: false, writing: false, makingReadOnly: false }),
    createReaderSession: signal => scope.acquire(signal, (lease, release) => {
      let disposed = false;
      let unbindPrivacy: (() => void) | undefined;
      const session = adapter?.createReaderSession(lease);
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        unbindPrivacy?.(); unbindPrivacy = undefined;
        lease.removeEventListener("abort", dispose);
        try { session?.dispose(); } finally { release(); }
      };
      const bindPrivacy = () => { if (privacy && !unbindPrivacy) unbindPrivacy = privacy.bindResource(dispose); };
      lease.addEventListener("abort", dispose, { once: true });
      const requireSession = (capability: "nfc.read" | "nfc.write") => {
        lease.throwIfAborted(); requireCapability(capability);
        if (!session) throw new DOMException("Web NFC is unavailable.", "NotSupportedError");
        return session;
      };
      const request = async (capability: "nfc.read" | "nfc.write", operation: (session: NFXNDEFReaderSession) => Promise<void>) => {
        requireSession(capability);
        const perform = async () => {
          bindPrivacy();
          await operation(requireSession(capability));
          requireSession(capability);
        };
        return privacy ? privacy.request(perform, { signal: lease }) : perform();
      };
      return Object.freeze<NFXNDEFReaderSession>({
        getAuthorizationStatus: async () => {
          if (lease.aborted || !session) return "unavailable";
          const canInspect = ["nfc.read", "nfc.write"].some(capability => entitlements().includes(capability) && authorise(capability));
          if (!canInspect) return "denied";
          const query = async () => { const status = await session.getAuthorizationStatus(); lease.throwIfAborted(); return status; };
          try { return privacy ? await privacy.getAuthorizationStatus(query) : await query(); }
          catch (error) { if (lease.aborted) return "unavailable"; throw error; }
        },
        scan: (listener, onError) => request("nfc.read", value => value.scan(reading => {
          try { requireSession("nfc.read"); } catch { dispose(); return; }
          listener(reading);
        }, error => {
          try { requireSession("nfc.read"); } catch { dispose(); return; }
          onError?.(error);
        })),
        write: (message, options) => request("nfc.write", value => value.write(message, options)),
        makeReadOnly: () => request("nfc.write", value => value.makeReadOnly()),
        dispose,
      });
    }, session => session.dispose(), { sessions: 1 }),
  });
}