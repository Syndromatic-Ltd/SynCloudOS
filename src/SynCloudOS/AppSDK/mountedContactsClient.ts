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

import type { CNFXCapabilities, CNFXContactsClient, CNFXContactStore } from "../../FX/ContactsFX/public";
import type { PrivacyApplicationPort } from "../HostServices/AppSDKHostServiceTypes";
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";

const unavailable: CNFXCapabilities = Object.freeze({ contactPicker: false, persistentAccess: false });

/** Mounted contact selection. Browser picker access and per-app privacy remain separate. */
export function createMountedContactsClient(
  adapter: CNFXContactsClient | undefined,
  mountSignal: AbortSignal,
  entitlements: () => readonly string[],
  authorise: (capability: string) => boolean,
  privacy?: PrivacyApplicationPort,
): CNFXContactsClient {
  const scope = createMountedResourceScope(mountSignal, { maxResources: 8, budgets: { sessions: 8 } });
  const requireAccess = (signal: AbortSignal) => {
    signal.throwIfAborted();
    if (!entitlements().includes("contacts.select")) throw new DOMException("SynWare entitlement contacts.select must be declared.", "SecurityError");
    if (!authorise("contacts.select")) throw new DOMException("Privacy authorisation denied contacts.select.", "SecurityError");
    privacy?.assertRequestAllowed();
    if (!adapter) throw new DOMException("Contact selection is unavailable.", "NotSupportedError");
  };
  return Object.freeze({
    getCapabilities: () => mountSignal.aborted ? unavailable : adapter?.getCapabilities() ?? unavailable,
    createContactStore(signal?: AbortSignal): CNFXContactStore {
      return scope.acquire(signal, (lease, release) => {
        const store = adapter?.createContactStore(lease);
        const capabilities = () => lease.aborted ? unavailable : store?.getCapabilities() ?? unavailable;
        let disposed = false;
        let unbindPrivacy: (() => void) | undefined;
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          unbindPrivacy?.(); unbindPrivacy = undefined;
          lease.removeEventListener("abort", dispose);
          try { store?.dispose(); } finally { release(); }
        };
        const bindPrivacy = () => { if (privacy && !unbindPrivacy) unbindPrivacy = privacy.bindResource(dispose); };
        lease.addEventListener("abort", dispose, { once: true });
        return Object.freeze<CNFXContactStore>({
          getCapabilities: capabilities,
          async getAuthorizationStatus() {
            if (lease.aborted || !store) return "unavailable";
            if (!entitlements().includes("contacts.select") || !authorise("contacts.select")) return "denied";
            const query = async () => { const status = await store.getAuthorizationStatus(); lease.throwIfAborted(); return status; };
            try { return privacy ? await privacy.getAuthorizationStatus(query) : await query(); }
            catch (error) { if (lease.aborted) return "unavailable"; throw error; }
          },
          async requestAccess(options) {
            requireAccess(lease);
            const requestSignal = options?.signal ? AbortSignal.any([lease, options.signal]) : lease;
            const operation = async (signal: AbortSignal) => {
              requireAccess(lease); bindPrivacy();
              const contacts = await store!.requestAccess({ ...options, signal });
              requireAccess(lease); signal.throwIfAborted();
              return contacts;
            };
            return privacy ? privacy.request(operation, { signal: requestSignal }) : operation(requestSignal);
          },
          dispose,
        });
      }, store => store.dispose(), { sessions: 1 });
    },
  });
}