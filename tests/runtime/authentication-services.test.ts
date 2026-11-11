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

import { describe, expect, it, vi } from "vitest";
import { NSEData } from "../../src/Foundation/NSEData";
import {
  ASAuthorizationController,
  ASAuthorizationPlatformPublicKeyCredentialProvider,
  ASAuthorizationPlatformPublicKeyCredentialAssertionRequest,
  type ASAuthorizationBrowserPort,
} from "../../src/SynCloudOS/AuthenticationServices";

const bytes = (...values: number[]) => new Uint8Array(values).buffer;
const assertion = (): PublicKeyCredential => ({
  id: "credential", type: "public-key", rawId: bytes(1, 2), authenticatorAttachment: "platform",
  response: { clientDataJSON: bytes(3), authenticatorData: bytes(4), signature: bytes(5), userHandle: bytes(6) },
  getClientExtensionResults: () => ({}),
}) as unknown as PublicKeyCredential;
const registration = (): PublicKeyCredential => ({
  id: "credential", type: "public-key", rawId: bytes(1, 2), authenticatorAttachment: "platform",
  response: { clientDataJSON: bytes(3), attestationObject: bytes(4), getTransports: () => ["internal"] },
  getClientExtensionResults: () => ({}),
}) as unknown as PublicKeyCredential;
function browser(overrides: Partial<ASAuthorizationBrowserPort> = {}): ASAuthorizationBrowserPort {
  return { isSecureContext: () => true, create: async () => registration(), get: async () => assertion(), ...overrides };
}
const provider = () => new ASAuthorizationPlatformPublicKeyCredentialProvider("example.com", "Example");

describe("optional AuthenticationServices passkeys", () => {
  it("captures registration inputs and returns immutable Foundation data through a delegate", async () => {
    const challenge = new Uint8Array([7, 8]);
    const user = new Uint8Array([9]);
    const request = provider().createCredentialRegistrationRequest(challenge, "ada", user, { displayName: "Ada" });
    challenge[0] = 99; user[0] = 99;
    const create = vi.fn(async (options: CredentialCreationOptions) => {
      expect(Array.from(new Uint8Array(options.publicKey!.challenge as ArrayBuffer))).toEqual([7, 8]);
      expect(Array.from(new Uint8Array(options.publicKey!.user.id as ArrayBuffer))).toEqual([9]);
      expect(options.publicKey!.authenticatorSelection).toMatchObject({ authenticatorAttachment: "platform", residentKey: "required", userVerification: "required" });
      return registration();
    });
    const controller = new ASAuthorizationController([request], { browser: browser({ create }) });
    const complete = vi.fn(); const failed = vi.fn();
    controller.delegate = { authorizationControllerDidCompleteWithAuthorization: complete, authorizationControllerDidCompleteWithError: failed };
    const result = await controller.performRequests();
    expect(result.credential.kind).toBe("registration");
    expect(result.credential.credentialID).toBeInstanceOf(NSEData);
    expect(result.credential.credentialID.bytes).toEqual(new Uint8Array([1, 2]));
    expect(complete).toHaveBeenCalledWith(controller, result);
    expect(failed).not.toHaveBeenCalled();
    expect(Object.isFrozen(result.credential)).toBe(true);
  });
  it("returns assertion bytes without claiming that a server has authenticated the user", async () => {
    const get = vi.fn(async (options: CredentialRequestOptions) => {
      expect(options.publicKey!.rpId).toBe("example.com");
      expect(options.publicKey!.allowCredentials?.[0].id).toEqual(bytes(42));
      return assertion();
    });
    const request = provider().createCredentialAssertionRequest(bytes(7), { allowedCredentials: [{ credentialID: bytes(42), transports: ["internal"] }] });
    const result = await new ASAuthorizationController([request], { browser: browser({ get }) }).performRequests();
    expect(result.credential.kind).toBe("assertion");
    if (result.credential.kind !== "assertion") throw new Error("assertion expected");
    expect(result.credential.signature.bytes).toEqual(new Uint8Array([5]));
    expect(result.credential.userID?.bytes).toEqual(new Uint8Array([6]));
    expect(result).not.toHaveProperty("profile");
    expect(result).not.toHaveProperty("isAuthenticated");
  });
  it("refuses insecure hosts before touching browser credentials", async () => {
    const get = vi.fn(async () => assertion());
    const controller = new ASAuthorizationController([provider().createCredentialAssertionRequest(bytes(1))], { browser: browser({ isSecureContext: () => false, get }) });
    const error = vi.fn(); controller.delegate = { authorizationControllerDidCompleteWithError: error };
    await expect(controller.performRequests()).rejects.toMatchObject({ code: "notHandled" });
    expect(get).not.toHaveBeenCalled(); expect(error).toHaveBeenCalledTimes(1);
  });
  it("cancels immediately even when the browser port ignores its signal, suppressing late completion", async () => {
    let finish!: (value: PublicKeyCredential) => void;
    const get = vi.fn(() => new Promise<PublicKeyCredential>(resolve => { finish = resolve; }));
    const controller = new ASAuthorizationController([provider().createCredentialAssertionRequest(bytes(1))], { browser: browser({ get }) });
    const complete = vi.fn(); const failed = vi.fn();
    controller.delegate = { authorizationControllerDidCompleteWithAuthorization: complete, authorizationControllerDidCompleteWithError: failed };
    const pending = controller.performRequests();
    controller.cancel();
    await expect(pending).rejects.toMatchObject({ code: "canceled" });
    finish(assertion()); await Promise.resolve();
    expect(complete).not.toHaveBeenCalled(); expect(failed).toHaveBeenCalledTimes(1);
  });
  it("never calls the native port for pre-aborted or disposed requests", async () => {
    const get = vi.fn(async () => assertion());
    const controller = new ASAuthorizationController([provider().createCredentialAssertionRequest(bytes(1))], { browser: browser({ get }) });
    const abort = new AbortController(); abort.abort();
    await expect(controller.performRequests(abort.signal)).rejects.toMatchObject({ code: "canceled" });
    controller.dispose();
    await expect(controller.performRequests()).rejects.toMatchObject({ code: "canceled" });
    expect(get).not.toHaveBeenCalled();
  });
  it("rejects null and malformed browser responses", async () => {
    for (const value of [null, { ...assertion(), type: "password" }, { ...assertion(), response: {} }]) {
      const controller = new ASAuthorizationController([provider().createCredentialAssertionRequest(bytes(1))], { browser: browser({ get: async () => value as PublicKeyCredential | null }) });
      await expect(controller.performRequests()).rejects.toMatchObject({ code: "invalidResponse" });
    }
  });
  it("rejects invalid relying parties, empty challenges and out-of-range user handles before prompting", () => {
    for (const name of ["", "https://example.com", "example.com/path", "user@example.com", "example.com:443"]) expect(() => new ASAuthorizationPlatformPublicKeyCredentialProvider(name)).toThrow(TypeError);
    expect(() => provider().createCredentialAssertionRequest(bytes())).toThrow(TypeError);
    expect(() => new ASAuthorizationPlatformPublicKeyCredentialAssertionRequest("https://bad.example", bytes(1))).toThrow(TypeError);
    expect(() => provider().createCredentialRegistrationRequest(bytes(1), "ada", bytes())).toThrow(TypeError);
    expect(() => provider().createCredentialRegistrationRequest(bytes(1), "ada", new Uint8Array(65))).toThrow(TypeError);
  });
  it("ends controller ownership before invoking an error delegate that retries", async () => {
    const get = vi.fn(async () => assertion()).mockRejectedValueOnce(new DOMException("Cancelled", "NotAllowedError"));
    const controller = new ASAuthorizationController([provider().createCredentialAssertionRequest(bytes(1))], { browser: browser({ get }) });
    let retry: ReturnType<ASAuthorizationController["performRequests"]> | undefined;
    controller.delegate = { authorizationControllerDidCompleteWithError() { retry = controller.performRequests(); } };
    await expect(controller.performRequests()).rejects.toMatchObject({ code: "canceled" });
    await expect(retry).resolves.toHaveProperty("credential.kind", "assertion");
  });
  it("reports user cancellation once without exposing native error details", async () => {
    const error = vi.fn();
    const controller = new ASAuthorizationController([provider().createCredentialAssertionRequest(bytes(1))], { browser: browser({ get: async () => { throw new DOMException("secret native message", "NotAllowedError"); } }) });
    controller.delegate = { authorizationControllerDidCompleteWithError: error };
    await expect(controller.performRequests()).rejects.toMatchObject({ code: "canceled", message: "The passkey request was cancelled or not allowed." });
    expect(error).toHaveBeenCalledTimes(1);
  });
});