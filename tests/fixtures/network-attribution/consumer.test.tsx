import React from "react";
import { createSynWare } from "@syndromatic/syncloudos/sdk/testing";
import { expect, it, vi } from "vitest";
import { createSynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";
import { NWFXPathMonitor as BaseMonitor } from "@syndromatic/syncloudos/fx/network";
import Application, { afterAwait, afterTimer, thirdParty, NetworkHookProbe, NWFXPathMonitor, NWFXPath, NWFXInterface, NWFXError, DFXQueue } from "./src/SynWare/First.app/Contents/index";
import info from "./src/SynWare/First.app/Contents/Info";
it("compiled Network app retains attribution after await, timer and callback with private host access", async () => {
  const tasks: (() => void)[] = []; vi.stubGlobal("scheduler", { postTask: (run: () => void) => { tasks.push(run); return Promise.resolve(); } });
  const flush = () => { for (let n = 0; tasks.length && n < 100; n++) tasks.shift()!(); expect(tasks).toHaveLength(0); };
  const host = createSynWareTestHost({ application: Application, manifest: { schemaVersion: 1, ...info }, document });
  try {
    expect(() => new BaseMonitor()).toThrow(/application bundle/); expect(() => new NWFXPathMonitor()).toThrow(NWFXError);
    await host.render(); host.adapters.permissions.allow(); host.adapters.policy.allow(); expect("network" in host.appContext).toBe(false);
    host.adapters.network.allow();
    const fromAwait = await afterAwait(); const fromTimer = await afterTimer();
    let fromCallback!: NWFXPathMonitor;
    await new Promise<void>(resolve => queueMicrotask(() => thirdParty(create => { fromCallback = create(); resolve(); })));
    const received: NWFXPath[] = [];
    for (const monitor of [fromAwait, fromTimer, fromCallback]) { expect(monitor).toBeInstanceOf(NWFXPathMonitor); expect(monitor).toBeInstanceOf(BaseMonitor); monitor.pathUpdateHandler = path => { received.push(path); }; monitor.start(DFXQueue.main); expect(monitor.queue).toBe(DFXQueue.main); }
    expect(received).toHaveLength(0); flush(); expect(received).toHaveLength(3); expect(received[0]).toBeInstanceOf(NWFXPath); expect(received[0].availableInterfaces[0]).toBeInstanceOf(NWFXInterface);
    host.adapters.network.setStatus("unsatisfied"); flush(); expect(fromAwait.currentPath.status).toBe("unsatisfied");
    host.adapters.network.setStatus("satisfied"); host.adapters.permissions.deny(); expect(host.adapters.network.activeMonitorCount()).toBe(0);
    host.adapters.permissions.allow(); flush(); expect(received).toHaveLength(6); expect(() => fromAwait.start(DFXQueue.main)).toThrow(NWFXError);
    const replacement = await afterAwait(); replacement.pathUpdateHandler = path => { received.push(path); }; replacement.start(DFXQueue.main);
    await host.dispose(); flush(); expect(received).toHaveLength(6); expect(host.adapters.network.activeMonitorCount()).toBe(0); expect(() => replacement.start(replacement.queue!)).toThrow(NWFXError);
  } finally { await host.dispose(); flush(); vi.unstubAllGlobals(); }
});
it("host Network denial overrides an entitled app and maps to NWError", async () => {
  const host = createSynWareTestHost({ application: Application, manifest: { schemaVersion: 1, ...info }, document });
  try { await host.render(); host.adapters.permissions.allow(); host.adapters.policy.allow(); const monitor = new NWFXPathMonitor(); expect(() => monitor.start(DFXQueue.main)).toThrow(NWFXError); expect(host.adapters.network.activeMonitorCount()).toBe(0); }
  finally { await host.dispose(); }
});

it("compiled hook returns the imported app class through real branded StrictMode mounting and true unmount", async () => {
  const jobs: (() => void)[] = []; vi.stubGlobal("scheduler", { postTask: (job: () => void) => { jobs.push(job); return Promise.resolve(); } });
  const received: NWFXPathMonitor[] = [];
  const receive = (monitor: NWFXPathMonitor) => { received.push(monitor); monitor.start(DFXQueue.main); };
  const app = createSynWare({ manifest: { schemaVersion: 1, ...info }, root: () => <NetworkHookProbe receive={receive} /> });
  const host = createSynWareTestHost({ app, document, strictMode: true });
  try {
    host.adapters.permissions.allow(); host.adapters.policy.allow(); host.adapters.network.allow();
    const view = await host.render();
    expect(received).toHaveLength(2); expect(received[0]).toBe(received[1]);
    const monitor = received[0]; expect(monitor).toBeInstanceOf(NWFXPathMonitor); expect(monitor).toBeInstanceOf(BaseMonitor);
    expect(host.adapters.network.activeMonitorCount()).toBe(1);
    const listener = vi.fn(); monitor.pathUpdateHandler = listener;
    view.unmount(); expect(host.adapters.network.activeMonitorCount()).toBe(0);
    while (jobs.length) jobs.shift()!(); expect(listener).not.toHaveBeenCalled(); expect(() => monitor.start(monitor.queue!)).toThrow(NWFXError);
  } finally { await host.dispose(); vi.unstubAllGlobals(); }
});
