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

import { browserPasskeyAuthorization } from "../PlatformAdapters/BrowserPasskeyAuthorization";
import { NSEData } from "../../Foundation/NSEData";
import {
  ASAuthorizationPlatformPublicKeyCredentialAssertionRequest,
  ASAuthorizationPlatformPublicKeyCredentialRegistrationRequest,
  type ASAuthorizationRequest,
} from "./ASAuthorizationRequests";

export type ASAuthorizationErrorCode = "unknown" | "canceled" | "invalidResponse" | "notHandled" | "failed";
export class ASAuthorizationError extends Error {
  readonly name = "ASAuthorizationError";
  constructor(readonly code: ASAuthorizationErrorCode, message: string) { super(message); }
}
export interface ASAuthorizationBrowserPort {
  isSecureContext(): boolean;
  create(options: CredentialCreationOptions): Promise<Credential | null>;
  get(options: CredentialRequestOptions): Promise<Credential | null>;
}
export interface ASAuthorizationCredentialJSON {
  readonly id: string;
  readonly rawId: string;
  readonly type: "public-key";
  readonly authenticatorAttachment: string | null;
  readonly clientExtensionResults: AuthenticationExtensionsClientOutputs;
  readonly response: Readonly<Record<string, string | readonly AuthenticatorTransport[] | null>>;
}
interface ASAuthorizationPublicKeyCredential {
  readonly id: string;
  readonly credentialID: NSEData;
  readonly rawClientDataJSON: NSEData;
  readonly authenticatorAttachment: string | null;
  toJSON(): ASAuthorizationCredentialJSON;
}
export interface ASAuthorizationPlatformPublicKeyCredentialRegistration extends ASAuthorizationPublicKeyCredential {
  readonly kind: "registration";
  readonly rawAttestationObject: NSEData;
  readonly transports: readonly AuthenticatorTransport[];
}
export interface ASAuthorizationPlatformPublicKeyCredentialAssertion extends ASAuthorizationPublicKeyCredential {
  readonly kind: "assertion";
  readonly rawAuthenticatorData: NSEData;
  readonly signature: NSEData;
  readonly userID: NSEData | null;
}
export interface ASAuthorization {
  readonly relyingPartyIdentifier: string;
  readonly credential: ASAuthorizationPlatformPublicKeyCredentialRegistration | ASAuthorizationPlatformPublicKeyCredentialAssertion;
}
export interface ASAuthorizationControllerDelegate {
  authorizationControllerDidCompleteWithAuthorization?(controller: ASAuthorizationController, authorization: ASAuthorization): void;
  authorizationControllerDidCompleteWithError?(controller: ASAuthorizationController, error: ASAuthorizationError): void;
}

function base64url(value: NSEData) { return value.base64EncodedString().replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, ""); }
function responseData(value: unknown): NSEData {
  try {
    const captured = NSEData.from(value as ArrayBuffer);
    if (captured.count > 0) return captured;
  } catch { /* Normalise untrusted native response shapes below. */ }
  throw new ASAuthorizationError("invalidResponse", "The browser returned an invalid passkey response.");
}
function capturedAuthorization(request: ASAuthorizationRequest, value: Credential | null): ASAuthorization {
  const credential = value as Partial<PublicKeyCredential> | null;
  if (!credential || credential.type !== "public-key" || typeof credential.id !== "string" || !credential.id || !credential.response) throw new ASAuthorizationError("invalidResponse", "The browser returned an invalid passkey response.");
  const credentialID = responseData(credential.rawId);
  const rawClientDataJSON = responseData(credential.response.clientDataJSON);
  const id = credential.id;
  const authenticatorAttachment = credential.authenticatorAttachment ?? null;
  // Requests do not opt into any browser extensions. Return no invented results.
  const clientExtensionResults = Object.freeze({});
  const json = (response: ASAuthorizationCredentialJSON["response"]): ASAuthorizationCredentialJSON => Object.freeze({
    id, rawId: base64url(credentialID), type: "public-key", authenticatorAttachment, clientExtensionResults, response: Object.freeze(response),
  });
  if (request.kind === "registration") {
    const response = credential.response as Partial<AuthenticatorAttestationResponse>;
    const rawAttestationObject = responseData(response.attestationObject);
    const transports = Object.freeze(response.getTransports ? [...response.getTransports()] : []) as readonly AuthenticatorTransport[];
    return Object.freeze({ relyingPartyIdentifier: request.relyingPartyIdentifier, credential: Object.freeze({
      kind: "registration" as const, id, credentialID, rawClientDataJSON, rawAttestationObject, authenticatorAttachment, transports,
      toJSON: () => json({ clientDataJSON: base64url(rawClientDataJSON), attestationObject: base64url(rawAttestationObject), transports }),
    }) });
  }
  const response = credential.response as Partial<AuthenticatorAssertionResponse>;
  const rawAuthenticatorData = responseData(response.authenticatorData);
  const signature = responseData(response.signature);
  const userID = response.userHandle == null ? null : responseData(response.userHandle);
  return Object.freeze({ relyingPartyIdentifier: request.relyingPartyIdentifier, credential: Object.freeze({
    kind: "assertion" as const, id, credentialID, rawClientDataJSON, rawAuthenticatorData, signature, userID, authenticatorAttachment,
    toJSON: () => json({ clientDataJSON: base64url(rawClientDataJSON), authenticatorData: base64url(rawAuthenticatorData), signature: base64url(signature), userHandle: userID ? base64url(userID) : null }),
  }) });
}
function authorizationError(error: unknown): ASAuthorizationError {
  if (error instanceof ASAuthorizationError) return error;
  const name = error && typeof error === "object" && "name" in error ? error.name : undefined;
  if (name === "AbortError" || name === "NotAllowedError") return new ASAuthorizationError("canceled", "The passkey request was cancelled or not allowed.");
  if (name === "NotSupportedError" || name === "SecurityError") return new ASAuthorizationError("notHandled", "Passkeys are unavailable for this relying party on this host.");
  return new ASAuthorizationError("failed", "The passkey request failed.");
}
const canceled = () => new ASAuthorizationError("canceled", "The passkey request was cancelled or not allowed.");

/** Owns one native passkey ceremony. It returns evidence for the relying-party server to verify. */
export class ASAuthorizationController {
  readonly authorizationRequests: readonly ASAuthorizationRequest[];
  delegate: ASAuthorizationControllerDelegate | null = null;
  readonly #browser: ASAuthorizationBrowserPort;
  #active: AbortController | null = null;
  #disposed = false;
  constructor(authorizationRequests: readonly ASAuthorizationRequest[], options: { readonly browser?: ASAuthorizationBrowserPort } = {}) {
    // WebAuthn exposes one ceremony per native call, not a chooser over registration and assertion.
    if (authorizationRequests.length !== 1 || !authorizationRequests.every(request => request instanceof ASAuthorizationPlatformPublicKeyCredentialAssertionRequest || request instanceof ASAuthorizationPlatformPublicKeyCredentialRegistrationRequest)) throw new TypeError("A portable passkey controller requires exactly one provider-created request.");
    this.authorizationRequests = Object.freeze([...authorizationRequests]); this.#browser = options.browser ?? browserPasskeyAuthorization;
  }
  async performRequests(signal?: AbortSignal): Promise<ASAuthorization> {
    if (this.#active) throw new ASAuthorizationError("failed", "A passkey request is already running.");
    const delegate = this.delegate;
    const controller = new AbortController();
    const abort = () => controller.abort(canceled());
    this.#active = controller;
    let authorization!: ASAuthorization;
    let failure: ASAuthorizationError | undefined;
    try {
      if (this.#disposed || signal?.aborted) throw canceled();
      signal?.addEventListener("abort", abort, { once: true });
      if (!this.#browser.isSecureContext()) throw new ASAuthorizationError("notHandled", "Passkeys require a secure context.");
      const request = this.authorizationRequests[0];
      authorization = await new Promise<ASAuthorization>((resolve, reject) => {
        let settled = false;
        const cleanup = () => controller.signal.removeEventListener("abort", cancelled);
        const cancelled = () => { if (settled) return; settled = true; cleanup(); reject(canceled()); };
        const failed = (error: unknown) => { if (settled) return; settled = true; cleanup(); reject(error); };
        controller.signal.addEventListener("abort", cancelled, { once: true });
        try {
          const nativeRequest = request.kind === "registration"
            ? this.#browser.create(request.credentialCreationOptions(controller.signal))
            : this.#browser.get(request.credentialRequestOptions(controller.signal));
          void nativeRequest.then(value => {
            if (settled || controller.signal.aborted) return;
            try { const captured = capturedAuthorization(request, value); settled = true; cleanup(); resolve(captured); } catch (error) { failed(error); }
          }, failed);
        } catch (error) { failed(error); }
      });
      controller.signal.throwIfAborted();
    } catch (error) {
      failure = authorizationError(error);
    } finally {
      signal?.removeEventListener("abort", abort);
      if (this.#active === controller) this.#active = null;
    }
    if (failure) {
      delegate?.authorizationControllerDidCompleteWithError?.(this, failure);
      throw failure;
    }
    delegate?.authorizationControllerDidCompleteWithAuthorization?.(this, authorization);
    return authorization;
  }
  cancel(): void { this.#active?.abort(canceled()); }
  dispose(): void { this.#disposed = true; this.cancel(); this.delegate = null; }
}