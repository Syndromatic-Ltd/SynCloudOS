/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { CNFXContact } from "../CNFXContact";
import type { CNFXContactType } from "../CNFXContactType";
import type { CNFXLabeledValue } from "../CNFXLabeledValue";
import type { CNFXPhoneNumber } from "../CNFXPhoneNumber";
import type { CNFXPostalAddress } from "../CNFXPostalAddress";
export interface ContactValue { identifier: string; contactType: CNFXContactType; givenName: string; familyName: string; organizationName: string; emailAddresses: readonly CNFXLabeledValue<string>[]; phoneNumbers: readonly CNFXLabeledValue<CNFXPhoneNumber>[]; postalAddresses: readonly CNFXLabeledValue<CNFXPostalAddress>[]; keys: ReadonlySet<string>; }
export const contactValues = new WeakMap<CNFXContact, ContactValue>();
export const postalAddresses = new WeakMap<CNFXPostalAddress, Partial<Record<"street" | "subLocality" | "city" | "subAdministrativeArea" | "state" | "postalCode" | "country" | "isoCountryCode", string>>>();
export const contactKeys = Object.freeze(["identifier", "contactType", "givenName", "familyName", "organizationName", "emailAddresses", "phoneNumbers", "postalAddresses"]);
export function emptyContact(): ContactValue { return { identifier: crypto.randomUUID(), contactType: "person", givenName: "", familyName: "", organizationName: "", emailAddresses: Object.freeze([]), phoneNumbers: Object.freeze([]), postalAddresses: Object.freeze([]), keys: new Set(contactKeys) }; }

export const mutableContactConstructor = {} as { value: new () => import("../CNFXMutableContact").CNFXMutableContact };
