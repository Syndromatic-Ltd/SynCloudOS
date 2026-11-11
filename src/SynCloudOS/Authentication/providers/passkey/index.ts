/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import {
  ASAuthorizationController,
  ASAuthorizationPlatformPublicKeyCredentialAssertionRequest,
  type ASAuthorizationBrowserPort,
  type ASAuthorizationPlatformPublicKeyCredentialAssertion,
} from "../../../AuthenticationServices";
import { navigatePasskeyReturnPath } from "../../../PlatformAdapters/BrowserPasskeyAuthorization";
import type { AuthenticationMethod, AuthenticationService, AuthenticationSnapshot } from "../../authenticationTypes";

export const passkeyAuthenticationMethod: AuthenticationMethod = Object.freeze({ id: "passkey", label: "Sign in with a passkey" });
export interface PasskeyAuthenticationOperation {
  readonly returnPath: string;
  readonly signal: AbortSignal;
}
export interface PasskeyAuthenticationOptions {
  /** Existing OIDC/local service. Only its server-confirmed session establishes runtime identity. */
  readonly service: AuthenticationService;
  readonly relyingPartyIdentifier: string;
  /** Obtain a new assertion challenge from the relying-party server and construct its request. */
  readonly beginAssertion: (operation: PasskeyAuthenticationOperation) => Promise<ASAuthorizationPlatformPublicKeyCredentialAssertionRequest>;
  /** Send the assertion to the server, which verifies it and establishes the authenticated session. */
  readonly verifyAssertion: (credential: ASAuthorizationPlatformPublicKeyCredentialAssertion, operation: PasskeyAuthenticationOperation) => Promise<void>;
  readonly method?: AuthenticationMethod;
  readonly browser?: ASAuthorizationBrowserPort;
  readonly navigate?: (returnPath: string) => void | Promise<void>;
  /** Defaults to true: the composed service owns the supplied base service. */
  readonly disposesService?: boolean;
}
const abortError = () => new DOMException("Passkey sign-in was aborted.", "AbortError");
function localPath(value: string): boolean {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !/[\u0000-\u001f\u007f]/u.test(value);
}
/** Race host/server work as well as native work, so ignoring AbortSignal cannot publish stale authority. */
async function abortable<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => { if (settled) return; settled = true; cleanup(); reject(abortError()); };
    signal.addEventListener("abort", abort, { once: true });
    try {
      void work().then(value => { if (settled) return; settled = true; cleanup(); resolve(value); }, error => { if (settled) return; settled = true; cleanup(); reject(error); });
    } catch (error) { if (!settled) { settled = true; cleanup(); reject(error); } }
  });
}

/**
 * Optional AuthenticationService composition. It adds one provider without importing passkeys
 * into the base authentication entry or fabricating an identity from client-side credential success.
 */
export function createPasskeyAuthentication(options: PasskeyAuthenticationOptions): AuthenticationService {
  const service = options.service;
  const descriptor = options.method ?? passkeyAuthenticationMethod;
  if (!descriptor.id || !descriptor.label) throw new TypeError("A passkey authentication method requires an id and a label.");
  const method = Object.freeze({ ...descriptor });
  let disposed = false;
  let active: AbortController | null = null;
  let working = false;
  let error: string | null = null;
  let snapshot: AuthenticationSnapshot;
  const listeners = new Set<() => void>();
  const update = () => {
    const base = service.getSnapshot();
    const methods = base.status === "disabled" ? base.methods : Object.freeze([...base.methods.filter(entry => entry.id !== method.id), method]);
    snapshot = Object.freeze({ ...base, methods, ...(working ? { status: "authenticating" as const, error: null, errorCode: undefined } : error ? { status: "error" as const, error, errorCode: undefined } : {}) });
    if (!disposed) for (const listener of [...listeners]) listener();
    return snapshot;
  };
  update();
  const unsubscribe = service.subscribe(update);
  const cancelActive = () => { active?.abort(abortError()); active = null; };
  const requireLive = () => { if (disposed) throw abortError(); };
  const navigate = options.navigate ?? navigatePasskeyReturnPath;
  return {
    // The server service owns identity, expiry, broadcasts and revocation. Never replace it with a credential-derived adapter.
    sessionAdapter: service.sessionAdapter,
    getSnapshot: () => snapshot,
    subscribe(listener) { if (disposed) return () => undefined; listeners.add(listener); return () => { listeners.delete(listener); }; },
    async refresh(signal) { requireLive(); await service.refresh(signal); return update(); },
    async signIn(methodId, returnPath, signal) {
      requireLive();
      if (!localPath(returnPath)) throw new TypeError("Authentication return path must be local.");
      signal?.throwIfAborted();
      cancelActive();
      error = null; working = false;
      if (methodId !== method.id) { update(); return await service.signIn(methodId, returnPath, signal); }
      if (service.getSnapshot().status === "disabled") throw new TypeError("Authentication is disabled.");
      const owner = new AbortController(); active = owner;
      const abort = () => owner.abort(abortError());
      signal?.addEventListener("abort", abort, { once: true });
      working = true; update();
      try {
        const operation = Object.freeze({ returnPath, signal: owner.signal });
        const request = await abortable(owner.signal, () => options.beginAssertion(operation));
        if (!(request instanceof ASAuthorizationPlatformPublicKeyCredentialAssertionRequest) || request.relyingPartyIdentifier !== options.relyingPartyIdentifier.toLowerCase()) throw new TypeError("The passkey request does not match the configured relying party.");
        const controller = new ASAuthorizationController([request], { browser: options.browser });
        let authorization;
        try { authorization = await controller.performRequests(owner.signal); } finally { controller.dispose(); }
        owner.signal.throwIfAborted();
        if (authorization.credential.kind !== "assertion") throw new TypeError("Passkey sign-in requires an assertion.");
        const credential = authorization.credential;
        await abortable(owner.signal, () => options.verifyAssertion(credential, operation));
        owner.signal.throwIfAborted();
        const verified = await abortable(owner.signal, () => service.refresh(owner.signal));
        owner.signal.throwIfAborted();
        if (verified.status !== "authenticated" || !verified.profile) throw new Error("Passkey verification did not establish a server session.");
        working = false; update();
        await navigate(returnPath);
      } catch (failure) {
        if (owner.signal.aborted || disposed) throw abortError();
        error = failure instanceof Error ? failure.message : "Passkey sign-in failed.";
        working = false; update(); throw failure;
      } finally {
        signal?.removeEventListener("abort", abort);
        if (active === owner) { active = null; working = false; if (!disposed) update(); }
      }
    },
    async signOut(signal) { requireLive(); cancelActive(); working = false; error = null; await service.signOut(signal); update(); },
    dispose() {
      if (disposed) return;
      disposed = true; cancelActive(); unsubscribe(); listeners.clear();
      if (options.disposesService !== false) service.dispose();
    },
  };
}