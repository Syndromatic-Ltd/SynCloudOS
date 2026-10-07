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

import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";
import type { ActiveResponderAnchors, ResponderGraph, ResponderRegistration, ResponderRegistrationHandle, ResponderResolution } from "./responderTypes";

export class ResponderGraphError extends Error {
  constructor(readonly code: "duplicate" | "cycle" | "cross-runtime" | "live-children", readonly responderId: string, message: string) {
    super(message);
    this.name = "ResponderGraphError";
  }
}

export function createResponderGraph(options: {
  readonly runtimeId: SynCloudOSRuntimeId;
  getFocusedResponderId(): string | null;
  getActiveAnchors(): ActiveResponderAnchors;
  getActiveModalScope?(): { readonly scopeId: string; readonly parentResponderId: string; isScopeWithin?(scopeId: string): boolean } | null;
  onRemoved?(ids: readonly string[]): void;
}): ResponderGraph {
  const registrations = new Map<string, ResponderRegistration>();
  const registrationTokens = new Map<string, number>();
  const listeners = new Set<() => void>();
  const synchronousListeners = new Set<() => void>();
  const pendingListeners = new Set<() => void>();
  const diagnostics: Array<{ code: string; responderId: string; detail: string }> = [];
  let generation = 0;
  let lastResolution: string[] = [];
  let disposed = false;
  let notificationScheduled = false;

  // ResponderScope registers during useInsertionEffect so a descendant
  // FocusScope can resolve its parent in the same commit. Subscriber
  // callbacks may update React stores, though, and React forbids those
  // updates while insertion effects are running. Preserve synchronous graph
  // state while moving observer work to the next microtask.
  const notify = () => {
    for (const listener of listeners) pendingListeners.add(listener);
    if (notificationScheduled) return;
    notificationScheduled = true;
    queueMicrotask(() => {
      notificationScheduled = false;
      const listenersToNotify = [...pendingListeners];
      pendingListeners.clear();
      for (const listener of listenersToNotify) {
        try { listener(); } catch { /* responder subscribers are isolated */ }
      }
    });
  };

  // A small set of kernel authority observers needs the responder-removal
  // boundary immediately after the graph state changes. These observers must
  // not publish React-facing state from insertion effects, so they are
  // deliberately separate from the deferred public subscriber queue above.
  const notifySynchronously = () => {
    for (const listener of synchronousListeners) {
      try { listener(); } catch { /* authority teardown remains best effort */ }
    }
  };

  const wouldCycle = (candidate: ResponderRegistration) => {
    let current: string | undefined = candidate.parentId;
    const visited = new Set([candidate.id]);
    while (current) {
      if (visited.has(current)) return true;
      visited.add(current);
      current = (current === candidate.id ? candidate : registrations.get(current))?.parentId;
    }
    return false;
  };

  const isEnabled = (id: string) => {
    const record = registrations.get(id);
    if (!record) return false;
    try { return record.enabled?.() ?? true; } catch { return false; }
  };

  const remove = (id: string, removeOptions: { readonly cascade?: boolean } = {}) => {
    if (!registrations.has(id)) return false;
    const children = Array.from(registrations.values()).filter((record) => record.parentId === id).map((record) => record.id);
    if (children.length > 0 && !removeOptions.cascade) {
      throw new ResponderGraphError("live-children", id, `Responder ${id} still has live children.`);
    }
    const removed: string[] = [];
    const visit = (target: string) => {
      for (const child of Array.from(registrations.values()).filter((record) => record.parentId === target)) visit(child.id);
      if (registrations.delete(target)) removed.push(target);
    };
    visit(id);
    generation += 1;
    options.onRemoved?.(removed);
    for (const target of removed) registrationTokens.delete(target);
    notifySynchronously();
    notify();
    return true;
  };

  const graph: ResponderGraph = {
    runtimeId: options.runtimeId,
    get generation() { return generation; },
    register(registration): ResponderRegistrationHandle {
      if (disposed) throw new Error("Responder graph is disposed.");
      if (registration.runtimeId && registration.runtimeId !== options.runtimeId) {
        throw new ResponderGraphError("cross-runtime", registration.id, `Responder ${registration.id} belongs to another runtime.`);
      }
      if (registrations.has(registration.id)) throw new ResponderGraphError("duplicate", registration.id, `Responder ${registration.id} is already registered.`);
      if (wouldCycle(registration)) throw new ResponderGraphError("cycle", registration.id, `Responder ${registration.id} would create a cycle.`);
      registrations.set(registration.id, { ...registration, runtimeId: options.runtimeId });
      if (wouldCycle(registration)) {
        registrations.delete(registration.id);
        throw new ResponderGraphError("cycle", registration.id, `Responder ${registration.id} would create a cycle.`);
      }
      generation += 1;
      const registrationToken = generation;
      registrationTokens.set(registration.id, registrationToken);
      notify();
      let live = true;
      return {
        id: registration.id,
        dispose(disposeOptions) {
          if (!live) return false;
          if (registrationTokens.get(registration.id) !== registrationToken) {
            live = false;
            return false;
          }
          const result = remove(registration.id, disposeOptions);
          if (result) live = false;
          return result;
        },
      };
    },
    remove,
    has: (id) => registrations.has(id),
    get(id) {
      const record = registrations.get(id);
      return record ? { id: record.id, kind: record.kind, parentId: record.parentId ?? null, scopeId: record.scopeId, undoOwner: record.undoOwner, diagnosticsLabel: record.diagnosticsLabel } : null;
    },
    isEnabled,
    resolveChain(startId) {
      const result: ResponderResolution[] = [];
      const visited = new Set<string>();
      const modal = options.getActiveModalScope?.() ?? null;
      const modalAncestry = new Set<string>();
      if (modal) {
        let current: string | undefined = modal.parentResponderId;
        while (current && !modalAncestry.has(current)) {
          modalAncestry.add(current);
          current = registrations.get(current)?.parentId;
        }
      }
      const append = (initial: string | null | undefined) => {
        let current = initial ?? undefined;
        const path = new Set<string>();
        while (current) {
          if (path.has(current)) {
            diagnostics.push({ code: "cycle", responderId: current, detail: `Cycle encountered at ${current}.` });
            break;
          }
          if (visited.has(current)) break;
          path.add(current);
          visited.add(current);
          const record = registrations.get(current);
          if (!record) {
            diagnostics.push({ code: "missing-parent", responderId: current, detail: `Responder ${current} is not registered.` });
            break;
          }
          const allowedByModal = !modal || record.scopeId === modal.scopeId || modal.isScopeWithin?.(record.scopeId) || modalAncestry.has(record.id);
          if (allowedByModal && isEnabled(current)) result.push({ id: record.id, kind: record.kind, parentId: record.parentId ?? null, scopeId: record.scopeId, undoOwner: record.undoOwner, diagnosticsLabel: record.diagnosticsLabel });
          current = record.parentId;
        }
      };
      append(startId ?? options.getFocusedResponderId());
      const anchors = options.getActiveAnchors();
      append(anchors.documentResponderId);
      append(anchors.windowResponderId);
      append(anchors.applicationResponderId);
      append(anchors.workspaceResponderId);
      append(anchors.webspringResponderId);
      append(anchors.runtimeResponderId);
      lastResolution = result.map(({ id }) => id);
      diagnostics.splice(0, Math.max(0, diagnostics.length - 80));
      return result;
    },
    getGeneration: () => generation,
    getRegistrationToken(id) {
      const token = registrationTokens.get(id);
      return token === undefined ? null : Object.freeze({ id, generation: token });
    },
    subscribe(listener) {
      listeners.add(listener);
      let live = true;
      return () => { if (!live) return; live = false; listeners.delete(listener); };
    },
    inspect: () => ({ generation, registrations: Array.from(registrations.keys()).map((id) => graph.get(id)!), lastResolution: [...lastResolution], diagnostics: [...diagnostics] }),
    dispose() { disposed = true; registrations.clear(); registrationTokens.clear(); generation += 1; options.onRemoved?.([]); notifySynchronously(); notify(); listeners.clear(); synchronousListeners.clear(); },
  };
  Object.defineProperty(graph, "subscribeSynchronously", {
    enumerable: false,
    value(listener: () => void) {
      synchronousListeners.add(listener);
      let live = true;
      return () => { if (!live) return; live = false; synchronousListeners.delete(listener); };
    },
  });
  // These are internal authority hooks used by transfer/runtime coordination;
  // keep them out of the public responder surface and compatibility snapshots.
  Object.defineProperty(graph, "getRegistrationToken", { enumerable: false });
  Object.defineProperty(graph, "subscribe", { enumerable: false });
  return graph;
}
