/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { loadWorkerChunk } from "./loadWorkerChunk.mjs";
import {
  collectTransferables,
  deepFreezeWorkerValue,
  serializeWorkerError,
  type PoolRequestMessage,
  type PoolResponseMessage,
  type SerializedContinuation,
} from "./protocol";

type WorkerClosureFn = (...args: unknown[]) => unknown;

interface WorkerChunkModule {
  readonly __dfxClosures?: Record<string, WorkerClosureFn>;
  readonly closures?: Record<string, WorkerClosureFn>;
}

interface WorkerScopeLike {
  onmessage: ((event: MessageEvent<PoolRequestMessage>) => void) | null;
  postMessage(message: PoolResponseMessage, transfer?: Transferable[]): void;
}

const activeContinuationsStack: SerializedContinuation[][] = [];

/** Record a worker-to-main continuation produced by closure-converted code. */
export function enqueueWorkerContinuation(id: string, workerValues: unknown[]): void {
  const active = activeContinuationsStack.at(-1);
  if (!active) {
    throw new Error("DispatchFX worker continuation recorded outside an active worker job");
  }
  active.push({ id, workerValues });
}

export function createPoolWorkerHandler(
  postMessage: (message: PoolResponseMessage, transfer?: Transferable[]) => void,
  importChunk: (chunkURL: string) => Promise<WorkerChunkModule> = loadWorkerChunk,
) {
  const chunkCache = new Map<string, Promise<WorkerChunkModule>>();

  function loadChunk(chunkURL: string): Promise<WorkerChunkModule> {
    let cached = chunkCache.get(chunkURL);
    if (!cached) {
      cached = importChunk(chunkURL).catch(error => {
        chunkCache.delete(chunkURL);
        throw error;
      });
      chunkCache.set(chunkURL, cached);
    }
    return cached;
  }

  let pendingBatch = Promise.resolve();

  const processBatch = async (jobs: PoolRequestMessage["jobs"]): Promise<void> => {
    for (const job of jobs) {
      const continuations: SerializedContinuation[] = [];
      try {
        const mod = await loadChunk(job.chunkURL);
        const table = mod.__dfxClosures ?? mod.closures;
        const fn = table?.[job.closureId];
        if (typeof fn !== "function") {
          throw new Error(`DispatchFX worker closure "${job.closureId}" not found in "${job.chunkURL}"`);
        }
        const frozenCaptures = job.captures.map(capture => deepFreezeWorkerValue(capture));
        activeContinuationsStack.push(continuations);
        let returned: unknown;
        try {
          returned = await fn(...frozenCaptures);
        } finally {
          const stackIndex = activeContinuationsStack.lastIndexOf(continuations);
          if (stackIndex >= 0) activeContinuationsStack.splice(stackIndex, 1);
        }
        const workerValues = Array.isArray(returned) ? returned : returned === undefined ? [] : [returned];
        const response: PoolResponseMessage = continuations.length
          ? { type: "result", jobId: job.jobId, workerValues, continuations }
          : { type: "result", jobId: job.jobId, workerValues };
        const transferables = collectTransferables(response);
        postMessage(response, transferables);
      } catch (error) {
        postMessage({
          type: "error",
          jobId: job.jobId,
          error: serializeWorkerError(error),
        });
      }
    }
  };

  return function handleMessage(event: MessageEvent<PoolRequestMessage>): Promise<void> {
    const message = event.data;
    if (!message || message.type !== "run-batch" || !Array.isArray(message.jobs)) {
      return Promise.resolve();
    }
    const run = () => processBatch(message.jobs);
    const next = pendingBatch.then(run, run);
    pendingBatch = next;
    return next;
  };
}

const workerGlobal = globalThis as typeof globalThis & { __dfxEnqueueContinuation?: typeof enqueueWorkerContinuation };
workerGlobal.__dfxEnqueueContinuation = enqueueWorkerContinuation;

if (
  typeof self !== "undefined" &&
  typeof (self as unknown as WorkerScopeLike).postMessage === "function" &&
  typeof (globalThis as { window?: unknown }).window === "undefined"
) {
  const scope = self as unknown as WorkerScopeLike;
  scope.onmessage = createPoolWorkerHandler((message, transfer) => scope.postMessage(message, transfer ?? []));
}
