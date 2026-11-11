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

/** Browser permission and app consent are separate inputs. No state here grants a browser permission. */
export type PrivacyAuthorizationStatus = "unknown" | "prompt" | "granted" | "denied" | "unavailable";
export type PrivacyDecision = "prompt" | "granted" | "denied";
export interface PrivacyScope {
  readonly userId: string;
  readonly appId: string;
  /** Framework-owned service name, for example location, camera or midi.sysex. */
  readonly service: string;
}
export interface PrivacyAuthorizationRecord extends PrivacyScope {
  readonly decision: PrivacyDecision;
  readonly authorizationStatus: PrivacyAuthorizationStatus;
  readonly browserStatus: PrivacyAuthorizationStatus | null;
  readonly updatedAt: number;
}
export interface PrivacyPersistence {
  getPreference<T>(key: string, fallback: T): T;
  setPreference<T>(key: string, value: T): boolean;
}
export interface PrivacyRequestOptions<T> {
  readonly signal?: AbortSignal;
  /** Releases a resource returned after its owner or permission was revoked. */
  readonly dispose?: (value: T) => void;
}
export interface PrivacyApplicationPort {
  readonly scope: PrivacyScope;
  /** Passive, synchronous combination; omitted browser status means only the app's local gate. */
  authorizationStatus(browserStatus?: PrivacyAuthorizationStatus): PrivacyAuthorizationStatus;
  /** Passive browser query. It never invokes requestConsent or changes the app's local gate. */
  getAuthorizationStatus(query?: (signal: AbortSignal) => PrivacyAuthorizationStatus | Promise<PrivacyAuthorizationStatus>): Promise<PrivacyAuthorizationStatus>;
  /** A prompt is allowed to begin. A local or observed browser denial is not. */
  assertRequestAllowed(): void;
  request<T>(operation: (signal: AbortSignal) => T | Promise<T>, options?: PrivacyRequestOptions<T>): Promise<T>;
  requestAuthorization(operation: (signal: AbortSignal) => PrivacyAuthorizationStatus | Promise<PrivacyAuthorizationStatus>, options?: { readonly signal?: AbortSignal }): Promise<PrivacyAuthorizationStatus>;
  /** Revocation and mount cancellation release live watches/sessions; the returned function unregisters. */
  bindResource(dispose: () => void): () => void;
  /** Records a passive observation, never app consent. */
  observe(browserStatus: PrivacyAuthorizationStatus): PrivacyAuthorizationStatus;
}
export interface PrivacyStore {
  readonly runtimeId: string;
  forApplication(scope: PrivacyScope & { readonly signal?: AbortSignal }): PrivacyApplicationPort;
  /** Host/user choice changes only the per-app gate; the browser still decides native access. */
  setAuthorization(scope: PrivacyScope, decision: PrivacyDecision): void;
  revoke(scope: PrivacyScope): void;
  getSnapshot(): readonly PrivacyAuthorizationRecord[];
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
export interface PrivacyStoreOptions {
  readonly runtimeId: string;
  /** This port must already be scoped to the host/runtime's persistence namespace. */
  readonly persistence?: PrivacyPersistence;
  readonly preferenceKey?: string;
  readonly now?: () => number;
  /** Optional host prompt for app consent, in addition to the browser's origin permission. */
  readonly requestConsent?: (scope: PrivacyScope, signal: AbortSignal) => boolean | Promise<boolean>;
}

interface StoredRecord extends PrivacyScope {
  readonly decision: PrivacyDecision;
  readonly updatedAt: number;
}
interface Lease {
  readonly signal: AbortSignal;
  abort(): void;
  release(): void;
}
const states = new Set<PrivacyAuthorizationStatus>(["unknown", "prompt", "granted", "denied", "unavailable"]);
const decisions = new Set<PrivacyDecision>(["prompt", "granted", "denied"]);
const maximumRecords = 2048;
const preferenceKey = "privacy.authorization.v1";

function scopeIdentity(input: PrivacyScope): PrivacyScope {
  if (!input || typeof input !== "object") throw new TypeError("Privacy scope requires a user, application and service.");
  const valid = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 512 && value === value.trim();
  if (!valid(input.userId) || !valid(input.appId) || !valid(input.service) || !/^[a-z][A-Za-z0-9.-]*$/u.test(input.service))
    throw new TypeError("Privacy scope requires a user, application and service.");
  return Object.freeze({ userId: input.userId, appId: input.appId.toLowerCase(), service: input.service });
}
function keyFor(scope: PrivacyScope): string { return JSON.stringify([scope.userId, scope.appId, scope.service]); }
function abortError() { return new DOMException("The privacy owner or authorisation was revoked.", "AbortError"); }
function deniedError() { return new DOMException("The application is not authorised for this privacy service.", "NotAllowedError"); }
function isPermissionDenial(error: unknown): boolean {
  // SecurityError also covers an insecure context or Permissions Policy; neither is a user's refusal.
  return typeof error === "object" && error !== null && "name" in error && error.name === "NotAllowedError";
}
function combine(decision: PrivacyDecision, browser?: PrivacyAuthorizationStatus): PrivacyAuthorizationStatus {
  if (browser === "unavailable") return "unavailable";
  if (decision === "denied" || browser === "denied") return "denied";
  if (decision !== "granted") return "prompt";
  return browser ?? "granted";
}
function readRecords(value: unknown): Map<string, StoredRecord> {
  const records = new Map<string, StoredRecord>();
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("records" in value) || !Array.isArray(value.records) || value.records.length > maximumRecords) return records;
  try {
    for (const candidate of value.records) {
      if (!candidate || typeof candidate !== "object" || !decisions.has(candidate.decision) || typeof candidate.updatedAt !== "number" || !Number.isFinite(candidate.updatedAt) || candidate.updatedAt < 0) return new Map();
      const scope = scopeIdentity(candidate);
      const key = keyFor(scope);
      if (records.has(key)) return new Map();
      records.set(key, Object.freeze({ ...scope, decision: candidate.decision as PrivacyDecision, updatedAt: candidate.updatedAt }));
    }
  } catch { return new Map(); }
  return records;
}

/** Runtime-owned cooperative privacy gate, not a sandbox for JavaScript in the same page. */
export function createPrivacyStore(options: PrivacyStoreOptions): PrivacyStore {
  if (!options || typeof options.runtimeId !== "string" || options.runtimeId.trim().length === 0) throw new TypeError("A privacy store requires a runtime id.");
  const now = options.now ?? Date.now;
  const storageKey = options.preferenceKey ?? preferenceKey;
  let persisted: unknown;
  try { persisted = options.persistence?.getPreference<unknown>(storageKey, null); } catch { persisted = null; }
  const records = readRecords(persisted);
  const observations = new Map<string, PrivacyAuthorizationStatus>();
  const active = new Map<string, Set<Lease>>();
  const listeners = new Set<() => void>();
  let snapshot: readonly PrivacyAuthorizationRecord[];
  let disposed = false;

  function rebuild() {
    snapshot = Object.freeze([...records.entries()].map(([key, record]) => Object.freeze({
      ...record,
      authorizationStatus: combine(record.decision, observations.get(key)),
      browserStatus: observations.get(key) ?? null,
    })));
  }
  rebuild();
  function publish(persist: boolean) {
    if (persist) {
      try { options.persistence?.setPreference(storageKey, { version: 1, records: [...records.values()] }); } catch { /* The current session's decision remains effective when persistence is unavailable. */ }
    }
    rebuild();
    for (const listener of [...listeners]) { try { listener(); } catch { /* Observers cannot interrupt permission revocation. */ } }
  }
  function revokeActive(key: string) {
    const leases = active.get(key);
    if (!leases) return;
    active.delete(key);
    for (const lease of [...leases]) lease.abort();
  }
  function put(scope: PrivacyScope, decision: PrivacyDecision) {
    if (disposed) throw abortError();
    if (!decisions.has(decision)) throw new TypeError("Invalid privacy decision.");
    const key = keyFor(scope);
    if (!records.has(key) && records.size >= maximumRecords) throw new DOMException("The privacy store is full.", "QuotaExceededError");
    records.set(key, Object.freeze({ ...scope, decision, updatedAt: Math.max(0, now()) }));
    // Any withdrawal invalidates in-flight and live work, even while its first prompt is pending.
    if (decision !== "granted") revokeActive(key);
    publish(true);
  }
  function localDecision(key: string): PrivacyDecision { return records.get(key)?.decision ?? "prompt"; }
  function leaseFor(key: string, parent?: AbortSignal, caller?: AbortSignal): Lease {
    if (disposed) throw abortError();
    parent?.throwIfAborted();
    caller?.throwIfAborted();
    const controller = new AbortController();
    const relay = () => controller.abort(abortError());
    parent?.addEventListener("abort", relay, { once: true });
    caller?.addEventListener("abort", relay, { once: true });
    let released = false;
    const lease: Lease = {
      signal: controller.signal,
      abort: relay,
      release() {
        if (released) return;
        released = true;
        parent?.removeEventListener("abort", relay);
        caller?.removeEventListener("abort", relay);
        active.get(key)?.delete(lease);
        if (active.get(key)?.size === 0) active.delete(key);
      },
    };
    const leases = active.get(key) ?? new Set<Lease>();
    leases.add(lease);
    active.set(key, leases);
    return lease;
  }

  const store: PrivacyStore = {
    runtimeId: options.runtimeId,
    forApplication(input) {
      const scope = scopeIdentity(input);
      const key = keyFor(scope);
      const owner = input.signal;
      function assertLive() { if (disposed) throw abortError(); owner?.throwIfAborted(); }
      function authorizationStatus(browserStatus?: PrivacyAuthorizationStatus): PrivacyAuthorizationStatus {
        if (disposed || owner?.aborted) return "unavailable";
        if (browserStatus !== undefined && !states.has(browserStatus)) return "unavailable";
        return combine(localDecision(key), browserStatus ?? observations.get(key));
      }
      function assertRequestAllowed() {
        assertLive();
        const status = authorizationStatus();
        if (status === "denied" || status === "unavailable") throw deniedError();
      }
      function observe(browserStatus: PrivacyAuthorizationStatus): PrivacyAuthorizationStatus {
        assertLive();
        if (!states.has(browserStatus)) throw new TypeError("Invalid browser authorisation status.");
        if (!records.has(key)) {
          if (records.size >= maximumRecords) throw new DOMException("The privacy store is full.", "QuotaExceededError");
          records.set(key, Object.freeze({ ...scope, decision: "prompt", updatedAt: Math.max(0, now()) }));
        }
        if (observations.get(key) !== browserStatus) {
          observations.set(key, browserStatus);
          if (browserStatus === "denied" || browserStatus === "unavailable") revokeActive(key);
          publish(false);
        }
        return authorizationStatus(browserStatus);
      }
      async function execute<T>(operation: (signal: AbortSignal) => T | Promise<T>, request: PrivacyRequestOptions<T>, statusResult: boolean): Promise<T> {
        assertRequestAllowed();
        const lease = leaseFor(key, owner, request.signal);
        let delivered = false;
        let produced = false;
        let value: T;
        let disposedValue = false;
        const disposeValue = () => {
          if (!produced || delivered || disposedValue) return;
          disposedValue = true;
          try { request.dispose?.(value); } catch { /* A faulty resource disposer cannot restore access. */ }
        };
        let rejectAbort!: (error: unknown) => void;
        const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
        const onAbort = () => { disposeValue(); rejectAbort(abortError()); };
        lease.signal.addEventListener("abort", onAbort, { once: true });
        const operationResult = (async () => {
          if (localDecision(key) !== "granted" && options.requestConsent) {
            let consent = false;
            try { consent = await options.requestConsent(scope, lease.signal); } catch { /* A failed host prompt denies access. */ }
            lease.signal.throwIfAborted();
            if (!consent) { lease.release(); put(scope, "denied"); throw deniedError(); }
          }
          lease.signal.throwIfAborted();
          value = await operation(lease.signal);
          produced = true;
          if (lease.signal.aborted || disposed || owner?.aborted) { disposeValue(); throw abortError(); }
          if (statusResult) {
            if (!states.has(value as PrivacyAuthorizationStatus)) throw new TypeError("Invalid requested authorisation status.");
            const status = value as PrivacyAuthorizationStatus;
            if (status === "denied") {
              // Do not abort this completed status request while committing its denial.
              lease.release();
              observations.set(key, status);
              put(scope, "denied");
            } else if (status === "granted") { observations.set(key, status); put(scope, "granted"); }
            else { lease.release(); observe(status); }
          } else put(scope, "granted");
          delivered = true;
          return value;
        })();
        try {
          return await Promise.race([operationResult, aborted]);
        } catch (error) {
          if (!lease.signal.aborted && !disposed && isPermissionDenial(error)) {
            lease.release();
            put(scope, "denied");
          }
          throw error;
        } finally {
          lease.signal.removeEventListener("abort", onAbort);
          lease.release();
        }
      }
      return Object.freeze<PrivacyApplicationPort>({
        scope,
        authorizationStatus,
        assertRequestAllowed,
        observe,
        async getAuthorizationStatus(query) {
          assertLive();
          if (!query) return authorizationStatus();
          const lease = leaseFor(key, owner);
          try {
            const browserStatus = await query(lease.signal);
            lease.signal.throwIfAborted();
            lease.release();
            return observe(browserStatus);
          } finally { lease.release(); }
        },
        request: (operation, request = {}) => execute(operation, request, false),
        requestAuthorization: (operation, request = {}) => execute(operation, request, true),
        bindResource(dispose) {
          assertRequestAllowed();
          const lease = leaseFor(key, owner);
          let released = false;
          const release = () => {
            if (released) return;
            released = true;
            lease.signal.removeEventListener("abort", onAbort);
            lease.release();
          };
          const onAbort = () => { release(); try { dispose(); } catch { /* Other resources must still be revoked. */ } };
          lease.signal.addEventListener("abort", onAbort, { once: true });
          if (lease.signal.aborted) onAbort();
          return release;
        },
      });
    },
    setAuthorization(input, decision) { put(scopeIdentity(input), decision); },
    revoke(input) { put(scopeIdentity(input), "denied"); },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const key of [...active.keys()]) revokeActive(key);
      listeners.clear();
    },
  };
  return Object.freeze(store);
}
