/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { PrivacyApplicationPort } from "../HostServices/AppSDKHostServiceTypes";
import { CNFXError } from "../../FX/ContactsFX/CNFXError";
import { contactsFailure, type ContactsAdapter, type ContactsPort } from "../../FX/ContactsFX/internal/contactsPort";
/** Private per-app authority. Every selection captures an irrevocable generation. */
export function createMountedContactsPort(adapter: ContactsAdapter | undefined, signal: AbortSignal,
  entitlements: () => readonly string[], authorise: (capability: string) => boolean,
  privacy?: PrivacyApplicationPort, observeAccess: (listener: () => void) => () => void = () => () => {}): ContactsPort {
  let generation = 0; let selected = false; let active = 0; const observers = new Set<() => void>();
  let releasePrivacy: (() => void) | undefined;
  const allowed = () => { try { return !signal.aborted && entitlements().includes("contacts.select") && authorise("contacts.select"); } catch { return false; } };
  const invalidate = () => { generation++; selected = false; for (const listener of [...observers]) listener(); };
  const bindPrivacy = () => { if (privacy && !releasePrivacy) releasePrivacy = privacy.bindResource(() => { releasePrivacy = undefined; invalidate(); }); };
  const releaseAccess = observeAccess(() => { if (!allowed()) invalidate(); });
  const abort = () => { invalidate(); releaseAccess(); releasePrivacy?.(); releasePrivacy = undefined; observers.clear(); };
  signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
  const assertAccess = (captured = generation) => {
    if (signal.aborted) throw new CNFXError("communicationError", "The Contacts application session ended.");
    if (!allowed() || captured !== generation) throw new CNFXError("authorizationDenied", "The contacts.select entitlement or authorization was denied or revoked.");
    try { privacy?.assertRequestAllowed(); } catch (error) { throw contactsFailure(error); }
  };
  return Object.freeze<ContactsPort>({
    get available() { return !signal.aborted && !!adapter?.available; }, get generation() { return generation; }, assertAccess,
    // Queue-only authorization completions need revocation observation even before a picker exists.
    // This acquires only the shared lifetime lease; it never requests consent or native access.
    bindAccessLifetime(captured) { assertAccess(captured); bindPrivacy(); },
    observeAccessLoss(listener) { observers.add(listener); return () => { observers.delete(listener); }; },
    authorizationStatus() {
      if (signal.aborted) return "restricted";
      if (!allowed() || privacy?.authorizationStatus() === "denied") return "denied";
      if (!adapter?.available) return "restricted";
      return selected ? "limited" : "notDetermined";
    },
    select(keys, multiple, requestSignal) {
      assertAccess(); requestSignal.throwIfAborted();
      if (!adapter?.available) throw new CNFXError("featureNotAvailable", "Contact Picker is unavailable in this browser context.");
      if (active >= 8) throw new CNFXError("communicationError", "The application contact selection limit was reached.");
      bindPrivacy(); const captured = generation; active++; const owner = new AbortController();
      const revoked = () => owner.abort(); observers.add(revoked);
      const combined = AbortSignal.any([signal, requestSignal, owner.signal]);
      const operation = async (lease: AbortSignal) => { assertAccess(captured); lease.throwIfAborted(); const result = await adapter.select(keys, multiple, lease); assertAccess(captured); lease.throwIfAborted(); if (!result.length) throw new DOMException("Contact selection was cancelled.", "AbortError"); return result; };
      // Preserve native NotAllowedError until the shared store has recorded it.
      const pending = privacy ? privacy.request(operation, { signal: combined }) : operation(combined);
      return pending.then(result => { assertAccess(captured); combined.throwIfAborted(); selected = true; return result; }, error => { throw contactsFailure(error); }).finally(() => { active--; observers.delete(revoked); });
    },
  });
}
