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

import { createMountedResourceScope } from "../HostServices/mountedResourceScope";
import type { MFXAvailability, MFXMotionCapabilities, MFXMotionClient, MFXMotionManager } from "../../FX/MotionFX/public";
import type { MotionService, PrivacyApplicationPort, PrivacyAuthorizationStatus } from "../HostServices/AppSDKHostServiceTypes";

function privacyState(state: MFXAvailability): PrivacyAuthorizationStatus {
  if (state === "available" || state === "suspended") return "granted";
  if (state === "permission-required") return "prompt";
  if (state === "denied") return "denied";
  return "unavailable";
}
function motionState(state: PrivacyAuthorizationStatus, native: MFXAvailability = "available"): MFXAvailability {
  if (state === "granted") return native;
  if (state === "denied" || state === "unavailable") return state;
  return "permission-required";
}

/** Only the canonical mounted bundle declaration may authorise acquisition. */
export function createMountedMotionClient(
  service: MotionService,
  mountSignal: AbortSignal,
  permissions: () => readonly string[],
  privacy?: PrivacyApplicationPort,
): MFXMotionClient {
  const scope = createMountedResourceScope(mountSignal);
  return Object.freeze({
    createManager(signal?: AbortSignal) {
      mountSignal.throwIfAborted();
      signal?.throwIfAborted();
      const declared = permissions();
      if (!declared.includes("motion.read")) throw new DOMException("SynWare capability motion.read must be declared.", "SecurityError");
      return scope.acquire(signal, (lease, release) => {
        const manager = service.createManager({ signal: lease, canRequestAuthorization: declared.includes("motion.requestAuthorization") });
        let disposed = false;
        let revokedState: MFXAvailability | null = null;
        let unbindPrivacy: (() => void) | null = null;
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          try { manager.dispose(); } finally { unbindPrivacy?.(); unbindPrivacy = null; release(); }
        };
        const bindPrivacy = () => {
          if (!privacy || unbindPrivacy) return;
          unbindPrivacy = privacy.bindResource(() => {
            revokedState = motionState(privacy.authorizationStatus());
            dispose();
          });
        };
        const availability = (native: MFXAvailability): MFXAvailability => {
          if (!privacy) return native;
          if (revokedState) return revokedState;
          if (native === "disposed") return "disposed";
          return motionState(privacy.authorizationStatus(privacyState(native)), native);
        };
        const assertActive = (sensor: "deviceMotion" | "accelerometer" | "gyroscope") => {
          if (!privacy) return;
          lease.throwIfAborted();
          privacy.assertRequestAllowed();
          const state = availability(manager.capabilities[sensor].state);
          if (state !== "available" && state !== "suspended") throw new DOMException("Motion access requires explicit authorisation for this application.", "NotAllowedError");
          bindPrivacy();
        };
        const descriptors: PropertyDescriptorMap = Object.getOwnPropertyDescriptors(manager);
        descriptors.authorizationStatus = { enumerable: true, get: () => availability(manager.authorizationStatus) };
        descriptors.capabilities = { enumerable: true, get: (): MFXMotionCapabilities => {
          const capabilities = manager.capabilities;
          if (!privacy) return capabilities;
          return Object.freeze(Object.fromEntries(Object.entries(capabilities).map(([sensor, capability]) => {
            const state = availability(capability.state);
            return [sensor, Object.freeze({ ...capability, state, reason: state === capability.state ? capability.reason : "Application privacy authorisation is required." })];
          }))) as MFXMotionCapabilities;
        } };
        descriptors.deviceMotion = { enumerable: true, get: () => !privacy || availability(manager.authorizationStatus) === "available" ? manager.deviceMotion : null };
        descriptors.accelerometerData = { enumerable: true, get: () => !privacy || availability(manager.capabilities.accelerometer.state) === "available" ? manager.accelerometerData : null };
        descriptors.gyroData = { enumerable: true, get: () => !privacy || availability(manager.capabilities.gyroscope.state) === "available" ? manager.gyroData : null };
        descriptors.startDeviceMotionUpdates = { enumerable: true, value: (...args: Parameters<MFXMotionManager["startDeviceMotionUpdates"]>) => { assertActive("deviceMotion"); return manager.startDeviceMotionUpdates(...args); } };
        descriptors.startAccelerometerUpdates = { enumerable: true, value: (...args: Parameters<MFXMotionManager["startAccelerometerUpdates"]>) => { assertActive("accelerometer"); return manager.startAccelerometerUpdates(...args); } };
        descriptors.startGyroUpdates = { enumerable: true, value: (...args: Parameters<MFXMotionManager["startGyroUpdates"]>) => { assertActive("gyroscope"); return manager.startGyroUpdates(...args); } };
        descriptors.createRecorder = { enumerable: true, value: (...args: Parameters<MFXMotionManager["createRecorder"]>) => { assertActive("deviceMotion"); return manager.createRecorder(...args); } };
        descriptors.requestAuthorization = { enumerable: true, value: async (): Promise<MFXAvailability> => {
          if (!privacy) return manager.requestAuthorization();
          lease.throwIfAborted();
          const local = privacy.authorizationStatus();
          if (local === "denied" || local === "unavailable") return motionState(local);
          bindPrivacy();
          let native: MFXAvailability = manager.authorizationStatus;
          const status = await privacy.requestAuthorization(async () => {
            native = await manager.requestAuthorization();
            // A suspended host has not completed a successful authorisation request.
            return native === "available" ? "granted" : native === "denied" ? "denied" : native === "permission-required" || native === "suspended" ? "prompt" : "unavailable";
          }, { signal: lease });
          return status === "granted" ? native : status === "prompt" ? native : motionState(status);
        } };
        descriptors.dispose = { enumerable: true, value: dispose };
        return Object.freeze(Object.create(null, descriptors)) as MFXMotionManager;
      }, manager => manager.dispose());
    },
  });
}
