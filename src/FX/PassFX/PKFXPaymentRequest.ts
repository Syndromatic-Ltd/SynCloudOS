/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { NSEData } from "../../Foundation/NSEData";
import type { PKFXPaymentSummaryItem } from "./PKFXPaymentSummaryItem";
import type { PKFXPaymentNetwork } from "./PKFXPaymentNetwork";
import type { PKFXMerchantCapability } from "./PKFXMerchantCapability";
import type { PKFXContactField } from "./PKFXContactField";
import type { PKFXShippingMethod } from "./PKFXShippingMethod";
/** PKPaymentRequest. Merchant configuration is Apple-shaped, never a browser gateway descriptor. */
export class PKFXPaymentRequest {
  merchantIdentifier = "";
  countryCode = "";
  currencyCode = "";
  supportedNetworks: readonly PKFXPaymentNetwork[] = [];
  merchantCapabilities: PKFXMerchantCapability = 0;
  paymentSummaryItems: readonly PKFXPaymentSummaryItem[] = [];
  requiredBillingContactFields: ReadonlySet<PKFXContactField> = new Set();
  requiredShippingContactFields: ReadonlySet<PKFXContactField> = new Set();
  shippingMethods: readonly PKFXShippingMethod[] | null = null;
  applicationData: NSEData | null = null;
}
