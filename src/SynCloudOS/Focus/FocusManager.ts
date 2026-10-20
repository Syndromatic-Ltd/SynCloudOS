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

import type { ResponderGraph } from "../Responders/responderTypes";
import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";
import type { FocusCloseResult, FocusManager, FocusScopeHandle, FocusScopeRegistration } from "./focusTypes";

export class FocusScopeError extends Error { constructor(message: string) { super(message); this.name = "FocusScopeError"; } }

export function createFocusManager(options: { readonly runtimeId: SynCloudOSRuntimeId; readonly responders: ResponderGraph }): FocusManager {
  const scopes = new Map<string, Omit<FocusScopeRegistration, "restoreResponderId"> & { restoreResponderId: string | null }>();
  const stack: string[] = [];
  const restorations: Array<{ scopeId: string; responderId: string | null }> = [];
  const listeners = new Set<() => void>();
  let anchors = {};
  let focusedResponderId: string | null = null;
  let generation = 0;
  let disposed = false;
  let notificationQueued = false;

  // Focus scopes can change during React commits. Keep authority synchronous,
  // but defer presentation observers until the mutation has completed.
  const publish = () => {
    if (notificationQueued || disposed) return;
    notificationQueued = true;
    queueMicrotask(() => {
      notificationQueued = false;
      if (disposed) return;
      for (const listener of listeners) listener();
    });
  };

  const isScopeWithin = (scopeId: string, ancestorScopeId: string) => {
    let current = scopes.get(scopeId);
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      if (current.id === ancestorScopeId) return true;
      visited.add(current.id);
      current = current.parentScopeId ? scopes.get(current.parentScopeId) : undefined;
    }
    return false;
  };
  const activeModal = () => [...stack].reverse().map((id) => scopes.get(id)).find((scope) => scope?.modal);
  const allowedByModal = (responderId: string) => {
    const modal = activeModal();
    if (!modal) return true;
    const responder = options.responders.get(responderId);
    return Boolean(responder && (isScopeWithin(responder.scopeId, modal.id) || responderId === modal.parentResponderId));
  };
  const nearestLive = (responderId: string | null | undefined) => {
    let current = responderId ? options.responders.get(responderId) : null;
    while (current) {
      if (options.responders.isEnabled(current.id) && allowedByModal(current.id)) return current.id;
      current = current.parentId ? options.responders.get(current.parentId) : null;
    }
    const runtimeId = (anchors as { runtimeResponderId?: string }).runtimeResponderId ?? "runtime";
    return options.responders.isEnabled(runtimeId) && allowedByModal(runtimeId) ? runtimeId : null;
  };

  const manager: FocusManager = {
    runtimeId: options.runtimeId,
    openScope(registration): FocusScopeHandle {
      if (disposed) throw new FocusScopeError("Focus manager is disposed.");
      if (scopes.has(registration.id)) throw new FocusScopeError(`Focus scope ${registration.id} is already open.`);
      if (!options.responders.has(registration.parentResponderId)) throw new FocusScopeError(`Parent responder ${registration.parentResponderId} is not registered.`);
      if (registration.parentScopeId && !scopes.has(registration.parentScopeId)) throw new FocusScopeError(`Parent focus scope ${registration.parentScopeId} is not open.`);
      scopes.set(registration.id, { ...registration, restoreResponderId: registration.restoreResponderId ?? focusedResponderId });
      stack.push(registration.id);
      generation += 1;
      publish();
      let live = true;
      const close = (closeOptions?: { restore?: boolean }) => {
        if (!live) return { status: "missing", scopeId: registration.id, restoredResponderId: null } as const;
        const result = manager.closeScope(registration.id, closeOptions);
        if (result.status === "closed") live = false;
        return result;
      };
      return { id: registration.id, close, dispose: () => close() };
    },
    requestFocus(responderId) {
      if (!options.responders.has(responderId)) return { status: "missing", responderId, reason: "The responder is no longer registered." };
      if (!options.responders.isEnabled(responderId)) return { status: "disabled", responderId, reason: "Disabled controls cannot become responders." };
      if (!allowedByModal(responderId)) return { status: "blocked", responderId, reason: "The active modal scope contains focus." };
      focusedResponderId = responderId;
      generation += 1;
      publish();
      return { status: "focused", responderId };
    },
    closeScope(scopeId, closeOptions = {}): FocusCloseResult {
      const scope = scopes.get(scopeId);
      if (!scope) return { status: "missing", scopeId, restoredResponderId: null };
      const closingScopes = new Set(stack.filter((candidate) => candidate === scopeId || isScopeWithin(candidate, scopeId)));
      for (const candidate of [...stack].reverse()) if (closingScopes.has(candidate)) scopes.delete(candidate);
      for (let index = stack.length - 1; index >= 0; index -= 1) if (closingScopes.has(stack[index]!)) stack.splice(index, 1);
      const restorationTarget = scope.restoreResponderId && options.responders.has(scope.restoreResponderId)
        ? scope.restoreResponderId
        : scope.parentResponderId;
      const restoredResponderId = closeOptions.restore === false ? null : nearestLive(restorationTarget);
      if (restoredResponderId) focusedResponderId = restoredResponderId;
      else if (focusedResponderId && !allowedByModal(focusedResponderId)) focusedResponderId = nearestLive(scope.parentResponderId);
      restorations.push({ scopeId, responderId: restoredResponderId });
      restorations.splice(0, Math.max(0, restorations.length - 80));
      generation += 1;
      publish();
      return { status: "closed", scopeId, restoredResponderId };
    },
    isScopeWithin,
    setActiveAnchors(next) { anchors = { ...next }; generation += 1; publish(); },
    getActiveAnchors: () => ({ ...anchors }),
    getFocusedResponderId: () => focusedResponderId,
    getGeneration: () => generation,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    inspect: () => ({ generation, focusedResponderId, scopes: stack.map((id) => scopes.get(id)!).map(({ restoreResponderId: _, ...scope }) => scope), restorations: [...restorations] }),
    handleRespondersRemoved(ids) {
      if (ids.includes(focusedResponderId ?? "")) focusedResponderId = nearestLive((anchors as { runtimeResponderId?: string }).runtimeResponderId ?? "runtime");
      generation += 1;
      publish();
    },
    dispose() { disposed = true; scopes.clear(); stack.length = 0; focusedResponderId = null; generation += 1; listeners.clear(); },
  };
  return manager;
}
