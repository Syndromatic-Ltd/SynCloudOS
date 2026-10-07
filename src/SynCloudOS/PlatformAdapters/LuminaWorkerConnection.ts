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

import type { LuminaWorkerRequest, LuminaWorkerResponse } from "../HostServices/PlatformAdapterRuntimePorts";

/** The worker transport one Lumina backend session uses. */
export interface LuminaWorkerChannel {
  /** A request ID unique on this channel's worker. */
  nextId(): number;
  post(message: LuminaWorkerRequest): void;
  subscribe(onMessage: (event: MessageEvent<LuminaWorkerResponse>) => void, onError: (event: ErrorEvent) => void): () => void;
  /** Ends this session. `disposeOwner` is sent when no other session still
   * uses the owner; a channel that owns its worker terminates it. */
  close(disposeOwner: LuminaWorkerRequest): void;
}

/** A channel over a worker used by exactly one session. */
export function createExclusiveLuminaWorkerChannel(worker: Worker): LuminaWorkerChannel {
  let sequence = 0;
  let closed = false;
  let failure: Error | null = null;
  // An uncaught worker error ends the worker's lifetime: later requests
  // receive that failure and the worker is terminated at once.
  worker.addEventListener("error", ((event: ErrorEvent) => {
    if (failure) return;
    failure = event.error instanceof Error ? event.error : new Error(event.message || "Lumina worker failed.");
    worker.terminate();
  }) as EventListener);
  return {
    nextId: () => ++sequence,
    post: (message) => {
      if (failure) throw failure;
      worker.postMessage(message);
    },
    subscribe(onMessage, onError) {
      worker.addEventListener("message", onMessage as EventListener);
      worker.addEventListener("error", onError as EventListener);
      return () => {
        worker.removeEventListener("message", onMessage as EventListener);
        worker.removeEventListener("error", onError as EventListener);
      };
    },
    close(disposeOwner) {
      if (closed) return;
      closed = true;
      if (!failure) {
        try { worker.postMessage(disposeOwner); } catch { /* worker already gone */ }
      }
      worker.terminate();
    },
  };
}

interface SharedWorkerRecord {
  readonly worker: Worker;
  readonly owners: Map<string, number>;
  sequence: number;
  sessions: number;
  failed: boolean;
  /** The error that failed the worker, returned to later requests. */
  failure: Error | null;
  terminated: boolean;
  idleTimer: unknown;
  /** Invalidates a scheduled idle retirement that was superseded. */
  idleGeneration: number;
}

export interface LuminaWorkerConnectionOptions {
  readonly createWorker: () => Worker;
  /** Delay before an unused worker is terminated. Without host timers an
   * unused worker is terminated as soon as its last session closes. */
  readonly idleMilliseconds?: number;
  readonly setTimeout?: (callback: () => void, delay: number) => unknown;
  readonly clearTimeout?: (handle: unknown) => void;
}

/**
 * One Lumina index worker shared by every session a backend factory creates.
 * The worker already multiplexes owners by database and owner key; sharing it
 * removes a worker start (and its thread and module evaluation) per index
 * session. Request IDs are allocated per worker so replies route to the right
 * session. An owner's worker-side backend and hydrated index are released when
 * its last session closes; the worker is terminated after all sessions close
 * and an idle delay passes, or immediately once it has failed. A failed
 * worker is terminated at once and never handed to new sessions; sessions
 * still open on it receive its failure for every later request.
 */
export class LuminaWorkerConnection {
  readonly #options: LuminaWorkerConnectionOptions;
  readonly #idleMilliseconds: number;
  #current: SharedWorkerRecord | null = null;
  #disposed = false;

  constructor(options: LuminaWorkerConnectionOptions) {
    if (typeof options?.createWorker !== "function") throw new TypeError("Lumina worker connection requires a worker factory.");
    this.#options = options;
    this.#idleMilliseconds = options.setTimeout && options.clearTimeout ? options.idleMilliseconds ?? 30_000 : 0;
    if (!Number.isSafeInteger(this.#idleMilliseconds) || this.#idleMilliseconds < 0) throw new RangeError("Lumina worker idle delay must be a nonnegative safe integer.");
  }

  get workerStarted(): boolean { return this.#current !== null; }

  channel(databaseName: string, ownerKey: string): LuminaWorkerChannel {
    if (this.#disposed) throw new DOMException("Lumina worker connection is disposed.", "AbortError");
    const record = this.#record();
    const identity = `${databaseName}\u0000${ownerKey}`;
    record.sessions += 1;
    record.owners.set(identity, (record.owners.get(identity) ?? 0) + 1);
    let closed = false;
    return {
      nextId: () => ++record.sequence,
      post: (message) => {
        if (record.failure) throw record.failure;
        record.worker.postMessage(message);
      },
      subscribe(onMessage, onError) {
        record.worker.addEventListener("message", onMessage as EventListener);
        record.worker.addEventListener("error", onError as EventListener);
        return () => {
          record.worker.removeEventListener("message", onMessage as EventListener);
          record.worker.removeEventListener("error", onError as EventListener);
        };
      },
      close: (disposeOwner) => {
        if (closed) return;
        closed = true;
        const remaining = (record.owners.get(identity) ?? 1) - 1;
        if (remaining > 0) record.owners.set(identity, remaining);
        else {
          record.owners.delete(identity);
          if (!record.failed) {
            try { record.worker.postMessage(disposeOwner); } catch { /* worker already gone */ }
          }
        }
        record.sessions -= 1;
        if (record.sessions === 0) this.#retire(record);
      },
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const record = this.#current;
    this.#current = null;
    if (record) this.#terminate(record);
  }

  #record(): SharedWorkerRecord {
    const current = this.#current;
    if (current && !current.failed) {
      current.idleGeneration += 1;
      if (current.idleTimer !== null) {
        this.#options.clearTimeout?.(current.idleTimer);
        current.idleTimer = null;
      }
      return current;
    }
    const record: SharedWorkerRecord = { worker: this.#options.createWorker(), owners: new Map(), sequence: 0, sessions: 0, failed: false, failure: null, terminated: false, idleTimer: null, idleGeneration: 0 };
    record.worker.addEventListener("error", (event) => {
      record.failed = true;
      record.failure = event.error instanceof Error ? event.error : new Error(event.message || "Lumina worker failed.");
      if (this.#current === record) this.#current = null;
      // Every channel on this worker now fails its later requests, so no
      // session still needs it.
      this.#terminate(record);
    });
    this.#current = record;
    return record;
  }

  #retire(record: SharedWorkerRecord): void {
    if (record.failed || this.#current !== record || this.#idleMilliseconds === 0) {
      if (this.#current === record) this.#current = null;
      this.#terminate(record);
      return;
    }
    const generation = ++record.idleGeneration;
    record.idleTimer = this.#options.setTimeout!(() => {
      if (record.idleGeneration !== generation) return;
      record.idleTimer = null;
      if (record.sessions !== 0) return;
      if (this.#current === record) this.#current = null;
      this.#terminate(record);
    }, this.#idleMilliseconds);
  }

  #terminate(record: SharedWorkerRecord): void {
    if (record.terminated) return;
    record.terminated = true;
    record.idleGeneration += 1;
    if (record.idleTimer !== null) {
      this.#options.clearTimeout?.(record.idleTimer);
      record.idleTimer = null;
    }
    record.worker.terminate();
  }
}
