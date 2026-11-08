import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as P from "../../../src/FX/PassFX/public";
import { NSEData, NSEDecimalNumber } from "../../../src/Foundation/public";
import { bindFXFamily } from "../../../src/SynCloudOS/AppSDK/fx/bindFXFamily";
import { registerSCOSAppSession } from "../../../src/SynCloudOS/AppSDK/scos/scosSessionRegistry";
import type { SynWareContextValue } from "../../../src/SynCloudOS/AppSDK/appContextTypes";
import { associatePaymentPort, type PaymentAdapter, type PaymentResponse } from "../../../src/FX/PassFX/internal/paymentPort";
import { createMountedPaymentPort } from "../../../src/SynCloudOS/AppSDK/mountedPaymentPort";
import { paymentTokens } from "../../../src/FX/PassFX/internal/paymentValues";
import { createPrivacyStore } from "../../../src/SynCloudOS/Privacy";
import { BrowserPaymentAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserPaymentAdapter";

const App = bindFXFamily(P, "com.example.pass"); const cleanups: (() => void)[] = []; const jobs: (() => void)[] = [];
const ticks = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const flush = () => { while (jobs.length) jobs.shift()!(); };
export function request() { const value = new P.PKFXPaymentRequest(); Object.assign(value, { merchantIdentifier: "merchant.test", countryCode: "GB", currencyCode: "GBP", supportedNetworks: [P.PKFXPaymentNetwork.visa], merchantCapabilities: P.PKFXMerchantCapability.threeDSecure, paymentSummaryItems: [new P.PKFXPaymentSummaryItem("Merchant", NSEDecimalNumber.fromString("9007199254740993.1234567890123456789"))] }); return value; }
function fixture(adapterOverride?: PaymentAdapter) {
  const owner = new AbortController(); let allowed = true; let entitlements = ["payment.request"]; const observers = new Set<() => void>();
  const privacy = createPrivacyStore({ runtimeId: "pass" }); const scope = { userId: "u", appId: "com.example.pass", service: "payment" };
  const active: { resolve(value: PaymentResponse): void; reject(error: unknown): void; dismiss: ReturnType<typeof vi.fn> }[] = [];
  const open = vi.fn((value: P.PKFXPaymentRequest) => { let resolve!: (value: PaymentResponse) => void; let reject!: (error: unknown) => void; const authorized = new Promise<PaymentResponse>((a, b) => { resolve = a; reject = b; }); const dismiss = vi.fn(async () => {}); active.push({ resolve, reject, dismiss }); return { presented: Promise.resolve(true), authorized, dismiss }; });
  const adapter: PaymentAdapter = adapterOverride ?? { assertAvailable() {}, canMakePayments: networks => networks === undefined || networks.every(network => network === "visa"), open };
  const port = createMountedPaymentPort(adapter, owner.signal, () => entitlements, () => allowed, privacy.forApplication({ ...scope, signal: owner.signal }), listener => { observers.add(listener); return () => { observers.delete(listener); }; });
  const context = { appId: scope.appId, runtimeInfo: { id: "pass" }, signal: owner.signal } as SynWareContextValue; associatePaymentPort(context, port);
  const unregister = registerSCOSAppSession({ appId: scope.appId, displayName: "Pass", version: "1", context }); cleanups.push(() => { owner.abort(); unregister(); privacy.dispose(); });
  const response = () => { const payment = new P.PKFXPayment(); paymentTokens.set(payment.token, { paymentMethod: payment.token.paymentMethod, transactionIdentifier: "tx", paymentData: NSEData.from(new Uint8Array([1, 2])) }); return { payment, finish: vi.fn(async (_result: P.PKFXPaymentAuthorizationResult) => {}) }; };
  return { owner, open, active, privacy, scope, port, context, unregister, response, access(value: boolean) { allowed = value; for (const listener of observers) listener(); }, entitlements(value: string[]) { entitlements = value; for (const listener of observers) listener(); } };
}
beforeEach(() => vi.stubGlobal("scheduler", { postTask: (job: () => void) => { jobs.push(job); return Promise.resolve(); } }));
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); flush(); vi.unstubAllGlobals(); });

it("keeps binding lazy, opens natively in the gesture, and delivers exact payment through handler then finish/dismiss", async () => {
  expect(() => new P.PKFXPaymentAuthorizationController(request())).toThrow(/application bundle/);
  expect(() => new App.PKFXPaymentAuthorizationController(request())).toThrow(P.PKFXError);
  const f = fixture(); expect(App.PKFXPaymentAuthorizationController.canMakePayments()).toBe(true); expect(App.PKFXPaymentAuthorizationController.canMakePayments(["visa"])).toBe(true); expect(App.PKFXPaymentAuthorizationController.canMakePayments(["amex"])).toBe(false); expect(f.privacy.getSnapshot()).toEqual([]);
  const input = request(); const controller = new App.PKFXPaymentAuthorizationController(input); const presented = vi.fn(); const dismissed = vi.fn(); const authorize = vi.fn((_sender, _payment, handler) => handler(new P.PKFXPaymentAuthorizationResult("success"))); const finish = vi.fn(sender => sender.dismiss(dismissed));
  controller.delegate = { paymentAuthorizationControllerDidAuthorizePayment: authorize, paymentAuthorizationControllerDidFinish: finish };
  controller.present(presented); expect(f.open).toHaveBeenCalledOnce(); expect(presented).not.toHaveBeenCalled(); expect(f.open.mock.calls[0]![0].paymentSummaryItems[0]!.amount.toString()).toBe("9007199254740993.1234567890123456789");
  input.paymentSummaryItems[0]!.label = "changed"; expect(f.open.mock.calls[0]![0].paymentSummaryItems[0]!.label).toBe("Merchant");
  await ticks(); flush(); expect(presented).toHaveBeenCalledExactlyOnceWith(true); const response = f.response(); f.active[0]!.resolve(response); await ticks(); expect(authorize).not.toHaveBeenCalled(); flush(); await ticks(); flush(); await ticks(); flush();
  expect(authorize).toHaveBeenCalledWith(controller, response.payment, expect.any(Function)); expect(response.finish).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: "success" })); expect(finish).toHaveBeenCalledExactlyOnceWith(controller); expect(dismissed).toHaveBeenCalledOnce(); expect(f.active[0]!.dismiss).toHaveBeenCalledOnce(); expect(() => controller.present()).toThrow(P.PKFXError);
});

it.each(["revoke", "policy", "entitlement", "unregister", "teardown", "dismiss"])("releases stale native responses after %s without touching replacement sheets", async reason => {
  const f = fixture(); const old = new App.PKFXPaymentAuthorizationController(request()); const authorize = vi.fn(); old.delegate = { paymentAuthorizationControllerDidAuthorizePayment: authorize, paymentAuthorizationControllerDidFinish() {} }; old.present(); await ticks();
  if (reason === "revoke") { f.privacy.revoke(f.scope); f.privacy.setAuthorization(f.scope, "granted"); } else if (reason === "policy") { f.access(false); f.access(true); } else if (reason === "entitlement") { f.entitlements([]); f.entitlements(["payment.request"]); } else if (reason === "unregister") f.unregister(); else if (reason === "teardown") f.owner.abort(); else old.dismiss();
  let replacement: P.PKFXPaymentAuthorizationController | undefined;
  if (!["unregister", "teardown"].includes(reason)) { replacement = new App.PKFXPaymentAuthorizationController(request()); replacement.present(); }
  const stale = f.response(); f.active[0]!.resolve(stale); await ticks(); flush(); expect(authorize).not.toHaveBeenCalled(); expect(stale.finish).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: "failure" })); expect(f.active[0]!.dismiss).toHaveBeenCalledOnce(); if (replacement) expect(f.active[1]!.dismiss).not.toHaveBeenCalled(); expect(() => old.present()).toThrow(P.PKFXError);
});

it("rejects repeated authorization handlers and suppresses handlers retained across revoke/regrant", async () => {
  const f = fixture(); let handler!: (result: P.PKFXPaymentAuthorizationResult) => void; const controller = new App.PKFXPaymentAuthorizationController(request()); controller.delegate = { paymentAuthorizationControllerDidAuthorizePayment(_sender, _payment, callback) { handler = callback; }, paymentAuthorizationControllerDidFinish() {} }; controller.present(); const response = f.response(); f.active[0]!.resolve(response); await ticks(); flush(); f.privacy.revoke(f.scope); f.privacy.setAuthorization(f.scope, "granted"); expect(() => handler(new P.PKFXPaymentAuthorizationResult("success"))).toThrow(P.PKFXError); expect(response.finish).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: "failure" }));
});

it.each(["denied", "unsupported", "insecure"])("exposes Apple errors for %s and never invents consent or browser availability", async kind => {
  const f = fixture(kind === "denied" ? undefined : new BrowserPaymentAdapter({ isSecureContext: kind !== "insecure" }));
  if (kind === "denied") f.privacy.revoke(f.scope);
  expect(App.PKFXPaymentAuthorizationController.canMakePayments()).toBe(false);
  expect(() => new App.PKFXPaymentAuthorizationController(request()).present()).toThrow(P.PKFXError); expect(f.open).not.toHaveBeenCalled();
});

it("records raw native NotAllowedError over saved consent before Apple conversion", async () => {
  const f = fixture(); f.privacy.setAuthorization(f.scope, "granted"); const controller = new App.PKFXPaymentAuthorizationController(request()); const finish = vi.fn(); controller.delegate = { paymentAuthorizationControllerDidAuthorizePayment() {}, paymentAuthorizationControllerDidFinish: finish }; controller.present(); f.active[0]!.reject(new DOMException("denied", "NotAllowedError")); await ticks(); flush(); expect(f.privacy.getSnapshot()[0]).toMatchObject({ decision: "denied", authorizationStatus: "denied" }); expect(f.active[0]!.dismiss).toHaveBeenCalledOnce(); expect(finish).not.toHaveBeenCalled();
});

it("guards queued present and idle-dismiss completions even before a native operation", async () => {
  const f = fixture(); const first = new App.PKFXPaymentAuthorizationController(request()); const present = vi.fn(); first.present(present); await ticks(); const idle = new App.PKFXPaymentAuthorizationController(request()); const dismiss = vi.fn(); idle.dismiss(dismiss); f.privacy.revoke(f.scope); f.privacy.setAuthorization(f.scope, "granted"); flush(); expect(present).not.toHaveBeenCalled(); expect(dismiss).not.toHaveBeenCalled();
});

it("runs a merchant's later handler as main-queue work and makes its lease irrevocable before delivery", async () => {
  const f = fixture(); let handler!: (result: P.PKFXPaymentAuthorizationResult) => void; const controller = new App.PKFXPaymentAuthorizationController(request());
  controller.delegate = { paymentAuthorizationControllerDidAuthorizePayment(_sender, _payment, callback) { handler = callback; }, paymentAuthorizationControllerDidFinish() {} };
  controller.present(); const response = f.response(); f.active[0]!.resolve(response); await ticks(); flush();
  await Promise.resolve(); handler(new P.PKFXPaymentAuthorizationResult("success")); expect(response.finish).not.toHaveBeenCalled();
  expect(() => handler(new P.PKFXPaymentAuthorizationResult("success"))).toThrow(P.PKFXError);
  f.privacy.revoke(f.scope); f.privacy.setAuthorization(f.scope, "granted"); flush();
  expect(response.finish).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: "failure" }));
});

it("releases its only session observer and access observer on dismissal, before application teardown", async () => {
  const f = fixture(); const adds = vi.spyOn(f.owner.signal, "addEventListener"); const removes = vi.spyOn(f.owner.signal, "removeEventListener");
  const observe = vi.fn(f.port.observeAccessLoss); const releases: ReturnType<typeof vi.fn>[] = [];
  associatePaymentPort(f.context, { ...f.port, observeAccessLoss(listener) { const release = vi.fn(observe(listener)); releases.push(release); return release; } });
  const controller = new App.PKFXPaymentAuthorizationController(request()); controller.present();
  const callbacks = adds.mock.calls.filter(call => call[0] === "abort" && typeof call[1] === "function" && call[1].name === "notify").map(call => call[1]);
  await ticks(); flush(); controller.dismiss(); await ticks(); flush();
  expect(callbacks).toHaveLength(1); expect(removes.mock.calls.filter(call => call[1] === callbacks[0])).toHaveLength(1); expect(releases).toHaveLength(1); expect(releases[0]).toHaveBeenCalledOnce();
  f.unregister(); f.owner.abort(); expect(releases[0]).toHaveBeenCalledOnce(); expect(f.active[0]!.dismiss).toHaveBeenCalledOnce();
});

it("cancels through DidFinish and terminal dismissal without authorizing a payment", async () => {
  const f = fixture(); const controller = new App.PKFXPaymentAuthorizationController(request()); const authorize = vi.fn(); const finished = vi.fn(sender => sender.dismiss());
  controller.delegate = { paymentAuthorizationControllerDidAuthorizePayment: authorize, paymentAuthorizationControllerDidFinish: finished }; controller.present(); f.active[0]!.reject(new DOMException("Cancelled", "AbortError")); await ticks(); flush(); await ticks(); flush();
  expect(authorize).not.toHaveBeenCalled(); expect(finished).toHaveBeenCalledExactlyOnceWith(controller); expect(f.active[0]!.dismiss).toHaveBeenCalledOnce(); expect(f.privacy.getSnapshot().some(value => value.decision === "granted")).toBe(false);
});

it("rejects invalid decimal requests as PKPassKitError and keeps old objects terminal after replacement sessions", () => {
  const f = fixture(); const invalid = request(); invalid.paymentSummaryItems = [new P.PKFXPaymentSummaryItem("Merchant", NSEDecimalNumber.notANumber)];
  expect(() => new App.PKFXPaymentAuthorizationController(invalid)).toThrow(expect.objectContaining({ code: "invalidDataError" })); invalid.paymentSummaryItems = [new P.PKFXPaymentSummaryItem("Merchant", NSEDecimalNumber.fromString("-0.01"))]; expect(() => new App.PKFXPaymentAuthorizationController(invalid)).toThrow(P.PKFXError);
  const old = new App.PKFXPaymentAuthorizationController(request()); f.unregister(); fixture(); expect(() => old.present()).toThrow(P.PKFXError);
});

it("captures the authorization result at handler call rather than reading later mutations", async () => {
  const f = fixture(); let handler!: (result: P.PKFXPaymentAuthorizationResult) => void; const controller = new App.PKFXPaymentAuthorizationController(request());
  controller.delegate = { paymentAuthorizationControllerDidAuthorizePayment(_sender, _payment, callback) { handler = callback; }, paymentAuthorizationControllerDidFinish(sender) { sender.dismiss(); } }; controller.present(); const response = f.response(); f.active[0]!.resolve(response); await ticks(); flush();
  const errors: Error[] = []; const result = new P.PKFXPaymentAuthorizationResult("success", errors); handler(result); result.status = "failure"; errors.push(new Error("Later")); flush();
  expect(response.finish).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: "success", errors: [] }));
});

it.each(["NotAllowedError", "SecurityError"])("records native completion %s over a saved grant and invalidates queued work", async name => {
  const f = fixture(); f.privacy.setAuthorization(f.scope, "granted"); const generation = f.port.generation;
  let handler!: (result: P.PKFXPaymentAuthorizationResult) => void; let reject!: (error: unknown) => void;
  const response = f.response(); response.finish.mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
  const controller = new App.PKFXPaymentAuthorizationController(request()); const finished = vi.fn();
  controller.delegate = { paymentAuthorizationControllerDidAuthorizePayment(_sender, _payment, callback) { handler = callback; }, paymentAuthorizationControllerDidFinish: finished };
  controller.present(); f.active[0]!.resolve(response); await ticks(); flush(); handler(new P.PKFXPaymentAuthorizationResult("success")); flush();
  const idle = new App.PKFXPaymentAuthorizationController(request()); const dismissed = vi.fn(); idle.dismiss(dismissed); await ticks();
  reject(new DOMException("Native completion denied", name)); await ticks();
  expect(f.privacy.getSnapshot()[0]).toMatchObject({ decision: "granted", browserStatus: "denied", authorizationStatus: "denied" });
  expect(f.port.generation).toBeGreaterThan(generation); expect(App.PKFXPaymentAuthorizationController.canMakePayments()).toBe(false);
  expect(() => new App.PKFXPaymentAuthorizationController(request()).present()).toThrow(P.PKFXError); expect(f.open).toHaveBeenCalledOnce();
  f.privacy.setAuthorization(f.scope, "granted"); expect(App.PKFXPaymentAuthorizationController.canMakePayments()).toBe(false);
  flush(); expect(dismissed).not.toHaveBeenCalled(); expect(finished).not.toHaveBeenCalled(); expect(response.finish).toHaveBeenCalledOnce(); expect(f.active[0]!.dismiss).toHaveBeenCalledOnce();
});

it.each(["NotAllowedError", "SecurityError"])("normalizes synchronous native completion %s only after recording denial", async name => {
  const f = fixture(); f.privacy.setAuthorization(f.scope, "granted"); const generation = f.port.generation;
  const presentation = f.port.open(request(), new AbortController().signal); const response = f.response();
  response.finish.mockImplementationOnce(() => { throw new DOMException("Synchronous native denial", name); });
  f.active[0]!.resolve(response); await presentation.presented; const authorized = await presentation.authorized;
  await expect(Promise.resolve().then(() => authorized.finish(new P.PKFXPaymentAuthorizationResult("success")))).rejects.toMatchObject({ name: "PKFXError", code: "unknownError" });
  expect(f.privacy.getSnapshot()[0]).toMatchObject({ browserStatus: "denied", authorizationStatus: "denied" }); expect(f.port.generation).toBeGreaterThan(generation);
  expect(App.PKFXPaymentAuthorizationController.canMakePayments()).toBe(false); expect(f.active[0]!.dismiss).toHaveBeenCalledOnce();
});

it.each([
  ["dismiss", "NotAllowedError"], ["dismiss", "SecurityError"],
  ["revoke", "NotAllowedError"], ["revoke", "SecurityError"],
])("isolates a delayed native %s completion / %s from its replacement payment", async (end, name) => {
  const f = fixture(); f.privacy.setAuthorization(f.scope, "granted"); let reject!: (error: unknown) => void; let handler!: (result: P.PKFXPaymentAuthorizationResult) => void;
  const oldResponse = f.response(); oldResponse.finish.mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
  const old = new App.PKFXPaymentAuthorizationController(request()); const oldFinished = vi.fn(); old.delegate = { paymentAuthorizationControllerDidAuthorizePayment(_sender, _payment, callback) { handler = callback; }, paymentAuthorizationControllerDidFinish: oldFinished };
  old.present(); f.active[0]!.resolve(oldResponse); await ticks(); flush(); handler(new P.PKFXPaymentAuthorizationResult("success")); flush();
  if (end === "dismiss") old.dismiss(); else { f.privacy.revoke(f.scope); f.privacy.setAuthorization(f.scope, "granted"); }
  await ticks(); flush(); const generation = f.port.generation;
  const fresh = new App.PKFXPaymentAuthorizationController(request()); const freshFinished = vi.fn(sender => sender.dismiss()); const authorized = vi.fn((_sender, _payment, callback) => callback(new P.PKFXPaymentAuthorizationResult("success")));
  fresh.delegate = { paymentAuthorizationControllerDidAuthorizePayment: authorized, paymentAuthorizationControllerDidFinish: freshFinished }; fresh.present(); await ticks(); flush();
  reject(new DOMException("Stale completion denial", name)); await ticks(); flush();
  expect(f.privacy.getSnapshot()[0]).toMatchObject({ decision: "granted", authorizationStatus: "granted" }); expect(f.port.generation).toBe(generation); expect(App.PKFXPaymentAuthorizationController.canMakePayments()).toBe(true);
  expect(oldFinished).not.toHaveBeenCalled(); expect(oldResponse.finish).toHaveBeenCalledOnce(); expect(f.active[0]!.dismiss).toHaveBeenCalledOnce(); expect(f.active[1]!.dismiss).not.toHaveBeenCalled();
  const freshResponse = f.response(); f.active[1]!.resolve(freshResponse); await ticks(); flush(); await ticks(); flush(); await ticks(); flush();
  expect(authorized).toHaveBeenCalledWith(fresh, freshResponse.payment, expect.any(Function)); expect(freshResponse.finish).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: "success" })); expect(freshFinished).toHaveBeenCalledExactlyOnceWith(fresh); expect(f.active[1]!.dismiss).toHaveBeenCalledOnce();
});
