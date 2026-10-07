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
  calculatePKCECodeChallenge,
  generateRandomCodeVerifier,
  generateRandomNonce,
  generateRandomState,
  OidcClient,
} from "./oidc";
import { clearCookie, readCookie, secureCookie, SESSION_COOKIE, TRANSACTION_COOKIE } from "./cookies";
import type { AuthenticationMethod } from "../../Authentication/authenticationTypes";
import type { AuthHandler, AuthHandlerOptions, AuthPublicProfile } from "./types";

const DEFAULT_TRANSACTION_LIFETIME_MS = 10 * 60 * 1000;
const DEFAULT_SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;

class AuthHttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function json(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(value), { ...init, headers });
}

function localReturnPath(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    throw new AuthHttpError(400, "Invalid return path.");
  }
  return value;
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function assertSameOrigin(request: Request, publicOrigin: string) {
  if (request.headers.get("origin") !== publicOrigin) throw new AuthHttpError(403, "Cross-origin request denied.");
}

function parseProfile(value: string): AuthPublicProfile | null {
  try {
    const profile = JSON.parse(value) as Partial<AuthPublicProfile>;
    if (typeof profile.subject !== "string" || !Array.isArray(profile.roles) || !profile.roles.every((role) => typeof role === "string")) return null;
    return profile as AuthPublicProfile;
  } catch {
    return null;
  }
}

function safeIconUrl(value: string) {
  if (value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value) || value.includes("\\")) return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function normalizeMethod(value: unknown): AuthenticationMethod {
  if (typeof value !== "object" || value === null) throw new TypeError("Authentication method descriptor is invalid.");
  const method = value as Partial<AuthenticationMethod>;
  if (typeof method.id !== "string" || method.id.length === 0 || typeof method.label !== "string" || method.label.length === 0) {
    throw new TypeError("Authentication method descriptor is invalid.");
  }
  if (method.iconUrl !== undefined && (typeof method.iconUrl !== "string" || !safeIconUrl(method.iconUrl))) {
    throw new TypeError("Authentication method icon URL is invalid.");
  }
  return Object.freeze({
    id: method.id,
    label: method.label,
    ...(method.iconUrl === undefined ? {} : { iconUrl: method.iconUrl }),
  });
}


export function createAuthHandler(options: AuthHandlerOptions): AuthHandler {
  const now = options.now ?? (() => Date.now());
  const method = normalizeMethod(options.config.method);
  const configuredOrigin = new URL(options.config.publicOrigin);
  if (configuredOrigin.protocol !== "https:") throw new TypeError("PUBLIC_ORIGIN must use HTTPS.");
  const publicOrigin = configuredOrigin.origin;
  if (publicOrigin !== options.config.publicOrigin.replace(/\/$/u, "")) throw new TypeError("PUBLIC_ORIGIN must be an origin without a path.");
  const redirectUri = `${publicOrigin}/auth/callback`;
  const oidc = new OidcClient({
    issuer: options.config.issuer,
    clientId: options.config.clientId,
    clientSecret: options.config.clientSecret,
    fetch: options.fetch ?? globalThis.fetch,
  });
  const transactionLifetime = options.config.transactionLifetimeMs ?? DEFAULT_TRANSACTION_LIFETIME_MS;
  const sessionLifetime = options.config.sessionLifetimeMs ?? DEFAULT_SESSION_LIFETIME_MS;
  if (!Number.isFinite(transactionLifetime) || transactionLifetime <= 0 || transactionLifetime > DEFAULT_TRANSACTION_LIFETIME_MS) {
    throw new TypeError("Authentication transaction lifetime must be between 1 ms and 10 minutes.");
  }
  if (!Number.isFinite(sessionLifetime) || sessionLifetime <= 0 || sessionLifetime > DEFAULT_SESSION_LIFETIME_MS) {
    throw new TypeError("Authentication session lifetime must be between 1 ms and 8 hours.");
  }

  async function hashToken(token: string) { return digest(token); }

  async function readSession(request: Request) {
    const token = readCookie(request, SESSION_COOKIE);
    if (!token) return null;
    const tokenHash = await hashToken(token);
    const session = await options.store.find(tokenHash);
    if (!session) return null;
    if (session.expiresAt <= now()) {
      await options.store.revoke(tokenHash);
      return null;
    }
    const profile = parseProfile(session.profile);
    return profile ? { profile, expiresAt: session.expiresAt } : null;
  }

  async function authenticate(request: Request) {
    return (await readSession(request))?.profile ?? null;
  }

  async function start(request: Request) {
    assertSameOrigin(request, publicOrigin);
    const body = await request.json().catch(() => { throw new AuthHttpError(400, "Invalid JSON body."); }) as Record<string, unknown>;
    if (body.method !== method.id) throw new AuthHttpError(400, "Unsupported authentication method.");
    const returnPath = localReturnPath(body.returnPath ?? "/");
    const state = generateRandomState();
    const nonce = generateRandomNonce();
    const pkceVerifier = generateRandomCodeVerifier();
    const browserBinding = generateRandomState();
    const expiresAt = now() + transactionLifetime;
    await options.store.createTransaction({
      stateHash: await digest(state),
      browserBindingHash: await digest(browserBinding),
      nonce,
      pkceVerifier,
      returnPath,
      expiresAt,
    });
    const redirectTo = await oidc.authorizationUrl({ redirectUri, state, nonce, codeChallenge: await calculatePKCECodeChallenge(pkceVerifier) });
    return json({ redirectTo: redirectTo.href }, {
      headers: { "cache-control": "no-store", "set-cookie": secureCookie(TRANSACTION_COOKIE, browserBinding, transactionLifetime / 1000) },
    });
  }

  async function callback(request: Request) {
    const url = new URL(request.url);
    if (url.origin !== publicOrigin || url.pathname !== "/auth/callback") throw new AuthHttpError(400, "Invalid callback URL.");
    const state = url.searchParams.get("state");
    const binding = readCookie(request, TRANSACTION_COOKIE);
    if (!state || !binding) throw new AuthHttpError(400, "Invalid authentication transaction.");
    const transaction = await options.store.consumeTransaction({
      stateHash: await digest(state),
      browserBindingHash: await digest(binding),
      now: now(),
    });
    if (!transaction) throw new AuthHttpError(400, "Invalid authentication transaction.");

    let claims;
    try {
      claims = await oidc.exchange(url, { state, nonce: transaction.nonce, pkceVerifier: transaction.pkceVerifier }, redirectUri);
    } catch {
      throw new AuthHttpError(401, "OIDC response validation failed.");
    }
    const email = typeof claims.email === "string" ? claims.email : undefined;
    const emailVerified = claims.email_verified === true;
    const admission = await options.admission.admit({ issuer: claims.iss, subject: claims.sub, email, emailVerified });
    if (!admission.allowed) throw new AuthHttpError(403, "Identity is not admitted.");
    const subject = `${claims.iss}|${claims.sub}`;
    const profile: AuthPublicProfile = {
      subject,
      ...(email ? { email } : {}),
      ...(typeof claims.name === "string" ? { name: claims.name } : {}),
      ...(typeof claims.picture === "string" ? { avatarUrl: claims.picture } : {}),
      roles: [...admission.roles],
    };
    const oldToken = readCookie(request, SESSION_COOKIE);
    if (oldToken) await options.store.revoke(await hashToken(oldToken));
    const sessionToken = generateRandomState();
    const expiresAt = now() + sessionLifetime;
    await options.store.create({ tokenHash: await hashToken(sessionToken), subject, profile: JSON.stringify(profile), expiresAt });
    const headers = new Headers({ location: `${publicOrigin}${transaction.returnPath}`, "cache-control": "no-store" });
    headers.append("set-cookie", secureCookie(SESSION_COOKIE, sessionToken, sessionLifetime / 1000));
    headers.append("set-cookie", clearCookie(TRANSACTION_COOKIE));
    return new Response(null, { status: 302, headers });
  }

  async function logout(request: Request) {
    assertSameOrigin(request, publicOrigin);
    const token = readCookie(request, SESSION_COOKIE);
    if (token) await options.store.revoke(await hashToken(token));
    return new Response(null, { status: 204, headers: { "cache-control": "no-store", "set-cookie": clearCookie(SESSION_COOKIE) } });
  }

  async function fetchHandler(request: Request) {
    try {
      const { pathname } = new URL(request.url);
      if (pathname === "/auth/methods" && request.method === "GET") {
        return json({ methods: [method], persistentSessions: false }, { headers: { "cache-control": "no-store" } });
      }
      if (pathname === "/auth/start" && request.method === "POST") return await start(request);
      if (pathname === "/auth/callback" && request.method === "GET") return await callback(request);
      if (pathname === "/auth/session" && request.method === "GET") {
        const session = await readSession(request);
        if (!session) return json({ authenticated: false }, { headers: { "cache-control": "no-store" } });
        return json({ authenticated: true, profile: session.profile, expiresAt: session.expiresAt }, { headers: { "cache-control": "no-store" } });
      }
      if (pathname === "/auth/logout" && request.method === "POST") return await logout(request);
      return json({ error: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } });
    } catch (error) {
      if (error instanceof AuthHttpError) return json({ error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
      return json({ error: "Authentication service unavailable." }, { status: 503, headers: { "cache-control": "no-store" } });
    }
  }

  function protect(permission: string, handler: (request: Request, profile: AuthPublicProfile) => Response | Promise<Response>) {
    return async (request: Request) => {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && request.headers.get("origin") !== publicOrigin) {
        return json({ error: "cross_origin_request" }, { status: 403, headers: { "cache-control": "no-store" } });
      }
      const profile = await authenticate(request);
      if (!profile) return json({ error: "unauthenticated" }, { status: 401, headers: { "cache-control": "no-store" } });
      const allowed = await (options.permissionCheck?.(profile, permission, { request, resource: new URL(request.url) })
        ?? (profile.roles.includes(permission) || profile.roles.includes("admin")));
      if (!allowed) return json({ error: "forbidden" }, { status: 403, headers: { "cache-control": "no-store" } });
      return handler(request, profile);
    };
  }

  return { fetch: fetchHandler, hashToken, authenticate, protect };
}
