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

import { useLayoutEffect, useReducer, useState, type DependencyList } from "react";

import type { ItemIdentity } from "../../SynCloudOS/Models";
import { declareSynCloudOSLifecycleSignal } from "../../SynCloudOS/nseRuntimeContracts";
import { NSEArrayController, type ArrayControllerOptions } from "./NSEArrayController";
import { NSETreeController, type TreeControllerOptions } from "./NSETreeController";

interface OwnedControllerSlot<TController> {
  readonly controller: TController;
  readonly key: readonly unknown[];
  readonly owner: AbortController;
  pendingRelease: { cancelled: boolean } | null;
}

function createSlot<TController>(
  create: (ownerSignal: AbortSignal) => TController,
  key: readonly unknown[],
): OwnedControllerSlot<TController> {
  const owner = new AbortController();
  declareSynCloudOSLifecycleSignal(owner.signal, "owner-unmounted");
  return { controller: create(owner.signal), key, owner, pendingRelease: null };
}

/**
 * One controller per mounted component. The release is deferred by a
 * microtask so React StrictMode's synchronous cleanup/setup replay cancels
 * it, and a real unmount disposes the controller with `"owner-unmounted"`.
 * A setup that finds its controller already disposed (a component revealed
 * again by `<Activity>`) renders once more with a fresh controller.
 */
function useOwnedController<TController extends { readonly isDisposed: boolean }>(
  create: (ownerSignal: AbortSignal) => TController,
  key: readonly unknown[],
): TController {
  const [slot, setSlot] = useState(() => createSlot(create, key));
  const [, refresh] = useReducer((generation: number) => generation + 1, 0);
  let current = slot;
  if (
    slot.controller.isDisposed
    || slot.key.length !== key.length
    || slot.key.some((value, index) => !Object.is(value, key[index]))
  ) {
    current = createSlot(create, key);
    setSlot(current);
  }
  useLayoutEffect(() => {
    if (current.pendingRelease) {
      current.pendingRelease.cancelled = true;
      current.pendingRelease = null;
    }
    if (current.controller.isDisposed) {
      refresh();
      return undefined;
    }
    return () => {
      const pending = { cancelled: false };
      current.pendingRelease = pending;
      queueMicrotask(() => {
        if (pending.cancelled) return;
        current.pendingRelease = null;
        current.owner.abort(new DOMException("The component that owned the controller unmounted.", "AbortError"));
      });
    };
  }, [current]);
  return current.controller;
}

/**
 * Creates an `NSEArrayController` owned by the calling component.
 *
 * The controller is created on first render and disposed when the component
 * unmounts; it survives React StrictMode's effect replay. `options` are read
 * only when a controller is created: change `options.id`,
 * `options.responderId` or an entry of `deps` to replace it with a new one
 * built from the current options, and update content of the live controller
 * with `setContent()`.
 */
export function useNSEArrayController<T, TId extends ItemIdentity>(
  options: Omit<ArrayControllerOptions<T, TId>, "ownerSignal" | "owner">,
  deps: DependencyList = [],
): NSEArrayController<T, TId> {
  return useOwnedController(
    (ownerSignal) => new NSEArrayController({ ...options, ownerSignal }),
    [options.id, options.responderId, ...deps],
  );
}

/**
 * Creates an `NSETreeController` owned by the calling component, with the
 * same lifetime and replacement rules as {@link useNSEArrayController}.
 */
export function useNSETreeController<T, TId extends ItemIdentity>(
  options: Omit<TreeControllerOptions<T, TId>, "ownerSignal" | "owner">,
  deps: DependencyList = [],
): NSETreeController<T, TId> {
  return useOwnedController(
    (ownerSignal) => new NSETreeController({ ...options, ownerSignal }),
    [options.id, options.responderId, ...deps],
  );
}
