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

import {
  PKFXPaymentRequest,
  type PKFXPayment, type PKFXPaymentAuthorizationController, type PKFXPaymentClient,
  type PKFXPaymentCompletion,
} from "../../FX/PassFX/public";
import { bridgePaymentData, snapshotPaymentDetails } from "../../FX/PassFX/internal/paymentData";

interface BrowserPaymentResponse {
  readonly requestId: string;
  readonly methodName: string;
  readonly details: unknown;
  readonly payerName: string | null;
  readonly payerEmail: string | null;
  readonly payerPhone: string | null;
  complete(result: PKFXPaymentCompletion): Promise<void>;
}

interface BrowserPaymentRequest {
  canMakePayment(): Promise<boolean>;
  show(): Promise<BrowserPaymentResponse>;
  abort(): Promise<void>;
}

export interface BrowserPaymentAdapterOptions {
  readonly isSecureContext: boolean;
  readonly PaymentRequest?: new(methods: PaymentMethodData[], details: PaymentDetailsInit, options?: PaymentOptions) => BrowserPaymentRequest;
}

/** Payment Request transport. The browser and registered merchant method own the sheet. */
export class BrowserPaymentAdapter implements PKFXPaymentClient {
  constructor(private readonly options: BrowserPaymentAdapterOptions) {}

  getCapabilities() { return Object.freeze({ paymentRequest: this.options.isSecureContext && !!this.options.PaymentRequest }); }

  createAuthorizationController(request: PKFXPaymentRequest, signal?: AbortSignal): PKFXPaymentAuthorizationController {
    signal?.throwIfAborted();
    const owner = new AbortController();
    const lease = owner.signal;
    let browser: BrowserPaymentRequest | undefined;
    let presenting = false;
    let presented = false;
    let response: BrowserPaymentResponse | undefined;
    let completed = false;
    const completeAbandoned = () => {
      if (!response || completed) return;
      completed = true;
      try { void response.complete("fail").catch(() => {}); } catch { /* Browser may already have closed its sheet. */ }
    };
    const dispose = () => {
      signal?.removeEventListener("abort", onAbort);
      if (lease.aborted) return;
      owner.abort(signal?.aborted ? signal.reason : new DOMException("Payment controller was disposed.", "AbortError"));
      if (presenting) { try { void browser?.abort().catch(() => {}); } catch { /* Request may have already settled. */ } }
      completeAbandoned();
    };
    const onAbort = () => dispose();
    signal?.addEventListener("abort", onAbort, { once: true });
    const requireRequest = () => {
      lease.throwIfAborted();
      if (!this.options.isSecureContext) throw new DOMException("Payments require a secure context.", "SecurityError");
      const Request = this.options.PaymentRequest;
      if (!Request) throw new DOMException("Payment Request is unavailable.", "NotSupportedError");
      if (!browser) {
        const items = request.paymentSummaryItems.map(item => ({ label: item.label, amount: { currency: request.currencyCode, value: item.amount }, ...(item.pending === undefined ? {} : { pending: item.pending }) }));
        browser = new Request(request.paymentMethodData.map(method => ({ supportedMethods: method.supportedMethods, ...(method.data === undefined ? {} : { data: bridgePaymentData(method.data) }) })),
          { total: items.at(-1)!, displayItems: items.slice(0, -1) },
          { requestPayerName: request.requestPayerName, requestPayerEmail: request.requestPayerEmail, requestPayerPhone: request.requestPayerPhone });
      }
      return browser;
    };
    const perform = <T>(operation: () => Promise<T>, late?: (value: T) => void): Promise<T> => new Promise((resolve, reject) => {
      const abort = () => reject(lease.reason);
      lease.addEventListener("abort", abort, { once: true });
      if (lease.aborted) { lease.removeEventListener("abort", abort); reject(lease.reason); return; }
      try {
        operation().then(value => {
          if (lease.aborted) late?.(value); else resolve(value);
        }, reject).finally(() => lease.removeEventListener("abort", abort));
      } catch (error) { lease.removeEventListener("abort", abort); reject(error); }
    });
    return Object.freeze({
      getAuthorizationStatus: async () => lease.aborted || !this.getCapabilities().paymentRequest ? "unavailable" as const : "unknown" as const,
      canMakePayments: async () => perform(() => requireRequest().canMakePayment()),
      present: async (): Promise<PKFXPayment> => {
        const device = requireRequest();
        if (presented) throw new DOMException("A payment controller can present only once.", "InvalidStateError");
        presented = true; presenting = true;
        try {
          response = await perform(() => device.show(), late => { response = late; completeAbandoned(); });
          lease.throwIfAborted();
          const details = snapshotPaymentDetails(response.details);
          return Object.freeze({
            requestId: response.requestId, methodName: response.methodName, details,
            payerName: response.payerName, payerEmail: response.payerEmail, payerPhone: response.payerPhone,
            complete: async (result: PKFXPaymentCompletion) => {
              lease.throwIfAborted();
              if (completed) throw new DOMException("The payment response was already completed.", "InvalidStateError");
              if (!["success", "fail", "unknown"].includes(result)) throw new TypeError("Invalid payment completion result.");
              completed = true;
              await response!.complete(result);
            },
          });
        } catch (error) { completeAbandoned(); throw error; }
        finally { presenting = false; }
      },
      dispose,
    });
  }
}
