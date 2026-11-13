/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { classForLifetime, type DispatchLifetime } from "../internal/lifetime";
import { WorkerPool, computePoolSize } from "../internal/pool/WorkerPool";
import { createPoolWorkerHandler, enqueueWorkerContinuation } from "../internal/pool/poolWorker";
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

  emitResult(jobId: number, workerValues: unknown[] = [], continuations?: { id: string; workerValues: unknown[] }[]): void {
    this.onmessage?.({
      data: continuations ? { type: "result", jobId, workerValues, continuations } : { type: "result", jobId, workerValues },
    } as unknown as MessageEvent<PoolResponseMessage>);
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

describe("DispatchFX runtime fault regressions", () => {
  afterEach(() => {
    WorkerPool.shared.terminateAll();
    delete (globalThis as Record<symbol, unknown>)[Symbol.for("syncloudos.dfx.workerChunks")];
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("barrier waits for earlier concurrent worker jobs before running and blocks later jobs until done", async () => {
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

    const reg = new Map<string, string>([["com.example.barrierprobe", "/virtual/barrier-probe.js"]]);
    (globalThis as Record<symbol, unknown>)[Symbol.for("syncloudos.dfx.workerChunks")] = reg;

    const appLifetime: DispatchLifetime = {
      appId: "com.example.barrierprobe",
      ended: false,
      jobs: new Set(),
      resources: new Set(),
    };
    const AppQueue = classForLifetime(D.DFXQueue, appLifetime);
    const concurrent = new AppQueue("conc.barrier.probe", { attributes: [D.DFXQueueAttributes.concurrent] });
    const child = new AppQueue("conc.barrier.child", { target: concurrent });
    const sendableSymbol = Symbol.for("syncloudos.dfx.sendable");
    const makeSendable = (id: string) => {
      const fn = () => {};
      Object.defineProperty(fn, sendableSymbol, {
        value: { id, getCaptures: () => [] },
        configurable: true,
      });
      return fn;
    };

    const log: string[] = [];
    concurrent.async(makeSendable("w1"));
    child.async(makeSendable("w2_child"));
    concurrent.async({ flags: [D.DFXWorkItemFlags.barrier] }, () => { log.push("barrier"); });
    concurrent.async({ flags: [D.DFXWorkItemFlags.barrier] }, makeSendable("w3_sendable_barrier"));
    concurrent.async(makeSendable("w4_after_barrier"));

    await new Promise(resolve => setTimeout(resolve, 30));

    // Concurrent worker jobs (direct + child) dispatch in parallel, while both barriers and post-barrier work wait.
    const postedBeforeFinish = workers.flatMap(w => w.posted.flatMap(p => p.message.jobs.map(j => ({ worker: w, job: j }))));
    expect(postedBeforeFinish.map(x => x.job.closureId).sort()).toEqual(["w1", "w2_child"]);
    expect(log).toEqual([]);

    // Finishing only w1 must not unblock the barrier while w2_child is still in flight.
    const w1 = postedBeforeFinish.find(x => x.job.closureId === "w1")!;
    w1.worker.emitResult(w1.job.jobId, []);
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(log).toEqual([]);

    // Finishing w2_child runs the main-thread barrier and dispatches the sendable barrier, still blocking w4_after_barrier.
    const w2 = postedBeforeFinish.find(x => x.job.closureId === "w2_child")!;
    w2.worker.emitResult(w2.job.jobId, []);
    await new Promise(resolve => setTimeout(resolve, 30));

    expect(log).toEqual(["barrier"]);
    const postedAfterBarrier = workers.flatMap(w => w.posted.flatMap(p => p.message.jobs.map(j => ({ worker: w, job: j }))));
    expect(postedAfterBarrier.map(x => x.job.closureId)).toContain("w3_sendable_barrier");
    expect(postedAfterBarrier.map(x => x.job.closureId)).not.toContain("w4_after_barrier");

    // Completing the sendable barrier releases w4_after_barrier.
    const w3 = postedAfterBarrier.find(x => x.job.closureId === "w3_sendable_barrier")!;
    w3.worker.emitResult(w3.job.jobId, []);
    await new Promise(resolve => setTimeout(resolve, 30));
    const finalClosures = workers.flatMap(w => w.posted.flatMap(p => p.message.jobs.map(j => j.closureId)));
    expect(finalClosures).toContain("w4_after_barrier");
    const w4 = workers.flatMap(w => w.posted.flatMap(p => p.message.jobs.map(j => ({ worker: w, job: j })))).find(x => x.job.closureId === "w4_after_barrier")!;
    w4.worker.emitResult(w4.job.jobId, []);
  });

  it("overlapping run-batch messages deliver each continuation strictly to its own job", async () => {
    const responses: PoolResponseMessage[] = [];
    type ChunkMod = { __dfxClosures: Record<string, (...args: unknown[]) => unknown> };
    const deferred = (url: string) => {
      let resolve!: (mod: ChunkMod) => void;
      const promise = new Promise<ChunkMod>(res => { resolve = res; });
      return { url, promise, resolve };
    };
    const slowChunk = deferred("/chunk-slow.js");
    const fastChunk = deferred("/chunk-fast.js");

    const handler = createPoolWorkerHandler(
      msg => { responses.push(msg); },
      url => {
        if (url === slowChunk.url) return slowChunk.promise;
        if (url === fastChunk.url) return fastChunk.promise;
        return Promise.reject(new Error("chunk load failed"));
      },
    );

    const batchEvent = (jobs: PoolRequestMessage["jobs"]) =>
      ({ data: { type: "run-batch", jobs } }) as unknown as MessageEvent<PoolRequestMessage>;

    // Overlap batch 1 and batch 2; resolve fastChunk first as well to cover out-of-order chunk availability.
    const batch1 = handler(batchEvent([{ jobId: 101, closureId: "jobA", chunkURL: "/chunk-slow.js", captures: [] }]));
    const batch2 = handler(batchEvent([{ jobId: 202, closureId: "jobB", chunkURL: "/chunk-fast.js", captures: [] }]));

    fastChunk.resolve({
      __dfxClosures: {
        jobB: () => {
          enqueueWorkerContinuation("contB", ["valB"]);
          return ["resB"];
        },
      },
    });
    await Promise.resolve();
    slowChunk.resolve({
      __dfxClosures: {
        jobA: () => {
          enqueueWorkerContinuation("contA", ["valA"]);
          return ["resA"];
        },
      },
    });

    await Promise.all([batch1, batch2]);
    const r1 = responses.find(r => r.jobId === 101);
    const r2 = responses.find(r => r.jobId === 202);
    expect(r1).toEqual({
      type: "result",
      jobId: 101,
      workerValues: ["resA"],
      continuations: [{ id: "contA", workerValues: ["valA"] }],
    });
    expect(r2).toEqual({
      type: "result",
      jobId: 202,
      workerValues: ["resB"],
      continuations: [{ id: "contB", workerValues: ["valB"] }],
    });

    // A chunk load error in an earlier job must still let a subsequent overlapping job settle cleanly.
    const batchFail = handler(batchEvent([{ jobId: 303, closureId: "jobFail", chunkURL: "/chunk-fail.js", captures: [] }]));
    const batchAfterFail = handler(batchEvent([{ jobId: 404, closureId: "jobA", chunkURL: "/chunk-slow.js", captures: [] }]));
    await Promise.all([batchFail, batchAfterFail]);
    expect(responses.find(r => r.jobId === 303)?.type).toBe("error");
    expect(responses.find(r => r.jobId === 404)).toEqual({
      type: "result",
      jobId: 404,
      workerValues: ["resA"],
      continuations: [{ id: "contA", workerValues: ["valA"] }],
    });
  });

  it("postMessage clone failure fails only the non-cloneable job once and never strands or replays valid siblings", async () => {
    const workers: FakeWorker[] = [];
    class CloneCheckingWorker extends FakeWorker {
      override postMessage(message: PoolRequestMessage, transfer?: Transferable[]): void {
        if (message.jobs.some(j => j.captures.some(c => typeof c === "function"))) {
          throw new DOMException("Function object could not be cloned.", "DataCloneError");
        }
        super.postMessage(message, transfer);
      }
    }
    const pool = new WorkerPool({
      maxWorkers: 1,
      createWorker: () => {
        const fw = new CloneCheckingWorker();
        workers.push(fw);
        return fw;
      },
    });

    const j1Res = vi.fn();
    const j1Err = vi.fn();
    const j2Res = vi.fn();
    const j2Err = vi.fn();
    const j3Res = vi.fn();
    const j3Err = vi.fn();
    const j4Res = vi.fn();
    const j4Err = vi.fn();

    pool.submit(makeJob({ closureId: "valid_1", captures: [1], onResult: j1Res, onError: j1Err }));
    pool.submit(makeJob({ closureId: "bad_clone", captures: [() => {}], onResult: j2Res, onError: j2Err }));
    pool.submit(makeJob({ closureId: "valid_3", captures: [3], onResult: j3Res, onError: j3Err }));

    await Promise.resolve();

    expect(j2Err).toHaveBeenCalledTimes(1);
    expect(j2Res).not.toHaveBeenCalled();

    const sentJobs = workers[0].posted.flatMap(p => p.message.jobs);
    expect(sentJobs.map(j => j.closureId)).toEqual(["valid_1", "valid_3"]);

    for (const j of sentJobs) workers[0].emitResult(j.jobId, [j.closureId]);
    expect(j1Res).toHaveBeenCalledTimes(1);
    expect(j1Err).not.toHaveBeenCalled();
    expect(j3Res).toHaveBeenCalledTimes(1);
    expect(j3Err).not.toHaveBeenCalled();

    // Subsequent job must run alone with zero replay of valid_1, bad_clone, or valid_3.
    const countBefore = workers[0].posted.length;
    pool.submit(makeJob({ closureId: "after_valid_4", captures: [4], onResult: j4Res, onError: j4Err }));
    await Promise.resolve();
    const afterJobs = workers[0].posted.slice(countBefore).flatMap(p => p.message.jobs);
    expect(afterJobs.map(j => j.closureId)).toEqual(["after_valid_4"]);
    workers[0].emitResult(afterJobs[0].jobId, ["ok"]);
    expect(j4Res).toHaveBeenCalledTimes(1);
    expect(j1Res).toHaveBeenCalledTimes(1);
    expect(j2Err).toHaveBeenCalledTimes(1);
    expect(j3Res).toHaveBeenCalledTimes(1);
  });

  it("worker-constructor failure settles affected jobs once with no replay and does not strand sibling workers", async () => {
    const workers: FakeWorker[] = [];
    let spawnCount = 0;
    let throwAlways = false;
    const pool = new WorkerPool({
      maxWorkers: 2,
      createWorker: () => {
        spawnCount++;
        if (throwAlways || spawnCount === 2) {
          throw new Error(`worker spawn failed #${spawnCount}`);
        }
        const fw = new FakeWorker();
        workers.push(fw);
        return fw;
      },
    });

    const aRes = vi.fn();
    const aErr = vi.fn();
    const bRes = vi.fn();
    const bErr = vi.fn();
    const q1Res = vi.fn();
    const q1Err = vi.fn();
    const q2Res = vi.fn();
    const q2Err = vi.fn();
    const cRes = vi.fn();
    const cErr = vi.fn();

    // Part A: spawn #1 succeeds for jobA; spawn #2 fails for jobB -> jobA must still dispatch & settle, jobB settles once with error.
    pool.submit(makeJob({ closureId: "sib_ok", onResult: aRes, onError: aErr }));
    pool.submit(makeJob({ closureId: "sib_spawn_fail", onResult: bRes, onError: bErr }));
    await Promise.resolve();

    expect(workers).toHaveLength(1);
    const postedA = workers[0].posted.flatMap(p => p.message.jobs);
    expect(postedA.map(j => j.closureId)).toEqual(["sib_ok"]);
    expect(bErr).toHaveBeenCalledTimes(1);
    expect(bRes).not.toHaveBeenCalled();

    workers[0].emitResult(postedA[0].jobId, ["a_done"]);
    expect(aRes).toHaveBeenCalledTimes(1);
    expect(aErr).not.toHaveBeenCalled();

    // Part B: constructor fails permanently while two jobs wait; recovery later must not replay failed jobs.
    const pool2Workers: FakeWorker[] = [];
    throwAlways = true;
    const pool2 = new WorkerPool({
      maxWorkers: 2,
      createWorker: () => {
        if (throwAlways) throw new Error("ctor down");
        const fw = new FakeWorker();
        pool2Workers.push(fw);
        return fw;
      },
    });

    pool2.submit(makeJob({ closureId: "down_1", onResult: q1Res, onError: q1Err }));
    pool2.submit(makeJob({ closureId: "down_2", onResult: q2Res, onError: q2Err }));
    await Promise.resolve();

    expect(q1Err).toHaveBeenCalledTimes(1);
    expect(q2Err).toHaveBeenCalledTimes(1);
    expect(q1Res).not.toHaveBeenCalled();
    expect(q2Res).not.toHaveBeenCalled();

    throwAlways = false;
    pool2.submit(makeJob({ closureId: "recovered_3", onResult: cRes, onError: cErr }));
    await Promise.resolve();
    expect(pool2Workers).toHaveLength(1);
    const postedC = pool2Workers[0].posted.flatMap(p => p.message.jobs);
    expect(postedC.map(j => j.closureId)).toEqual(["recovered_3"]);
    pool2Workers[0].emitResult(postedC[0].jobId, ["ok"]);
    expect(cRes).toHaveBeenCalledTimes(1);
    expect(q1Err).toHaveBeenCalledTimes(1);
    expect(q2Err).toHaveBeenCalledTimes(1);
  });

  it("cancelling an in-flight work item suppresses its main-thread continuation", async () => {
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

    const reg = new Map<string, string>([["com.example.cancelcont", "/virtual/cancel-cont.js"]]);
    (globalThis as Record<symbol, unknown>)[Symbol.for("syncloudos.dfx.workerChunks")] = reg;

    const appLifetime: DispatchLifetime = {
      appId: "com.example.cancelcont",
      ended: false,
      jobs: new Set(),
      resources: new Set(),
    };
    const AppQueue = classForLifetime(D.DFXQueue, appLifetime);
    const AppWorkItem = classForLifetime(D.DFXWorkItem, appLifetime);
    const queue = new AppQueue("cancel.cont.probe");
    const sendableSymbol = Symbol.for("syncloudos.dfx.sendable");

    const contCalls: unknown[] = [];
    let itemNotified = false;
    const itemFn = () => {};
    Object.defineProperty(itemFn, sendableSymbol, {
      value: {
        id: "Contents/index.tsx#0",
        getCaptures: () => [],
        continuations: [{ id: "cont_0", fn: (...vals: unknown[]) => contCalls.push(vals) }],
      },
      configurable: true,
    });
    const item = new AppWorkItem(itemFn);
    item.notify(AppQueue.main, () => { itemNotified = true; });
    queue.async(item);

    await new Promise(resolve => setTimeout(resolve, 30));
    expect(workers).toHaveLength(1);
    expect(workers[0].posted).toHaveLength(1);
    const jobId1 = workers[0].posted[0].message.jobs[0].jobId;

    // Cancel while in flight on the worker, then let worker respond with a continuation.
    item.cancel();
    workers[0].emitResult(jobId1, [], [{ id: "cont_0", workerValues: ["stale-after-cancel"] }]);
    await new Promise(resolve => setTimeout(resolve, 30));

    expect(contCalls).toEqual([]);
    expect(itemNotified).toBe(true);

    // Also verify cancelling after result arrives before mainQueue runs suppresses the continuation.
    let item2Notified = false;
    const item2 = new AppWorkItem(itemFn);
    item2.notify(AppQueue.main, () => { item2Notified = true; });
    queue.async(item2);
    await new Promise(resolve => setTimeout(resolve, 30));
    const jobId2 = workers[0].posted[1].message.jobs[0].jobId;
    workers[0].emitResult(jobId2, [], [{ id: "cont_0", workerValues: ["cancelled-before-main"] }]);
    item2.cancel();
    await new Promise(resolve => setTimeout(resolve, 30));

    expect(contCalls).toEqual([]);
    expect(item2Notified).toBe(true);
  });

  it("ending one session does not suppress a live sibling session with the same bundle ID", async () => {
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

    const sharedAppId = "com.example.sharedsibling";
    const reg = new Map<string, string>([[sharedAppId, "/virtual/shared-sibling.js"]]);
    (globalThis as Record<symbol, unknown>)[Symbol.for("syncloudos.dfx.workerChunks")] = reg;

    const makeLifetime = (): DispatchLifetime => ({
      appId: sharedAppId,
      ended: false,
      jobs: new Set(),
      resources: new Set(),
    });
    const endLifetime = (lifetime: DispatchLifetime) => {
      lifetime.ended = true;
      for (const set of [lifetime.jobs, lifetime.resources]) {
        for (const dispose of [...set]) dispose();
        set.clear();
      }
    };

    const lifetimeA = makeLifetime();
    const lifetimeB = makeLifetime();
    const QueueA = classForLifetime(D.DFXQueue, lifetimeA);
    const QueueB = classForLifetime(D.DFXQueue, lifetimeB);
    const qA = new QueueA("sibling.a");
    const qB = new QueueB("sibling.b");

    const sendableSymbol = Symbol.for("syncloudos.dfx.sendable");
    const seenA: unknown[] = [];
    const seenB: unknown[] = [];
    const fnA = () => {};
    Object.defineProperty(fnA, sendableSymbol, {
      value: { id: "sibA#0", getCaptures: () => [], continuations: [{ id: "cA", fn: (v: unknown) => seenA.push(v) }] },
      configurable: true,
    });
    const fnB = () => {};
    Object.defineProperty(fnB, sendableSymbol, {
      value: { id: "sibB#0", getCaptures: () => [], continuations: [{ id: "cB", fn: (v: unknown) => seenB.push(v) }] },
      configurable: true,
    });

    qA.async(fnA);
    qB.async(fnB);
    await new Promise(resolve => setTimeout(resolve, 30));

    const postedJobs = workers.flatMap(w => w.posted.flatMap(p => p.message.jobs.map(j => ({ worker: w, job: j }))));
    const jobA = postedJobs.find(x => x.job.closureId === "sibA#0")!;
    const jobB = postedJobs.find(x => x.job.closureId === "sibB#0")!;
    expect(jobA).toBeDefined();
    expect(jobB).toBeDefined();

    // Ending session A must cancel A without suppressing live sibling session B (same bundle ID).
    endLifetime(lifetimeA);

    jobA.worker.emitResult(jobA.job.jobId, [], [{ id: "cA", workerValues: ["stale-a"] }]);
    jobB.worker.emitResult(jobB.job.jobId, [], [{ id: "cB", workerValues: ["alive-b"] }]);

    await new Promise(resolve => setTimeout(resolve, 30));
    expect(seenA).toEqual([]);
    expect(seenB).toEqual(["alive-b"]);
  });
});
