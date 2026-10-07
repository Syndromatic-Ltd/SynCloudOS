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
  SynCloudOSRuntimeEvent,
  SynCloudOSRuntimeEventListener,
} from "./eventTypes";
import type {
  SynCloudOSEventBus,
  SynCloudOSRuntimeId,
} from "../Runtime/runtimeInstanceTypes";
import type { RuntimeDiagnosticLog } from "../Diagnostics/RuntimeDiagnosticLog";
import { createRuntimeDiagnostics } from "../Diagnostics/runtimeDiagnostics";

export interface SynCloudOSRuntimeEventListenerFailure {
  event: SynCloudOSRuntimeEvent;
  error: unknown;
  listenerIndex: number;
  listenerKind: "typed" | "wildcard";
}

type SynCloudOSRuntimeEventFailureReporter = (failure: SynCloudOSRuntimeEventListenerFailure) => void;

export interface EventBusFactoryOptions {
  readonly runtimeId: SynCloudOSRuntimeId;
  now(): number;
  readonly randomUUID?: () => string;
  readonly historyLimit?: number;
  /** Runtime-owned bounded history; a private log is created when omitted. */
  readonly history?: RuntimeDiagnosticLog<SynCloudOSRuntimeEvent>;
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : String(error);
}

export function createEventBus({
  runtimeId,
  now,
  randomUUID = () => Math.random().toString(16).slice(2),
  historyLimit = 240,
  history = createRuntimeDiagnostics({ eventHistoryLimit: historyLimit }).events,
}: EventBusFactoryOptions): SynCloudOSEventBus & {
  clearHistory(): void;
  setFailureReporter(reporter: SynCloudOSRuntimeEventFailureReporter | null): void;
} {
  const listeners = new Map<string, Set<SynCloudOSRuntimeEventListener>>();
  let failureReporter: SynCloudOSRuntimeEventFailureReporter | null = null;
  let reporting = false;
  let disposed = false;

  const notify = (event: SynCloudOSRuntimeEvent) => {
    const typed = Array.from(listeners.get(event.type) ?? []);
    const wildcard = Array.from(listeners.get("*") ?? []);
    [...typed, ...wildcard].forEach((listener, index) => {
      try {
        listener(event);
      } catch (error) {
        const failure: SynCloudOSRuntimeEventListenerFailure = {
          event,
          error,
          listenerIndex: index,
          listenerKind: index < typed.length ? "typed" : "wildcard",
        };
        const failureEvent: SynCloudOSRuntimeEvent = {
          runtimeId,
          id: `${runtimeId}:event:${randomUUID()}`,
          type: "runtime.event.listener.failed",
          at: now(),
          payload: { eventId: event.id, eventType: event.type, error: errorMessage(error) },
        };
        history.append(failureEvent);
        if (failureReporter && !reporting && event.type !== "error.capture") {
          try {
            reporting = true;
            failureReporter(failure);
          } finally {
            reporting = false;
          }
        }
      }
    });
  };

  const eventBus: SynCloudOSEventBus & {
    clearHistory(): void;
    setFailureReporter(reporter: SynCloudOSRuntimeEventFailureReporter | null): void;
  } = {
    runtimeId,
    publish(type, payload, label) {
      const event: SynCloudOSRuntimeEvent = {
        runtimeId,
        id: `${runtimeId}:event:${randomUUID()}`,
        type,
        label,
        at: now(),
        payload,
      };
      // History is diagnostic data outside the reactive snapshot: recording
      // an event does not publish runtime state.
      history.append(event);
      if (!disposed) notify(event);
      return event;
    },
    subscribe(type, listener) {
      const bucket = listeners.get(type) ?? new Set<SynCloudOSRuntimeEventListener>();
      bucket.add(listener);
      listeners.set(type, bucket);
      return () => {
        bucket.delete(listener);
        if (bucket.size === 0) listeners.delete(type);
      };
    },
    once(type, listener) {
      let unsubscribe: () => void = () => undefined;
      unsubscribe = eventBus.subscribe(type, (event) => {
        unsubscribe();
        listener(event);
      });
      return unsubscribe;
    },
    unsubscribe(type, listener) {
      return listeners.get(type)?.delete(listener) ?? false;
    },
    getHistory(limit) {
      return history.entries(limit);
    },
    clearHistory() {
      history.clear();
    },
    setFailureReporter(reporter) {
      failureReporter = reporter;
    },
    dispose() {
      disposed = true;
      listeners.clear();
      failureReporter = null;
    },
  };
  return eventBus;
}
