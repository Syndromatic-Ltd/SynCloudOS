import { afterEach, expect, it, vi } from "vitest";
import { createSynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";
import * as Base from "@syndromatic/syncloudos/fx/dispatch";
import First, * as first from "./src/SynWare/First.app/Contents/index";
import Second, * as second from "./src/SynWare/Second.app/Contents/index";
import firstInfo from "./src/SynWare/First.app/Contents/Info";
import secondInfo from "./src/SynWare/Second.app/Contents/Info";
afterEach(() => { vi.unstubAllGlobals(); });
it("compiled .app imports select per-app Dispatch classes across await, timer and third-party callbacks", async () => {
  const tasks: (() => void)[] = [];
  vi.stubGlobal("scheduler", { postTask: (run: () => void) => { tasks.push(run); return Promise.resolve(); } });
  const flush = () => { for (let n = 0; tasks.length && n < 100; n++) tasks.shift()!(); expect(tasks).toHaveLength(0); };
  expect(first.DFXQueue).not.toBe(Base.DFXQueue); expect(first.DFXQueue).not.toBe(second.DFXQueue);
  expect(first.DFXTime).toBe(Base.DFXTime); expect(() => Base.DFXQueue.main).toThrow(/SynCloudOS plugin/);
  expect(() => first.DFXQueue.main).toThrow(/notRunning/);
  const a = createSynWareTestHost({ application: First, manifest: { schemaVersion: 1, ...firstInfo }, document });
  const b = createSynWareTestHost({ application: Second, manifest: { schemaVersion: 1, ...secondInfo }, document });
  const events: string[] = [];
  try {
    await a.render(); await b.render();
    const main = first.DFXQueue.main;
    expect(await first.afterAwait()).toBe(main); expect(await first.afterTimer()).toBe(first.DFXQueue.global());
    expect(main).toBeInstanceOf(first.DFXQueue); expect(main).toBeInstanceOf(Base.DFXQueue);
    expect(main).not.toBe(second.DFXQueue.main);
    await new Promise<void>(resolve => queueMicrotask(() => first.thirdParty(create => { create().async(() => { events.push("callback"); }); resolve(); })));
    (await first.afterAwait()).async(() => { events.push("await"); }); (await first.afterTimer()).async(() => { events.push("timer"); }); flush();
    expect(events.sort()).toEqual(["await", "callback", "timer"]); events.length = 0;
    const source = first.DFXSource.makeTimerSource({ queue: main });
    expect(source).toBeInstanceOf(first.DFXSource); expect(source).toBeInstanceOf(Base.DFXSource);
    source.setCancelHandler(new first.DFXWorkItem(() => { events.push("cancel"); }));
    source.schedule(first.DFXTime.now().advanced(first.DFXTimeInterval.seconds(60))); source.activate(); flush();
    main.async(() => { events.push("stale"); }); main.asyncAfter(first.DFXTime.now().advanced(first.DFXTimeInterval.seconds(60)), () => { events.push("timer-stale"); });
    const child = new second.DFXQueue("foreign-target", { target: main }); child.async(() => { events.push("foreign-stale"); });
    second.DFXQueue.main.async(() => { events.push("second"); });
    await a.dispose(); flush(); expect(events.sort()).toEqual(["cancel", "second"]); expect(source.isCancelled).toBe(true);
    expect(() => main.async(() => {})).toThrow(/ended/);
    expect(() => new second.DFXQueue("ended-target", { target: main })).toThrow(/ended/);
    const relaunched = createSynWareTestHost({ application: First, manifest: { schemaVersion: 1, ...firstInfo }, document });
    try { await relaunched.render(); expect(first.DFXQueue.main).not.toBe(main); expect(() => main.sync(() => {})).toThrow(/ended/); }
    finally { await relaunched.dispose(); }
  } finally { await a.dispose(); await b.dispose(); flush(); }
});
