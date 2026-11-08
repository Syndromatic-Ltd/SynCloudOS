/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { PKFXPaymentSummaryItem } from "./PKFXPaymentSummaryItem";
/** PKShippingMethod's summary item and shipping identifier/detail. */
export class PKFXShippingMethod extends PKFXPaymentSummaryItem {
  identifier: string | null = null;
  detail: string | null = null;
}
