/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
export const PKFXPaymentMethodType = Object.freeze({
  unknown: "unknown",
  debit: "debit",
  credit: "credit",
  prepaid: "prepaid",
  store: "store",
  eMoney: "eMoney",
} as const);
export type PKFXPaymentMethodType = (typeof PKFXPaymentMethodType)[keyof typeof PKFXPaymentMethodType];
