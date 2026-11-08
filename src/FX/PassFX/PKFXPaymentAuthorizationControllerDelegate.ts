/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { PKFXPaymentAuthorizationController } from "./PKFXPaymentAuthorizationController";
import type { PKFXPayment } from "./PKFXPayment";
import type { PKFXPaymentAuthorizationResult } from "./PKFXPaymentAuthorizationResult";
export interface PKFXPaymentAuthorizationControllerDelegate {
  paymentAuthorizationControllerDidAuthorizePayment(controller: PKFXPaymentAuthorizationController, payment: PKFXPayment, handler: (result: PKFXPaymentAuthorizationResult) => void): void;
  paymentAuthorizationControllerDidFinish(controller: PKFXPaymentAuthorizationController): void;
}
