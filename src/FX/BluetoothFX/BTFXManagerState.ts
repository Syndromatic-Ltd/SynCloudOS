/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
export const BTFXManagerState = Object.freeze({
  unknown: "unknown",
  resetting: "resetting",
  unsupported: "unsupported",
  unauthorized: "unauthorized",
  poweredOff: "poweredOff",
  poweredOn: "poweredOn",
} as const);
export type BTFXManagerState = (typeof BTFXManagerState)[keyof typeof BTFXManagerState];
