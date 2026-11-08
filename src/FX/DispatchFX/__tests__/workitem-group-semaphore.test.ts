import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DFXGroup, DFXObject, DFXQoS, DFXQueue, DFXQueueAttributes, DFXSemaphore, DFXSpecificKey, DFXTime, DFXTimeInterval, DFXTimeoutResult, DFXWallTime, DFXWorkItem, DFXWorkItemFlags } from "../public";
import { currentExecution } from "../internal/executionStack";
import { objectState } from "../internal/queueState";

let tasks: (() => void)[];
let reports: ReturnType<typeof vi.fn>;
let expectedReports: number;
beforeEach(() => {
  tasks = []; expectedReports = 0; reports = vi.fn();
  vi.stubGlobal("reportError", reports);
  vi.stubGlobal("scheduler", { postTask: (run: () => void) => { tasks.push(run); return Promise.resolve(); } });
});
afterEach(() => {
  try {
    for (let n = 0; tasks.length && n < 100; n++) tasks.shift()!();
    expect(tasks).toHaveLength(0); expect(reports).toHaveBeenCalledTimes(expectedReports);
    expect(currentExecution()).toBeUndefined();
  } finally { vi.unstubAllGlobals(); vi.restoreAllMocks(); }
});
function flush(): void { for (let n = 0; tasks.length && n < 100; n++) tasks.shift()!(); }
const message = "BUG IN CLIENT OF LIBDISPATCH: blocking wait on the main thread cannot be satisfied in the browser; use notify(queue:)";
const later = () => DFXTime.now().advanced(DFXTimeInterval.seconds(10));

it("uses Apple's class inheritance and real constructor forms", () => {
  const group = new DFXGroup(); const semaphore = new DFXSemaphore(1);
  const item = new DFXWorkItem(() => 1);
  expect(group).toBeInstanceOf(DFXObject); expect(semaphore).toBeInstanceOf(DFXObject);
  expect(item).toBeInstanceOf(DFXWorkItem); expect(item).not.toBeInstanceOf(DFXObject);
  expect(item.isCancelled).toBe(false); expect(item.perform()).toBeUndefined();
});
it("cancelled work item that has not started never runs; notify still fires", () => {
  const queue = new DFXQueue("cancel-pending"); const events: string[] = [];
  const item = new DFXWorkItem(() => { events.push("body"); });
  item.notify(queue, () => { events.push("notified"); }); queue.async(item); item.cancel(); item.cancel();
  expect(item.isCancelled).toBe(true); expect(events).toEqual([]);
  flush(); expect(events).toEqual(["notified"]);
});
it("cancellation alone does not complete a work item until execution is attempted", () => {
  const queue = new DFXQueue("cancel-unsubmitted"); const run = vi.fn();
  const item = new DFXWorkItem(run); item.cancel(); item.notify(queue, run); flush();
  expect(run).not.toHaveBeenCalled(); expect(item.wait(DFXTime.now())).toBe(DFXTimeoutResult.timedOut);
  item.perform(); flush(); expect(run).toHaveBeenCalledTimes(1);
});
it("cancellation during execution does not interrupt the running body", () => {
  const events: number[] = [];
  const item = new DFXWorkItem(() => { events.push(1); item.cancel(); events.push(2); });
  item.perform(); item.perform(); expect(events).toEqual([1, 2]); expect(item.isCancelled).toBe(true);
});
it("allows repeated performance but observes the first completion only", () => {
  const queue = new DFXQueue("repeat-item"); const body = vi.fn(); const notify = vi.fn();
  const item = new DFXWorkItem(body); item.notify(queue, notify); item.perform(); item.perform(); flush();
  expect(body).toHaveBeenCalledTimes(2); expect(notify).toHaveBeenCalledTimes(1);
  item.notify(queue, notify); expect(notify).toHaveBeenCalledTimes(1); flush(); expect(notify).toHaveBeenCalledTimes(2);
});
it("group notify fires once after all async items and enter/leave pairs", () => {
  const group = new DFXGroup(); const queue = new DFXQueue("group-notify"); const events: string[] = [];
  group.enter(); queue.async({ group }, () => { events.push("closure"); });
  queue.async(group, new DFXWorkItem(() => { events.push("item"); }));
  group.notify(queue, () => { events.push("notify"); }); flush();
  expect(events).toEqual(["closure", "item"]); group.leave(); expect(events).toHaveLength(2);
  flush(); expect(events).toEqual(["closure", "item", "notify"]); flush(); expect(events).toHaveLength(3);
});
it("notifies an empty group asynchronously and supports later group generations", () => {
  const group = new DFXGroup(); const queue = new DFXQueue("group-generation"); const events: number[] = [];
  group.notify(queue, () => { events.push(1); }); expect(events).toEqual([]);
  group.enter(); group.notify(queue, () => { events.push(2); }); flush(); expect(events).toEqual([1]);
  group.leave(); group.enter(); flush(); expect(events).toEqual([1, 2]); group.leave();
});
it("leave without enter throws Unbalanced call to dispatch_group_leave()", () => {
  const group = new DFXGroup();
  expect(() => group.leave()).toThrowError("BUG IN CLIENT OF LIBDISPATCH: Unbalanced call to dispatch_group_leave()");
  group.enter(); group.leave(); expect(group.wait(DFXTime.now())).toBe(DFXTimeoutResult.success);
});
it("automatically balances cancelled work items and throwing closures exactly once", () => {
  expectedReports = 1; const group = new DFXGroup(); const queue = new DFXQueue("group-finally");
  const item = new DFXWorkItem(() => { throw new Error("cancelled body"); }); item.cancel();
  queue.async(group, item); queue.async({ group }, () => { throw new Error("closure"); });
  expect(group.wait(later())).toBe(DFXTimeoutResult.success);
  expect(() => group.leave()).toThrow("Unbalanced call to dispatch_group_leave()");
});
it("supports notify WorkItem overloads and their cancellation semantics", () => {
  const group = new DFXGroup(); const queue = new DFXQueue("notify-item"); const events: number[] = [];
  const source = new DFXWorkItem(() => { events.push(1); });
  source.notify(queue, new DFXWorkItem(() => { events.push(2); }));
  const cancelled = new DFXWorkItem(() => { events.push(99); }); cancelled.cancel();
  group.notify(queue, cancelled); group.notify(queue, new DFXWorkItem(() => { events.push(3); }));
  source.perform(); flush(); expect(events).toEqual([1, 3, 2]);
  expect(cancelled.wait(DFXTime.now())).toBe(DFXTimeoutResult.success);
});
it("accepts notify options with synchronous value callbacks and resolves their QoS", () => {
  const group = new DFXGroup(); const queue = new DFXQueue("notify-options"); const observed: unknown[] = [];
  const item = new DFXWorkItem(() => 42);
  group.notify(queue, { qos: DFXQoS.userInteractive, flags: [DFXWorkItemFlags.enforceQoS] }, () => { observed.push(currentExecution()?.qos); return 1; });
  item.notify(queue, { qos: DFXQoS.background }, () => { observed.push(currentExecution()?.qos); });
  item.perform(); flush(); expect(observed).toEqual([DFXQoS.userInteractive, DFXQoS.background]);
});
it("group wait drains in-realm work and returns success", () => {
  const group = new DFXGroup(); const queue = new DFXQueue("group-drain"); const events: number[] = [];
  queue.async({ group }, () => { events.push(1); }); queue.async({ group }, () => { events.push(2); });
  expect(group.wait(later())).toBe(DFXTimeoutResult.success); expect(events).toEqual([1, 2]);
  expect(group.wait()).toBeUndefined(); flush(); expect(events).toEqual([1, 2]);
});
it("work item wait drains its in-realm queue through the required item only", () => {
  const queue = new DFXQueue("item-drain"); const independent = new DFXQueue("item-independent"); const events: number[] = [];
  const item = new DFXWorkItem(() => { events.push(2); });
  queue.async(() => { events.push(1); }); queue.async(item); queue.async(() => { events.push(3); });
  independent.async(() => { events.push(4); });
  expect(item.wait(later())).toBe(DFXTimeoutResult.success); expect(events).toEqual([1, 2]);
  expect(item.wait()).toBeUndefined(); flush(); expect(events).toEqual([1, 2, 3, 4]);
});
it("waits drain saved target predecessors and concurrent barriers", () => {
  const group = new DFXGroup(); const target = new DFXQueue("wait-target", { attributes: [DFXQueueAttributes.concurrent] });
  const leaf = new DFXQueue("wait-leaf", { target }); const next = new DFXQueue("wait-retarget"); const events: number[] = [];
  target.async(() => { events.push(1); }); target.async({ flags: [DFXWorkItemFlags.barrier] }, () => { events.push(2); });
  leaf.async({ group }, () => { events.push(3); }); leaf.setTarget(next);
  expect(group.wait(later())).toBe(DFXTimeoutResult.success); expect(events).toEqual([1, 2, 3]);
});
it("group waits can drain another associated job that releases a suspended member", () => {
  const group = new DFXGroup(); const held = new DFXQueue("wait-held"); const ready = new DFXQueue("wait-ready");
  held.suspend(); const run = vi.fn(); held.async({ group }, run); ready.async({ group }, () => { held.resume(); });
  expect(group.wait(later())).toBe(DFXTimeoutResult.success); expect(run).toHaveBeenCalledTimes(1);
});
it("drains work enrolled by a group member before that group becomes empty", () => {
  const group = new DFXGroup(); const queue = new DFXQueue("nested-group"); const events: number[] = [];
  queue.async({ group }, () => { events.push(1); queue.async({ group }, () => { events.push(2); }); });
  expect(group.wait(later())).toBe(DFXTimeoutResult.success); expect(events).toEqual([1, 2]);
});
it.each(["expired", "now", "future", "omitted"] as const)("bounds growing group drains for %s waits and preserves pending work and QoS", mode => {
  let clock = 100; let runs = 0; let producing = true;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  const group = new DFXGroup(); const queue = new DFXQueue(`growing-${mode}`, { qos: DFXQoS.background });
  const caller = new DFXQueue(`growing-caller-${mode}`, { qos: DFXQoS.userInteractive });
  const notificationQueue = new DFXQueue(`growing-notify-${mode}`); const notify = vi.fn(); const observed: unknown[] = [];
  // The finite cap makes the old unbounded implementation fail without hanging
  // the runner. Each body returns synchronously and maintains one group entry.
  const work = (): void => {
    runs++; clock++; observed.push(currentExecution()?.qos);
    if (producing && runs < 20) queue.async({ group }, work);
  };
  queue.async({ group }, work); group.notify(notificationQueue, notify);
  try {
    caller.sync(() => {
      if (mode === "expired" || mode === "now") {
        expect(group.wait(mode === "expired" ? new DFXTime(0) : DFXTime.now())).toBe(DFXTimeoutResult.timedOut);
      } else if (mode === "future") expect(() => group.wait(later())).toThrowError(message);
      else expect(() => group.wait()).toThrowError(message);
      expect(currentExecution()?.qos).toBe(DFXQoS.userInteractive);
    });
    expect(runs).toBe(5); expect(notify).not.toHaveBeenCalled(); expect(currentExecution()).toBeUndefined();
    queue.suspend(); expect(group.wait(DFXTime.now())).toBe(DFXTimeoutResult.timedOut); queue.resume();
    producing = false; expect(group.wait(later())).toBe(DFXTimeoutResult.success); expect(runs).toBe(6);
    expect(observed).toEqual([...Array(5).fill(DFXQoS.userInteractive), DFXQoS.background]);
    flush(); expect(notify).toHaveBeenCalledTimes(1); expect(group.wait()).toBeUndefined();
    expect(() => group.leave()).toThrow("Unbalanced call to dispatch_group_leave()"); expect(queue.qos).toBe(DFXQoS.background);
  } finally { producing = false; flush(); }
});
it("returns from a continuously reenrolling group at an atomic slice boundary", () => {
  let clock = 100; let runs = 0; let producing = true;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  const group = new DFXGroup(); const queue = new DFXQueue("continuous-group"); const notificationQueue = new DFXQueue("continuous-notify"); const notify = vi.fn();
  const work = (): void => { runs++; clock += 2; if (producing) queue.async({ group }, work); };
  queue.async({ group }, work); group.notify(notificationQueue, notify);
  try {
    expect(group.wait(DFXTime.now())).toBe(DFXTimeoutResult.timedOut);
    expect(runs).toBe(3); expect(clock).toBe(106); expect(notify).not.toHaveBeenCalled();
    producing = false; expect(group.wait()).toBeUndefined(); expect(runs).toBe(4);
    flush(); expect(notify).toHaveBeenCalledTimes(1); expect(() => group.leave()).toThrow("Unbalanced call to dispatch_group_leave()");
  } finally { producing = false; flush(); }
});
it("completes a group whose final atomic body crosses the cooperative slice", () => {
  let clock = 100; vi.spyOn(performance, "now").mockImplementation(() => clock);
  const group = new DFXGroup(); const queue = new DFXQueue("atomic-group"); let completed = false;
  queue.async({ group }, () => { clock += 7; completed = true; });
  expect(group.wait(DFXTime.now())).toBe(DFXTimeoutResult.success); expect(completed).toBe(true); expect(clock).toBe(107);
});
it("keeps fixed WorkItem predecessor drains independent of the group slice budget", () => {
  let clock = 100; vi.spyOn(performance, "now").mockImplementation(() => clock);
  const queue = new DFXQueue("fixed-item-predecessors"); const events: number[] = [];
  queue.async(() => { clock += 7; events.push(1); }); queue.async(() => { clock += 7; events.push(2); });
  const item = new DFXWorkItem(() => { clock += 7; events.push(3); }); queue.async(item);
  expect(item.wait(DFXTime.now())).toBe(DFXTimeoutResult.success); expect(events).toEqual([1, 2, 3]); expect(clock).toBe(121);
});
it.each(["item", "group"] as const)("%s now waits return timedOut for undrainable work without dropping it", kind => {
  const queue = new DFXQueue(`now-${kind}`); queue.suspend(); const run = vi.fn();
  const item = new DFXWorkItem(run); const group = new DFXGroup(); queue.async(group, item);
  const waited = kind === "item" ? item : group;
  expect(waited.wait(DFXTime.now())).toBe(DFXTimeoutResult.timedOut); expect(run).not.toHaveBeenCalled();
  queue.resume(); expect(waited.wait(later())).toBe(DFXTimeoutResult.success); expect(run).toHaveBeenCalledTimes(1);
});
it.each(["item", "group"] as const)("%s future waits use the pinned message and preserve pending work", kind => {
  const queue = new DFXQueue(`future-${kind}`, { attributes: [DFXQueueAttributes.initiallyInactive] }); const run = vi.fn();
  const item = new DFXWorkItem(run); const group = new DFXGroup(); queue.async(group, item); const waited = kind === "item" ? item : group;
  expect(() => waited.wait(later())).toThrowError(message); expect(() => waited.wait()).toThrowError(message);
  queue.activate(); flush(); expect(run).toHaveBeenCalledTimes(1); expect(group.wait()).toBeUndefined();
});
it("unsubmitted items and manually entered groups obey immediate and future wait rules", () => {
  const item = new DFXWorkItem(() => {}); const group = new DFXGroup(); group.enter();
  for (const value of [item, group]) {
    expect(value.wait(DFXTime.now())).toBe(DFXTimeoutResult.timedOut); expect(() => value.wait(later())).toThrowError(message);
  }
  group.leave(); item.perform();
});
it("self waits remain bounded and execution cleanup permits later delivery", () => {
  const queue = new DFXQueue("wait-self"); const group = new DFXGroup();
  const item = new DFXWorkItem(() => {
    expect(group.wait(DFXTime.now())).toBe(DFXTimeoutResult.timedOut);
    expect(item.wait(DFXTime.now())).toBe(DFXTimeoutResult.timedOut);
    expect(() => group.wait()).toThrowError(message); expect(() => item.wait()).toThrowError(message);
  });
  queue.async(group, item); expect(item.wait()).toBeUndefined(); expect(group.wait()).toBeUndefined();
});
it("worker-guarded waits return timedOut or throw without claiming worker support", () => {
  const queue = new DFXQueue("wait-worker-stub"); const item = new DFXWorkItem(() => {}); queue.async(item);
  objectState(queue).workerInFlight = true;
  try { expect(item.wait(DFXTime.now())).toBe(DFXTimeoutResult.timedOut); expect(() => item.wait()).toThrowError(message); }
  finally { objectState(queue).workerInFlight = false; }
  expect(item.wait()).toBeUndefined();
});
it("temporarily boosts required predecessors and restores QoS after wait", () => {
  const target = new DFXQueue("wait-boost-target", { qos: DFXQoS.background });
  const first = new DFXQueue("wait-boost-first", { target }); const second = new DFXQueue("wait-boost-second", { target });
  const caller = new DFXQueue("wait-boost-caller", { qos: DFXQoS.userInteractive }); const observed: unknown[] = [];
  first.async(() => { observed.push(currentExecution()?.qos); });
  const item = new DFXWorkItem(() => { observed.push(currentExecution()?.qos); }); second.async(item);
  caller.sync(() => { item.wait(); });
  second.async(() => { observed.push(currentExecution()?.qos); }); flush();
  expect(observed).toEqual([DFXQoS.userInteractive, DFXQoS.userInteractive, DFXQoS.background]);
  expect(target.qos).toBe(DFXQoS.background);
});
it("queue sync WorkItem form returns void and respects first-completion notification", () => {
  const queue = new DFXQueue("sync-item"); const events: number[] = [];
  const item = new DFXWorkItem(() => { events.push(2); return 42; }); item.notify(queue, () => { events.push(3); });
  queue.async(() => { events.push(1); }); const result: void = queue.sync(item);
  expect(result).toBeUndefined(); expect(events).toEqual([1, 2]); expect(item.wait()).toBeUndefined(); flush(); expect(events).toEqual([1, 2, 3]);
});
it("queue WorkItem submissions preserve barrier flags and creation QoS context", () => {
  const creator = new DFXQueue("item-creator", { qos: DFXQoS.userInteractive }); const target = new DFXQueue("item-qos-target");
  let item!: DFXWorkItem; const observed: unknown[] = [];
  creator.sync(() => { item = new DFXWorkItem({ flags: [DFXWorkItemFlags.assignCurrentContext, DFXWorkItemFlags.barrier] }, () => { observed.push(currentExecution()?.qos); }); });
  target.async(item); item.wait(); expect(observed).toEqual([DFXQoS.userInteractive]);
});
it("WorkItem defaults capture submission QoS while explicit synchronous QoS is enforced", () => {
  const creator = new DFXQueue("item-default-creator", { qos: DFXQoS.userInteractive }); const submitter = new DFXQueue("item-submitter", { qos: DFXQoS.utility });
  const target = new DFXQueue("item-default-target"); const assigned = new DFXQueue("item-assigned", { qos: DFXQoS.background }); const observed: unknown[] = [];
  let item!: DFXWorkItem; creator.sync(() => { item = new DFXWorkItem(() => { observed.push(currentExecution()?.qos); }); });
  submitter.sync(() => { target.async(item); }); item.wait();
  assigned.sync(new DFXWorkItem({ qos: DFXQoS.userInteractive }, () => { observed.push(currentExecution()?.qos); }));
  assigned.async(new DFXWorkItem({ qos: DFXQoS.userInteractive }, () => { observed.push(currentExecution()?.qos); }));
  flush(); expect(observed).toEqual([DFXQoS.utility, DFXQoS.userInteractive, DFXQoS.background]);
});
it("sync WorkItem boosts use the waiting caller rather than the creation-time capture", () => {
  const creator = new DFXQueue("sync-item-low-creator", { qos: DFXQoS.background });
  const caller = new DFXQueue("sync-item-high-caller", { qos: DFXQoS.userInteractive });
  const target = new DFXQueue("sync-item-boost-target", { qos: DFXQoS.background }); const observed: unknown[] = [];
  let item!: DFXWorkItem; creator.sync(() => { item = new DFXWorkItem({ flags: [DFXWorkItemFlags.assignCurrentContext] }, () => { observed.push(currentExecution()?.qos); }); });
  target.async(() => { observed.push(currentExecution()?.qos); });
  caller.sync(() => { target.sync(item); });
  target.async(() => { observed.push(currentExecution()?.qos); }); flush();
  expect(observed).toEqual([DFXQoS.userInteractive, DFXQoS.userInteractive, DFXQoS.background]);
});
it("direct performance raises its current context without leaking an execution frame", () => {
  const queue = new DFXQueue("direct-item-context", { qos: DFXQoS.utility }); const key = new DFXSpecificKey<string>(); queue.setSpecific(key, "caller");
  queue.sync(() => {
    new DFXWorkItem({ qos: DFXQoS.userInteractive }, () => { expect(currentExecution()?.qos).toBe(DFXQoS.userInteractive); expect(DFXQueue.getSpecific(key)).toBe("caller"); }).perform();
    expect(currentExecution()?.qos).toBe(DFXQoS.utility);
  });
});
it("direct performance honours assignCurrentContext with any unspecified QoS value", () => {
  const creator = new DFXQueue("direct-capture", { qos: DFXQoS.userInteractive }); let item!: DFXWorkItem;
  creator.sync(() => { item = new DFXWorkItem({ qos: new DFXQoS(DFXQoS.unspecified.qosClass, 0), flags: [DFXWorkItemFlags.assignCurrentContext] }, () => {
    expect(currentExecution()?.qos).toBe(DFXQoS.userInteractive);
  }); });
  item.perform();
});
it("captures WorkItem queue traces at submission and reports the actual queue label", () => {
  expectedReports = 1; const queue = new DFXQueue("traced-item"); const taskRun = vi.fn((run: () => void) => run());
  const createTask = vi.fn(() => ({ run: taskRun })); Object.defineProperty(console, "createTask", { value: createTask, configurable: true });
  try {
    const cause = new Error("trace failure"); const item = new DFXWorkItem(() => { throw cause; });
    expect(createTask).not.toHaveBeenCalled(); queue.async(item);
    expect(createTask).toHaveBeenCalledWith("DFX traced-item"); item.wait();
    expect(taskRun).toHaveBeenCalledTimes(1); expect(reports.mock.calls[0][0].message).toContain('queue "traced-item"');
    expect(reports.mock.calls[0][0].cause).toBe(cause);
  } finally { Reflect.deleteProperty(console, "createTask"); }
});
it("reports a throwing WorkItem once while completing it and its group", () => {
  expectedReports = 1; const group = new DFXGroup(); const queue = new DFXQueue("throwing-item"); const notify = vi.fn();
  const item = new DFXWorkItem(() => { throw new Error("item error"); }); item.notify(queue, notify); queue.async(group, item);
  expect(group.wait()).toBeUndefined(); expect(item.wait()).toBeUndefined(); flush(); expect(notify).toHaveBeenCalledTimes(1);
});
it("contains runtime thenables and still completes WorkItem and notification", () => {
  expectedReports = 1; const queue = new DFXQueue("thenable-item"); const notify = vi.fn();
  const item = new DFXWorkItem((() => Promise.reject(new Error("forbidden"))) as unknown as () => void);
  item.notify(queue, notify); queue.async(item); item.wait(); flush(); expect(notify).toHaveBeenCalledTimes(1);
  expect(reports.mock.calls[0][0].message).toBe("DispatchFX work items are synchronous. Use DFXGroup enter() and leave() around asynchronous work.");
});
it("semaphore consumes positive counts and signal returns zero with no blocked waiter", () => {
  const semaphore = new DFXSemaphore(2);
  expect(semaphore.wait(DFXTime.now())).toBe(DFXTimeoutResult.success); expect(semaphore.wait()).toBeUndefined();
  expect(semaphore.wait(DFXTime.now())).toBe(DFXTimeoutResult.timedOut); expect(semaphore.signal()).toBe(0);
  expect(semaphore.wait(later())).toBe(DFXTimeoutResult.success); expect(semaphore.wait(DFXTime.now())).toBe(DFXTimeoutResult.timedOut);
});
it("zero-count semaphore now times out and future main waits throw the pinned message", () => {
  const semaphore = new DFXSemaphore(0); expect(semaphore.wait(DFXTime.now())).toBe(DFXTimeoutResult.timedOut);
  expect(() => semaphore.wait(later())).toThrowError(message); expect(() => semaphore.wait()).toThrowError(message);
  expect(semaphore.signal()).toBe(0); expect(semaphore.wait()).toBeUndefined();
});
it("wall-clock wait overloads check expiration and satisfy immediately when possible", () => {
  const group = new DFXGroup(); const item = new DFXWorkItem(() => {}); const semaphore = new DFXSemaphore(0);
  group.enter(); const now = DFXWallTime.now();
  expect(group.wait(now)).toBe(DFXTimeoutResult.timedOut); expect(item.wait(now)).toBe(DFXTimeoutResult.timedOut); expect(semaphore.wait(now)).toBe(DFXTimeoutResult.timedOut);
  const future = now.advanced(DFXTimeInterval.seconds(60));
  expect(() => group.wait(future)).toThrowError(message); expect(() => item.wait(future)).toThrowError(message); expect(() => semaphore.wait(future)).toThrowError(message);
  group.leave(); item.perform(); semaphore.signal();
  expect(group.wait(future)).toBe(DFXTimeoutResult.success); expect(item.wait(future)).toBe(DFXTimeoutResult.success); expect(semaphore.wait(future)).toBe(DFXTimeoutResult.success);
});
it.each([-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])("rejects invalid semaphore initial count %s", value => {
  expect(() => new DFXSemaphore(value)).toThrow(/^BUG IN CLIENT OF LIBDISPATCH: /);
});

// These calls are compile-only: TypeScript must reject every known thenable
// constituent while synchronous value unions retain inference.
function synchronousTyping(queue: DFXQueue, group: DFXGroup, item: DFXWorkItem, native: () => void | Promise<void>, custom: () => number | PromiseLike<number>): void {
  // @ts-expect-error Native async constructor work is forbidden.
  new DFXWorkItem(async () => {});
  // @ts-expect-error Native thenable unions are forbidden in constructors.
  new DFXWorkItem(native);
  // @ts-expect-error Custom thenable unions are forbidden in constructors.
  new DFXWorkItem(custom);
  // @ts-expect-error Options constructors preserve native union rejection.
  new DFXWorkItem({}, native);
  // @ts-expect-error Options constructors preserve custom union rejection.
  new DFXWorkItem({}, custom);
  // @ts-expect-error A bare WorkItem context cannot hide a native union.
  const rejectedBare: DFXWorkItem = new DFXWorkItem(native);
  // @ts-expect-error An array context cannot hide a custom union.
  const rejectedArray: DFXWorkItem[] = [new DFXWorkItem({}, custom)];
  // @ts-expect-error Item notify rejects async handlers.
  item.notify(queue, async () => {});
  // @ts-expect-error Item notify rejects native unions.
  item.notify(queue, native);
  // @ts-expect-error Item notify rejects custom unions.
  item.notify(queue, custom);
  // @ts-expect-error Item notify options reject native unions.
  item.notify(queue, {}, native);
  // @ts-expect-error Item notify options reject custom unions.
  item.notify(queue, {}, custom);
  // @ts-expect-error Group notify rejects async handlers.
  group.notify(queue, async () => {});
  // @ts-expect-error Group notify rejects native unions.
  group.notify(queue, native);
  // @ts-expect-error Group notify rejects custom unions.
  group.notify(queue, custom);
  // @ts-expect-error Group notify options reject native unions.
  group.notify(queue, {}, native);
  // @ts-expect-error Group notify options reject custom unions.
  group.notify(queue, {}, custom);
  // @ts-expect-error Group closure submissions reject native unions.
  queue.async({ group }, native);
  // @ts-expect-error There is no positional group-and-closure alias.
  queue.async(group, () => {});
  // @ts-expect-error WorkItems do not gain an options-object submission alias.
  queue.async({ group }, item);
  // @ts-expect-error WorkItem sync has no flags overload.
  queue.sync([], item);
  const valueItem = new DFXWorkItem(() => Math.random() ? 1 : "value");
  const bareItem: DFXWorkItem = valueItem;
  const items: DFXWorkItem[] = [valueItem, bareItem];
  queue.async(valueItem); queue.async(group, items[0]); item.notify(queue, valueItem); group.notify(queue, valueItem);
  // @ts-expect-error Apple WorkItem has no result property.
  valueItem.result;
  void rejectedBare; void rejectedArray;
  group.notify(queue, () => Math.random() ? 1 : "value");
  item.notify(queue, () => Math.random() ? 1 : "value");
}
void synchronousTyping;
