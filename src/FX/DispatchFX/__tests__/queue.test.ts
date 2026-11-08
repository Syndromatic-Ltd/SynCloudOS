import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as D from "./systemDispatch";

type Priority = "user-blocking" | "user-visible" | "background";
/** Host task delivery and elapsed CPU time are independently controlled. */
function fakeHost() {
  const tasks: { kind: string; priority?: Priority; run: () => void }[] = [];
  let clock = 0;
  let closedPorts = 0;
  const reportError = vi.fn();
  const measure = vi.fn();
  const scheduler = {
    postTask: vi.fn((run: () => void, options: { priority: Priority }) => new Promise<void>((resolve, reject) => {
      tasks.push({ kind: "postTask", priority: options.priority, run: () => { try { run(); resolve(); } catch (e) { reject(e); } } });
    })),
    yield: vi.fn(() => new Promise<void>(resolve => { tasks.push({ kind: "yield", run: resolve }); })),
  };
  class Channel {
    port1 = { onmessage: null as null | (() => void), close: () => { closedPorts++; } };
    port2 = { close: () => { closedPorts++; }, postMessage: () => { tasks.push({ kind: "message", run: () => this.port1.onmessage?.() }); } };
  }
  vi.stubGlobal("scheduler", scheduler);
  vi.stubGlobal("MessageChannel", Channel);
  vi.stubGlobal("setTimeout", vi.fn((run: () => void) => { tasks.push({ kind: "timer", run }); return 1; }));
  vi.stubGlobal("performance", { now: () => clock, measure });
  vi.stubGlobal("reportError", reportError);
  const microtasks = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
  const step = async () => { tasks.shift()?.run(); await microtasks(); };
  return {
    tasks, scheduler, reportError, measure, advance: (ms: number) => { clock += ms; }, step,
    get closedPorts() { return closedPorts; },
    async flush() { for (let n = 0; tasks.length && n < 200; n++) await step(); expect(tasks).toHaveLength(0); },
  };
}
let host: ReturnType<typeof fakeHost>;
let expectedReports = 0;
beforeEach(() => { host = fakeHost(); expectedReports = 0; });
afterEach(async () => {
  try { await host.flush(); expect(host.reportError).toHaveBeenCalledTimes(expectedReports); }
  finally { vi.unstubAllGlobals(); vi.restoreAllMocks(); }
});
const Q = () => D.DFXQueue;
const F = D.DFXWorkItemFlags;
const A = D.DFXQueueAttributes;

it("QoS lanes drain in priority order", async () => {
  const events: string[] = [];
  for (const qos of [D.DFXQoSClass.background, D.DFXQoSClass.utility, D.DFXQoSClass.userInteractive])
    Q().global(qos).async(() => { events.push(qos); });
  expect(events).toEqual([]);
  await host.flush();
  expect(events).toEqual(["userInteractive", "utility", "background"]);
});
it("relativePriority orders within a class, followed by FIFO", async () => {
  const events: number[] = [];
  for (const [index, relativePriority] of [-15, -2, -2, 0].entries())
    new (Q())(`relative-${index}`, { qos: new D.DFXQoS(D.DFXQoSClass.utility, relativePriority) }).async(() => { events.push(index); });
  await host.flush();
  expect(events).toEqual([3, 1, 2, 0]);
});
it("serial queue runs FIFO one at a time despite later higher QoS", async () => {
  const queue = new (Q())("serial");
  const events: string[] = [];
  let running = false;
  queue.async({ qos: D.DFXQoS.background, flags: [F.enforceQoS] }, () => {
    expect(running).toBe(false); running = true; events.push("first-start");
    queue.async(() => { expect(running).toBe(false); events.push("third"); });
    events.push("first-end"); running = false;
  });
  queue.async({ qos: D.DFXQoS.userInteractive, flags: [F.enforceQoS] }, () => { expect(running).toBe(false); events.push("second"); });
  await host.flush();
  expect(events).toEqual(["first-start", "first-end", "second", "third"]);
});
it("barrier waits for earlier items and blocks later ones on a concurrent queue", async () => {
  const queue = new (Q())("concurrent", { attributes: [A.concurrent] });
  const events: number[] = [];
  queue.async(() => { events.push(1); });
  queue.async({ flags: [F.barrier] }, () => { D.dispatchPrecondition(D.DFXPredicate.onQueueAsBarrier(queue)); events.push(2); });
  queue.async(() => { expect(() => D.dispatchPrecondition(D.DFXPredicate.onQueueAsBarrier(queue))).toThrow(/^BUG IN CLIENT/); events.push(3); });
  await host.flush(); expect(events).toEqual([1, 2, 3]);
});
it("global queues ignore barrier", async () => {
  const queue = Q().global();
  queue.async({ flags: [F.barrier] }, () => {
    D.dispatchPrecondition(D.DFXPredicate.onQueue(queue));
    expect(() => D.dispatchPrecondition(D.DFXPredicate.onQueueAsBarrier(queue))).toThrow(/^BUG IN CLIENT/);
  });
  await host.flush(); expect(host.reportError).not.toHaveBeenCalled();
});

const qosCases = [
  { name: "async defaults to queue QoS", queue: D.DFXQoS.utility, item: D.DFXQoS.userInteractive, flags: [], expected: D.DFXQoS.utility },
  { name: "inherit prefers assigned queue", queue: D.DFXQoS.utility, item: D.DFXQoS.userInteractive, flags: [F.inheritQoS], expected: D.DFXQoS.utility },
  { name: "enforce raises assigned queue", queue: D.DFXQoS.utility, item: D.DFXQoS.userInteractive, flags: [F.enforceQoS], expected: D.DFXQoS.userInteractive },
  { name: "enforce never lowers assigned queue", queue: D.DFXQoS.userInitiated, item: D.DFXQoS.background, flags: [F.enforceQoS], expected: D.DFXQoS.userInitiated },
  { name: "enforce wins over inherit", queue: D.DFXQoS.utility, item: D.DFXQoS.userInteractive, flags: [F.enforceQoS, F.inheritQoS], expected: D.DFXQoS.userInteractive },
  { name: "unspecified queue uses assigned item", queue: D.DFXQoS.unspecified, item: D.DFXQoS.userInteractive, flags: [], expected: D.DFXQoS.userInteractive },
  { name: "target QoS is a floor", queue: D.DFXQoS.background, item: D.DFXQoS.background, target: D.DFXQoS.userInitiated, flags: [], expected: D.DFXQoS.userInitiated },
  { name: "unspecified queue cannot lower target", queue: D.DFXQoS.unspecified, item: D.DFXQoS.background, target: D.DFXQoS.utility, flags: [], expected: D.DFXQoS.utility },
  { name: "target relative priority is a floor", queue: new D.DFXQoS(D.DFXQoSClass.utility, -10), item: D.DFXQoS.background, target: new D.DFXQoS(D.DFXQoSClass.utility, -2), flags: [], expected: new D.DFXQoS(D.DFXQoSClass.utility, -2) },
];
it.each(qosCases)("target queue chain resolves QoS: $name", async ({ queue: qos, item, target, flags, expected }) => {
  const { currentExecution } = await import("../internal/executionStack");
  const targetQueue = new (Q())("target", { qos: target ?? D.DFXQoS.unspecified });
  const queue = new (Q())("leaf", { qos, target: targetQueue });
  let observed: D.DFXQoS | undefined;
  queue.async({ qos: item, flags }, () => { observed = currentExecution()?.qos; });
  await host.flush(); expect(observed).toEqual(expected);
});
it.each([
  { name: "submission captures current QoS", flags: [], item: undefined, expected: D.DFXQoS.userInteractive },
  { name: "noQoS drops capture", flags: [F.noQoS], item: undefined, expected: D.DFXQoS.default },
  { name: "detached drops capture", flags: [F.detached], item: undefined, expected: D.DFXQoS.default },
  { name: "assignCurrentContext uses submitting stack", flags: [F.assignCurrentContext], item: undefined, expected: D.DFXQoS.userInteractive },
  { name: "noQoS overrides assignCurrentContext", flags: [F.noQoS, F.assignCurrentContext], item: undefined, expected: D.DFXQoS.default },
  { name: "explicit item QoS overrides noQoS", flags: [F.noQoS, F.assignCurrentContext], item: D.DFXQoS.utility, expected: D.DFXQoS.utility },
  { name: "detached preserves assigned item QoS", flags: [F.detached], item: D.DFXQoS.utility, expected: D.DFXQoS.utility },
])("submission context: $name", async ({ flags, item, expected }) => {
  const { currentExecution } = await import("../internal/executionStack");
  const queue = new (Q())("captured");
  let observed: D.DFXQoS | undefined;
  Q().main.async(() => { queue.async({ flags, qos: item }, () => { observed = currentExecution()?.qos; }); });
  await host.flush(); expect(observed).toEqual(expected);
  expect(currentExecution()).toBeUndefined();
});
it("suspend holds items; over-resume throws BUG IN CLIENT OF LIBDISPATCH", async () => {
  const queue = new (Q())("suspended"); const work = vi.fn();
  queue.suspend(); queue.suspend(); queue.async(work);
  await host.flush(); expect(work).not.toHaveBeenCalled();
  queue.resume(); await host.flush(); expect(work).not.toHaveBeenCalled();
  queue.resume(); await host.flush(); expect(work).toHaveBeenCalledTimes(1);
  expect(() => queue.resume()).toThrow(/^BUG IN CLIENT OF LIBDISPATCH:.*over-resume/);
});
it("initiallyInactive holds items until activate and preserves suspension count", async () => {
  const queue = new (Q())("inactive", { attributes: [A.initiallyInactive] }); const work = vi.fn();
  queue.async(work); await host.flush(); expect(work).not.toHaveBeenCalled();
  queue.suspend(); queue.activate(); queue.activate(); await host.flush(); expect(work).not.toHaveBeenCalled();
  queue.resume(); await host.flush(); expect(work).toHaveBeenCalledTimes(1);
  expect(() => queue.setTarget(Q().global())).toThrow(/^BUG IN CLIENT/);
});
it("suspension of a target holds descendants and serial targets preserve shared FIFO", async () => {
  const target = new (Q())("target");
  const child = new (Q())("child", { target }); const events: string[] = [];
  target.suspend(); child.async(() => { events.push("child"); }); target.async(() => { events.push("target"); });
  await host.flush(); expect(events).toEqual([]);
  target.resume(); await host.flush(); expect(events).toEqual(["child", "target"]);
});
it("setTarget changes inactive queued work immediately and rejects cycles", async () => {
  const target = new (Q())("new-target", { qos: D.DFXQoS.userInitiated });
  const queue = new (Q())("inactive-target", { attributes: [A.initiallyInactive] });
  const key = new D.DFXSpecificKey<string>(); target.setSpecific(key, "new");
  let observed: string | undefined;
  queue.async(() => { observed = Q().getSpecific(key); }); queue.setTarget(target); queue.activate();
  await host.flush(); expect(observed).toBe("new");
  const a = new (Q())("a"); const b = new (Q())("b", { target: a });
  expect(() => a.setTarget(b)).toThrow(/^BUG IN CLIENT.*cycle/);
});
it("main queue never re-enters, including a nested main async", async () => {
  const events: number[] = [];
  Q().main.async(() => { events.push(1); Q().main.async(() => { events.push(3); }); events.push(2); host.advance(20); });
  await host.step(); expect(events).toEqual([1, 2, 3]); expect(host.scheduler.yield).not.toHaveBeenCalled();
});
it("time slice yields at 5 ms and work items stay atomic", async () => {
  const queue = new (Q())("slice"); const events: number[] = [];
  queue.async(() => { events.push(1); host.advance(5); events.push(2); });
  queue.async(() => { events.push(3); });
  await host.step(); expect(events).toEqual([1, 2]); expect(host.scheduler.yield).toHaveBeenCalledTimes(1);
  await host.flush(); expect(events).toEqual([1, 2, 3]);
});
it("time slice does not yield before 5 ms or between userInteractive items", async () => {
  const events: number[] = [];
  const queue = new (Q())("short"); queue.async(() => { events.push(1); host.advance(4.999); }); queue.async(() => { events.push(2); });
  await host.step(); expect(events).toEqual([1, 2]); expect(host.scheduler.yield).not.toHaveBeenCalled();
  for (let n = 0; n < 3; n++) Q().main.async(() => { events.push(n + 3); host.advance(8); });
  await host.step(); expect(events).toEqual([1, 2, 3, 4, 5]); expect(host.scheduler.yield).not.toHaveBeenCalled();
});
it("new interactive work pre-empts a pending lower-priority slice", async () => {
  const events: string[] = []; const queue = new (Q())("lower");
  queue.async(() => { events.push("lower-1"); host.advance(5); Q().main.async(() => { events.push("interactive"); }); });
  queue.async(() => { events.push("lower-2"); });
  await host.step(); expect(events).toEqual(["lower-1"]);
  await host.flush(); expect(events).toEqual(["lower-1", "interactive", "lower-2"]);
});
it("throwing item is reported with the queue label and the queue continues", async () => {
  expectedReports = 1;
  const queue = new (Q())("throwing-label"); const next = vi.fn();
  queue.async(() => { throw new Error("bad work"); }); queue.async(next);
  await host.flush(); expect(next).toHaveBeenCalledTimes(1); expect(host.reportError).toHaveBeenCalledTimes(1);
  expect(host.reportError.mock.calls[0][0]).toMatchObject({ message: expect.stringContaining("throwing-label"), cause: expect.any(Error) });
});
it("thenable return is reported once and does not hold the queue", async () => {
  expectedReports = 1;
  const queue = new (Q())("thenable"); const next = vi.fn(); const then = vi.fn((_: unknown, reject: (e: unknown) => void) => reject(new Error("later")));
  // @ts-expect-error PromiseLike work is forbidden, even with a non-native thenable.
  queue.async(() => ({ then } as PromiseLike<void>));
  queue.async(next); await host.flush();
  expect(host.reportError).toHaveBeenCalledTimes(1); expect(then).toHaveBeenCalledTimes(1); expect(next).toHaveBeenCalledTimes(1);
  expect(host.reportError.mock.calls[0][0].message).toBe("DispatchFX work items are synchronous. Use DFXGroup enter() and leave() around asynchronous work.");
});
it("async functions are rejected by the work type and reported at runtime", async () => {
  expectedReports = 1;
  // @ts-expect-error Native Promise work is forbidden.
  Q().global().async(async () => { throw new Error("async rejection"); });
  await host.flush(); expect(host.reportError).toHaveBeenCalledTimes(1);
});
it("getSpecific reads the current stack including the target chain and clears after return", async () => {
  const target = new (Q())("specific-target"); const child = new (Q())("specific-child", { target });
  const key = new D.DFXSpecificKey<string>(); target.setSpecific(key, "parent");
  expect(child.getSpecific(key)).toBeUndefined(); expect(target.getSpecific(key)).toBe("parent"); expect(Q().getSpecific(key)).toBeUndefined();
  child.async(() => { expect(Q().getSpecific(key)).toBe("parent"); }); await host.flush();
  child.setSpecific(key, "child"); child.async(() => { expect(Q().getSpecific(key)).toBe("child"); }); await host.flush();
  child.setSpecific(key, undefined); expect(child.getSpecific(key)).toBeUndefined(); expect(Q().getSpecific(key)).toBeUndefined();
});
it("dispatchPrecondition onQueue/notOnQueue/onQueueAsBarrier", async () => {
  const target = new (Q())("predicate-target"); const queue = new (Q())("predicate-child", { target });
  D.dispatchPrecondition(D.DFXPredicate.notOnQueue(queue));
  expect(() => D.dispatchPrecondition(D.DFXPredicate.onQueue(queue))).toThrow(/^BUG IN CLIENT/);
  queue.async(() => {
    D.dispatchPrecondition(D.DFXPredicate.onQueue(queue)); D.dispatchPrecondition(D.DFXPredicate.onQueue(target));
    D.dispatchPrecondition(D.DFXPredicate.onQueueAsBarrier(queue)); D.dispatchPrecondition(D.DFXPredicate.onQueueAsBarrier(target));
    expect(() => D.dispatchPrecondition(D.DFXPredicate.notOnQueue(queue))).toThrow(/^BUG IN CLIENT/);
  }); await host.flush(); expect(host.reportError).not.toHaveBeenCalled();
});
it("concurrentPerform is a synchronous ordered loop with validated iteration count", () => {
  expectedReports = 1;
  const events: number[] = [];
  Q().concurrentPerform(4, index => { events.push(index); }); expect(events).toEqual([0, 1, 2, 3]);
  Q().concurrentPerform(0, () => { throw new Error("unreachable"); });
  for (const count of [-1, 0.5, Infinity, NaN]) expect(() => Q().concurrentPerform(count, () => {})).toThrow(/^BUG IN CLIENT/);
  // @ts-expect-error concurrentPerform also rejects PromiseLike work.
  Q().concurrentPerform(1, async () => {}); expect(host.reportError).toHaveBeenCalledTimes(1);
});
it.each([
  [D.DFXQoSClass.userInteractive, "user-blocking"], [D.DFXQoSClass.userInitiated, "user-blocking"],
  [D.DFXQoSClass.default, "user-visible"], [D.DFXQoSClass.utility, "background"], [D.DFXQoSClass.background, "background"],
] as const)("maps %s to postTask %s", async (qos, priority) => {
  Q().global(qos).async(() => {}); expect(host.tasks[0]).toMatchObject({ kind: "postTask", priority }); await host.flush();
});
it("falls back to shared MessageChannel tasks and background timers", async () => {
  vi.stubGlobal("scheduler", undefined); const events: string[] = [];
  Q().global().async(() => { events.push("default"); }); expect(host.tasks[0].kind).toBe("message"); await host.flush(); expect(host.closedPorts).toBe(2);
  Q().global(D.DFXQoSClass.utility).async(() => { events.push("utility"); }); expect(host.tasks[0].kind).toBe("timer"); await host.flush();
  vi.stubGlobal("MessageChannel", undefined); Q().global().async(() => { events.push("timer"); }); expect(host.tasks[0].kind).toBe("timer");
  await host.flush(); expect(events).toEqual(["default", "utility", "timer"]);
});
it("yield fallback uses a fresh shared MessageChannel task", async () => {
  vi.stubGlobal("scheduler", { postTask: host.scheduler.postTask }); const queue = new (Q())("fallback-slice");
  const work = vi.fn(); queue.async(() => { host.advance(5); }); queue.async(work);
  await host.step(); expect(work).not.toHaveBeenCalled(); expect(host.tasks[0].kind).toBe("message"); await host.flush(); expect(work).toHaveBeenCalledTimes(1);
});
it.each([true, false])("promotes a pending background host hop when UI work arrives (postTask=%s)", async postTask => {
  if (!postTask) vi.stubGlobal("scheduler", undefined);
  const events: string[] = [];
  Q().global(D.DFXQoSClass.background).async(() => { events.push("background"); });
  Q().main.async(() => { events.push("UI"); });
  expect(host.tasks).toHaveLength(2);
  expect(host.tasks[1]).toMatchObject(postTask ? { kind: "postTask", priority: "user-blocking" } : { kind: "message" });
  // The host may deliver either the old callback or its replacement first.
  host.tasks.reverse(); await host.step(); expect(events).toEqual(["UI", "background"]);
  await host.flush(); expect(events).toEqual(["UI", "background"]);
});
it("feature-detects console.createTask and measures developer work", async () => {
  const run = vi.fn((work: () => unknown) => work()); const createTask = vi.fn(() => ({ run }));
  vi.stubGlobal("console", { ...console, createTask }); new (Q())("instrumented").async(() => { host.advance(1); });
  expect(createTask).toHaveBeenCalledWith("DFX instrumented"); expect(run).not.toHaveBeenCalled();
  await host.flush(); expect(createTask).toHaveBeenCalledWith("DFX instrumented"); expect(run).toHaveBeenCalledTimes(1);
  expect(host.measure).toHaveBeenCalledWith("DFX instrumented", { start: 0, end: 1 });
});
it("execution specifics and context never persist into a microtask", async () => {
  const { currentExecution } = await import("../internal/executionStack");
  const queue = new (Q())("no-ambient-context"); const key = new D.DFXSpecificKey<string>(); queue.setSpecific(key, "here");
  let specific: unknown = "unset"; let frame: unknown = "unset";
  queue.async(() => { void Promise.resolve().then(() => { specific = Q().getSpecific(key); frame = currentExecution(); }); });
  await host.flush(); expect(specific).toBeUndefined(); expect(frame).toBeUndefined();
});
it("active retargeting affects new submissions while old submissions retain their target", async () => {
  const oldTarget = new (Q())("old-target"); const newTarget = new (Q())("new-target"); const queue = new (Q())("retarget", { target: oldTarget });
  const key = new D.DFXSpecificKey<string>(); const observed: (string | undefined)[] = [];
  oldTarget.setSpecific(key, "old"); newTarget.setSpecific(key, "new");
  queue.async(() => { observed.push(Q().getSpecific(key)); }); queue.setTarget(newTarget); queue.async(() => { observed.push(Q().getSpecific(key)); });
  await host.flush(); expect(observed).toEqual(["old", "new"]);
});
it("a suspended child does not stall independent work on its serial target", async () => {
  const target = new (Q())("runnable-target"); const child = new (Q())("suspended-child", { target }); const events: string[] = [];
  child.suspend(); child.async(() => { events.push("child"); }); target.async(() => { events.push("target"); });
  await host.flush(); expect(events).toEqual(["target"]);
  child.resume(); await host.flush(); expect(events).toEqual(["target", "child"]);
});
it("a concurrent target's barrier orders preceding and later descendant work", async () => {
  const target = new (Q())("barrier-target", { attributes: [A.concurrent] });
  const before = new (Q())("before", { target, qos: D.DFXQoS.background });
  const after = new (Q())("after", { target, qos: D.DFXQoS.userInteractive }); const events: string[] = [];
  before.async(() => { events.push("before"); });
  target.async({ qos: D.DFXQoS.userInteractive, flags: [F.barrier, F.enforceQoS] }, () => { events.push("barrier"); });
  after.async(() => { events.push("after"); });
  await host.flush(); expect(events).toEqual(["before", "barrier", "after"]);
});
it("main queue ignores suspend and resume", async () => {
  const queue = Q().main; const errors: unknown[] = []; const work = vi.fn();
  try { queue.resume(); } catch (error) { errors.push(error); }
  queue.suspend(); queue.async(work); await host.flush();
  const ranWhileSuspended = work.mock.calls.length;
  // Also clean up the old counted implementation after observing RED.
  queue.resume(); await host.flush();
  expect({ errors, ranWhileSuspended }).toEqual({ errors: [], ranWhileSuspended: 1 });
});
it("inactive ancestor retargeting preserves the saved active leaf prefix", async () => {
  const inactive = new (Q())("inactive-A", { attributes: [A.initiallyInactive] });
  const targetB = new (Q())("target-B"); const targetC = new (Q())("target-C");
  const leaf = new (Q())("active-L", { target: inactive });
  const keyA = new D.DFXSpecificKey<string>(); const keyB = new D.DFXSpecificKey<string>(); const keyC = new D.DFXSpecificKey<string>();
  inactive.setSpecific(keyA, "A"); targetB.setSpecific(keyB, "B"); targetC.setSpecific(keyC, "C");
  const events: unknown[] = [];
  leaf.async(() => { events.push(["old", Q().getSpecific(keyA), Q().getSpecific(keyB), Q().getSpecific(keyC)]); });
  leaf.setTarget(targetB);
  leaf.async(() => { events.push(["new", Q().getSpecific(keyA), Q().getSpecific(keyB), Q().getSpecific(keyC)]); });
  inactive.setTarget(targetC);
  await host.flush(); expect(events).toEqual([]);
  inactive.activate(); await host.flush();
  expect(events).toEqual([["old", "A", undefined, "C"], ["new", undefined, "B", undefined]]);
});
it("a leaf item behind an inactive predecessor does not reserve its new serial target", async () => {
  const inactive = new (Q())("reservation-A", { attributes: [A.initiallyInactive] });
  const targetB = new (Q())("reservation-B"); const leaf = new (Q())("reservation-L", { target: inactive });
  const keyA = new D.DFXSpecificKey<string>(); const keyB = new D.DFXSpecificKey<string>();
  inactive.setSpecific(keyA, "A"); targetB.setSpecific(keyB, "B"); const events: unknown[] = [];
  leaf.async(() => { events.push(["old", Q().getSpecific(keyA), Q().getSpecific(keyB)]); });
  leaf.setTarget(targetB);
  leaf.async(() => { events.push(["new", Q().getSpecific(keyA), Q().getSpecific(keyB)]); });
  targetB.async(() => { events.push("direct-B"); });
  await host.flush(); expect(events).toEqual(["direct-B"]);
  inactive.activate(); await host.flush();
  expect(events).toEqual(["direct-B", ["old", "A", undefined], ["new", undefined, "B"]]);
});
