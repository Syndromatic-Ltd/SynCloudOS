/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
export const BTFXManagerAuthorization = Object.freeze({
  notDetermined: "notDetermined",
  restricted: "restricted",
  denied: "denied",
  allowedAlways: "allowedAlways",
} as const);
export type BTFXManagerAuthorization = (typeof BTFXManagerAuthorization)[keyof typeof BTFXManagerAuthorization];
