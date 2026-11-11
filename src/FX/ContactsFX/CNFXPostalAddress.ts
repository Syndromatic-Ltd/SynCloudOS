/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { postalAddresses } from "./internal/contactValues";
/** CNPostalAddress. Picker addresses are immutable; unknown fields remain empty. */
export class CNFXPostalAddress {
  constructor() { postalAddresses.set(this, {}); Object.freeze(this); }
  get street(): string { return postalAddresses.get(this)!.street ?? ""; }
  get subLocality(): string { return postalAddresses.get(this)!.subLocality ?? ""; }
  get city(): string { return postalAddresses.get(this)!.city ?? ""; }
  get subAdministrativeArea(): string { return postalAddresses.get(this)!.subAdministrativeArea ?? ""; }
  get state(): string { return postalAddresses.get(this)!.state ?? ""; }
  get postalCode(): string { return postalAddresses.get(this)!.postalCode ?? ""; }
  get country(): string { return postalAddresses.get(this)!.country ?? ""; }
  get isoCountryCode(): string { return postalAddresses.get(this)!.isoCountryCode ?? ""; }
}
