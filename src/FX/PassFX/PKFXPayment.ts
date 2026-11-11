/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { PKFXPaymentToken } from "./PKFXPaymentToken";
import type { PKFXContact } from "./PKFXContact";
import type { PKFXShippingMethod } from "./PKFXShippingMethod";
import { payments } from "./internal/paymentValues";
/** PKPayment. Complete authorization using the controller delegate's handler. */
export class PKFXPayment {
  constructor() { payments.set(this, { token: new PKFXPaymentToken() }); Object.freeze(this); }
  get token(): PKFXPaymentToken { return payments.get(this)!.token; }
  get billingContact(): PKFXContact | null { return payments.get(this)!.billingContact ?? null; }
  get shippingContact(): PKFXContact | null { return payments.get(this)!.shippingContact ?? null; }
  get shippingMethod(): PKFXShippingMethod | null { return payments.get(this)!.shippingMethod ?? null; }
}
