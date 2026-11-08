// @vitest-environment jsdom
import React, { StrictMode, useLayoutEffect } from "react";
import { render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useNetwork } from "../../../src/SynCloudOS/AppSDK/hooks/useNetwork";
import { NWFXPathMonitor } from "../../../src/FX/NetworkFX/public";
import { associateNetworkPort } from "../../../src/FX/NetworkFX/internal/networkPort";
import { createMountedNetworkPort } from "../../../src/SynCloudOS/AppSDK/mountedNetworkPort";
import { registerSCOSAppSession } from "../../../src/SynCloudOS/AppSDK/scos/scosSessionRegistry";
import type { SynWareContextValue } from "../../../src/SynCloudOS/AppSDK/appContextTypes";
const selection = vi.hoisted(() => ({ context: null as unknown }));
vi.mock("../../../src/SynCloudOS/AppSDK/SynWareContext", () => ({ useSynWareContext: () => selection.context }));
afterEach(() => { vi.unstubAllGlobals(); });
it("returns a real monitor, survives StrictMode replay and immediately cancels only the actual unmount", () => {
  const tasks: (() => void)[] = []; vi.stubGlobal("scheduler", { postTask: (run: () => void) => { tasks.push(run); return Promise.resolve(); } });
  const owner = new AbortController(); const dispose = vi.fn(); const subscribe = vi.fn(() => ({ dispose }));
  const context = { appId: "com.example.hook", runtimeInfo: { id: "hook" }, signal: owner.signal } as SynWareContextValue;
  selection.context = context;
  associateNetworkPort(context, createMountedNetworkPort({ currentPath: () => ({ status: "satisfied" }), subscribe }, owner.signal, () => ["network.read"], () => true, () => () => {}));
  const unregister = registerSCOSAppSession({ appId: context.appId, displayName: "Hook", version: "1", context });
  const other = registerSCOSAppSession({ appId: context.appId, displayName: "Other runtime", version: "1", context: { ...context, runtimeInfo: { ...context.runtimeInfo, id: "other" } } });
  const listener = vi.fn(); let setups = 0;
  try {
    let held!: NWFXPathMonitor;
    function Probe() { const monitor = useNetwork(); held = monitor; useLayoutEffect(() => { setups++; monitor.pathUpdateHandler = listener; monitor.start(); }, [monitor]); return null; }
    const hook = render(<StrictMode><Probe /></StrictMode>);
    expect(setups).toBe(2); expect(held).toBeInstanceOf(NWFXPathMonitor); expect(subscribe).toHaveBeenCalledOnce(); expect(dispose).not.toHaveBeenCalled();
    hook.unmount(); expect(dispose).toHaveBeenCalledOnce(); while (tasks.length) tasks.shift()!(); expect(listener).not.toHaveBeenCalled(); expect(() => held.start()).toThrow();
  } finally { owner.abort(); unregister(); other(); }
});

it("rejects multiple exact mounted sessions rather than taking the first match", () => {
  const owner = new AbortController();
  const context = { appId: "com.example.network-ambiguous", runtimeInfo: { id: "duplicate" }, signal: owner.signal } as SynWareContextValue;
  selection.context = context;
  const a = registerSCOSAppSession({ appId: context.appId, displayName: "A", version: "1", context });
  const b = registerSCOSAppSession({ appId: context.appId, displayName: "B", version: "1", context: { ...context } });
  function Probe() { useNetwork(); return null; }
  try { expect(() => render(<Probe />)).toThrow(/ambiguous/); } finally { owner.abort(); a(); b(); }
});
