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

import { BrowserLocationAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserLocationAdapter";
import { LocationService } from "../../../src/SynCloudOS/LocationFX/LocationService";
import { createMountedLocationClient } from "../../../src/SynCloudOS/AppSDK/mountedLocationClient";
import { createDeterministicRuntimeEnvironment } from "../../../src/SynCloudOS/AppSDK/testing";
import { LFXCoordinate, LFXLocation } from "../../../src/FX/LocationFX/public";

type Success = (position: GeolocationPosition) => void;
type Failure = (error: GeolocationPositionError) => void;

function browserFixture(options: Readonly<{
  secure?: boolean;
  permission?: PermissionState | "absent";
}> = {}) {
  let success: Success | undefined;
  let failure: Failure | undefined;
  let nativeOptions: PositionOptions | undefined;
  const watchPosition = vi.fn((next: Success, reject?: Failure | null, request?: PositionOptions) => {
    success = next;
    failure = reject ?? undefined;
    nativeOptions = request;
    return 41;
  });
  const clearWatch = vi.fn();
  const query = vi.fn(async () => ({
    state: options.permission === "absent" || options.permission === undefined ? "prompt" : options.permission,
  }));
  const adapter = new BrowserLocationAdapter(
    {
      isSecureContext: options.secure ?? true,
      performance: { now: () => 12_500 },
    },
    {
      geolocation: { watchPosition, clearWatch },
      ...(options.permission === "absent" ? {} : { permissions: { query } }),
    },
  );
  return {
    adapter,
    watchPosition,
    clearWatch,
    query,
    nativeOptions: () => nativeOptions,
    succeed(coords: Partial<GeolocationCoordinates> = {}) {
      success?.({
        coords: {
          latitude: 53.484,
          longitude: -2.244,
          accuracy: 7,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          ...coords,
        },
        timestamp: 1_700_000_000_123,
      } as GeolocationPosition);
    },
    fail(code: number, message = "location failed") {
      failure?.({ code, message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
    },
  };
}

describe("LocationFX foreground requests", () => {
  it("keeps the deterministic testing adapter denial-first and explicitly configurable", async () => {
    const fixture = createDeterministicRuntimeEnvironment();
    await expect(fixture.environment.location!.getAuthorizationStatus()).rejects.toMatchObject({ name: "SecurityError" });
    fixture.adapters.location.allow();
    fixture.adapters.location.setAuthorizationStatus("granted");
    fixture.adapters.location.setLocation(new LFXLocation({
      coordinate: new LFXCoordinate(51.5, -0.12),
      observedAtUnixMilliseconds: 1_700_000_000_000,
      receivedAtMonotonicSeconds: 3,
      horizontalAccuracyMetres: 4,
      altitudeMetres: null,
      altitudeAccuracyMetres: null,
      speedMetresPerSecond: null,
      courseRadians: null,
    }));
    expect(await fixture.environment.location!.getAuthorizationStatus()).toBe("granted");
    expect((await fixture.environment.location!.current({ signal: new AbortController().signal })).coordinate.latitude).toBe(51.5);
    expect(fixture.adapters.location.calls().map((call) => call.operation)).toEqual(["location.status", "location.status", "location.current"]);
    fixture.dispose();
  });

  it("observes authorization passively and reports unknown when Permissions API is absent", async () => {
    const fixture = browserFixture({ permission: "absent" });
    expect(await fixture.adapter.getAuthorizationStatus()).toBe("unknown");
    expect(fixture.watchPosition).not.toHaveBeenCalled();
  });

  it("maps a finite one-shot request to browser options, snapshots the fix and clears exactly once", async () => {
    const fixture = browserFixture({ permission: "granted" });
    const pending = fixture.adapter.current({
      accuracy: "high",
      maximumAgeSeconds: 2.5,
      timeoutSeconds: 4,
      signal: new AbortController().signal,
    });
    expect(fixture.nativeOptions()).toEqual({ enableHighAccuracy: true, maximumAge: 2500, timeout: 4000 });
    fixture.succeed({ heading: 90, speed: 0 });
    const location = await pending;
    expect(location.coordinate.latitude).toBe(53.484);
    expect(location.receivedAtMonotonicSeconds).toBe(12.5);
    expect(location.courseRadians).toBeCloseTo(Math.PI / 2);
    expect(location.speedMetresPerSecond).toBe(0);
    expect(fixture.clearWatch).toHaveBeenCalledTimes(1);
    expect(fixture.clearWatch).toHaveBeenCalledWith(41);
  });

  it("distinguishes secure-context, denial, unavailable-fix and timeout failures", async () => {
    const insecure = browserFixture({ secure: false });
    await expect(insecure.adapter.current({ signal: new AbortController().signal })).rejects.toMatchObject({ name: "SecurityError" });
    expect(insecure.watchPosition).not.toHaveBeenCalled();

    for (const [code, name] of [[1, "NotAllowedError"], [2, "NotFoundError"], [3, "TimeoutError"]] as const) {
      const fixture = browserFixture();
      const pending = fixture.adapter.current({ signal: new AbortController().signal });
      fixture.fail(code);
      await expect(pending).rejects.toMatchObject({ name });
      expect(fixture.clearWatch).toHaveBeenCalledTimes(1);
    }
  });

  it("clears an aborted temporary watch and ignores a late browser success", async () => {
    const fixture = browserFixture();
    const caller = new AbortController();
    const pending = fixture.adapter.current({ signal: caller.signal });
    caller.abort(new DOMException("caller cancelled", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fixture.clearWatch).toHaveBeenCalledTimes(1);
    fixture.succeed();
    expect(fixture.clearWatch).toHaveBeenCalledTimes(1);
  });

  it("maps a long-lived browser watch to high accuracy, clears exactly once and fences late callbacks", () => {
    const fixture = browserFixture();
    const caller = new AbortController();
    const received: number[] = [];
    const errors: string[] = [];
    const watch = fixture.adapter.watch(
      { accuracy: "high", signal: caller.signal },
      (location) => received.push(location.receivedAtMonotonicSeconds),
      (error) => errors.push(error instanceof DOMException ? error.name : String(error)),
    );

    expect(fixture.nativeOptions()).toEqual({ enableHighAccuracy: true, maximumAge: 0 });
    fixture.succeed();
    expect(received).toEqual([12.5]);
    fixture.fail(2);
    expect(errors).toEqual(["NotFoundError"]);

    caller.abort(new DOMException("watch cancelled", "AbortError"));
    expect(fixture.clearWatch).toHaveBeenCalledTimes(1);
    expect(fixture.clearWatch).toHaveBeenCalledWith(41);
    fixture.succeed();
    fixture.fail(3);
    expect(received).toEqual([12.5]);
    expect(errors).toEqual(["NotFoundError"]);

    watch.dispose();
    expect(fixture.clearWatch).toHaveBeenCalledTimes(1);
  });

  it("checks manifest declaration and PolicyKit before invoking a prompt-capable request", async () => {
    const adapter = browserFixture({ permission: "granted" });
    const service = new LocationService(adapter.adapter);
    const mount = new AbortController();
    const policy = vi.fn((capability: string) => capability === "location.read");
    const client = createMountedLocationClient(
      service,
      mount.signal,
      () => ["location.read", "location.request"],
      policy,
    );
    const manager = client.createManager();
    expect(await manager.getAuthorizationStatus()).toBe("granted");
    expect(adapter.watchPosition).not.toHaveBeenCalled();
    await expect(manager.current()).rejects.toMatchObject({ name: "SecurityError" });
    expect(adapter.watchPosition).not.toHaveBeenCalled();
    expect(policy).toHaveBeenCalledWith("location.request");
    manager.dispose();
    service.dispose();
  });

  it("requires explicit location.request declaration and revokes a pending request on unmount", async () => {
    const adapter = browserFixture({ permission: "prompt" });
    const service = new LocationService(adapter.adapter);
    const mount = new AbortController();
    const denied = createMountedLocationClient(service, mount.signal, () => ["location.read"], () => true).createManager();
    await expect(denied.current()).rejects.toThrow(/location\.request/);
    expect(adapter.watchPosition).not.toHaveBeenCalled();
    denied.dispose();

    const manager = createMountedLocationClient(
      service,
      mount.signal,
      () => ["location.read", "location.request"],
      () => true,
    ).createManager();
    const pending = manager.current();
    mount.abort(new DOMException("unmounted", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(adapter.clearWatch).toHaveBeenCalledTimes(1);
    adapter.succeed();
    expect(adapter.clearWatch).toHaveBeenCalledTimes(1);
    service.dispose();
  });

  it("ties settlement exclusion to the real mounted watch lifetime", () => {
    const adapter = browserFixture({ permission: "granted" });
    const service = new LocationService(adapter.adapter);
    const mount = new AbortController();
    const release = vi.fn();
    const settlement = {
      track: vi.fn(<T,>(receipt: Promise<T>) => receipt),
      exclude: vi.fn(() => ({ id: "location-live", release })),
    };
    const manager = createMountedLocationClient(
      service,
      mount.signal,
      () => ["location.read", "location.request"],
      () => true,
      "com.syndromatic.location-probe",
      settlement,
    ).createManager();

    const watch = manager.watch({ accuracy: "high" }, () => undefined);
    expect(settlement.exclude).toHaveBeenCalledWith({
      owner: "location",
      kind: "watch",
      label: "com.syndromatic.location-probe",
    });
    expect(release).not.toHaveBeenCalled();

    watch.dispose();
    watch.dispose();
    expect(release).toHaveBeenCalledTimes(1);
    manager.dispose();
    expect(release).toHaveBeenCalledTimes(1);
    service.dispose();
  });
});
