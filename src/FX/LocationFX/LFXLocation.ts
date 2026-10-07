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

import { LFXCoordinate } from "./LFXCoordinate";

const TWO_PI = Math.PI * 2;

export interface LFXLocationDescriptor {
  readonly coordinate: LFXCoordinate;
  readonly observedAtUnixMilliseconds: number;
  readonly receivedAtMonotonicSeconds: number;
  readonly horizontalAccuracyMetres: number;
  readonly altitudeMetres: number | null;
  readonly altitudeAccuracyMetres: number | null;
  readonly speedMetresPerSecond: number | null;
  readonly courseRadians: number | null;
}

function descriptorData(value: LFXLocationDescriptor): Record<keyof LFXLocationDescriptor, unknown> {
  if (!value || typeof value !== "object"
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    || Object.getOwnPropertySymbols(value).length)
    throw new TypeError("Location descriptor must be plain data.");
  const keys = [
    "coordinate",
    "observedAtUnixMilliseconds",
    "receivedAtMonotonicSeconds",
    "horizontalAccuracyMetres",
    "altitudeMetres",
    "altitudeAccuracyMetres",
    "speedMetresPerSecond",
    "courseRadians",
  ] as const;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(descriptors).length !== keys.length
    || keys.some((key) => !descriptors[key] || !("value" in descriptors[key]!)))
    throw new TypeError("Location descriptor has an invalid data shape.");
  return Object.fromEntries(keys.map((key) => [key, descriptors[key]!.value])) as Record<keyof LFXLocationDescriptor, unknown>;
}

function finite(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new RangeError(`${name} must be finite.`);
  return Object.is(value, -0) ? 0 : value;
}

function nonnegative(value: unknown, name: string): number {
  const result = finite(value, name);
  if (result < 0)
    throw new RangeError(`${name} must be nonnegative.`);
  return result;
}

function nullableFinite(value: unknown, name: string): number | null {
  return value === null ? null : finite(value, name);
}

function nullableNonnegative(value: unknown, name: string): number | null {
  return value === null ? null : nonnegative(value, name);
}

function normalizedCourse(value: unknown): number | null {
  if (value === null)
    return null;
  const result = finite(value, "Course");
  if (result < 0 || result >= TWO_PI)
    throw new RangeError("Course must be normalized to [0, 2π) radians.");
  return result;
}

/** Converts a nullable degree course into normalized radians without manufacturing an absent channel. */
export function lfxCourseRadiansFromDegrees(value: number | null): number | null {
  if (value === null)
    return null;
  const degrees = finite(value, "Course degrees");
  const wrapped = degrees % 360;
  const normalized = wrapped < 0 ? wrapped + 360 : wrapped;
  const radians = normalized * Math.PI / 180;
  return Object.is(radians, -0) || radians === TWO_PI ? 0 : radians;
}

/** Immutable location fix with distinct wall-clock observation and monotonic receipt timestamps. */
export class LFXLocation implements LFXLocationDescriptor {
  readonly coordinate: LFXCoordinate;
  readonly observedAtUnixMilliseconds: number;
  readonly receivedAtMonotonicSeconds: number;
  readonly horizontalAccuracyMetres: number;
  readonly altitudeMetres: number | null;
  readonly altitudeAccuracyMetres: number | null;
  readonly speedMetresPerSecond: number | null;
  readonly courseRadians: number | null;

  constructor(value: LFXLocationDescriptor) {
    const data = descriptorData(value);
    if (!(data.coordinate instanceof LFXCoordinate))
      throw new TypeError("Location coordinate must be an LFXCoordinate.");
    this.coordinate = data.coordinate;
    this.observedAtUnixMilliseconds = finite(data.observedAtUnixMilliseconds, "Observed Unix timestamp");
    this.receivedAtMonotonicSeconds = nonnegative(data.receivedAtMonotonicSeconds, "Monotonic receipt timestamp");
    this.horizontalAccuracyMetres = nonnegative(data.horizontalAccuracyMetres, "Horizontal accuracy");
    this.altitudeMetres = nullableFinite(data.altitudeMetres, "Altitude");
    this.altitudeAccuracyMetres = nullableNonnegative(data.altitudeAccuracyMetres, "Altitude accuracy");
    this.speedMetresPerSecond = nullableNonnegative(data.speedMetresPerSecond, "Speed");
    this.courseRadians = normalizedCourse(data.courseRadians);
    Object.freeze(this);
  }
}
