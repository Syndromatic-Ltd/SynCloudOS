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

import { SynCloudOSLifecycleRecord } from "../../SynCloudOS/nseRuntimeContracts";
import type {
  NSEOverlayDismissReason,
  NSEOverlayId,
  NSEOverlayManager,
  NSEOverlayRegistration,
  NSEOverlaySnapshot,
} from "./overlayTypes";

function snapshotFor(
  orderedIds: readonly NSEOverlayId[],
  registrations: ReadonlyMap<NSEOverlayId, NSEOverlayRegistration>,
): NSEOverlaySnapshot {
  return Object.freeze({
    orderedIds: Object.freeze([...orderedIds]),
    topmostId: orderedIds.at(-1) ?? null,
    parentById: new Map(orderedIds.map((id) => [id, registrations.get(id)?.parentId ?? null])),
  });
}

function registrationsEqual(left: NSEOverlayRegistration, right: NSEOverlayRegistration): boolean {
  if (
    left === right ||
    (left.id === right.id &&
      left.kind === right.kind &&
      left.parentId === right.parentId &&
      left.anchor === right.anchor &&
      left.surface === right.surface &&
      left.restoreFocus === right.restoreFocus &&
      left.onDismiss === right.onDismiss &&
      left.dismissOn.size === right.dismissOn.size &&
      [...left.dismissOn].every((reason) => right.dismissOn.has(reason)))
  ) return true;
  return false;
}

export function createNSEOverlayManager(): NSEOverlayManager {
  const lifecycle = new SynCloudOSLifecycleRecord({ kind: "NSEOverlayManager" });
  const registrations = new Map<NSEOverlayId, NSEOverlayRegistration>();
  const orderedIds: NSEOverlayId[] = [];
  const listeners = new Set<() => void>();
  let snapshot = snapshotFor(orderedIds, registrations);
  let disposed = false;

  const publish = () => {
    snapshot = snapshotFor(orderedIds, registrations);
    for (const listener of [...listeners]) listener();
  };

  const remove = (id: NSEOverlayId): NSEOverlayRegistration | null => {
    const registration = registrations.get(id) ?? null;
    if (!registration) return null;
    registrations.delete(id);
    const index = orderedIds.indexOf(id);
    if (index >= 0) orderedIds.splice(index, 1);
    return registration;
  };

  const dismissOne = (id: NSEOverlayId): NSEOverlayRegistration | null => remove(id);

  const assertParent = (registration: NSEOverlayRegistration) => {
    if (registration.parentId === registration.id) throw new Error(`NSE overlay "${registration.id}" cannot parent itself.`);
    if (registration.parentId !== null && !registrations.has(registration.parentId)) {
      throw new Error(`NSE overlay parent "${registration.parentId}" is missing for "${registration.id}".`);
    }
    const visited = new Set<NSEOverlayId>([registration.id]);
    let current = registration.parentId;
    while (current !== null) {
      if (visited.has(current)) throw new Error(`NSE overlay parent cycle includes "${registration.id}".`);
      visited.add(current);
      if (visited.size > registrations.size + 1) throw new Error("NSE overlay parent traversal exceeded its registry bound.");
      current = registrations.get(current)?.parentId ?? null;
    }
  };

  const branchIdsFor = (id: NSEOverlayId): NSEOverlayId[] => orderedIds.filter((candidateId) => {
    const visited = new Set<NSEOverlayId>();
    let currentId: NSEOverlayId | null = candidateId;
    while (currentId !== null && visited.size <= registrations.size) {
      if (currentId === id) return true;
      if (visited.has(currentId)) return false;
      visited.add(currentId);
      currentId = registrations.get(currentId)?.parentId ?? null;
    }
    return false;
  }).reverse();

  return {
    getSnapshot: () => snapshot,
    getRegistration: (id) => registrations.get(id) ?? null,
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    register(registration) {
      if (disposed) throw lifecycle.error({ code: "NSE_OVERLAY_MANAGER_DISPOSED", operation: "register" });
      if (registrations.has(registration.id)) {
        throw new Error(`NSE overlay id \"${registration.id}\" is already registered.`);
      }
      assertParent(registration);
      registrations.set(registration.id, registration);
      orderedIds.push(registration.id);
      publish();
      return () => {
        if (!registrations.has(registration.id)) return;
        const descendants = branchIdsFor(registration.id).filter((id) => id !== registration.id)
          .map((id) => ({ id, registration: remove(id) }))
          .filter((entry): entry is { readonly id: NSEOverlayId; readonly registration: NSEOverlayRegistration } => entry.registration !== null);
        remove(registration.id);
        publish();
        for (const descendant of descendants) descendant.registration.onDismiss("parent-dismissed");
      };
    },
    update(registration) {
      if (disposed) return;
      const current = registrations.get(registration.id);
      if (!current || registrationsEqual(current, registration)) return;
      assertParent(registration);
      registrations.set(registration.id, registration);
      publish();
    },
    dismiss(id, reason) {
      if (disposed) return false;
      const registration = dismissOne(id);
      if (!registration) return false;
      publish();
      registration.onDismiss(reason);
      return true;
    },
    dismissBranch(id, reason) {
      if (disposed || !registrations.has(id)) return [];
      const branchIds = branchIdsFor(id);
      const dismissed = branchIds
        .map((branchId) => ({ id: branchId, registration: dismissOne(branchId) }))
        .filter((entry): entry is { readonly id: NSEOverlayId; readonly registration: NSEOverlayRegistration } => entry.registration !== null);
      if (dismissed.length === 0) return [];
      publish();
      for (const { registration } of dismissed) registration.onDismiss(reason);
      return dismissed.map(({ id: dismissedId }) => dismissedId);
    },
    dispose() {
      if (disposed) return;
      lifecycle.markDisposed("explicit");
      disposed = true;
      const dismissed = orderedIds.slice().reverse()
        .map((id) => ({ id, registration: remove(id) }))
        .filter((entry): entry is { readonly id: NSEOverlayId; readonly registration: NSEOverlayRegistration } => entry.registration !== null);
      if (dismissed.length > 0) publish();
      for (const { registration } of dismissed) registration.onDismiss("programmatic");
      listeners.clear();
    },
  };
}
