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

import { beforeAll, describe, expect, it } from "vitest";
import {
  InMemoryAuthStore,
  createAuthHandler,
  type AuthAdmissionPolicy,
  type AuthHandler,
  type StoredAuthSession,
} from "../../src/SynCloudOS/Server/Auth";
import { googleAuthenticationMethod } from "../../src/SynCloudOS/Authentication/providers/google";

const origin = "https://syncloud.test";
const issuer = "https://accounts.test";
const clientId = "syncloud-test-client";
const encoder = new TextEncoder();

function base64url(value: ArrayBuffer | Uint8Array | string) {
  const bytes = typeof value === "string" ? encoder.encode(value) : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function cookies(response: Response) {
  const values = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.()
    ?? [response.headers.get("set-cookie") ?? ""];
  return values.filter(Boolean);
}

function cookieValue(response: Response, name: string) {
  const match = cookies(response).join("\n").match(new RegExp(`${name}=([^;]*)`, "u"));
  return match?.[1] ?? "";
}

function request(path: string, init: RequestInit = {}) {
  return new Request(`${origin}${path}`, init);
}

let signingKey: CryptoKey;
let rogueKey: CryptoKey;
let publicJwk: JsonWebKey;

class RecordingAuthStore extends InMemoryAuthStore {
  readonly createdSessionHashes: string[] = [];

  override async create(session: StoredAuthSession & { readonly tokenHash: string }) {
    this.createdSessionHashes.push(session.tokenHash);
    await super.create(session);
  }
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const roguePair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  signingKey = pair.privateKey;
  rogueKey = roguePair.privateKey;
  publicJwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "local-key", alg: "RS256", use: "sig" };
});

type TokenVariant = "valid" | "bad-signature" | "bad-audience" | "bad-issuer" | "bad-nonce" | "unverified" | "unapproved";

async function signIdToken(variant: TokenVariant, nonce: string) {
  const header = base64url(JSON.stringify({ alg: "RS256", kid: "local-key", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({
    iss: variant === "bad-issuer" ? "https://attacker.test" : issuer,
    sub: "provider-subject",
    aud: variant === "bad-audience" ? "another-client" : clientId,
    exp: now + 300,
    iat: now,
    nonce: variant === "bad-nonce" ? "different-nonce" : nonce,
    email: variant === "unapproved" ? "stranger@example.com" : "member@example.com",
    email_verified: variant !== "unverified",
    name: "Ada Member",
    picture: "https://images.test/ada.png",
  }));
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", variant === "bad-signature" ? rogueKey : signingKey, encoder.encode(signingInput));
  return `${signingInput}.${base64url(signature)}`;
}

async function createHarness(options: { now?: () => number; admission?: AuthAdmissionPolicy; failDiscoveryOnce?: boolean } = {}) {
  const store = new RecordingAuthStore();
  const challenges = new Map<string, { challenge: string; nonce: string }>();
  const codes = new Map<string, TokenVariant>();
  let latestNonce = "";
  let latestChallenge = "";
  let discoveryAttempts = 0;
  const providerFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname === "/.well-known/openid-configuration") {
      discoveryAttempts += 1;
      if (options.failDiscoveryOnce && discoveryAttempts === 1) return Response.json({ error: "temporary" }, { status: 503 });
      return Response.json({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ["code"],
        id_token_signing_alg_values_supported: ["RS256"],
        token_endpoint_auth_methods_supported: ["client_secret_post"],
      });
    }
    if (url.pathname === "/jwks") return Response.json({ keys: [publicJwk] });
    if (url.pathname === "/token") {
      const body = new URLSearchParams(String(init?.body ?? ""));
      const code = body.get("code") ?? "";
      const expected = challenges.get(code);
      const verifier = body.get("code_verifier") ?? "";
      const verifierDigest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
      if (!expected || base64url(verifierDigest) !== expected.challenge) {
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      }
      const variant = codes.get(code) ?? "valid";
      return Response.json({ access_token: "not-stored", token_type: "Bearer", expires_in: 300, id_token: await signIdToken(variant, expected.nonce) });
    }
    throw new Error(`Unexpected provider request: ${url}`);
  };
  const admission = options.admission ?? {
    async admit(identity) {
      return { allowed: identity.emailVerified === true && identity.email === "member@example.com", roles: ["member"] };
    },
  };
  const auth = createAuthHandler({
    config: {
      issuer,
      clientId,
      clientSecret: "server-secret",
      publicOrigin: origin,
      method: googleAuthenticationMethod,
    },
    store,
    admission,
    fetch: providerFetch,
    now: options.now ?? (() => Date.now()),
  });

  async function start(returnPath = "/workspace") {
    const response = await auth.fetch(request("/auth/start", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ method: googleAuthenticationMethod.id, returnPath }),
    }));
    const json = await response.clone().json() as { redirectTo?: string };
    if (response.ok && json.redirectTo) {
      const authorization = new URL(json.redirectTo);
      latestNonce = authorization.searchParams.get("nonce") ?? "";
      latestChallenge = authorization.searchParams.get("code_challenge") ?? "";
    }
    return response;
  }

  async function callback(startResponse: Response, variant: TokenVariant = "valid", overrides: { state?: string; binding?: string; session?: string } = {}) {
    const authorization = new URL((await startResponse.clone().json() as { redirectTo: string }).redirectTo);
    const state = overrides.state ?? authorization.searchParams.get("state") ?? "";
    const binding = overrides.binding ?? cookieValue(startResponse, "__Host-syncloudos_auth");
    const code = `${variant}-${crypto.randomUUID()}`;
    codes.set(code, variant);
    // The local provider records the verifier-equivalent challenge supplied by the client.
    // Its token endpoint receives the verifier; the harness checks it through this per-code slot.
    challenges.set(code, { challenge: latestChallenge, nonce: latestNonce });
    const response = await auth.fetch(request(`/auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`, {
      headers: { cookie: `__Host-syncloudos_auth=${binding}${overrides.session ? `; __Host-syncloudos_session=${overrides.session}` : ""}` },
    }));
    return response;
  }

  return { auth, store, start, callback, get latestChallenge() { return latestChallenge; }, challenges };
}

describe("server authentication boundary", () => {
  it.each([
    ["HTTP origin", { publicOrigin: "http://syncloud.test" }],
    ["zero transaction lifetime", { transactionLifetimeMs: 0 }],
    ["unbounded transaction lifetime", { transactionLifetimeMs: Number.POSITIVE_INFINITY }],
    ["overlong session lifetime", { sessionLifetimeMs: 8 * 60 * 60 * 1000 + 1 }],
  ])("rejects unsafe server configuration: %s", (_name, override) => {
    expect(() => createAuthHandler({
      config: { issuer, clientId, publicOrigin: origin, method: googleAuthenticationMethod, ...override },
      store: new InMemoryAuthStore(),
      admission: { async admit() { return { allowed: false, roles: [] }; } },
      fetch: async () => new Response(null, { status: 500 }),
    })).toThrow();
  });

  it("runs code-only OIDC with PKCE and issues a minimal revocable session", async () => {
    const harness = await createHarness();
    const methods = await harness.auth.fetch(request("/auth/methods"));
    expect(await methods.json()).toEqual({ methods: [googleAuthenticationMethod], persistentSessions: false });

    const started = await harness.start("/workspace?view=dial");
    expect(started.status).toBe(200);
    const redirect = new URL((await started.clone().json() as { redirectTo: string }).redirectTo);
    expect(redirect.searchParams.get("response_type")).toBe("code");
    expect(redirect.searchParams.has("id_token")).toBe(false);
    expect(redirect.searchParams.get("scope")).toBe("openid email profile");
    expect(redirect.searchParams.get("code_challenge_method")).toBe("S256");
    expect(cookies(started).join(";")).toContain("Secure");
    expect(cookies(started).join(";")).toContain("HttpOnly");
    expect(cookies(started).join(";")).toContain("SameSite=Lax");

    const callback = await harness.callback(started);
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe(`${origin}/workspace?view=dial`);
    const sessionCookie = cookieValue(callback, "__Host-syncloudos_session");
    expect(sessionCookie).not.toBe("");
    expect(harness.store.createdSessionHashes).toHaveLength(1);
    expect(harness.store.createdSessionHashes[0]).not.toBe(sessionCookie);

    const session = await harness.auth.fetch(request("/auth/session", { headers: { cookie: `__Host-syncloudos_session=${sessionCookie}` } }));
    expect(session.headers.get("cache-control")).toBe("no-store");
    const publicSession = await session.json();
    expect(publicSession).toMatchObject({
      authenticated: true,
      profile: { subject: `${issuer}|provider-subject`, email: "member@example.com", name: "Ada Member", roles: ["member"] },
    });
    expect(JSON.stringify(publicSession).toLowerCase()).not.toContain("token");
  });

  it.each([
    ["missing", ""],
    ["forged", "forged-session"],
  ])("returns anonymous for a %s session cookie", async (_name, value) => {
    const { auth } = await createHarness();
    const response = await auth.fetch(request("/auth/session", { headers: value ? { cookie: `__Host-syncloudos_session=${value}` } : {} }));
    expect(await response.json()).toEqual({ authenticated: false });
  });

  it("enforces session expiry and revocation on every read", async () => {
    let now = Date.now();
    const harness = await createHarness({ now: () => now });
    const started = await harness.start();
    const signedIn = await harness.callback(started);
    const token = cookieValue(signedIn, "__Host-syncloudos_session");
    now += 8 * 60 * 60 * 1000 + 1;
    const expired = await harness.auth.fetch(request("/auth/session", { headers: { cookie: `__Host-syncloudos_session=${token}` } }));
    expect(await expired.json()).toEqual({ authenticated: false });

    const second = await createHarness();
    const secondToken = cookieValue(await second.callback(await second.start()), "__Host-syncloudos_session");
    await second.store.revoke(await second.auth.hashToken(secondToken));
    const revoked = await second.auth.fetch(request("/auth/session", { headers: { cookie: `__Host-syncloudos_session=${secondToken}` } }));
    expect(await revoked.json()).toEqual({ authenticated: false });
  });

  it.each(["/auth/start", "/auth/logout"])("rejects wrong-origin POST %s", async (path) => {
    const { auth } = await createHarness();
    const response = await auth.fetch(request(path, { method: "POST", headers: { origin: "https://attacker.test", "content-type": "application/json" }, body: "{}" }));
    expect(response.status).toBe(403);
  });

  it("rejects external return URLs", async () => {
    const { start } = await createHarness();
    expect((await start("https://attacker.test/steal")).status).toBe(400);
    expect((await start("//attacker.test/steal")).status).toBe(400);
  });

  it("retries provider discovery after a temporary failure", async () => {
    const harness = await createHarness({ failDiscoveryOnce: true });
    expect((await harness.start()).status).toBe(503);
    expect((await harness.start()).status).toBe(200);
  });

  it.each([
    ["state", { state: "wrong-state" }],
    ["browser binding", { binding: "wrong-binding" }],
  ])("rejects a mismatched %s", async (_name, overrides) => {
    const harness = await createHarness();
    expect((await harness.callback(await harness.start(), "valid", overrides)).status).toBe(400);
  });

  it("atomically consumes a transaction and rejects callback replay", async () => {
    const harness = await createHarness();
    const started = await harness.start();
    const authorization = new URL((await started.clone().json() as { redirectTo: string }).redirectTo);
    const binding = cookieValue(started, "__Host-syncloudos_auth");
    const code = `valid-${crypto.randomUUID()}`;
    harness.challenges.set(code, { challenge: authorization.searchParams.get("code_challenge") ?? "", nonce: authorization.searchParams.get("nonce") ?? "" });
    const callbackRequest = () => request(`/auth/callback?code=${code}&state=${authorization.searchParams.get("state")}`, { headers: { cookie: `__Host-syncloudos_auth=${binding}` } });
    expect((await harness.auth.fetch(callbackRequest())).status).toBe(302);
    expect((await harness.auth.fetch(callbackRequest())).status).toBe(400);
  });

  it("rejects an expired authentication transaction", async () => {
    let now = Date.now();
    const harness = await createHarness({ now: () => now });
    const started = await harness.start();
    now += 10 * 60 * 1000 + 1;
    expect((await harness.callback(started)).status).toBe(400);
  });

  it("rotates and revokes the previous session on sign-in", async () => {
    const harness = await createHarness();
    const oldToken = cookieValue(await harness.callback(await harness.start()), "__Host-syncloudos_session");
    const nextToken = cookieValue(await harness.callback(await harness.start(), "valid", { session: oldToken }), "__Host-syncloudos_session");
    expect(nextToken).not.toBe(oldToken);
    const oldSession = await harness.auth.fetch(request("/auth/session", { headers: { cookie: `__Host-syncloudos_session=${oldToken}` } }));
    expect(await oldSession.json()).toEqual({ authenticated: false });
  });

  it.each([
    ["bad-signature", 401],
    ["bad-audience", 401],
    ["bad-issuer", 401],
    ["bad-nonce", 401],
    ["unverified", 403],
    ["unapproved", 403],
  ] as const)("rejects %s provider identity evidence", async (variant, status) => {
    const harness = await createHarness();
    expect((await harness.callback(await harness.start(), variant)).status).toBe(status);
  });

  it("denies direct protected API access and checks the resource permission", async () => {
    const harness = await createHarness({ admission: { async admit() { return { allowed: true, roles: ["reader"] }; } } });
    const protectedHandler = harness.auth.protect("documents.write", async () => Response.json({ secret: true }));
    expect((await protectedHandler(request("/api/private"))).status).toBe(401);
    const sessionCookie = cookieValue(await harness.callback(await harness.start()), "__Host-syncloudos_session");
    expect((await protectedHandler(request("/api/private", { headers: { cookie: `__Host-syncloudos_session=${sessionCookie}` } }))).status).toBe(403);
  });

  it("rejects a cross-origin protected mutation before resource handling", async () => {
    const harness = await createHarness({ admission: { async admit() { return { allowed: true, roles: ["documents.write"] }; } } });
    const protectedHandler = harness.auth.protect("documents.write", async () => Response.json({ written: true }));
    const sessionCookie = cookieValue(await harness.callback(await harness.start()), "__Host-syncloudos_session");
    const response = await protectedHandler(request("/api/documents/1", {
      method: "POST",
      headers: { origin: "https://attacker.test", cookie: `__Host-syncloudos_session=${sessionCookie}` },
    }));
    expect(response.status).toBe(403);
  });

  it("revokes logout idempotently and clears the host-only cookie", async () => {
    const harness = await createHarness();
    const sessionCookie = cookieValue(await harness.callback(await harness.start()), "__Host-syncloudos_session");
    const logout = () => harness.auth.fetch(request("/auth/logout", { method: "POST", headers: { origin, cookie: `__Host-syncloudos_session=${sessionCookie}` } }));
    const response = await logout();
    expect(response.status).toBe(204);
    expect(cookies(response).join(";")).toContain("__Host-syncloudos_session=");
    expect(cookies(response).join(";")).toContain("Max-Age=0");
    expect((await logout()).status).toBe(204);
    const session = await harness.auth.fetch(request("/auth/session", { headers: { cookie: `__Host-syncloudos_session=${sessionCookie}` } }));
    expect(await session.json()).toEqual({ authenticated: false });
  });
});
