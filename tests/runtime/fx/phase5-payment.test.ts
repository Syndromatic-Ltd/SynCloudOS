/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { describe, expect, it, vi } from "vitest";
import { PKFXPaymentRequest } from "../../../src/FX/PassFX/public";
import { BrowserPaymentAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserPaymentAdapter";
import { createMountedPaymentClient } from "../../../src/SynCloudOS/AppSDK/mountedPaymentClient";

const request = () => new PKFXPaymentRequest({ currencyCode: "GBP", paymentSummaryItems: [{ label: "Item", amount: "4.00" }, { label: "Merchant", amount: "4.00" }], paymentMethodData: [{ supportedMethods: "https://pay.example" }] });
class BrowserRequest {
  static instances: BrowserRequest[] = [];
  response = { requestId: "id", methodName: "https://pay.example", details: { token: "server-verifies" }, payerName: null, payerEmail: null, payerPhone: null, complete: vi.fn(async () => {}) };
  canMakePayment = vi.fn(async () => true);
  show = vi.fn(async () => this.response);
  abort = vi.fn(async () => {});
  constructor(readonly methods: unknown, readonly details: unknown) { BrowserRequest.instances.push(this); }
}

describe("phase 5 payment", () => {
  it("constructs passively and maps Cocoa summary items to the browser sheet", async () => {
    const adapter = new BrowserPaymentAdapter({ isSecureContext: true, PaymentRequest: BrowserRequest });
    const count = BrowserRequest.instances.length;
    expect(adapter.getCapabilities().paymentRequest).toBe(true);
    const controller = adapter.createAuthorizationController(request());
    expect(BrowserRequest.instances.length).toBe(count);
    expect(await controller.getAuthorizationStatus()).toBe("unknown");
    const payment = await controller.present();
    const browser = BrowserRequest.instances.at(-1)!;
    expect(browser.details).toEqual({ total: { label: "Merchant", amount: { currency: "GBP", value: "4.00" } }, displayItems: [{ label: "Item", amount: { currency: "GBP", value: "4.00" } }] });
    expect(payment.details).toEqual({ token: "server-verifies" });
    await payment.complete("success");
    expect(browser.response.complete).toHaveBeenCalledWith("success");
    controller.dispose();
    expect(browser.response.complete).toHaveBeenCalledTimes(1);
  });

  it("does not interpret canMakePayment as user authorisation", async () => {
    const controller = new BrowserPaymentAdapter({ isSecureContext: true, PaymentRequest: BrowserRequest }).createAuthorizationController(request());
    expect(await controller.canMakePayments()).toBe(true);
    expect(await controller.getAuthorizationStatus()).toBe("unknown");
    const browser = BrowserRequest.instances.at(-1)!;
    expect(browser.show).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("rejects unavailable and undeclared operations without constructing browser requests", async () => {
    const count = BrowserRequest.instances.length;
    const absent = new BrowserPaymentAdapter({ isSecureContext: false, PaymentRequest: BrowserRequest });
    expect(absent.getCapabilities().paymentRequest).toBe(false);
    await expect(absent.createAuthorizationController(request()).present()).rejects.toMatchObject({ name: "SecurityError" });
    let permissions: string[] = [];
    let allowed = true;
    const client = createMountedPaymentClient(new BrowserPaymentAdapter({ isSecureContext: true, PaymentRequest: BrowserRequest }), new AbortController().signal, () => permissions, () => allowed);
    const controller = client.createAuthorizationController(request());
    await expect(controller.present()).rejects.toMatchObject({ name: "SecurityError" });
    permissions = ["payment.request"]; allowed = false;
    await expect(controller.canMakePayments()).rejects.toMatchObject({ name: "SecurityError" });
    expect(BrowserRequest.instances.length).toBe(count);
    controller.dispose();
  });

  it("abort rejects a pending sheet and completes a late response as failed", async () => {
    let resolve!: (response: BrowserRequest["response"]) => void;
    class PendingRequest extends BrowserRequest { override show = vi.fn(() => new Promise<BrowserRequest["response"]>(r => { resolve = r; })); }
    const mount = new AbortController();
    const client = createMountedPaymentClient(new BrowserPaymentAdapter({ isSecureContext: true, PaymentRequest: PendingRequest }), mount.signal, () => ["payment.request"], () => true);
    const controller = client.createAuthorizationController(request());
    const pending = controller.present();
    const browser = BrowserRequest.instances.at(-1)!;
    mount.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(browser.abort).toHaveBeenCalledTimes(1);
    resolve(browser.response);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(browser.response.complete).toHaveBeenCalledWith("fail");
  });

  it("unmount completes an outstanding response and validates exact decimal amounts", async () => {
    const mount = new AbortController();
    const controller = new BrowserPaymentAdapter({ isSecureContext: true, PaymentRequest: BrowserRequest }).createAuthorizationController(request(), mount.signal);
    const payment = await controller.present();
    mount.abort();
    expect(BrowserRequest.instances.at(-1)!.response.complete).toHaveBeenCalledWith("fail");
    await expect(payment.complete("success")).rejects.toMatchObject({ name: "AbortError" });
    expect(() => new PKFXPaymentRequest({ currencyCode: "GBP", paymentSummaryItems: [{ label: "M", amount: "1e3" }], paymentMethodData: [{ supportedMethods: "https://pay.example" }] })).toThrow();
  });

  it("preserves the caller's abort reason for pending browser operations", async () => {
    class PendingRequest extends BrowserRequest { override canMakePayment = vi.fn(() => new Promise<boolean>(() => {})); }
    const owner = new AbortController();
    const controller = new BrowserPaymentAdapter({ isSecureContext: true, PaymentRequest: PendingRequest }).createAuthorizationController(request(), owner.signal);
    const reason = new Error("Merchant navigated away");
    const pending = controller.canMakePayments();
    owner.abort(reason);
    await expect(pending).rejects.toBe(reason);
  });

  it("copies method and response JSON and completes only once", async () => {
    const data = { merchant: { id: "original" } };
    const value = new PKFXPaymentRequest({ currencyCode: "GBP", paymentSummaryItems: [{ label: "M", amount: "0.01" }], paymentMethodData: [{ supportedMethods: "https://pay.example", data }] });
    data.merchant.id = "mutated";
    const controller = new BrowserPaymentAdapter({ isSecureContext: true, PaymentRequest: BrowserRequest }).createAuthorizationController(value);
    const pending = controller.present();
    const browser = BrowserRequest.instances.at(-1)!;
    const payment = await pending;
    browser.response.details.token = "mutated";
    expect(payment.details).toEqual({ token: "server-verifies" });
    expect(browser.methods).toEqual([{ supportedMethods: "https://pay.example", data: { merchant: { id: "original" } } }]);
    await payment.complete("unknown");
    await expect(payment.complete("success")).rejects.toMatchObject({ name: "InvalidStateError" });
    await expect(controller.present()).rejects.toMatchObject({ name: "InvalidStateError" });
    controller.dispose();
  });

  it("rechecks policy before completing a response and releases the browser sheet on denial", async () => {
    let allowed = true;
    const client = createMountedPaymentClient(new BrowserPaymentAdapter({ isSecureContext: true, PaymentRequest: BrowserRequest }), new AbortController().signal, () => ["payment.request"], () => allowed);
    const controller = client.createAuthorizationController(request());
    const payment = await controller.present();
    allowed = false;
    await expect(payment.complete("success")).rejects.toMatchObject({ name: "SecurityError" });
    expect(BrowserRequest.instances.at(-1)!.response.complete).toHaveBeenCalledWith("fail");
  });
});
