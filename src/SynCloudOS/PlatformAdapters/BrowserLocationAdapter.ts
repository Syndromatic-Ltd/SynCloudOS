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

import { LFXCoordinate } from "../../FX/LocationFX/LFXCoordinate";
import { LFXLocation, lfxCourseRadiansFromDegrees } from "../../FX/LocationFX/LFXLocation";
import type { LFXAuthorizationStatus } from "../../FX/LocationFX/LFXCapabilities";
import type {
  LFXLocationAdapter,
  LFXLocationAdapterRequest,
} from "../HostServices/PlatformAdapterRuntimePorts";

interface BrowserLocationWindow {
  readonly isSecureContext: boolean;
  readonly performance: Pick<Performance, "now">;
}

interface BrowserLocationPermissions {
  query(descriptor: { name: "geolocation" }): Promise<{ readonly state: PermissionState }>;
}

interface BrowserLocationGeolocation {
  watchPosition(
    success: PositionCallback,
    error?: PositionErrorCallback | null,
    options?: PositionOptions,
  ): number;
  clearWatch(watchId: number): void;
}

interface BrowserLocationNavigator {
  readonly geolocation?: BrowserLocationGeolocation;
  readonly permissions?: BrowserLocationPermissions;
}

function secondsToMilliseconds(value: number | undefined, fallback: number, name: string, allowZero: boolean): number {
  const seconds = value ?? fallback;
  if (!Number.isFinite(seconds) || seconds < 0 || (!allowZero && seconds === 0))
    throw new RangeError(`${name} must be ${allowZero ? "nonnegative" : "positive"} and finite.`);
  const milliseconds = seconds * 1000;
  if (!Number.isSafeInteger(milliseconds))
    throw new RangeError(`${name} is too large.`);
  return milliseconds;
}

function locationError(error: GeolocationPositionError): DOMException {
  if (error.code === 1) return new DOMException(error.message || "Location permission was denied.", "NotAllowedError");
  if (error.code === 2) return new DOMException(error.message || "A location fix is unavailable.", "NotFoundError");
  if (error.code === 3) return new DOMException(error.message || "The location request timed out.", "TimeoutError");
  return new DOMException(error.message || "The location request failed.", "OperationError");
}

function locationFromPosition(position: GeolocationPosition, receivedAtMonotonicSeconds: number): LFXLocation {
  const { coords } = position;
  return new LFXLocation({
    coordinate: new LFXCoordinate(coords.latitude, coords.longitude),
    observedAtUnixMilliseconds: position.timestamp,
    receivedAtMonotonicSeconds,
    horizontalAccuracyMetres: coords.accuracy,
    altitudeMetres: coords.altitude,
    altitudeAccuracyMetres: coords.altitudeAccuracy,
    speedMetresPerSecond: coords.speed,
    courseRadians: lfxCourseRadiansFromDegrees(coords.heading),
  });
}

/** Browser foreground Geolocation adapter. Passive inspection never starts a watch. */
export class BrowserLocationAdapter implements LFXLocationAdapter {
  constructor(
    private readonly browserWindow: BrowserLocationWindow,
    private readonly browserNavigator: BrowserLocationNavigator,
  ) {}

  nowMonotonicSeconds(): number {
    return this.browserWindow.performance.now() / 1000;
  }

  async getAuthorizationStatus(signal?: AbortSignal): Promise<LFXAuthorizationStatus> {
    signal?.throwIfAborted();
    if (!this.browserWindow.isSecureContext || !this.browserNavigator.geolocation)
      return "unavailable";
    const permissions = this.browserNavigator.permissions;
    if (!permissions?.query) return "unknown";
    try {
      const status = await permissions.query({ name: "geolocation" });
      signal?.throwIfAborted();
      if (status.state === "granted") return "granted";
      if (status.state === "denied") return "denied";
      return "prompt";
    } catch (error) {
      signal?.throwIfAborted();
      void error;
      return "unknown";
    }
  }

  current(options: LFXLocationAdapterRequest): Promise<LFXLocation> {
    const { signal } = options;
    signal.throwIfAborted();
    if (!this.browserWindow.isSecureContext)
      return Promise.reject(new DOMException("Location requires a secure context.", "SecurityError"));
    const geolocation = this.browserNavigator.geolocation;
    if (!geolocation)
      return Promise.reject(new DOMException("Browser Geolocation is unavailable.", "NotFoundError"));
    const maximumAge = secondsToMilliseconds(options.maximumAgeSeconds, 0, "Maximum location age", true);
    const timeout = secondsToMilliseconds(options.timeoutSeconds, 10, "Location timeout", false);
    const enableHighAccuracy = (options.accuracy ?? "balanced") === "high";

    return new Promise<LFXLocation>((resolve, reject) => {
      let watchId: number | undefined;
      let settled = false;
      let clearPending = false;
      const clear = () => {
        if (watchId === undefined) {
          clearPending = true;
          return;
        }
        geolocation.clearWatch(watchId);
        watchId = undefined;
        clearPending = false;
      };
      const cleanup = () => {
        signal.removeEventListener("abort", onAbort);
        clear();
      };
      const settleReject = (reason: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(reason);
      };
      const onAbort = () => settleReject(signal.reason ?? new DOMException("Location request was aborted.", "AbortError"));
      signal.addEventListener("abort", onAbort, { once: true });
      try {
        watchId = geolocation.watchPosition(
          (position) => {
            if (settled || signal.aborted) return;
            try {
              const location = locationFromPosition(position, this.nowMonotonicSeconds());
              settled = true;
              cleanup();
              resolve(location);
            } catch (error) {
              settleReject(error);
            }
          },
          (error) => settleReject(locationError(error)),
          { enableHighAccuracy, maximumAge, timeout },
        );
        if (clearPending) clear();
        if (signal.aborted) onAbort();
      } catch (error) {
        settleReject(error);
      }
    });
  }

  watch(
    options: Readonly<{ accuracy: "balanced" | "high"; signal: AbortSignal }>,
    listener: (location: LFXLocation) => void,
    onError?: (error: unknown) => void,
  ): Readonly<{ dispose(): void }> {
    const { signal } = options;
    signal.throwIfAborted();
    if (!this.browserWindow.isSecureContext)
      throw new DOMException("Location requires a secure context.", "SecurityError");
    const geolocation = this.browserNavigator.geolocation;
    if (!geolocation)
      throw new DOMException("Browser Geolocation is unavailable.", "NotFoundError");

    let watchId: number | undefined;
    let disposed = false;
    let clearPending = false;
    const clear = () => {
      if (disposed) return;
      disposed = true;
      signal.removeEventListener("abort", onAbort);
      if (watchId === undefined) {
        clearPending = true;
        return;
      }
      geolocation.clearWatch(watchId);
      watchId = undefined;
      clearPending = false;
    };
    const onAbort = () => clear();
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      watchId = geolocation.watchPosition(
        position => {
          if (disposed || signal.aborted) return;
          try {
            listener(locationFromPosition(position, this.nowMonotonicSeconds()));
          } catch (error) {
            onError?.(error);
          }
        },
        error => {
          if (!disposed && !signal.aborted) onError?.(locationError(error));
        },
        { enableHighAccuracy: options.accuracy === "high", maximumAge: 0 },
      );
      if (clearPending || signal.aborted) {
        const id = watchId;
        watchId = undefined;
        clearPending = false;
        if (id !== undefined) geolocation.clearWatch(id);
      }
      return Object.freeze({ dispose: clear });
    } catch (error) {
      signal.removeEventListener("abort", onAbort);
      disposed = true;
      throw error;
    }
  }
}
