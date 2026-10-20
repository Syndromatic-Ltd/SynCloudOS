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

import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";
import type { ResponderGraph } from "../Responders/responderTypes";
import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";
import { createUndoManager } from "./UndoManager";
import type { UndoManagerCreateOptions, UndoManagerRegistry, UndoOwner } from "./undoTypes";

const ownerKey = (owner: UndoOwner) => `${owner.kind}\u0000${owner.kind === "application" ? normalizeBundleIdentifier(owner.id) : owner.id}`;

export function createUndoManagerRegistry(options: {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly responders: ResponderGraph;
  readonly maxEntries?: number;
  readonly maxEstimatedBytes?: number;
  readonly randomUUID?: () => string;
  readonly observeListenerError?: (error: unknown) => void;
}): UndoManagerRegistry {
  const managers = new Map<string, ReturnType<typeof createUndoManager>>();
  let disposed = false;
  return {
    runtimeId: options.runtimeId,
    create(owner, createOptions: UndoManagerCreateOptions = {}) {
      if (disposed) throw new Error("Undo registry is disposed.");
      const key = ownerKey(owner);
      const existing = managers.get(key);
      if (existing) return existing;
      const manager = createUndoManager({
        runtimeId: options.runtimeId,
        owner,
        maxEntries: createOptions.maxEntries ?? options.maxEntries ?? 100,
        maxEstimatedBytes: createOptions.maxEstimatedBytes ?? options.maxEstimatedBytes,
        randomUUID: options.randomUUID,
        observeListenerError: options.observeListenerError,
      });
      managers.set(key, manager);
      return manager;
    },
    get: (owner) => managers.get(ownerKey(owner)) ?? null,
    remove(owner) { const manager = managers.get(ownerKey(owner)); if (!manager) return false; manager.dispose(); managers.delete(ownerKey(owner)); return true; },
    resolveForResponder(chain) {
      for (const responder of chain ?? options.responders.resolveChain()) {
        if (!responder.undoOwner) continue;
        const manager = managers.get(ownerKey(responder.undoOwner));
        if (manager) return manager;
      }
      return null;
    },
    inspect: () => Array.from(managers.values(), (manager) => manager.inspect()),
    dispose() { disposed = true; for (const manager of managers.values()) manager.dispose(); managers.clear(); },
  };
}
