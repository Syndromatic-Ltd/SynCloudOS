// @vitest-environment jsdom
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

import { afterEach, describe, expect, it, vi } from "vitest";
import { applicationSystemServices, configureApplicationPush } from "../../src/SynCloudOS/InstalledApplications/applicationSystemServices";
import type { IdentitySessionAdapter, IdentitySessionAdapterSnapshot } from "../../src/SynCloudOS/Identity/identitySessionTypes";
import type { SynCloudOSConfigurationProfile } from "../../src/SynCloudOS/SynCloudOS";
import { createTestRuntime, createTestRuntimeEnvironment, registerTestSynWare } from "./helpers";

const appId = "com.example.notification-privacy";
const otherAppId = "com.example.notification-other";
const configurationProfile: SynCloudOSConfigurationProfile = {
  id: "notification-privacy",
  anonymousRole: "public",
  roles: { public: ["webspring.display", "app.open.public", "route.open.public"], member: ["webspring.display", "app.open.public", "app.open.protected", "route.open.public"] },
  resolveRole: session => session.isAuthorised ? "member" : "public",
};
function session(person: string, email = "shared@example.test"): IdentitySessionAdapterSnapshot {
  return { id: `session:${person}`, subjectId: `person:${person}`, state: "active", claims: { email, displayName: person, roles: "member" } };
}
function identityAdapter(initial: IdentitySessionAdapterSnapshot | null) {
  let current = initial;
  const listeners = new Set<(value: IdentitySessionAdapterSnapshot | null) => void>();
  const publish = (value: IdentitySessionAdapterSnapshot | null) => { current = value; for (const listener of [...listeners]) listener(value); };
  return {
    id: "notification-privacy-identity",
    async read() { return current; },
    subscribe(listener: (value: IdentitySessionAdapterSnapshot | null) => void) { listeners.add(listener); return () => listeners.delete(listener); },
    async end() { publish(null); },
    dispose() { listeners.clear(); },
    publish,
  } satisfies IdentitySessionAdapter & { publish(value: IdentitySessionAdapterSnapshot | null): void };
}
const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.restoreAllMocks();
});
function replaceProperty(target: object, key: PropertyKey, value: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, value });
  cleanups.push(() => { if (descriptor) Object.defineProperty(target, key, descriptor); else Reflect.deleteProperty(target, key); });
}
async function fixture(initial: IdentitySessionAdapterSnapshot | null = session("alice"), entitled = true) {
  const identity = identityAdapter(initial);
  const native = { permission: "default" as NotificationPermission | undefined, result: "granted" as "granted" | "denied" | "default" | "unsupported" };
  replaceProperty(window, "Notification", { get permission() { return native.permission; } });
  replaceProperty(window, "PushManager", function PushManager() {});
  const subscription = {
    endpoint: "https://push.example.test/subscription",
    toJSON: () => ({ endpoint: "https://push.example.test/subscription", expirationTime: null, keys: { p256dh: "test-key", auth: "test-auth" } }),
    unsubscribe: vi.fn(async () => true),
  };
  const getSubscription = vi.fn(async () => subscription);
  const subscribe = vi.fn(async () => subscription);
  const getRegistration = vi.fn(async () => ({ active: {}, pushManager: { getSubscription, subscribe } }));
  replaceProperty(window.navigator, "serviceWorker", { getRegistration });
  const fetch = vi.fn(async () => ({ ok: true, status: 200 }));
  replaceProperty(window, "fetch", fetch);
  const runtime = createTestRuntime({ environment: createTestRuntimeEnvironment(), authenticationPolicy: "optional", configurationProfile, identity: { sessionAdapter: identity } });
  const controllers: AbortController[] = [];
  cleanups.push(async () => { controllers.forEach(controller => controller.abort()); await runtime.dispose({ reason: "notification privacy cleanup", inFlight: "cancel" }); });
  await runtime.identity.session.refresh();
  for (const id of [appId, otherAppId]) registerTestSynWare(runtime, {
    schemaVersion: 1, bundleIdentifier: id, version: "1.0.0", displayName: id,
    routes: [{ path: `/${id.split(".").at(-1)}`, primary: true }],
    runtime: { policy: { public: true } }, entitlements: entitled ? ["notifications.post"] : [],
  });
  const requestPermission = vi.spyOn(runtime.notifications, "requestBrowserPermission").mockImplementation(async () => {
    native.permission = native.result === "unsupported" ? undefined : native.result;
    return native.result;
  });
  const key = new Uint8Array(65); key[0] = 4;
  configureApplicationPush(runtime, { applicationServerKey: window.btoa(String.fromCharCode(...key)), subscriptionURL: "/api/push" });
  const userId = () => {
    const current = runtime.identity.session.getSnapshot();
    return current?.state === "active" ? `identity:${current.subjectId}` : runtime.configurationProfiles.getCurrentSubject().user.id;
  };
  const scope = (id = appId) => ({ appId: id, userId: userId(), service: "notifications" });
  const mount = (id = appId) => {
    const controller = new AbortController(); controllers.push(controller);
    return applicationSystemServices(runtime, id, controller.signal).notifications;
  };
  return { runtime, identity, native, requestPermission, subscription, getSubscription, subscribe, getRegistration, fetch, userId, scope, mount };
}

describe("real runtime notification privacy bridge", () => {
  it.each([session("alice"), null])("keeps passive native grants behind the canonical app/user gate (%j)", async initial => {
    const f = await fixture(initial); f.native.permission = "granted";
    await expect(f.mount().getNotificationSettings()).resolves.toMatchObject({ authorizationStatus: "notDetermined" });
    expect(f.runtime.privacy.getSnapshot()).toContainEqual(expect.objectContaining({ ...f.scope(), decision: "prompt", browserStatus: "granted" }));
    expect(f.requestPermission).not.toHaveBeenCalled();
  });

  it("records an explicit native grant and still permits passive inspection after local withdrawal", async () => {
    const f = await fixture(), notifications = f.mount();
    await expect(notifications.requestAuthorization()).resolves.toBe(true);
    expect(f.runtime.privacy.getSnapshot()).toContainEqual(expect.objectContaining({ ...f.scope(), decision: "granted" }));
    f.runtime.privacy.revoke(f.scope());
    await expect(notifications.getNotificationSettings()).resolves.toMatchObject({ authorizationStatus: "denied" });
    await expect(notifications.requestAuthorization()).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(f.requestPermission).toHaveBeenCalledOnce();
  });

  it("records a native refusal without granting app consent", async () => {
    const f = await fixture(); f.native.result = "denied";
    await expect(f.mount().requestAuthorization()).resolves.toBe(false);
    expect(f.runtime.privacy.getSnapshot()).toContainEqual(expect.objectContaining({ ...f.scope(), decision: "denied", browserStatus: "denied" }));
  });

  it.each([["denied", "denied"], [undefined, "unsupported"]] as const)("lets native %s override saved app consent", async (native, effective) => {
    const f = await fixture(); f.runtime.privacy.setAuthorization(f.scope(), "granted"); f.native.permission = native;
    await expect(f.mount().getNotificationSettings()).resolves.toMatchObject({ authorizationStatus: effective });
  });

  it("requires this app's consent before registering and preserves safe unregistration after withdrawal", async () => {
    const f = await fixture(), first = f.mount(), other = f.mount(otherAppId);
    await first.requestAuthorization();
    await expect(first.registerForRemoteNotifications()).resolves.toMatchObject({ endpoint: f.subscription.endpoint });
    await expect(other.getNotificationSettings()).resolves.toMatchObject({ authorizationStatus: "notDetermined" });
    await expect(other.registerForRemoteNotifications()).rejects.toMatchObject({ name: "NotAllowedError" });
    f.runtime.privacy.revoke(f.scope());
    await expect(first.registerForRemoteNotifications()).rejects.toMatchObject({ name: "NotAllowedError" });
    await expect(first.unregisterForRemoteNotifications()).resolves.toBeUndefined();
    expect(f.fetch.mock.calls.map(call => (call as unknown as [unknown, RequestInit])[1].method)).toEqual(["POST", "DELETE"]);
    expect(f.subscription.unsubscribe).not.toHaveBeenCalled();
  });

  it("invalidates old authority when the authenticated principal changes with the same email", async () => {
    const f = await fixture(), notifications = f.mount(), originalScope = f.scope();
    await notifications.requestAuthorization();
    f.identity.publish(session("bob"));
    for (const action of [() => notifications.getNotificationSettings(), () => notifications.requestAuthorization(), () => notifications.registerForRemoteNotifications(), () => notifications.unregisterForRemoteNotifications()])
      await expect(action()).rejects.toMatchObject({ name: "AbortError" });
    await expect(f.mount().getNotificationSettings()).resolves.toMatchObject({ authorizationStatus: "notDetermined" });
    expect(f.runtime.privacy.getSnapshot()).toContainEqual(expect.objectContaining({ ...originalScope, decision: "granted" }));
    expect(f.requestPermission).toHaveBeenCalledOnce();
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it("invalidates a replaced session while retaining the same principal's saved consent", async () => {
    const initial = session("alice"), f = await fixture(initial), notifications = f.mount();
    await notifications.requestAuthorization();
    f.identity.publish({ ...initial, id: "session:alice:replacement" });
    await expect(notifications.getNotificationSettings()).rejects.toMatchObject({ name: "AbortError" });
    await expect(f.mount().getNotificationSettings()).resolves.toMatchObject({ authorizationStatus: "authorized" });
  });

  it("discards an in-flight native permission result after a principal change", async () => {
    const f = await fixture(), notifications = f.mount(), originalScope = f.scope();
    let finish!: (status: "granted") => void;
    f.requestPermission.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = notifications.requestAuthorization();
    f.identity.publish(session("bob"));
    finish("granted");
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(f.runtime.privacy.getSnapshot().find(record => record.userId === originalScope.userId)?.decision).not.toBe("granted");
  });

  it("blocks native requests and registration without the declared entitlement", async () => {
    const f = await fixture(session("alice"), false), notifications = f.mount();
    f.native.permission = "granted";
    await expect(notifications.requestAuthorization()).rejects.toMatchObject({ name: "SecurityError" });
    await expect(notifications.registerForRemoteNotifications()).rejects.toMatchObject({ name: "SecurityError" });
    expect(f.requestPermission).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled(); expect(f.getRegistration).not.toHaveBeenCalled();
  });

  it("ends issued notification authority when managed app access is withdrawn without rewriting consent", async () => {
    const f = await fixture(), notifications = f.mount(), originalScope = f.scope();
    await notifications.requestAuthorization();
    f.runtime.configurationProfiles.registerPolicy("managed-notification-app", (request, decision) => request.app?.bundleIdentifier === appId && request.action === "app.launch" ? { ...decision, allowed: false, reason: "Managed app access is disabled." } : decision);
    await expect(notifications.registerForRemoteNotifications()).rejects.toMatchObject({ name: "AbortError" });
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.runtime.privacy.getSnapshot()).toContainEqual(expect.objectContaining({ ...originalScope, decision: "granted" }));
  });

  it("cancels a pending push association when app consent is withdrawn", async () => {
    const f = await fixture(), notifications = f.mount();
    await notifications.requestAuthorization();
    let finish!: (subscription: typeof f.subscription) => void;
    f.getSubscription.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = notifications.registerForRemoteNotifications();
    await vi.waitFor(() => expect(f.getSubscription).toHaveBeenCalledOnce());
    f.runtime.privacy.revoke(f.scope()); finish(f.subscription);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(f.fetch).not.toHaveBeenCalled();
  });
});
