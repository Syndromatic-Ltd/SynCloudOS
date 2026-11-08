/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { CNFXContactType } from "./CNFXContactType";
import { CNFXLabeledValue } from "./CNFXLabeledValue";
import { CNFXPhoneNumber } from "./CNFXPhoneNumber";
import { CNFXPostalAddress } from "./CNFXPostalAddress";
import { CNFXContact } from "./CNFXContact";
import { contactValues, mutableContactConstructor } from "./internal/contactValues";
/** CNMutableContact. Changes are local; web address-book persistence is unavailable. */
export class CNFXMutableContact extends CNFXContact {
  override get contactType(): CNFXContactType { return super.contactType; }
  override set contactType(value: CNFXContactType) { if (value !== "person" && value !== "organization") throw new TypeError("Invalid contact type."); contactValues.get(this)!.contactType = value; }
  override get givenName(): string { return super.givenName; }
  override set givenName(value: string) { if (typeof value !== "string") throw new TypeError("Contact names must be strings."); contactValues.get(this)!.givenName = value; }
  override get familyName(): string { return super.familyName; }
  override set familyName(value: string) { if (typeof value !== "string") throw new TypeError("Contact names must be strings."); contactValues.get(this)!.familyName = value; }
  override get organizationName(): string { return super.organizationName; }
  override set organizationName(value: string) { if (typeof value !== "string") throw new TypeError("Contact names must be strings."); contactValues.get(this)!.organizationName = value; }
  override get emailAddresses(): readonly CNFXLabeledValue<string>[] { return super.emailAddresses; }
  override set emailAddresses(value: readonly CNFXLabeledValue<string>[]) { if (!Array.isArray(value) || value.some(item => !(item instanceof CNFXLabeledValue) || typeof item.value !== "string")) throw new TypeError("Invalid labelled contact values."); contactValues.get(this)!.emailAddresses = Object.freeze([...value]); }
  override get phoneNumbers(): readonly CNFXLabeledValue<CNFXPhoneNumber>[] { return super.phoneNumbers; }
  override set phoneNumbers(value: readonly CNFXLabeledValue<CNFXPhoneNumber>[]) { if (!Array.isArray(value) || value.some(item => !(item instanceof CNFXLabeledValue) || !(item.value instanceof CNFXPhoneNumber))) throw new TypeError("Invalid labelled contact values."); contactValues.get(this)!.phoneNumbers = Object.freeze([...value]); }
  override get postalAddresses(): readonly CNFXLabeledValue<CNFXPostalAddress>[] { return super.postalAddresses; }
  override set postalAddresses(value: readonly CNFXLabeledValue<CNFXPostalAddress>[]) { if (!Array.isArray(value) || value.some(item => !(item instanceof CNFXLabeledValue) || !(item.value instanceof CNFXPostalAddress))) throw new TypeError("Invalid labelled contact values."); contactValues.get(this)!.postalAddresses = Object.freeze([...value]); }
}

mutableContactConstructor.value = CNFXMutableContact;
