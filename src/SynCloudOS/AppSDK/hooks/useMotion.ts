/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useLayoutEffect, useMemo } from "react";
import { useSCOS } from "../scos/useSCOS"
import type {
  MFXMotionManager,
  MFXMotionCapabilities,
} from "../../../FX/MotionFX/public";
import { MFXSensors } from "../../../FX/MotionFX/MFXMotionCapabilities";

const pendingCapabilities = Object.freeze(
  Object.fromEntries(
    MFXSensors.map((sensor) => [
      sensor,
      Object.freeze({
        state: "unavailable",
        apiPresent: false,
        samples: "no-samples",
        reason: "The component motion owner is not mounted.",
      }),
    ]),
  ),
) as MFXMotionCapabilities;

/** Stable component facade. Host ownership is acquired only after React commits. */
export function useMotion(): MFXMotionManager {
  const client = useSCOS().motion;
  const binding = useMemo(() => {
    let current: MFXMotionManager | null = null;
    const requireManager = () => {
      if (!current)
        throw new Error("The component motion owner is not mounted.");
      return current;
    };
    const facade: MFXMotionManager = Object.freeze<MFXMotionManager>({
      get capabilities() {
        return current?.capabilities ?? pendingCapabilities;
      },
      get deviceMotion() {
        return current?.deviceMotion ?? null;
      },
      get accelerometerData() {
        return current?.accelerometerData ?? null;
      },
      get gyroData() {
        return current?.gyroData ?? null;
      },
      get accelerometerUpdateInterval() {
        return current?.accelerometerUpdateInterval ?? 1 / 60;
      },
      get gyroUpdateInterval() {
        return current?.gyroUpdateInterval ?? 1 / 60;
      },
      setAccelerometerUpdateInterval: (seconds) =>
        requireManager().setAccelerometerUpdateInterval(seconds),
      setGyroUpdateInterval: (seconds) =>
        requireManager().setGyroUpdateInterval(seconds),
      get deviceMotionUpdateInterval() {
        return current?.deviceMotionUpdateInterval ?? 1 / 60;
      },
      get observedUpdateInterval() {
        return current?.observedUpdateInterval ?? null;
      },
      setDeviceMotionUpdateInterval: (seconds) =>
        requireManager().setDeviceMotionUpdateInterval(seconds),
      startDeviceMotionUpdates: (options, handler) =>
        requireManager().startDeviceMotionUpdates(options, handler),
      startAccelerometerUpdates: (handler, signal) =>
        requireManager().startAccelerometerUpdates(handler, signal),
      startGyroUpdates: (handler, signal) =>
        requireManager().startGyroUpdates(handler, signal),
      stopDeviceMotionUpdates: () => current?.stopDeviceMotionUpdates(),
      stopAccelerometerUpdates: () => current?.stopAccelerometerUpdates(),
      stopGyroUpdates: () => current?.stopGyroUpdates(),
      resetReferenceFrame: () => requireManager().resetReferenceFrame(),
      createRecorder: (options) => requireManager().createRecorder(options),
      requestAuthorization: () => requireManager().requestAuthorization(),
      dispose: () => current?.dispose(),
    });
    return {
      facade,
      mount() {
        const manager = client.createManager();
        current = manager;
        return () => {
          if (current === manager) current = null;
          manager.dispose();
        };
      },
    };
  }, [client]);
  useLayoutEffect(() => binding.mount(), [binding]);
  return binding.facade;
}
