/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { classForLifetime, type DispatchLifetime } from "../internal/lifetime";
import { WorkerPool, computePoolSize } from "../internal/pool/WorkerPool";
import { dedicatedThread, submitDedicatedThreadJob } from "../internal/pool/dedicatedThread";
import type { PoolJob, PoolRequestMessage, PoolResponseMessage, PoolWorkerLike } from "../internal/pool/protocol";
import { DFXQoS } from "../DFXQoS";
import * as D from "./systemDispatch";

class FakeWorker implements PoolWorkerLike {
  onmessage: ((event: MessageEvent<PoolResponseMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly posted: { message: PoolRequestMessage; transfer?: Transferable[] }[] = [];
  terminated = false;

  postMessage(message: PoolRequestMessage, transfer?: Transferable[]): void {
    this.posted.push({ message, transfer });
  }

  terminate(): void {
    this.terminated = true;
  }

  emitResult(jobId: number, workerValues: unknown[] = []): void {
    this.onmessage?.({ data: { type: "result", jobId, workerValues } } as MessageEvent<PoolResponseMessage>);
  }

  emitError(jobId: number, error: { name: string; message: string; stack?: string }): void {
    this.onmessage?.({ data: { type: "error", jobId, error } } as MessageEvent<PoolResponseMessage>);
  }
}

function makeJob(overrides: Partial<PoolJob> = {}): PoolJob {
  return {
    appId: "com.example.app",
    closureId: "closure_1",
    chunkURL: "/virtual/dispatch-worker.js",
    captures: [],
    qos: DFXQoS.default,
    queueKey: null,
    onResult: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

describe("DispatchFX WorkerPool", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("pool size is max(1, min(cores-1, 8)) and spawns lazily", async () => {
    expect(computePoolSize(1)).toBe(1);
    expect(computePoolSize(2)).toBe(1);
    expect(computePoolSize(4)).toBe(3);
    expect(computePoolSize(9)).toBe(8);
    expect(computePoolSize(32)).toBe(8);

    const workers: FakeWorker[] = [];
    const factory = vi.fn(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    const pool = new WorkerPool({ cores: 4, createWorker: factory });

    expect(pool.maxWorkers).toBe(3);
    expect(factory).not.toHaveBeenCalled();

    pool.submit(makeJob());
    await Promise.resolve();
    expect(factory).toHaveBeenCalledTimes(1);

    pool.submit(makeJob());
    pool.submit(makeJob());
    pool.submit(makeJob());
    await Promise.resolve();
    expect(factory).toHaveBeenCalledTimes(3);
  });

  it("idle worker terminates after 30 s", async () => {
    vi.useFakeTimers();
    const workers: FakeWorker[] = [];
    const pool = new WorkerPool({
      cores: 4,
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });

    const onResult = vi.fn();
    pool.submit(makeJob({ onResult }));
    await Promise.resolve();
    const jobId = workers[0].posted[0].message.jobs[0].jobId;
    workers[0].emitResult(jobId, [42]);
    expect(onResult).toHaveBeenCalledWith([42], undefined);

    vi.advanceTimersByTime(29_999);
    expect(workers[0].terminated).toBe(false);

    vi.advanceTimersByTime(1);
    expect(workers[0].terminated).toBe(true);
    expect(pool.activeWorkerCount).toBe(0);
  });

  it("background and utility hold at most ceil(size/2) workers", async () => {
    const workers: FakeWorker[] = [];
    const pool = new WorkerPool({
      cores: 9,
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });
    expect(pool.maxWorkers).toBe(8);

    for (let i = 0; i < 6; i++) {
      pool.submit(makeJob({ qos: i % 2 === 0 ? DFXQoS.background : DFXQoS.utility, closureId: `bg_${i}` }));
    }
    await Promise.resolve();

    // At most ceil(8/2) = 4 workers should be allocated to background/utility concurrently.
    const startedBgJobs = workers.reduce((sum, w) => sum + w.posted.flatMap(p => p.message.jobs).length, 0);
    expect(workers.length).toBeLessThanOrEqual(4);
    expect(startedBgJobs).toBe(4);

    // High QoS work can still claim remaining workers without waiting on background work.
    pool.submit(makeJob({ qos: DFXQoS.userInitiated, closureId: "fg_1" }));
    await Promise.resolve();
    const allDispatchedIds = workers.flatMap(w => w.posted.flatMap(p => p.message.jobs.map(j => j.closureId)));
    expect(allDispatchedIds).toContain("fg_1");

    // Completing one background worker drains queued background work.
    const firstBgJobId = workers[0].posted[0].message.jobs[0].jobId;
    workers[0].emitResult(firstBgJobId, []);
    await Promise.resolve();
    const totalDispatchedAfterComplete = workers.reduce((sum, w) => sum + w.posted.flatMap(p => p.message.jobs).length, 0);
    expect(totalDispatchedAfterComplete).toBe(6);
  });

  it("jobs for one worker in one turn are posted as one message", async () => {
    const workers: FakeWorker[] = [];
    const pool = new WorkerPool({
      cores: 2,
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });
    expect(pool.maxWorkers).toBe(1);

    pool.submit(makeJob({ closureId: "a" }));
    pool.submit(makeJob({ closureId: "b" }));
    pool.submit(makeJob({ closureId: "c" }));
    await Promise.resolve();

    expect(workers).toHaveLength(1);
    expect(workers[0].posted).toHaveLength(1);
    expect(workers[0].posted[0].message.jobs.map(j => j.closureId)).toEqual(["a", "b", "c"]);
  });

  it("serial queue prefers its previous worker", async () => {
    const workers: FakeWorker[] = [];
    const pool = new WorkerPool({
      cores: 5,
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });
    const serialA = { label: "serial.a" };
    const serialB = { label: "serial.b" };

    pool.submit(makeJob({ queueKey: serialA, closureId: "a1" }));
    await Promise.resolve();
    expect(workers).toHaveLength(1);
    workers[0].emitResult(workers[0].posted[0].message.jobs[0].jobId, []);

    pool.submit(makeJob({ queueKey: serialB, closureId: "b1" }));
    await Promise.resolve();
    pool.submit(makeJob({ queueKey: serialA, closureId: "a2" }));
    await Promise.resolve();

    const worker0Closures = workers[0].posted.flatMap(p => p.message.jobs.map(j => j.closureId));
    expect(worker0Closures).toContain("a1");
    expect(worker0Closures).toContain("a2");
  });

  it("worker error returns name, message and stack", async () => {
    const workers: FakeWorker[] = [];
    const pool = new WorkerPool({
      cores: 2,
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });
    const onError = vi.fn();
    pool.submit(makeJob({ onError }));
    await Promise.resolve();

    const jobId = workers[0].posted[0].message.jobs[0].jobId;
    workers[0].emitError(jobId, {
      name: "RangeError",
      message: "index out of bounds",
      stack: "RangeError: index out of bounds\n    at work (/chunk.js:4:9)",
    });

    expect(onError).toHaveBeenCalledTimes(1);
    const err = onError.mock.calls[0][0] as Error;
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("RangeError");
    expect(err.message).toBe("index out of bounds");
    expect(err.stack).toContain("at work (/chunk.js:4:9)");
  });

  it("cancelApp drops results; worker still busy 2 s after is terminated and replaced", async () => {
    vi.useFakeTimers();
    const workers: FakeWorker[] = [];
    const pool = new WorkerPool({
      cores: 2,
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });

    const app1Result = vi.fn();
    const app1Error = vi.fn();
    pool.submit(makeJob({ appId: "app.one", closureId: "stuck", onResult: app1Result, onError: app1Error }));
    await Promise.resolve();

    const stuckJobId = workers[0].posted[0].message.jobs[0].jobId;
    pool.cancelApp("app.one");

    // Late result from a cancelled app arrives before 2 s: dropped cleanly and worker stays reusable.
    workers[0].emitResult(stuckJobId, ["stale"]);
    expect(app1Result).not.toHaveBeenCalled();
    expect(app1Error).not.toHaveBeenCalled();

    // Now simulate a job that hangs inside the worker beyond the 2 s grace deadline.
    pool.submit(makeJob({ appId: "app.three", closureId: "hangs", onResult: app1Result }));
    await Promise.resolve();
    pool.cancelApp("app.three");

    vi.advanceTimersByTime(1_999);
    expect(workers[0].terminated).toBe(false);

    // Enqueue queued work for app.two; tainted worker[0] must not accept it.
    const app2Result = vi.fn();
    pool.submit(makeJob({ appId: "app.two", closureId: "fresh_work", onResult: app2Result }));
    await Promise.resolve();
    expect(workers).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);
    const replacementClosures = workers[1].posted.flatMap(p => p.message.jobs.map(j => j.closureId));
    expect(replacementClosures).toContain("fresh_work");
  });

  it("dedicatedThread returns a serial queue target bound to a single dedicated worker", async () => {
    const workers: FakeWorker[] = [];
    const target = dedicatedThread("audio.render", "/virtual/audio-worker.js", {
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });

    expect(target).toBeInstanceOf(D.DFXQueue);
    expect(target.label).toBe("audio.render");
    const child = new D.DFXQueue("audio.child", { target });
    expect(child.label).toBe("audio.child");
    expect(workers).toHaveLength(0);

    const onResult = vi.fn();
    submitDedicatedThreadJob(target, makeJob({ closureId: "dsp", onResult }));
    await Promise.resolve();
    expect(workers).toHaveLength(1);
    const jobId = workers[0].posted[0].message.jobs[0].jobId;
    workers[0].emitResult(jobId, [99]);
    expect(onResult).toHaveBeenCalledWith([99], undefined);
  });
});

describe("DFXQueue worker error parity with main-thread throws", () => {
  afterEach(() => {
    WorkerPool.shared.terminateAll();
    delete (globalThis as Record<symbol, unknown>)[Symbol.for("syncloudos.dfx.workerChunks")];
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("wraps worker errors with the queue label like main-thread throws, notifies work item/group, and skips reporting if cancelled", async () => {
    const reported: unknown[] = [];
    vi.stubGlobal("reportError", (err: unknown) => reported.push(err));

    const workers: FakeWorker[] = [];
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          const fw = new FakeWorker();
          workers.push(fw);
          return fw;
        }
      },
    );

    const reg = new Map<string, string>([["com.example.workererr", "/virtual/worker-err.js"]]);
    (globalThis as Record<symbol, unknown>)[Symbol.for("syncloudos.dfx.workerChunks")] = reg;

    const appLifetime: DispatchLifetime = {
      appId: "com.example.workererr",
      ended: false,
      jobs: new Set(),
      resources: new Set(),
    };
    const AppQueue = classForLifetime(D.DFXQueue, appLifetime);
    const AppGroup = classForLifetime(D.DFXGroup, appLifetime);
    const AppWorkItem = classForLifetime(D.DFXWorkItem, appLifetime);
    const queue = new AppQueue("worker.err.probe");

    // 1. Main-thread reference behaviour when a DFXWorkItem throws.
    const mainGroup = new AppGroup();
    let mainItemNotified = false;
    let mainGroupNotified = false;
    const mainItem = new AppWorkItem(() => {
      throw new Error("main boom");
    });
    mainItem.notify(AppQueue.main, () => { mainItemNotified = true; });
    queue.async(mainGroup, mainItem);
    mainGroup.notify(AppQueue.main, () => { mainGroupNotified = true; });
    await new Promise(resolve => setTimeout(resolve, 30));

    expect(reported).toHaveLength(1);
    const mainErr = reported[0] as Error;
    expect(mainErr.message).toContain("worker.err.probe");
    expect(mainErr.message).toContain("work item threw");
    expect((mainErr.cause as Error).message).toBe("main boom");
    expect(mainItemNotified).toBe(true);
    expect(mainGroupNotified).toBe(true);

    // 2. Worker-thread throwing DFXWorkItem should match main-thread error wrapping and completion.
    reported.length = 0;
    const sendableSymbol = Symbol.for("syncloudos.dfx.sendable");
    const workerFn = () => {
      throw new Error("worker boom");
    };
    Object.defineProperty(workerFn, sendableSymbol, {
      value: { id: "Contents/index.tsx#0", getCaptures: () => [] },
      configurable: true,
    });
    const workerGroup = new AppGroup();
    let workerItemNotified = false;
    let workerGroupNotified = false;
    const workerItem = new AppWorkItem(workerFn);
    workerItem.notify(AppQueue.main, () => { workerItemNotified = true; });
    queue.async(workerGroup, workerItem);
    workerGroup.notify(AppQueue.main, () => { workerGroupNotified = true; });

    await new Promise(resolve => setTimeout(resolve, 30));
    expect(workers).toHaveLength(1);
    expect(workers[0].posted).toHaveLength(1);
    const jobId = workers[0].posted[0].message.jobs[0].jobId;
    workers[0].emitError(jobId, { name: "Error", message: "worker boom" });
    await new Promise(resolve => setTimeout(resolve, 30));

    expect(reported).toHaveLength(1);
    const workerErr = reported[0] as Error;
    expect(workerErr.message).toContain("worker.err.probe");
    expect(workerErr.message).toContain("work item threw");
    expect((workerErr.cause as Error).message).toBe("worker boom");
    expect(workerItemNotified).toBe(true);
    expect(workerGroupNotified).toBe(true);

    // 3. Cancelled DFXWorkItem whose worker fails before error delivery does not report error, yet still notifies.
    reported.length = 0;
    let cancelledNotified = false;
    const cancelItem = new AppWorkItem(workerFn);
    cancelItem.notify(AppQueue.main, () => { cancelledNotified = true; });
    queue.async(cancelItem);
    await new Promise(resolve => setTimeout(resolve, 30));
    cancelItem.cancel();
    const cancelJobId = workers[0].posted[1].message.jobs[0].jobId;
    workers[0].emitError(cancelJobId, { name: "Error", message: "cancelled boom" });
    await new Promise(resolve => setTimeout(resolve, 30));

    expect(reported).toHaveLength(0);
    expect(cancelledNotified).toBe(true);
  });
});
