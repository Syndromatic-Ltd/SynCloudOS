/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { CNFXContactPickerViewController } from "./CNFXContactPickerViewController";
import type { CNFXContact } from "./CNFXContact";
/** CNContactPickerDelegate. Implement the plural selection method to allow multiple contacts. */
export interface CNFXContactPickerDelegate {
  contactPickerDidSelectContact?(picker: CNFXContactPickerViewController, contact: CNFXContact): void;
  contactPickerDidSelectContacts?(picker: CNFXContactPickerViewController, contacts: readonly CNFXContact[]): void;
  contactPickerDidCancel?(picker: CNFXContactPickerViewController): void;
}
