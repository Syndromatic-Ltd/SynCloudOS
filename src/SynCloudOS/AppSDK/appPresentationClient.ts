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

import type { SynCloudOSPresentationTraitsService } from "../SynCloudOS";
import type { AppPresentationClient } from "./appClientTypes";

/**
 * Read-only app projection of the canonical presentation service.  The mount
 * owns the source service; this capability deliberately retains only its last
 * immutable value after revocation so an outgoing React frame cannot observe
 * newer host state.
 */
export function createAppPresentationClient(
  source: Pick<SynCloudOSPresentationTraitsService, "getSnapshot" | "subscribe">,
  signal: AbortSignal,
): AppPresentationClient {
  let snapshot = source.getSnapshot();
  let closed = signal.aborted;
  const listeners = new Set<() => void>();
  let unsubscribe: () => void = () => undefined;

  const close = () => {
    if (closed) return;
    closed = true;
    unsubscribe();
    listeners.clear();
    signal.removeEventListener("abort", close);
  };

  if (!closed) {
    unsubscribe = source.subscribe(() => {
      if (closed) return;
      snapshot = source.getSnapshot();
      for (const listener of [...listeners]) listener();
    });
    signal.addEventListener("abort", close, { once: true });
  }

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      if (closed) return () => undefined;
      listeners.add(listener);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        listeners.delete(listener);
      };
    },
  } satisfies AppPresentationClient);
}
