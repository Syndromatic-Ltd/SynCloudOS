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

import { LFXCoordinate, LFXLocation } from "../../../src/FX/LocationFX/public";
import { LocationService, type LFXLocationAdapter } from "../../../src/SynCloudOS/LocationFX/LocationService";

type WatchOptions = Readonly<{
  accuracy?: "balanced" | "high";
  maximumAgeSeconds?: number;
  minimumIntervalSeconds?: number;
  signal?: AbortSignal;
}>;

type WatchSubscription = Readonly<{ dispose(): void }>;

type WatchManager = Readonly<{
  watch(options: WatchOptions, listener: (location: LFXLocation) => void): WatchSubscription;
  dispose(): void;
}>;

function fix(sequence: number, receivedAtMonotonicSeconds: number): LFXLocation {
  return new LFXLocation({
    coordinate: new LFXCoordinate(53.48 + sequence / 10_000, -2.24),
    observedAtUnixMilliseconds: 1_700_000_000_000 + sequence * 1_000,
    receivedAtMonotonicSeconds,
    horizontalAccuracyMetres: 5,
    altitudeMetres: null,
    altitudeAccuracyMetres: null,
    speedMetresPerSecond: null,
    courseRadians: null,
  });
}

function adapterFixture() {
  type HostWatch = {
    readonly options: Readonly<{ accuracy?: "balanced" | "high"; signal: AbortSignal }>;
    readonly dispose: ReturnType<typeof vi.fn>;
    readonly emit: (location: LFXLocation) => void;
  };
  const watches: HostWatch[] = [];
  let now = 0;
  const status = vi.fn(async () => "granted" as const);
  const adapter = {
    getAuthorizationStatus: status,
    nowMonotonicSeconds: () => now,
    async current() {
      return fix(0, 0);
    },
    watch(options: Readonly<{ accuracy?: "balanced" | "high"; signal: AbortSignal }>, listener: (location: LFXLocation) => void) {
      const dispose = vi.fn();
      const watch: HostWatch = {
        options,
        dispose,
        emit(location) {
          now = location.receivedAtMonotonicSeconds;
          listener(location);
        },
      };
      watches.push(watch);
      options.signal.addEventListener("abort", dispose, { once: true });
      return Object.freeze({ dispose });
    },
  } as unknown as LFXLocationAdapter;
  return { adapter, watches, status };
}

function watchManager(
  service: LocationService,
  options: Readonly<{ appId?: string; reauthorise?: () => boolean | Promise<boolean> }> = {},
): WatchManager {
  return service.createManager(options as never) as unknown as WatchManager;
}

describe("LocationFX shared foreground watches", () => {
  it("shares one host watch, selects strongest active accuracy and preserves per-client cadence", () => {
    const host = adapterFixture();
    const service = new LocationService(host.adapter);
    const slowValues: number[] = [];
    const fastValues: number[] = [];
    const slow = watchManager(service).watch(
      { accuracy: "balanced", maximumAgeSeconds: 0, minimumIntervalSeconds: 5 },
      (location) => slowValues.push(location.receivedAtMonotonicSeconds),
    );
    expect(host.watches).toHaveLength(1);
    expect(host.watches[0]?.options.accuracy).toBe("balanced");

    const fast = watchManager(service).watch(
      { accuracy: "high", maximumAgeSeconds: 0, minimumIntervalSeconds: 0 },
      (location) => fastValues.push(location.receivedAtMonotonicSeconds),
    );
    expect(host.watches).toHaveLength(2);
    expect(host.watches[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(host.watches[1]?.options.accuracy).toBe("high");

    host.watches[1]?.emit(fix(1, 10));
    host.watches[1]?.emit(fix(2, 11));
    expect(slowValues).toEqual([10]);
    expect(fastValues).toEqual([10, 11]);

    fast.dispose();
    expect(host.watches).toHaveLength(3);
    expect(host.watches[1]?.dispose).toHaveBeenCalledTimes(1);
    expect(host.watches[2]?.options.accuracy).toBe("balanced");
    host.watches[2]?.emit(fix(3, 15));
    expect(slowValues).toEqual([10, 15]);

    slow.dispose();
    expect(host.watches[2]?.dispose).toHaveBeenCalledTimes(1);
    service.dispose();
  });

  it("fences stale callbacks, clears cached fixes on suspension and reauthorizes before resume", async () => {
    const host = adapterFixture();
    const service = new LocationService(host.adapter);
    const reauthorise = vi.fn(async () => true);
    const manager = watchManager(service, { appId: "com.example.location", reauthorise });
    const values: number[] = [];
    const watch = manager.watch(
      { accuracy: "high", maximumAgeSeconds: 60, minimumIntervalSeconds: 0 },
      (location) => values.push(location.receivedAtMonotonicSeconds),
    );
    expect(host.watches).toHaveLength(1);
    host.watches[0]?.emit(fix(1, 20));
    expect(values).toEqual([20]);

    (service as unknown as { suspendOwner(appId: string): void }).suspendOwner("com.example.location");
    expect(host.watches[0]?.dispose).toHaveBeenCalledTimes(1);
    host.watches[0]?.emit(fix(2, 21));
    expect(values).toEqual([20]);

    await (service as unknown as { resumeOwner(appId: string): Promise<void> }).resumeOwner("com.example.location");
    expect(reauthorise).toHaveBeenCalledTimes(1);
    expect(host.status).toHaveBeenCalled();
    expect(host.watches).toHaveLength(2);
    host.watches[0]?.emit(fix(3, 22));
    expect(values).toEqual([20]);
    host.watches[1]?.emit(fix(4, 23));
    expect(values).toEqual([20, 23]);

    const late: number[] = [];
    const second = manager.watch(
      { maximumAgeSeconds: 60, minimumIntervalSeconds: 0 },
      (location) => late.push(location.receivedAtMonotonicSeconds),
    );
    expect(late).toEqual([23]);

    watch.dispose();
    second.dispose();
    manager.dispose();
    service.dispose();
  });

  it("keeps runtimes and owners isolated and closes one owner's watches without disturbing another", () => {
    const hostA = adapterFixture();
    const hostB = adapterFixture();
    const serviceA = new LocationService(hostA.adapter);
    const serviceB = new LocationService(hostB.adapter);
    const a1: number[] = [];
    const a2: number[] = [];
    const b: number[] = [];
    const managerA1 = watchManager(serviceA, { appId: "com.example.app.a" });
    const managerA2 = watchManager(serviceA, { appId: "com.example.app.other" });
    const managerB = watchManager(serviceB, { appId: "com.example.app.a" });
    managerA1.watch({}, (location) => a1.push(location.receivedAtMonotonicSeconds));
    managerA2.watch({}, (location) => a2.push(location.receivedAtMonotonicSeconds));
    managerB.watch({}, (location) => b.push(location.receivedAtMonotonicSeconds));
    expect(hostA.watches).toHaveLength(1);
    expect(hostB.watches).toHaveLength(1);

    hostA.watches[0]?.emit(fix(1, 30));
    hostB.watches[0]?.emit(fix(2, 40));
    expect(a1).toEqual([30]);
    expect(a2).toEqual([30]);
    expect(b).toEqual([40]);

    (serviceA as unknown as { closeOwner(appId: string): void }).closeOwner("com.example.app.a");
    expect(hostA.watches[0]?.dispose).not.toHaveBeenCalled();
    hostA.watches[0]?.emit(fix(3, 31));
    expect(a1).toEqual([30]);
    expect(a2).toEqual([30, 31]);
    expect(b).toEqual([40]);

    managerA2.dispose();
    managerB.dispose();
    serviceA.dispose();
    serviceB.dispose();
  });
});
