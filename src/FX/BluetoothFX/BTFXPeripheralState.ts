/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
export const BTFXPeripheralState = Object.freeze({
  disconnected: "disconnected",
  connecting: "connecting",
  connected: "connected",
  disconnecting: "disconnecting",
} as const);
export type BTFXPeripheralState = (typeof BTFXPeripheralState)[keyof typeof BTFXPeripheralState];
