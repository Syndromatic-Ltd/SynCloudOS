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

import type {
  LFXLocationClient,
  LFXLocationManager,
  LFXLocationRequestOptions,
  LFXLocationWatchOptions,
} from "../../FX/LocationFX/LFXLocationManager";
import type { LocationService } from "../HostServices/AppSDKHostServiceTypes";
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";
import type { MountedSettlementPort } from "./mountedSettlementPort";

export type MountedLocationCapability = "location.read" | "location.request";

function securityError(message: string): DOMException {
  return new DOMException(message, "SecurityError");
}

/** Host-mounted location authority. Policy and manifest checks occur before device access. */
export function createMountedLocationClient(
  service: LocationService,
  mountSignal: AbortSignal,
  permissions: () => readonly string[],
  authorise: (capability: MountedLocationCapability) => boolean,
  appId?: string,
  settlement?: MountedSettlementPort,
): LFXLocationClient {
  const scope = createMountedResourceScope(mountSignal, {
    maxResources: 8,
    budgets: { sessions: 8 },
  });
  const requireCapability = (capability: MountedLocationCapability) => {
    mountSignal.throwIfAborted();
    if (!permissions().includes(capability))
      throw securityError(`SynWare capability ${capability} must be declared.`);
    if (!authorise(capability))
      throw securityError(`PolicyKit denied SynWare capability ${capability}.`);
  };
  return Object.freeze({
    createManager(signal?: AbortSignal): LFXLocationManager {
      requireCapability("location.read");
      return scope.acquire(signal, (lease, release) => {
        const manager = service.createManager({
          signal: lease,
          appId,
          reauthorise: () => {
            try {
              requireCapability("location.read");
              requireCapability("location.request");
              return true;
            } catch {
              return false;
            }
          },
        });
        let disposed = false;
        const watchReleases = new Set<() => void>();
        const releaseWatches = () => {
          for (const releaseWatch of [...watchReleases]) releaseWatch();
        };
        lease.addEventListener("abort", releaseWatches, { once: true });
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          try { manager.dispose(); } finally {
            releaseWatches();
            lease.removeEventListener("abort", releaseWatches);
            release();
          }
        };
        return Object.freeze<LFXLocationManager>({
          async getAuthorizationStatus() {
            if (!permissions().includes("location.read") || !authorise("location.read")) return "denied";
            return manager.getAuthorizationStatus();
          },
          async current(options: LFXLocationRequestOptions = {}) {
            requireCapability("location.request");
            return manager.current(options);
          },
          watch(options: LFXLocationWatchOptions, listener) {
            requireCapability("location.request");
            const watch = manager.watch(options, listener);
            const exclusion = settlement?.exclude({
              owner: "location",
              kind: "watch",
              label: appId ?? "mounted-location",
            });
            let released = false;
            const releaseWatch = () => {
              if (released) return;
              released = true;
              options.signal?.removeEventListener("abort", releaseWatch);
              watchReleases.delete(releaseWatch);
              exclusion?.release();
            };
            watchReleases.add(releaseWatch);
            options.signal?.addEventListener("abort", releaseWatch, { once: true });
            if (options.signal?.aborted || lease.aborted) releaseWatch();
            return Object.freeze({
              dispose() {
                try { watch.dispose(); } finally { releaseWatch(); }
              },
            });
          },
          dispose,
        });
      }, (manager) => manager.dispose(), { sessions: 1 });
    },
  });
}
