/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { NSEPersonNameComponents } from "../../Foundation/NSEPersonNameComponents";
import type { CNFXPhoneNumber } from "../ContactsFX/CNFXPhoneNumber";
import type { CNFXPostalAddress } from "../ContactsFX/CNFXPostalAddress";
/** PKContact. Missing contact fields remain null. */
export class PKFXContact {
  emailAddress: string | null = null;
  name: NSEPersonNameComponents | null = null;
  phoneNumber: CNFXPhoneNumber | null = null;
  postalAddress: CNFXPostalAddress | null = null;
  supplementarySubLocality: string | null = null;
}
