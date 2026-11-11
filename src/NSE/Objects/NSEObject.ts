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

import { observableVersion, observe, publishObservableChange, type NSEObservable } from "./observable";

/**
 * The small base class for objects whose changes views observe: application,
 * window and view controllers, and the model objects an app defines.
 *
 * It needs no runtime and no arguments. Declare state with `@observable
 * accessor`; call `notifyObservers()` after a change that is not an accessor
 * write (for example, mutating a field the object owns).
 *
 * A subclass that keeps its own immutable snapshot overrides `getSnapshot()`
 * to return it and calls `notifyObservers()` after replacing it; `@observable`
 * accessors never touch the snapshot, they only announce the change.
 */
export class NSEObject<TSnapshot = number> implements NSEObservable {
  /** Calls `listener` after each change. Returns the function that stops listening. */
  readonly subscribe = (listener: () => void): (() => void) => observe(this, listener);

  /** The state `useSyncExternalStore` compares: by default a number that differs after every change. */
  getSnapshot(): TSnapshot {
    return observableVersion(this) as TSnapshot;
  }

  /** Announces a change to everything observing this object. */
  protected notifyObservers(): void {
    publishObservableChange(this);
  }
}
