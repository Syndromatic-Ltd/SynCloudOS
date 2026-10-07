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

import type { HFXHapticClient } from "../../FX/HapticsFX/HFXHapticClient";
import type { HFXHostService } from "../HostServices/AppSDKHostServiceTypes";
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";

export function createMountedHapticsClient(
  host: Pick<HFXHostService, "createSession">,
  owner: AbortSignal,
  permissions: () => readonly string[],
): HFXHapticClient {
  const scope = createMountedResourceScope(owner);
  return Object.freeze({
    createEngine(signal?: AbortSignal) {
      owner.throwIfAborted();
      if (!permissions().includes("haptics.play")) throw new DOMException("SynWare capability haptics.play must be declared.", "SecurityError");
      return scope.acquire(signal, (lease, release) => {
        const session = host.createSession(lease);
        const descriptors = Object.getOwnPropertyDescriptors(session);
        descriptors.dispose = { enumerable: true, value: () => { try { session.dispose(); } finally { release(); } } };
        return Object.freeze(Object.create(null, descriptors)) as typeof session;
      }, (session) => session.dispose());
    },
  });
}
