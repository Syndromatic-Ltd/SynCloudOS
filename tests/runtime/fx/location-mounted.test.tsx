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

import React from "react";
import { expect, it, vi } from "vitest";
import { createSynWare } from "../../../src/SynCloudOS/AppSDK";
import { createSynWareTestHost } from "../../../src/SynCloudOS/AppSDK/testing";
import { LFXCoordinate, LFXLocation } from "../../../src/FX/LocationFX/public";

const LocationProbe = createSynWare({
  manifest: {
    schemaVersion: 1,
    bundleIdentifier: "com.syndromatic.location-probe",
    version: "1.0.0",
    displayName: "Location Probe",
    routes: [{ path: "/location-probe", primary: true }],
    permissions: ["location.read", "location.request"],
  },
  root() {
    return <div>Location probe</div>;
  },
});

function mountedFix(sequence: number, receivedAtMonotonicSeconds: number): LFXLocation {
  return new LFXLocation({
    coordinate: new LFXCoordinate(53.4808 + sequence / 10_000, -2.2426),
    observedAtUnixMilliseconds: 1_700_000_000_000 + sequence * 1_000,
    receivedAtMonotonicSeconds,
    horizontalAccuracyMetres: 5,
    altitudeMetres: null,
    altitudeAccuracyMetres: null,
    speedMetresPerSecond: null,
    courseRadians: null,
  });
}

it("keeps PolicyKit authoritative before a mounted LocationFX client reaches its host adapter", async () => {
  const host = createSynWareTestHost({ app: LocationProbe, document });
  await host.render();
  host.adapters.location.allow();
  host.adapters.location.setAuthorizationStatus("granted");
  host.adapters.location.setLocation(new LFXLocation({
    coordinate: new LFXCoordinate(53.4808, -2.2426),
    observedAtUnixMilliseconds: 1_700_000_000_000,
    receivedAtMonotonicSeconds: 2,
    horizontalAccuracyMetres: 5,
    altitudeMetres: null,
    altitudeAccuracyMetres: null,
    speedMetresPerSecond: null,
    courseRadians: null,
  }));

  host.adapters.permissions.allow();
  expect(() => host.appContext.location.createManager()).toThrowError(DOMException);
  expect(host.adapters.location.calls()).toEqual([]);

  host.adapters.policy.allow();
  const manager = host.appContext.location.createManager();
  expect(host.adapters.location.calls()).toEqual([]);
  expect(await manager.getAuthorizationStatus()).toBe("granted");
  expect((await manager.current()).coordinate.longitude).toBe(-2.2426);
  expect(host.adapters.location.calls().map((call) => call.operation)).toEqual(["location.status", "location.current"]);
  manager.dispose();
  await expect(manager.current()).rejects.toMatchObject({ name: "AbortError" });
  expect(host.adapters.location.calls().map((call) => call.operation)).toEqual(["location.status", "location.current"]);

  const report = await host.dispose();
  expect(report.leaked.filter((label) => label.includes("location"))).toEqual([]);
});

it("routes a mounted watch through lifecycle suspension, reauthorization and mount revocation", async () => {
  const host = createSynWareTestHost({ app: LocationProbe, document });
  await host.render();
  await host.lifecycle.launch();
  host.adapters.location.allow();
  host.adapters.location.setAuthorizationStatus("granted");
  host.adapters.permissions.allow();
  host.adapters.policy.allow();

  const manager = host.appContext.location.createManager();
  const received: number[] = [];
  const watch = manager.watch(
    { accuracy: "high", maximumAgeSeconds: 0, minimumIntervalSeconds: 0 },
    (location) => received.push(location.receivedAtMonotonicSeconds),
  );
  expect(host.adapters.location.calls().map((call) => call.operation)).toEqual(["location.watch"]);
  expect(host.settlement.getState().excluded).toContainEqual(expect.objectContaining({
    owner: "location",
    kind: "watch",
    label: LocationProbe.manifest.bundleIdentifier,
  }));
  await expect(host.settlement.settled({ timeoutMs: 250 })).resolves.toMatchObject({
    status: "settled",
    excluded: expect.arrayContaining([
      expect.objectContaining({
        owner: "location",
        kind: "watch",
        label: LocationProbe.manifest.bundleIdentifier,
      }),
    ]),
  });

  host.adapters.location.emitLocation(mountedFix(1, 10));
  expect(received).toEqual([10]);

  await host.lifecycle.suspend();
  host.adapters.location.emitLocation(mountedFix(2, 11));
  expect(received).toEqual([10]);

  await host.lifecycle.activate();
  await vi.waitFor(() => {
    expect(host.adapters.location.calls().map((call) => call.operation)).toEqual([
      "location.watch",
      "location.status",
      "location.watch",
    ]);
  });
  host.adapters.location.emitLocation(mountedFix(3, 12));
  expect(received).toEqual([10, 12]);

  watch.dispose();
  expect(host.settlement.getState().excluded).not.toContainEqual(expect.objectContaining({
    owner: "location",
    kind: "watch",
    label: LocationProbe.manifest.bundleIdentifier,
  }));
  manager.dispose();
  const report = await host.dispose();
  host.adapters.location.emitLocation(mountedFix(4, 13));
  expect(received).toEqual([10, 12]);
  expect(report.leaked.filter((label) => label.includes("location"))).toEqual([]);
});
