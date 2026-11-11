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
import type {
  LFXLocationManager,
  LFXLocationRequestOptions,
  LFXLocationWatchOptions,
} from "../../../FX/LocationFX/public";
import { useSCOS } from "../scos/useSCOS"

/** Stable component-scoped foreground location facade. Mounting never requests a fix. */
export function useLocation(): LFXLocationManager {
  const client = useSCOS().location;
  const binding = useMemo(() => {
    let current: LFXLocationManager | null = null;
    const requireManager = () => {
      if (!current) throw new Error("The component location owner is not mounted.");
      return current;
    };
    const facade = Object.freeze<LFXLocationManager>({
      getAuthorizationStatus: () => current?.getAuthorizationStatus() ?? Promise.resolve("unavailable"),
      current: (options?: LFXLocationRequestOptions) => requireManager().current(options),
      watch: (options: LFXLocationWatchOptions, listener) => requireManager().watch(options, listener),
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
