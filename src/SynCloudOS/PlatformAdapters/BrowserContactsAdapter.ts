/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { CNFXContact } from "../../FX/ContactsFX/CNFXContact";
import { CNFXLabeledValue } from "../../FX/ContactsFX/CNFXLabeledValue";
import { CNFXPhoneNumber } from "../../FX/ContactsFX/CNFXPhoneNumber";
import { CNFXPostalAddress } from "../../FX/ContactsFX/CNFXPostalAddress";
import { contactValues, postalAddresses } from "../../FX/ContactsFX/internal/contactValues";
import type { ContactsAdapter } from "../../FX/ContactsFX/internal/contactsPort";
interface BrowserContactAddress { readonly addressLine?: readonly string[]; readonly city?: string; readonly dependentLocality?: string; readonly region?: string; readonly postalCode?: string; readonly country?: string; }
export interface BrowserContactsNavigator { readonly contacts?: { select(properties: readonly string[], options: { multiple: boolean }): Promise<readonly { readonly name?: readonly string[]; readonly email?: readonly string[]; readonly tel?: readonly string[]; readonly address?: readonly BrowserContactAddress[] }[]>; }; }
export interface BrowserContactsAdapterOptions { readonly isSecureContext: boolean; readonly browserNavigator?: BrowserContactsNavigator; }
/** Private browser chooser. The web exposes no cancellable native handle or persistent database. */
export class BrowserContactsAdapter implements ContactsAdapter {
  constructor(private readonly options: BrowserContactsAdapterOptions) {}
  get available(): boolean { return this.options.isSecureContext && typeof this.options.browserNavigator?.contacts?.select === "function"; }
  select(keys: readonly string[], multiple: boolean, signal: AbortSignal): Promise<readonly CNFXContact[]> {
    signal.throwIfAborted(); if (!this.available) throw new DOMException("Contact Picker is unavailable.", "NotSupportedError");
    const fields: Record<string, string> = { givenName: "name", emailAddresses: "email", phoneNumbers: "tel", postalAddresses: "address" };
    const properties = [...new Set(keys.map(key => fields[key]).filter((value): value is string => !!value))];
    if (!properties.length || keys.some(key => !(key in fields))) throw new DOMException("The requested contact fields are unavailable from the browser picker.", "NotSupportedError");
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => signal.removeEventListener("abort", abort);
      const fail = (error: unknown) => { if (settled) return; settled = true; cleanup(); reject(error); };
      const abort = () => fail(signal.reason ?? new DOMException("Contact selection ended.", "AbortError"));
      signal.addEventListener("abort", abort, { once: true });
      try { const pending = this.options.browserNavigator!.contacts!.select(properties, { multiple });
        Promise.resolve(pending).then(values => { if (settled) return; try {
          const result = Object.freeze(values.map(value => {
            const contact = new CNFXContact(); const state = contactValues.get(contact)!;
            const strings = (items: readonly string[] | undefined): readonly string[] => { if (items?.some(item => typeof item !== "string")) throw new TypeError("Malformed browser contact values."); return items ?? []; };
            if (properties.includes("name")) state.givenName = strings(value.name)[0] ?? "";
            if (properties.includes("email")) state.emailAddresses = Object.freeze(strings(value.email).map(item => new CNFXLabeledValue(null, item)));
            if (properties.includes("tel")) state.phoneNumbers = Object.freeze(strings(value.tel).map(item => new CNFXLabeledValue(null, new CNFXPhoneNumber(item))));
            if (properties.includes("address")) state.postalAddresses = Object.freeze((value.address ?? []).map(item => { const address = new CNFXPostalAddress(); postalAddresses.set(address, { street: strings(item.addressLine).join("\n"), subLocality: item.dependentLocality, city: item.city, state: item.region, postalCode: item.postalCode, isoCountryCode: item.country }); return new CNFXLabeledValue(null, address); }));
            state.keys = new Set(["identifier", "contactType", ...keys]); return contact;
          })); settled = true; cleanup(); resolve(result);
        } catch (error) { fail(error); } }, fail);
      } catch (error) { fail(error); }
    });
  }
}
