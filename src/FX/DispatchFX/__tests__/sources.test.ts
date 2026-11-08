import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as D from "./systemDispatch";
import { currentExecution } from "../internal/executionStack";

/** Jitter belongs to the host, independently of queue tasks and elapsed time. */
function fakeHost() {
  let clock = 0;
  let next = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const tasks: (() => void)[] = [];
  const reportError = vi.fn();
  const setTimeout = vi.fn((run: () => void, delay = 0) => {
    const id = ++next; timers.set(id, { at: clock + delay, run }); return id;
  });
  vi.stubGlobal("performance", { now: () => clock, measure: vi.fn() });
  vi.spyOn(Date, "now").mockImplementation(() => 1_800_000_000_000 + Math.floor(clock));
  vi.stubGlobal("setTimeout", setTimeout);
  vi.stubGlobal("clearTimeout", (id: number) => { timers.delete(id); });
  vi.stubGlobal("scheduler", { postTask: (run: () => void) => new Promise<void>(resolve => { tasks.push(() => { run(); resolve(); }); }) });
  vi.stubGlobal("reportError", reportError);
  return {
    timers, tasks, setTimeout, reportError, get now() { return clock; },
    advance(ms: number) { clock += ms; },
    fire(jitter = 0) {
      const first = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      expect(first, "expected a pending host timer").toBeDefined();
      const [id, timer] = first!; timers.delete(id); clock = Math.max(clock, timer.at) + jitter; timer.run();
    },
    async flush() {
      for (let n = 0; n < 100; n++) {
        tasks.shift()?.();
        for (let micro = 0; micro < 12; micro++) await Promise.resolve();
        if (!tasks.length) return;
      }
      throw new Error("queue did not settle");
    },
  };
}
let host: ReturnType<typeof fakeHost>;
const sources: D.DFXSourceProtocol[] = [];
let expectedReports = 0;
beforeEach(() => { host = fakeHost(); expectedReports = 0; });
afterEach(async () => {
  try {
    for (const source of sources.splice(0)) { source.cancel(); source.activate(); }
    await host.flush();
    expect(host.reportError).toHaveBeenCalledTimes(expectedReports);
    expect(host.timers.size).toBe(0);
  } finally { vi.unstubAllGlobals(); vi.restoreAllMocks(); }
});
function keep<T extends D.DFXSourceProtocol>(source: T): T { sources.push(source); return source; }
const ms = (value: number) => D.DFXTimeInterval.milliseconds(value);

it("repeating timer does not drift over 100 fires at 10 ms under host jitter", async () => {
  const source = keep(D.DFXSource.makeTimerSource());
  const times: number[] = [];
  source.setEventHandler(() => { times.push(host.now); });
  source.schedule(D.DFXTime.now().advanced(ms(10)), { repeating: ms(10), leeway: ms(3) });
  source.activate(); await host.flush();
  for (let n = 0; n < 100; n++) { host.fire(n % 3); await host.flush(); }
  expect(times).toHaveLength(100);
  times.forEach((time, n) => { expect(time).toBeGreaterThanOrEqual((n + 1) * 10); expect(time).toBeLessThanOrEqual((n + 1) * 10 + 3); });
});
it("timers within each other's leeway share one host timer", async () => {
  const a = keep(D.DFXSource.makeTimerSource()); const b = keep(D.DFXSource.makeTimerSource());
  const events: string[] = [];
  a.setEventHandler(() => { events.push("a"); }); b.setEventHandler(() => { events.push("b"); });
  a.schedule(new D.DFXTime(10e6), { leeway: ms(5) }); b.schedule(new D.DFXTime(12e6), { leeway: ms(5) });
  a.activate(); b.activate(); await host.flush();
  expect(host.timers.size).toBe(1);
  host.fire(); await host.flush(); expect(events).toEqual(["a", "b"]); expect(host.now).toBe(12);
});
it("strict timers never coalesce even with overlapping windows", async () => {
  const a = keep(D.DFXSource.makeTimerSource({ flags: [D.DFXSourceTimerFlags.strict] }));
  const b = keep(D.DFXSource.makeTimerSource());
  a.schedule(new D.DFXTime(10e6), { leeway: ms(5) }); b.schedule(new D.DFXTime(10e6), { leeway: ms(5) });
  a.activate(); b.activate(); await host.flush(); expect(host.timers.size).toBe(2);
});
it("user data add coalesces between handler runs", async () => {
  const source = keep(D.DFXSource.makeUserDataAddSource()); const values: number[] = [];
  source.setEventHandler(() => { values.push(source.data); if (values.length === 1) { source.add(4); source.add(5); } });
  source.add(1); source.add(2); source.add(0); source.activate(); await host.flush();
  expect(values).toEqual([3, 9]); expect(source.data).toBe(0);
});
it("cancel runs the cancel handler once on the source queue", async () => {
  const queue = new D.DFXQueue("source-cancellation"); const source = keep(D.DFXSource.makeUserDataAddSource(queue));
  const events: string[] = [];
  source.setRegistrationHandler(() => { D.dispatchPrecondition(D.DFXPredicate.onQueue(queue)); events.push("registered"); });
  source.setEventHandler(() => { events.push("event"); source.cancel(); });
  source.setCancelHandler(() => { D.dispatchPrecondition(D.DFXPredicate.onQueue(queue)); events.push("cancelled"); });
  source.activate(); source.add(1); await host.flush(); source.cancel(); await host.flush();
  expect(events).toEqual(["registered", "event", "cancelled"]); expect(source.isCancelled).toBe(true);
});
it("memory pressure source never fires when the runtime has no signal", async () => {
  const source = keep(D.DFXSource.makeMemoryPressureSource([D.DFXSourceMemoryPressureEvent.all]));
  const handler = vi.fn(); source.setEventHandler(handler); source.activate(); await host.flush();
  host.advance(60_000); await host.flush(); expect(handler).not.toHaveBeenCalled(); expect(host.timers.size).toBe(0);
  expect(source.data).toEqual([]); expect(source.mask).toEqual([D.DFXSourceMemoryPressureEvent.normal, D.DFXSourceMemoryPressureEvent.warning, D.DFXSourceMemoryPressureEvent.critical]);
});
it("asyncAfter supports both clocks, options and WorkItem while retaining queue order", async () => {
  const queue = new D.DFXQueue("after"); const events: string[] = [];
  queue.asyncAfter(new D.DFXTime(10e6), { qos: D.DFXQoS.utility, flags: [] }, () => { D.dispatchPrecondition(D.DFXPredicate.onQueue(queue)); events.push("uptime"); });
  queue.asyncAfter(D.DFXWallTime.now().advanced(ms(15)), new D.DFXWorkItem(() => { events.push("wall"); }));
  queue.async(() => { events.push("immediate"); }); await host.flush(); expect(events).toEqual(["immediate"]);
  host.fire(); await host.flush(); host.fire(); await host.flush(); expect(events).toEqual(["immediate", "uptime", "wall"]);
});
it("long finite deadlines are bounded and rechecked rather than wrapping immediately", async () => {
  const queue = new D.DFXQueue("long-after"); const work = vi.fn();
  queue.asyncAfter(D.DFXWallTime.now().advanced(D.DFXTimeInterval.seconds(4_000_000)), work);
  expect(host.setTimeout.mock.calls[0][1]).toBeLessThanOrEqual(2_147_483_647);
  host.fire(); await host.flush(); expect(work).not.toHaveBeenCalled();
  expect(host.timers.size).toBe(1); host.fire(); await host.flush(); expect(work).toHaveBeenCalledOnce(); expect(host.now).toBe(4_000_000_000);
});
it("nanosecond wall deadlines subtract bigint state before host conversion", async () => {
  const queue = new D.DFXQueue("wall-fraction"); const work = vi.fn();
  queue.asyncAfter(D.DFXWallTime.now().advanced(D.DFXTimeInterval.nanoseconds(1)), work);
  expect(host.setTimeout.mock.calls[0][1]).toBeGreaterThan(0); host.fire(); await host.flush();
  // Date.now() is millisecond-resolution; an early sub-ms wake must recheck.
  expect(work).not.toHaveBeenCalled(); host.advance(1); host.fire(); await host.flush(); expect(work).toHaveBeenCalledOnce();
});
it("distant future never arms a host timer", async () => {
  const queue = new D.DFXQueue("never"); queue.asyncAfter(D.DFXTime.distantFuture, () => {}); queue.asyncAfter(D.DFXWallTime.distantFuture, () => {});
  const timer = keep(D.DFXSource.makeTimerSource()); timer.schedule(D.DFXWallTime.distantFuture); timer.activate(); await host.flush(); expect(host.timers.size).toBe(0);
});
it("source activation and counted suspension preserve pending data and registration order", async () => {
  const source = keep(D.DFXSource.makeUserDataAddSource()); const events: string[] = [];
  source.setRegistrationHandler(() => { events.push("registered"); }); source.setEventHandler(() => { events.push(`data:${source.data}`); });
  source.add(2); await host.flush(); expect(events).toEqual([]);
  source.suspend(); source.suspend(); source.activate(); source.add(3); source.resume(); await host.flush(); expect(events).toEqual([]);
  source.resume(); await host.flush(); expect(events).toEqual(["registered", "data:5"]);
  expect(() => source.resume()).toThrow(/^BUG IN CLIENT OF LIBDISPATCH: over-resume/);
});
it("resume activates a newly created source as Apple's legacy API does", async () => {
  const source = keep(D.DFXSource.makeUserDataAddSource()); const handler = vi.fn(); source.setEventHandler(handler); source.add(1); source.resume(); await host.flush(); expect(handler).toHaveBeenCalledOnce();
});
it("cancellation while suspended waits for resume and discards pending events", async () => {
  const source = keep(D.DFXSource.makeUserDataAddSource()); const event = vi.fn(); const cancel = vi.fn();
  source.setEventHandler(event); source.setCancelHandler(cancel); source.activate(); await host.flush();
  source.suspend(); source.add(1); source.cancel(); source.cancel(); await host.flush(); expect(cancel).not.toHaveBeenCalled();
  source.resume(); await host.flush(); expect(event).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalledOnce(); source.add(5); await host.flush(); expect(event).not.toHaveBeenCalled();
});
it("event runs serially across a concurrent target and cancellation suppresses queued delivery", async () => {
  const queue = new D.DFXQueue("concurrent-source", { attributes: [D.DFXQueueAttributes.concurrent] });
  const source = keep(D.DFXSource.makeUserDataAddSource(queue)); const handler = vi.fn(); source.setEventHandler(handler); source.activate(); await host.flush();
  source.add(1); source.cancel(); await host.flush(); expect(handler).not.toHaveBeenCalled();
});
it("user data or uses safe unsigned bits beyond JavaScript's 32-bit bitwise range", async () => {
  const source = keep(D.DFXSource.makeUserDataOrSource()); const values: number[] = [];
  source.setEventHandler(() => { values.push(source.data); }); source.or(2 ** 40); source.or(3); source.or(1); source.activate(); await host.flush(); expect(values).toEqual([2 ** 40 + 3]);
});
it("user data replace keeps the latest value and zero does not enqueue a handler", async () => {
  const source = keep(D.DFXSource.makeUserDataReplaceSource()); const values: number[] = [];
  source.setEventHandler(() => { values.push(source.data); }); source.replace(1); source.replace(7); source.activate(); await host.flush(); expect(values).toEqual([7]);
  source.replace(0); await host.flush(); expect(values).toEqual([7]);
});
it("handlers accept nullable resets and WorkItem overloads", async () => {
  const source = keep(D.DFXSource.makeUserDataAddSource()); const events: string[] = [];
  source.setRegistrationHandler(() => { events.push("old"); }); source.setRegistrationHandler(null);
  source.setEventHandler(new D.DFXWorkItem(() => { events.push(`item:${source.data}`); }));
  source.setCancelHandler(new D.DFXWorkItem(() => { events.push("cancel"); }));
  source.add(1); source.activate(); await host.flush(); source.setEventHandler(null); source.add(2); await host.flush(); source.cancel(); await host.flush(); expect(events).toEqual(["item:1", "cancel"]);
});
it("source queue defaults to global default and accepts a nullable target", async () => {
  const source = keep(D.DFXSource.makeUserDataAddSource(null));
  source.setEventHandler(() => { D.dispatchPrecondition(D.DFXPredicate.onQueue(D.DFXQueue.global())); D.dispatchPrecondition(D.DFXPredicate.notOnQueue(D.DFXQueue.main)); });
  source.activate(); source.add(1); await host.flush();
});
it("timer expiration data coalesces missed intervals and reschedule clears pending data", async () => {
  const source = keep(D.DFXSource.makeTimerSource()); const values: number[] = [];
  source.setEventHandler(() => { values.push(source.data); }); source.schedule(new D.DFXTime(10e6), { repeating: ms(10) }); source.activate(); await host.flush();
  host.fire(35); await host.flush(); expect(values).toEqual([4]);
  host.fire(); source.schedule(D.DFXTime.now().advanced(ms(20))); await host.flush(); expect(values).toEqual([4]);
  host.fire(); await host.flush(); expect(values).toEqual([4, 1]);
});
it("timer schedule also accepts Apple's Double repeating seconds overload", async () => {
  const source = keep(D.DFXSource.makeTimerSource()); const handler = vi.fn(); source.setEventHandler(handler); source.schedule(new D.DFXTime(10e6), { repeating: 0.01 }); source.activate(); await host.flush(); host.fire(); await host.flush(); host.fire(); await host.flush(); expect(handler).toHaveBeenCalledTimes(2); expect(host.now).toBe(20);
});
it("source handler failures report once and still allow cancellation", async () => {
  expectedReports = 1; const source = keep(D.DFXSource.makeUserDataAddSource()); const cancel = vi.fn();
  source.setCancelHandler(cancel); source.setEventHandler(() => { source.cancel(); throw new Error("failure"); }); source.activate(); source.add(1); await host.flush(); expect(cancel).toHaveBeenCalledOnce();
});
it("rejects invalid source inputs with plain libdispatch errors", () => {
  const source = keep(D.DFXSource.makeUserDataAddSource());
  for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(() => source.add(value)).toThrow(/^BUG IN CLIENT OF LIBDISPATCH:/);
  const timer = keep(D.DFXSource.makeTimerSource());
  expect(() => timer.schedule(D.DFXTime.now(), { repeating: ms(-1) })).toThrow(/^BUG IN CLIENT OF LIBDISPATCH:/);
  expect(() => timer.schedule(D.DFXTime.now(), { leeway: ms(-1) })).toThrow(/^BUG IN CLIENT OF LIBDISPATCH:/);
});
it("asyncAfter preserves submitting QoS until its deadline", async () => {
  const source = new D.DFXQueue("after-caller", { qos: D.DFXQoS.userInteractive }); const target = new D.DFXQueue("after-target");
  const observed: D.DFXQoS[] = [];
  source.async(() => { target.asyncAfter(new D.DFXTime(10e6), () => { observed.push(currentExecution()!.qos); }); });
  await host.flush(); host.fire(); await host.flush(); expect(observed).toEqual([D.DFXQoS.userInteractive]);
});
it("source handlers preserve WorkItem creation-context QoS and options", async () => {
  const queue = new D.DFXQueue("source-qos"); const source = keep(D.DFXSource.makeUserDataAddSource(queue)); const observed: D.DFXQoS[] = [];
  D.DFXQueue.main.async(() => { source.setEventHandler({ flags: [D.DFXWorkItemFlags.assignCurrentContext, D.DFXWorkItemFlags.enforceQoS] }, () => { observed.push(currentExecution()!.qos); }); });
  await host.flush(); source.activate(); source.add(1); await host.flush(); expect(observed).toEqual([D.DFXQoS.userInteractive]);
});
it("sources are actual DFXSource instances and nullable retargeting resets global default", async () => {
  const source = keep(D.DFXSource.makeUserDataAddSource(new D.DFXQueue("old-source-target")));
  expect(source).toBeInstanceOf(D.DFXSource); source.setTarget(null);
  source.setEventHandler(() => { D.dispatchPrecondition(D.DFXPredicate.onQueue(D.DFXQueue.global())); }); source.activate(); source.add(1); await host.flush();
});
it("source handlers and asyncAfter report forbidden thenable returns once", async () => {
  expectedReports = 2;
  const source = keep(D.DFXSource.makeUserDataAddSource());
  // @ts-expect-error Runtime enforcement covers JavaScript callers too.
  source.setEventHandler(() => Promise.resolve()); source.activate(); source.add(1);
  // @ts-expect-error Runtime enforcement also covers delayed closures.
  D.DFXQueue.global().asyncAfter(new D.DFXTime(10e6), () => Promise.resolve());
  await host.flush(); host.fire(); await host.flush(); expect(host.reportError).toHaveBeenCalledTimes(2);
});

for (const kind of ["event", "registration", "cancel"] as const) for (const firstWait of ["old", "new"] as const) {
  it(`${kind} handler replacement keeps body, QoS, flags and ${firstWait}-first WorkItem associations together`, async () => {
    const queue = new D.DFXQueue(`replace-${kind}-${firstWait}`, { attributes: [D.DFXQueueAttributes.concurrent] });
    const notifications = new D.DFXQueue(`replace-notify-${kind}-${firstWait}`);
    const source = keep(D.DFXSource.makeUserDataAddSource(queue));
    const bodies: { body: string; qos: D.DFXQoS; barrier: boolean }[] = [];
    const completed: string[] = [];
    const old = new D.DFXWorkItem({ qos: D.DFXQoS.background, flags: [D.DFXWorkItemFlags.enforceQoS, D.DFXWorkItemFlags.barrier] }, () => {
      bodies.push({ body: "old", qos: currentExecution()!.qos, barrier: currentExecution()!.barrier });
    });
    const replacement = new D.DFXWorkItem({ qos: D.DFXQoS.userInteractive, flags: [D.DFXWorkItemFlags.enforceQoS] }, () => {
      bodies.push({ body: "new", qos: currentExecution()!.qos, barrier: currentExecution()!.barrier });
    });
    old.notify(notifications, () => { completed.push("old"); }); replacement.notify(notifications, () => { completed.push("new"); });
    if (kind === "registration") { source.setRegistrationHandler(old); source.activate(); source.setRegistrationHandler(replacement); }
    else {
      source.activate(); await host.flush();
      if (kind === "event") { source.setEventHandler(old); source.add(1); source.setEventHandler(replacement); }
      else { source.setCancelHandler(old); source.cancel(); source.setCancelHandler(replacement); }
    }
    if (firstWait === "old") {
      expect(old.wait(D.DFXTime.now())).toBe(D.DFXTimeoutResult.timedOut);
      expect(bodies).toEqual([]);
    }
    expect(replacement.wait(D.DFXTime.now())).toBe(D.DFXTimeoutResult.success);
    expect(bodies).toEqual([{ body: "new", qos: D.DFXQoS.userInteractive, barrier: false }]);
    expect(old.wait(D.DFXTime.now())).toBe(D.DFXTimeoutResult.timedOut);
    await host.flush(); expect(completed).toEqual(["new"]);
    // Replacing a slot neither executes nor completes its former WorkItem.
    old.perform(); await host.flush(); expect(completed).toEqual(["new", "old"]);
    expect(bodies.map(value => value.body)).toEqual(["new", "old"]);
  });
}
it("clearing a queued handler removes its WorkItem association while preserving nullable reset behaviour", async () => {
  const source = keep(D.DFXSource.makeUserDataAddSource()); const events: number[] = []; const notified = vi.fn();
  const old = new D.DFXWorkItem(() => { events.push(source.data); }); old.notify(D.DFXQueue.global(), notified);
  source.activate(); await host.flush(); source.setEventHandler(old); source.add(1); source.setEventHandler(null);
  expect(old.wait(D.DFXTime.now())).toBe(D.DFXTimeoutResult.timedOut); await host.flush(); expect(events).toEqual([]); expect(notified).not.toHaveBeenCalled();
  source.setEventHandler(() => { events.push(source.data); }); source.add(2); await host.flush(); expect(events).toEqual([2]);
});

function synchronousTyping(queue: D.DFXQueue, source: D.DFXSourceProtocol, native: () => void | Promise<void>, custom: () => number | PromiseLike<number>): void {
  const deadline = D.DFXTime.now();
  // @ts-expect-error Native Promise unions are forbidden in asyncAfter.
  queue.asyncAfter(deadline, native);
  // @ts-expect-error Custom PromiseLike unions are forbidden in asyncAfter options.
  queue.asyncAfter(deadline, {}, custom);
  // @ts-expect-error Native async handlers are forbidden.
  source.setEventHandler(async () => {});
  // @ts-expect-error Native union event handlers are forbidden.
  source.setEventHandler(native);
  // @ts-expect-error Custom union event handlers are forbidden with options.
  source.setEventHandler({}, custom);
  // @ts-expect-error Native union cancellation handlers are forbidden.
  source.setCancelHandler(native);
  // @ts-expect-error Custom union cancellation handlers are forbidden with options.
  source.setCancelHandler({}, custom);
  // @ts-expect-error Native union registration handlers are forbidden.
  source.setRegistrationHandler(native);
  // @ts-expect-error Custom union registration handlers are forbidden with options.
  source.setRegistrationHandler({}, custom);
  source.setEventHandler({}, null); source.setCancelHandler(null); source.setRegistrationHandler(null);
}
void synchronousTyping;
