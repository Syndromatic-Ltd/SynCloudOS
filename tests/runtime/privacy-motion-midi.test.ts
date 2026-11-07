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
import { createPrivacyStore } from "../../src/SynCloudOS/Privacy";
import { createMountedMotionClient } from "../../src/SynCloudOS/AppSDK/mountedMotionClient";
import { createMountedMIDIClient } from "../../src/SynCloudOS/AppSDK/mountedMIDIClient";
import { MotionService } from "../../src/SynCloudOS/MotionFX/MotionService";
import { MIDIService, type MIDIAdapter, type MIDIAdapterAuthorizationState } from "../../src/SynCloudOS/MIDIFX/MIDIService";
import { MFXSensors, type MFXAvailability, type MFXMotionCapabilities } from "../../src/FX/MotionFX/MFXMotionCapabilities";
import type { MIFXEndpointSnapshot, MIFXInputListener } from "../../src/FX/MIDIFX/MIFXAccess";
import { NSEData } from "../../src/Foundation/NSEData";
import { motionFixture } from "./fx/motion-fixture";

const owner = { userId: "alice", appId: "com.example.privacy" };
const motionScope = { ...owner, service: "motion" };
const midiScope = { ...owner, service: "midi" };
const sysexScope = { ...owner, service: "midi.sysex" };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function midiFixture() {
  let result: MIDIAdapterAuthorizationState = "granted";
  let available = true;
  const requests: boolean[] = [];
  const input: MIFXEndpointSnapshot = Object.freeze({ id: "input", direction: "input", manufacturer: null, name: "Input", version: null, state: "connected", connection: "open", generation: 1 });
  const output: MIFXEndpointSnapshot = Object.freeze({ ...input, id: "output", direction: "output" });
  const delivered: MIFXInputListener[] = [];
  const disposeInput = vi.fn(), disposeOutput = vi.fn(), send = vi.fn();
  const adapter: MIDIAdapter = {
    isAvailable: () => available,
    async requestAuthorization(request) { request.signal.throwIfAborted(); requests.push(request.sysex); return result; },
    getEndpoints: () => [input, output],
    subscribeEndpoints: () => () => {},
    async subscribeInput(_endpoint, _sysex, listener) { delivered.push(listener); return Object.freeze({ endpoint: input, dispose: disposeInput }); },
    async acquireOutput() { return Object.freeze({ endpoint: output, send, dispose: disposeOutput }); },
    dispose() {},
  };
  return { adapter, input, output, requests, disposeInput, disposeOutput, send, setResult: (next: MIDIAdapterAuthorizationState) => { result = next; }, setAvailable: (next: boolean) => { available = next; }, emit() { for (const listener of delivered) listener({ endpoint: input, data: NSEData.from(new Uint8Array([0x90, 60, 1])), receivedAtMilliseconds: 1 }); } };
}

function mountedMIDI(fixture = midiFixture()) {
  const store = createPrivacyStore({ runtimeId: "midi-privacy" });
  const normal = store.forApplication(midiScope), sysex = store.forApplication(sysexScope);
  const mount = new AbortController();
  const client = createMountedMIDIClient(new MIDIService(fixture.adapter), mount.signal, () => ["midi.access", "midi.sysex"], () => true, requested => requested ? sysex : normal);
  return { ...fixture, store, normal, sysex, mount, client };
}

describe("MotionFX shared privacy authorisation", () => {
  it("keeps native availability passive and requires per-app consent", () => {
    const fixture = motionFixture(), store = createPrivacyStore({ runtimeId: "motion-privacy" });
    const manager = createMountedMotionClient(new MotionService(fixture.adapter), new AbortController().signal, () => ["motion.read", "motion.requestAuthorization"], store.forApplication(motionScope)).createManager();
    expect(manager.authorizationStatus).toBe("permission-required");
    expect(manager.capabilities.deviceMotion.state).toBe("permission-required");
    expect(fixture.adapter.requestAuthorization).not.toHaveBeenCalled();
    expect(() => manager.startDeviceMotionUpdates({ referenceFrame: "relative" }, () => {})).toThrowError(DOMException);
    expect(fixture.listeners.size).toBe(0);
    manager.dispose();
  });
  it("grants an explicit native success and revokes streams and retained samples", async () => {
    const fixture = motionFixture(), store = createPrivacyStore({ runtimeId: "motion-privacy" });
    const manager = createMountedMotionClient(new MotionService(fixture.adapter), new AbortController().signal, () => ["motion.read", "motion.requestAuthorization"], store.forApplication(motionScope)).createManager();
    expect(await manager.requestAuthorization()).toBe("available");
    expect(manager.authorizationStatus).toBe("available");
    const receive = vi.fn();
    manager.startDeviceMotionUpdates({ referenceFrame: "relative" }, receive);
    fixture.emit(0);
    expect(receive).toHaveBeenCalledOnce();
    expect(manager.deviceMotion).not.toBeNull();
    store.revoke(motionScope);
    fixture.emit(1);
    expect(receive).toHaveBeenCalledOnce();
    expect(fixture.listeners.size).toBe(0);
    expect(manager.deviceMotion).toBeNull();
    expect(manager.authorizationStatus).toBe("denied");
    expect(store.forApplication({ ...motionScope, appId: "com.example.other" }).authorizationStatus()).toBe("prompt");
  });
  it.each(["denied", "unavailable"] as const)("does not grant when native motion is %s", async state => {
    const fixture = motionFixture(), store = createPrivacyStore({ runtimeId: "motion-privacy" });
    const adapter = { ...fixture.adapter, capabilities: Object.freeze(Object.fromEntries(MFXSensors.map(sensor => [sensor, { state, apiPresent: state !== "unavailable", samples: "no-samples", reason: null }]))) as MFXMotionCapabilities, requestAuthorization: async () => state };
    const manager = createMountedMotionClient(new MotionService(adapter), new AbortController().signal, () => ["motion.read", "motion.requestAuthorization"], store.forApplication(motionScope)).createManager();
    expect(manager.authorizationStatus).toBe(state);
    expect(await manager.requestAuthorization()).toBe(state);
    expect(store.getSnapshot().some(record => record.decision === "granted")).toBe(false);
    manager.dispose();
  });
  it("allows denied passive inspection without binding or prompting", () => {
    const fixture = motionFixture(), store = createPrivacyStore({ runtimeId: "motion-privacy" });
    store.revoke(motionScope);
    const manager = createMountedMotionClient(new MotionService(fixture.adapter), new AbortController().signal, () => ["motion.read", "motion.requestAuthorization"], store.forApplication(motionScope)).createManager();
    expect(manager.authorizationStatus).toBe("denied");
    expect(fixture.adapter.requestAuthorization).not.toHaveBeenCalled();
    manager.dispose();
  });
  it("does not grant a late native motion result after revocation", async () => {
    const fixture = motionFixture(), store = createPrivacyStore({ runtimeId: "motion-privacy" }), pending = deferred<MFXAvailability>();
    fixture.adapter.requestAuthorization = () => pending.promise;
    const manager = createMountedMotionClient(new MotionService(fixture.adapter), new AbortController().signal, () => ["motion.read", "motion.requestAuthorization"], store.forApplication(motionScope)).createManager();
    const request = manager.requestAuthorization();
    store.revoke(motionScope);
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    pending.resolve("available");
    await Promise.resolve();
    expect(store.forApplication(motionScope).authorizationStatus()).toBe("denied");
  });
});

describe("MIDIFX shared privacy authorisation", () => {
  it("preserves one native endpoint update when no privacy port is installed", async () => {
    const fixture = midiFixture();
    const access = createMountedMIDIClient(new MIDIService(fixture.adapter), new AbortController().signal, () => ["midi.access"], () => true).createAccess();
    const listener = vi.fn();
    access.subscribeEndpoints(listener);
    await access.requestAuthorization();
    expect(listener).toHaveBeenCalledTimes(2);
    access.dispose();
  });
  it("exposes passive authorizationStatus without granting another application's gate", () => {
    const f = mountedMIDI();
    const access = f.client.createAccess();
    expect(access.authorizationStatus).toBe("unknown");
    expect(access.getCapabilities().authorization).toBe("unknown");
    expect(f.requests).toEqual([]);
    expect(f.normal.authorizationStatus()).toBe("prompt");
    access.dispose();
  });
  it("requires separate explicit normal and SysEx grants, including SysEx-first requests", async () => {
    const f = mountedMIDI(), access = f.client.createAccess();
    expect(await access.requestAuthorization({ sysex: true })).toEqual({ state: "granted", sysex: true });
    expect(f.requests).toEqual([false, true]);
    expect(access.authorizationStatus).toBe("granted");
    expect(f.normal.authorizationStatus()).toBe("granted");
    expect(f.sysex.authorizationStatus()).toBe("granted");
    access.dispose();
  });
  it("keeps normal-only consent from granting SysEx", async () => {
    const f = mountedMIDI(), access = f.client.createAccess();
    expect(await access.requestAuthorization()).toEqual({ state: "granted", sysex: false });
    expect(access.getCapabilities().sysexAuthorization).toBe("unknown");
    expect(f.sysex.authorizationStatus()).toBe("prompt");
    access.dispose();
  });
  it("does not report an effective SysEx grant after normal consent is reset", async () => {
    const f = mountedMIDI(), access = f.client.createAccess();
    await access.requestAuthorization({ sysex: true });
    f.store.setAuthorization(midiScope, "prompt");
    expect(access.authorizationStatus).toBe("unknown");
    expect(access.getCapabilities().sysexAuthorization).toBe("unknown");
  });
  it.each(["denied", "unavailable"] as const)("records no MIDI grant for native %s", async state => {
    const f = mountedMIDI(); f.setResult(state);
    const access = f.client.createAccess();
    expect(await access.requestAuthorization()).toEqual({ state, sysex: false });
    expect(access.authorizationStatus).toBe(state);
    expect(f.store.getSnapshot().some(record => record.decision === "granted")).toBe(false);
    access.dispose();
  });
  it("reports unavailable MIDI even if a local app choice is allowed", () => {
    const f = mountedMIDI(); f.setAvailable(false); f.store.setAuthorization(midiScope, "granted");
    const access = f.client.createAccess();
    expect(access.authorizationStatus).toBe("unavailable");
    access.dispose();
  });
  it.each([midiScope, sysexScope])("revokes input callbacks and output leases for $service", async scope => {
    const f = mountedMIDI(), access = f.client.createAccess();
    await access.requestAuthorization({ sysex: true });
    const receive = vi.fn();
    await access.subscribeInput(f.input, receive);
    const output = await access.acquireOutput(f.output);
    f.emit(); expect(receive).toHaveBeenCalledOnce();
    f.store.revoke(scope);
    f.emit();
    expect(receive).toHaveBeenCalledOnce();
    expect(f.disposeInput).toHaveBeenCalledOnce();
    expect(f.disposeOutput).toHaveBeenCalledOnce();
    expect(() => output.send(new Uint8Array([0x90, 60, 1]))).toThrowError(DOMException);
  });
  it("blocks a denied app before a MIDI browser request while keeping status inspection available", async () => {
    const f = mountedMIDI(); f.store.revoke(midiScope);
    const access = f.client.createAccess();
    expect(access.authorizationStatus).toBe("denied");
    expect(await access.requestAuthorization()).toEqual({ state: "denied", sysex: false });
    expect(f.requests).toEqual([]);
    access.dispose();
  });
  it("does not let a late SysEx result restore a revoked normal grant", async () => {
    const fixture = midiFixture(), pending = deferred<MIDIAdapterAuthorizationState>();
    fixture.adapter.requestAuthorization = request => request.sysex ? pending.promise : Promise.resolve("granted");
    const f = mountedMIDI(fixture), access = f.client.createAccess();
    const request = access.requestAuthorization({ sysex: true });
    await vi.waitFor(() => expect(f.normal.authorizationStatus()).toBe("granted"));
    f.store.revoke(midiScope);
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    pending.resolve("granted");
    await Promise.resolve();
    expect(f.sysex.authorizationStatus()).not.toBe("granted");
  });
});
