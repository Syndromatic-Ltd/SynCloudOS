/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { CNFXContact } from "./CNFXContact";
import type { CNFXContactFormatterStyle } from "./CNFXContactFormatterStyle";
import type { CNFXKeyDescriptor } from "./CNFXKeyDescriptor";
import { CNFXError } from "./CNFXError";
import { keyDescriptor } from "./internal/keyDescriptors";
/** CNContactFormatter. Full names retain given/family order; no inverse-name parser exists. */
export class CNFXContactFormatter {
  style: CNFXContactFormatterStyle = "fullName";
  string(from: CNFXContact): string | null {
    return CNFXContactFormatter.string(from, this.style);
  }
  static string(from: CNFXContact, style: CNFXContactFormatterStyle): string | null {
    if (style !== "fullName") throw new CNFXError("featureNotAvailable", "Phonetic name formatting is unavailable.");
    const required = from.contactType === "organization" ? ["organizationName"] : ["givenName"];
    if (required.some(key => !from.isKeyAvailable(key))) throw new CNFXError("unauthorizedKeys", "Name keys were not fetched.");
    return (
      (from.contactType === "organization" ? from.organizationName : [from.givenName, from.familyName].filter(Boolean).join(" ")) || null
    );
  }
  static descriptorForRequiredKeys(style: CNFXContactFormatterStyle): CNFXKeyDescriptor {
    if (style !== "fullName") throw new CNFXError("featureNotAvailable", "Phonetic name formatting is unavailable.");
    return keyDescriptor(["contactType", "givenName", "familyName", "organizationName"]);
  }
}
