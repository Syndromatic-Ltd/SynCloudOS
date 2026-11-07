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
import { createHttpAuthentication } from "../../src/SynCloudOS/Authentication/createHttpAuthentication";
import { ASAuthorizationPlatformPublicKeyCredentialProvider, type ASAuthorizationBrowserPort } from "../../src/SynCloudOS/AuthenticationServices";
import { createPasskeyAuthentication } from "../../src/SynCloudOS/Authentication/providers/passkey";

function fixture(options: { serverSession?: boolean; verify?: () => Promise<void>; disabled?: boolean } = {}) {
  let admitted = false;
  const navigate = vi.fn();
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path === "/auth/methods") return Response.json({ methods: [{ id: "google", label: "Google" }, { id: "local", label: "Local" }] });
    if (path === "/auth/session") return Response.json(admitted ? { authenticated: true, profile: { subject: "server:ada", roles: ["member"] }, expiresAt: Date.now() + 60_000 } : { authenticated: false });
    if (path === "/auth/start") return Response.json({ redirectTo: "https://provider.example/authorize" });
    if (path === "/auth/logout") { admitted = false; return Response.json({}); }
    throw new Error(`Unexpected fetch: ${path}`);
  });
  const service = createHttpAuthentication({ fetch: fetcher, navigate, eventTarget: { addEventListener() {}, removeEventListener() {} }, createBroadcastChannel: () => ({ postMessage() {}, close() {}, onmessage: null }) });
  if (options.disabled) {
    const getSnapshot = service.getSnapshot;
    service.getSnapshot = () => ({ ...getSnapshot(), status: "disabled" });
  }
  const provider = new ASAuthorizationPlatformPublicKeyCredentialProvider("example.com");
  const get = vi.fn(async () => ({
    id: "credential", type: "public-key", rawId: new Uint8Array([1]).buffer,
    response: { clientDataJSON: new Uint8Array([2]).buffer, authenticatorData: new Uint8Array([3]).buffer, signature: new Uint8Array([4]).buffer, userHandle: null },
  } as unknown as PublicKeyCredential));
  const browser: ASAuthorizationBrowserPort = { isSecureContext: () => true, create: async () => null, get };
  const beginAssertion = vi.fn(async () => provider.createCredentialAssertionRequest(new Uint8Array([9])));
  const verifyAssertion = vi.fn(async () => { await options.verify?.(); admitted = options.serverSession !== false; });
  const wrapper = createPasskeyAuthentication({ service, relyingPartyIdentifier: "example.com", beginAssertion, verifyAssertion, browser, navigate });
  return { service, wrapper, beginAssertion, verifyAssertion, get, navigate, fetcher };
}

describe("opt-in system passkey provider", () => {
  it("adds passkeys beside existing providers and delegates their sign-in", async () => {
    const f = fixture();
    try {
      await f.wrapper.refresh();
      expect(f.wrapper.getSnapshot().methods.map(method => method.id)).toEqual(["google", "local", "passkey"]);
      expect(f.wrapper.sessionAdapter).toBe(f.service.sessionAdapter);
      await f.wrapper.signIn("google", "/workspace");
      expect(f.navigate).toHaveBeenCalledWith("https://provider.example/authorize");
      expect(f.get).not.toHaveBeenCalled();
    } finally { f.wrapper.dispose(); }
  });
  it("publishes only the server-refreshed identity after verification", async () => {
    const f = fixture(); const identities: unknown[] = [];
    f.wrapper.sessionAdapter.subscribe(value => identities.push(value));
    try {
      await f.wrapper.refresh();
      await f.wrapper.signIn("passkey", "/workspace");
      expect(f.verifyAssertion).toHaveBeenCalledTimes(1);
      expect(f.wrapper.getSnapshot()).toMatchObject({ status: "authenticated", profile: { subject: "server:ada" } });
      expect(identities.at(-1)).toMatchObject({ subjectId: "server:ada" });
      expect(f.navigate).toHaveBeenCalledWith("/workspace");
    } finally { f.wrapper.dispose(); }
  });
  it("does not authenticate merely because the browser returned an assertion", async () => {
    const f = fixture({ serverSession: false });
    try {
      await f.wrapper.refresh();
      await expect(f.wrapper.signIn("passkey", "/workspace")).rejects.toThrow("server session");
      expect(f.wrapper.getSnapshot().profile).toBeNull();
      expect(await f.wrapper.sessionAdapter.read()).toBeNull();
      expect(f.navigate).not.toHaveBeenCalled();
    } finally { f.wrapper.dispose(); }
  });
  it("leaves identity empty when the server rejects credential verification", async () => {
    const f = fixture({ verify: async () => { throw new Error("Server rejected assertion."); } });
    try {
      await f.wrapper.refresh();
      await expect(f.wrapper.signIn("passkey", "/workspace")).rejects.toThrow("Server rejected");
      expect(f.wrapper.getSnapshot().profile).toBeNull(); expect(f.navigate).not.toHaveBeenCalled();
    } finally { f.wrapper.dispose(); }
  });
  it("rejects external return paths and pre-aborted ceremonies without opening passkeys", async () => {
    const f = fixture();
    try {
      await f.wrapper.refresh();
      await expect(f.wrapper.signIn("passkey", "//attacker.example")).rejects.toThrow(TypeError);
      const abort = new AbortController(); abort.abort();
      await expect(f.wrapper.signIn("passkey", "/workspace", abort.signal)).rejects.toMatchObject({ name: "AbortError" });
      expect(f.beginAssertion).not.toHaveBeenCalled(); expect(f.get).not.toHaveBeenCalled();
    } finally { f.wrapper.dispose(); }
  });
  it("does not offer or invoke passkeys when its base service is disabled", async () => {
    const f = fixture({ disabled: true });
    try {
      expect(f.wrapper.getSnapshot().status).toBe("disabled");
      expect(f.wrapper.getSnapshot().methods).toEqual([]);
      await expect(f.wrapper.signIn("passkey", "/workspace")).rejects.toThrow("disabled");
      expect(f.beginAssertion).not.toHaveBeenCalled(); expect(f.get).not.toHaveBeenCalled();
    } finally { f.wrapper.dispose(); }
  });
  it("aborts a stalled begin operation on disposal without late browser access", async () => {
    const f = fixture();
    await f.wrapper.refresh();
    let finish!: (value: ReturnType<ASAuthorizationPlatformPublicKeyCredentialProvider["createCredentialAssertionRequest"]>) => void;
    f.beginAssertion.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.wrapper.signIn("passkey", "/workspace");
    f.wrapper.dispose();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    finish(new ASAuthorizationPlatformPublicKeyCredentialProvider("example.com").createCredentialAssertionRequest(new Uint8Array([1])));
    await Promise.resolve();
    expect(f.get).not.toHaveBeenCalled(); expect(f.verifyAssertion).not.toHaveBeenCalled();
  });
});