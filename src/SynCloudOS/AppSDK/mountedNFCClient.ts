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
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";

/** Mounted declarations and policy are rechecked for each NFC operation and reading. */
export function createMountedNFCClient(
  adapter: NFXNFCClient | undefined,
  mountSignal: AbortSignal,
  permissions: () => readonly string[],
  authorise: (capability: string) => boolean,
): NFXNFCClient {
  const scope = createMountedResourceScope(mountSignal, { maxResources: 4, budgets: { sessions: 4 } });
  const requireCapability = (capability: "nfc.read" | "nfc.write") => {
    mountSignal.throwIfAborted();
    if (!permissions().includes(capability)) throw new DOMException(`SynWare capability ${capability} must be declared.`, "SecurityError");
    if (!authorise(capability)) throw new DOMException(`PolicyKit denied SynWare capability ${capability}.`, "SecurityError");
  };
  return Object.freeze<NFXNFCClient>({
    getCapabilities: () => !mountSignal.aborted && adapter ? adapter.getCapabilities() : Object.freeze({ reading: false, writing: false, makingReadOnly: false }),
    createReaderSession: signal => scope.acquire(signal, (lease, release) => {
      let disposed = false;
      const session = adapter?.createReaderSession(lease);
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        lease.removeEventListener("abort", dispose);
        try { session?.dispose(); } finally { release(); }
      };
      lease.addEventListener("abort", dispose, { once: true });
      const requireSession = (capability: "nfc.read" | "nfc.write") => {
        lease.throwIfAborted(); requireCapability(capability);
        if (!session) throw new DOMException("Web NFC is unavailable.", "NotSupportedError");
        return session;
      };
      return Object.freeze<NFXNDEFReaderSession>({
        getAuthorizationStatus: async () => {
          if (lease.aborted || !session) return "unavailable";
          const canInspect = ["nfc.read", "nfc.write"].some(capability => permissions().includes(capability) && authorise(capability));
          return canInspect ? session.getAuthorizationStatus() : "denied";
        },
        scan: async (listener, onError) => requireSession("nfc.read").scan(reading => {
          try { lease.throwIfAborted(); requireCapability("nfc.read"); } catch { dispose(); return; }
          listener(reading);
        }, error => {
          try { lease.throwIfAborted(); requireCapability("nfc.read"); } catch { dispose(); return; }
          onError?.(error);
        }),
        write: async (message, options) => requireSession("nfc.write").write(message, options),
        makeReadOnly: async () => requireSession("nfc.write").makeReadOnly(),
        dispose,
      });
    }, session => session.dispose(), { sessions: 1 }),
  });
}
