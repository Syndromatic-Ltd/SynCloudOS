/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { NSEData } from "../../../Foundation/NSEData";
import type { CNFXContact } from "../../ContactsFX/CNFXContact";
import type { PKFXPayment } from "../PKFXPayment";
import type { PKFXPaymentToken } from "../PKFXPaymentToken";
import type { PKFXPaymentMethod } from "../PKFXPaymentMethod";
import type { PKFXPaymentNetwork } from "../PKFXPaymentNetwork";
import type { PKFXPaymentMethodType } from "../PKFXPaymentMethodType";
import type { PKFXContact } from "../PKFXContact";
import type { PKFXShippingMethod } from "../PKFXShippingMethod";
export const paymentMethods = new WeakMap<PKFXPaymentMethod, { displayName?: string | null; network?: PKFXPaymentNetwork | null; type?: PKFXPaymentMethodType; billingAddress?: CNFXContact | null }>();
export const paymentTokens = new WeakMap<PKFXPaymentToken, { paymentMethod: PKFXPaymentMethod; transactionIdentifier: string; paymentData: NSEData }>();
export const payments = new WeakMap<PKFXPayment, { token: PKFXPaymentToken; billingContact?: PKFXContact | null; shippingContact?: PKFXContact | null; shippingMethod?: PKFXShippingMethod | null }>();
