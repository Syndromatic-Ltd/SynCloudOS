/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { NSEPredicate } from "../../Foundation/NSEPredicate";
import { fxAttributedClass } from "../../SynCloudOS/fxRuntimeContracts";
import { dispatchQueueForSession } from "../DispatchFX/internal/sessionBinding";
import type { CNFXContact } from "./CNFXContact";
import type { CNFXEntityType } from "./CNFXEntityType";
import type { CNFXAuthorizationStatus } from "./CNFXAuthorizationStatus";
import type { CNFXKeyDescriptor } from "./CNFXKeyDescriptor";
import type { CNFXContactFetchRequest } from "./CNFXContactFetchRequest";
import { CNFXError } from "./CNFXError";
import { contactsPortFor, contactsFailure } from "./internal/contactsPort";
import { contactBinding, contactStores } from "./internal/contactsSessionBindings";
/** CNContactStore. Browser selection never creates a persistent contact database. */
export class CNFXContactStore {
  #binding; #session; #port; #generation; #disposed = false;
  constructor() { this.#binding = contactBinding(new.target); this.#session = this.#binding.resolve(); this.#port = contactsPortFor(this.#session.context); this.#generation = this.#port.generation; contactStores.set(this, { dispose: () => { this.#disposed = true; } }); }
  static authorizationStatus(entityType: CNFXEntityType): CNFXAuthorizationStatus { if (entityType !== "contacts") throw new CNFXError("validationTypeMismatch", "Unknown Contacts entity type."); return contactsPortFor(contactBinding(this).resolve().context).authorizationStatus(); }
  /** Completion is asynchronous on the selected application's main queue. No picker is opened. */
  requestAccess(entityType: CNFXEntityType, completion: (granted: boolean, error: CNFXError | null) => void): void {
    this.#assertLive(); if (entityType !== "contacts") throw new CNFXError("validationTypeMismatch", "Unknown Contacts entity type.");
    let error: CNFXError = new CNFXError("featureNotAvailable", "This browser cannot authorize a persistent Contacts database; present CNFXContactPickerViewController to select contacts.");
    try { this.#port.bindAccessLifetime(this.#generation); } catch (failure) { error = contactsFailure(failure); }
    dispatchQueueForSession(this.#session).main.async(() => { try { this.#assertLive(); } catch { return; } completion(false, error); });
  }
  unifiedContacts(_predicate: NSEPredicate<CNFXContact> | null, _keysToFetch: readonly CNFXKeyDescriptor[]): readonly CNFXContact[] { this.#databaseUnavailable(); }
  enumerateContacts(_fetchRequest: CNFXContactFetchRequest, _block: (contact: CNFXContact, stop: { value: boolean }) => void): void { this.#databaseUnavailable(); }
  #assertLive(): void { if (this.#disposed || this.#generation !== this.#port.generation) throw new CNFXError("communicationError", "The Contacts object has ended."); this.#binding.resolve(); }
  #databaseUnavailable(): never { this.#assertLive(); this.#port.assertAccess(this.#generation); throw new CNFXError("featureNotAvailable", "The browser provides selected contacts only, not a Contacts database."); }
}
Object.defineProperty(CNFXContactStore, fxAttributedClass, { value: true });
