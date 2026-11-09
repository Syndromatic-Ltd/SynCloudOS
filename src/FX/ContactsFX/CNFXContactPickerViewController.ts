/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { NSEViewController } from "../../NSE/Application/NSEViewController";
import { nativePresentations } from "../../NSE/Application/nativePresentation";
import { fxAttributedClass, observeFXSessionEnd } from "../../SynCloudOS/fxRuntimeContracts";
import { dispatchQueueForSession } from "../DispatchFX/internal/sessionBinding";
import { CNFXError } from "./CNFXError";
import type { CNFXContactPickerDelegate } from "./CNFXContactPickerDelegate";
import { contactBinding } from "./internal/contactsSessionBindings";
import { contactsPortFor } from "./internal/contactsPort";
/** CNContactPickerViewController. Present using NSEViewController's existing presentation methods.
 * Browser dialogs cannot be dismissed programmatically; disposal drops all pending results. */
export class CNFXContactPickerViewController extends NSEViewController {
  #binding;
  #session;
  #port;
  #generation;
  #owner = new AbortController();
  #releaseSession: (() => void) | undefined;
  #releaseAccess: (() => void) | undefined;
  #keys: readonly string[] = Object.freeze(["givenName", "emailAddresses", "phoneNumbers"]);
  delegate: CNFXContactPickerDelegate | null = null;
  constructor() {
    const binding = contactBinding(new.target);
    const session = binding.resolve();
    super({ ownerSignal: session.context.signal });
    this.#binding = binding;
    this.#session = session;
    this.#port = contactsPortFor(this.#session.context);
    this.#generation = this.#port.generation;
    nativePresentations.set(this, () => this.#begin());
    this.#releaseSession = observeFXSessionEnd(this.#session, () => this.dispose());
  }
  get displayedPropertyKeys(): readonly string[] {
    return this.#keys;
  }
  set displayedPropertyKeys(value: readonly string[]) {
    this.#keys = Object.freeze([...value]);
  }
  #live(): boolean {
    try {
      this.#binding.resolve();
      this.#port.assertAccess(this.#generation);
      return !this.isDisposed && !this.#owner.signal.aborted;
    } catch {
      return false;
    }
  }
  #begin(): void {
    this.#binding.resolve();
    this.#port.assertAccess(this.#generation);
    if (this.isDisposed || this.#owner.signal.aborted) throw new CNFXError("communicationError", "This contact picker has ended.");
    this.#releaseAccess = this.#port.observeAccessLoss(() => this.dispose());
    const multiple = typeof this.delegate?.contactPickerDidSelectContacts === "function";
    const pending = this.#port.select(this.#keys, multiple, this.#owner.signal);
    const deliver = (work: () => void) => {
      if (!this.#live()) return;
      dispatchQueueForSession(this.#session).main.async(() => {
        if (!this.#live()) return;
        try {
          work();
        } finally {
          this.dismiss();
        }
      });
    };
    void pending.then(
      contacts =>
        deliver(() => {
          if (!contacts.length) this.delegate?.contactPickerDidCancel?.(this);
          else if (multiple) this.delegate?.contactPickerDidSelectContacts?.(this, contacts);
          else this.delegate?.contactPickerDidSelectContact?.(this, contacts[0]!);
        }),
      () => deliver(() => this.delegate?.contactPickerDidCancel?.(this)),
    );
  }
  protected override didDispose(): void {
    this.#owner.abort();
    this.#releaseSession?.();
    this.#releaseSession = undefined;
    this.#releaseAccess?.();
    this.#releaseAccess = undefined;
    nativePresentations.delete(this);
    super.didDispose();
  }
}
Object.defineProperty(CNFXContactPickerViewController, fxAttributedClass, { value: true });
