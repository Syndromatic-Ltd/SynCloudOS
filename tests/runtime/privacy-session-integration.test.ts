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
import { createTestRuntime, mountTestSynWareRuntime, registerTestSynWare } from "./helpers";
import { createDeterministicRuntimeEnvironment } from "../../src/SynCloudOS/AppSDK/testing";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { LFXCoordinate, LFXLocation } from "../../src/FX/LocationFX/public";
import type { SynCloudOSConfigurationProfile } from "../../src/SynCloudOS/SynCloudOS";
import type { IdentitySessionAdapter, IdentitySessionAdapterSnapshot } from "../../src/SynCloudOS/Identity/identitySessionTypes";
import { motionFixture } from "./fx/motion-fixture";

const appId = "com.example.privacy-session";
const otherAppId = "com.example.privacy-other";
const entitlements = ["location.read", "location.request", "motion.read", "motion.requestAuthorization", "midi.access", "midi.sysex"] as const;
const configurationProfile: SynCloudOSConfigurationProfile = Object.freeze<SynCloudOSConfigurationProfile>({
  id: "privacy-integration",
  anonymousRole: "public",
  roles: Object.freeze({ public: ["webspring.display", "app.open.public", "route.open.public"], member: ["webspring.display", "app.open.public", "app.open.protected", "route.open.public"] }),
  resolveRole: session => session.isAuthorised ? "member" : "public",
});
function session(person: string, email = `${person}@example.test`): IdentitySessionAdapterSnapshot {
  return { id: `session:${person}`, subjectId: `person:${person}`, state: "active", claims: { email, displayName: person, roles: "member" } };
}
function identityAdapter(initial: IdentitySessionAdapterSnapshot | null) {
  let current = initial;
  const listeners = new Set<(value: IdentitySessionAdapterSnapshot | null) => void>();
  const publish = (value: IdentitySessionAdapterSnapshot | null) => { current = value; for (const listener of [...listeners]) listener(value); };
  return {
    id: "privacy-integration-identity",
    async read() { return current; },
    subscribe(listener: (value: IdentitySessionAdapterSnapshot | null) => void) { listeners.add(listener); return () => listeners.delete(listener); },
    async end() { publish(null); },
    dispose() { listeners.clear(); },
    publish,
  } satisfies IdentitySessionAdapter & { publish(value: IdentitySessionAdapterSnapshot | null): void };
}
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

async function fixture(initial: IdentitySessionAdapterSnapshot | null = null) {
  const device = createDeterministicRuntimeEnvironment(), motion = motionFixture(), identity = identityAdapter(initial);
  const finishBootstrap = device.prepareRuntimeBootstrap();
  let runtime!: ReturnType<typeof createTestRuntime>;
  try {
    runtime = createTestRuntime({ environment: { ...device.environment, motion: motion.adapter }, authenticationPolicy: "optional", configurationProfile, identity: { sessionAdapter: identity } });
  } finally { finishBootstrap(); }
  const mounts: ReturnType<typeof mountTestSynWareRuntime>[] = [];
  cleanups.push(async () => {
    for (const mount of mounts.reverse()) mount.dispose("privacy integration cleanup");
    await runtime.dispose({ reason: "privacy integration cleanup", inFlight: "cancel" });
    device.dispose();
  });
  device.adapters.browser.allow();
  device.adapters.permissions.allow();
  device.adapters.policy.allow();
  device.adapters.location.allow();
  device.adapters.location.setAuthorizationStatus("granted");
  device.adapters.midi.allow();
  await runtime.identity.session.refresh();
  const fix = (sequence: number) => new LFXLocation({ coordinate: new LFXCoordinate(53 + sequence / 1000, -2), observedAtUnixMilliseconds: device.clock.now() + sequence, receivedAtMonotonicSeconds: device.mediaClock.nowSeconds(), horizontalAccuracyMetres: 1, altitudeMetres: null, altitudeAccuracyMetres: null, speedMetresPerSecond: null, courseRadians: null });
  device.adapters.location.setLocation(fix(0));
  for (const id of [appId, otherAppId]) registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: id, version: "1.0.0", displayName: id, routes: [{ path: `/${id.split('.').at(-1)}`, primary: true }], runtime: { policy: { public: true } }, entitlements });
  const mount = (id = appId) => { const mounted = mountTestSynWareRuntime(runtime, id); mounts.push(mounted); return createSynWareContextValue(mounted.runtime); };
  const locationCalls = () => device.adapters.location.calls().filter(call => call.operation === "location.current").length;
  const emit = (sequence: number) => { device.mediaClock.advanceSeconds(1); device.adapters.location.emitLocation(fix(sequence)); };
  const userId = () => {
    const current = runtime.identity.session.getSnapshot();
    return current?.state === "active" ? `identity:${current.subjectId}` : runtime.configurationProfiles.getCurrentSubject().user.id;
  };
  return { runtime, device, motion, identity, mount, locationCalls, emit, userId };
}

describe("real mounted runtime privacy and identity integration", () => {
  it("admits entitled FX without device role grants and records app/user/service scopes", async () => {
    const f = await fixture(session("alice"));
    const subject = f.runtime.configurationProfiles.getCurrentSubject();
    expect(subject.role).toBe("member");
    for (const entitlement of entitlements) expect(subject.capabilities).not.toContain(entitlement);
    const app = f.mount(), location = app.location.createManager(), motion = app.motion.createManager(), midi = app.midi.createAccess();
    expect(await location.getAuthorizationStatus()).toBe("prompt");
    expect(motion.authorizationStatus).toBe("permission-required");
    expect(midi.authorizationStatus).toBe("unknown");
    await expect(location.current()).resolves.toBeInstanceOf(LFXLocation);
    await expect(motion.requestAuthorization()).resolves.toBe("available");
    await expect(midi.requestAuthorization({ sysex: true })).resolves.toEqual({ state: "granted", sysex: true });
    expect(f.runtime.privacy.getSnapshot()).toEqual(expect.arrayContaining(["location", "motion", "midi", "midi.sysex"].map(service => expect.objectContaining({ appId, userId: f.userId(), service, decision: "granted" }))));
    expect(f.locationCalls()).toBe(1);
    expect(f.motion.adapter.requestAuthorization).toHaveBeenCalledOnce();
    expect(f.device.adapters.midi.calls().map(call => call.operation)).toEqual(["midi.authorize", "midi.authorize-sysex"]);
  });
  it("does not turn the origin's grant into another app's local consent", async () => {
    const f = await fixture();
    const first = f.mount().location.createManager();
    await first.current();
    const second = f.mount(otherAppId), location = second.location.createManager(), motion = second.motion.createManager(), midi = second.midi.createAccess();
    expect(await location.getAuthorizationStatus()).toBe("prompt");
    expect(motion.authorizationStatus).toBe("permission-required");
    expect(midi.authorizationStatus).toBe("unknown");
    expect(f.runtime.privacy.forApplication({ userId: f.userId(), appId: otherAppId, service: "location" }).authorizationStatus("granted")).toBe("prompt");
    expect(f.runtime.privacy.getSnapshot().filter(record => record.appId === otherAppId).some(record => record.decision === "granted")).toBe(false);
    expect(f.locationCalls()).toBe(1);
    expect(f.motion.adapter.requestAuthorization).not.toHaveBeenCalled();
    expect(f.device.adapters.midi.calls()).toEqual([]);
  });
  it("blocks a local denial before native work and revokes an already-live watch", async () => {
    const f = await fixture(), manager = f.mount().location.createManager(), scope = { appId, userId: f.userId(), service: "location" };
    f.runtime.privacy.revoke(scope);
    await expect(manager.current()).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(f.locationCalls()).toBe(0);
    f.runtime.privacy.setAuthorization(scope, "prompt");
    await manager.current();
    const receive = vi.fn();
    manager.watch({ accuracy: "balanced", minimumIntervalSeconds: 0, maximumAgeSeconds: 0 }, receive);
    f.emit(1); expect(receive).toHaveBeenCalledOnce();
    f.runtime.privacy.revoke(scope);
    f.emit(2); expect(receive).toHaveBeenCalledOnce();
    await expect(manager.current()).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(f.locationCalls()).toBe(1);
  });
  it.each(["user switch", "logout"] as const)("revokes issued device scopes on %s while preserving the prior user's choice", async change => {
    const f = await fixture(session("alice")), scope = { appId, userId: f.userId(), service: "location" };
    const manager = f.mount().location.createManager();
    await manager.current();
    const receive = vi.fn();
    manager.watch({ accuracy: "balanced", minimumIntervalSeconds: 0, maximumAgeSeconds: 0 }, receive);
    f.emit(1); expect(receive).toHaveBeenCalledOnce();
    f.identity.publish(change === "logout" ? null : session("bob"));
    f.emit(2); expect(receive).toHaveBeenCalledOnce();
    await expect(manager.current()).rejects.toMatchObject({ name: expect.stringMatching(/AbortError|SecurityError/u) });
    expect(f.locationCalls()).toBe(1);
    expect(f.runtime.privacy.getSnapshot().find(record => record.userId === scope.userId && record.appId === appId)?.decision).toBe("granted");
    expect(await f.mount().location.createManager().getAuthorizationStatus()).toBe("prompt");
  });
  it("revokes old device scopes when the authenticated subject changes with the same displayed email", async () => {
    const f = await fixture(session("alice", "shared@example.test")), manager = f.mount().location.createManager();
    await manager.current();
    const receive = vi.fn();
    manager.watch({ accuracy: "balanced", minimumIntervalSeconds: 0, maximumAgeSeconds: 0 }, receive);
    f.emit(1); expect(receive).toHaveBeenCalledOnce();
    f.identity.publish(session("bob", "shared@example.test"));
    expect(f.runtime.identity.session.getSnapshot()?.subjectId).toBe("person:bob");
    f.emit(2); expect(receive).toHaveBeenCalledOnce();
    await expect(manager.current()).rejects.toMatchObject({ name: expect.stringMatching(/AbortError|SecurityError/u) });
    expect(f.locationCalls()).toBe(1);
    expect(await f.mount().location.createManager().getAuthorizationStatus()).toBe("prompt");
  });
  it("revokes replaced session scopes while retaining consent for the same authenticated principal", async () => {
    const initial = session("alice"), f = await fixture(initial), manager = f.mount().location.createManager();
    await manager.current();
    const receive = vi.fn();
    manager.watch({ accuracy: "balanced", minimumIntervalSeconds: 0, maximumAgeSeconds: 0 }, receive);
    f.emit(1); expect(receive).toHaveBeenCalledOnce();
    f.identity.publish({ ...initial, id: "session:alice:replacement" });
    f.emit(2); expect(receive).toHaveBeenCalledOnce();
    await expect(manager.current()).rejects.toMatchObject({ name: expect.stringMatching(/AbortError|SecurityError/u) });
    expect(f.locationCalls()).toBe(1);
    expect(await f.mount().location.createManager().getAuthorizationStatus()).toBe("granted");
  });
  it("enforces a managed app restriction without rewriting the user's privacy choice", async () => {
    const f = await fixture(), manager = f.mount().location.createManager(), scope = { appId, userId: f.userId(), service: "location" };
    await manager.current();
    const receive = vi.fn();
    manager.watch({ accuracy: "balanced", minimumIntervalSeconds: 0, maximumAgeSeconds: 0 }, receive);
    f.emit(1); expect(receive).toHaveBeenCalledOnce();
    f.runtime.configurationProfiles.registerPolicy("managed-app-restriction", (request, decision) => request.app?.bundleIdentifier === appId && request.action === "app.launch" ? { ...decision, allowed: false, reason: "Managed app access is disabled." } : decision);
    expect(f.runtime.lifecycle.validateAccess(appId, "activate").ok).toBe(false);
    f.emit(2); expect(receive).toHaveBeenCalledOnce();
    await expect(manager.current()).rejects.toMatchObject({ name: expect.stringMatching(/AbortError|SecurityError/u) });
    expect(f.locationCalls()).toBe(1);
    expect(f.runtime.privacy.getSnapshot().find(record => record.userId === scope.userId && record.appId === appId)?.decision).toBe("granted");
  });
});
