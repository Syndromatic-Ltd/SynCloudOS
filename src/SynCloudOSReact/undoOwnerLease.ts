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

import type { SynCloudOSRuntime, UndoManager, UndoOwner } from "../SynCloudOS/SynCloudOS";

interface UndoOwnerLeaseEntry {
  count: number;
  readonly manager: UndoManager;
  readonly removeOnZero: boolean;
}

const runtimeLeases = new WeakMap<object, Map<string, UndoOwnerLeaseEntry>>();

export function retainUndoOwner(runtime: SynCloudOSRuntime, owner: UndoOwner) {
  const leases = runtimeLeases.get(runtime) ?? new Map<string, UndoOwnerLeaseEntry>();
  runtimeLeases.set(runtime, leases);
  const key = `${owner.kind}\u0000${owner.id}`;
  const existingEntry = leases.get(key);
  const existingManager = runtime.undo.get(owner);
  const entry = existingEntry ?? {
    count: 0,
    manager: existingManager ?? runtime.undo.create(owner),
    removeOnZero: existingManager === null,
  };
  entry.count += 1;
  leases.set(key, entry);
  let live = true;
  return {
    manager: entry.manager,
    release() {
      if (!live) return;
      live = false;
      entry.count -= 1;
      queueMicrotask(() => {
        if (entry.count !== 0) return;
        leases.delete(key);
        if (entry.removeOnZero && runtime.undo.get(owner) === entry.manager) runtime.undo.remove(owner);
        if (leases.size === 0) runtimeLeases.delete(runtime);
      });
    },
  };
}
