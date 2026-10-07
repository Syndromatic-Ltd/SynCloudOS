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

import type { IdentitySessionAdapterSnapshot } from "../Identity/identitySessionTypes";
import type { AuthPublicProfile } from "../Server/Auth/types";
import {
  createBrowserAuthenticationEnvironment,
  type BrowserAuthenticationEnvironment,
} from "../PlatformAdapters/BrowserAuthenticationEnvironment";
import type { AuthenticationMethod, AuthenticationService, AuthenticationSnapshot } from "./authenticationTypes";

export interface AuthenticationBroadcastPort { postMessage(value: unknown): void; close(): void; onmessage: ((event: MessageEvent) => void) | null; }
export interface HttpAuthenticationOptions {
  readonly fetch?: BrowserAuthenticationEnvironment["fetch"];
  readonly navigate?: (destination: string) => void;
  readonly eventTarget?: Pick<Window, "addEventListener" | "removeEventListener">;
  readonly createBroadcastChannel?: (name: string) => AuthenticationBroadcastPort;
  readonly now?: () => number;
  readonly setTimeout?: (callback: () => void, milliseconds: number) => unknown;
  readonly clearTimeout?: (handle: unknown) => void;
  /** Bounds fetch and response body parsing together. Defaults to 15 seconds. */
  readonly requestTimeoutMs?: number;
}

class AuthenticationRequestError extends Error {
  constructor(readonly code: NonNullable<AuthenticationSnapshot["errorCode"]>, message: string, cause?: unknown) {
    super(message, { cause });
  }
}

const initial: AuthenticationSnapshot = Object.freeze({ status: "checking", methods: Object.freeze([]), profile: null, expiresAt: null, error: null });
const message = (error: unknown) => error instanceof Error ? error.message : "Authentication unavailable.";
const failure = (error: unknown) => ({ error: message(error), errorCode: error instanceof AuthenticationRequestError ? error.code : undefined });
const localPath = (value: string) => value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !/^[a-z][a-z0-9+.-]*:/iu.test(value);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
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

function parseMethod(value: unknown): AuthenticationMethod | null {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0 || typeof value.label !== "string" || value.label.length === 0) {
    return null;
  }
  const iconUrl = value.iconUrl;
  if (iconUrl === undefined) return Object.freeze({ id: value.id, label: value.label });
  if (typeof iconUrl !== "string" || !safeIconUrl(iconUrl)) return null;
  return Object.freeze({ id: value.id, label: value.label, iconUrl });
}

function parseMethods(value: unknown): readonly AuthenticationMethod[] | null {
  if (!Array.isArray(value)) return null;
  const methods: AuthenticationMethod[] = [];
  for (const entry of value) {
    const parsed = parseMethod(entry);
    if (!parsed) return null;
    methods.push(parsed);
  }
  return Object.freeze(methods);
}
function profile(value: unknown): value is AuthPublicProfile {
  return isRecord(value) && typeof value.subject === "string" && value.subject.length > 0 && Array.isArray(value.roles) && value.roles.every((role) => typeof role === "string")
    && (value.name === undefined || typeof value.name === "string") && (value.email === undefined || typeof value.email === "string") && (value.avatarUrl === undefined || typeof value.avatarUrl === "string");
}

export function createHttpAuthentication(options: HttpAuthenticationOptions = {}): AuthenticationService {
  const requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) throw new TypeError("Authentication requestTimeoutMs must be finite and positive.");
  const browser = createBrowserAuthenticationEnvironment();
  const fetcher = options.fetch ?? browser.fetch;
  const navigate = options.navigate ?? browser.navigate;
  const eventTarget = options.eventTarget ?? browser.eventTarget;
  const now = options.now ?? Date.now;
  const schedule = options.setTimeout ?? browser.setTimeout;
  const cancelScheduled = options.clearTimeout ?? browser.clearTimeout;
  const channelFactory = options.createBroadcastChannel ?? browser.createBroadcastChannel;
  const channel = channelFactory?.("syncloudos-authentication") ?? null;
  let snapshot = initial;
  let disposed = false;
  let generation = 0;
  let logoutGeneration: number | null = null;
  let expiryHandle: unknown = null;
  const requests = new Set<AbortController>();
  const listeners = new Set<() => void>();
  const identityListeners = new Set<(value: IdentitySessionAdapterSnapshot | null) => void>();

  const identity = (): IdentitySessionAdapterSnapshot | null => snapshot.status === "authenticated" && snapshot.profile ? Object.freeze({
    id: `${snapshot.profile.subject}:${snapshot.expiresAt}`,
    subjectId: snapshot.profile.subject,
    state: "active",
    expiresAt: snapshot.expiresAt ?? undefined,
    claims: Object.freeze({ displayName: snapshot.profile.name ?? snapshot.profile.email ?? snapshot.profile.subject, email: snapshot.profile.email ?? "", roles: snapshot.profile.roles.join(",") }),
  }) : null;
  const notifyIdentity = () => { const value = identity(); identityListeners.forEach((listener) => listener(value)); };
  const clearExpiry = () => { if (expiryHandle !== null) cancelScheduled(expiryHandle); expiryHandle = null; };
  const publish = (next: AuthenticationSnapshot, identityChanged = false) => {
    if (disposed) return snapshot;
    snapshot = Object.freeze(next);
    clearExpiry();
    if (snapshot.status === "authenticated" && snapshot.expiresAt !== null) {
      expiryHandle = schedule(() => publish({ ...snapshot, status: "expired", profile: null, error: "Your session expired. Sign in again.", errorCode: undefined }, true), Math.max(0, snapshot.expiresAt - now()));
    }
    listeners.forEach((listener) => listener());
    if (identityChanged) notifyIdentity();
    return snapshot;
  };
  const request = async <T>(externalSignal: AbortSignal | undefined, work: (signal: AbortSignal, parseResponse: typeof parse) => Promise<T>) => {
    if (disposed) throw new DOMException("Authentication service is disposed.", "AbortError");
    if (externalSignal?.aborted) throw externalSignal.reason;
    const controller = new AbortController();
    // Settle independently of fetch/body cooperation, and keep late outcomes observed.
    return await new Promise<T>((resolve, reject) => {
      let settled = false;
      let timeoutHandle: unknown = null;
      let protocolFailure: Error | undefined;
      const parseResponse = (response: Response) => {
        // A stalled error body must not disguise an explicit HTTP failure as a timeout.
        if (!response.ok) protocolFailure ??= new Error(`Authentication request failed (${response.status}).`);
        return parse(response);
      };
      const abort = () => controller.abort(externalSignal?.reason);
      const cleanup = () => {
        if (timeoutHandle !== null) cancelScheduled(timeoutHandle);
        controller.signal.removeEventListener("abort", cancelled);
        externalSignal?.removeEventListener("abort", abort);
        requests.delete(controller);
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
        controller.abort(error);
      };
      const cancelled = () => fail(controller.signal.reason);
      controller.signal.addEventListener("abort", cancelled, { once: true });
      externalSignal?.addEventListener("abort", abort, { once: true });
      requests.add(controller);
      if (externalSignal?.aborted) abort();
      if (settled) return;
      try {
        timeoutHandle = schedule(() => fail(protocolFailure ?? new AuthenticationRequestError("REQUEST_TIMEOUT", "The authentication server did not respond in time.")), requestTimeoutMs);
        void work(controller.signal, parseResponse).then(value => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(value);
        }, fail);
      } catch (error) {
        fail(error);
      }
    });
  };
  const fetchResponse = async (input: RequestInfo | URL, init: RequestInit) => {
    try { return await fetcher(input, init); }
    catch (error) {
      if (init.signal?.aborted) throw error;
      throw new AuthenticationRequestError("CONNECTION_ERROR", "Cannot connect to the authentication server.", error);
    }
  };
  const parse = async (response: Response) => {
    let body: unknown;
    try { body = await response.json(); }
    catch (error) {
      if (!response.ok || error instanceof SyntaxError) body = null;
      else if (error instanceof TypeError) throw new AuthenticationRequestError("CONNECTION_ERROR", "Cannot read the authentication server response.", error);
      else throw error;
    }
    if (!response.ok) throw new Error(isRecord(body) && typeof body.error === "string" ? body.error : `Authentication request failed (${response.status}).`);
    if (!isRecord(body)) throw new Error("Authentication server returned an invalid response.");
    return body;
  };
  const refresh = async (signal?: AbortSignal) => {
    const current = ++generation;
    publish({ ...snapshot, status: "checking", error: null, errorCode: undefined });
    try {
      const [methodsBody, sessionBody] = await request(signal, (requestSignal, parseResponse) => Promise.all([
        fetchResponse("/auth/methods", { credentials: "same-origin", signal: requestSignal }).then(parseResponse),
        fetchResponse("/auth/session", { credentials: "same-origin", cache: "no-store", signal: requestSignal }).then(parseResponse),
      ]));
      if (current !== generation || disposed) return snapshot;
      const methods = parseMethods(methodsBody.methods);
      if (!methods) throw new Error("Authentication methods response is invalid.");
      if (sessionBody.authenticated === false) return publish({ status: "anonymous", methods, profile: null, expiresAt: null, error: null }, true);
      const expiresAt = sessionBody.expiresAt;
      if (sessionBody.authenticated !== true || !profile(sessionBody.profile) || typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) throw new Error("Authentication session response is invalid.");
      if (expiresAt <= now()) return publish({ status: "expired", methods, profile: null, expiresAt, error: "Your session expired. Sign in again." }, true);
      return publish({ status: "authenticated", methods, profile: Object.freeze({ ...sessionBody.profile, roles: Object.freeze([...sessionBody.profile.roles]) }), expiresAt, error: null }, true);
    } catch (error) {
      if (signal?.aborted || disposed) throw error;
      if (current !== generation) return snapshot;
      return publish({ ...snapshot, status: "error", profile: null, expiresAt: null, ...failure(error) }, true);
    }
  };
  const revalidate = () => {
    // Passive browser events must not overtake the current explicit logout.
    if (!disposed && logoutGeneration !== generation) void refresh().catch(() => undefined);
  };
  eventTarget?.addEventListener("focus", revalidate);
  eventTarget?.addEventListener("storage", revalidate);
  eventTarget?.addEventListener("online", revalidate);
  if (channel) channel.onmessage = revalidate;
  const logout = async (signal?: AbortSignal, broadcast = true) => {
    const current = ++generation;
    logoutGeneration = current;
    try {
      publish({ ...snapshot, error: null, errorCode: undefined });
      await request(signal, async (requestSignal, parseResponse) => { await parseResponse(await fetchResponse("/auth/logout", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, signal: requestSignal })); });
      if (current !== generation || disposed) return;
      publish({ ...initial, status: "anonymous" }, true);
      if (broadcast) channel?.postMessage({ type: "session-changed" });
    } catch (error) {
      if (signal?.aborted || disposed) throw error;
      if (current === generation) publish({ ...snapshot, ...failure(error) });
      throw error;
    } finally {
      if (logoutGeneration === current) logoutGeneration = null;
    }
  };

  return {
    sessionAdapter: {
      id: "http-session",
      read: async (signal) => { await refresh(signal); return identity(); },
      subscribe(listener) { identityListeners.add(listener); return () => identityListeners.delete(listener); },
      end: ({ signal }) => logout(signal),
      dispose() {},
    },
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    refresh,
    async signIn(methodId, returnPath, signal) {
      if (!localPath(returnPath)) throw new TypeError("Authentication return path must be local.");
      if (!snapshot.methods.some((entry) => entry.id === methodId)) throw new TypeError("Authentication method is unavailable.");
      const current = ++generation;
      publish({ ...snapshot, status: "authenticating", error: null, errorCode: undefined });
      try {
        const body = await request(signal, async (requestSignal, parseResponse) => parseResponse(await fetchResponse("/auth/start", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ method: methodId, returnPath }), signal: requestSignal })));
        if (current !== generation || disposed) return;
        if (typeof body.redirectTo !== "string") throw new Error("Authentication redirect is invalid.");
        navigate(body.redirectTo);
      } catch (error) {
        if (signal?.aborted || disposed) throw error;
        if (current !== generation) return;
        publish({ ...snapshot, status: "error", ...failure(error) });
        throw error;
      }
    },
    signOut: (signal) => logout(signal),
    dispose() {
      if (disposed) return;
      disposed = true; generation += 1; clearExpiry(); requests.forEach((controller) => controller.abort()); requests.clear(); listeners.clear(); identityListeners.clear();
      eventTarget?.removeEventListener("focus", revalidate); eventTarget?.removeEventListener("storage", revalidate); eventTarget?.removeEventListener("online", revalidate); channel?.close();
    },
  };
}
