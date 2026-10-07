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

import type {
  PresentationSettlementCoordinator,
  PresentationSettlementHandle,
  PresentationSettlementRequest,
  PresentationSettlementResult,
} from "./operationTypes";
import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";

export interface PresentationSettlementCoordinatorOptions {
  readonly runtimeId: SynCloudOSRuntimeId;
  randomUUID(): string;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export function createPresentationSettlementCoordinator(options: PresentationSettlementCoordinatorOptions): PresentationSettlementCoordinator {
  const pending = new Map<string, { operationId: string; roles: string[]; completed: Set<string>; resolve: (result: PresentationSettlementResult) => void; timer: unknown }>();
  const handles = new Map<string, PresentationSettlementHandle>();
  const listeners = new Set<() => void>();
  let disposed = false;
  const notify = () => {
    for (const listener of [...listeners]) {
      try { listener(); } catch { /* Presentation diagnostics are observational. */ }
    }
  };
  return {
    runtimeId: options.runtimeId,
    begin(request: PresentationSettlementRequest) {
      if (disposed) {
        return {
          id: `${options.runtimeId}:presentation:disposed`,
          result: Promise.resolve({ status: "cancelled", reason: "runtime-disposed", pendingRoles: [] }),
          completeRole: () => false,
          cancel: () => undefined,
        };
      }
      const id = `${options.runtimeId}:presentation:${options.randomUUID()}`;
      const roles = Array.from(new Set(request.roles));
      let resolveResult!: (result: PresentationSettlementResult) => void;
      const result = new Promise<PresentationSettlementResult>((resolve) => { resolveResult = resolve; });
      const state = { operationId: request.operationId, roles, completed: new Set<string>(), resolve: resolveResult, timer: null as unknown };
      const finish = (value: PresentationSettlementResult) => {
        if (!pending.has(id)) return;
        if (state.timer !== null) options.clearTimeout(state.timer);
        pending.delete(id);
        handles.delete(id);
        state.resolve(value);
        notify();
      };
      state.timer = options.setTimeout(() => finish({ status: "timed-out", pendingRoles: roles.filter((role) => !state.completed.has(role)) }), Math.max(0, request.timeoutMs));
      pending.set(id, state);
      notify();
      const handle: PresentationSettlementHandle = {
        id,
        result,
        completeRole(role) {
          if (!pending.has(id) || !roles.includes(role) || state.completed.has(role)) return false;
          state.completed.add(role);
          notify();
          if (state.completed.size === roles.length) finish({ status: "completed", roles });
          return true;
        },
        cancel(reason = "cancelled") {
          finish({ status: "cancelled", reason, pendingRoles: roles.filter((role) => !state.completed.has(role)) });
        },
      };
      handles.set(id, handle);
      if (roles.length === 0) finish({ status: "completed", roles });
      return handle;
    },
    get(id) {
      return handles.get(id) ?? null;
    },
    inspect(id) {
      const state = pending.get(id);
      return state
        ? { status: "pending", roles: [...state.roles], completedRoles: [...state.completed] }
        : { status: "settled" };
    },
    inspectPending(id) {
      if (id) {
        const state = pending.get(id);
        return state ? [{ id, operationId: state.operationId, roles: [...state.roles], completedRoles: [...state.completed] }] : [];
      }
      return Array.from(pending, ([pendingId, state]) => ({ id: pendingId, operationId: state.operationId, roles: [...state.roles], completedRoles: [...state.completed] }));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() {
      disposed = true;
      for (const [id, state] of pending) {
        if (state.timer !== null) options.clearTimeout(state.timer);
        state.resolve({ status: "cancelled", reason: "runtime-disposed", pendingRoles: state.roles.filter((role) => !state.completed.has(role)) });
        pending.delete(id);
      }
      handles.clear();
      notify();
      listeners.clear();
    },
  };
}
