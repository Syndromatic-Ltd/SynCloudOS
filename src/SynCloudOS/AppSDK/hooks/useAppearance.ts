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
import type { AppAppearanceClient } from "../appClientTypes";

export interface SynWareAppearanceState {
  readonly requested: ReturnType<AppAppearanceClient["get"]>;
  readonly resolved: ReturnType<AppAppearanceClient["resolved"]>;
}

/** Observes the read-only appearance projection for the current app session. */
export function useAppearance(): SynWareAppearanceState {
  const app = useSCOS();
  const subscribe = useCallback((listener: () => void) => app.appearance.subscribe(listener), [app.appearance]);
  const getAppearance = useCallback(() => app.appearance.get(), [app.appearance]);
  const getResolvedMode = useCallback(() => app.appearance.resolved(), [app.appearance]);
  const appearance = useSyncExternalStore(subscribe, getAppearance, getAppearance);
  const resolvedMode = useSyncExternalStore(subscribe, getResolvedMode, getResolvedMode);
  return useMemo(
    () => Object.freeze({ requested: appearance, resolved: resolvedMode }),
    [app.appearance, appearance, resolvedMode],
  );
}
