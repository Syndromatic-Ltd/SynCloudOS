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
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";

/** Mounted merchant access. Support queries never request a payment or permission. */
export function createMountedPaymentClient(
  adapter: PKFXPaymentClient | undefined,
  mountSignal: AbortSignal,
  permissions: () => readonly string[],
  authorise: (capability: string) => boolean,
): PKFXPaymentClient {
  const scope = createMountedResourceScope(mountSignal, { maxResources: 4, budgets: { sessions: 4 } });
  const requireCapability = () => {
    mountSignal.throwIfAborted();
    if (!permissions().includes("payment.request")) throw new DOMException("SynWare capability payment.request must be declared.", "SecurityError");
    if (!authorise("payment.request")) throw new DOMException("PolicyKit denied SynWare capability payment.request.", "SecurityError");
  };
  return Object.freeze<PKFXPaymentClient>({
    getCapabilities: () => !mountSignal.aborted && adapter ? adapter.getCapabilities() : Object.freeze({ paymentRequest: false }),
    createAuthorizationController: (request, signal) => scope.acquire(signal, (lease, release) => {
      let disposed = false;
      const controller = adapter?.createAuthorizationController(request, lease);
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        lease.removeEventListener("abort", dispose);
        try { controller?.dispose(); } finally { release(); }
      };
      lease.addEventListener("abort", dispose, { once: true });
      const requireController = () => {
        lease.throwIfAborted(); requireCapability();
        if (!controller) throw new DOMException("Payment Request is unavailable.", "NotSupportedError");
        return controller;
      };
      return Object.freeze<PKFXPaymentAuthorizationController>({
        getAuthorizationStatus: async () => {
          if (lease.aborted || !controller) return "unavailable";
          if (!permissions().includes("payment.request") || !authorise("payment.request")) return "denied";
          return controller.getAuthorizationStatus();
        },
        canMakePayments: async () => requireController().canMakePayments(),
        present: async () => {
          const payment = await requireController().present();
          try { lease.throwIfAborted(); requireCapability(); } catch (error) { dispose(); throw error; }
          return Object.freeze<PKFXPayment>({ ...payment, complete: async result => {
            try { lease.throwIfAborted(); requireCapability(); } catch (error) { dispose(); throw error; }
            await payment.complete(result);
          } });
        },
        dispose,
      });
    }, controller => controller.dispose(), { sessions: 1 }),
  });
}
