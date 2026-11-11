import { expect, it, vi } from "vitest";
import { createSynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";
import { PKFXPaymentAuthorizationController as BaseController, PKFXPaymentToken, PKFXPaymentMethod, PKFXContact } from "@syndromatic/syncloudos/fx/pass";
import { NSEData, NSEPersonNameComponents } from "@syndromatic/syncloudos/foundation";
import Application, { request, afterAwait, afterTimer, thirdParty, PKFXPaymentAuthorizationController, PKFXPayment, PKFXPaymentAuthorizationResult, PKFXError } from "./src/SynWare/First.app/Contents/index";
import info from "./src/SynWare/First.app/Contents/Info";
const ticks = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
it("compiled Pass app retains attribution after await/timer/callback and completes actual installed delegate/handler flow", async () => {
  const jobs: (() => void)[] = []; vi.stubGlobal("scheduler", { postTask: (job: () => void) => { jobs.push(job); return Promise.resolve(); } }); const flush = () => { while (jobs.length) jobs.shift()!(); };
  const host = createSynWareTestHost({ application: Application, manifest: { schemaVersion: 1, ...info }, document });
  try {
    expect(() => new BaseController(request())).toThrow(/application bundle/); expect(() => new PKFXPaymentAuthorizationController(request())).toThrow(PKFXError);
    await host.render(); host.adapters.permissions.allow(); host.adapters.policy.allow(); host.adapters.payment.allow(); expect("payment" in host.appContext).toBe(false);
    expect(PKFXPaymentAuthorizationController.canMakePayments()).toBe(true); expect(PKFXPaymentAuthorizationController.canMakePayments(["amex"])).toBe(false);
    const first = await afterAwait(), second = await afterTimer(); let third!: PKFXPaymentAuthorizationController; await new Promise<void>(done => queueMicrotask(() => thirdParty(create => { third = create(); done(); })));
    const received: PKFXPayment[] = []; const dismissed = vi.fn();
    for (const controller of [first, second, third]) {
      expect(controller).toBeInstanceOf(BaseController); expect(controller).toBeInstanceOf(PKFXPaymentAuthorizationController);
      controller.delegate = { paymentAuthorizationControllerDidAuthorizePayment(sender, payment, handler) { expect(sender).toBe(controller); received.push(payment); handler(new PKFXPaymentAuthorizationResult("success")); }, paymentAuthorizationControllerDidFinish(sender) { sender.dismiss(dismissed); } };
      const presented = vi.fn(); controller.present(presented); await ticks(); flush(); expect(presented).toHaveBeenCalledExactlyOnceWith(true); host.adapters.payment.authorize(); await ticks(); flush(); await ticks(); flush(); await ticks(); flush();
    }
    expect(received).toHaveLength(3); expect(dismissed).toHaveBeenCalledTimes(3); const payment = received[0]!; expect(payment).toBeInstanceOf(PKFXPayment); expect(payment.token).toBeInstanceOf(PKFXPaymentToken); expect(payment.token.paymentMethod).toBeInstanceOf(PKFXPaymentMethod); expect(payment.token.paymentData).toBeInstanceOf(NSEData); expect(payment.token.paymentData.bytes).toEqual(new Uint8Array([1, 2, 3])); expect(payment.billingContact).toBeInstanceOf(PKFXContact); expect(payment.billingContact?.name).toBeInstanceOf(NSEPersonNameComponents); expect(payment.billingContact?.name?.copy().givenName).toBe("Test");
    expect(host.adapters.payment.completedStatuses()).toEqual(["success", "success", "success"]); expect(host.adapters.payment.activePresentationCount()).toBe(0);
    const stale = await afterAwait(); stale.delegate = { paymentAuthorizationControllerDidAuthorizePayment(_sender, value) { received.push(value); }, paymentAuthorizationControllerDidFinish() {} }; stale.present(); host.adapters.payment.authorize(); await ticks(); host.adapters.permissions.deny(); host.adapters.permissions.allow(); flush(); expect(received).toHaveLength(3); expect(host.adapters.payment.completedStatuses().at(-1)).toBe("failure"); expect(host.adapters.payment.activePresentationCount()).toBe(0);
    const ending = await afterAwait(); ending.present(); await ticks(); await host.dispose(); flush(); expect(host.adapters.payment.activePresentationCount()).toBe(0); expect(() => ending.present()).toThrow(PKFXError);
  } finally { await host.dispose(); flush(); vi.unstubAllGlobals(); }
});
it.each(["presentation", "completion"])("native payment %s denial overrides saved entitlement and prevents subsequent authorization", async phase => {
  const jobs: (() => void)[] = []; vi.stubGlobal("scheduler", { postTask: (job: () => void) => { jobs.push(job); return Promise.resolve(); } }); const flush = () => { while (jobs.length) jobs.shift()!(); };
  const host = createSynWareTestHost({ application: Application, manifest: { schemaVersion: 1, ...info }, document });
  try {
    await host.render(); host.adapters.permissions.allow(); host.adapters.policy.allow(); host.adapters.payment.allow(); const first = await afterAwait(); first.present(); host.adapters.payment.authorize(); await ticks(); first.dismiss(); await ticks();
    let handler!: (result: PKFXPaymentAuthorizationResult) => void; const finished = vi.fn(); const second = await afterAwait(); second.delegate = { paymentAuthorizationControllerDidAuthorizePayment(_sender, _payment, callback) { handler = callback; }, paymentAuthorizationControllerDidFinish: finished };
    if (phase === "presentation") { host.adapters.payment.deny(); second.present(); }
    else { second.present(); host.adapters.payment.authorize(); await ticks(); flush(); host.adapters.payment.deny(); handler(new PKFXPaymentAuthorizationResult("success")); flush(); }
    await ticks(); host.adapters.payment.allow(); expect(PKFXPaymentAuthorizationController.canMakePayments()).toBe(false); expect(() => new PKFXPaymentAuthorizationController(request()).present()).toThrow(PKFXError); expect(host.adapters.payment.activePresentationCount()).toBe(0); flush(); expect(finished).not.toHaveBeenCalled();
  } finally { await host.dispose(); flush(); vi.unstubAllGlobals(); }
});
