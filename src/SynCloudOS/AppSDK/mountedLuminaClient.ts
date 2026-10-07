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

import type { LUFXIndexClient, LUFXIndexSession } from "../../FX/LuminaFX/LUFXIndex";
import type { LuminaIndexService } from "../HostServices/AppSDKHostServiceTypes";
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";

export type MountedLuminaCapability = "lumina.index" | "lumina.query";

/** Mounted durable-index authority. Application identity is captured from the
 * mount; no public API accepts a caller-supplied owner partition. */
export function createMountedLuminaClient(
  service: LuminaIndexService,
  mountSignal: AbortSignal,
  permissions: () => readonly string[],
  authorise: (capability: MountedLuminaCapability) => boolean,
  appId: string,
): LUFXIndexClient {
  const scope = createMountedResourceScope(mountSignal, {
    maxResources: 2,
    budgets: { sessions: 2, workerJobs: 2 },
  });
  const requireCapability = (capability: MountedLuminaCapability) => {
    mountSignal.throwIfAborted();
    if (!permissions().includes(capability)) throw new DOMException(`SynWare capability ${capability} must be declared.`, "SecurityError");
    if (!authorise(capability)) throw new DOMException(`PolicyKit denied SynWare capability ${capability}.`, "SecurityError");
  };
  const requireAnyCapability = () => {
    const declared = permissions().filter((permission): permission is MountedLuminaCapability => permission === "lumina.index" || permission === "lumina.query");
    if (declared.length === 0) throw new DOMException("SynWare must declare lumina.index or lumina.query before acquiring a Lumina session.", "SecurityError");
    if (!declared.some((capability) => authorise(capability))) throw new DOMException("PolicyKit denied the declared Lumina capabilities.", "SecurityError");
  };
  return Object.freeze({
    createIndex(signal?: AbortSignal) {
      mountSignal.throwIfAborted();
      requireAnyCapability();
      return scope.acquire(signal, (lease, release) => {
        const index = service.createIndex(appId, lease);
        let released = false;
        const dispose = () => {
            if (released) return;
            released = true;
            try { index.dispose(); } finally { release(); }
        };
        const mounted = Object.freeze<LUFXIndexSession>({
          async upsert(item, mutationId, options) { requireCapability("lumina.index"); return index.upsert(item, mutationId, options); },
          async delete(itemId, mutationId, options) { requireCapability("lumina.index"); return index.delete(itemId, mutationId, options); },
          async deleteDomain(domain, mutationId, options) { requireCapability("lumina.index"); return index.deleteDomain(domain, mutationId, options); },
          async snapshot(options) { requireCapability("lumina.query"); return index.snapshot(options); },
          async query(value, options) { requireCapability("lumina.query"); return index.query(value, options); },
          async suggest(value, options) { requireCapability("lumina.query"); return index.suggest(value, options); },
          dispose,
        });
        return mounted;
      }, (index) => index.dispose(), { sessions: 1, workerJobs: 1 });
    },
  });
}
