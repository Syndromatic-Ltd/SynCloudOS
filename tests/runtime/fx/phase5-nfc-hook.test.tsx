// @vitest-environment jsdom
import React, { StrictMode, Suspense, useLayoutEffect } from "react";
import { render, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useNFC } from "../../../src/SynCloudOS/AppSDK/hooks/useNFC";
import * as N from "../../../src/FX/NFCFX/public";
import { associateNFCPort, type NFCNativeSession, type NFCEvents } from "../../../src/FX/NFCFX/internal/nfcPort";
import { createMountedNFCPort } from "../../../src/SynCloudOS/AppSDK/mountedNFCPort";
import { registerSCOSAppSession } from "../../../src/SynCloudOS/AppSDK/scos/scosSessionRegistry";
import type { SynWareContextValue } from "../../../src/SynCloudOS/AppSDK/appContextTypes";
const selection = vi.hoisted(() => ({ context: null as unknown }));
vi.mock("../../../src/SynCloudOS/AppSDK/SynWareContext", () => ({ useSynWareContext: () => selection.context }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("returns a real NFC session for a branding clone, survives StrictMode, and releases pending scan on true unmount", async () => {
  const jobs: (() => void)[] = []; vi.stubGlobal("scheduler", { postTask: (job: () => void) => { jobs.push(job); return Promise.resolve(); } });
  const owner = new AbortController(); let resolve!: (native: NFCNativeSession) => void; let events!: NFCEvents; const invalidate = vi.fn(async () => {});
  const open = vi.fn((_signal: AbortSignal, value: NFCEvents) => { events = value; return new Promise<NFCNativeSession>(done => { resolve = done; }); });
  const context = { appId: "com.example.nfc-hook", runtimeInfo: { id: "duplicate" }, signal: owner.signal } as SynWareContextValue; selection.context = { ...context };
  associateNFCPort(context, createMountedNFCPort({ readingAvailable: true, open }, owner.signal, () => ["nfc.read"], () => true));
  const unregister = registerSCOSAppSession({ appId: context.appId, displayName: "Hook", version: "1", context }); const other = registerSCOSAppSession({ appId: context.appId, displayName: "Other", version: "1", context: { ...context, signal: new AbortController().signal } });
  try {
    let held!: N.NFXNDEFReaderSession; let setups = 0; const received = vi.fn(); const delegate = { readerSessionDidInvalidateWithError: received, readerSessionDidDetectNDEFs: received };
    function Probe() { held = useNFC(delegate, null, false); useLayoutEffect(() => { setups++; }, []); return null; }
    const view = render(<StrictMode><Probe /></StrictMode>); expect(setups).toBe(2); expect(held).toBeInstanceOf(N.NFXNDEFReaderSession); expect(open).not.toHaveBeenCalled(); const original = held; view.rerender(<StrictMode><Probe /></StrictMode>); expect(held).toBe(original);
    held.begin(); expect(open).toHaveBeenCalledOnce(); view.unmount(); resolve({ connect: async () => {}, restartPolling() {}, invalidate });
    for (let i = 0; i < 30; i++) await Promise.resolve(); events.messages([new N.NFXNDEFMessage([])]); while (jobs.length) jobs.shift()!(); expect(received).not.toHaveBeenCalled(); expect(invalidate).toHaveBeenCalledOnce(); expect(() => held.begin()).toThrow(N.NFXReaderError);
    const pending = new Promise(() => {}); function Suspended(): React.ReactNode { useNFC(delegate); throw pending; } render(<StrictMode><Suspense fallback={null}><Suspended /></Suspense></StrictMode>); expect(open).toHaveBeenCalledOnce();
  } finally { owner.abort(); unregister(); other(); }
});
it("rejects ambiguous exact mounts instead of picking duplicate runtime IDs", () => {
  const owner = new AbortController(); const context = { appId: "com.example.nfc-ambiguous", runtimeInfo: { id: "duplicate" }, signal: owner.signal } as SynWareContextValue; selection.context = { ...context };
  const a = registerSCOSAppSession({ appId: context.appId, displayName: "A", version: "1", context }); const b = registerSCOSAppSession({ appId: context.appId, displayName: "B", version: "1", context: { ...context } });
  function Probe() { useNFC({ readerSessionDidInvalidateWithError() {} }); return null; } try { expect(() => render(<Probe />)).toThrow(/ambiguous/); } finally { owner.abort(); a(); b(); }
});
