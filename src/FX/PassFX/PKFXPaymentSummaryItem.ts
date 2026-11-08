/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { NSEDecimalNumber } from "../../Foundation/NSEDecimalNumber";
import type { PKFXPaymentSummaryItemType } from "./PKFXPaymentSummaryItemType";
/** PKPaymentSummaryItem.init(label:amount:type:). The last item is the merchant total. */
export class PKFXPaymentSummaryItem {
  constructor(public label: string, public amount: NSEDecimalNumber, public type: PKFXPaymentSummaryItemType = "final") {}
}
