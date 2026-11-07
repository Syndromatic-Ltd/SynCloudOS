/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { PKFXPaymentClient, PKFXPaymentAuthorizationController, PKFXPayment } from "../../FX/PassFX/public";
import type { PrivacyApplicationPort } from "../HostServices/AppSDKHostServiceTypes";
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";

/** Mounted merchant access. Support queries never request a payment or grant app consent. */
export function createMountedPaymentClient(
  adapter: PKFXPaymentClient | undefined,
  mountSignal: AbortSignal,
  entitlements: () => readonly string[],
  authorise: (capability: string) => boolean,
  privacy?: PrivacyApplicationPort,
): PKFXPaymentClient {
  const scope = createMountedResourceScope(mountSignal, { maxResources: 4, budgets: { sessions: 4 } });
  const requireCapability = () => {
    mountSignal.throwIfAborted();
    if (!entitlements().includes("payment.request")) throw new DOMException("SynWare entitlement payment.request must be declared.", "SecurityError");
    if (!authorise("payment.request")) throw new DOMException("Privacy authorisation denied payment.request.", "SecurityError");
  };
  return Object.freeze<PKFXPaymentClient>({
    getCapabilities: () => !mountSignal.aborted && adapter ? adapter.getCapabilities() : Object.freeze({ paymentRequest: false }),
    createAuthorizationController: (request, signal) => scope.acquire(signal, (lease, release) => {
      let disposed = false;
      let unbindPrivacy: (() => void) | undefined;
      const controller = adapter?.createAuthorizationController(request, lease);
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        unbindPrivacy?.(); unbindPrivacy = undefined;
        lease.removeEventListener("abort", dispose);
        try { controller?.dispose(); } finally { release(); }
      };
      const bindPrivacy = () => { if (privacy && !unbindPrivacy) unbindPrivacy = privacy.bindResource(dispose); };
      lease.addEventListener("abort", dispose, { once: true });
      const requireController = (active = false) => {
        lease.throwIfAborted(); requireCapability();
        if (active) privacy?.assertRequestAllowed();
        if (!controller) throw new DOMException("Payment Request is unavailable.", "NotSupportedError");
        return controller;
      };
      const abandon = (payment: PKFXPayment) => {
        try { void payment.complete("fail").catch(() => {}); } catch { /* The browser may already have closed the payment sheet. */ }
      };
      return Object.freeze<PKFXPaymentAuthorizationController>({
        getAuthorizationStatus: async () => {
          if (lease.aborted || !controller) return "unavailable";
          if (!entitlements().includes("payment.request") || !authorise("payment.request")) return "denied";
          const query = async () => { const status = await controller.getAuthorizationStatus(); lease.throwIfAborted(); return status; };
          try { return privacy ? await privacy.getAuthorizationStatus(query) : await query(); }
          catch (error) { if (lease.aborted) return "unavailable"; throw error; }
        },
        canMakePayments: async () => requireController().canMakePayments(),
        present: async () => {
          requireController(true);
          const operation = async () => {
            bindPrivacy();
            const payment = await requireController(true).present();
            try { requireController(true); } catch (error) { abandon(payment); dispose(); throw error; }
            return payment;
          };
          const payment = privacy ? await privacy.request(operation, { signal: lease, dispose: abandon }) : await operation();
          return Object.freeze<PKFXPayment>({ ...payment, complete: async result => {
            try { requireController(true); } catch (error) { dispose(); throw error; }
            await payment.complete(result);
          } });
        },
        dispose,
      });
    }, controller => controller.dispose(), { sessions: 1 }),
  });
}