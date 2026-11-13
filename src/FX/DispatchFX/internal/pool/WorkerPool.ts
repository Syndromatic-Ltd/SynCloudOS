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
  cancelled: boolean;
  settled: boolean;
}

interface InFlightJob {
  readonly entry: QueuedJob;
  readonly job: PoolJob;
  cancelled: boolean;
}

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

function isPreDeliveryCloneError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "DataCloneError";
}

interface WorkerSlot {
  readonly worker: PoolWorkerLike;
  readonly inFlight: Map<number, InFlightJob>;
  lowQoSInFlight: number;
  /** The session this worker last ran for; its chunks are still loaded there. */
  lastSession: WeakRef<object> | null;
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

export class DFXWorkerInterruptedError extends Error {
  constructor() {
    super("DispatchFX work was interrupted when a shared worker exceeded cancellation grace");
    this.name = "DFXWorkerInterruptedError";
  }
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
  readonly #staged = new Set<QueuedJob>();
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
    this.#queue.push({ jobId: this.#nextJobId++, job, cancelled: false, settled: false });
    this.#scheduleFlush();
  }

  cancelApp(target: object | string | null): void {
    const matches =
      target !== null && typeof target === "object"
        ? (job: PoolJob) => job.sessionKey === target
        : (job: PoolJob) => job.appId === target;

    for (let i = this.#queue.length - 1; i >= 0; i--) {
      if (matches(this.#queue[i].job)) this.#queue.splice(i, 1);
    }

    for (const item of this.#staged) {
      if (matches(item.job)) item.cancelled = true;
    }

    for (const slot of [...this.#slots]) {
      let hitActive = false;
      for (const entry of slot.inFlight.values()) {
        if (matches(entry.job)) {
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
    for (const item of this.#staged) item.cancelled = true;
    this.#staged.clear();
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
      this.#destroySlot(slot, new DFXWorkerInterruptedError());
      this.#flush();
    }, this.#cancelGraceMs);
  }

  #settleError(queued: QueuedJob, error: Error): void {
    if (queued.settled) return;
    queued.settled = true;
    try {
      queued.job.onError(error);
    } catch {
      // Prevent one failing handler from stranding sibling jobs.
    }
  }

  #settleResult(
    queued: QueuedJob,
    workerValues: unknown[],
    continuations?: PoolResponseMessage & { type: "result" } extends { continuations?: infer C } ? C : never,
  ): void {
    if (queued.settled) return;
    queued.settled = true;
    queued.job.onResult(workerValues, continuations);
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
      const pendingEntries = [...slot.inFlight.values()];
      slot.inFlight.clear();
      slot.lowQoSInFlight = 0;
      if (abortError) {
        for (const entry of pendingEntries) {
          if (!entry.cancelled) this.#settleError(entry.entry, abortError);
        }
      }
    }
  }

  #spawnSlot(): WorkerSlot {
    const worker = this.#createWorker();
    const slot: WorkerSlot = {
      worker,
      inFlight: new Map(),
      lowQoSInFlight: 0,
      lastSession: null,
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
    if (slot.inFlight.size === 0) this.#armIdleTimer(slot);

    try {
      if (!entry.cancelled) {
        if (data.type === "result") this.#settleResult(entry.entry, data.workerValues, data.continuations);
        else this.#settleError(entry.entry, deserializeWorkerError(data.error));
      }
    } finally {
      this.#flush();
    }
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
    const serial = job.queueKey === null ? undefined : this.#serialAffinities.get(job.queueKey);
    const healthy = this.#slots.filter(slot => !slot.terminated && !slot.tainted);
    const stagedJobs = (slot: WorkerSlot) => staged.get(slot) ?? [];
    const busy = (slot: WorkerSlot) => slot.inFlight.size > 0 || stagedJobs(slot).length > 0;
    const admitsQoS = (slot: WorkerSlot) => !lowQoS || slot.lowQoSInFlight > 0 || stagedLowSlots.has(slot)
      || this.#activeLowQoSWorkers(stagedLowSlots) < this.#lowQoSCap();
    const prefers = (predicate: (slot: WorkerSlot) => boolean) => {
      if (serial && healthy.includes(serial) && predicate(serial) && admitsQoS(serial)) return serial;
      return healthy.find(slot => predicate(slot) && admitsQoS(slot));
    };

    // Keep queued work on its serial lane until the previously admitted work settles.
    if (serial && ([...serial.inFlight.values()].some(entry => entry.job.queueKey === job.queueKey)
      || stagedJobs(serial).some(entry => entry.job.queueKey === job.queueKey))) {
      return healthy.includes(serial) && admitsQoS(serial) ? serial : null;
    }

    if (!job.sessionKey && serial && healthy.includes(serial) && admitsQoS(serial)) return serial;

    // A free core comes first: an idle worker this session warmed, then any idle worker, then a new one.
    const idle = prefers(slot => !busy(slot) && slot.lastSession?.deref() === job.sessionKey)
      ?? prefers(slot => !busy(slot));
    if (idle) return idle;

    if (lowQoS && this.#activeLowQoSWorkers(stagedLowSlots) >= this.#lowQoSCap()) return null;
    if (this.#slots.length < this.maxWorkers) return this.#spawnSlot();

    // The pool is full. Queue behind the session's own work before sharing a worker with another session.
    const load = (slot: WorkerSlot) => slot.inFlight.size + stagedJobs(slot).length;
    const ownsSlot = (slot: WorkerSlot) => Boolean(job.sessionKey)
      && [...slot.inFlight.values()].every(entry => entry.job.sessionKey === job.sessionKey)
      && stagedJobs(slot).every(entry => entry.job.sessionKey === job.sessionKey);
    const leastLoaded = (slots: readonly WorkerSlot[]) => slots.reduce<WorkerSlot | null>(
      (best, slot) => (!best || load(slot) < load(best) ? slot : best), null);
    const candidates = healthy.filter(admitsQoS);
    return leastLoaded(candidates.filter(ownsSlot)) ?? leastLoaded(candidates);
  }

  #dispatchBatch(slot: WorkerSlot, items: QueuedJob[]): void {
    const activeItems = items.filter(item => {
      if (!item.cancelled) return true;
      this.#staged.delete(item);
      return false;
    });
    if (activeItems.length === 0) return;

    if (slot.terminated) {
      const err = new Error("DispatchFX worker terminated");
      for (const item of activeItems) {
        this.#staged.delete(item);
        if (!item.cancelled) this.#settleError(item, err);
      }
      return;
    }

    const toRequest = (item: QueuedJob): PoolWorkRequest => ({
      jobId: item.jobId,
      closureId: item.job.closureId,
      chunkURL: item.job.chunkURL,
      captures: item.job.captures,
    });

    const stageItems = (batch: QueuedJob[]): PoolWorkRequest[] => {
      const requests: PoolWorkRequest[] = [];
      for (const item of batch) {
        slot.inFlight.set(item.jobId, { entry: item, job: item.job, cancelled: false });
        if (item.job.sessionKey && slot.lastSession?.deref() !== item.job.sessionKey) slot.lastSession = new WeakRef(item.job.sessionKey);
        if (isLowQoS(item.job.qos)) slot.lowQoSInFlight++;
        requests.push(toRequest(item));
      }
      return requests;
    };

    const rollbackItems = (batch: QueuedJob[]): void => {
      for (const item of batch) {
        if (!slot.inFlight.delete(item.jobId)) continue;
        if (isLowQoS(item.job.qos) && slot.lowQoSInFlight > 0) slot.lowQoSInFlight--;
      }
    };

    this.#clearIdleTimer(slot);
    const batchRequests = stageItems(activeItems);
    try {
      // Captures are structured-cloned so caller buffers remain readable on the main thread.
      slot.worker.postMessage({ type: "run-batch", jobs: batchRequests });
      for (const item of activeItems) this.#staged.delete(item);
      return;
    } catch (batchError) {
      rollbackItems(activeItems);
      if (activeItems.length === 1 || !isPreDeliveryCloneError(batchError)) {
        for (const item of activeItems) this.#staged.delete(item);
        if (slot.inFlight.size === 0 && !slot.terminated) this.#armIdleTimer(slot);
        const error = toError(batchError);
        for (const item of activeItems) {
          if (!item.cancelled) this.#settleError(item, error);
        }
        return;
      }
    }

    // Isolate pre-delivery DataCloneError failures while keeping remaining items visible to cancellation.
    for (const item of activeItems) {
      this.#staged.delete(item);
      if (item.cancelled) continue;
      if (slot.terminated) {
        this.#settleError(item, new Error("DispatchFX worker terminated"));
        continue;
      }
      this.#clearIdleTimer(slot);
      const req = stageItems([item]);
      try {
        slot.worker.postMessage({ type: "run-batch", jobs: req });
      } catch (itemError) {
        rollbackItems([item]);
        if (slot.inFlight.size === 0 && !slot.terminated) this.#armIdleTimer(slot);
        if (!item.cancelled) this.#settleError(item, toError(itemError));
      }
    }
    if (slot.inFlight.size === 0 && !slot.terminated) this.#armIdleTimer(slot);
  }

  #flush(): void {
    if (this.#queue.length === 0) return;

    // Drain upfront so constructor/postMessage errors never leave failed jobs queued for replay.
    const batch = this.#queue.splice(0, this.#queue.length);
    batch.sort((left, right) => compareQoSValues(right.job.qos, left.job.qos));

    const staged = new Map<WorkerSlot, QueuedJob[]>();
    const stagedLowSlots = new Set<WorkerSlot>();
    const deferred: QueuedJob[] = [];
    const spawnFailures: { item: QueuedJob; error: Error }[] = [];

    for (const item of batch) {
      let slot: WorkerSlot | null;
      try {
        slot = this.#selectSlot(item.job, staged, stagedLowSlots);
      } catch (error) {
        spawnFailures.push({ item, error: toError(error) });
        continue;
      }
      if (!slot) {
        deferred.push(item);
        continue;
      }
      this.#staged.add(item);
      if (item.job.queueKey !== null) this.#serialAffinities.set(item.job.queueKey, slot);
      if (isLowQoS(item.job.qos)) stagedLowSlots.add(slot);
      let slotBatch = staged.get(slot);
      if (!slotBatch) {
        slotBatch = [];
        staged.set(slot, slotBatch);
      }
      slotBatch.push(item);
    }

    if (deferred.length > 0) this.#queue.unshift(...deferred);
    try {
      for (const { item, error } of spawnFailures) {
        if (!item.cancelled) this.#settleError(item, error);
      }
      for (const [slot, items] of staged) this.#dispatchBatch(slot, items);
    } finally {
      for (const items of staged.values()) {
        for (const item of items) this.#staged.delete(item);
      }
    }
  }
}
