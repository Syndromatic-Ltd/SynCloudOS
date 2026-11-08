/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
export const PKFXPaymentSummaryItemType = Object.freeze({ final: "final", pending: "pending" } as const);
export type PKFXPaymentSummaryItemType = typeof PKFXPaymentSummaryItemType[keyof typeof PKFXPaymentSummaryItemType];
