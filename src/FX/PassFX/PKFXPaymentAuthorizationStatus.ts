/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
export const PKFXPaymentAuthorizationStatus = Object.freeze({ success: "success", failure: "failure", invalidBillingPostalAddress: "invalidBillingPostalAddress", invalidShippingPostalAddress: "invalidShippingPostalAddress", invalidShippingContact: "invalidShippingContact", pinRequired: "pinRequired", pinIncorrect: "pinIncorrect", pinLockout: "pinLockout" } as const);
export type PKFXPaymentAuthorizationStatus = typeof PKFXPaymentAuthorizationStatus[keyof typeof PKFXPaymentAuthorizationStatus];
