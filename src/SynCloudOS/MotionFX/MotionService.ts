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

import type { MFXMotionManager } from "../../FX/MotionFX/MFXMotionManager";
import { ScopedMotionManager } from "./ScopedMotionManager";
import {
  MFXSensors,
  type MFXMotionCapabilities,
} from "../../FX/MotionFX/MFXMotionCapabilities";
import type { MFXMotionAdapter } from "./motionAdapterTypes";
const unavailableCapabilities = Object.freeze(
  Object.fromEntries(
    MFXSensors.map((sensor) => [
      sensor,
      Object.freeze({
        state: "unavailable",
        reason: "No motion adapter is installed.",
        apiPresent: false,
        samples: "no-samples",
      }),
    ]),
  ),
) as MFXMotionCapabilities;
const unavailable: MFXMotionAdapter = {
  capabilities: unavailableCapabilities,
  subscribe: () => () => {},
  requestAuthorization: async () => "unavailable",
};
export class MotionService {
  readonly #owners = new Set<AbortController>();
  #disposed = false;
  constructor(private readonly adapter: MFXMotionAdapter = unavailable) {}
  createManager(
    options: Readonly<{
      signal?: AbortSignal;
      canRequestAuthorization?: boolean;
    }> = {},
  ): MFXMotionManager {
    if (this.#disposed) throw new Error("Motion service is disposed.");
    const owner = new AbortController();
    this.#owners.add(owner);
    const abort = () => owner.abort();
    const cleanup = () => {
      this.#owners.delete(owner);
      options.signal?.removeEventListener("abort", abort);
    };
    const manager = new ScopedMotionManager(this.adapter, {
      signal: owner.signal,
      canRequestAuthorization: options.canRequestAuthorization,
      onDispose: cleanup,
    });
    if (options.signal?.aborted) manager.dispose();
    else options.signal?.addEventListener("abort", abort, { once: true });
    const facade = Object.create(null) as MFXMotionManager;
    for (const key of [
      "capabilities",
      "deviceMotion",
      "accelerometerData",
      "gyroData",
      "accelerometerUpdateInterval",
      "gyroUpdateInterval",
      "deviceMotionUpdateInterval",
      "observedUpdateInterval",
    ] as const) {
      Object.defineProperty(facade, key, {
        enumerable: true,
        get: () => manager[key],
      });
    }
    for (const key of [
      "setDeviceMotionUpdateInterval",
      "setAccelerometerUpdateInterval",
      "setGyroUpdateInterval",
      "startDeviceMotionUpdates",
      "startAccelerometerUpdates",
      "startGyroUpdates",
      "stopDeviceMotionUpdates",
      "stopAccelerometerUpdates",
      "stopGyroUpdates",
      "resetReferenceFrame",
      "createRecorder",
      "requestAuthorization",
      "dispose",
    ] as const) {
      Object.defineProperty(facade, key, {
        enumerable: true,
        value: manager[key].bind(manager),
      });
    }
    return Object.freeze(facade);
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const owner of this.#owners) owner.abort();
    this.#owners.clear();
  }
}
