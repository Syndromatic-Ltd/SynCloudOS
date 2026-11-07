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

// @vitest-environment jsdom
import { StrictMode } from "react";
import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PKFXPaymentRequest } from "../../../src/FX/PassFX/public";
import { BrowserPaymentAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserPaymentAdapter";
import { createMountedPaymentClient } from "../../../src/SynCloudOS/AppSDK/mountedPaymentClient";
import { usePayment } from "../../../src/SynCloudOS/AppSDK/hooks/usePayment";

const facade = vi.hoisted(() => ({ current: {} as { payment?: ReturnType<typeof createMountedPaymentClient> } }));
vi.mock("../../../src/SynCloudOS/AppSDK/scos/useSCOS", () => ({ useSCOS: () => facade.current }));

it("usePayment stays passive under StrictMode and aborts a pending user sheet at unmount", async () => {
  let constructions = 0;
  const abort = vi.fn(async () => {});
  class Request {
    constructor() { constructions++; }
    async canMakePayment() { return true; }
    show() { return new Promise<never>(() => {}); }
    abort = abort;
  }
  facade.current = { payment: createMountedPaymentClient(new BrowserPaymentAdapter({ isSecureContext: true, PaymentRequest: Request }), new AbortController().signal, () => ["payment.request"], () => true) };
  const hook = renderHook(() => usePayment(), { wrapper: StrictMode });
  const original = hook.result.current;
  expect(constructions).toBe(0);
  hook.rerender();
  expect(hook.result.current).toBe(original);
  const request = new PKFXPaymentRequest({ currencyCode: "GBP", paymentSummaryItems: [{ label: "Merchant", amount: "1.00" }], paymentMethodData: [{ supportedMethods: "https://pay.example" }] });
  const controller = original.createAuthorizationController(request);
  expect(constructions).toBe(0);
  const pending = controller.present();
  expect(constructions).toBe(1);
  hook.unmount();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(abort).toHaveBeenCalledTimes(1);
  expect(() => original.createAuthorizationController(request)).toThrow("not mounted");
});
