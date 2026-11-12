/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { DFXQueue } from "../../DFXQueue";
import { classForLifetime, onLifetimeEnd, systemLifetime } from "../lifetime";
import { WorkerPool } from "./WorkerPool";
import type { PoolJob, PoolWorkerLike } from "./protocol";

export interface DedicatedThreadOptions {
  readonly QueueClass?: typeof DFXQueue;
  readonly createWorker?: () => PoolWorkerLike;
}

interface DedicatedThreadRecord {
  readonly chunkURL: string;
  readonly pool: WorkerPool;
}

const dedicatedThreads = new WeakMap<DFXQueue, DedicatedThreadRecord>();

/** Internal serial queue target backed by one persistent lazy worker. */
export function dedicatedThread(
  label: string,
  chunkURL: string,
  options: DedicatedThreadOptions = {},
): DFXQueue {
  const QueueClass = options.QueueClass ?? classForLifetime(DFXQueue, systemLifetime);
  const queue = new QueueClass(label);
  const pool = new WorkerPool({
    maxWorkers: 1,
    idleTimeoutMs: Number.POSITIVE_INFINITY,
    createWorker: options.createWorker,
  });
  dedicatedThreads.set(queue, { chunkURL, pool });
  onLifetimeEnd(systemLifetime, () => pool.terminateAll());
  return queue;
}

export function dedicatedThreadForQueue(queue: DFXQueue): DedicatedThreadRecord | undefined {
  return dedicatedThreads.get(queue);
}

export function submitDedicatedThreadJob(queue: DFXQueue, job: Omit<PoolJob, "chunkURL"> & { chunkURL?: string }): void {
  const record = dedicatedThreads.get(queue);
  if (!record) {
    throw new Error(`DispatchFX queue "${queue.label}" is not backed by a dedicated thread`);
  }
  record.pool.submit({
    ...job,
    chunkURL: job.chunkURL ?? record.chunkURL,
    queueKey: job.queueKey ?? queue,
  });
}
