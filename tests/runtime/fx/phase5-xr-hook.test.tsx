// @vitest-environment jsdom
import React, { StrictMode, useLayoutEffect } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useXR } from "../../../src/SynCloudOS/AppSDK/hooks/useXR";
import * as XR from "../../../src/FX/XRFX/public";
import { associateXRPort, type XRCallbacks } from "../../../src/FX/XRFX/internal/xrPort";
import { createMountedXRPort } from "../../../src/SynCloudOS/AppSDK/mountedXRPort";
import { registerSCOSAppSession } from "../../../src/SynCloudOS/AppSDK/scos/scosSessionRegistry";
import type { SynWareContextValue } from "../../../src/SynCloudOS/AppSDK/appContextTypes";
const selection = vi.hoisted(() => ({ context: null as unknown }));
vi.mock("../../../src/SynCloudOS/AppSDK/SynWareContext", () => ({ useSynWareContext: () => selection.context }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it.each([false,true])("returns the real class for exact/branding context %s, survives StrictMode replay and ends on actual unmount", async branded => {
  const jobs: (() => void)[] = []; vi.stubGlobal("scheduler", { postTask: (work: () => void) => { jobs.push(work); return Promise.resolve(); } });
  const owner = new AbortController(); const pause = vi.fn(async () => {}); let callbacks!: XRCallbacks;
  const start = vi.fn(async (_config: unknown, _signal: AbortSignal, values: XRCallbacks) => { callbacks = values; return { pause, add: async () => {}, remove: async () => {}, raycast: async () => [] }; });
  const context = { appId: "com.example.xr-hook", runtimeInfo: { id: "duplicate" }, signal: owner.signal } as SynWareContextValue;
  selection.context = branded ? { ...context } : context; associateXRPort(context, createMountedXRPort({ start, isSupported: async () => true }, owner.signal, () => ["xr.session"], () => true));
  const unregister = registerSCOSAppSession({ appId: context.appId, displayName: "XR", version: "1", context });
  const other = registerSCOSAppSession({ appId: context.appId, displayName: "Other", version: "1", context: { ...context, signal: new AbortController().signal } });
  try {
    let held!: XR.XRFXSession, setups = 0; function Probe() { held = useXR(); useLayoutEffect(() => { setups++; }, []); return null; }
    const view = render(<StrictMode><Probe /></StrictMode>); expect(setups).toBe(2); expect(held).toBeInstanceOf(XR.XRFXSession); expect(start).not.toHaveBeenCalled();
    const original = held; view.rerender(<StrictMode><Probe /></StrictMode>); expect(held).toBe(original);
    const interrupted = vi.fn(); held.delegate = { sessionWasInterrupted: interrupted }; const configuration = new XR.XRFXOrientationTrackingConfiguration(); configuration.isLightEstimationEnabled = false; held.run(configuration);
    for (let i = 0; i < 30; i++) await Promise.resolve(); callbacks.interrupted(); view.unmount(); while (jobs.length) jobs.shift()!();
    expect(interrupted).not.toHaveBeenCalled(); expect(pause).toHaveBeenCalledOnce(); expect(() => held.run(configuration)).toThrow(XR.XRFXError);
  } finally { owner.abort(); unregister(); other(); }
});
it("rejects duplicate exact sessions even when configured runtime IDs match", () => {
  const owner = new AbortController(); const context = { appId: "com.example.xr-ambiguous", runtimeInfo: { id: "duplicate" }, signal: owner.signal } as SynWareContextValue; selection.context = { ...context };
  const a = registerSCOSAppSession({ appId: context.appId, displayName: "A", version: "1", context }), b = registerSCOSAppSession({ appId: context.appId, displayName: "B", version: "1", context: { ...context } });
  function Probe() { useXR(); return null; } try { expect(() => render(<Probe />)).toThrow(/ambiguous/); } finally { owner.abort(); a(); b(); }
});
