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
import { createPrivacyStore, type PrivacyPersistence } from "../../src/SynCloudOS/Privacy/PrivacyStore";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function persistence(initial?: unknown): PrivacyPersistence {
  let value = initial;
  return { getPreference: <T>(_key: string, fallback: T) => (value ?? fallback) as T, setPreference: <T>(_key: string, next: T) => { value = structuredClone(next); return true; } };
}
const first = { userId: "alice", appId: "com.example.One", service: "location" };

describe("shared per-application privacy authorisation", () => {
  it("never turns passive origin permission into another app's consent", async () => {
    const store = createPrivacyStore({ runtimeId: "one" });
    const port = store.forApplication(first);
    const query = vi.fn(async () => "granted" as const);
    expect(await port.getAuthorizationStatus(query)).toBe("prompt");
    expect(query).toHaveBeenCalledOnce();
    expect(store.getSnapshot()[0]?.authorizationStatus).toBe("prompt");
    expect(port.authorizationStatus()).toBe("prompt");
  });
  it("records explicit success and isolates apps, users and runtime instances", async () => {
    const store = createPrivacyStore({ runtimeId: "one" });
    const port = store.forApplication(first);
    expect(await port.request(async () => "fix")).toBe("fix");
    expect(port.authorizationStatus("granted")).toBe("granted");
    expect(store.forApplication({ ...first, appId: "com.example.one" }).authorizationStatus("granted")).toBe("granted");
    expect(store.forApplication({ ...first, appId: "com.example.two" }).authorizationStatus("granted")).toBe("prompt");
    expect(store.forApplication({ ...first, userId: "bob" }).authorizationStatus("granted")).toBe("prompt");
    expect(createPrivacyStore({ runtimeId: "two" }).forApplication(first).authorizationStatus("granted")).toBe("prompt");
  });
  it("never lets a local grant bypass browser refusal, unavailable host or a fresh browser prompt", () => {
    const store = createPrivacyStore({ runtimeId: "one" });
    store.setAuthorization(first, "granted");
    const port = store.forApplication(first);
    expect(port.authorizationStatus("denied")).toBe("denied");
    expect(port.authorizationStatus("unavailable")).toBe("unavailable");
    expect(port.authorizationStatus("prompt")).toBe("prompt");
    expect(port.authorizationStatus("unknown")).toBe("unknown");
  });
  it("permits starting a prompt but blocks denied operations before reaching the adapter", async () => {
    const store = createPrivacyStore({ runtimeId: "one" });
    const port = store.forApplication(first);
    expect(() => port.assertRequestAllowed()).not.toThrow();
    store.revoke(first);
    const operation = vi.fn(async () => "secret");
    await expect(port.request(operation)).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(operation).not.toHaveBeenCalled();
  });
  it("revocation aborts pending work, releases resources and rejects stale successful values", async () => {
    const store = createPrivacyStore({ runtimeId: "one" });
    const port = store.forApplication(first);
    const pending = deferred<{ dispose(): void }>();
    let signal!: AbortSignal;
    const dispose = vi.fn();
    const releaseResource = vi.fn();
    const release = port.bindResource(releaseResource);
    const request = port.request(next => { signal = next; return pending.promise; }, { dispose: result => result.dispose() });
    store.revoke(first);
    expect(signal.aborted).toBe(true);
    expect(releaseResource).toHaveBeenCalledOnce();
    pending.resolve({ dispose });
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(dispose).toHaveBeenCalledOnce();
    release();
    expect(releaseResource).toHaveBeenCalledOnce();
    store.setAuthorization(first, "granted");
    expect(await port.request(async () => 42)).toBe(42);
  });
  it("owner or caller cancellation cannot commit a grant and disposes late results", async () => {
    const store = createPrivacyStore({ runtimeId: "one" });
    const owner = new AbortController();
    const port = store.forApplication({ ...first, signal: owner.signal });
    const pending = deferred<{ dispose(): void }>();
    const dispose = vi.fn();
    const request = port.request(() => pending.promise, { dispose: result => result.dispose() });
    owner.abort();
    pending.resolve({ dispose });
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(dispose).toHaveBeenCalledOnce();
    expect(store.forApplication(first).authorizationStatus()).toBe("prompt");
  });
  it("only permission refusal is persisted as denial", async () => {
    const store = createPrivacyStore({ runtimeId: "one" });
    const port = store.forApplication(first);
    await expect(port.request(async () => { throw new DOMException("No fix", "TimeoutError"); })).rejects.toMatchObject({ name: "TimeoutError" });
    expect(port.authorizationStatus()).toBe("prompt");
    await expect(port.request(async () => { throw new DOMException("Insecure context", "SecurityError"); })).rejects.toMatchObject({ name: "SecurityError" });
    expect(port.authorizationStatus()).toBe("prompt");
    await expect(port.request(async () => { throw new DOMException("No", "NotAllowedError"); })).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(port.authorizationStatus()).toBe("denied");
  });
  it("observing browser denial revokes live work without granting local consent", async () => {
    const store = createPrivacyStore({ runtimeId: "one" });
    const port = store.forApplication(first);
    const dispose = vi.fn();
    port.bindResource(dispose);
    expect(port.observe("denied")).toBe("denied");
    expect(dispose).toHaveBeenCalledOnce();
    expect(store.getSnapshot()[0]?.decision).toBe("prompt");
    store.setAuthorization(first, "granted");
    expect(port.authorizationStatus()).toBe("denied");
    expect(await port.getAuthorizationStatus(async () => "granted")).toBe("granted");
  });
  it("returns unavailable status requests without recording a grant", async () => {
    const store = createPrivacyStore({ runtimeId: "one" });
    const port = store.forApplication(first);
    expect(await port.requestAuthorization(async () => "unavailable")).toBe("unavailable");
    expect(store.getSnapshot()[0]?.decision).toBe("prompt");
    expect(port.authorizationStatus()).toBe("unavailable");
  });
  it("rejects revoked requests before an uncooperative adapter resolves", async () => {
    const store = createPrivacyStore({ runtimeId: "one" });
    const port = store.forApplication(first);
    const pending = deferred<{ dispose(): void }>();
    const dispose = vi.fn();
    const caller = new AbortController();
    const request = port.request(() => pending.promise, { signal: caller.signal, dispose: value => value.dispose() });
    caller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(dispose).not.toHaveBeenCalled();
    pending.resolve({ dispose });
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
    expect(port.authorizationStatus()).toBe("prompt");
  });
  it("supports status-returning framework requests without treating denied as success", async () => {
    const store = createPrivacyStore({ runtimeId: "one" });
    const port = store.forApplication(first);
    expect(await port.requestAuthorization(async () => "denied")).toBe("denied");
    expect(port.authorizationStatus()).toBe("denied");
    store.setAuthorization(first, "prompt");
    // A host reset cannot change a browser refusal; observe its changed native state first.
    port.observe("prompt");
    expect(await port.requestAuthorization(async () => "granted")).toBe("granted");
    expect(port.authorizationStatus()).toBe("granted");
  });
  it("persists scoped decisions and rejects malformed persisted grants", async () => {
    const backing = persistence();
    await createPrivacyStore({ runtimeId: "one", persistence: backing }).forApplication(first).request(async () => true);
    const reloaded = createPrivacyStore({ runtimeId: "one", persistence: backing });
    expect(reloaded.forApplication(first).authorizationStatus("granted")).toBe("granted");
    for (const malformed of [{ version: 9, records: [] }, { version: 1, records: [{ ...first, decision: "granted", updatedAt: "today" }] }, { version: 1, records: [{ ...first, decision: "granted", updatedAt: 1 }, { ...first, decision: "denied", updatedAt: 1 }] }]) {
      expect(createPrivacyStore({ runtimeId: "one", persistence: persistence(malformed) }).forApplication(first).authorizationStatus("granted")).toBe("prompt");
    }
  });
  it("keeps immutable stable snapshots and informs observers after committed decisions", () => {
    const store = createPrivacyStore({ runtimeId: "one" });
    const snapshot = store.getSnapshot();
    expect(store.getSnapshot()).toBe(snapshot);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setAuthorization(first, "denied");
    expect(listener).toHaveBeenCalledOnce();
    expect(Object.isFrozen(store.getSnapshot())).toBe(true);
    expect(Object.isFrozen(store.getSnapshot()[0])).toBe(true);
    unsubscribe();
    store.setAuthorization(first, "prompt");
    expect(listener).toHaveBeenCalledOnce();
  });
  it("supports host per-app consent and denies an unavailable consent provider", async () => {
    const operation = vi.fn(async () => "fix");
    const store = createPrivacyStore({ runtimeId: "one", requestConsent: async () => false });
    await expect(store.forApplication(first).request(operation)).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(operation).not.toHaveBeenCalled();
    const throwing = createPrivacyStore({ runtimeId: "two", requestConsent: async () => { throw new Error("host failed"); } });
    await expect(throwing.forApplication(first).request(operation)).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(operation).not.toHaveBeenCalled();
  });
  it("disposal aborts all owners and fails closed", async () => {
    const store = createPrivacyStore({ runtimeId: "one" });
    const port = store.forApplication(first);
    const cleanup = vi.fn();
    port.bindResource(cleanup);
    store.dispose();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(port.authorizationStatus("granted")).toBe("unavailable");
    await expect(port.request(async () => true)).rejects.toMatchObject({ name: "AbortError" });
  });
});
