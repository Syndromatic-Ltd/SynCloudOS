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
import { observableVersion, type NSEObservable } from "./observable";

const stopNothing = (): void => undefined;

/**
 * Re-renders the calling component whenever `object` changes, and returns the
 * object so a view can read it directly:
 *
 * ```tsx
 * const notes = useObserve(controller.app.notes);
 * ```
 *
 * Works for `NSEObject`s and for every `NSEController`. A view hosted as a
 * controller's `static view` already observes its own controller; call this
 * for any other object the view reads. Pass `null` or `undefined` to observe
 * nothing.
 */
export function useObserve<T extends NSEObservable>(object: T): T;
export function useObserve<T extends NSEObservable>(object: T | null | undefined): T | null | undefined;
export function useObserve<T extends NSEObservable>(object: T | null | undefined): T | null | undefined {
  const subscribe = useCallback((listener: () => void): (() => void) => {
    if (!object) return stopNothing;
    const stop = object.subscribe(listener);
    return typeof stop === "function" ? (stop as () => void) : stopNothing;
  }, [object]);
  // The state React compares is the object's own snapshot together with its
  // change count, so an `@observable` write is seen even by an object whose
  // `getSnapshot()` returns a snapshot of something else.
  const last = useRef<{ readonly object: object; readonly version: number; readonly snapshot: unknown; readonly state: object } | null>(null);
  const getState = useCallback((): object | undefined => {
    if (!object) return undefined;
    const version = observableVersion(object);
    const snapshot = object.getSnapshot();
    const cached = last.current;
    if (cached && cached.object === object && cached.version === version && Object.is(cached.snapshot, snapshot)) return cached.state;
    const state = {};
    last.current = { object, version, snapshot, state };
    return state;
  }, [object]);
  useSyncExternalStore(subscribe, getState, getState);
  return object;
}
