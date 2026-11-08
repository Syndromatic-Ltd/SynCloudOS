/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
export const NWFXInterfaceType = Object.freeze({
  other: "other",
  wifi: "wifi",
  cellular: "cellular",
  wiredEthernet: "wiredEthernet",
  loopback: "loopback",
} as const);
export type NWFXInterfaceType = typeof NWFXInterfaceType[keyof typeof NWFXInterfaceType];
