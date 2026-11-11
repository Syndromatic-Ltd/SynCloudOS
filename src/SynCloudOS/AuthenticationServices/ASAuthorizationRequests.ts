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

import { NSEData, type NSEDataConvertible } from "../../Foundation/NSEData";

export interface ASAuthorizationCredentialDescriptor {
  readonly credentialID: NSEDataConvertible;
  readonly transports?: readonly AuthenticatorTransport[];
}
export interface ASAuthorizationAssertionOptions {
  readonly allowedCredentials?: readonly ASAuthorizationCredentialDescriptor[];
  readonly userVerificationPreference?: UserVerificationRequirement;
  readonly timeoutMilliseconds?: number;
}
export interface ASAuthorizationRegistrationOptions {
  readonly displayName?: string;
  readonly excludedCredentials?: readonly ASAuthorizationCredentialDescriptor[];
  readonly userVerificationPreference?: UserVerificationRequirement;
  readonly timeoutMilliseconds?: number;
}
interface CapturedDescriptor {
  readonly credentialID: NSEData;
  readonly transports?: readonly AuthenticatorTransport[];
}
const verificationValues = new Set(["required", "preferred", "discouraged"]);
const transportValues = new Set(["ble", "hybrid", "internal", "nfc", "smart-card", "usb"]);
function relyingParty(value: string): string {
  if (typeof value !== "string" || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/iu.test(value)
    || value.includes("..") || value.split(".").some(label => label.startsWith("-") || label.endsWith("-"))) throw new TypeError("Passkey relying party identifier must be a hostname.");
  return value.toLowerCase();
}
function verification(value: UserVerificationRequirement | undefined): UserVerificationRequirement {
  if (value !== undefined && !verificationValues.has(value)) throw new TypeError("Invalid passkey user verification preference.");
  return value ?? "required";
}
function timeout(value: number | undefined): number | undefined {
  if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new TypeError("Passkey timeout must be positive and finite.");
  return value;
}
function data(value: NSEDataConvertible, name: string, maximum = 1024 * 1024): NSEData {
  const captured = NSEData.from(value);
  if (captured.count === 0 || captured.count > maximum) throw new TypeError(`${name} must contain between 1 and ${maximum} bytes.`);
  return captured;
}
function descriptors(values: readonly ASAuthorizationCredentialDescriptor[] | undefined): readonly CapturedDescriptor[] | undefined {
  return values === undefined ? undefined : Object.freeze(values.map(value => {
    const transports = value.transports === undefined ? undefined : Object.freeze([...value.transports]);
    if (transports?.some(transport => !transportValues.has(transport))) throw new TypeError("Invalid passkey credential transport.");
    return Object.freeze({ credentialID: data(value.credentialID, "Credential ID"), transports });
  }));
}
function webDescriptors(values: readonly CapturedDescriptor[] | undefined): PublicKeyCredentialDescriptor[] | undefined {
  return values?.map(value => ({ type: "public-key", id: value.credentialID.bytes.buffer, ...(value.transports ? { transports: [...value.transports] } : {}) }));
}

/** A captured registration request. The server supplies a fresh, unpredictable challenge. */
export class ASAuthorizationPlatformPublicKeyCredentialRegistrationRequest {
  readonly kind = "registration";
  readonly challenge: NSEData;
  readonly userID: NSEData;
  readonly name: string;
  readonly displayName: string;
  readonly excludedCredentials: readonly CapturedDescriptor[] | undefined;
  readonly userVerificationPreference: UserVerificationRequirement;
  readonly timeoutMilliseconds: number | undefined;
  constructor(
    readonly relyingPartyIdentifier: string,
    readonly relyingPartyName: string,
    challenge: NSEDataConvertible,
    name: string,
    userID: NSEDataConvertible,
    options: ASAuthorizationRegistrationOptions = {},
  ) {
    this.relyingPartyIdentifier = relyingParty(relyingPartyIdentifier);
    if (typeof relyingPartyName !== "string" || !relyingPartyName.trim()) throw new TypeError("Passkey relying party name must not be empty.");
    this.challenge = data(challenge, "Challenge"); this.userID = data(userID, "User ID", 64);
    if (typeof name !== "string" || !name.trim()) throw new TypeError("Passkey user name must not be empty.");
    if (options.displayName !== undefined && (typeof options.displayName !== "string" || !options.displayName.trim())) throw new TypeError("Passkey display name must not be empty.");
    this.name = name; this.displayName = options.displayName ?? name;
    this.excludedCredentials = descriptors(options.excludedCredentials);
    this.userVerificationPreference = verification(options.userVerificationPreference);
    this.timeoutMilliseconds = timeout(options.timeoutMilliseconds);
    Object.freeze(this);
  }
  /** A fresh browser bridge. Mutating it does not change the captured request. */
  credentialCreationOptions(signal?: AbortSignal): CredentialCreationOptions {
    return { signal, publicKey: {
      challenge: this.challenge.bytes.buffer,
      rp: { id: this.relyingPartyIdentifier, name: this.relyingPartyName },
      user: { id: this.userID.bytes.buffer, name: this.name, displayName: this.displayName },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", userVerification: this.userVerificationPreference },
      attestation: "none",
      ...(this.excludedCredentials ? { excludeCredentials: webDescriptors(this.excludedCredentials) } : {}),
      ...(this.timeoutMilliseconds === undefined ? {} : { timeout: this.timeoutMilliseconds }),
    } };
  }
}

/** A captured assertion request. Credential success is not a verified server session. */
export class ASAuthorizationPlatformPublicKeyCredentialAssertionRequest {
  readonly kind = "assertion";
  readonly challenge: NSEData;
  readonly allowedCredentials: readonly CapturedDescriptor[] | undefined;
  readonly userVerificationPreference: UserVerificationRequirement;
  readonly timeoutMilliseconds: number | undefined;
  constructor(readonly relyingPartyIdentifier: string, challenge: NSEDataConvertible, options: ASAuthorizationAssertionOptions = {}) {
    this.relyingPartyIdentifier = relyingParty(relyingPartyIdentifier);
    this.challenge = data(challenge, "Challenge"); this.allowedCredentials = descriptors(options.allowedCredentials);
    this.userVerificationPreference = verification(options.userVerificationPreference); this.timeoutMilliseconds = timeout(options.timeoutMilliseconds);
    Object.freeze(this);
  }
  credentialRequestOptions(signal?: AbortSignal): CredentialRequestOptions {
    return { signal, publicKey: {
      challenge: this.challenge.bytes.buffer, rpId: this.relyingPartyIdentifier, userVerification: this.userVerificationPreference,
      ...(this.allowedCredentials ? { allowCredentials: webDescriptors(this.allowedCredentials) } : {}),
      ...(this.timeoutMilliseconds === undefined ? {} : { timeout: this.timeoutMilliseconds }),
    } };
  }
}
export type ASAuthorizationRequest = ASAuthorizationPlatformPublicKeyCredentialRegistrationRequest | ASAuthorizationPlatformPublicKeyCredentialAssertionRequest;

/** AuthenticationServices platform passkey provider; importing it touches no browser API. */
export class ASAuthorizationPlatformPublicKeyCredentialProvider {
  readonly relyingPartyIdentifier: string;
  readonly relyingPartyName: string;
  constructor(relyingPartyIdentifier: string, relyingPartyName = relyingPartyIdentifier) {
    this.relyingPartyIdentifier = relyingParty(relyingPartyIdentifier);
    if (typeof relyingPartyName !== "string" || !relyingPartyName.trim()) throw new TypeError("Passkey relying party name must not be empty.");
    this.relyingPartyName = relyingPartyName;
    Object.freeze(this);
  }
  createCredentialRegistrationRequest(challenge: NSEDataConvertible, name: string, userID: NSEDataConvertible, options: ASAuthorizationRegistrationOptions = {}): ASAuthorizationPlatformPublicKeyCredentialRegistrationRequest {
    return new ASAuthorizationPlatformPublicKeyCredentialRegistrationRequest(this.relyingPartyIdentifier, this.relyingPartyName, challenge, name, userID, options);
  }
  createCredentialAssertionRequest(challenge: NSEDataConvertible, options: ASAuthorizationAssertionOptions = {}): ASAuthorizationPlatformPublicKeyCredentialAssertionRequest {
    return new ASAuthorizationPlatformPublicKeyCredentialAssertionRequest(this.relyingPartyIdentifier, challenge, options);
  }
}