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

import type { PaymentAdapter, PaymentPresentation } from "../../FX/PassFX/internal/paymentPort";
import type { PKFXPaymentRequest } from "../../FX/PassFX/PKFXPaymentRequest";
import type { PKFXPaymentNetwork } from "../../FX/PassFX/PKFXPaymentNetwork";
export interface BrowserPaymentAdapterOptions { readonly isSecureContext: boolean; }
/** A generic PaymentRequest cannot supply Apple Pay merchant validation from PKPaymentRequest.
 * No gateway, account configuration, card support or authorization is fabricated. */
export class BrowserPaymentAdapter implements PaymentAdapter {
  constructor(private readonly options: BrowserPaymentAdapterOptions) {}
  canMakePayments(_networks?: readonly PKFXPaymentNetwork[]): boolean { return false; }
  assertAvailable(): void {
    if (!this.options.isSecureContext) throw new DOMException("Payments require a secure context.", "SecurityError");
    throw new DOMException("Apple Pay merchant validation is unavailable through this browser PassKit transport.", "NotSupportedError");
  }
  open(_request: PKFXPaymentRequest, _signal: AbortSignal): PaymentPresentation { this.assertAvailable(); throw new DOMException("PassKit is unavailable.", "NotSupportedError"); }
}
