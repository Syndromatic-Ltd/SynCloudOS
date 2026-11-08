/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/** DispatchTimeoutResult. */
export const DFXTimeoutResult = Object.freeze({
  success: "success",
  timedOut: "timedOut",
} as const);
export type DFXTimeoutResult = typeof DFXTimeoutResult[keyof typeof DFXTimeoutResult];
