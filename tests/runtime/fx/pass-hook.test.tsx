// @vitest-environment jsdom
import React, { StrictMode, Suspense, useLayoutEffect } from "react";
import { render, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePayment } from "../../../src/SynCloudOS/AppSDK/hooks/usePayment";
import * as P from "../../../src/FX/PassFX/public";
import { NSEDecimalNumber } from "../../../src/Foundation/NSEDecimalNumber";
import { associatePaymentPort, type PaymentResponse } from "../../../src/FX/PassFX/internal/paymentPort";
import { createMountedPaymentPort } from "../../../src/SynCloudOS/AppSDK/mountedPaymentPort";
import { registerSCOSAppSession } from "../../../src/SynCloudOS/AppSDK/scos/scosSessionRegistry";
import type { SynWareContextValue } from "../../../src/SynCloudOS/AppSDK/appContextTypes";
const selection = vi.hoisted(() => ({ context: null as unknown }));
vi.mock("../../../src/SynCloudOS/AppSDK/SynWareContext", () => ({ useSynWareContext: () => selection.context }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function request() { const request = new P.PKFXPaymentRequest(); Object.assign(request, { merchantIdentifier: "merchant.test", countryCode: "GB", currencyCode: "GBP", supportedNetworks: ["visa"], merchantCapabilities: 1, paymentSummaryItems: [new P.PKFXPaymentSummaryItem("Merchant", NSEDecimalNumber.one)] }); return request; }
it("returns a real controller for a branding clone, survives StrictMode and releases pending native payment on true unmount", async () => {
  const jobs: (() => void)[] = []; vi.stubGlobal("scheduler", { postTask: (job: () => void) => { jobs.push(job); return Promise.resolve(); } });
  const owner = new AbortController(); let resolve!: (response: PaymentResponse) => void; const dismiss = vi.fn(async () => {});
  const open = vi.fn(() => ({ presented: Promise.resolve(true), authorized: new Promise<PaymentResponse>(done => { resolve = done; }), dismiss }));
  const context = { appId: "com.example.pass-hook", runtimeInfo: { id: "duplicate" }, signal: owner.signal } as SynWareContextValue; selection.context = { ...context };
  associatePaymentPort(context, createMountedPaymentPort({ assertAvailable() {}, canMakePayments: () => true, open }, owner.signal, () => ["payment.request"], () => true));
  const unregister = registerSCOSAppSession({ appId: context.appId, displayName: "Hook", version: "1", context }); const other = registerSCOSAppSession({ appId: context.appId, displayName: "Other", version: "1", context: { ...context, signal: new AbortController().signal } });
  try {
    let held!: P.PKFXPaymentAuthorizationController; let setups = 0; const authorized = vi.fn(); const input = request();
    function Probe() { held = usePayment(input); useLayoutEffect(() => { setups++; }, []); return null; }
    const view = render(<StrictMode><Probe /></StrictMode>); expect(setups).toBe(2); expect(held).toBeInstanceOf(P.PKFXPaymentAuthorizationController); expect(open).not.toHaveBeenCalled(); const original = held; view.rerender(<StrictMode><Probe /></StrictMode>); expect(held).toBe(original);
    held.delegate = { paymentAuthorizationControllerDidAuthorizePayment: authorized, paymentAuthorizationControllerDidFinish() {} }; held.present(); expect(open).toHaveBeenCalledOnce(); view.unmount(); const response = { payment: new P.PKFXPayment(), finish: vi.fn(async () => {}) }; resolve(response);
    for (let i = 0; i < 20; i++) await Promise.resolve(); while (jobs.length) jobs.shift()!(); expect(authorized).not.toHaveBeenCalled(); expect(dismiss).toHaveBeenCalledOnce(); expect(response.finish).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: "failure" })); expect(() => held.present()).toThrow(P.PKFXError);
    const pending = new Promise(() => {}); function Suspended(): React.ReactNode { usePayment(input); throw pending; } render(<StrictMode><Suspense fallback={null}><Suspended /></Suspense></StrictMode>); expect(open).toHaveBeenCalledOnce();
  } finally { owner.abort(); unregister(); other(); }
});
it("rejects ambiguous exact mount aliases instead of picking by duplicate configured runtime IDs", () => {
  const owner = new AbortController(); const context = { appId: "com.example.pass-ambiguous", runtimeInfo: { id: "duplicate" }, signal: owner.signal } as SynWareContextValue; selection.context = { ...context };
  const a = registerSCOSAppSession({ appId: context.appId, displayName: "A", version: "1", context }); const b = registerSCOSAppSession({ appId: context.appId, displayName: "B", version: "1", context: { ...context } });
  function Probe() { usePayment(request()); return null; } try { expect(() => render(<Probe />)).toThrow(/ambiguous/); } finally { owner.abort(); a(); b(); }
});
