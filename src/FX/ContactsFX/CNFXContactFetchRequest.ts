/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { NSEPredicate } from "../../Foundation/NSEPredicate";
import type { CNFXContact } from "./CNFXContact";
import type { CNFXContactSortOrder } from "./CNFXContactSortOrder";
import type { CNFXKeyDescriptor } from "./CNFXKeyDescriptor";
import { expandKeys } from "./internal/keyDescriptors";
/** CNContactFetchRequest. Web stores reject database fetching explicitly. */
export class CNFXContactFetchRequest {
  #keys: readonly CNFXKeyDescriptor[];
  constructor(keysToFetch: readonly CNFXKeyDescriptor[]) { expandKeys(keysToFetch); this.#keys = Object.freeze([...keysToFetch]); }
  get keysToFetch(): readonly CNFXKeyDescriptor[] { return this.#keys; }
  set keysToFetch(value: readonly CNFXKeyDescriptor[]) { expandKeys(value); this.#keys = Object.freeze([...value]); }
  predicate: NSEPredicate<CNFXContact> | null = null;
  mutableObjects = false;
  unifyResults = true;
  sortOrder: CNFXContactSortOrder = "none";
}
