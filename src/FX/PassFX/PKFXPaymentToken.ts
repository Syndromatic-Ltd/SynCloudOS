/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { NSEData } from "../../Foundation/NSEData";
import { PKFXPaymentMethod } from "./PKFXPaymentMethod";
import { paymentTokens } from "./internal/paymentValues";
/** PKPaymentToken. Native token bytes are immutable Foundation data. */
export class PKFXPaymentToken {
  constructor() { paymentTokens.set(this, { paymentMethod: new PKFXPaymentMethod(), transactionIdentifier: "", paymentData: NSEData.from(new Uint8Array()) }); Object.freeze(this); }
  get paymentMethod(): PKFXPaymentMethod { return paymentTokens.get(this)!.paymentMethod; }
  get transactionIdentifier(): string { return paymentTokens.get(this)!.transactionIdentifier; }
  get paymentData(): NSEData { return paymentTokens.get(this)!.paymentData; }
}
