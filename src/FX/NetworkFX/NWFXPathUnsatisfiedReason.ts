/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
export const NWFXPathUnsatisfiedReason = Object.freeze({
  notAvailable: "notAvailable",
  cellularDenied: "cellularDenied",
  wifiDenied: "wifiDenied",
  localNetworkDenied: "localNetworkDenied",
  vpnInactive: "vpnInactive",
} as const);
export type NWFXPathUnsatisfiedReason = typeof NWFXPathUnsatisfiedReason[keyof typeof NWFXPathUnsatisfiedReason];
