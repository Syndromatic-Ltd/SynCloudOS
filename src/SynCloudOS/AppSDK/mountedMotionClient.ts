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
import type { MFXMotionClient } from "../../FX/MotionFX/public";
import type { MotionService } from "../HostServices/AppSDKHostServiceTypes";

/** Only the canonical mounted bundle declaration may authorize acquisition. */
export function createMountedMotionClient(
  service: MotionService,
  mountSignal: AbortSignal,
  permissions: () => readonly string[],
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
        const dispose = manager.dispose.bind(manager);
        const descriptors = Object.getOwnPropertyDescriptors(manager);
        descriptors.dispose = {
          enumerable: true,
          value: () => { try { dispose(); } finally { release(); } },
        };
        return Object.freeze(Object.create(null, descriptors)) as typeof manager;
      }, (manager) => manager.dispose());
    },
  });
}
