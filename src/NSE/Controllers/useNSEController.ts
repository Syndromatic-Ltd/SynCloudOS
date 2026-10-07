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

import { useCallback, useRef, useSyncExternalStore } from "react";

import type { NSEController } from "./NSEController";

export function useNSEController<TSnapshot, TChange, TSelection>(
  controller: NSEController<TSnapshot, TChange>,
  selector: (snapshot: TSnapshot) => TSelection,
  equals: (left: TSelection, right: TSelection) => boolean = Object.is,
): TSelection {
  const cache = useRef<{
    controller: NSEController<TSnapshot, TChange>;
    snapshot: TSnapshot;
    selector: (snapshot: TSnapshot) => TSelection;
    equals: (left: TSelection, right: TSelection) => boolean;
    selection: TSelection;
  } | null>(null);
  const getSelection = useCallback(() => {
    const snapshot = controller.getSnapshot();
    if (
      cache.current?.controller === controller &&
      cache.current.snapshot === snapshot &&
      cache.current.selector === selector &&
      cache.current.equals === equals
    ) {
      return cache.current.selection;
    }
    const next = selector(snapshot);
    const selection =
      cache.current?.controller === controller &&
      cache.current.equals === equals &&
      equals(cache.current.selection, next)
        ? cache.current.selection
        : next;
    cache.current = { controller, snapshot, selector, equals, selection };
    return selection;
  }, [controller, equals, selector]);
  return useSyncExternalStore(
    controller.subscribe,
    getSelection,
    getSelection,
  );
}
