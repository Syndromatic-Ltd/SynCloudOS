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

import type { OperationCoordinator, PresentationSettlementCoordinator } from "../Operations/operationTypes";
import { waitForSettlement } from "./waitForSettlement";
import type {
  SettlementExclusionHandle,
  SettlementProducer,
  SettlementRegistry,
  SettlementRegistryOptions,
  SettlementTerminalRecord,
  SettlementWorkDescriptor,
  SettlementWorkHandle,
  SettlementWorkInput,
} from "./settlementTypes";

function freezeDescriptor(value: SettlementWorkDescriptor): SettlementWorkDescriptor {
  return Object.freeze({ ...value });
}

export function createSettlementRegistry(options: SettlementRegistryOptions): SettlementRegistry {
  const active = new Map<string, SettlementWorkDescriptor>();
  const excluded = new Map<string, SettlementWorkDescriptor>();
  const producers = new Map<string, { producer: SettlementProducer; unsubscribe: () => void }>();
  const listeners = new Set<() => void>();
  const history: SettlementTerminalRecord[] = [];
  const historyLimit = Math.max(1, options.historyLimit ?? 128);
  let serial = 0;
  let revision = 0;
  let disposed = false;

  const notify = () => {
    revision += 1;
    for (const listener of [...listeners]) {
      try { listener(); } catch { /* Settlement observers are diagnostic only. */ }
    }
  };
  const descriptor = (input: SettlementWorkInput, suffix: string): SettlementWorkDescriptor => freezeDescriptor({
    id: String(options.runtimeId) + ":settlement:" + suffix + ":" + String(++serial),
    owner: input.owner,
    kind: input.kind,
    label: input.label,
    ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
    startedAt: options.now(),
  });
  const pendingSnapshot = () => {
    const values = [...active.values()];
    for (const { producer } of producers.values()) {
      try {
        for (const item of producer.inspect()) values.push(freezeDescriptor(item));
      } catch (error) {
        values.push(freezeDescriptor({
          id: String(options.runtimeId) + ":producer:" + producer.id + ":inspection-error",
          owner: producer.id,
          kind: "inspection-error",
          label: error instanceof Error ? error.message : String(error),
        }));
      }
    }
    return values.sort((a, b) => a.id.localeCompare(b.id));
  };
  const terminal = (item: SettlementWorkDescriptor, status: SettlementTerminalRecord["status"], reason?: string) => {
    history.push(Object.freeze({
      ...item,
      status,
      endedAt: options.now(),
      ...(reason === undefined ? {} : { reason }),
    }));
    while (history.length > historyLimit) history.shift();
  };
  const finish = (id: string, status: SettlementTerminalRecord["status"], reason?: string) => {
    const item = active.get(id);
    if (!item) return false;
    active.delete(id);
    terminal(item, status, reason);
    notify();
    return true;
  };

  const registry: SettlementRegistry = {
    runtimeId: options.runtimeId,
    begin(input): SettlementWorkHandle {
      if (disposed) throw new Error("Settlement registry is disposed.");
      const item = descriptor(input, "work");
      active.set(item.id, item);
      notify();
      return Object.freeze({
        id: item.id,
        complete: () => finish(item.id, "completed"),
        cancel: (reason = "cancelled") => finish(item.id, "cancelled", reason),
        fail: (error: unknown) => finish(item.id, "failed", error instanceof Error ? error.message : String(error)),
      });
    },
    exclude(input): SettlementExclusionHandle {
      if (disposed) throw new Error("Settlement registry is disposed.");
      const item = descriptor(input, "excluded");
      excluded.set(item.id, item);
      notify();
      return Object.freeze({
        id: item.id,
        release: () => {
          if (!excluded.delete(item.id)) return false;
          notify();
          return true;
        },
      });
    },
    registerProducer(producer) {
      if (disposed) throw new Error("Settlement registry is disposed.");
      if (producers.has(producer.id)) throw new Error("Settlement producer already registered: " + producer.id);
      const unsubscribe = producer.subscribe(notify);
      if (disposed) {
        unsubscribe();
        throw new Error("Settlement registry was disposed during producer registration.");
      }
      producers.set(producer.id, { producer, unsubscribe });
      notify();
      let removed = false;
      return () => {
        if (removed) return;
        removed = true;
        const entry = producers.get(producer.id);
        if (entry?.producer === producer) {
          producers.delete(producer.id);
          try { entry.unsubscribe(); } finally { notify(); }
        }
      };
    },
    getState() {
      const pending = pendingSnapshot();
      const recent = [...history];
      for (const { producer } of producers.values()) {
        if (producer.inspectRecent) recent.push(...producer.inspectRecent().map(item => Object.freeze({ ...item })));
      }
      return Object.freeze({
        runtimeId: options.runtimeId,
        ...(disposed ? { disposed: true } : {}),
        revision,
        status: pending.length ? "pending" as const : "settled" as const,
        pending: Object.freeze(pending),
        excluded: Object.freeze([...excluded.values()].sort((a, b) => a.id.localeCompare(b.id))),
        recent: Object.freeze(recent.sort((a, b) => a.endedAt - b.endedAt || a.id.localeCompare(b.id)).slice(-historyLimit)),
      });
    },
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    settled({ timeoutMs, signal }) {
      return waitForSettlement(registry, options, { timeoutMs, signal });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of producers.values()) {
        try { entry.unsubscribe(); } catch { /* Continue producer teardown. */ }
      }
      producers.clear();
      for (const item of active.values()) terminal(item, "cancelled", "runtime-disposed");
      active.clear();
      excluded.clear();
      notify();
      listeners.clear();
    },
  };
  return registry;
}

export function registerOperationCoordinatorSettlement(registry: SettlementRegistry, coordinator: OperationCoordinator): () => void {
  if (registry.runtimeId !== coordinator.runtimeId) throw new Error("Operation settlement source belongs to another runtime.");
  return registry.registerProducer({
    id: "operations",
    inspect: () => coordinator.inspectPending().map(record => ({
      id: record.operationId,
      owner: "operations",
      kind: record.kind,
      label: record.phase,
      correlationId: record.correlationId,
      startedAt: record.startedAt,
    })),
    inspectRecent: () => coordinator.inspectHistory().filter(record => record.endedAt !== undefined).map(record => ({
      id: record.operationId, owner: "operations", kind: record.kind, label: record.phase,
      correlationId: record.correlationId, startedAt: record.startedAt, endedAt: record.endedAt!,
      status: record.status === "cancelled" ? "cancelled" as const
        : record.status === "failed" || record.status === "rolledBack" || record.issues.length ? "failed" as const : "completed" as const,
      ...(record.reason ? { reason: record.reason } : {}),
    })),
    subscribe: listener => coordinator.subscribe(listener),
  });
}

export function registerPresentationSettlement(registry: SettlementRegistry, coordinator: PresentationSettlementCoordinator): () => void {
  if (registry.runtimeId !== coordinator.runtimeId) throw new Error("Presentation settlement source belongs to another runtime.");
  const recent: SettlementTerminalRecord[] = [];
  const observed = new Set<string>();
  return registry.registerProducer({
    id: "presentation",
    inspect: () => coordinator.inspectPending().map(record => ({
      id: record.id,
      owner: "presentation",
      kind: "roles",
      label: record.roles.filter(role => !record.completedRoles.includes(role)).join(","),
    })),
    inspectRecent: () => recent,
    subscribe(listener) {
      let live = true;
      const observe = () => {
        if (!live) return;
        for (const record of coordinator.inspectPending()) {
          const handle = coordinator.get(record.id);
          if (!handle || observed.has(record.id)) continue;
          observed.add(record.id);
          void handle.result.then(result => {
            if (!live) return;
            observed.delete(record.id);
            recent.push(Object.freeze({ id: record.id, owner: "presentation", kind: "roles",
              label: (result.status === "completed" ? result.roles : result.pendingRoles).join(","),
              endedAt: performance.now(), status: result.status === "timed-out" ? "failed" : result.status,
              ...(result.status === "timed-out" ? { reason: "presentation-role-timeout" }
                : result.status === "cancelled" ? { reason: result.reason } : {}),
            }));
            if (recent.length > 128) recent.shift();
            listener();
          });
        }
      };
      const remove = coordinator.subscribe(() => {
        observe();
        // begin() notifies before publishing its handle. Observe that handle at the checkpoint.
        queueMicrotask(observe);
        listener();
      });
      observe();
      return () => { live = false; observed.clear(); remove(); };
    },
  });
}

export type {
  SettlementExclusionHandle,
  SettlementProducer,
  SettlementRegistry,
  SettlementRegistryOptions,
  SettlementResult,
  SettlementState,
  SettlementTerminalRecord,
  SettlementTerminalStatus,
  SettlementWorkDescriptor,
  SettlementWorkHandle,
  SettlementWorkInput,
} from "./settlementTypes";
