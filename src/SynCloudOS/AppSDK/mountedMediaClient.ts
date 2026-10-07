/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  createRuntimeOwnedMEFXBlockBuffer,
  type MEFXBlockRuntimeHandle,
  type MEFXBlockRuntimeOwner,
} from "../../FX/MediaFX/MEFXBlockBuffer";
import {
  MEFXBufferQueue,
  type MEFXBufferQueueOptions,
} from "../../FX/MediaFX/MEFXBufferQueue";
import type { MEFXClock, MEFXClockReading } from "../../FX/MediaFX/MEFXClock";
import type { MEFXClockLease, MEFXMediaClient } from "../../FX/MediaFX/MEFXMediaClient";
import { MEFXTimebase, type MEFXTimebaseOptions } from "../../FX/MediaFX/MEFXTimebase";
import type { MediaClockService } from "../HostServices/AppSDKHostServiceTypes";
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";

export interface MountedMediaClientLimits {
  readonly maxHandles?: number;
  readonly bytes?: number;
  readonly sessions?: number;
  readonly workerJobs?: number;
}

const DEFAULT_MAX_HANDLES = 64;
const DEFAULT_BYTES = 64 * 1024 * 1024;
const DEFAULT_SESSIONS = 16;
const DEFAULT_WORKER_JOBS = 8;

function disposedError(): DOMException {
  return new DOMException("Mounted media resource is no longer available.", "AbortError");
}

function scopedClock(clock: MEFXClock, signal: AbortSignal): MEFXClock {
  const subscriptions = new Set<() => void>();
  const assertLive = () => signal.throwIfAborted();
  const disposeSubscriptions = () => {
    for (const unsubscribe of [...subscriptions]) unsubscribe();
    subscriptions.clear();
  };
  signal.addEventListener("abort", disposeSubscriptions, { once: true });
  return Object.freeze({
    now(): MEFXClockReading {
      assertLive();
      return clock.now();
    },
    subscribeDiscontinuities(listener: (reading: MEFXClockReading) => void) {
      assertLive();
      const unsubscribeSource = clock.subscribeDiscontinuities((reading) => {
        if (!signal.aborted) listener(reading);
      });
      let active = true;
      const unsubscribe = () => {
        if (!active) return;
        active = false;
        subscriptions.delete(unsubscribe);
        unsubscribeSource();
      };
      subscriptions.add(unsubscribe);
      return unsubscribe;
    },
  });
}

/** Mounted, permission-free MediaFX acquisition. It owns memory/queue/clock
 * lifetimes only; device permission remains with AUFX/VFX/MIFX. */
export function createMountedMediaClient(
  clockService: MediaClockService,
  mountSignal: AbortSignal,
  limits: MountedMediaClientLimits = {},
): MEFXMediaClient {
  const scope = createMountedResourceScope(mountSignal, {
    maxResources: limits.maxHandles ?? DEFAULT_MAX_HANDLES,
    budgets: {
      bytes: limits.bytes ?? DEFAULT_BYTES,
      sessions: limits.sessions ?? DEFAULT_SESSIONS,
      workerJobs: limits.workerJobs ?? DEFAULT_WORKER_JOBS,
    },
  });

  const acquireHandle = (caller: AbortSignal | undefined): MEFXBlockRuntimeHandle =>
    scope.acquire(
      caller,
      (signal, release) => Object.freeze({ signal, release }),
      (handle) => handle.release(),
    );

  return Object.freeze({
    copyBlock(bytes: Uint8Array, signal?: AbortSignal) {
      mountSignal.throwIfAborted();
      signal?.throwIfAborted();
      if (!(bytes instanceof Uint8Array))
        throw new TypeError("Mounted media block input must be Uint8Array.");
      const backing = scope.reserve({ bytes: bytes.byteLength });
      const owner: MEFXBlockRuntimeOwner = Object.freeze({
        acquireHandle: () => acquireHandle(signal),
        onBackingRelease: () => backing.release(),
      });
      try {
        return createRuntimeOwnedMEFXBlockBuffer(bytes, owner);
      }
      catch (error) {
        backing.release();
        throw error;
      }
    },

    createQueue<T>(options: MEFXBufferQueueOptions<T>, signal?: AbortSignal): MEFXBufferQueue<T> {
      return scope.acquire(
        signal,
        (lease, release) => {
          class MountedQueue extends MEFXBufferQueue<T> {
            #released = false;
            readonly #onAbort = () => this.dispose(lease.reason ?? disposedError());

            constructor() {
              super(options);
              lease.addEventListener("abort", this.#onAbort, { once: true });
              if (lease.aborted) this.#onAbort();
            }

            override dispose(reason: unknown = disposedError()): void {
              if (this.#released) return;
              this.#released = true;
              lease.removeEventListener("abort", this.#onAbort);
              try {
                super.dispose(reason);
              }
              finally {
                release();
              }
            }
          }
          return new MountedQueue();
        },
        (queue) => queue.dispose(),
        { sessions: 1 },
      );
    },

    observeClock(signal?: AbortSignal): MEFXClockLease {
      return scope.acquire(
        signal,
        (lease, release) => {
          const source = scopedClock(clockService.observeClock(), lease);
          let disposed = false;
          const dispose = () => {
            if (disposed) return;
            disposed = true;
            release();
          };
          lease.addEventListener("abort", dispose, { once: true });
          return Object.freeze({
            now: () => source.now(),
            subscribeDiscontinuities: (listener: (reading: MEFXClockReading) => void) =>
              source.subscribeDiscontinuities(listener),
            dispose,
          });
        },
        (clock) => clock.dispose(),
        { sessions: 1 },
      );
    },

    createTimebase(options: MEFXTimebaseOptions = {}, signal?: AbortSignal): MEFXTimebase {
      return scope.acquire(
        signal,
        (lease, release) => {
          const source = scopedClock(clockService.observeClock(), lease);
          class MountedTimebase extends MEFXTimebase {
            #released = false;
            readonly #onAbort = () => this.dispose();

            constructor() {
              super(source, options);
              lease.addEventListener("abort", this.#onAbort, { once: true });
              if (lease.aborted) this.#onAbort();
            }

            override dispose(): void {
              if (this.#released) return;
              this.#released = true;
              lease.removeEventListener("abort", this.#onAbort);
              try {
                super.dispose();
              }
              finally {
                release();
              }
            }
          }
          return new MountedTimebase();
        },
        (timebase) => timebase.dispose(),
        { sessions: 1 },
      );
    },
  });
}
