import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DFXPredicate, DFXQoS, DFXQueue, DFXQueueAttributes, DFXSpecificKey, DFXWorkItemFlags, dispatchPrecondition } from "./systemDispatch";
import { currentExecution } from "../internal/executionStack";
import { objectState } from "../internal/queueState";

let tasks: (() => void)[];
let reportError: ReturnType<typeof vi.fn>;
let expectedReports: number;
beforeEach(() => {
  tasks = []; expectedReports = 0; reportError = vi.fn();
  vi.stubGlobal("reportError", reportError);
  vi.stubGlobal("scheduler", { postTask: (run: () => void) => { tasks.push(run); return Promise.resolve(); } });
});
afterEach(() => {
  try {
    for (let n = 0; tasks.length && n < 100; n++) tasks.shift()!();
    expect(tasks).toHaveLength(0);
    expect(reportError).toHaveBeenCalledTimes(expectedReports);
    expect(currentExecution()).toBeUndefined();
  } finally { vi.unstubAllGlobals(); vi.restoreAllMocks(); }
});
const A = DFXQueueAttributes;
const F = DFXWorkItemFlags;

it("sync drains earlier pending items in order, then runs inline and returns the value", () => {
  const queue = new DFXQueue("sync-order"); const events: number[] = [];
  queue.async(() => { events.push(1); }); queue.async(() => { events.push(2); });
  const value: number = queue.sync(() => { events.push(3); return 42; });
  expect(value).toBe(42); expect(events).toEqual([1, 2, 3]);
});
it("sync preserves submission target snapshots while draining", () => {
  const oldTarget = new DFXQueue("sync-old"); const newTarget = new DFXQueue("sync-new");
  const leaf = new DFXQueue("sync-leaf", { target: oldTarget }); const key = new DFXSpecificKey<string>();
  oldTarget.setSpecific(key, "old"); newTarget.setSpecific(key, "new"); const values: unknown[] = [];
  leaf.async(() => { values.push(DFXQueue.getSpecific(key)); }); leaf.setTarget(newTarget);
  leaf.sync(() => { values.push(DFXQueue.getSpecific(key)); });
  expect(values).toEqual(["old", "new"]);
});
it("nullable construction uses the default root and null reset preserves active submissions", () => {
  const parent = new DFXQueue("sync-null-parent", { qos: DFXQoS.userInteractive });
  const key = new DFXSpecificKey<string>(); parent.setSpecific(key, "parent");
  const queue = new DFXQueue("sync-null-reset", { target: parent });
  const defaultQueue = new DFXQueue("sync-null-constructor", { target: null }); const values: unknown[] = [];
  defaultQueue.sync(() => { expect(currentExecution()?.qos).toBe(DFXQoS.default); expect(DFXQueue.getSpecific(key)).toBeUndefined(); });
  queue.async(() => { values.push([DFXQueue.getSpecific(key), currentExecution()?.qos]); });
  queue.setTarget(null);
  queue.sync(() => { values.push([DFXQueue.getSpecific(key), currentExecution()?.qos]); });
  expect(values).toEqual([["parent", DFXQoS.userInteractive], [undefined, DFXQoS.default]]);
});
it("null reset of an inactive ancestor updates saved suffixes and retains leaf FIFO", () => {
  const oldTarget = new DFXQueue("sync-null-old", { qos: DFXQoS.userInteractive });
  const inactive = new DFXQueue("sync-null-inactive", { attributes: [A.initiallyInactive], target: oldTarget });
  const child = new DFXQueue("sync-null-child", { target: inactive }); const key = new DFXSpecificKey<string>();
  oldTarget.setSpecific(key, "old"); inactive.setSpecific(key, "inactive"); const values: unknown[] = [];
  child.async(() => { values.push([DFXQueue.getSpecific(key), currentExecution()?.qos]); });
  child.setTarget(null); inactive.setTarget(null); inactive.activate();
  child.sync(() => { values.push([DFXQueue.getSpecific(key), currentExecution()?.qos]); });
  expect(values).toEqual([["inactive", DFXQoS.default], [undefined, DFXQoS.default]]);
});
it.each(["main", "global"] as const)("%s ignores target changes including a null reset", kind => {
  const queue = kind === "main" ? DFXQueue.main : DFXQueue.global();
  const assignedQoS = queue.qos;
  const target = new DFXQueue(`sync-${kind}-ignored-target`, { qos: DFXQoS.background });
  const key = new DFXSpecificKey<string>(); target.setSpecific(key, "ignored");
  expect(() => queue.setTarget(target)).not.toThrow(); expect(() => queue.setTarget(null)).not.toThrow();
  queue.sync(() => { expect(DFXQueue.getSpecific(key)).toBeUndefined(); });
  expect(queue.qos).toBe(assignedQoS);
});
it("sync drains serial target predecessors before its block", () => {
  const target = new DFXQueue("sync-target"); const sibling = new DFXQueue("sync-sibling", { target });
  const leaf = new DFXQueue("sync-child", { target }); const events: string[] = [];
  sibling.async(() => { events.push("sibling"); }); target.async(() => { events.push("target"); });
  leaf.sync(() => { events.push("sync"); }); expect(events).toEqual(["sibling", "target", "sync"]);
});
it("sync drains earlier concurrent-target barriers and their predecessors", () => {
  const target = new DFXQueue("sync-barrier-target", { attributes: [A.concurrent] });
  const before = new DFXQueue("sync-before", { target }); const after = new DFXQueue("sync-after", { target });
  const events: string[] = [];
  before.async(() => { events.push("before"); }); target.async({ flags: [F.barrier] }, () => { events.push("barrier"); });
  after.sync(() => { events.push("sync"); }); expect(events).toEqual(["before", "barrier", "sync"]);
});
it("sync barrier drains earlier descendants and owns its concurrent queue as a barrier", () => {
  const target = new DFXQueue("sync-barrier", { attributes: [A.concurrent] });
  const child = new DFXQueue("sync-barrier-child", { target }); const events: string[] = [];
  child.async(() => { events.push("child"); });
  target.sync([F.barrier], () => { dispatchPrecondition(DFXPredicate.onQueueAsBarrier(target)); events.push("barrier"); });
  expect(events).toEqual(["child", "barrier"]);
});
it("sync global barriers remain ignored", () => {
  const global = DFXQueue.global();
  global.sync([F.barrier], () => { expect(() => dispatchPrecondition(DFXPredicate.onQueueAsBarrier(global))).toThrow(/^BUG IN CLIENT/); });
});
it("sync onto a queue on the current stack throws with the direct label chain", () => {
  const queue = new DFXQueue("sync-direct"); const work = vi.fn();
  queue.sync(() => { expect(() => queue.sync(work)).toThrow(/^BUG IN CLIENT OF LIBDISPATCH: .*sync-direct.*sync-direct/); });
  expect(work).not.toHaveBeenCalled();
});
it("sync onto a queue on the current stack throws through the full target chain", () => {
  const target = new DFXQueue("sync-ancestor"); const middle = new DFXQueue("sync-middle", { target });
  const leaf = new DFXQueue("sync-descendant", { target: middle });
  leaf.sync(() => { expect(() => target.sync(() => {})).toThrow(/sync-descendant -> sync-middle -> sync-ancestor.*sync-ancestor/); });
});
it("sync through a held serial target throws with both full label chains", () => {
  const target = new DFXQueue("sync-shared-serial");
  const first = new DFXQueue("sync-owner", { target }); const second = new DFXQueue("sync-waiter", { target });
  first.sync(() => { expect(() => second.sync(() => {})).toThrow(/sync-owner -> sync-shared-serial.*sync-waiter -> sync-shared-serial/); });
});
it("sync onto main from a main item throws with the main label chain", () => {
  DFXQueue.main.async(() => { expect(() => DFXQueue.main.sync(() => {})).toThrow(/com\.apple\.main-thread.*com\.apple\.main-thread/); });
  tasks.shift()!();
});
it("sync detects queues held by an outer frame and includes every frame's labels", () => {
  const outer = new DFXQueue("sync-outer"); const inner = new DFXQueue("sync-inner");
  outer.sync(() => inner.sync(() => { expect(() => outer.sync(() => {})).toThrow(/sync-outer.*sync-inner.*sync-outer/); }));
});
it("independent queues sharing a concurrent global target are not deadlocked", () => {
  const target = DFXQueue.global(); const first = new DFXQueue("sync-independent-a", { target });
  const second = new DFXQueue("sync-independent-b", { target });
  expect(first.sync(() => second.sync(() => 7))).toBe(7);
});
it("sync onto a queue with a worker item in flight throws", () => {
  const queue = new DFXQueue("sync-worker-stub"); const work = vi.fn();
  // Plan-authorised internal test port; no pool or public worker API exists in Tier 0.
  const state = objectState(queue) as ReturnType<typeof objectState> & { workerInFlight: boolean };
  state.workerInFlight = true;
  try { expect(() => queue.sync(work)).toThrow(/^BUG IN CLIENT OF LIBDISPATCH: .*worker.*sync-worker-stub/); }
  finally { state.workerInFlight = false; }
  expect(work).not.toHaveBeenCalled(); expect(queue.sync(() => 1)).toBe(1);
});
it("sync rejects an in-flight worker on the target chain", () => {
  const target = new DFXQueue("sync-worker-target"); const child = new DFXQueue("sync-worker-child", { target });
  const state = objectState(target) as ReturnType<typeof objectState> & { workerInFlight: boolean };
  state.workerInFlight = true;
  try { expect(() => child.sync(() => {})).toThrow(/worker.*sync-worker-child -> sync-worker-target/); }
  finally { state.workerInFlight = false; }
});
it("higher-QoS sync boosts the lower-QoS items ahead of it", () => {
  const lower = new DFXQueue("sync-lower", { qos: DFXQoS.background });
  const higher = new DFXQueue("sync-higher", { qos: DFXQoS.userInteractive }); const values: unknown[] = [];
  lower.async(() => { values.push(currentExecution()?.qos); });
  higher.sync(() => lower.sync(() => { values.push(currentExecution()?.qos); }));
  expect(values).toEqual([DFXQoS.userInteractive, DFXQoS.userInteractive]); expect(lower.qos).toBe(DFXQoS.background);
  lower.sync(() => { expect(currentExecution()?.qos).toBe(DFXQoS.background); });
});
it("sync boosts serial-target predecessors without changing their assigned QoS", () => {
  const target = new DFXQueue("sync-boost-target", { qos: DFXQoS.background });
  const sibling = new DFXQueue("sync-boost-sibling", { target }); const child = new DFXQueue("sync-boost-child", { target });
  const caller = new DFXQueue("sync-boost-caller", { qos: DFXQoS.userInitiated }); const values: unknown[] = [];
  sibling.async(() => { values.push(currentExecution()?.qos); });
  caller.sync(() => child.sync(() => { values.push(currentExecution()?.qos); }));
  expect(values).toEqual([DFXQoS.userInitiated, DFXQoS.userInitiated]); expect(target.qos).toBe(DFXQoS.background);
});
it.each(["inactive", "suspended"] as const)("sync fails boundedly for an %s predecessor and never queues the failed block", state => {
  const oldTarget = new DFXQueue(`sync-blocked-${state}`, { attributes: state === "inactive" ? [A.initiallyInactive] : [] });
  if (state === "suspended") oldTarget.suspend();
  const leaf = new DFXQueue(`sync-blocked-leaf-${state}`, { target: oldTarget }); const old = vi.fn(); const sync = vi.fn();
  leaf.async(old); leaf.setTarget(new DFXQueue(`sync-runnable-${state}`));
  expect(() => leaf.sync(sync)).toThrow(/^BUG IN CLIENT OF LIBDISPATCH: .*cannot.*drain/);
  expect(old).not.toHaveBeenCalled(); expect(sync).not.toHaveBeenCalled();
  if (state === "inactive") oldTarget.activate(); else oldTarget.resume();
  for (let n = 0; tasks.length && n < 100; n++) tasks.shift()!();
  expect(old).toHaveBeenCalledTimes(1); expect(sync).not.toHaveBeenCalled();
});
it.each(["inactive", "suspended"] as const)("sync fails on an %s target without executing its block later", state => {
  const queue = new DFXQueue(`sync-unavailable-${state}`, { attributes: state === "inactive" ? [A.initiallyInactive] : [] });
  if (state === "suspended") queue.suspend(); const work = vi.fn();
  expect(() => queue.sync(work)).toThrow(/^BUG IN CLIENT OF LIBDISPATCH: .*cannot.*drain/);
  if (state === "inactive") queue.activate(); else queue.resume();
  for (let n = 0; tasks.length && n < 100; n++) tasks.shift()!();
  expect(work).not.toHaveBeenCalled();
});
it("sync does not execute independent pending queues while draining its predecessors", () => {
  const unrelated = vi.fn(); new DFXQueue("sync-unrelated", { qos: DFXQoS.userInteractive }).async(unrelated);
  const queue = new DFXQueue("sync-local", { qos: DFXQoS.background }); const before = vi.fn(); queue.async(before);
  queue.sync(() => { expect(before).toHaveBeenCalledTimes(1); expect(unrelated).not.toHaveBeenCalled(); });
});
it("sync propagates the original exception and clears frames and temporary QoS overrides", () => {
  const lower = new DFXQueue("sync-throw-lower", { qos: DFXQoS.background });
  const higher = new DFXQueue("sync-throw-higher", { qos: DFXQoS.userInteractive }); const error = new Error("sync original");
  expect(() => higher.sync(() => lower.sync(() => { throw error; }))).toThrow(error);
  expect(currentExecution()).toBeUndefined(); expect(reportError).not.toHaveBeenCalled();
  lower.sync(() => { expect(currentExecution()?.qos).toBe(DFXQoS.background); });
});
it("a throwing predecessor reports once and releases its frame before sync", () => {
  expectedReports = 1; const queue = new DFXQueue("sync-predecessor-throw");
  queue.async(() => { throw new Error("earlier"); });
  expect(queue.sync(() => 9)).toBe(9); expect(currentExecution()).toBeUndefined();
});
it("failed draining clears temporary overrides before the queue becomes runnable", () => {
  const lower = new DFXQueue("sync-failed-boost", { qos: DFXQoS.background }); lower.suspend();
  const higher = new DFXQueue("sync-failed-caller", { qos: DFXQoS.userInteractive });
  higher.sync(() => { expect(() => lower.sync(() => {})).toThrow(/^BUG IN CLIENT/); }); lower.resume();
  lower.sync(() => { expect(currentExecution()?.qos).toBe(DFXQoS.background); });
});
it("sync rejects PromiseLike work in both overloads and reports thenables once at runtime", () => {
  expectedReports = 2; const queue = new DFXQueue("sync-thenable"); const then = vi.fn((resolve: () => void) => resolve());
  // @ts-expect-error Native Promise return values are forbidden in sync work.
  queue.sync(async () => 1);
  // @ts-expect-error Custom PromiseLike returns are forbidden in the flags overload too.
  queue.sync([], () => ({ then } as PromiseLike<void>));
  expect(then).toHaveBeenCalledTimes(1);
  expect(reportError.mock.calls.every(([error]) => error.message === "DispatchFX work items are synchronous. Use DFXGroup enter() and leave() around asynchronous work.")).toBe(true);
});
it("work types reject unions containing PromiseLike while preserving synchronous union inference", () => {
  const queue = new DFXQueue("sync-return-unions");
  const nativeUnion = (): void | Promise<void> => undefined;
  const thenableUnion = (): number | PromiseLike<number> => 1;
  if (false) {
    // @ts-expect-error A sync return union containing a native Promise is forbidden.
    queue.sync(nativeUnion);
    // @ts-expect-error The flags sync overload rejects the same native Promise union.
    queue.sync([], nativeUnion);
    // @ts-expect-error Ordinary async work rejects a native Promise return union.
    queue.async(nativeUnion);
    // @ts-expect-error Async options do not admit a native Promise return union.
    queue.async({}, nativeUnion);
    // @ts-expect-error Iteration work rejects a native Promise return union.
    DFXQueue.concurrentPerform(1, nativeUnion);
    // @ts-expect-error A custom PromiseLike member also invalidates a sync return union.
    queue.sync(thenableUnion);
    // @ts-expect-error The flags sync overload rejects a custom PromiseLike union.
    queue.sync([], thenableUnion);
    // @ts-expect-error Ordinary async work rejects a custom PromiseLike return union.
    queue.async(thenableUnion);
    // @ts-expect-error Async options reject a custom PromiseLike return union.
    queue.async({}, thenableUnion);
    // @ts-expect-error Iteration work rejects a custom PromiseLike return union.
    DFXQueue.concurrentPerform(1, thenableUnion);
  }
  const synchronousUnion = (): 1 | "two" => 1;
  const value: 1 | "two" = queue.sync(synchronousUnion);
  const flagsValue: 1 | "two" = queue.sync([], synchronousUnion);
  queue.async(synchronousUnion); queue.async({}, synchronousUnion);
  DFXQueue.concurrentPerform(1, synchronousUnion);
  expect([value, flagsValue]).toEqual([1, 1]);
});
it("sync validates flags and work without scheduling a failed call", () => {
  const queue = new DFXQueue("sync-validation"); const work = vi.fn();
  expect(() => queue.sync([{} as DFXWorkItemFlags], work)).toThrow(/^BUG IN CLIENT/);
  expect(() => queue.sync(null as unknown as DFXWorkItemFlags[], work)).toThrow(/^BUG IN CLIENT/);
  expect(() => queue.sync(undefined as unknown as () => void)).toThrow(/^BUG IN CLIENT/);
  expect(work).not.toHaveBeenCalled();
});
