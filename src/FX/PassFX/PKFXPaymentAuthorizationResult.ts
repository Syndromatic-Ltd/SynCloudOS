/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { PKFXPaymentAuthorizationStatus } from "./PKFXPaymentAuthorizationStatus";
/** PKPaymentAuthorizationResult.init(status:errors:). */
export class PKFXPaymentAuthorizationResult {
  constructor(public status: PKFXPaymentAuthorizationStatus, public errors: readonly Error[] | null = null) {}
}
