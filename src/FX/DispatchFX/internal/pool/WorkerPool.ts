/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { DFXQoS } from "../../DFXQoS";
import { DFXQoSClass } from "../../DFXQoSClass";
import {
  deserializeWorkerError,
  type PoolJob,
  type PoolResponseMessage,
  type PoolWorkerLike,
  type PoolWorkRequest,
} from "./protocol";

const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_TERMINATION_GRACE_MS = 2_000;

const qosRank: Record<DFXQoSClass, number> = {
  unspecified: 0,
  background: 1,
  utility: 2,
  default: 3,
  userInitiated: 4,
  userInteractive: 5,
};

export function computePoolSize(
  cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency : 4,
): number {
  const normalised = Number.isFinite(cores) && cores >= 1 ? Math.floor(cores) : 1;
  return Math.max(1, Math.min(normalised - 1, 8));
}

function isLowQoS(qos: DFXQoS): boolean {
  return qos.qosClass === DFXQoSClass.background || qos.qosClass === DFXQoSClass.utility;
}

function compareQoSValues(left: DFXQoS, right: DFXQoS): number {
  return qosRank[left.qosClass] - qosRank[right.qosClass] || left.relativePriority - right.relativePriority;
}

interface QueuedJob {
  readonly jobId: number;
  readonly job: PoolJob;
}

interface InFlightJob {
  readonly job: PoolJob;
  cancelled: boolean;
}

interface WorkerSlot {
  readonly worker: PoolWorkerLike;
  readonly inFlight: Map<number, InFlightJob>;
  lowQoSInFlight: number;
  tainted: boolean;
  terminated: boolean;
  idleTimer: ReturnType<typeof setTimeout> | null;
  cancelTimer: ReturnType<typeof setTimeout> | null;
}

export interface WorkerPoolOptions {
  readonly cores?: number;
  readonly maxWorkers?: number;
  readonly idleTimeoutMs?: number;
  readonly cancelTerminationGraceMs?: number;
  readonly createWorker?: () => PoolWorkerLike;
}

function defaultWorkerFactory(): PoolWorkerLike {
  if (typeof Worker !== "function") {
    throw new Error("DispatchFX WorkerPool requires Web Worker support");
  }
  return new Worker(new URL("./poolWorker.ts", import.meta.url), {
    type: "module",
    name: "syncloudos-dfx-worker",
  });
}

export class WorkerPool {
  static #shared: WorkerPool | null = null;
  static get shared(): WorkerPool {
    return (WorkerPool.#shared ??= new WorkerPool());
  }

  readonly maxWorkers: number;
  readonly #idleTimeoutMs: number;
  readonly #cancelGraceMs: number;
  readonly #createWorker: () => PoolWorkerLike;

  readonly #slots: WorkerSlot[] = [];
  readonly #queue: QueuedJob[] = [];
  readonly #serialAffinities = new Map<object | string, WorkerSlot>();
  #nextJobId = 1;
  #flushScheduled = false;

  constructor(options: WorkerPoolOptions = {}) {
    this.maxWorkers = options.maxWorkers ?? computePoolSize(options.cores);
    this.#idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this.#cancelGraceMs = options.cancelTerminationGraceMs ?? DEFAULT_TERMINATION_GRACE_MS;
    this.#createWorker = options.createWorker ?? defaultWorkerFactory;
  }

  get activeWorkerCount(): number {
    return this.#slots.length;
  }

  submit(job: PoolJob): void {
    this.#queue.push({ jobId: this.#nextJobId++, job });
    this.#scheduleFlush();
  }

  cancelApp(appId: string | null): void {
    for (let i = this.#queue.length - 1; i >= 0; i--) {
      if (this.#queue[i].job.appId === appId) this.#queue.splice(i, 1);
    }

    for (const slot of [...this.#slots]) {
      let hitActive = false;
      for (const entry of slot.inFlight.values()) {
        if (entry.job.appId === appId) {
          entry.cancelled = true;
          hitActive = true;
        }
      }
      if (hitActive) {
        slot.tainted = true;
        this.#armCancelTimer(slot);
      }
    }
  }

  terminateAll(): void {
    this.#queue.length = 0;
    for (const slot of [...this.#slots]) {
      this.#destroySlot(slot, new Error("DispatchFX worker pool terminated"));
    }
  }

  #scheduleFlush(): void {
    if (this.#flushScheduled) return;
    this.#flushScheduled = true;
    void Promise.resolve().then(() => {
      this.#flushScheduled = false;
      this.#flush();
    });
  }

  #clearIdleTimer(slot: WorkerSlot): void {
    if (slot.idleTimer !== null) {
      clearTimeout(slot.idleTimer);
      slot.idleTimer = null;
    }
  }

  #armIdleTimer(slot: WorkerSlot): void {
    this.#clearIdleTimer(slot);
    if (!Number.isFinite(this.#idleTimeoutMs)) return;
    slot.idleTimer = setTimeout(() => {
      slot.idleTimer = null;
      if (slot.terminated || slot.inFlight.size > 0) return;
      this.#destroySlot(slot);
    }, this.#idleTimeoutMs);
  }

  #clearCancelTimer(slot: WorkerSlot): void {
    if (slot.cancelTimer !== null) {
      clearTimeout(slot.cancelTimer);
      slot.cancelTimer = null;
    }
  }

  #armCancelTimer(slot: WorkerSlot): void {
    if (slot.cancelTimer !== null || !Number.isFinite(this.#cancelGraceMs)) return;
    slot.cancelTimer = setTimeout(() => {
      slot.cancelTimer = null;
      if (slot.terminated) return;
      const stillCancelledInFlight = [...slot.inFlight.values()].some(entry => entry.cancelled);
      if (!stillCancelledInFlight) return;
      this.#destroySlot(slot, new Error("DispatchFX worker terminated after cancellation timeout"));
      this.#flush();
    }, this.#cancelGraceMs);
  }

  #destroySlot(slot: WorkerSlot, abortError?: Error): void {
    if (slot.terminated) return;
    slot.terminated = true;
    this.#clearIdleTimer(slot);
    this.#clearCancelTimer(slot);
    const index = this.#slots.indexOf(slot);
    if (index >= 0) this.#slots.splice(index, 1);
    for (const [key, owner] of this.#serialAffinities) {
      if (owner === slot) this.#serialAffinities.delete(key);
    }
    try {
      slot.worker.terminate();
    } finally {
      if (abortError) {
        for (const entry of slot.inFlight.values()) {
          if (!entry.cancelled) entry.job.onError(abortError);
        }
      }
      slot.inFlight.clear();
      slot.lowQoSInFlight = 0;
    }
  }

  #spawnSlot(): WorkerSlot {
    const worker = this.#createWorker();
    const slot: WorkerSlot = {
      worker,
      inFlight: new Map(),
      lowQoSInFlight: 0,
      tainted: false,
      terminated: false,
      idleTimer: null,
      cancelTimer: null,
    };
    worker.onmessage = event => this.#handleWorkerMessage(slot, event.data);
    worker.onerror = event => {
      const error = new Error(event.message || "DispatchFX worker error");
      this.#destroySlot(slot, error);
      this.#scheduleFlush();
    };
    this.#slots.push(slot);
    return slot;
  }

  #handleWorkerMessage(slot: WorkerSlot, data: PoolResponseMessage): void {
    if (slot.terminated || !data) return;
    const entry = slot.inFlight.get(data.jobId);
    if (!entry) return;
    slot.inFlight.delete(data.jobId);
    if (isLowQoS(entry.job.qos) && slot.lowQoSInFlight > 0) slot.lowQoSInFlight--;

    const hasCancelledRemaining = [...slot.inFlight.values()].some(item => item.cancelled);
    if (!hasCancelledRemaining) {
      slot.tainted = false;
      this.#clearCancelTimer(slot);
    }

    if (!entry.cancelled) {
      if (data.type === "result") entry.job.onResult(data.workerValues, data.continuations);
      else entry.job.onError(deserializeWorkerError(data.error));
    }

    if (slot.inFlight.size === 0) this.#armIdleTimer(slot);
    this.#flush();
  }

  #lowQoSCap(): number {
    return Math.ceil(this.maxWorkers / 2);
  }

  #activeLowQoSWorkers(stagedLowSlots: Set<WorkerSlot>): number {
    let count = 0;
    for (const slot of this.#slots) {
      if (slot.lowQoSInFlight > 0 || stagedLowSlots.has(slot)) count++;
    }
    return count;
  }

  #selectSlot(job: PoolJob, staged: Map<WorkerSlot, QueuedJob[]>, stagedLowSlots: Set<WorkerSlot>): WorkerSlot | null {
    const lowQoS = isLowQoS(job.qos);
    if (lowQoS) {
      const preferredSerial = job.queueKey !== null ? this.#serialAffinities.get(job.queueKey) : undefined;
      const serialReusesSlot = Boolean(preferredSerial && !preferredSerial.terminated && !preferredSerial.tainted && (preferredSerial.lowQoSInFlight > 0 || stagedLowSlots.has(preferredSerial)));
      if (!serialReusesSlot && this.#activeLowQoSWorkers(stagedLowSlots) >= this.#lowQoSCap()) {
        return null;
      }
    }

    if (job.queueKey !== null) {
      const preferred = this.#serialAffinities.get(job.queueKey);
      if (preferred && !preferred.terminated && !preferred.tainted) {
        return preferred;
      }
    }

    const idleSlot = this.#slots.find(slot => !slot.terminated && !slot.tainted && slot.inFlight.size === 0 && !staged.has(slot));
    if (idleSlot) return idleSlot;

    if (this.#slots.length < this.maxWorkers) return this.#spawnSlot();

    // All pool workers exist; stage non-low-QoS or same-turn overflow onto the least-loaded healthy slot.
    if (lowQoS && this.#activeLowQoSWorkers(stagedLowSlots) >= this.#lowQoSCap()) return null;
    let best: WorkerSlot | null = null;
    for (const slot of this.#slots) {
      if (slot.terminated || slot.tainted) continue;
      if (!best || slot.inFlight.size + (staged.get(slot)?.length ?? 0) < best.inFlight.size + (staged.get(best)?.length ?? 0)) {
        best = slot;
      }
    }
    return best;
  }

  #flush(): void {
    if (this.#queue.length === 0) return;

    // Sort highest QoS first while preserving submission order within equal QoS.
    this.#queue.sort((left, right) => compareQoSValues(right.job.qos, left.job.qos));

    const staged = new Map<WorkerSlot, QueuedJob[]>();
    const stagedLowSlots = new Set<WorkerSlot>();
    const remaining: QueuedJob[] = [];

    for (const item of this.#queue) {
      const slot = this.#selectSlot(item.job, staged, stagedLowSlots);
      if (!slot) {
        remaining.push(item);
        continue;
      }
      if (item.job.queueKey !== null) this.#serialAffinities.set(item.job.queueKey, slot);
      if (isLowQoS(item.job.qos)) stagedLowSlots.add(slot);
      let batch = staged.get(slot);
      if (!batch) {
        batch = [];
        staged.set(slot, batch);
      }
      batch.push(item);
    }

    this.#queue.length = 0;
    this.#queue.push(...remaining);

    for (const [slot, items] of staged) {
      this.#clearIdleTimer(slot);
      const requests: PoolWorkRequest[] = [];
      for (const { jobId, job } of items) {
        slot.inFlight.set(jobId, { job, cancelled: false });
        if (isLowQoS(job.qos)) slot.lowQoSInFlight++;
        requests.push({
          jobId,
          closureId: job.closureId,
          chunkURL: job.chunkURL,
          captures: job.captures,
        });
      }
      // Captures are structured-cloned so caller buffers remain readable on the main thread.
      slot.worker.postMessage({ type: "run-batch", jobs: requests });
    }
  }
}
