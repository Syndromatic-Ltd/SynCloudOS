/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { CNFXContact } from "../../FX/ContactsFX/CNFXContact";
import type { CNFXCapabilities, CNFXContactProperty, CNFXContactsClient, CNFXContactStore } from "../../FX/ContactsFX/CNFXContactStore";

export interface BrowserContactsNavigator {
  readonly contacts?: {
    select(properties: readonly CNFXContactProperty[], options: { multiple: boolean }): Promise<readonly {
      readonly name?: readonly string[];
      readonly email?: readonly string[];
      readonly tel?: readonly string[];
    }[]>;
  };
}

export interface BrowserContactsAdapterOptions {
  readonly isSecureContext: boolean;
  readonly browserNavigator?: BrowserContactsNavigator;
}

/** Contact Picker API only. Browser dialogs cannot be dismissed programmatically. */
export class BrowserContactsAdapter implements CNFXContactsClient {
  constructor(private readonly options: BrowserContactsAdapterOptions) {}

  getCapabilities(): CNFXCapabilities {
    return Object.freeze({ contactPicker: this.options.isSecureContext && typeof this.options.browserNavigator?.contacts?.select === "function", persistentAccess: false });
  }

  createContactStore(signal?: AbortSignal): CNFXContactStore {
    const owner = new AbortController();
    const abortOwner = () => owner.abort(signal?.reason);
    signal?.addEventListener("abort", abortOwner, { once: true });
    if (signal?.aborted) abortOwner();
    const dispose = () => {
      signal?.removeEventListener("abort", abortOwner);
      if (!owner.signal.aborted) owner.abort(new DOMException("Contact store was disposed.", "AbortError"));
    };
    const capabilities = (): CNFXCapabilities => owner.signal.aborted
      ? Object.freeze({ contactPicker: false, persistentAccess: false }) : this.getCapabilities();
    let pending = false;
    return Object.freeze<CNFXContactStore>({
      getCapabilities: capabilities,
      async getAuthorizationStatus() { return capabilities().contactPicker ? "prompt" : "unavailable"; },
      requestAccess: async (request = {}) => {
        owner.signal.throwIfAborted(); request.signal?.throwIfAborted();
        if (!capabilities().contactPicker) throw new DOMException("Contact Picker requires a secure context and browser support.", "NotSupportedError");
        if (pending) throw new DOMException("A contact selection is already pending.", "InvalidStateError");
        const properties = [...new Set<CNFXContactProperty>(request.properties ?? ["name", "email", "tel"])];
        if (!properties.length || properties.some(value => !["name", "email", "tel"].includes(value))) throw new TypeError("Select one or more supported contact properties.");
        pending = true;
        return new Promise<readonly CNFXContact[]>((resolve, reject) => {
          let settled = false;
          const cleanup = () => {
            pending = false;
            owner.signal.removeEventListener("abort", abort);
            request.signal?.removeEventListener("abort", abort);
          };
          const fail = (error: unknown) => { if (settled) return; settled = true; cleanup(); reject(error); };
          const abort = () => fail(owner.signal.aborted ? owner.signal.reason : request.signal?.reason);
          owner.signal.addEventListener("abort", abort, { once: true });
          request.signal?.addEventListener("abort", abort, { once: true });
          try {
            const selection = this.options.browserNavigator!.contacts!.select(properties, { multiple: request.multiple ?? false });
            Promise.resolve(selection).then(values => {
              if (settled) return;
              try {
                const contacts = Object.freeze(values.map(value => new CNFXContact({
                  displayNames: properties.includes("name") ? value.name : undefined,
                  emailAddresses: properties.includes("email") ? value.email : undefined,
                  phoneNumbers: properties.includes("tel") ? value.tel : undefined,
                })));
                settled = true; cleanup(); resolve(contacts);
              } catch (error) { fail(error); }
            }, fail);
          } catch (error) { fail(error); }
        });
      },
      dispose,
    });
  }
}
