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

import { describe, expect, it } from "vitest";

import {
  LFXCoordinate,
  LFXLocation,
  LFXNativeOnlyCapabilities,
  lfxCourseRadiansFromDegrees,
  type LFXAccuracy,
  type LFXAuthorizationStatus,
} from "../../../src/FX/LocationFX/public";

describe("LocationFX value contracts", () => {
  it("validates immutable WGS84 coordinates and exposes bounded geodesy helpers", () => {
    const origin = new LFXCoordinate(0, 0);
    const oneDegreeEast = new LFXCoordinate(0, 1);

    expect(Object.isFrozen(origin)).toBe(true);
    expect(origin.distanceTo(oneDegreeEast)).toBeCloseTo(111_319.491, 0);
    expect(origin.initialBearingTo(oneDegreeEast)).toBeCloseTo(Math.PI / 2, 12);

    expect(() => new LFXCoordinate(90.000_001, 0)).toThrow(RangeError);
    expect(() => new LFXCoordinate(-90.000_001, 0)).toThrow(RangeError);
    expect(() => new LFXCoordinate(0, 180.000_001)).toThrow(RangeError);
    expect(() => new LFXCoordinate(0, -180.000_001)).toThrow(RangeError);
    expect(() => new LFXCoordinate(Number.NaN, 0)).toThrow(RangeError);
    expect(() => new LFXCoordinate(0, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("preserves zero-valued channels separately from absent channels and keeps the two clocks distinct", () => {
    const zero = new LFXLocation({
      coordinate: new LFXCoordinate(0, 0),
      observedAtUnixMilliseconds: 0,
      receivedAtMonotonicSeconds: 0,
      horizontalAccuracyMetres: 0,
      altitudeMetres: 0,
      altitudeAccuracyMetres: 0,
      speedMetresPerSecond: 0,
      courseRadians: 0,
    });
    const absent = new LFXLocation({
      coordinate: new LFXCoordinate(0, 0),
      observedAtUnixMilliseconds: 1_700_000_000_000,
      receivedAtMonotonicSeconds: 12.5,
      horizontalAccuracyMetres: 4.25,
      altitudeMetres: null,
      altitudeAccuracyMetres: null,
      speedMetresPerSecond: null,
      courseRadians: null,
    });

    expect(Object.isFrozen(zero)).toBe(true);
    expect(zero.altitudeMetres).toBe(0);
    expect(zero.altitudeAccuracyMetres).toBe(0);
    expect(zero.speedMetresPerSecond).toBe(0);
    expect(zero.courseRadians).toBe(0);
    expect(absent.altitudeMetres).toBeNull();
    expect(absent.speedMetresPerSecond).toBeNull();
    expect(absent.courseRadians).toBeNull();
    expect(absent.observedAtUnixMilliseconds).toBe(1_700_000_000_000);
    expect(absent.receivedAtMonotonicSeconds).toBe(12.5);
  });

  it("rejects negative or non-finite uncertainty/speed and requires normalized course radians", () => {
    const base = {
      coordinate: new LFXCoordinate(51.5074, -0.1278),
      observedAtUnixMilliseconds: 1_700_000_000_000,
      receivedAtMonotonicSeconds: 4.5,
      horizontalAccuracyMetres: 3,
      altitudeMetres: null,
      altitudeAccuracyMetres: null,
      speedMetresPerSecond: null,
      courseRadians: null,
    } as const;

    expect(() => new LFXLocation({ ...base, horizontalAccuracyMetres: -0.1 })).toThrow(RangeError);
    expect(() => new LFXLocation({ ...base, horizontalAccuracyMetres: Number.NaN })).toThrow(RangeError);
    expect(() => new LFXLocation({ ...base, altitudeMetres: Number.POSITIVE_INFINITY })).toThrow(RangeError);
    expect(() => new LFXLocation({ ...base, altitudeAccuracyMetres: -1 })).toThrow(RangeError);
    expect(() => new LFXLocation({ ...base, speedMetresPerSecond: -1 })).toThrow(RangeError);
    expect(() => new LFXLocation({ ...base, speedMetresPerSecond: Number.POSITIVE_INFINITY })).toThrow(RangeError);
    expect(() => new LFXLocation({ ...base, courseRadians: -Number.EPSILON })).toThrow(RangeError);
    expect(() => new LFXLocation({ ...base, courseRadians: Math.PI * 2 })).toThrow(RangeError);
    expect(() => new LFXLocation({ ...base, receivedAtMonotonicSeconds: -1 })).toThrow(RangeError);
  });

  it("normalizes browser-style degree courses exactly once without manufacturing an absent course", () => {
    expect(lfxCourseRadiansFromDegrees(null)).toBeNull();
    expect(lfxCourseRadiansFromDegrees(0)).toBe(0);
    expect(lfxCourseRadiansFromDegrees(360)).toBe(0);
    expect(lfxCourseRadiansFromDegrees(450)).toBeCloseTo(Math.PI / 2, 12);
    expect(lfxCourseRadiansFromDegrees(-90)).toBeCloseTo(3 * Math.PI / 2, 12);
    expect(() => lfxCourseRadiansFromDegrees(Number.NaN)).toThrow(RangeError);
  });

  it("keeps desired accuracy distinct from native precise authorization and gives native-only capabilities reason codes", () => {
    const desired: LFXAccuracy = "high";
    const authorization: LFXAuthorizationStatus = "granted";
    expect(desired).toBe("high");
    expect(authorization).toBe("granted");

    expect(LFXNativeOnlyCapabilities["precise-accuracy-authorization"]).toEqual({
      state: "unavailable-on-portable-host",
      reason: "native-precise-accuracy-authorization-unavailable",
    });
    expect(LFXNativeOnlyCapabilities.geofencing.reason).toBe("native-geofence-delivery-unavailable");

    const reasons = Object.values(LFXNativeOnlyCapabilities).map((capability) => capability.reason);
    expect(reasons.every((reason) => reason.length > 0)).toBe(true);
    expect(new Set(reasons).size).toBe(reasons.length);
  });
});
