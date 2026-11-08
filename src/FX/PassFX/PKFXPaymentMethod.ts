/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { CNFXContact } from "../ContactsFX/CNFXContact";
import type { PKFXPaymentNetwork } from "./PKFXPaymentNetwork";
import type { PKFXPaymentMethodType } from "./PKFXPaymentMethodType";
import { paymentMethods } from "./internal/paymentValues";
/** System-supplied PKPaymentMethod attributes. Wallet pass objects are outside this subset. */
export class PKFXPaymentMethod {
  constructor() { paymentMethods.set(this, {}); Object.freeze(this); }
  get displayName(): string | null { return paymentMethods.get(this)!.displayName ?? null; }
  get network(): PKFXPaymentNetwork | null { return paymentMethods.get(this)!.network ?? null; }
  get type(): PKFXPaymentMethodType { return paymentMethods.get(this)!.type ?? "unknown"; }
  get billingAddress(): CNFXContact | null { return paymentMethods.get(this)!.billingAddress ?? null; }
}
