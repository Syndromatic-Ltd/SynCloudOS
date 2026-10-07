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

import { useMemo, useSyncExternalStore } from "react";
import { useSynWare } from "../SynWareContext";
import type { AppServiceResult } from "../appClientTypes";
import type { SynWareServiceToken } from "../serviceToken";

/** Resolves a host-projected service capability. A denied or absent service is
 * represented explicitly; no unchecked capability cast is possible. */
export function useSynWareService<TClient>(token: SynWareServiceToken<TClient>): AppServiceResult<TClient> {
  const app = useSynWare();
  const observation = useMemo(() => {
    let revision = 0;
    return {
      subscribe(listener: () => void) {
        return app.services.subscribe(token, () => {
          revision += 1;
          listener();
        });
      },
      getSnapshot() { return revision; },
    };
  }, [app.services, token]);
  const revision = useSyncExternalStore(observation.subscribe, observation.getSnapshot, observation.getSnapshot);
  return useMemo(() => app.services.optional(token), [app.services, revision, token]);
}
