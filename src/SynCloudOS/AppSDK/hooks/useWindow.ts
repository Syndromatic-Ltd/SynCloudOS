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

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useSCOS } from "../scos/useSCOS"
import type { AppWindowClient, AppWindowSnapshot } from "../appClientTypes";

export interface SynWareWindowState {
  readonly client: AppWindowClient;
  readonly snapshot: AppWindowSnapshot;
}

/** Observes only the current app presentation session, not WindowManager. */
export function useWindow(): SynWareWindowState {
  const app = useSCOS();
  const subscribe = useCallback((listener: () => void) => app.windows.subscribe(listener), [app.windows]);
  const getSnapshot = useCallback(() => app.windows.getSnapshot(), [app.windows]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(() => Object.freeze({ client: app.windows, snapshot }), [app.windows, snapshot]);
}
