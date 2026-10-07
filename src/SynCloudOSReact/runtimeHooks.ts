/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { RuntimeSnapshot } from "../SynCloudOS/SynCloudOS";
import { useKernelSynCloudOS } from "./SynCloudOSProvider";

export function useRuntimeSnapshot(): RuntimeSnapshot {
  const runtime = useKernelSynCloudOS();
  return useSyncExternalStore(
    runtime.store.subscribe,
    runtime.store.getSnapshot,
    runtime.store.getSnapshot,
  );
}

export function useRuntimeSelector<T>(
  selector: (snapshot: RuntimeSnapshot) => T,
  equalityFn: (left: T, right: T) => boolean = Object.is,
): T {
  const runtime = useKernelSynCloudOS();
  const committed = useRef<{ selection: T } | null>(null);
  const getSelectedSnapshot = useMemo(() => {
    // Snapshot memoisation belongs to this selector. A new selector may depend
    // on changed component props even when the runtime has not mutated.
    let selectedSnapshot: RuntimeSnapshot | null = null;
    let selection!: T;
    return () => {
      const snapshot = runtime.store.getSnapshot();
      if (selectedSnapshot === snapshot) return selection;
      const next = selector(snapshot);
      if (selectedSnapshot === null) {
        selection = committed.current && equalityFn(committed.current.selection, next) ? committed.current.selection : next;
      } else if (!equalityFn(selection, next)) selection = next;
      selectedSnapshot = snapshot;
      return selection;
    };
  }, [equalityFn, runtime, selector]);
  const selection = useSyncExternalStore(runtime.store.subscribe, getSelectedSnapshot, getSelectedSnapshot);
  // A suspended render must not overwrite the last committed selection.
  useEffect(() => { committed.current = { selection }; }, [selection]);
  return selection;
}
