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
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";

const unavailable: CNFXCapabilities = Object.freeze({ contactPicker: false, persistentAccess: false });

/** Mounted contact selection authority. Every picker request rechecks the app declaration. */
export function createMountedContactsClient(
  adapter: CNFXContactsClient | undefined,
  mountSignal: AbortSignal,
  permissions: () => readonly string[],
  authorise: (capability: string) => boolean,
): CNFXContactsClient {
  const scope = createMountedResourceScope(mountSignal, { maxResources: 8, budgets: { sessions: 8 } });
  const requireAccess = (signal: AbortSignal) => {
    signal.throwIfAborted();
    if (!permissions().includes("contacts.select")) throw new DOMException("SynWare capability contacts.select must be declared.", "SecurityError");
    if (!authorise("contacts.select")) throw new DOMException("Policy denied SynWare capability contacts.select.", "SecurityError");
    if (!adapter) throw new DOMException("Contact selection is unavailable.", "NotSupportedError");
  };
  return Object.freeze({
    getCapabilities: () => mountSignal.aborted ? unavailable : adapter?.getCapabilities() ?? unavailable,
    createContactStore(signal?: AbortSignal): CNFXContactStore {
      return scope.acquire(signal, (lease, release) => {
        const store = adapter?.createContactStore(lease);
        const capabilities = () => lease.aborted ? unavailable : store?.getCapabilities() ?? unavailable;
        let disposed = false;
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          lease.removeEventListener("abort", dispose);
          try { store?.dispose(); } finally { release(); }
        };
        lease.addEventListener("abort", dispose, { once: true });
        return Object.freeze<CNFXContactStore>({
          getCapabilities: capabilities,
          async getAuthorizationStatus() {
            if (lease.aborted || !store) return "unavailable";
            if (!permissions().includes("contacts.select") || !authorise("contacts.select")) return "denied";
            const status = await store.getAuthorizationStatus();
            if (lease.aborted) return "unavailable";
            return status;
          },
          async requestAccess(options) {
            requireAccess(lease);
            const contacts = await store!.requestAccess(options);
            requireAccess(lease);
            return contacts;
          },
          dispose,
        });
      }, store => store.dispose(), { sessions: 1 });
    },
  });
}
