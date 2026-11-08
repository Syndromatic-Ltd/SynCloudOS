// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as Base from "../../../src/FX/DispatchFX/public";
import { bindFXFamily } from "../../../src/SynCloudOS/AppSDK/fx/bindFXFamily";
import { createSynWare, createSynWareTestHost } from "../../../src/SynCloudOS/AppSDK/testing";
import { dispatchQueueForSession } from "../../../src/FX/DispatchFX/internal/sessionBinding";
import { lifetimeOf } from "../../../src/FX/DispatchFX/internal/lifetime";
import { systemDispatch } from "../../../src/FX/DispatchFX/internal/systemBinding";
import { scosSessionsForApp } from "../../../src/SynCloudOS/AppSDK/scos/scosSessionRegistry";
import { currentExecution } from "../../../src/FX/DispatchFX/internal/executionStack";
import { registerSCOSAppSession } from "../../../src/SynCloudOS/AppSDK/scos/scosSessionRegistry";

const cleanup: (() => unknown)[] = [];
const tasks: (() => void)[] = [];
const D = bindFXFamily(Base, "com.example.dispatch");
const flush = () => { for (let count = 0; tasks.length && count < 100; count++) tasks.shift()!(); expect(tasks).toHaveLength(0); };
beforeEach(() => { vi.stubGlobal("scheduler", { postTask: (run: () => void) => { tasks.push(run); return Promise.resolve(); } }); vi.stubGlobal("reportError", vi.fn()); });
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose(); flush(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function mount(id = "runtime:dispatch") {
  const app = createSynWare({ manifest: { schemaVersion: 1, bundleIdentifier: "com.example.dispatch", displayName: "Dispatch", version: "1.0.0", routes: [{ path: "/dispatch", primary: true }] }, root: () => null });
  const host = createSynWareTestHost({ app, document }); cleanup.push(() => host.dispose()); await host.render();
  // Real TestHost context; only runtime ID selection is controlled for overlap cases.
  const context = { ...host.appContext, runtimeInfo: { ...host.appContext.runtimeInfo, id } };
  const controller = new AbortController();
  const dispose = registerSCOSAppSession({ appId: "com.example.dispatch", displayName: "Selected", version: "1.0.0", context: { ...context, signal: controller.signal } });
  // Remove the host's published session so this exact controlled lifetime is the only candidate.
  await host.dispose();
  cleanup.push(dispose);
  return { mounted: { dispose: () => { controller.abort(); dispose(); } }, context: { ...context, signal: controller.signal } };
}
it("binds stable classes without resolving a session and rejects public attributed bases", () => {
  expect(D.DFXQueue).not.toBe(Base.DFXQueue);
  expect(D.DFXQueue).toBe(bindFXFamily(Base, "COM.EXAMPLE.DISPATCH").DFXQueue);
  expect(D.DFXTime).toBe(Base.DFXTime);
  expect(() => new Base.DFXQueue("base")).toThrow(/^BUG IN CLIENT OF LIBDISPATCH: .*SynCloudOS plugin/);
  expect(() => Base.DFXQueue.main).toThrow(/SynCloudOS plugin/);
  expect(() => Base.DFXSource.makeTimerSource()).toThrow(/SynCloudOS plugin/);
  expect(() => new Base.DFXWorkItem(() => {})).toThrow(/SynCloudOS plugin/);
  expect(() => new D.DFXQueue("unmounted")).toThrow(/notRunning/);
});
it("items dispatched by an app after an await and in a timer carry its appId", async () => {
  const app = createSynWare({ manifest: { schemaVersion: 1, bundleIdentifier: "com.example.dispatch", displayName: "Dispatch", version: "1.0.0", routes: [{ path: "/dispatch", primary: true }] }, root: () => null });
  const host = createSynWareTestHost({ app, document }); cleanup.push(() => host.dispose()); await host.render();
  const seen: (string | null | undefined)[] = [];
  await Promise.resolve(); D.DFXQueue.main.async(() => { seen.push(currentExecution()?.appId); });
  await new Promise<void>(resolve => setTimeout(() => { new D.DFXQueue("timer").async(() => { seen.push(currentExecution()?.appId); }); resolve(); }, 0));
  await new Promise<void>(resolve => queueMicrotask(() => { D.DFXQueue.global().async(() => { seen.push(currentExecution()?.appId); }); resolve(); }));
  flush(); expect(seen).toEqual(Array(3).fill("com.example.dispatch"));
});
it("session end drops pending items, cancels sources with cancel handlers, clears timers", async () => {
  const { mounted } = await mount(); const seen: string[] = []; const queue = new D.DFXQueue("owned");
  const source = D.DFXSource.makeTimerSource({ queue });
  source.setCancelHandler(() => { seen.push("cancel:" + currentExecution()?.chain[0].label); });
  source.setEventHandler(() => { seen.push("event"); }); source.schedule(D.DFXTime.now().advanced(D.DFXTimeInterval.seconds(60))); source.activate(); flush();
  const clear = vi.spyOn(globalThis, "clearTimeout");
  queue.async(() => { seen.push("pending"); }); queue.asyncAfter(D.DFXTime.now().advanced(D.DFXTimeInterval.seconds(60)), () => { seen.push("later"); });
  mounted.dispose(); flush();
  expect(seen).toEqual(["cancel:owned"]); expect(source.isCancelled).toBe(true); expect(clear).toHaveBeenCalled();
  expect(() => queue.async(() => {})).toThrow(/ended/);
});
it("group still entered at session end is reported in dev with the enter site", async () => {
  const { mounted } = await mount(); const group = new D.DFXGroup(); group.enter(); mounted.dispose();
  expect(globalThis.reportError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/still entered/), stack: expect.stringContaining("app-binding.test.tsx") }));
});
it("fresh static lookups follow the latest same-runtime session while held handles stay pinned", async () => {
  const first = await mount(); const old = D.DFXQueue.main; const oldGlobal = D.DFXQueue.global();
  const controller = new AbortController();
  const dispose = registerSCOSAppSession({ appId: "com.example.dispatch", displayName: "Later", version: "1.0.0", context: { ...first.context, signal: controller.signal } }); cleanup.push(dispose);
  const next = D.DFXQueue.main; expect(next).not.toBe(old); expect(D.DFXQueue.global()).not.toBe(oldGlobal);
  const seen: string[] = []; old.async(() => { seen.push("old"); }); next.async(() => { seen.push("new"); });
  first.mounted.dispose(); flush(); expect(seen).toEqual(["new"]); expect(() => old.sync(() => {})).toThrow(/ended/);
  expect(D.DFXQueue.main).toBe(next);
});
it("unpublishing a session cancels it without an abort and relaunch gives fresh handles", async () => {
  const first = await mount(); const dispose = registerSCOSAppSession({ appId: "com.example.dispatch", displayName: "Transient", version: "1.0.0", context: first.context });
  const old = D.DFXQueue.main; const item = new D.DFXWorkItem(() => {}); const source = D.DFXSource.makeUserDataAddSource();
  dispose(); expect(first.context.signal.aborted).toBe(false);
  expect(() => old.async(() => {})).toThrow(/ended/); expect(() => item.perform()).toThrow(/ended/); expect(source.isCancelled).toBe(true);
  expect(D.DFXQueue.main).not.toBe(old); expect(D.DFXQueue.main).toBeInstanceOf(D.DFXQueue); expect(D.DFXQueue.main).toBeInstanceOf(Base.DFXQueue);
});
it("fresh main and global report ambiguity even with live cached handles", async () => {
  await mount(); const old = D.DFXQueue.main; await mount("other:runtime");
  expect(() => D.DFXQueue.main).toThrow(/ambiguous/); expect(() => D.DFXQueue.global()).toThrow(/ambiguous/);
  const ran = vi.fn(); old.sync(ran); expect(ran).toHaveBeenCalledOnce();
});
it("all factory-produced source objects preserve the exposed per-app and raw source identities", async () => {
  await mount();
  for (const source of [D.DFXSource.makeTimerSource(), D.DFXSource.makeUserDataAddSource(), D.DFXSource.makeUserDataOrSource(), D.DFXSource.makeUserDataReplaceSource(), D.DFXSource.makeMemoryPressureSource([])]) {
    expect(source).toBeInstanceOf(D.DFXSource); expect(source).toBeInstanceOf(Base.DFXSource);
  }
});


it("internal defaults use the selected exact session despite later ambiguity", async () => {
  await mount(); const session = scosSessionsForApp("com.example.dispatch")[0]; const old = D.DFXQueue.main;
  const Selected = dispatchQueueForSession(session); expect(Selected.main).toBe(old);
  await mount("runtime:other"); expect(() => D.DFXQueue.main).toThrow(/ambiguous/);
  expect(dispatchQueueForSession(session).main).toBe(old);
  expect(() => Selected.global().sync(() => {})).not.toThrow();
});
it("system queues and sources retain base identity without an application", () => {
  const System = systemDispatch(); expect(System.DFXTime).toBe(Base.DFXTime);
  expect(System.DFXQueue.main).toBeInstanceOf(System.DFXQueue); expect(System.DFXQueue.main).toBeInstanceOf(Base.DFXQueue);
  const source = System.DFXSource.makeUserDataAddSource();
  expect(source).toBeInstanceOf(System.DFXSource); expect(source).toBeInstanceOf(Base.DFXSource); source.cancel(); source.activate();
});
it("teardown runs throwing cancel WorkItems on a suspended source queue and preserves normal stale guards", async () => {
  const { mounted } = await mount(); const queue = new D.DFXQueue("cancel-queue"); const key = new D.DFXSpecificKey<string>(); queue.setSpecific(key, "cancel-queue"); queue.suspend();
  const source = D.DFXSource.makeUserDataAddSource(queue); const calls: string[] = [];
  const failure = new Error("cancel failure");
  const item = new D.DFXWorkItem(() => { calls.push(D.DFXQueue.getSpecific(key)!); throw failure; });
  const notify = vi.fn(); item.notify(queue, notify); source.setCancelHandler(item); source.setEventHandler(() => { calls.push("event"); }); source.add(2);
  mounted.dispose(); flush();
  expect(calls).toEqual(["cancel-queue"]); expect(notify).not.toHaveBeenCalled();
  expect(globalThis.reportError).toHaveBeenCalledOnce(); expect(globalThis.reportError).toHaveBeenCalledWith(expect.objectContaining({ cause: failure }));
  expect(() => item.perform()).toThrow(/ended/); expect(() => queue.sync(item)).toThrow(/ended/); expect(() => source.add(3)).toThrow(/ended/);
  source.cancel(); flush(); expect(calls).toHaveLength(1);
});
it("ending a session inside an atomic grouped item balances the automatic entry", async () => {
  const { mounted } = await mount(); const group = new D.DFXGroup(); const queue = D.DFXQueue.main;
  queue.async({ group }, () => { mounted.dispose(); }); flush();
  expect(globalThis.reportError).not.toHaveBeenCalled();
});
it("concurrentPerform and direct WorkItem perform carry their app attribution", async () => {
  await mount(); const seen: (string | null | undefined)[] = [];
  D.DFXQueue.concurrentPerform(2, () => { seen.push(currentExecution()?.appId); });
  new D.DFXWorkItem(() => { seen.push(currentExecution()?.appId); }).perform();
  expect(seen).toEqual(Array(3).fill("com.example.dispatch"));
});
it("sync cannot return a result when its earlier item ends the selected session", async () => {
  const { mounted } = await mount(); const queue = new D.DFXQueue("end-before-sync"); const ran = vi.fn();
  queue.async(() => { mounted.dispose(); });
  expect(() => queue.sync(ran)).toThrow(/ended/); expect(ran).not.toHaveBeenCalled();
});
it("a live source cannot acquire an already-ended WorkItem as its teardown handler", async () => {
  const first = await mount(); const ran = vi.fn(); const old = new D.DFXWorkItem(ran); first.mounted.dispose();
  await mount(); const source = D.DFXSource.makeUserDataAddSource();
  expect(() => source.setCancelHandler(old)).toThrow(/ended/);
});
it("coalesced delayed timers from another same-app session survive teardown", async () => {
  const first = await mount(); const old = D.DFXQueue.main;
  const controller = new AbortController();
  const dispose = registerSCOSAppSession({ appId: "com.example.dispatch", displayName: "Later", version: "1.0.0", context: { ...first.context, signal: controller.signal } }); cleanup.push(dispose);
  const later = D.DFXQueue.main; const calls: string[] = [];
  vi.useFakeTimers();
  try {
    const deadline = D.DFXWallTime.now().advanced(D.DFXTimeInterval.milliseconds(10));
    old.asyncAfter(deadline, () => { calls.push("old"); }); later.asyncAfter(deadline, () => { calls.push("later"); });
    first.mounted.dispose(); vi.advanceTimersByTime(10); flush(); expect(calls).toEqual(["later"]);
  } finally { vi.useRealTimers(); }
});
it("the cancel WorkItem exception applies only to the source's own ended lifetime", async () => {
  const first = await mount(); const called = vi.fn(); const item = new D.DFXWorkItem(called);
  const controller = new AbortController();
  const dispose = registerSCOSAppSession({ appId: "com.example.dispatch", displayName: "Later", version: "1.0.0", context: { ...first.context, signal: controller.signal } }); cleanup.push(dispose);
  const source = D.DFXSource.makeUserDataAddSource(); source.setCancelHandler(item);
  first.mounted.dispose(); controller.abort(); flush();
  expect(called).not.toHaveBeenCalled(); expect(globalThis.reportError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("ended") }));
});


it("rejects ended direct and transitive targets at construction and retargeting", async () => {
  const first = await mount(); const target = new D.DFXQueue("old-target");
  await mount(); const intermediate = new D.DFXQueue("live-intermediate", { target });
  first.mounted.dispose();
  expect(() => new D.DFXQueue("revived", { target })).toThrow(/ended/);
  expect(() => new D.DFXQueue("transitive", { target: intermediate })).toThrow(/ended/);
  expect(() => new D.DFXQueue("retarget").setTarget(intermediate)).toThrow(/ended/);
});
for (const suspended of [false, true]) it(`drops saved jobs when their ${suspended ? "suspended" : "active"} foreign target ends`, async () => {
  const first = await mount(); const target = new D.DFXQueue("old-target"); if (suspended) target.suspend();
  await mount(); const child = new D.DFXQueue("live-child", { target }); const group = new D.DFXGroup(); const ran = vi.fn();
  child.async(group, new D.DFXWorkItem(ran));
  first.mounted.dispose(); flush();
  expect(ran).not.toHaveBeenCalled(); expect(group.wait(D.DFXTime.now())).toBe(D.DFXTimeoutResult.success);
  expect(() => child.async(ran)).toThrow(/ended/); expect(() => child.sync(ran)).toThrow(/ended/);
  expect(D.DFXQueue.main.sync(() => "live")).toBe("live");
  expect(globalThis.reportError).not.toHaveBeenCalled();
});
it("active retargeting preserves old submission lifetimes and later live work", async () => {
  const first = await mount(); const target = new D.DFXQueue("old-target");
  await mount(); const child = new D.DFXQueue("live-child", { target }); const seen: string[] = [];
  child.async(() => { seen.push("old-snapshot"); }); child.setTarget(D.DFXQueue.main); child.async(() => { seen.push("new-snapshot"); });
  first.mounted.dispose(); flush(); expect(seen).toEqual(["new-snapshot"]);
});
it("inactive retargeting releases the old chain lifetime before the old target ends", async () => {
  const first = await mount(); const target = new D.DFXQueue("old-target");
  await mount(); const child = new D.DFXQueue("inactive-child", { target, attributes: [D.DFXQueueAttributes.initiallyInactive] }); const ran = vi.fn();
  child.async(ran); child.setTarget(D.DFXQueue.main); first.mounted.dispose(); child.activate(); flush();
  expect(ran).toHaveBeenCalledOnce();
});
it("inactive retargeting adopts the replacement target lifetime for pending work", async () => {
  const first = await mount(); const target = new D.DFXQueue("old-target");
  await mount(); const child = new D.DFXQueue("inactive-child", { attributes: [D.DFXQueueAttributes.initiallyInactive] }); const group = new D.DFXGroup(); const ran = vi.fn();
  child.async({ group }, ran); child.setTarget(target); first.mounted.dispose(); child.activate(); flush();
  expect(ran).not.toHaveBeenCalled(); expect(group.wait(D.DFXTime.now())).toBe(D.DFXTimeoutResult.success);
});
it("sync traps if an earlier item ends a saved target while the child remains live", async () => {
  const first = await mount(); const target = new D.DFXQueue("old-target");
  await mount(); const child = new D.DFXQueue("live-child", { target }); const ran = vi.fn();
  child.async(() => { first.mounted.dispose(); });
  expect(() => child.sync(ran)).toThrow(/ended/); expect(ran).not.toHaveBeenCalled();
});
it("matching teardown cancellation can use its own ended target chain", async () => {
  const first = await mount(); const key = new D.DFXSpecificKey<string>(); const target = new D.DFXQueue("target"); target.setSpecific(key, "own"); target.suspend();
  const child = new D.DFXQueue("child", { target }); const source = D.DFXSource.makeUserDataAddSource(child); const seen: string[] = [];
  source.setCancelHandler(() => { seen.push(D.DFXQueue.getSpecific(key)!); }); first.mounted.dispose(); flush();
  expect(seen).toEqual(["own"]); expect(globalThis.reportError).not.toHaveBeenCalled();
});
it("teardown cancellation cannot revive a foreign ended target chain", async () => {
  const first = await mount(); const target = new D.DFXQueue("foreign");
  const second = await mount(); const child = new D.DFXQueue("child", { target }); const source = D.DFXSource.makeUserDataAddSource(child); const ran = vi.fn();
  source.setCancelHandler(ran); first.mounted.dispose(); second.mounted.dispose(); flush();
  expect(ran).not.toHaveBeenCalled(); expect(globalThis.reportError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("ended") }));
});
it("completed WorkItems release lifetime cleanup while retaining reusable bodies and notifications", async () => {
  const first = await mount(); const queue = D.DFXQueue.main; const lifetime = lifetimeOf(queue); const before = lifetime.resources.size; const ran = vi.fn(); const notified = vi.fn();
  const item = new D.DFXWorkItem(ran); item.notify(queue, notified); item.perform(); flush();
  expect(lifetime.resources.size).toBe(before);
  item.perform(); item.notify(queue, notified); flush();
  expect(ran).toHaveBeenCalledTimes(2); expect(notified).toHaveBeenCalledTimes(2); expect(lifetime.resources.size).toBe(before);
  first.mounted.dispose(); expect(() => item.perform()).toThrow(/ended/);
});
it("unperformed WorkItems without notifications register no retaining cleanup", async () => {
  await mount(); const lifetime = lifetimeOf(D.DFXQueue.main); const before = lifetime.resources.size;
  for (let index = 0; index < 4; index++) new D.DFXWorkItem(() => new Uint8Array(1024));
  expect(lifetime.resources.size).toBe(before);
});
it("internal delayed and notification WorkItems leave no cleanup after completion", async () => {
  await mount(); const queue = D.DFXQueue.main; const lifetime = lifetimeOf(queue); const before = lifetime.resources.size; const ran = vi.fn();
  vi.useFakeTimers();
  try {
    for (let index = 0; index < 4; index++) {
      const item = new D.DFXWorkItem(() => {}); item.perform(); item.notify(queue, ran);
      queue.asyncAfter(D.DFXWallTime.now().advanced(D.DFXTimeInterval.milliseconds(10)), ran);
    }
    vi.advanceTimersByTime(10); flush(); expect(ran).toHaveBeenCalledTimes(8); expect(lifetime.resources.size).toBe(before);
  } finally { vi.useRealTimers(); }
});
it("pending notifications still suppress on owner end before privileged cancel WorkItem execution", async () => {
  const first = await mount(); const source = D.DFXSource.makeUserDataAddSource(); const cancelled = vi.fn(); const notified = vi.fn();
  const item = new D.DFXWorkItem(cancelled); item.notify(systemDispatch().DFXQueue.main, notified); source.setCancelHandler(item);
  first.mounted.dispose(); flush(); expect(cancelled).toHaveBeenCalledOnce(); expect(notified).not.toHaveBeenCalled();
});
