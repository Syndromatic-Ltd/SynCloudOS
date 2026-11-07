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
import type { CNFXContactStore } from "../../../FX/ContactsFX/public";
import { useSCOS } from "../scos/useSCOS";

/** A component-owned contact store. Contact access starts only in requestAccess. */
export function useContacts(): CNFXContactStore {
  const client = useSCOS().contacts;
  const binding = useMemo(() => {
    let current: CNFXContactStore | null = null;
    const requireStore = () => {
      if (!current) throw new DOMException("The component contact owner is not mounted.", "InvalidStateError");
      return current;
    };
    const facade = Object.freeze<CNFXContactStore>({
      getCapabilities: () => current?.getCapabilities() ?? Object.freeze({ contactPicker: false, persistentAccess: false }),
      getAuthorizationStatus: () => current?.getAuthorizationStatus() ?? Promise.resolve("unavailable"),
      requestAccess: options => requireStore().requestAccess(options),
      dispose: () => current?.dispose(),
    });
    return {
      facade,
      mount() {
        const owner = new AbortController();
        const store = client.createContactStore(owner.signal);
        current = store;
        return () => {
          if (current === store) current = null;
          owner.abort();
          store.dispose();
        };
      },
    };
  }, [client]);
  useLayoutEffect(() => binding.mount(), [binding]);
  return binding.facade;
}
