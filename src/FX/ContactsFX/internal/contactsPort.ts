/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { CNFXContact } from "../CNFXContact";
import { CNFXError } from "../CNFXError";
import type { CNFXAuthorizationStatus } from "../CNFXAuthorizationStatus";
export interface ContactsAdapter { readonly available: boolean; select(keys: readonly string[], multiple: boolean, signal: AbortSignal): Promise<readonly CNFXContact[]>; }
export interface ContactsPort extends ContactsAdapter { readonly generation: number; authorizationStatus(): CNFXAuthorizationStatus; assertAccess(generation?: number): void; bindAccessLifetime(generation?: number): void; observeAccessLoss(listener: () => void): () => void; }
const ports = new WeakMap<object, ContactsPort>(); const adapters = new WeakMap<object, ContactsAdapter>();
export function associateContactsPort(context: object, port: ContactsPort): void { ports.set(context, port); }
export function contactsPortFor(context: object): ContactsPort { const port = ports.get(context); if (!port) throw new CNFXError("featureNotAvailable", "The Contacts service is unavailable."); return port; }
export function associateContactsAdapter(environment: object, adapter: ContactsAdapter): void { adapters.set(environment, adapter); }
export function contactsAdapterFor(environment: object): ContactsAdapter | undefined { return adapters.get(environment); }
export function contactsFailure(error: unknown): CNFXError { if (error instanceof CNFXError) return error; const name = typeof error === "object" && error !== null && "name" in error ? error.name : ""; return new CNFXError(name === "NotAllowedError" || name === "SecurityError" ? "authorizationDenied" : name === "NotSupportedError" ? "featureNotAvailable" : "communicationError", typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" ? error.message : "Contact selection failed."); }
