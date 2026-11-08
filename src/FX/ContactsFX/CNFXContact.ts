/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { CNFXContactType } from "./CNFXContactType";
import { CNFXLabeledValue } from "./CNFXLabeledValue";
import { CNFXPhoneNumber } from "./CNFXPhoneNumber";
import { CNFXPostalAddress } from "./CNFXPostalAddress";
import type { CNFXMutableContact } from "./CNFXMutableContact";
import { contactValues, emptyContact, mutableContactConstructor } from "./internal/contactValues";
/** CNContact. Identifiers are snapshot-local strings, never fabricated database identifiers. */
export class CNFXContact {
  constructor() { contactValues.set(this, emptyContact()); Object.freeze(this); }
  get identifier(): string { return contactValues.get(this)!.identifier; }
  get contactType(): CNFXContactType { return contactValues.get(this)!.contactType; }
  get givenName(): string { return contactValues.get(this)!.givenName; }
  get familyName(): string { return contactValues.get(this)!.familyName; }
  get organizationName(): string { return contactValues.get(this)!.organizationName; }
  get emailAddresses(): readonly CNFXLabeledValue<string>[] { return contactValues.get(this)!.emailAddresses; }
  get phoneNumbers(): readonly CNFXLabeledValue<CNFXPhoneNumber>[] { return contactValues.get(this)!.phoneNumbers; }
  get postalAddresses(): readonly CNFXLabeledValue<CNFXPostalAddress>[] { return contactValues.get(this)!.postalAddresses; }
  isKeyAvailable(key: string): boolean { return contactValues.get(this)!.keys.has(key); }
  copy(): CNFXContact { const copy = new CNFXContact(); contactValues.set(copy, { ...contactValues.get(this)! }); return copy; }
  mutableCopy(): CNFXMutableContact { const copy = new mutableContactConstructor.value(); contactValues.set(copy, { ...contactValues.get(this)! }); return copy; }
}
