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

// @vitest-environment jsdom

import { expect, it, vi } from "vitest";
import { createSynWare } from "../../../src/SynCloudOS/AppSDK";
import { createSynWareTestHost } from "../../../src/SynCloudOS/AppSDK/testing";
import type {
  MIFXEndpointSnapshot,
  MIFXInputListener,
  MIFXInputSubscription,
  MIFXOutputLease,
} from "../../../src/FX/MIDIFX/MIFXAccess";
import {
  MIDIService,
  type MIDIAdapter,
  type MIDIAdapterAuthorizationRequest,
} from "../../../src/SynCloudOS/MIDIFX/MIDIService";
import { createMountedMIDIClient } from "../../../src/SynCloudOS/AppSDK/mountedMIDIClient";

const EMPTY_ENDPOINTS = Object.freeze([]) as readonly MIFXEndpointSnapshot[];

function adapterFixture() {
  const requests: boolean[] = [];
  const adapter: MIDIAdapter = {
    isAvailable: () => true,
    async requestAuthorization(request: MIDIAdapterAuthorizationRequest) {
      request.signal.throwIfAborted();
      requests.push(request.sysex);
      return "granted";
    },
    getEndpoints: () => EMPTY_ENDPOINTS,
    subscribeEndpoints: () => () => undefined,
    async subscribeInput(
      _endpoint: MIFXEndpointSnapshot,
      _sysex: boolean,
      _listener: MIFXInputListener,
      signal: AbortSignal,
    ): Promise<MIFXInputSubscription> {
      signal.throwIfAborted();
      throw new Error("unused input fixture");
    },
    async acquireOutput(
      _endpoint: MIFXEndpointSnapshot,
      _sysex: boolean,
      signal: AbortSignal,
    ): Promise<MIFXOutputLease> {
      signal.throwIfAborted();
      throw new Error("unused output fixture");
    },
    dispose() {},
  };
  return { adapter, requests };
}

it("keeps mounted MIDI capability checks passive and separates normal access from SysEx", async () => {
  const fixture = adapterFixture();
  const service = new MIDIService(fixture.adapter);
  const mount = new AbortController();
  const authorise = vi.fn((capability: "midi.access" | "midi.sysex") => capability === "midi.access");
  const client = createMountedMIDIClient(
    service,
    mount.signal,
    () => ["midi.access", "midi.sysex"],
    authorise,
  );

  const access = client.createAccess();
  expect(access.getCapabilities()).toEqual({
    apiAvailable: true,
    transportProtocol: "midi1",
    authorization: "unknown",
    sysexAuthorization: "unknown",
    connectedEndpointCount: 0,
  });
  expect(fixture.requests).toEqual([]);
  expect(authorise).not.toHaveBeenCalled();

  expect(await access.requestAuthorization()).toEqual({ state: "granted", sysex: false });
  expect(fixture.requests).toEqual([false]);
  expect(authorise).toHaveBeenCalledWith("midi.access");

  expect(await access.requestAuthorization({ sysex: true })).toEqual({ state: "policy-denied", sysex: true });
  expect(fixture.requests).toEqual([false]);
  expect(authorise).toHaveBeenCalledWith("midi.sysex");

  mount.abort(new DOMException("mount revoked", "AbortError"));
  expect(() => access.getCapabilities()).toThrowError(DOMException);
  service.dispose();
});

it("reports undeclared MIDI authorization as policy-denied without touching the host adapter", async () => {
  const fixture = adapterFixture();
  const service = new MIDIService(fixture.adapter);
  const mount = new AbortController();
  const authorise = vi.fn(() => true);
  const access = createMountedMIDIClient(service, mount.signal, () => [], authorise).createAccess();

  expect(await access.requestAuthorization()).toEqual({ state: "policy-denied", sysex: false });
  expect(await access.requestAuthorization({ sysex: true })).toEqual({ state: "policy-denied", sysex: true });
  expect(fixture.requests).toEqual([]);
  expect(authorise).not.toHaveBeenCalled();

  access.dispose();
  service.dispose();
});

const MIDIProbe = createSynWare({
  manifest: {
    schemaVersion: 1,
    bundleIdentifier: "com.syndromatic.midi-probe",
    version: "1.0.0",
    displayName: "MIDI Probe",
    routes: [{ path: "/midi-probe", primary: true }],
    permissions: ["midi.access", "midi.sysex"],
  },
  root() {
    return null;
  },
});

it("routes app.midi through mounted manifest and PolicyKit authority before the deterministic host adapter", async () => {
  const host = createSynWareTestHost({ app: MIDIProbe, document });
  await host.render();
  host.adapters.midi.allow();

  const access = host.appContext.midi.createAccess();
  expect(access.getCapabilities()).toEqual({
    apiAvailable: true,
    transportProtocol: "midi1",
    authorization: "unknown",
    sysexAuthorization: "unknown",
    connectedEndpointCount: 0,
  });
  expect(host.adapters.midi.calls()).toEqual([]);
  expect(host.adapters.permissions.calls()).toEqual([]);
  expect(host.adapters.policy.calls()).toEqual([]);

  expect(await access.requestAuthorization()).toEqual({ state: "policy-denied", sysex: false });
  expect(host.adapters.midi.calls()).toEqual([]);

  host.adapters.permissions.allow();
  host.adapters.policy.allow();
  expect(await access.requestAuthorization()).toEqual({ state: "granted", sysex: false });
  expect(host.adapters.midi.calls().map((call) => call.operation)).toEqual(["midi.authorize"]);

  host.adapters.midi.setSysExAuthorizationResult("denied");
  expect(await access.requestAuthorization({ sysex: true })).toEqual({ state: "denied", sysex: true });
  expect(host.adapters.midi.calls().map((call) => call.operation)).toEqual([
    "midi.authorize",
    "midi.authorize-sysex",
  ]);

  access.dispose();
  const report = await host.dispose();
  expect(report.leaked.filter((label) => label.includes("midi"))).toEqual([]);
});
